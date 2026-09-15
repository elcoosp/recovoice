import { describe, it, expect } from 'vitest';
import { createTTSProvider } from '../../src/tts/factory.js';
import { MockTTSProvider } from '../../src/tts/providers/mock.js';
import { KokoroTTSProvider } from '../../src/tts/providers/kokoro.js';
import { EdgeTTSProvider } from '../../src/tts/providers/edge.js';

describe('createTTSProvider', () => {
  it('creates a mock provider', () => {
    const provider = createTTSProvider({ provider: 'mock' });
    expect(provider).toBeInstanceOf(MockTTSProvider);
  });

  it('creates a kokoro provider', () => {
    const provider = createTTSProvider({ provider: 'kokoro' });
    expect(provider).toBeInstanceOf(KokoroTTSProvider);
  });

  it('creates an edge provider', () => {
    const provider = createTTSProvider({ provider: 'edge' });
    expect(provider).toBeInstanceOf(EdgeTTSProvider);
  });

  it('passes kokoro base url', () => {
    const provider = createTTSProvider({
      provider: 'kokoro',
      kokoroUrl: 'http://custom:9999',
    });
    expect(provider).toBeInstanceOf(KokoroTTSProvider);
  });

  it('falls back to mock for unknown provider', () => {
    // @ts-expect-error deliberate invalid value
    const provider = createTTSProvider({ provider: 'unknown' });
    expect(provider).toBeInstanceOf(MockTTSProvider);
  });
});
