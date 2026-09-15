import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseScript } from './parser/parser.js';
import { ParseError } from './parser/errors.js';
import { AudioCache, hashSynthesisInput } from './cache/audio-cache.js';
import { generateCues, cuesToSrt, cuesToVtt } from './caption/generator.js';
import type { RecordingAdapter, RecordingSession, Compositor } from './recording/types.js';
import type {
  TTSProvider,
  CursorTelemetry,
  WordTiming,
} from './types/recording.js';
import type { Script, Segment } from './types/script.js';

export interface RecovoiceCompositorResult {
  rawVideo: string;
  voiceovers: Array<{ path: string; startMs: number }>;
  captionsPath?: string;
  telemetry: CursorTelemetry;
  durationMs: number;
}

export interface RecovoiceOptions {
  script: string;
  output?: string;
  recordingAdapter: RecordingAdapter;
  ttsProvider: TTSProvider;
  compositor?: Compositor;
  compositorFactory?: (result: RecovoiceCompositorResult) => Compositor;
  voiceoverOnly?: boolean;
  /** Injectable sleep for tests. Defaults to setTimeout-based sleep. */
  sleep?: (ms: number) => Promise<void>;
}

export interface CheckResult {
  valid: boolean;
  errors: Array<{ message: string; line?: number }>;
}

export interface RecovoiceResult {
  finalVideo: string;
  rawVideo: string;
  captions: { srt?: string; vtt?: string };
  voiceovers: string[];
  telemetry: CursorTelemetry;
  durationMs: number;
}

const DEFAULT_FPS = 60;
const DEFAULT_VIEWPORT = { width: 1280, height: 800 };

export class Recovoice {
  private readonly opts: RecovoiceOptions;

  constructor(opts: RecovoiceOptions) {
    this.opts = opts;
  }

  async check(): Promise<CheckResult> {
    try {
      parseScript(this.opts.script);
      return { valid: true, errors: [] };
    } catch (err) {
      if (err instanceof ParseError) {
        const entry: { message: string; line?: number } = { message: err.message };
        if (err.line !== undefined) entry.line = err.line;
        return { valid: false, errors: [entry] };
      }
      return {
        valid: false,
        errors: [{ message: (err as Error).message }],
      };
    }
  }

  async run(): Promise<RecovoiceResult> {
    const script = parseScript(this.opts.script);
    const outputDir = this.opts.output ?? './output';
    const stagingDir = join(outputDir, '.tmp');
    const rawDir = join(stagingDir, 'raw');
    const assetsDir = join(stagingDir, 'assets');
    const cacheDir = join(outputDir, '.cache', 'audio');

    const finalVideoPath = join(outputDir, 'final.mp4');
    const rawVideoPath = join(rawDir, 'video.mp4');
    const srtPath = join(outputDir, 'captions.srt');
    const vttPath = join(outputDir, 'captions.vtt');

    try {
      mkdirSync(rawDir, { recursive: true });
      mkdirSync(assetsDir, { recursive: true });
      mkdirSync(cacheDir, { recursive: true });

      const { voiceovers, allTimings } = await this.synthesizeVoiceovers(
        script,
        assetsDir,
        cacheDir,
      );

      const captions = this.writeCaptions(script, allTimings, srtPath, vttPath);

      if (this.opts.voiceoverOnly) {
        // Publish assets and captions without recording or compositing.
        this.publishStaging(stagingDir, outputDir, rawVideoPath);
        return {
          finalVideo: '',
          rawVideo: '',
          captions,
          voiceovers: voiceovers.map((v) => v.path),
          telemetry: {
            events: [],
            timebaseOrigin: 0,
            viewport: script.frontmatter.viewport ?? DEFAULT_VIEWPORT,
          },
          durationMs: 0,
        };
      }

      const session = await this.opts.recordingAdapter.launch({
        viewport: script.frontmatter.viewport ?? DEFAULT_VIEWPORT,
      });

      const fps = script.frontmatter.fps ?? DEFAULT_FPS;
      await session.startRecording({ path: rawDir, fps });

      await this.executeTimedActions(session, script, allTimings);

      const { video } = await session.stopRecording();
      const telemetry = await session.collectTelemetry();
      await session.close();

      const voiceoverInputs = voiceovers.map((v) => ({
        path: v.path,
        startMs: v.startMs,
      }));

      const durationMs = await this.resolveDurationMs(video, telemetry);

      const compositor = this.resolveCompositor({
        rawVideo: video,
        voiceovers: voiceoverInputs,
        captionsPath: existsSync(srtPath) ? srtPath : undefined,
        telemetry,
        durationMs,
      });

      await compositor.compose({
        rawVideo: video,
        voiceovers: voiceoverInputs,
        captionsPath: existsSync(srtPath) ? srtPath : undefined,
        output: finalVideoPath,
      });

      // Atomic publish: move staged raw + assets into final location
      this.publishStaging(stagingDir, outputDir, rawVideoPath);

      const result: RecovoiceResult = {
        finalVideo: finalVideoPath,
        rawVideo: rawVideoPath,
        captions,
        voiceovers: voiceovers.map((v) => v.path),
        telemetry,
        durationMs,
      };
      return result;
    } catch (err) {
      // Clean up staging on failure; leave output dir without a final.mp4
      if (existsSync(stagingDir)) {
        rmSync(stagingDir, { recursive: true, force: true });
      }
      throw err;
    }
  }

