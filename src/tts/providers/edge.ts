import type {
  TTSProvider,
  TTSResult,
  VoiceConfig,
  WordTiming,
} from '../../types/recording.js';

export interface EdgeTTSOptions {
  binaryPath?: string;
}

export class EdgeTTSProvider implements TTSProvider {
  private readonly binaryPath: string;

  constructor(options: EdgeTTSOptions = {}) {
    this.binaryPath = options.binaryPath ?? 'edge-tts';
  }

  async synthesize(text: string, config: VoiceConfig): Promise<TTSResult> {
    const { spawn } = await import('node:child_process');
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');

    const tmpDir = mkdtempSync(join(tmpdir(), 'recovoice-edge-'));
    const audioPath = join(tmpDir, 'audio.mp3');
    const jsonPath = join(tmpDir, 'boundaries.json');

    const voice = config.voiceId || 'en-US-JennyNeural';
    const args = [
      '--voice', voice,
      '--text', text,
      '--write-media', audioPath,
      '--write-subtitles', jsonPath,
    ];

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(this.binaryPath, args);
      let stderr = '';
      proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      proc.on('error', (err) => reject(
        new Error(`Failed to launch edge-tts: ${err.message}`),
      ));
      proc.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`edge-tts exited with code ${code}: ${stderr}`));
      });
    });

    const { readFileSync, unlinkSync } = await import('node:fs');
    const audio = readFileSync(audioPath);
    const subtitleRaw = readFileSync(jsonPath, 'utf-8');
    const timings = parseSubtitleTimings(subtitleRaw);

    try { unlinkSync(audioPath); unlinkSync(jsonPath); } catch { /* ignore */ }

    return { audio, format: 'mp3', timings };
  }
}

const SRT_CUE_RE =
  /(\d{2}):(\d{2}):(\d{2}[,.]\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}[,.]\d{3})/g;

/**
 * Converts the subtitle output of `edge-tts` into word timings. Newer edge-tts
 * versions write an SRT stream even when a `.json` path is requested; older
 * versions wrote a JSON array of word boundaries. Accept both.
 */
function parseSubtitleTimings(raw: string): WordTiming[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.flatMap((b) => {
        const word = String(b.text ?? '').trim();
        if (!word) return [];
        return {
          word,
          startMs: Math.round(Number(b.offset) / 10_000),
          endMs: Math.round((Number(b.offset) + Number(b.duration)) / 10_000),
        };
      });
    }
  } catch {
    // Not JSON; parse as SRT below.
  }

  return srtToWordTimings(raw);
}

function srtToWordTimings(raw: string): WordTiming[] {
  const cues: Array<{ startMs: number; endMs: number; text: string }> = [];
  const blocks = raw.split(/\r?\n\r?\n/);
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((l) => l.trim());
    if (lines.length < 2) continue;
    const timing = lines.find((l) => l.includes('-->'));
    if (!timing) continue;
    SRT_CUE_RE.lastIndex = 0;
    const m = SRT_CUE_RE.exec(timing);
    if (!m) continue;
    const startMs = timestampMs(m[1]!, m[2]!, m[3]!);
    const endMs = timestampMs(m[4]!, m[5]!, m[6]!);
    const text = lines
      .slice(lines.indexOf(timing) + 1)
      .join(' ')
      .trim();
    if (!text) continue;
    cues.push({ startMs, endMs, text });
  }

  const timings: WordTiming[] = [];
  for (const cue of cues) {
    const words = cue.text.split(/\s+/).filter(Boolean);
    const span = Math.max(0, cue.endMs - cue.startMs);
    const step = words.length > 0 ? span / words.length : 0;
    words.forEach((word, i) => {
      timings.push({
        word,
        startMs: cue.startMs + Math.round(step * i),
        endMs: cue.startMs + Math.round(step * (i + 1)),
      });
    });
  }
  return timings;
}

function timestampMs(h: string, m: string, s: string): number {
  const [sec = '0', ms = '000'] = s.split(/[,.]/);
  return (
    Number.parseInt(h, 10) * 3_600_000 +
    Number.parseInt(m, 10) * 60_000 +
    Number.parseInt(sec, 10) * 1000 +
    Number.parseInt(ms.padEnd(3, '0'), 10)
  );
}
