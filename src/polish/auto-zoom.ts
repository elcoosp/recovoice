import type {
  CursorEvent,
  CursorTelemetry,
  ZoomRegion,
} from '../types/recording.js';

export interface AutoZoomConfig {
  minDwellMs?: number;
  dwellRadiusPx?: number;
  minClickCluster?: number;
  clickClusterTimeMs?: number;
  minClickRegionMs?: number;
  maxDwellMs?: number;
  minRegionStartMs?: number;
  maxRegionMs?: number;
  minGapBetweenRegionsMs?: number;
  defaultDepth?: number;
}

export const DEFAULT_AUTO_ZOOM_CONFIG: Required<AutoZoomConfig> = {
  minDwellMs: 800,
  dwellRadiusPx: 100,
  minClickCluster: 1,
  clickClusterTimeMs: 3000,
  minClickRegionMs: 2400,
  maxDwellMs: 2600,
  minRegionStartMs: 2500,
  maxRegionMs: 3200,
  minGapBetweenRegionsMs: 500,
  defaultDepth: 1.5,
};

interface CursorSample {
  t: number;
  x: number;
  y: number;
}

interface RawRegion {
  startMs: number;
  endMs: number;
  points: CursorSample[];
  source: 'dwell' | 'click';
}

export function analyzeZoomRegions(
  telemetry: CursorTelemetry,
  config: AutoZoomConfig = {},
): ZoomRegion[] {
  const cfg = { ...DEFAULT_AUTO_ZOOM_CONFIG, ...config };
  if (telemetry.events.length === 0) return [];

  const dwells = findDwellRegions(telemetry.events, cfg);
  const clicks = findClickRegions(telemetry.events, cfg);
  const merged = postProcessRegions(mergeRegions([...dwells, ...clicks]), cfg);

  const { width, height } = telemetry.viewport ?? {
    width: 1280,
    height: 800,
  };

  const depth = cfg.defaultDepth;

  return merged.map((r, i) => {
    const focus = computeRegionFocus(r, cfg);
    return {
      id: `zoom-${i + 1}`,
      startMs: r.startMs,
      endMs: r.endMs,
      focus: clampFocusToViewport(focus, depth, width, height),
      depth,
    };
  });
}

/**
 * Clamp a focus point so the camera's visible rectangle at this depth stays
 * within the app viewport. A depth-1.5 zoomed view finds its edges at
 * width/(2*depth) and width - width/(2*depth). Without this, clusters near the
 * screen edges (e.g. cursor resting on the title bar at y=0) push the camera
 * so far past the edge that half the frame is empty void, which reads as
 * random or broken framing.
 */
export function clampFocusToViewport(
  focus: { cx: number; cy: number },
  depth: number,
  width: number,
  height: number,
): { cx: number; cy: number } {
  const safeDepth = Math.max(1, depth);
  const halfW = width / (2 * safeDepth);
  const halfH = height / (2 * safeDepth);
  return {
    cx: Math.min(Math.max(focus.cx, halfW), width - halfW),
    cy: Math.min(Math.max(focus.cy, halfH), height - halfH),
  };
}

/**
 * A merged region can blend cursor activity across several spatially separate
 * sites (e.g. clicking a rail button, opening a dialog, then typing in its
 * fields). Averaging all of those samples lands the camera in empty space
 * between the sites. Instead, focus on the spatial cluster that holds the
 * region's LAST interaction — that is where the user actually ended up
 * (e.g. the freshly opened dialog or the button they just pressed).
 */
function computeRegionFocus(
  r: RawRegion,
  cfg: Required<AutoZoomConfig>,
): { cx: number; cy: number } {
  const sorted = [...r.points].sort((a, b) => a.t - b.t);
  const radiusSq = cfg.dwellRadiusPx * cfg.dwellRadiusPx;
  const clusters: Array<{ sumX: number; sumY: number; count: number }> = [];
  let lastCluster = -1;

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]!;
    let placed = -1;
    for (let k = 0; k < clusters.length; k++) {
      const c = clusters[k]!;
      const dx = p.x - c.sumX / c.count;
      const dy = p.y - c.sumY / c.count;
      if (dx * dx + dy * dy <= radiusSq) {
        placed = k;
        break;
      }
    }
    if (placed >= 0) {
      clusters[placed]!.sumX += p.x;
      clusters[placed]!.sumY += p.y;
      clusters[placed]!.count += 1;
    } else {
      clusters.push({ sumX: p.x, sumY: p.y, count: 1 });
      placed = clusters.length - 1;
    }
    if (i === sorted.length - 1) lastCluster = placed;
  }

  const target = clusters[lastCluster] ?? clusters[0]!;
  return { cx: target.sumX / target.count, cy: target.sumY / target.count };
}

