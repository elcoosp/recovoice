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
    const regions = analyzeZoomRegions(telemetry(events));
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
    const regions = analyzeZoomRegions(telemetry(events));
    expect(regions.length).toBeGreaterThanOrEqual(1);
    const r = regions[0]!;
    expect(r.focus.cx).toBeGreaterThan(390);
    expect(r.focus.cx).toBeLessThan(415);
  });

  it('does not zoom on a single click', () => {
    const events: CursorTelemetry['events'] = [
      { t: 0, x: 400, y: 300, type: 'click' },
    ];
    expect(analyzeZoomRegions(telemetry(events))).toEqual([]);
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
    const regions = analyzeZoomRegions(telemetry(events));
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
