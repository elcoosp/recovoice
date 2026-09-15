import type {
  TTSProvider,
  TTSResult,
  VoiceConfig,
  WordTiming,
} from '../../types/recording.js';

export interface EdgeTTSOptions {
  binaryPath?: string;
}

interface EdgeWordBoundary {
  offset: number;
  duration: number;
  text: string;
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
    const boundaries = JSON.parse(subtitleRaw) as EdgeWordBoundary[];

    const timings: WordTiming[] = boundaries.map((b) => ({
      word: b.text.trim(),
      startMs: Math.round(b.offset / 10_000),
      endMs: Math.round((b.offset + b.duration) / 10_000),
    }));

    try { unlinkSync(audioPath); unlinkSync(jsonPath); } catch { /* ignore */ }

    return { audio, format: 'mp3', timings };
  }
}
