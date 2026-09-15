import { describe, it, expect } from 'vitest';
import { createPolishCompositor } from '../../src/compositor/polish-compositor.js';

describe('createPolishCompositor', () => {
  it('returns a compositor instance', () => {
    const compositor = createPolishCompositor({
      durationMs: 1000,
      fps: 30,
      telemetry: {
        events: [],
        timebaseOrigin: 0,
        viewport: { width: 1280, height: 800 },
      },
    });
    expect(compositor).toBeDefined();
    expect(typeof compositor.compose).toBe('function');
  });

  it('rejects when the raw video is missing', async () => {
    const compositor = createPolishCompositor({
      durationMs: 1000,
      fps: 30,
      telemetry: {
        events: [],
        timebaseOrigin: 0,
        viewport: { width: 1280, height: 800 },
      },
    });
    await expect(
      compositor.compose({
        rawVideo: '/nonexistent/raw.mp4',
        voiceovers: [],
        output: '/tmp/out.mp4',
      }),
    ).rejects.toThrow(/Raw video not found/);
  });
});
