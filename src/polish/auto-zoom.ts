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
  defaultDepth?: number;
}

export const DEFAULT_AUTO_ZOOM_CONFIG: Required<AutoZoomConfig> = {
  minDwellMs: 800,
  dwellRadiusPx: 100,
  minClickCluster: 2,
  clickClusterTimeMs: 3000,
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
  const merged = mergeRegions([...dwells, ...clicks]);

  return merged.map((r, i) => ({
    id: `zoom-${i + 1}`,
    startMs: r.startMs,
    endMs: r.endMs,
    focus: { cx: r.sumX / r.count, cy: r.sumY / r.count },
    depth: cfg.defaultDepth,
  }));
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
        endMs: lastT,
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
      regions.push({
        startMs: anchor.t,
        endMs: clicks[j - 1]!.t,
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
