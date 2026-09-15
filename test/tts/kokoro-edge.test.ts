import { describe, it, expect, vi } from 'vitest';
import { KokoroTTSProvider } from '../../src/tts/providers/kokoro.js';

describe('KokoroTTSProvider', () => {
  it('parses audio and timestamps from the API response', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          audio: Buffer.from('audio-bytes').toString('base64'),
          timestamps: [
            { word: 'Hello', start_time: 0, end_time: 0.4 },
            { word: 'world', start_time: 0.4, end_time: 0.9 },
          ],
        }),
        { status: 200 },
      );
    });

    const provider = new KokoroTTSProvider({
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const result = await provider.synthesize('Hello world', {
      voiceId: 'af_bella',
    });

    expect(result.audio.toString()).toBe('audio-bytes');
    expect(result.format).toBe('mp3');
    expect(result.timings).toHaveLength(2);
    expect(result.timings[0]!.word).toBe('Hello');
    expect(result.timings[0]!.startMs).toBe(0);
    expect(result.timings[0]!.endMs).toBe(400);
    expect(result.timings[1]!.word).toBe('world');
  });

  it('throws on non-200 response', async () => {
    const fetchMock = vi.fn(async () => new Response('bad', { status: 500 }));
    const provider = new KokoroTTSProvider({
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await expect(
      provider.synthesize('hi', { voiceId: 'af_bella' }),
    ).rejects.toThrow(/500/);
  });
});
