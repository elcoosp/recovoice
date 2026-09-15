import type { ConnectedTransition, ZoomRegion } from '../types/recording.js';

export const CHAINED_ZOOM_PAN_GAP_MS = 1500;
export const CONNECTED_ZOOM_PAN_DURATION_MS = 1000;

export function findConnectedTransitions(
  regions: ZoomRegion[],
): ConnectedTransition[] {
  if (regions.length < 2) return [];
  const sorted = [...regions].sort((a, b) => a.startMs - b.startMs);
  const transitions: ConnectedTransition[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    const gap = b.startMs - a.endMs;
    if (gap < CHAINED_ZOOM_PAN_GAP_MS) {
      transitions.push({
        fromRegion: a,
        toRegion: b,
        panStartMs: a.endMs,
        panEndMs: a.endMs + CONNECTED_ZOOM_PAN_DURATION_MS,
      });
    }
  }

  return transitions;
}
