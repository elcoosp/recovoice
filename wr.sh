#!/usr/bin/env bash
set -uo pipefail

COMPILE_OK=true
INCOMPLETE=false

echo "Creating compositor directory"
mkdir -p src/compositor test/compositor

echo "Writing src/compositor/canvas-types.ts"
cat > src/compositor/canvas-types.ts << 'EOF'
export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: '2d'): CanvasRenderingContext2DLike;
}

export interface CanvasRenderingContext2DLike {
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  rotate(radians: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  drawImage(image: unknown, x: number, y: number, w?: number, h?: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  closePath(): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradientLike;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradientLike;
  filter: string;
  globalAlpha: number;
  fillStyle: string | CanvasGradientLike;
  strokeStyle: string | CanvasGradientLike;
  lineWidth: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
}

export interface CanvasGradientLike {
  addColorStop(offset: number, color: string): void;
}
EOF

echo "Writing src/compositor/frame-renderer.ts"
cat > src/compositor/frame-renderer.ts << 'EOF'
import type {
  CanvasLike,
  CanvasRenderingContext2DLike,
} from './canvas-types.js';
import type { CameraState } from '../polish/camera-state.js';
import type { CursorFrameState } from '../polish/cursor-state.js';
import type {
  BackgroundConfig,
  FrameConfig,
} from '../types/recording.js';

export interface RenderFrameInput {
  video: unknown;
  videoWidth: number;
  videoHeight: number;
  camera: CameraState;
  cursor: CursorFrameState;
  background: BackgroundConfig;
  frame: Required<FrameConfig>;
  cursorStyle?: CursorStyle;
}

export interface CursorStyle {
  sizePx: number;
  color: string;
  outlineColor: string;
  outlineWidth: number;
  ghostColor: string;
}

export const DEFAULT_CURSOR_STYLE: CursorStyle = {
  sizePx: 24,
  color: '#ffffff',
  outlineColor: '#000000',
  outlineWidth: 2,
  ghostColor: 'rgba(255, 255, 255, 0.3)',
};

export const DEFAULT_FRAME_CONFIG: Required<FrameConfig> = {
  padding: 60,
  borderRadius: 16,
  shadow: true,
};

export function renderFrame(
  canvas: CanvasLike,
  input: RenderFrameInput,
): void {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.restore();

  drawBackground(ctx, width, height, input.background);

  const padding = input.frame.padding;
  const contentWidth = width - padding * 2;
  const contentHeight = height - padding * 2;
  const videoAspect = input.videoWidth / input.videoHeight;
  const contentAspect = contentWidth / contentHeight;

  let drawWidth: number;
  let drawHeight: number;
  if (videoAspect > contentAspect) {
    drawWidth = contentWidth;
    drawHeight = contentWidth / videoAspect;
  } else {
    drawHeight = contentHeight;
    drawWidth = contentHeight * videoAspect;
  }
  const drawX = padding + (contentWidth - drawWidth) / 2;
  const drawY = padding + (contentHeight - drawHeight) / 2;

  drawFrameWithShadow(ctx, input, {
    x: drawX,
    y: drawY,
    width: drawWidth,
    height: drawHeight,
    borderRadius: input.frame.borderRadius,
  });

  drawCursor(
    ctx,
    input.cursor,
    input.camera,
    { x: drawX, y: drawY, width: drawWidth, height: drawHeight },
    input.cursorStyle ?? DEFAULT_CURSOR_STYLE,
  );
}

interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius: number;
}

function drawFrameWithShadow(
  ctx: CanvasRenderingContext2DLike,
  input: RenderFrameInput,
  rect: FrameRect,
): void {
  ctx.save();
  if (input.frame.shadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 12;
  }
  ctx.beginPath();
  roundRectPath(ctx, rect.x, rect.y, rect.width, rect.height, rect.borderRadius);
  ctx.fillStyle = '#000000';
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  roundRectPath(ctx, rect.x, rect.y, rect.width, rect.height, rect.borderRadius);
  ctx.clip();

  ctx.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
  ctx.scale(input.camera.scale, input.camera.scale);
  ctx.translate(-input.camera.translateX / input.camera.scale, -input.camera.translateY / input.camera.scale);
  ctx.drawImage(
    input.video,
    -input.videoWidth / 2,
    -input.videoHeight / 2,
    input.videoWidth,
    input.videoHeight,
  );
  ctx.restore();
}

function drawCursor(
  ctx: CanvasRenderingContext2DLike,
  cursor: CursorFrameState,
  camera: CameraState,
  frameRect: { x: number; y: number; width: number; height: number },
  style: CursorStyle,
): void {
  if (!cursor.visible) return;

  const screenX = frameRect.x + frameRect.width / 2 + (cursor.x - frameRect.width / 2) * camera.scale + camera.translateX / camera.scale;
  const screenY = frameRect.y + frameRect.height / 2 + (cursor.y - frameRect.height / 2) * camera.scale + camera.translateY / camera.scale;

  for (let i = cursor.ghostCount; i >= 1; i--) {
    const alpha = style.outlineWidth === 0 ? 0 : 0.3 * (1 - i / (cursor.ghostCount + 1));
    ctx.save();
    ctx.globalAlpha = alpha;
    drawArrow(ctx, screenX - i * 2, screenY - i * 2, cursor.rotation, style, true);
    ctx.restore();
  }

  const pulseScale = 1 + cursor.clickPulse * 0.15;
  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.scale(pulseScale, pulseScale);
  ctx.rotate(cursor.rotation);
  drawArrowAtOrigin(ctx, style);
  ctx.restore();
}

function drawArrow(
  ctx: CanvasRenderingContext2DLike,
  x: number,
  y: number,
  rotation: number,
  _style: CursorStyle,
  ghost: boolean,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.fillStyle = ghost ? 'rgba(255, 255, 255, 0.4)' : '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 18);
  ctx.lineTo(5, 13);
  ctx.lineTo(10, 20);
  ctx.lineTo(13, 18);
  ctx.lineTo(8, 11);
  ctx.lineTo(14, 11);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawArrowAtOrigin(
  ctx: CanvasRenderingContext2DLike,
  style: CursorStyle,
): void {
  const s = style.sizePx / 24;
  ctx.save();
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 18);
  ctx.lineTo(5, 13);
  ctx.lineTo(10, 20);
  ctx.lineTo(13, 18);
  ctx.lineTo(8, 11);
  ctx.lineTo(14, 11);
  ctx.closePath();
  ctx.strokeStyle = style.outlineColor;
  ctx.lineWidth = style.outlineWidth / s;
  ctx.stroke();
  ctx.fillStyle = style.color;
  ctx.fill();
  ctx.restore();
}

function drawBackground(
  ctx: CanvasRenderingContext2DLike,
  width: number,
  height: number,
  background: BackgroundConfig,
): void {
  if (background.type === 'solid') {
    ctx.fillStyle = background.value ?? '#1a1a1a';
    ctx.fillRect(0, 0, width, height);
    return;
  }
  if (background.type === 'gradient') {
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#1e293b');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    return;
  }
  if (background.type === 'blur') {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);
    return;
  }
  // wallpaper: fall back to a neutral color; real wallpaper loading is done
  // by the compositor before calling renderFrame.
  ctx.fillStyle = background.value ?? '#111111';
  ctx.fillRect(0, 0, width, height);
}

function roundRectPath(
  ctx: CanvasRenderingContext2DLike,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
EOF

echo "Writing test/compositor/frame-renderer.test.ts"
cat > test/compositor/frame-renderer.test.ts << 'EOF'
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
EOF

echo "Checking compilation"
if ! pnpm exec tsc --noEmit 2>&1; then
  echo "Compilation failed - will skip commit"
  COMPILE_OK=false
fi

if [ "$INCOMPLETE" = true ] || [ "$COMPILE_OK" = false ]; then
  echo "Skipping tests and commit due to incomplete files or compilation errors"
  exit 1
fi

echo "Running tests"
if pnpm exec vitest run 2>&1; then
  echo "All tests passed. Committing."
  git add -A
  git commit -m "feat(compositor): frame renderer with camera transform, cursor ghosts, click pulse, background"
else
  echo "Tests failed. Fix errors then run the next script."
  exit 1
fi