  private async resolveDurationMs(
    videoPath: string,
    telemetry: CursorTelemetry,
  ): Promise<number> {
    // Try ffprobe first; fall back to last telemetry event + buffer
    try {
      const { probeVideo } = await import('./util/ffprobe.js');
      const probe = await probeVideo(videoPath);
      if (probe.durationMs > 0) return probe.durationMs;
    } catch {
      // ignore probe failure and fall back
    }
    if (telemetry.events.length > 0) {
      const last = telemetry.events[telemetry.events.length - 1]!;
      return Math.ceil(last.t + 1000);
    }
    return 5000;
  }

  private resolveCompositor(result: RecovoiceCompositorResult): Compositor {
    if (this.opts.compositor) return this.opts.compositor;
    if (this.opts.compositorFactory) return this.opts.compositorFactory(result);
    throw new Error(
      'Recovoice requires either a `compositor` or `compositorFactory` option',
    );
  }

  private async synthesizeVoiceovers(
    script: Script,
    assetsDir: string,
    cacheDir: string,
  ): Promise<{
    voiceovers: Array<{ path: string; startMs: number }>;
    allTimings: WordTiming[];
  }> {
    const cache = new AudioCache(cacheDir);
    const voiceConfig = {
      voiceId: script.frontmatter.voiceover?.voiceId ?? 'default',
      ...(script.frontmatter.voiceover?.modelId
        ? { modelId: script.frontmatter.voiceover.modelId }
        : {}),
      ...(script.frontmatter.voiceover?.language
        ? { language: script.frontmatter.voiceover.language }
        : {}),
    };

    const voiceovers: Array<{ path: string; startMs: number }> = [];
    const allTimings: WordTiming[] = [];
    let cumulativeMs = 0;

    for (let i = 0; i < script.segments.length; i++) {
      const segment = script.segments[i]!;
      if (segment.silent || segment.prose.trim() === '') continue;

      const key = hashSynthesisInput(segment.prose, voiceConfig);
      const cached = cache.getSynthesis(key);

      let audio: Buffer;
      let timings: WordTiming[];
      let format: 'mp3' | 'wav';

      if (cached) {
        audio = cached.audio;
        timings = cached.timings;
        format = cached.format;
      } else {
        const result = await this.opts.ttsProvider.synthesize(
          segment.prose,
          voiceConfig,
        );
        audio = result.audio;
        timings = result.timings;
        format = result.format;
        cache.setSynthesis(key, result);
      }

      const fileName = `voiceover-${String(i + 1).padStart(3, '0')}.${format}`;
      const filePath = join(assetsDir, fileName);
      writeFileSync(filePath, audio);

      const offsetTimings = timings.map((t) => ({
        word: t.word,
        startMs: t.startMs + cumulativeMs,
        endMs: t.endMs + cumulativeMs,
      }));
      allTimings.push(...offsetTimings);

      const lastTiming = offsetTimings[offsetTimings.length - 1];
      const segmentDuration = lastTiming ? lastTiming.endMs - cumulativeMs : 0;
      cumulativeMs += segmentDuration + 200; // small gap between segments

      voiceovers.push({ path: filePath, startMs: 0 });
    }

    return { voiceovers, allTimings };
  }

