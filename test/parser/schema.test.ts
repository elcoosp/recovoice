import { describe, it, expect } from 'vitest';
import {
  validateFrontmatter,
  frontmatterSchema,
} from '../../src/parser/schema.js';

describe('validateFrontmatter', () => {
  it('accepts an empty object', () => {
    expect(validateFrontmatter({})).toEqual({ valid: true });
  });

  it('accepts a full valid frontmatter', () => {
    const result = validateFrontmatter({
      viewport: { width: 1920, height: 1080 },
      fps: 30,
      typingSpeed: 16,
      voiceover: { provider: 'kokoro', voiceId: 'af_bella' },
      captions: { format: 'both', burn: true, style: { font: 'Inter' } },
      variables: { appName: 'Acme' },
    });
    expect(result).toEqual({ valid: true });
  });

  it('rejects invalid fps (out of range)', () => {
    const result = validateFrontmatter({ fps: 999 });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues[0]!.path).toBe('fps');
    }
  });

  it('rejects non-integer fps', () => {
    const result = validateFrontmatter({ fps: 29.97 });
    expect(result.valid).toBe(false);
  });

  it('rejects missing voiceover.provider', () => {
    const result = validateFrontmatter({
      voiceover: { voiceId: 'af_bella' },
    });
    expect(result.valid).toBe(false);
  });

  it('rejects invalid viewport dimensions', () => {
    const result = validateFrontmatter({
      viewport: { width: -1, height: 1080 },
    });
    expect(result.valid).toBe(false);
  });

  it('rejects invalid caption format', () => {
    const result = validateFrontmatter({
      captions: { format: 'invalid' },
    });
    expect(result.valid).toBe(false);
  });

  it('rejects invalid caption position', () => {
    const result = validateFrontmatter({
      captions: { style: { position: 'left' } },
    });
    expect(result.valid).toBe(false);
  });

  it('allows unknown top-level keys (forward compatibility)', () => {
    const result = validateFrontmatter({ unknownKey: 'whatever' });
    expect(result).toEqual({ valid: true });
  });

  it('accepts polish with boolean autoZoom', () => {
    expect(validateFrontmatter({ polish: { autoZoom: false } })).toEqual({
      valid: true,
    });
  });

  it('accepts polish with detailed autoZoom config', () => {
    expect(
      validateFrontmatter({
        polish: {
          autoZoom: { minDwellMs: 500, defaultDepth: 2 },
        },
      }),
    ).toEqual({ valid: true });
  });

  it('rejects cursorSmoothing outside [0, 1]', () => {
    const result = validateFrontmatter({ polish: { cursorSmoothing: 5 } });
    expect(result.valid).toBe(false);
  });

  it('reports multiple issues at once', () => {
    const result = validateFrontmatter({
      fps: -1,
      viewport: { width: 0, height: 100 },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('exposes the underlying zod schema', () => {
    expect(frontmatterSchema).toBeDefined();
  });
});
