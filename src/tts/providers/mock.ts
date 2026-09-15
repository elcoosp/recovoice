import type {
  TTSProvider,
  TTSResult,
  VoiceConfig,
  WordTiming,
} from '../../types/recording.js';

export interface MockTTSOptions {
  wpm?: number;
  sampleRate?: number;
}

const DEFAULT_WPM = 150;
const DEFAULT_SAMPLE_RATE = 8000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

export class MockTTSProvider implements TTSProvider {
  private readonly wpm: number;
  private readonly sampleRate: number;

  constructor(options: MockTTSOptions = {}) {
    this.wpm = options.wpm ?? DEFAULT_WPM;
    this.sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
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
    const durationMs = t > 0 ? t : 100;
    const audio = buildSilentWav(durationMs, this.sampleRate);
    return {
      audio,
      format: 'wav',
      timings,
    };
  }
}

function buildSilentWav(durationMs: number, sampleRate: number): Buffer {
  const sampleCount = Math.max(1, Math.round((durationMs / 1000) * sampleRate));
  const dataBytes = sampleCount * CHANNELS * (BITS_PER_SAMPLE / 8);
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(CHANNELS, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * CHANNELS * (BITS_PER_SAMPLE / 8), 28);
  buffer.writeUInt16LE(CHANNELS * (BITS_PER_SAMPLE / 8), 32);
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);
  // Data section is zero-filled by Buffer.alloc
  return buffer;
}
