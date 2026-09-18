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
  minClickRegionMs: 1200,
  maxDwellMs: 1800,
  minRegionStartMs: 1500,
  maxRegionMs: 2600,
  minGapBetweenRegionsMs: 0,
  defaultDepth: 1.5,
};

interface RawRegion {
  startMs: number;
  endMs: number;
  sumX: number;
  sumY: number;
  count: number;
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

  return merged.map((r, i) => ({
    id: `zoom-${i + 1}`,
    startMs: r.startMs,
    endMs: r.endMs,
    focus: {
      cx: Math.min(width, Math.max(0, r.sumX / r.count)),
      cy: Math.min(height, Math.max(0, r.sumY / r.count)),
    },
    depth: cfg.defaultDepth,
  }));
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

    while (j < events.length) {
      const e = events[j]!;
      const dx = e.x - anchor.x;
      const dy = e.y - anchor.y;
      if (dx * dx + dy * dy > radiusSq) break;
      sumX += e.x;
      sumY += e.y;
      clusterCount++;
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
        sumX,
        sumY,
        count: clusterCount,
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
    let sumX = 0;
    let sumY = 0;
    let count = 0;

    while (j < clicks.length) {
      const c = clicks[j]!;
      if (c.t - anchor.t > cfg.clickClusterTimeMs) break;
      sumX += c.x;
      sumY += c.y;
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
        sumX,
        sumY,
        count,
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
      current.sumX += r.sumX;
      current.sumY += r.sumY;
      current.count += r.count;
    } else {
      merged.push(current);
      current = { ...r };
    }
  }
  merged.push(current);
  return merged;
}
