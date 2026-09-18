import { mkdirSync, writeFileSync, rmSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { parseScript } from './parser/parser.js';
import { ParseError } from './parser/errors.js';
import { AudioCache, hashSynthesisInput } from './cache/audio-cache.js';
import * as captionModule from './caption/generator.js';
import { cuesToSrt, cuesToVtt } from './caption/generator.js';
import type { RecordingAdapter, RecordingSession, Compositor } from './recording/types.js';
import type {
  TTSProvider,
  CursorTelemetry,
  WordTiming,
} from './types/recording.js';
import type { Script, Segment, Frontmatter } from './types/script.js';
import { createTTSProvider } from './tts/factory.js';
import { resolveFFmpegPath, resolveFFProbePath } from './config/env.js';

export interface RecovoiceCompositorResult {
  rawVideo: string;
  voiceovers: Array<{ path: string; startMs: number }>;
  captionsPath?: string;
  telemetry: CursorTelemetry;
  durationMs: number;
  /** Whether captions should be burned onto the video (from frontmatter). */
  burn?: boolean;
  /** Raw polish config from frontmatter, for the compositor factory. */
  polish?: unknown;
}

export interface RecovoiceConfigSources {
  /** Explicit path to a config file, or omit to search cwd. */
  configPath?: string;
  /** Directory to search for recovoice.config.{js,mjs,cjs,ts}. */
  configCwd?: string;
  /** CLI-level overrides that take highest precedence. */
  cliOverrides?: Partial<Frontmatter>;
}

export interface RecovoiceOptions {
  script: string;
  output?: string;
  recordingAdapter: RecordingAdapter;
  /**
   * TTS provider override. When omitted, the provider is resolved from the
   * script's `voiceover.provider` frontmatter (or mock).
   */
  ttsProvider?: TTSProvider;
  /** Base URL for the Kokoro server when resolved lazily from frontmatter. */
  kokoroUrl?: string;
  compositor?: Compositor;
  compositorFactory?: (result: RecovoiceCompositorResult) => Compositor;
  voiceoverOnly?: boolean;
  /** Injectable sleep for tests. Defaults to setTimeout-based sleep. */
  sleep?: (ms: number) => Promise<void>;
  /** Configuration sources beyond frontmatter. */
  config?: RecovoiceConfigSources;
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

function resolveProviderFromFrontmatter(
  provider: string | undefined,
  kokoroUrl?: string,
): TTSFactoryOptions {
  const name = (provider ?? 'mock') as 'mock' | 'kokoro' | 'edge';
  const safe = name === 'mock' || name === 'kokoro' || name === 'edge' ? name : 'mock';
  const opts: TTSFactoryOptions = { provider: safe };
  if (kokoroUrl) opts.kokoroUrl = kokoroUrl;
  return opts;
}

// Re-export the factory option type for the helper above.
type TTSFactoryOptions = Parameters<typeof createTTSProvider>[0];

const DEFAULT_FPS = 60;
const DEFAULT_VIEWPORT = { width: 1280, height: 800 };

export class Recovoice {
  private readonly opts: RecovoiceOptions;

  constructor(opts: RecovoiceOptions) {
    this.opts = opts;
  }

  private async loadMergedScript(): Promise<Script> {
    const parsed = parseScript(this.opts.script);
    if (!this.opts.config) return parsed;

    const { loadConfig, mergeConfig } = await import('./config/loader.js');
    const configOpts: { cwd?: string; explicitPath?: string } = {};
    if (this.opts.config.configCwd) configOpts.cwd = this.opts.config.configCwd;
    if (this.opts.config.configPath) configOpts.explicitPath = this.opts.config.configPath;
    const loaded = await loadConfig(
      configOpts.cwd ?? process.cwd(),
      configOpts.explicitPath,
    );

    const merged = mergeConfig({
      frontmatter: parsed.frontmatter,
      file: loaded.config,
      cli: this.opts.config.cliOverrides ?? {},
    });

    return { ...parsed, frontmatter: merged };
  }

  /**
   * Load and merge the script's frontmatter with config, without executing
   * anything. Useful for pre-flight decisions (TTS provider, typing speed).
   */
  async loadScriptMeta(): Promise<Script> {
    return this.loadMergedScript();
  }

  async check(): Promise<CheckResult> {
    try {
      await this.loadMergedScript();
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
    const script = await this.loadMergedScript();
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

      const {
        voiceovers,
        perSegmentTimings,
        segmentStarts,
        totalDurationMs,
      } = await this.synthesizeVoiceovers(script, assetsDir, cacheDir);

      const captions = this.writeCaptions(
        script,
        perSegmentTimings,
        segmentStarts,
        srtPath,
        vttPath,
      );

      if (this.opts.voiceoverOnly) {
        // Publish assets and captions without recording or compositing.
        this.publishStaging(stagingDir, outputDir, rawVideoPath);
        const finalVoiceoverPaths = voiceovers.map((v) =>
          this.remapToFinalLocation(v.path, stagingDir, outputDir),
        );
        return {
          finalVideo: '',
          rawVideo: '',
          captions,
          voiceovers: finalVoiceoverPaths,
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

      const flatTimings = perSegmentTimings.reduce<WordTiming[]>(
        (acc, seg) => acc.concat(seg),
        [],
      );
      await this.executeTimedActions(session, script, flatTimings, outputDir);

      const { video } = await session.stopRecording();
      const telemetry = await session.collectTelemetry();
      await session.close();

      const voiceoverInputs = voiceovers.map((v) => ({
        path: v.path,
        startMs: v.startMs,
      }));

      const durationMs = await this.resolveDurationMs(video, telemetry);

      // Pre-mix voiceovers into a single audio track
      let audioTrackPath: string | undefined;
      if (voiceoverInputs.length > 0) {
        const { mixVoiceovers } = await import('./compositor/audio-mixer.js');
        audioTrackPath = join(stagingDir, 'mixed-audio.m4a');
        await mixVoiceovers(voiceoverInputs, audioTrackPath, {
          totalDurationMs: Math.max(durationMs, totalDurationMs),
          ffmpegPath: resolveFFmpegPath(),
        });
      }

      const compositor = this.resolveCompositor({
        rawVideo: video,
        voiceovers: voiceoverInputs,
        captionsPath: existsSync(srtPath) ? srtPath : undefined,
        telemetry,
        durationMs,
        burn: script.frontmatter.captions?.burn ?? true,
        polish: script.frontmatter.polish,
      });

      const composeOptions: {
        rawVideo: string;
        voiceovers: typeof voiceoverInputs;
        captionsPath?: string;
        audioTrackPath?: string;
        output: string;
      } = {
        rawVideo: video,
        voiceovers: voiceoverInputs,
        output: finalVideoPath,
      };
      if (existsSync(srtPath)) composeOptions.captionsPath = srtPath;
      if (audioTrackPath) composeOptions.audioTrackPath = audioTrackPath;

      await compositor.compose(composeOptions);

      // Atomic publish: move staged raw + assets into final location
      this.publishStaging(stagingDir, outputDir, rawVideoPath);

      const finalVoiceoverPaths = voiceovers.map((v) =>
        this.remapToFinalLocation(v.path, stagingDir, outputDir),
      );

      const result: RecovoiceResult = {
        finalVideo: finalVideoPath,
        rawVideo: rawVideoPath,
        captions,
        voiceovers: finalVoiceoverPaths,
        telemetry,
        durationMs,
      };
      return result;
    } catch (err) {
      // Clean up staging on failure; leave output dir without a final.mp4
      if (existsSync(stagingDir)) {
        try {
          rmSync(stagingDir, { recursive: true, force: true });
        } catch (cleanupErr) {
          await new Promise((r) => setTimeout(r, 1500));
          try {
            rmSync(stagingDir, { recursive: true, force: true });
          } catch {
            process.stderr.write(
              'recovoice: failed to clean staging dir\n',
            );
          }
        }
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
      const probe = await probeVideo(videoPath, {
        ffprobePath: resolveFFProbePath(),
      });
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

  private remapToFinalLocation(
    stagedPath: string,
    stagingDir: string,
    outputDir: string,
  ): string {
    if (!stagedPath.startsWith(stagingDir)) return stagedPath;
    const relative = stagedPath.slice(stagingDir.length).replace(/^\//, '');
    return join(outputDir, relative);
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
    perSegmentTimings: WordTiming[][];
    segmentStarts: number[];
    totalDurationMs: number;
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

    const provider =
      this.opts.ttsProvider ??
      createTTSProvider(
        resolveProviderFromFrontmatter(
          script.frontmatter.voiceover?.provider,
          this.opts.kokoroUrl,
        ),
      );

    const voiceovers: Array<{ path: string; startMs: number }> = [];
    const allTimings: WordTiming[] = [];
    const perSegmentTimings: WordTiming[][] = [];
    const segmentStarts: number[] = [];
    let cumulativeMs = 0;

    for (let i = 0; i < script.segments.length; i++) {
      const segment = script.segments[i]!;
      segmentStarts[i] = cumulativeMs;

      if (segment.silent || segment.prose.trim() === '') {
        perSegmentTimings[i] = [];
        continue;
      }

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
        const result = await provider.synthesize(
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

      perSegmentTimings[i] = timings;
      const offsetTimings = timings.map((t) => ({
        word: t.word,
        startMs: t.startMs + cumulativeMs,
        endMs: t.endMs + cumulativeMs,
      }));
      allTimings.push(...offsetTimings);

      const lastTiming = offsetTimings[offsetTimings.length - 1];
      const segmentDuration = lastTiming ? lastTiming.endMs - cumulativeMs : 0;
      cumulativeMs += segmentDuration + 200;

      voiceovers.push({ path: filePath, startMs: segmentStarts[i]! });
    }

    return {
      voiceovers,
      allTimings,
      perSegmentTimings,
      segmentStarts,
      totalDurationMs: cumulativeMs,
    };
  }

  private async executeTimedActions(
    session: RecordingSession,
    script: Script,
    allTimings: WordTiming[],
    outputDir: string,
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
      screenshotDir?: string;
    } = {
      session,
      segments: script.segments,
      voiceoverTimings,
    };
    if (this.opts.sleep) options.sleep = this.opts.sleep;
    options.screenshotDir = join(outputDir, 'failures');
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
    perSegmentTimings: WordTiming[][],
    segmentStarts: number[],
    srtPath: string,
    vttPath: string,
  ): { srt?: string; vtt?: string } {
    const format = script.frontmatter.captions?.format ?? 'srt';
    const { generateCuesFromSegments } = captionModule;

    const inputs: Array<{
      timings: WordTiming[];
      startOffsetMs: number;
      overrideText?: string;
    }> = [];

    for (let i = 0; i < script.segments.length; i++) {
      const segment = script.segments[i]!;
      const entry: {
        timings: WordTiming[];
        startOffsetMs: number;
        overrideText?: string;
      } = {
        timings: perSegmentTimings[i] ?? [],
        startOffsetMs: segmentStarts[i] ?? 0,
      };
      if (segment.captionOverride) {
        entry.overrideText = segment.captionOverride.text;
      }
      inputs.push(entry);
    }

    const cues = generateCuesFromSegments(inputs);
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
