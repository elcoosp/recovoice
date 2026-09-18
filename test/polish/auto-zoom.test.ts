import { describe, it, expect } from 'vitest';
import {
  analyzeZoomRegions,
  DEFAULT_AUTO_ZOOM_CONFIG,
} from '../../src/polish/auto-zoom.js';
import type { CursorTelemetry } from '../../src/types/recording.js';

const VIEWPORT = { width: 1280, height: 800 };

function telemetry(events: CursorTelemetry['events']): CursorTelemetry {
  return {
    events,
    timebaseOrigin: 0,
    viewport: VIEWPORT,
  };
}

describe('analyzeZoomRegions', () => {
  it('returns empty array for empty telemetry', () => {
    expect(analyzeZoomRegions(telemetry([]))).toEqual([]);
  });

  it('produces a zoom region on a dwell of minDwellMs within dwellRadiusPx', () => {
    const events: CursorTelemetry['events'] = [
      { t: 0, x: 100, y: 100, type: 'move' },
      { t: 100, x: 110, y: 105, type: 'move' },
      { t: 300, x: 105, y: 100, type: 'move' },
      { t: 600, x: 100, y: 100, type: 'move' },
      { t: 900, x: 102, y: 100, type: 'move' },
      { t: 1200, x: 500, y: 400, type: 'move' },
    ];
    const regions = analyzeZoomRegions(telemetry(events), {
      minRegionStartMs: 0,
    });
    expect(regions).toHaveLength(1);
    const r = regions[0]!;
    expect(r.startMs).toBeLessThanOrEqual(0);
    expect(r.endMs).toBeGreaterThanOrEqual(900);
    expect(r.focus.cx).toBeGreaterThan(90);
    expect(r.focus.cx).toBeLessThan(120);
    expect(r.focus.cy).toBeGreaterThan(90);
    expect(r.focus.cy).toBeLessThan(120);
    expect(r.depth).toBe(DEFAULT_AUTO_ZOOM_CONFIG.defaultDepth);
  });

  it('skips zooms inside the opening lead-in so the video opens at full view', () => {
    const events: CursorTelemetry['events'] = [
      { t: 0, x: 400, y: 300, type: 'click' },
      { t: 5000, x: 800, y: 600, type: 'click' },
    ];
    const regions = analyzeZoomRegions(telemetry(events));
    expect(regions).toHaveLength(1);
    const r = regions[0]!;
    expect(r.startMs).toBeGreaterThanOrEqual(
      DEFAULT_AUTO_ZOOM_CONFIG.minRegionStartMs,
    );
    expect(r.focus).toEqual({ cx: 800, cy: 600 });
  });

  it('caps dwell regions so long parked waits release the zoom', () => {
    const events: CursorTelemetry['events'] = [];
    for (let t = 0; t <= 10000; t += 100) {
      events.push({ t, x: 400, y: 300, type: 'move' });
    }
    const regions = analyzeZoomRegions(telemetry(events), {
      maxDwellMs: 2000,
    });
    expect(regions).toHaveLength(1);
    expect(regions[0]!.endMs - regions[0]!.startMs).toBeLessThanOrEqual(2000);
  });

  it('caps merged region length to maxRegionMs', () => {
    const events: CursorTelemetry['events'] = [];
    for (let t = 0; t <= 10000; t += 100) {
      events.push({ t, x: 400, y: 300, type: 'move' });
    }
    const regions = analyzeZoomRegions(telemetry(events), {
      maxDwellMs: 30000,
      minRegionStartMs: 0,
      maxRegionMs: 3000,
    });
    expect(regions).toHaveLength(1);
    expect(regions[0]!.endMs - regions[0]!.startMs).toBeLessThanOrEqual(3000);
  });

  it('enforces a minimum identity gap between regions', () => {
    const events: CursorTelemetry['events'] = [
      { t: 0, x: 400, y: 300, type: 'click' },
      { t: 1400, x: 800, y: 600, type: 'click' },
    ];
    const regions = analyzeZoomRegions(telemetry(events), {
      clickClusterTimeMs: 400,
      minClickRegionMs: 1200,
      minRegionStartMs: 0,
      minGapBetweenRegionsMs: 1000,
    });
    expect(regions.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < regions.length; i++) {
      expect(regions[i]!.startMs - regions[i - 1]!.endMs).toBeGreaterThanOrEqual(
        1000,
      );
    }
  });

  it('does not zoom on rapid passes without dwell', () => {
    const events: CursorTelemetry['events'] = [
      { t: 0, x: 100, y: 100, type: 'move' },
      { t: 50, x: 400, y: 400, type: 'move' },
      { t: 100, x: 900, y: 700, type: 'move' },
    ];
    expect(analyzeZoomRegions(telemetry(events))).toEqual([]);
  });

  it('produces a zoom region on a click cluster', () => {
    const events: CursorTelemetry['events'] = [
      { t: 0, x: 400, y: 300, type: 'click' },
      { t: 400, x: 405, y: 302, type: 'click' },
      { t: 800, x: 402, y: 298, type: 'click' },
    ];
    const regions = analyzeZoomRegions(telemetry(events), {
      minRegionStartMs: 0,
    });
    expect(regions.length).toBeGreaterThanOrEqual(1);
    const r = regions[0]!;
    expect(r.focus.cx).toBeGreaterThan(390);
    expect(r.focus.cx).toBeLessThan(415);
  });

  it('zooms on a single click by default', () => {
    const events: CursorTelemetry['events'] = [
      { t: 0, x: 400, y: 300, type: 'click' },
    ];
    const regions = analyzeZoomRegions(telemetry(events), {
      minRegionStartMs: 0,
    });
    expect(regions).toHaveLength(1);
    expect(regions[0]!.focus).toEqual({ cx: 400, cy: 300 });
  });

  it('respects custom minDwellMs', () => {
    const events: CursorTelemetry['events'] = [
      { t: 0, x: 100, y: 100, type: 'move' },
      { t: 200, x: 102, y: 100, type: 'move' },
      { t: 400, x: 101, y: 100, type: 'move' },
      { t: 500, x: 500, y: 500, type: 'move' },
    ];
    const regions = analyzeZoomRegions(telemetry(events), {
      minDwellMs: 200,
      minRegionStartMs: 0,
    });
    expect(regions.length).toBeGreaterThanOrEqual(1);
  });

  it('respects custom defaultDepth', () => {
    const events: CursorTelemetry['events'] = [
      { t: 0, x: 100, y: 100, type: 'move' },
      { t: 300, x: 100, y: 100, type: 'move' },
      { t: 900, x: 100, y: 100, type: 'move' },
      { t: 1200, x: 500, y: 400, type: 'move' },
    ];
    const regions = analyzeZoomRegions(telemetry(events), {
      defaultDepth: 2.5,
      minRegionStartMs: 0,
    });
    expect(regions[0]!.depth).toBe(2.5);
  });

  it('merges overlapping dwell and click regions', () => {
    const events: CursorTelemetry['events'] = [
      { t: 0, x: 400, y: 300, type: 'move' },
      { t: 200, x: 400, y: 300, type: 'move' },
      { t: 400, x: 402, y: 300, type: 'click' },
      { t: 500, x: 405, y: 300, type: 'click' },
      { t: 600, x: 400, y: 300, type: 'move' },
      { t: 800, x: 400, y: 300, type: 'move' },
      { t: 1000, x: 400, y: 300, type: 'move' },
      { t: 1200, x: 800, y: 600, type: 'move' },
    ];
    const regions = analyzeZoomRegions(telemetry(events), {
      minRegionStartMs: 0,
    });
    expect(regions).toHaveLength(1);
  });

  it('assigns unique IDs to each region', () => {
    const events: CursorTelemetry['events'] = [
      { t: 0, x: 100, y: 100, type: 'move' },
      { t: 1000, x: 100, y: 100, type: 'move' },
      { t: 1500, x: 800, y: 600, type: 'move' },
      { t: 2000, x: 800, y: 600, type: 'move' },
      { t: 3500, x: 800, y: 600, type: 'move' },
      { t: 4000, x: 200, y: 200, type: 'move' },
    ];
    const regions = analyzeZoomRegions(telemetry(events));
    const ids = new Set(regions.map((r) => r.id));
    expect(ids.size).toBe(regions.length);
  });
});
