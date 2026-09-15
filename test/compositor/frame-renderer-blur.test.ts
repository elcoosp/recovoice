import { describe, it, expect, beforeEach } from 'vitest';
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
  ctxRef: { filter: string };
} {
  const calls: Call[] = [];
  const gradient: CanvasGradientLike = { addColorStop: () => undefined };
  const ctxRef = { filter: 'none' };
  const ctx = {
    save: () => calls.push({ method: 'save', args: [] }),
    restore: () => calls.push({ method: 'restore', args: [] }),
    translate: (...args: unknown[]) => calls.push({ method: 'translate', args }),
    scale: (...args: unknown[]) => calls.push({ method: 'scale', args }),
    rotate: (...args: unknown[]) => calls.push({ method: 'rotate', args }),
    clearRect: (...args: unknown[]) => calls.push({ method: 'clearRect', args }),
    fillRect: (...args: unknown[]) => calls.push({ method: 'fillRect', args }),
    strokeRect: (...args: unknown[]) => calls.push({ method: 'strokeRect', args }),
    drawImage: (...args: unknown[]) => calls.push({ method: 'drawImage', args }),
    beginPath: () => calls.push({ method: 'beginPath', args: [] }),
    moveTo: (...args: unknown[]) => calls.push({ method: 'moveTo', args }),
    lineTo: (...args: unknown[]) => calls.push({ method: 'lineTo', args }),
    quadraticCurveTo: (...args: unknown[]) =>
      calls.push({ method: 'quadraticCurveTo', args }),
    closePath: () => calls.push({ method: 'closePath', args: [] }),
    arc: (...args: unknown[]) => calls.push({ method: 'arc', args }),
    fill: () => calls.push({ method: 'fill', args: [] }),
    stroke: () => calls.push({ method: 'stroke', args: [] }),
    clip: () => calls.push({ method: 'clip', args: [] }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    get filter() {
      return ctxRef.filter;
    },
    set filter(v: string) {
      ctxRef.filter = v;
      calls.push({ method: 'filter', args: [v] });
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
  const canvas: CanvasLike = {
    width,
    height,
    getContext: () => ctx,
  };
  return { canvas, calls, ctxRef };
}

const camera = { scale: 1, translateX: 0, translateY: 0 };
const hiddenCursor = {
  visible: false,
  x: 0,
  y: 0,
  rotation: 0,
  ghostCount: 0,
  clickPulse: 0,
};

describe('renderFrame zoom blur', () => {
  let canvas: CanvasLike;
  let calls: Call[];

  beforeEach(() => {
    const mock = makeMockCanvas(1920, 1080);
    canvas = mock.canvas;
    calls = mock.calls;
  });

  it('does not set a filter when zoomBlurRadius is 0', () => {
    renderFrame(canvas, {
      video: {},
      videoWidth: 1280,
      videoHeight: 800,
      camera,
      cursor: hiddenCursor,
      background: { type: 'solid' },
      frame: DEFAULT_FRAME_CONFIG,
      cursorStyle: DEFAULT_CURSOR_STYLE,
      zoomBlurRadius: 0,
    });
    const filterCalls = calls.filter((c) => c.method === 'filter');
    expect(filterCalls.every((c) => c.args[0] === 'none')).toBe(true);
  });

  it('sets a filter when zoomBlurRadius is above threshold', () => {
    renderFrame(canvas, {
      video: {},
      videoWidth: 1280,
      videoHeight: 800,
      camera,
      cursor: hiddenCursor,
      background: { type: 'solid' },
      frame: DEFAULT_FRAME_CONFIG,
      cursorStyle: DEFAULT_CURSOR_STYLE,
      zoomBlurRadius: 5,
    });
    const filterCalls = calls.filter((c) => c.method === 'filter');
    expect(filterCalls.some((c) => String(c.args[0]).startsWith('blur('))).toBe(true);
  });

  it('resets filter to none after drawing the frame', () => {
    renderFrame(canvas, {
      video: {},
      videoWidth: 1280,
      videoHeight: 800,
      camera,
      cursor: hiddenCursor,
      background: { type: 'solid' },
      frame: DEFAULT_FRAME_CONFIG,
      cursorStyle: DEFAULT_CURSOR_STYLE,
      zoomBlurRadius: 5,
    });
    const filterCalls = calls.filter((c) => c.method === 'filter');
    const last = filterCalls[filterCalls.length - 1];
    expect(last!.args[0]).toBe('none');
  });
});
