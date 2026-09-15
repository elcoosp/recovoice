import { describe, it, expect } from 'vitest';
import { MockTTSProvider } from '../../src/tts/providers/mock.js';
import { withRetry } from '../../src/tts/retry.js';

describe('MockTTSProvider', () => {
  it('returns audio buffer and word timings', async () => {
    const provider = new MockTTSProvider();
    const result = await provider.synthesize('Hello world', {
      voiceId: 'test',
    });
    expect(result.audio).toBeInstanceOf(Buffer);
    expect(result.format).toBe('wav');
    expect(result.timings).toHaveLength(2);
    expect(result.timings[0]!.word).toBe('Hello');
    expect(result.timings[1]!.word).toBe('world');
  });

  it('emits a valid WAV header', async () => {
    const provider = new MockTTSProvider();
    const result = await provider.synthesize('Hi there', { voiceId: 'test' });
    expect(result.audio.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(result.audio.subarray(8, 12).toString('ascii')).toBe('WAVE');
    expect(result.audio.subarray(12, 16).toString('ascii')).toBe('fmt ');
    expect(result.audio.subarray(36, 40).toString('ascii')).toBe('data');
  });

  it('assigns sequential non-overlapping timings', async () => {
    const provider = new MockTTSProvider();
    const result = await provider.synthesize('One two three', {
      voiceId: 'test',
    });
    const [w1, w2, w3] = result.timings;
    expect(w1!.startMs).toBeGreaterThanOrEqual(0);
    expect(w1!.endMs).toBeLessThanOrEqual(w2!.startMs);
    expect(w2!.endMs).toBeLessThanOrEqual(w3!.startMs);
  });

  it('honors custom words per minute', async () => {
    const provider = new MockTTSProvider({ wpm: 60 });
    const result = await provider.synthesize('a b c', { voiceId: 'test' });
    const duration = result.timings[2]!.endMs;
    expect(duration).toBeCloseTo(3000, -2);
  });
});

describe('withRetry', () => {
  it('succeeds on the first attempt', async () => {
    let calls = 0;
    const fn = async (): Promise<number> => {
      calls++;
      return 42;
    };
    const result = await withRetry(fn, { maxAttempts: 3 });
    expect(result).toBe(42);
    expect(calls).toBe(1);
  });

  it('retries on failure and eventually succeeds', async () => {
    let calls = 0;
    const fn = async (): Promise<number> => {
      calls++;
      if (calls < 3) throw new Error('transient');
      return 42;
    };
    const result = await withRetry(fn, { maxAttempts: 3, initialDelayMs: 1 });
    expect(result).toBe(42);
    expect(calls).toBe(3);
  });

  it('throws after exhausting attempts', async () => {
    let calls = 0;
    const fn = async (): Promise<number> => {
      calls++;
      throw new Error('always');
    };
    await expect(
      withRetry(fn, { maxAttempts: 3, initialDelayMs: 1 }),
    ).rejects.toThrow('always');
    expect(calls).toBe(3);
  });

  it('uses exponential backoff between attempts', async () => {
    const timestamps: number[] = [];
    const fn = async (): Promise<number> => {
      timestamps.push(Date.now());
      if (timestamps.length < 3) throw new Error('transient');
      return 1;
    };
    await withRetry(fn, { maxAttempts: 3, initialDelayMs: 50 });
    const gap1 = timestamps[1]! - timestamps[0]!;
    const gap2 = timestamps[2]! - timestamps[1]!;
    expect(gap2).toBeGreaterThan(gap1 * 1.5);
  });
});
