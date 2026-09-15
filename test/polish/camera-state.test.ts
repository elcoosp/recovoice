import { describe, it, expect } from 'vitest';
import {
  computeCameraState,
  type CameraState,
} from '../../src/polish/camera-state.js';
import type { ZoomRegion, ConnectedTransition } from '../../src/types/recording.js';

const viewport = { width: 1280, height: 800 };

function region(
  id: string,
  startMs: number,
  endMs: number,
  cx: number,
  cy: number,
  depth = 1.5,
): ZoomRegion {
  return { id, startMs, endMs, focus: { cx, cy }, depth };
}

const NO_TRANSITIONS: ConnectedTransition[] = [];

describe('computeCameraState', () => {
  it('returns identity when no zoom regions are active', () => {
    const state = computeCameraState({
      zoomRegions: [],
      transitions: NO_TRANSITIONS,
      tMs: 0,
      viewport,
    });
    expect(state.scale).toBe(1);
    expect(state.translateX).toBe(0);
    expect(state.translateY).toBe(0);
  });

  it('returns identity before any region starts', () => {
    const state = computeCameraState({
      zoomRegions: [region('a', 1000, 2000, 500, 400)],
      transitions: NO_TRANSITIONS,
      tMs: 0,
      viewport,
    });
    expect(state.scale).toBe(1);
  });

  it('returns identity after all regions end', () => {
    const state = computeCameraState({
      zoomRegions: [region('a', 1000, 2000, 500, 400)],
      transitions: NO_TRANSITIONS,
      tMs: 5000,
      viewport,
    });
    expect(state.scale).toBe(1);
  });

  it('scales to region depth in the middle of a region', () => {
    const state = computeCameraState({
      zoomRegions: [region('a', 0, 2000, 640, 400, 2.0)],
      transitions: NO_TRANSITIONS,
      tMs: 1000,
      viewport,
    });
    expect(state.scale).toBeCloseTo(2.0, 2);
  });

  it('centers the focus point when zoomed', () => {
    const state = computeCameraState({
      zoomRegions: [region('a', 0, 2000, 640, 400, 2.0)],
      transitions: NO_TRANSITIONS,
      tMs: 1000,
      viewport,
    });
    // Focus is at viewport center -> translate should be 0
    expect(state.translateX).toBeCloseTo(0, 1);
    expect(state.translateY).toBeCloseTo(0, 1);
  });

  it('translates to bring off-center focus into view', () => {
    const state = computeCameraState({
      zoomRegions: [region('a', 0, 2000, 200, 100, 2.0)],
      transitions: NO_TRANSITIONS,
      tMs: 1000,
      viewport,
    });
    // Focus is up-left of center -> camera pans to bring it toward center
    expect(state.translateX).toBeGreaterThan(0);
    expect(state.translateY).toBeGreaterThan(0);
  });

  it('applies asymmetric zoom-in vs zoom-out durations', () => {
    const zoomInState = computeCameraState({
      zoomRegions: [region('a', 500, 2000, 640, 400, 2.0)],
      transitions: NO_TRANSITIONS,
      tMs: 500,
      viewport,
    });
    // At the very start of zoom-in, scale should still be near 1
    expect(zoomInState.scale).toBeCloseTo(1, 1);
  });

  it('interpolates pan between connected regions', () => {
    const a = region('a', 0, 1000, 100, 100, 1.5);
    const b = region('b', 2000, 3000, 900, 600, 1.5);
    const transitions: ConnectedTransition[] = [
      {
        fromRegion: a,
        toRegion: b,
        panStartMs: 1000,
        panEndMs: 2000,
      },
    ];
    const mid = computeCameraState({
      zoomRegions: [a, b],
      transitions,
      tMs: 1500,
      viewport,
    });
    // Midway through the pan, focus should be between the two regions
    expect(mid.scale).toBeCloseTo(1.5, 1);
  });

  it('eases the zoom-in over a transition period', () => {
    const r = region('a', 0, 5000, 640, 400, 2.0);
    const t0 = computeCameraState({ zoomRegions: [r], transitions: NO_TRANSITIONS, tMs: 0, viewport });
    const t300 = computeCameraState({ zoomRegions: [r], transitions: NO_TRANSITIONS, tMs: 300, viewport });
    const t600 = computeCameraState({ zoomRegions: [r], transitions: NO_TRANSITIONS, tMs: 600, viewport });
    const tMid = computeCameraState({ zoomRegions: [r], transitions: NO_TRANSITIONS, tMs: 2000, viewport });
    expect(t0.scale).toBeLessThan(t300.scale);
    expect(t300.scale).toBeLessThan(t600.scale);
    expect(t600.scale).toBeLessThanOrEqual(tMid.scale + 1e-6);
  });

  it('returns a serializable camera state', () => {
    const state: CameraState = computeCameraState({
      zoomRegions: [region('a', 0, 2000, 640, 400)],
      transitions: NO_TRANSITIONS,
      tMs: 1000,
      viewport,
    });
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
