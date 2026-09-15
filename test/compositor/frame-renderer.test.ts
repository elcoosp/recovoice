import { describe, it, expect, beforeEach } from 'vitest';
import {
  renderFrame,
  DEFAULT_CURSOR_STYLE,
  DEFAULT_FRAME_CONFIG,
} from '../../src/compositor/frame-renderer.js';
import type { CanvasLike, CanvasGradientLike } from '../../src/compositor/canvas-types.js';

interface Call {
  method: string;
  args: unknown[];
}

function makeMockCanvas(width: number, height: number): {
  canvas: CanvasLike;
  calls: Call[];
} {
  const calls: Call[] = [];
  const gradient: CanvasGradientLike = {
    addColorStop: () => undefined,
  };
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
    quadraticCurveTo: (...args: unknown[]) => calls.push({ method: 'quadraticCurveTo', args }),
    closePath: () => calls.push({ method: 'closePath', args: [] }),
    arc: (...args: unknown[]) => calls.push({ method: 'arc', args }),
    fill: () => calls.push({ method: 'fill', args: [] }),
    stroke: () => calls.push({ method: 'stroke', args: [] }),
    clip: () => calls.push({ method: 'clip', args: [] }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    filter: 'none',
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
  return { canvas, calls };
}

const camera = { scale: 1, translateX: 0, translateY: 0 };
const cursorHidden = {
  visible: false,
  x: 0,
  y: 0,
  rotation: 0,
  ghostCount: 0,
  clickPulse: 0,
};
const cursorVisible = {
  visible: true,
  x: 400,
  y: 300,
  rotation: 0.1,
  ghostCount: 0,
  clickPulse: 0,
};

describe('renderFrame', () => {
  let canvas: CanvasLike;
  let calls: Call[];

  beforeEach(() => {
    const mock = makeMockCanvas(1920, 1080);
    canvas = mock.canvas;
    calls = mock.calls;
  });

  it('clears the canvas', () => {
    renderFrame(canvas, {
      video: {},
      videoWidth: 1280,
      videoHeight: 800,
      camera,
      cursor: cursorHidden,
      background: { type: 'solid', value: '#000' },
      frame: DEFAULT_FRAME_CONFIG,
      cursorStyle: DEFAULT_CURSOR_STYLE,
    });
    expect(calls.some((c) => c.method === 'clearRect')).toBe(true);
  });

  it('draws a background', () => {
    renderFrame(canvas, {
      video: {},
      videoWidth: 1280,
      videoHeight: 800,
      camera,
      cursor: cursorHidden,
      background: { type: 'gradient' },
      frame: DEFAULT_FRAME_CONFIG,
      cursorStyle: DEFAULT_CURSOR_STYLE,
    });
    expect(calls.some((c) => c.method === 'fillRect')).toBe(true);
  });

  it('draws the video frame', () => {
    renderFrame(canvas, {
      video: { tag: 'frame' },
      videoWidth: 1280,
      videoHeight: 800,
      camera,
      cursor: cursorHidden,
      background: { type: 'solid', value: '#000' },
      frame: DEFAULT_FRAME_CONFIG,
      cursorStyle: DEFAULT_CURSOR_STYLE,
    });
    const drawImageCall = calls.find((c) => c.method === 'drawImage');
    expect(drawImageCall).toBeDefined();
    expect(drawImageCall!.args[0]).toEqual({ tag: 'frame' });
  });

  it('does not draw the cursor when hidden', () => {
    renderFrame(canvas, {
      video: {},
      videoWidth: 1280,
      videoHeight: 800,
      camera,
      cursor: cursorHidden,
      background: { type: 'solid', value: '#000' },
      frame: DEFAULT_FRAME_CONFIG,
      cursorStyle: DEFAULT_CURSOR_STYLE,
    });
    // No rotate should be called for the cursor; camera scale at 1 means
    // scale(1,1) is called, but rotate should not be.
    const rotateCalls = calls.filter((c) => c.method === 'rotate');
    expect(rotateCalls).toHaveLength(0);
  });

  it('draws the cursor when visible', () => {
    renderFrame(canvas, {
      video: {},
      videoWidth: 1280,
      videoHeight: 800,
      camera,
      cursor: cursorVisible,
      background: { type: 'solid', value: '#000' },
      frame: DEFAULT_FRAME_CONFIG,
      cursorStyle: DEFAULT_CURSOR_STYLE,
    });
    const rotateCalls = calls.filter((c) => c.method === 'rotate');
    expect(rotateCalls.length).toBeGreaterThan(0);
  });

  it('applies camera scale to the video frame', () => {
    renderFrame(canvas, {
      video: {},
      videoWidth: 1280,
      videoHeight: 800,
      camera: { scale: 1.5, translateX: 0, translateY: 0 },
      cursor: cursorHidden,
      background: { type: 'solid', value: '#000' },
      frame: DEFAULT_FRAME_CONFIG,
      cursorStyle: DEFAULT_CURSOR_STYLE,
    });
    const scaleCalls = calls.filter((c) => c.method === 'scale');
    expect(scaleCalls.some((c) => c.args[0] === 1.5)).toBe(true);
  });

  it('draws ghost trails when ghostCount is greater than zero', () => {
    renderFrame(canvas, {
      video: {},
      videoWidth: 1280,
      videoHeight: 800,
      camera,
      cursor: { ...cursorVisible, ghostCount: 3 },
      background: { type: 'solid', value: '#000' },
      frame: DEFAULT_FRAME_CONFIG,
      cursorStyle: DEFAULT_CURSOR_STYLE,
    });
    // Ghosts add extra save/restore cycles
    const saveCalls = calls.filter((c) => c.method === 'save');
    expect(saveCalls.length).toBeGreaterThan(3);
  });

  it('applies click pulse by scaling the cursor', () => {
    renderFrame(canvas, {
      video: {},
      videoWidth: 1280,
      videoHeight: 800,
      camera,
      cursor: { ...cursorVisible, clickPulse: 0.8 },
      background: { type: 'solid', value: '#000' },
      frame: DEFAULT_FRAME_CONFIG,
      cursorStyle: DEFAULT_CURSOR_STYLE,
    });
    const scaleCalls = calls.filter((c) => c.method === 'scale');
    expect(scaleCalls.some((c) => (c.args[0] as number) > 1.05)).toBe(true);
  });
});
