import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AudioCache,
  hashSynthesisInput,
} from '../../src/cache/audio-cache.js';

describe('hashSynthesisInput', () => {
  it('returns the same hash for identical inputs', () => {
    const a = hashSynthesisInput('Hello', { voiceId: 'v1' });
    const b = hashSynthesisInput('Hello', { voiceId: 'v1' });
    expect(a).toBe(b);
  });

  it('returns different hashes for different text', () => {
    const a = hashSynthesisInput('Hello', { voiceId: 'v1' });
    const b = hashSynthesisInput('World', { voiceId: 'v1' });
    expect(a).not.toBe(b);
  });

  it('returns different hashes for different voice', () => {
    const a = hashSynthesisInput('Hello', { voiceId: 'v1' });
    const b = hashSynthesisInput('Hello', { voiceId: 'v2' });
    expect(a).not.toBe(b);
  });

  it('returns a hex string of length 64', () => {
    const h = hashSynthesisInput('Hello', { voiceId: 'v1' });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('AudioCache', () => {
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), 'recovoice-cache-'));
  });

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
  });

  describe('raw buffer API', () => {
    it('returns undefined for a miss', () => {
      const cache = new AudioCache(cacheDir);
      expect(cache.get('nonexistent-key')).toBeUndefined();
    });

    it('stores and retrieves audio', () => {
      const cache = new AudioCache(cacheDir);
      const audio = Buffer.from('fake audio bytes');
      cache.set('key1', audio);
      const retrieved = cache.get('key1');
      expect(retrieved).toBeDefined();
      expect(retrieved!.equals(audio)).toBe(true);
    });

    it('persists across instances', () => {
      const cache1 = new AudioCache(cacheDir);
      cache1.set('key1', Buffer.from('data'));
      const cache2 = new AudioCache(cacheDir);
      expect(cache2.get('key1')).toBeDefined();
    });

    it('creates the cache directory if missing', () => {
      const nested = join(cacheDir, 'deep', 'nested');
      const cache = new AudioCache(nested);
      cache.set('k', Buffer.from('data'));
      expect(existsSync(nested)).toBe(true);
    });
  });

  describe('synthesis API', () => {
    it('returns undefined for a synthesis miss', () => {
      const cache = new AudioCache(cacheDir);
      expect(cache.getSynthesis('missing')).toBeUndefined();
    });

    it('stores and retrieves full synthesis results (audio + timings + format)', () => {
      const cache = new AudioCache(cacheDir);
      const audio = Buffer.from('fake audio');
      const timings = [
        { word: 'Hello', startMs: 0, endMs: 400 },
        { word: 'world', startMs: 400, endMs: 900 },
      ];
      cache.setSynthesis('k1', { audio, format: 'mp3', timings });
      const result = cache.getSynthesis('k1');
      expect(result).toBeDefined();
      expect(result!.audio.equals(audio)).toBe(true);
      expect(result!.format).toBe('mp3');
      expect(result!.timings).toEqual(timings);
    });

    it('persists synthesis results across instances', () => {
      const c1 = new AudioCache(cacheDir);
      c1.setSynthesis('k1', {
        audio: Buffer.from('x'),
        format: 'wav',
        timings: [{ word: 'a', startMs: 0, endMs: 100 }],
      });
      const c2 = new AudioCache(cacheDir);
      const result = c2.getSynthesis('k1');
      expect(result).toBeDefined();
      expect(result!.format).toBe('wav');
    });

    it('returns undefined for a malformed JSON payload', () => {
      const cache = new AudioCache(cacheDir);
      const { writeFileSync } = require('node:fs') as typeof import('node:fs');
      writeFileSync(join(cacheDir, 'bad.json'), 'not json');
      expect(cache.getSynthesis('bad')).toBeUndefined();
    });
  });
});
