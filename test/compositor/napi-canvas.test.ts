import { describe, it, expect } from 'vitest';
import {
  createNapiCanvas,
  isNapiCanvasAvailable,
} from '../../src/compositor/napi-canvas.js';

describe('napi-canvas availability', () => {
  it('reports availability without throwing', () => {
    const available = isNapiCanvasAvailable();
    expect(typeof available).toBe('boolean');
  });
});

describe('createNapiCanvas', () => {
  it('creates a canvas with the requested dimensions when available', () => {
    if (!isNapiCanvasAvailable()) return;
    const canvas = createNapiCanvas(320, 240);
    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(240);
  });
});
