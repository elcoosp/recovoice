import { describe, it, expect } from 'vitest';
import {
  cubicBezier,
  easeConnectedPan,
  easeOutScreenStudio,
  linear,
} from '../../src/polish/easing.js';

describe('easing', () => {
  describe('linear', () => {
    it('returns identity', () => {
      expect(linear(0)).toBe(0);
      expect(linear(0.5)).toBe(0.5);
      expect(linear(1)).toBe(1);
    });
  });

  describe('cubicBezier', () => {
    it('clamps endpoints to 0 and 1', () => {
      const ease = cubicBezier(0.42, 0, 0.58, 1);
      expect(ease(0)).toBeCloseTo(0, 5);
      expect(ease(1)).toBeCloseTo(1, 5);
    });

    it('is monotonic for standard ease-in-out', () => {
      const ease = cubicBezier(0.42, 0, 0.58, 1);
      let prev = -1;
      for (let t = 0; t <= 1; t += 0.05) {
        const v = ease(t);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-6);
        prev = v;
      }
    });

    it('ease-in curve starts slow', () => {
      const ease = cubicBezier(0.42, 0, 1, 1);
      expect(ease(0.1)).toBeLessThan(0.1);
    });

    it('ease-out curve ends slow', () => {
      const ease = cubicBezier(0, 0, 0.58, 1);
      expect(ease(0.9)).toBeGreaterThan(0.9);
    });
  });

  describe('easeConnectedPan', () => {
    it('is a valid easing function from 0 to 1', () => {
      expect(easeConnectedPan(0)).toBeCloseTo(0, 5);
      expect(easeConnectedPan(1)).toBeCloseTo(1, 5);
    });
  });

  describe('easeOutScreenStudio', () => {
    it('is a valid easing function from 0 to 1', () => {
      expect(easeOutScreenStudio(0)).toBeCloseTo(0, 5);
      expect(easeOutScreenStudio(1)).toBeCloseTo(1, 5);
    });
  });
});
