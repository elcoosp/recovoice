import { describe, it, expect } from 'vitest';
import { CursorStateComputer } from '../../src/polish/cursor-state.js';
import { scheduleFrames } from '../../src/polish/frame-scheduler.js';
import type { CursorTelemetry } from '../../src/types/recording.js';

const VIEWPORT = { width: 1280, height: 800 };

function telemetry(events: CursorTelemetry['events']): CursorTelemetry {
  return { events, timebaseOrigin: 0, viewport: VIEWPORT };
}

describe('disableSmoothing', () => {
  it('uses raw cursor positions when smoothing is disabled', () => {
    const tel = telemetry([
      { t: 0, x: 0, y: 0, type: 'move' },
      { t: 16, x: 100, y: 0, type: 'move' },
      { t: 32, x: 200, y: 0, type: 'move' },
    ]);
    const c = new CursorStateComputer(tel, {
      smoothingFactor: 0.9,
      disableSmoothing: true,
    });
    c.computeAt(0);
    const state = c.computeAt(16);
    expect(state.x).toBe(100);
  });

  it('still produces smoothed motion when smoothing is enabled', () => {
    const tel = telemetry([
      { t: 0, x: 0, y: 0, type: 'move' },
      { t: 16, x: 100, y: 0, type: 'move' },
    ]);
    const c = new CursorStateComputer(tel, { smoothingFactor: 0.9 });
    c.computeAt(0);
    const state = c.computeAt(16);
    expect(state.x).toBeLessThan(100);
  });

  it('propagates disableSmoothing through scheduleFrames', () => {
    const tel = telemetry([
      { t: 0, x: 0, y: 0, type: 'move' },
      { t: 100, x: 500, y: 500, type: 'move' },
    ]);
    const schedules = Array.from(
      scheduleFrames({
        durationMs: 200,
        fps: 30,
        viewport: VIEWPORT,
        telemetry: tel,
        zoomRegions: [],
        transitions: [],
        smoothingFactor: 0.9,
        disableSmoothing: true,
      }),
    );
    const atOrAfter = schedules.find((s) => s.tMs >= 100);
    expect(atOrAfter).toBeDefined();
    expect(atOrAfter!.cursor.x).toBe(500);
  });
});
