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
    expect(r.focus.cx).toBe(VIEWPORT.width / 3);
    expect(r.focus.cy).toBe(VIEWPORT.height / 3);
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
    expect(r.focus).toEqual({ cx: 800, cy: 800 - 800 / 3 });
  });

  it('caps dwell regions so long parked waits release the zoom', () => {
    const events: CursorTelemetry['events'] = [];
    for (let t = 0; t <= 10000; t += 100) {
      events.push({ t, x: 400, y: 300, type: 'move' });
    }
    const regions = analyzeZoomRegions(telemetry(events), {
      maxDwellMs: 2000,
      minRegionStartMs: 0,
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
    expect(r.focus.cx).toBe(VIEWPORT.width / 3);
    expect(r.focus.cy).toBeGreaterThan(290);
    expect(r.focus.cy).toBeLessThan(310);
  });

  it('zooms on a single click by default', () => {
    const events: CursorTelemetry['events'] = [
      { t: 0, x: 400, y: 300, type: 'click' },
    ];
    const regions = analyzeZoomRegions(telemetry(events), {
      minRegionStartMs: 0,
    });
    expect(regions).toHaveLength(1);
    expect(regions[0]!.focus).toEqual({ cx: 1280 / 3, cy: 300 });
  });

  it('keeps the camera view inside the viewport for edge clusters', () => {
    const events: CursorTelemetry['events'] = [{ t: 0, x: 30, y: 20, type: 'click' }];
    const regions = analyzeZoomRegions(telemetry(events), {
      minRegionStartMs: 0,
    });
    expect(regions).toHaveLength(1);
    expect(regions[0]!.focus).toEqual({
      cx: VIEWPORT.width / 3,
      cy: VIEWPORT.height / 3,
    });
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

  it('focuses on the opened dialog, not the screen-spanning centroid, when a modal opens (workflow begin)', () => {
    const events: CursorTelemetry['events'] = [];
    // dwell over the "Workflow" rail button (bottom-right) before clicking it
    for (let t = 62000; t <= 62890; t += 90) {
      events.push({ t, x: 1185, y: 720, type: 'move' });
    }
    events.push({ t: 62898, x: 1183, y: 746, type: 'click' });
    // click "New" in the top-right panel header; the dialog opens centered
    events.push({ t: 64015, x: 1120, y: 20, type: 'click' });
    // dwell + type into the dialog's name field (screen center)
    for (let t = 64660; t <= 65900; t += 80) {
      events.push({ t, x: 600, y: 307, type: 'move' });
    }
    const regions = analyzeZoomRegions(telemetry(events), {
      viewport: { width: 1200, height: 800 },
    });
    expect(regions.length).toBeGreaterThanOrEqual(1);
    const r = regions[0]!;
    expect(r.focus.cx).toBeGreaterThan(540);
    expect(r.focus.cx).toBeLessThan(680);
    expect(r.focus.cy).toBeGreaterThan(250);
    expect(r.focus.cy).toBeLessThan(380);
  });

  it('centers on the dialog buttons when edits strike two distant rows (workflow save/edit/cancel)', () => {
    const events: CursorTelemetry['events'] = [];
    for (let t = 66480; t <= 67790; t += 80) {
      events.push({ t, x: 772, y: 561, type: 'move' });
    }
    events.push({ t: 66592, x: 773, y: 592, type: 'click' });
    events.push({ t: 68145, x: 1075, y: 104, type: 'click' });
    for (let t = 67890; t <= 68960; t += 80) {
      events.push({ t, x: 1063, y: 131, type: 'move' });
    }
    events.push({ t: 69244, x: 701, y: 592, type: 'click' });
    const regions = analyzeZoomRegions(telemetry(events), {
      viewport: { width: 1200, height: 800 },
    });
    expect(regions.length).toBeGreaterThanOrEqual(1);
    const r = regions[0]!;
    expect(r.focus.cx).toBeGreaterThan(680);
    expect(r.focus.cx).toBeLessThan(830);
    expect(r.focus.cy).toBe(800 - 800 / 3);
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
