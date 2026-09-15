import { describe, it, expect } from 'vitest';
import {
  computeSwayAngle,
  MAX_ROTATION,
  SPEED_REFERENCE,
  VERTICAL_WEIGHT,
} from '../../src/polish/cursor-sway.js';

describe('cursor sway', () => {
  describe('computeSwayAngle', () => {
    it('returns zero for zero velocity', () => {
      expect(computeSwayAngle(0, 0)).toBe(0);
      expect(computeSwayAngle(0, 1)).toBe(0);
    });

    it('is bounded by MAX_ROTATION magnitude', () => {
      for (const v of [-10000, -1000, 1000, 10000]) {
        const angle = computeSwayAngle(v, 1);
        expect(Math.abs(angle)).toBeLessThanOrEqual(MAX_ROTATION + 1e-9);
      }
    });

    it('reaches near MAX_ROTATION at SPEED_REFERENCE', () => {
      const angle = computeSwayAngle(SPEED_REFERENCE, 1);
      expect(Math.abs(angle)).toBeGreaterThan(MAX_ROTATION * 0.5);
      expect(Math.abs(angle)).toBeLessThanOrEqual(MAX_ROTATION);
    });

    it('vertical movement produces less sway than horizontal', () => {
      const horizontal = Math.abs(computeSwayAngle(SPEED_REFERENCE, 0));
      const vertical = Math.abs(computeSwayAngle(0, SPEED_REFERENCE));
      expect(vertical).toBeLessThan(horizontal);
      expect(vertical / horizontal).toBeCloseTo(VERTICAL_WEIGHT, 2);
    });

    it('is antisymmetric in velocityX', () => {
      const a = computeSwayAngle(500, 100);
      const b = computeSwayAngle(-500, 100);
      expect(a).toBeCloseTo(-b, 5);
    });

    it('uses combined velocity magnitude for scaling', () => {
      const pureX = Math.abs(computeSwayAngle(SPEED_REFERENCE, 0));
      const diagonal = Math.abs(
        computeSwayAngle(SPEED_REFERENCE / Math.SQRT2, SPEED_REFERENCE / Math.SQRT2),
      );
      expect(diagonal).toBeGreaterThan(0);
      expect(diagonal).toBeLessThan(pureX);
    });
  });
});
