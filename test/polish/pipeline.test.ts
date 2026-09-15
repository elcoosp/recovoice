import { describe, it, expect } from 'vitest';
import { analyzePolishing } from '../../src/polish/pipeline.js';
import type { CursorTelemetry } from '../../src/types/recording.js';

const viewport = { width: 1280, height: 800 };

function telemetry(events: CursorTelemetry['events']): CursorTelemetry {
  return { events, timebaseOrigin: 0, viewport };
}

describe('analyzePolishing', () => {
  it('returns empty analysis when no telemetry', () => {
    const analysis = analyzePolishing(telemetry([]), {});
    expect(analysis.zoomRegions).toEqual([]);
    expect(analysis.transitions).toEqual([]);
  });

  it('returns zoom regions from the analyzer', () => {
    const analysis = analyzePolishing(
      telemetry([
        { t: 0, x: 100, y: 100, type: 'move' },
        { t: 300, x: 100, y: 100, type: 'move' },
        { t: 900, x: 100, y: 100, type: 'move' },
        { t: 1200, x: 500, y: 400, type: 'move' },
      ]),
      {},
    );
    expect(analysis.zoomRegions.length).toBeGreaterThanOrEqual(1);
  });

  it('returns connected transitions when regions are close', () => {
    const analysis = analyzePolishing(
      telemetry([
        { t: 0, x: 100, y: 100, type: 'move' },
        { t: 900, x: 100, y: 100, type: 'move' },
        { t: 1200, x: 100, y: 100, type: 'move' },
        { t: 2000, x: 900, y: 600, type: 'move' },
        { t: 2900, x: 900, y: 600, type: 'move' },
        { t: 3200, x: 900, y: 600, type: 'move' },
      ]),
      {},
    );
    expect(analysis.zoomRegions.length).toBeGreaterThanOrEqual(2);
    expect(analysis.transitions.length).toBeGreaterThanOrEqual(1);
  });

  it('produces no zoom regions when auto-zoom is disabled', () => {
    const analysis = analyzePolishing(
      telemetry([
        { t: 0, x: 100, y: 100, type: 'move' },
        { t: 900, x: 100, y: 100, type: 'move' },
        { t: 1200, x: 500, y: 400, type: 'move' },
      ]),
      { autoZoom: false },
    );
    expect(analysis.zoomRegions).toEqual([]);
  });

  it('produces no transitions when connected transitions are disabled', () => {
    const analysis = analyzePolishing(
      telemetry([
        { t: 0, x: 100, y: 100, type: 'move' },
        { t: 900, x: 100, y: 100, type: 'move' },
        { t: 1200, x: 100, y: 100, type: 'move' },
        { t: 2000, x: 900, y: 600, type: 'move' },
        { t: 2900, x: 900, y: 600, type: 'move' },
        { t: 3200, x: 900, y: 600, type: 'move' },
      ]),
      { connectedTransitions: false },
    );
    expect(analysis.transitions).toEqual([]);
    expect(analysis.zoomRegions.length).toBeGreaterThanOrEqual(2);
  });

  it('respects custom autoZoom parameters', () => {
    const analysis = analyzePolishing(
      telemetry([
        { t: 0, x: 100, y: 100, type: 'move' },
        { t: 400, x: 100, y: 100, type: 'move' },
        { t: 900, x: 100, y: 100, type: 'move' },
        { t: 1200, x: 500, y: 400, type: 'move' },
      ]),
      { autoZoom: { defaultDepth: 3 } },
    );
    expect(analysis.zoomRegions.length).toBeGreaterThanOrEqual(1);
    expect(analysis.zoomRegions[0]!.depth).toBe(3);
  });
});
