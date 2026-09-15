export const MAX_CURSOR_GHOSTS = 5;
export const CURSOR_VELOCITY_THRESHOLD = 400;
export const CURSOR_VELOCITY_FOR_MAX_GHOSTS = 2400;
export const CURSOR_GHOST_BASE_ALPHA = 0.3;

export const ZOOM_VELOCITY_THRESHOLD = 200;
export const ZOOM_VELOCITY_FOR_MAX_BLUR = 2000;
export const MAX_ZOOM_BLUR_PX = 8;

export function computeCursorGhostCount(velocityPxPerSec: number): number {
  if (velocityPxPerSec <= CURSOR_VELOCITY_THRESHOLD) return 0;
  const t =
    (velocityPxPerSec - CURSOR_VELOCITY_THRESHOLD) /
    (CURSOR_VELOCITY_FOR_MAX_GHOSTS - CURSOR_VELOCITY_THRESHOLD);
  const clamped = Math.min(1, Math.max(0, t));
  return Math.round(clamped * MAX_CURSOR_GHOSTS);
}

export function computeCursorGhostAlpha(
  ghostIndex: number,
  totalGhosts: number,
): number {
  if (ghostIndex < 1 || ghostIndex > MAX_CURSOR_GHOSTS) return 0;
  if (totalGhosts <= 0) return 0;
  const t = (ghostIndex - 1) / totalGhosts;
  return CURSOR_GHOST_BASE_ALPHA * (1 - t);
}

export function computeZoomBlurRadius(velocity: number): number {
  if (velocity <= ZOOM_VELOCITY_THRESHOLD) return 0;
  const t =
    (velocity - ZOOM_VELOCITY_THRESHOLD) /
    (ZOOM_VELOCITY_FOR_MAX_BLUR - ZOOM_VELOCITY_THRESHOLD);
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * MAX_ZOOM_BLUR_PX;
}
