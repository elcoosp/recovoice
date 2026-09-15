import { describe, it, expect } from 'vitest';
import {
  createPolishRegistry,
  runAnalyzeHooks,
  runTransformHooks,
  type PolishPlugin,
} from '../../src/polish/plugin.js';
import type { ZoomRegion } from '../../src/types/recording.js';
import type { CameraState } from '../../src/polish/camera-state.js';
import type { CursorFrameState } from '../../src/polish/cursor-state.js';

const region = (id: string): ZoomRegion => ({
  id,
  startMs: 0,
  endMs: 1000,
  focus: { cx: 0, cy: 0 },
  depth: 1,
});

describe('createPolishRegistry', () => {
  it('starts empty', () => {
    const r = createPolishRegistry();
    expect(r.list()).toEqual([]);
  });

  it('registers plugins in order', () => {
    const r = createPolishRegistry();
    const a: PolishPlugin = { name: 'a' };
    const b: PolishPlugin = { name: 'b' };
    r.register(a);
    r.register(b);
    expect(r.list()).toEqual([a, b]);
  });

  it('rejects duplicate names', () => {
    const r = createPolishRegistry();
    r.register({ name: 'dup' });
    expect(() => r.register({ name: 'dup' })).toThrow(/already registered/);
  });

  it('clears all plugins', () => {
    const r = createPolishRegistry();
    r.register({ name: 'a' });
    r.clear();
    expect(r.list()).toEqual([]);
  });
});

describe('runAnalyzeHooks', () => {
  it('returns the original analysis when no plugins are present', () => {
    const result = runAnalyzeHooks([], {
      telemetry: { events: [], timebaseOrigin: 0, viewport: { width: 1, height: 1 } },
      zoomRegions: [region('a')],
      transitions: [],
    });
    expect(result.zoomRegions.map((r) => r.id)).toEqual(['a']);
  });

  it('merges plugin-contributed zoom regions', () => {
    const plugin: PolishPlugin = {
      name: 'extra',
      analyze: () => ({ zoomRegions: [region('extra')] }),
    };
    const result = runAnalyzeHooks([plugin], {
      telemetry: { events: [], timebaseOrigin: 0, viewport: { width: 1, height: 1 } },
      zoomRegions: [region('a')],
      transitions: [],
    });
    expect(result.zoomRegions.map((r) => r.id)).toEqual(['a', 'extra']);
  });

  it('runs multiple plugins in sequence', () => {
    const p1: PolishPlugin = {
      name: 'p1',
      analyze: () => ({ zoomRegions: [region('p1')] }),
    };
    const p2: PolishPlugin = {
      name: 'p2',
      analyze: () => ({ zoomRegions: [region('p2')] }),
    };
    const result = runAnalyzeHooks([p1, p2], {
      telemetry: { events: [], timebaseOrigin: 0, viewport: { width: 1, height: 1 } },
      zoomRegions: [],
      transitions: [],
    });
    expect(result.zoomRegions.map((r) => r.id)).toEqual(['p1', 'p2']);
  });
});

describe('runTransformHooks', () => {
  it('allows plugins to mutate camera state', () => {
    const plugin: PolishPlugin = {
      name: 'doubler',
      transformFrame: ({ camera }) => {
        camera.scale *= 2;
      },
    };
    const camera: CameraState = { scale: 1, translateX: 0, translateY: 0 };
    const cursor: CursorFrameState = {
      visible: false,
      x: 0,
      y: 0,
      rotation: 0,
      ghostCount: 0,
      clickPulse: 0,
    };
    runTransformHooks([plugin], { tMs: 0, camera, cursor });
    expect(camera.scale).toBe(2);
  });

  it('runs plugins in order', () => {
    const order: string[] = [];
    const p1: PolishPlugin = {
      name: 'p1',
      transformFrame: () => {
        order.push('p1');
      },
    };
    const p2: PolishPlugin = {
      name: 'p2',
      transformFrame: () => {
        order.push('p2');
      },
    };
    const camera: CameraState = { scale: 1, translateX: 0, translateY: 0 };
    const cursor: CursorFrameState = {
      visible: false,
      x: 0,
      y: 0,
      rotation: 0,
      ghostCount: 0,
      clickPulse: 0,
    };
    runTransformHooks([p1, p2], { tMs: 0, camera, cursor });
    expect(order).toEqual(['p1', 'p2']);
  });

  it('ignores plugins without transformFrame', () => {
    const p: PolishPlugin = { name: 'noop' };
    const camera: CameraState = { scale: 1, translateX: 0, translateY: 0 };
    const cursor: CursorFrameState = {
      visible: false,
      x: 0,
      y: 0,
      rotation: 0,
      ghostCount: 0,
      clickPulse: 0,
    };
    expect(() =>
      runTransformHooks([p], { tMs: 0, camera, cursor }),
    ).not.toThrow();
  });
});
