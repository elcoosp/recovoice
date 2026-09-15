import type {
  ConnectedTransition,
  ZoomRegion,
} from '../types/recording.js';
import { easeInOutCubic, easeConnectedPan, linear } from './easing.js';

export const ZOOM_IN_DURATION_MS = 600;
export const ZOOM_OUT_DURATION_MS = 400;

export interface CameraState {
  scale: number;
  translateX: number;
  translateY: number;
}

export interface ComputeCameraStateInput {
  zoomRegions: ZoomRegion[];
  transitions: ConnectedTransition[];
  tMs: number;
  viewport: { width: number; height: number };
}

export function computeCameraState(
  input: ComputeCameraStateInput,
): CameraState {
  const { zoomRegions, transitions, tMs, viewport } = input;

  if (zoomRegions.length === 0) return identity();

  const transition = transitions.find(
    (tr) => tMs >= tr.panStartMs && tMs < tr.panEndMs,
  );
  if (transition) {
    return computeConnectedPan(transition, tMs, viewport);
  }

  const active = zoomRegions.find(
    (r) => tMs >= r.startMs && tMs < r.endMs,
  );
  if (active) {
    const scale = computeActiveScale(active, tMs);
    return focusToCamera(active.focus, scale, viewport);
  }

  const justEnded = zoomRegions.find(
    (r) => tMs >= r.endMs && tMs < r.endMs + ZOOM_OUT_DURATION_MS,
  );
  if (justEnded) {
    const t = (tMs - justEnded.endMs) / ZOOM_OUT_DURATION_MS;
    const progress = easeInOutCubic(t);
    const from = focusToCamera(justEnded.focus, justEnded.depth, viewport);
    const to = identity();
    return lerpState(from, to, progress);
  }

  return identity();
}

function computeActiveScale(region: ZoomRegion, tMs: number): number {
  const elapsed = tMs - region.startMs;
  const regionDuration = region.endMs - region.startMs;
  const zoomInDuration = Math.min(
    ZOOM_IN_DURATION_MS,
    Math.max(1, regionDuration / 2),
  );
  if (elapsed >= zoomInDuration) return region.depth;
  const t = elapsed / zoomInDuration;
  const progress = easeInOutCubic(t);
  return 1 + (region.depth - 1) * progress;
}

function computeConnectedPan(
  transition: ConnectedTransition,
  tMs: number,
  viewport: { width: number; height: number },
): CameraState {
  const from = focusToCamera(
    transition.fromRegion.focus,
    transition.fromRegion.depth,
    viewport,
  );
  const to = focusToCamera(
    transition.toRegion.focus,
    transition.toRegion.depth,
    viewport,
  );
  const duration = transition.panEndMs - transition.panStartMs;
  const t = duration <= 0 ? 1 : (tMs - transition.panStartMs) / duration;
  const progress = easeConnectedPan(t);
  return lerpState(from, to, progress);
}

function focusToCamera(
  focus: { cx: number; cy: number },
  scale: number,
  viewport: { width: number; height: number },
): CameraState {
  const centerX = viewport.width / 2;
  const centerY = viewport.height / 2;
  // Pan the camera so that the focus point moves to viewport center
  const translateX = centerX - focus.cx;
  const translateY = centerY - focus.cy;
  // Scaled translation keeps the focus at the same visual position
  return {
    scale,
    translateX: translateX * scale,
    translateY: translateY * scale,
  };
}

function identity(): CameraState {
  return { scale: 1, translateX: 0, translateY: 0 };
}

function lerpState(a: CameraState, b: CameraState, t: number): CameraState {
  return {
    scale: a.scale + (b.scale - a.scale) * t,
    translateX: a.translateX + (b.translateX - a.translateX) * t,
    translateY: a.translateY + (b.translateY - a.translateY) * t,
  };
}

export { linear as _linear };