  private async executeTimedActions(
    session: RecordingSession,
    script: Script,
    allTimings: WordTiming[],
  ): Promise<void> {
    const voiceoverTimings: WordTiming[][] = this.splitTimingsBySegment(
      script,
      allTimings,
    );
    const { executeTimedActions } = await import('./recording/timed-executor.js');
    const options: {
      session: RecordingSession;
      segments: typeof script.segments;
      voiceoverTimings: typeof voiceoverTimings;
      sleep?: (ms: number) => Promise<void>;
    } = {
      session,
      segments: script.segments,
      voiceoverTimings,
    };
    if (this.opts.sleep) options.sleep = this.opts.sleep;
    await executeTimedActions(options);
  }

  private splitTimingsBySegment(
    script: Script,
    allTimings: WordTiming[],
  ): WordTiming[][] {
    // The synthesizer concatenates timings in segment order. We walk through
    // segments in order, assigning timings whose startMs falls inside the
    // segment's cumulative window. Because we now know each segment's length
    // from its own synthesis, we can slice cleanly if we kept per-segment
    // timings. For now, we re-derive by matching prose word counts.
    const perSegment: WordTiming[][] = [];
    let cursor = 0;

    for (const segment of script.segments) {
      if (segment.silent || segment.prose.trim() === '') {
        perSegment.push([]);
        continue;
      }
      const words = segment.prose.trim().split(/\s+/);
      const slice = allTimings.slice(cursor, cursor + words.length);
      perSegment.push(slice);
      cursor += words.length;
    }
    return perSegment;
  }

  private writeCaptions(
    script: Script,
    timings: WordTiming[],
    srtPath: string,
    vttPath: string,
  ): { srt?: string; vtt?: string } {
    const format = script.frontmatter.captions?.format ?? 'srt';
    const cues = generateCues(timings);
    const result: { srt?: string; vtt?: string } = {};

    if (format === 'srt' || format === 'both') {
      writeFileSync(srtPath, cuesToSrt(cues));
      result.srt = srtPath;
    }
    if (format === 'vtt' || format === 'both') {
      writeFileSync(vttPath, cuesToVtt(cues));
      result.vtt = vttPath;
    }
    return result;
  }

  private publishStaging(
    stagingDir: string,
    outputDir: string,
    rawVideoPath: string,
  ): void {
    // Move raw/ and assets/ into final position for observability
    const finalRawDir = join(outputDir, 'raw');
    const finalAssetsDir = join(outputDir, 'assets');
    const { renameSync } = require('node:fs') as typeof import('node:fs');
    if (existsSync(join(stagingDir, 'raw'))) {
      if (existsSync(finalRawDir)) rmSync(finalRawDir, { recursive: true, force: true });
      renameSync(join(stagingDir, 'raw'), finalRawDir);
    }
    if (existsSync(join(stagingDir, 'assets'))) {
      if (existsSync(finalAssetsDir)) rmSync(finalAssetsDir, { recursive: true, force: true });
      renameSync(join(stagingDir, 'assets'), finalAssetsDir);
    }
    if (existsSync(stagingDir)) {
      rmSync(stagingDir, { recursive: true, force: true });
    }
    void rawVideoPath;
  }
}
