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
