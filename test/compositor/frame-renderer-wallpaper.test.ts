import { describe, it, expect } from 'vitest';
import {
  renderFrame,
  DEFAULT_CURSOR_STYLE,
  DEFAULT_FRAME_CONFIG,
} from '../../src/compositor/frame-renderer.js';
import type {
  CanvasLike,
  CanvasGradientLike,
} from '../../src/compositor/canvas-types.js';

interface Call {
  method: string;
  args: unknown[];
}

function makeMockCanvas(width: number, height: number): {
  canvas: CanvasLike;
  calls: Call[];
  filterLog: string[];
} {
  const calls: Call[] = [];
  const filterLog: string[] = [];
  const gradient: CanvasGradientLike = { addColorStop: () => undefined };
  let filterValue = 'none';

  const ctx = {
    save: () => calls.push({ method: 'save', args: [] }),
    restore: () => calls.push({ method: 'restore', args: [] }),
    translate: (...a: unknown[]) => calls.push({ method: 'translate', args: a }),
    scale: (...a: unknown[]) => calls.push({ method: 'scale', args: a }),
    rotate: (...a: unknown[]) => calls.push({ method: 'rotate', args: a }),
    clearRect: (...a: unknown[]) => calls.push({ method: 'clearRect', args: a }),
    fillRect: (...a: unknown[]) => calls.push({ method: 'fillRect', args: a }),
    strokeRect: (...a: unknown[]) => calls.push({ method: 'strokeRect', args: a }),
    drawImage: (...a: unknown[]) => calls.push({ method: 'drawImage', args: a }),
    beginPath: () => calls.push({ method: 'beginPath', args: [] }),
    moveTo: (...a: unknown[]) => calls.push({ method: 'moveTo', args: a }),
    lineTo: (...a: unknown[]) => calls.push({ method: 'lineTo', args: a }),
    quadraticCurveTo: (...a: unknown[]) =>
      calls.push({ method: 'quadraticCurveTo', args: a }),
    closePath: () => calls.push({ method: 'closePath', args: [] }),
    arc: (...a: unknown[]) => calls.push({ method: 'arc', args: a }),
    fill: () => calls.push({ method: 'fill', args: [] }),
    stroke: () => calls.push({ method: 'stroke', args: [] }),
    clip: () => calls.push({ method: 'clip', args: [] }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    get filter() {
      return filterValue;
    },
    set filter(v: string) {
      filterValue = v;
      filterLog.push(v);
    },
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  };
  return {
    canvas: { width, height, getContext: () => ctx },
    calls,
    filterLog,
  };
}

const baseInput = {
  video: {},
  videoWidth: 1280,
  videoHeight: 800,
  camera: { scale: 1, translateX: 0, translateY: 0 },
  cursor: {
    visible: false,
    x: 0,
    y: 0,
    rotation: 0,
    ghostCount: 0,
    clickPulse: 0,
  },
  frame: DEFAULT_FRAME_CONFIG,
  cursorStyle: DEFAULT_CURSOR_STYLE,
};

describe('renderFrame wallpaper', () => {
  it('draws the wallpaper when provided', () => {
    const { canvas, calls } = makeMockCanvas(1920, 1080);
    const wallpaper = { tag: 'wp' };
    renderFrame(canvas, {
      ...baseInput,
      background: { type: 'wallpaper' },
      wallpaper,
    });
    const drawCalls = calls.filter((c) => c.method === 'drawImage');
    expect(drawCalls.length).toBeGreaterThanOrEqual(2);
    expect(drawCalls[0]!.args[0]).toEqual(wallpaper);
  });

  it('applies a blur filter in blur mode', () => {
    const { canvas, filterLog } = makeMockCanvas(1920, 1080);
    renderFrame(canvas, {
      ...baseInput,
      background: { type: 'blur' },
      wallpaper: { tag: 'wp' },
    });
    expect(filterLog.some((f) => f.startsWith('blur('))).toBe(true);
  });

  it('falls back to solid color when wallpaper is missing', () => {
    const { canvas, calls } = makeMockCanvas(1920, 1080);
    renderFrame(canvas, {
      ...baseInput,
      background: { type: 'wallpaper', value: '#123456' },
    });
    const fillCalls = calls.filter((c) => c.method === 'fillRect');
    expect(fillCalls.length).toBeGreaterThan(0);
  });
});
