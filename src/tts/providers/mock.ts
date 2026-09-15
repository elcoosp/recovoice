import type {
  TTSProvider,
  TTSResult,
  VoiceConfig,
  WordTiming,
} from '../../types/recording.js';

export interface MockTTSOptions {
  wpm?: number;
  minWordDurationMs?: number;
  audioByteLength?: number;
}

export class MockTTSProvider implements TTSProvider {
  private readonly wpm: number;
  private readonly audioByteLength: number;

  constructor(options: MockTTSOptions = {}) {
    this.wpm = options.wpm ?? 150;
    this.audioByteLength = options.audioByteLength ?? 1024;
  }

  async synthesize(text: string, _config: VoiceConfig): Promise<TTSResult> {
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const msPerWord = 60_000 / this.wpm;
    const timings: WordTiming[] = [];
    let t = 0;
    for (const word of words) {
      const durationMs = Math.max(50, Math.round(msPerWord));
      timings.push({ word, startMs: t, endMs: t + durationMs });
      t += durationMs;
    }
    return {
      audio: Buffer.alloc(this.audioByteLength),
      format: 'mp3',
      timings,
    };
  }
}
