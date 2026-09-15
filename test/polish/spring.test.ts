import { describe, it, expect } from 'vitest';
import {
  Spring1D,
  springConfigFromSmoothingFactor,
  DEFAULT_SPRING_CONFIG,
  SwaySpringConfig,
} from '../../src/polish/spring.js';

describe('spring', () => {
  describe('springConfigFromSmoothingFactor', () => {
    it('returns default config for smoothing factor 0', () => {
      const cfg = springConfigFromSmoothingFactor(0);
      expect(cfg.stiffness).toBe(DEFAULT_SPRING_CONFIG.stiffness);
    });

    it('decreases stiffness as smoothing factor increases', () => {
      const low = springConfigFromSmoothingFactor(0.1);
      const high = springConfigFromSmoothingFactor(0.9);
      expect(high.stiffness).toBeLessThan(low.stiffness);
    });

    it('clamps smoothing factor to [0, 1]', () => {
      expect(springConfigFromSmoothingFactor(-1).stiffness).toBe(
        springConfigFromSmoothingFactor(0).stiffness,
      );
      expect(springConfigFromSmoothingFactor(2).stiffness).toBe(
        springConfigFromSmoothingFactor(1).stiffness,
      );
    });
  });

  describe('Spring1D', () => {
    it('converges to target over time', () => {
      const spring = new Spring1D({ stiffness: 200, damping: 20, mass: 1 }, 0);
      spring.setTarget(100);
      for (let i = 0; i < 300; i++) spring.step(1 / 60);
      expect(spring.position).toBeCloseTo(100, 1);
    });

    it('does not overshoot by more than 5% for default config', () => {
      const spring = new Spring1D(DEFAULT_SPRING_CONFIG, 0);
      spring.setTarget(100);
      let maxValue = 0;
      for (let i = 0; i < 300; i++) {
        spring.step(1 / 60);
        maxValue = Math.max(maxValue, spring.position);
      }
      expect(maxValue).toBeLessThanOrEqual(105);
    });

    it('produces continuous motion (no discontinuities)', () => {
      const spring = new Spring1D(DEFAULT_SPRING_CONFIG, 0);
      spring.setTarget(1000);
      let prev = spring.position;
      for (let i = 0; i < 300; i++) {
        spring.step(1 / 60);
        const delta = Math.abs(spring.position - prev);
        expect(delta).toBeLessThan(1000);
        prev = spring.position;
      }
    });

    it('starts at initial value', () => {
      const spring = new Spring1D(DEFAULT_SPRING_CONFIG, 42);
      expect(spring.position).toBe(42);
    });

    it('handles target changes mid-flight', () => {
      const spring = new Spring1D(DEFAULT_SPRING_CONFIG, 0);
      spring.setTarget(100);
      for (let i = 0; i < 10; i++) spring.step(1 / 60);
      spring.setTarget(50);
      for (let i = 0; i < 300; i++) spring.step(1 / 60);
      expect(spring.position).toBeCloseTo(50, 1);
    });

    it('is stable at large dt', () => {
      const spring = new Spring1D(DEFAULT_SPRING_CONFIG, 0);
      spring.setTarget(100);
      spring.step(1); // 1 second step
      expect(Number.isFinite(spring.position)).toBe(true);
      expect(Number.isFinite(spring.velocity)).toBe(true);
    });
  });

  describe('SwaySpringConfig', () => {
    it('uses reduced damping and mass relative to position spring', () => {
      expect(SwaySpringConfig.damping).toBeLessThan(
        DEFAULT_SPRING_CONFIG.damping,
      );
      expect(SwaySpringConfig.mass).toBeLessThan(DEFAULT_SPRING_CONFIG.mass);
    });
  });
});
