import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TTSResult, VoiceConfig, WordTiming } from '../types/recording.js';

export function hashSynthesisInput(
  text: string,
  config: VoiceConfig,
): string {
  const h = createHash('sha256');
  h.update('text:');
  h.update(text);
  h.update('\nvoiceId:');
  h.update(config.voiceId);
  if (config.modelId) {
    h.update('\nmodelId:');
    h.update(config.modelId);
  }
  if (config.language) {
    h.update('\nlanguage:');
    h.update(config.language);
  }
  return h.digest('hex');
}

interface StoredSynthesis {
  format: 'mp3' | 'wav';
  audioBase64: string;
  timings: WordTiming[];
}

export class AudioCache {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  getSynthesis(key: string): TTSResult | undefined {
    const path = join(this.dir, `${key}.json`);
    if (!existsSync(path)) return undefined;
    const raw = readFileSync(path, 'utf-8');
    let stored: StoredSynthesis;
    try {
      stored = JSON.parse(raw) as StoredSynthesis;
    } catch {
      return undefined;
    }
    if (
      typeof stored.audioBase64 !== 'string' ||
      !Array.isArray(stored.timings) ||
      (stored.format !== 'mp3' && stored.format !== 'wav')
    ) {
      return undefined;
    }
    return {
      audio: Buffer.from(stored.audioBase64, 'base64'),
      format: stored.format,
      timings: stored.timings,
    };
  }

  setSynthesis(key: string, result: TTSResult): void {
    const stored: StoredSynthesis = {
      format: result.format,
      audioBase64: result.audio.toString('base64'),
      timings: result.timings,
    };
    const path = join(this.dir, `${key}.json`);
    writeFileSync(path, JSON.stringify(stored));
  }

  get(key: string): Buffer | undefined {
    const path = join(this.dir, `${key}.bin`);
    if (!existsSync(path)) return undefined;
    return readFileSync(path);
  }

  set(key: string, audio: Buffer): void {
    const path = join(this.dir, `${key}.bin`);
    writeFileSync(path, audio);
  }
}