/**
 * Clamp region windows so the video opens at full view, no single zoom holds
 * forever, and consecutive zooms are separated by a visible identity gap.
 */
function postProcessRegions(
  regions: RawRegion[],
  cfg: Required<AutoZoomConfig>,
): RawRegion[] {
  const result: RawRegion[] = [];

  for (let i = 0; i < regions.length; i++) {
    let r = { ...regions[i]! };

    // Lead-in: no zoom before minRegionStartMs so the video opens unzoomed.
    r.startMs = Math.max(r.startMs, cfg.minRegionStartMs);
    // Cap total zoom window so the camera returns to full view.
    r.endMs = Math.min(r.endMs, r.startMs + cfg.maxRegionMs);

    if (r.endMs <= r.startMs) continue;

    // Enforce an identity gap against the previous region.
    const prev = result[result.length - 1];
    if (prev && r.startMs - prev.endMs < cfg.minGapBetweenRegionsMs) {
      r.startMs = prev.endMs + cfg.minGapBetweenRegionsMs;
      r.endMs = Math.max(r.startMs, Math.min(r.endMs, r.startMs + cfg.maxRegionMs));
      if (r.endMs <= r.startMs) continue;
    }

    result.push(r);
  }

  return result;
}

function findDwellRegions(
  events: CursorEvent[],
  cfg: Required<AutoZoomConfig>,
): RawRegion[] {
  const regions: RawRegion[] = [];
  const radiusSq = cfg.dwellRadiusPx * cfg.dwellRadiusPx;
  let i = 0;

  while (i < events.length) {
    const anchor = events[i]!;
    let j = i;
    let clusterCount = 0;
    let sumX = 0;
    let sumY = 0;
    let lastT = anchor.t;
    const points: CursorSample[] = [];

    while (j < events.length) {
      const e = events[j]!;
      const dx = e.x - anchor.x;
      const dy = e.y - anchor.y;
      if (dx * dx + dy * dy > radiusSq) break;
      sumX += e.x;
      sumY += e.y;
      clusterCount++;
      points.push({ t: e.t, x: e.x, y: e.y });
      lastT = e.t;
      j++;
    }

    if (
      clusterCount >= 2 &&
      lastT - anchor.t >= cfg.minDwellMs
    ) {
      regions.push({
        startMs: anchor.t,
        endMs: Math.min(lastT, anchor.t + cfg.maxDwellMs),
        points,
        source: 'dwell',
      });
      i = j;
    } else {
      i++;
    }
  }

  return regions;
}

function findClickRegions(
  events: CursorEvent[],
  cfg: Required<AutoZoomConfig>,
): RawRegion[] {
  const clicks = events.filter((e) => e.type === 'click');
  const regions: RawRegion[] = [];
  let i = 0;

  while (i < clicks.length) {
    const anchor = clicks[i]!;
    let j = i;
    let count = 0;
    const points: CursorSample[] = [];

    while (j < clicks.length) {
      const c = clicks[j]!;
      if (c.t - anchor.t > cfg.clickClusterTimeMs) break;
      points.push({ t: c.t, x: c.x, y: c.y });
      count++;
      j++;
    }

    if (count >= cfg.minClickCluster) {
      // Give even a single click a non-zero active window so the camera
      // actually zooms in and back out (zero-width regions never activate).
      const lastT = clicks[j - 1]!.t;
      regions.push({
        startMs: anchor.t,
        endMs: Math.min(
          Math.max(lastT, anchor.t + cfg.minClickRegionMs),
          anchor.t + cfg.maxRegionMs,
        ),
        points,
        source: 'click',
      });
      i = j;
    } else {
      i++;
    }
  }

  return regions;
}

function mergeRegions(regions: RawRegion[]): RawRegion[] {
  if (regions.length === 0) return [];
  const sorted = [...regions].sort((a, b) => a.startMs - b.startMs);
  const merged: RawRegion[] = [];
  let current = { ...sorted[0]! };

  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i]!;
    if (r.startMs <= current.endMs) {
      current.endMs = Math.max(current.endMs, r.endMs);
      current.points = [...current.points, ...r.points];
    } else {
      merged.push(current);
      current = { ...r };
    }
  }
  merged.push(current);
  return merged;
}
