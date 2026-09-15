import { describe, it, expect } from 'vitest';
import {
  computeCursorGhostCount,
  computeCursorGhostAlpha,
  computeZoomBlurRadius,
  MAX_CURSOR_GHOSTS,
  MAX_ZOOM_BLUR_PX,
} from '../../src/polish/motion-blur.js';

describe('motion blur', () => {
  describe('computeCursorGhostCount', () => {
    it('returns 0 for zero velocity', () => {
      expect(computeCursorGhostCount(0)).toBe(0);
    });

    it('returns 0 for velocity below threshold', () => {
      expect(computeCursorGhostCount(200)).toBe(0);
    });

    it('returns at most MAX_CURSOR_GHOSTS for extreme velocity', () => {
      expect(computeCursorGhostCount(10000)).toBe(MAX_CURSOR_GHOSTS);
    });

    it('increases with velocity', () => {
      const slow = computeCursorGhostCount(600);
      const fast = computeCursorGhostCount(2000);
      expect(fast).toBeGreaterThan(slow);
    });
  });

  describe('computeCursorGhostAlpha', () => {
    it('returns the base alpha for the primary ghost (index 1)', () => {
      expect(computeCursorGhostAlpha(1, MAX_CURSOR_GHOSTS)).toBeCloseTo(0.3, 5);
    });

    it('decreases monotonically with ghost index', () => {
      let prev = Infinity;
      for (let i = 1; i <= MAX_CURSOR_GHOSTS; i++) {
        const a = computeCursorGhostAlpha(i, MAX_CURSOR_GHOSTS);
        expect(a).toBeLessThanOrEqual(prev);
        prev = a;
      }
    });

    it('returns 0 for ghost index beyond MAX_CURSOR_GHOSTS', () => {
      expect(computeCursorGhostAlpha(99, MAX_CURSOR_GHOSTS)).toBe(0);
    });
  });

  describe('computeZoomBlurRadius', () => {
    it('returns 0 for zero velocity', () => {
      expect(computeZoomBlurRadius(0)).toBe(0);
    });

    it('returns 0 for velocity below threshold', () => {
      expect(computeZoomBlurRadius(10)).toBe(0);
    });

    it('caps at MAX_ZOOM_BLUR_PX', () => {
      expect(computeZoomBlurRadius(1e9)).toBe(MAX_ZOOM_BLUR_PX);
    });

    it('increases with velocity', () => {
      expect(computeZoomBlurRadius(2000)).toBeGreaterThan(
        computeZoomBlurRadius(500),
      );
    });
  });
});
