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
  /** Zoom motion blur radius in px; 0 disables. */
  zoomBlurRadius?: number;
  /**
   * Pre-loaded wallpaper image (from napi-canvas loadImage). When
   * background.type is "wallpaper" or "blur", this image is drawn as the
   * background, covering the canvas.
   */
  wallpaper?: unknown;
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

  drawBackground(ctx, width, height, input.background, input.wallpaper);

  const rect = computeFrameRect(canvas, input);
  drawFrame(ctx, input, rect);
  drawCursor(ctx, input, rect);
}

interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
  baseScale: number;
}

function computeFrameRect(
  canvas: CanvasLike,
  input: RenderFrameInput,
): FrameRect {
  const padding = input.frame.padding;
  const availableWidth = canvas.width - padding * 2;
  const availableHeight = canvas.height - padding * 2;
  const videoAspect = input.videoWidth / input.videoHeight;
  const availableAspect = availableWidth / availableHeight;

  let drawWidth: number;
  let drawHeight: number;
  if (videoAspect > availableAspect) {
    drawWidth = availableWidth;
    drawHeight = availableWidth / videoAspect;
  } else {
    drawHeight = availableHeight;
    drawWidth = availableHeight * videoAspect;
  }
  const x = (canvas.width - drawWidth) / 2;
  const y = (canvas.height - drawHeight) / 2;
  const baseScale = drawWidth / input.videoWidth;

  return { x, y, width: drawWidth, height: drawHeight, baseScale };
}

function drawFrame(
  ctx: CanvasRenderingContext2DLike,
  input: RenderFrameInput,
  rect: FrameRect,
): void {
  // Shadow layer
  ctx.save();
  if (input.frame.shadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 12;
  }
  ctx.beginPath();
  roundRectPath(
    ctx,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    input.frame.borderRadius,
  );
  ctx.fillStyle = '#000000';
  ctx.fill();
  ctx.restore();

  // Frame content
  ctx.save();
  ctx.beginPath();
  roundRectPath(
    ctx,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    input.frame.borderRadius,
  );
  ctx.clip();

  const zoomBlur = input.zoomBlurRadius ?? 0;
  if (zoomBlur > 0.1) {
    ctx.filter = `blur(${zoomBlur.toFixed(2)}px)`;
  }

  const { camera } = input;
  const totalScale = rect.baseScale * camera.scale;

  // Focus point in viewport coordinates, recovered from camera state:
  //   translateX = (viewport.width/2 - focus.cx) * camera.scale
  // so  focus.cx = viewport.width/2 - translateX / camera.scale
  const focusX =
    input.videoWidth / 2 - camera.translateX / camera.scale;
  const focusY =
    input.videoHeight / 2 - camera.translateY / camera.scale;

  ctx.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
  ctx.scale(totalScale, totalScale);
  ctx.translate(-focusX, -focusY);
  ctx.drawImage(
    input.video,
    0,
    0,
    input.videoWidth,
    input.videoHeight,
  );
  ctx.filter = 'none';
  ctx.restore();
}

function drawCursor(
  ctx: CanvasRenderingContext2DLike,
  input: RenderFrameInput,
  rect: FrameRect,
): void {
  const { cursor, camera } = input;
  if (!cursor.visible) return;

  // Cursor positions are in viewport coordinates. Apply the same transform
  // as the video: center of frame, scale, then shift by -focus.
  const totalScale = rect.baseScale * camera.scale;
  const focusX = input.videoWidth / 2 - camera.translateX / camera.scale;
  const focusY = input.videoHeight / 2 - camera.translateY / camera.scale;
  const screenX =
    rect.x + rect.width / 2 + (cursor.x - focusX) * totalScale;
  const screenY =
    rect.y + rect.height / 2 + (cursor.y - focusY) * totalScale;

  const style = input.cursorStyle ?? DEFAULT_CURSOR_STYLE;

  // Ghost trail behind the cursor
  for (let i = cursor.ghostCount; i >= 1; i--) {
    const alpha = 0.3 * (1 - i / (cursor.ghostCount + 1));
    ctx.save();
    ctx.globalAlpha = alpha;
    drawArrow(
      ctx,
      screenX - i * 3,
      screenY - i * 3,
      cursor.rotation,
      style,
    );
    ctx.restore();
  }

  // Main cursor with click pulse
  const pulseScale = 1 + cursor.clickPulse * 0.15;
  ctx.save();
  ctx.globalAlpha = 1;
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
  style: CursorStyle,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.fillStyle = style.ghostColor;
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
  wallpaper: unknown | undefined,
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
  if ((background.type === 'wallpaper' || background.type === 'blur') && wallpaper) {
    ctx.save();
    if (background.type === 'blur') {
      ctx.filter = 'blur(24px)';
      // Scale up slightly so the blur doesn't reveal edges
      const scale = 1.08;
      const offsetX = -((scale - 1) * width) / 2;
      const offsetY = -((scale - 1) * height) / 2;
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);
    }
    ctx.drawImage(wallpaper, 0, 0, width, height);
    ctx.restore();
    // Blur mode dims the wallpaper to make the frame pop
    if (background.type === 'blur') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(0, 0, width, height);
    }
    return;
  }
  ctx.fillStyle = background.value ?? '#0a0a0a';
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
