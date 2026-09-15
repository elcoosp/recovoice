import { describe, it, expect, vi } from 'vitest';
import {
  ElevenLabsTTSProvider,
  approximateTimings,
} from '../../src/tts/providers/elevenlabs.js';

describe('approximateTimings', () => {
  it('produces sequential timings for each word', () => {
    const timings = approximateTimings('Hello brave world', 60);
    expect(timings).toHaveLength(3);
    expect(timings[0]!.word).toBe('Hello');
    expect(timings[0]!.endMs).toBeLessThanOrEqual(timings[1]!.startMs);
    expect(timings[1]!.endMs).toBeLessThanOrEqual(timings[2]!.startMs);
  });

  it('uses wpm to determine duration', () => {
    const timings = approximateTimings('a b c', 60);
    expect(timings[2]!.endMs).toBeCloseTo(3000, -2);
  });
});

describe('ElevenLabsTTSProvider', () => {
  it('sends a request with the voice id, model, and text', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          audio_base64: Buffer.from('audio').toString('base64'),
          alignment: {
            characters: ['H', 'i'],
            character_start_times_seconds: [0, 0.1],
            character_end_times_seconds: [0.1, 0.2],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const provider = new ElevenLabsTTSProvider({
      apiKey: 'test-key',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await provider.synthesize('Hi', {
      voiceId: 'voice-123',
      modelId: 'eleven_multilingual_v2',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/v1/text-to-speech/voice-123/with-timestamps');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['xi-api-key']).toBe('test-key');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.text).toBe('Hi');
    expect(body.model_id).toBe('eleven_multilingual_v2');

    expect(result.audio.toString()).toBe('audio');
    expect(result.format).toBe('mp3');
    expect(result.timings).toEqual([{ word: 'Hi', startMs: 0, endMs: 200 }]);
  });

  it('groups characters into words using alignment data', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          audio_base64: Buffer.from('a').toString('base64'),
          alignment: {
            characters: ['H', 'e', 'l', 'l', 'o', ' ', 'w', 'o', 'r', 'l', 'd'],
            character_start_times_seconds: [
              0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5,
            ],
            character_end_times_seconds: [
              0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55,
            ],
          },
        }),
        { status: 200 },
      );
    });

    const provider = new ElevenLabsTTSProvider({
      apiKey: 'k',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const result = await provider.synthesize('Hello world', {
      voiceId: 'v',
    });

    expect(result.timings).toHaveLength(2);
    expect(result.timings[0]!.word).toBe('Hello');
    expect(result.timings[0]!.startMs).toBe(0);
    expect(result.timings[0]!.endMs).toBe(250);
    expect(result.timings[1]!.word).toBe('world');
    expect(result.timings[1]!.startMs).toBe(300);
    expect(result.timings[1]!.endMs).toBe(550);
  });

  it('falls back to approximate timings when no alignment is provided', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          audio_base64: Buffer.from('a').toString('base64'),
        }),
        { status: 200 },
      );
    });

    const provider = new ElevenLabsTTSProvider({
      apiKey: 'k',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const result = await provider.synthesize('one two', { voiceId: 'v' });
    expect(result.timings).toHaveLength(2);
  });

  it('throws an informative error when the API responds non-200', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response('invalid api key', { status: 401 });
    });

    const provider = new ElevenLabsTTSProvider({
      apiKey: 'bad',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await expect(
      provider.synthesize('hi', { voiceId: 'v' }),
    ).rejects.toThrow(/401/);
  });

  it('throws when the response body is missing audio_base64', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({}), { status: 200 });
    });
    const provider = new ElevenLabsTTSProvider({
      apiKey: 'k',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await expect(
      provider.synthesize('hi', { voiceId: 'v' }),
    ).rejects.toThrow(/audio_base64/);
  });
});
