import { describe, it, expect } from 'vitest';
import {
  CursorStateComputer,
  type CursorFrameState,
} from '../../src/polish/cursor-state.js';
import type { CursorTelemetry } from '../../src/types/recording.js';

function telemetry(events: CursorTelemetry['events']): CursorTelemetry {
  return { events, timebaseOrigin: 0, viewport: { width: 1280, height: 800 } };
}

describe('CursorStateComputer', () => {
  it('returns zero state when there are no events', () => {
    const c = new CursorStateComputer(telemetry([]), { smoothingFactor: 0.3 });
    const state = c.computeAt(0);
    expect(state.visible).toBe(false);
  });

  it('is visible after the first event', () => {
    const c = new CursorStateComputer(
      telemetry([{ t: 100, x: 100, y: 100, type: 'move' }]),
      { smoothingFactor: 0.3 },
    );
    const state = c.computeAt(200);
    expect(state.visible).toBe(true);
    expect(state.x).toBeGreaterThan(0);
    expect(state.y).toBeGreaterThan(0);
  });

  it('smooths cursor motion — smoothed path lags raw path', () => {
    const c = new CursorStateComputer(
      telemetry([
        { t: 0, x: 0, y: 0, type: 'move' },
        { t: 16, x: 100, y: 0, type: 'move' },
        { t: 32, x: 200, y: 0, type: 'move' },
      ]),
      { smoothingFactor: 0.9 },
    );
    // Advance one frame
    const state = c.computeAt(16);
    // With strong smoothing, cursor should be less than the raw 100
    expect(state.x).toBeLessThan(100);
    expect(state.x).toBeGreaterThan(0);
  });

  it('converges toward the raw cursor over time', () => {
    const c = new CursorStateComputer(
      telemetry([
        { t: 0, x: 0, y: 0, type: 'move' },
        { t: 16, x: 500, y: 0, type: 'move' },
      ]),
      { smoothingFactor: 0.3 },
    );
    for (let t = 16; t <= 2000; t += 16) c.computeAt(t);
    const state = c.computeAt(2016);
    expect(Math.abs(state.x - 500)).toBeLessThan(50);
  });

  it('reports rotation bounded by MAX_ROTATION', () => {
    const c = new CursorStateComputer(
      telemetry([
        { t: 0, x: 0, y: 0, type: 'move' },
        { t: 16, x: 2000, y: 0, type: 'move' },
      ]),
      { smoothingFactor: 0 },
    );
    for (let t = 16; t <= 100; t += 16) c.computeAt(t);
    const state = c.computeAt(116);
    expect(Math.abs(state.rotation)).toBeLessThanOrEqual(Math.PI / 18 + 1e-6);
  });

  it('reports ghost count proportional to velocity', () => {
    const c = new CursorStateComputer(
      telemetry([
        { t: 0, x: 0, y: 0, type: 'move' },
        { t: 16, x: 2000, y: 0, type: 'move' },
      ]),
      { smoothingFactor: 0 },
    );
    const state = c.computeAt(16);
    expect(state.ghostCount).toBeGreaterThan(0);
  });

  it('reports click bounce active during the click pulse', () => {
    const c = new CursorStateComputer(
      telemetry([
        { t: 0, x: 100, y: 100, type: 'move' },
        { t: 500, x: 100, y: 100, type: 'click' },
      ]),
      { smoothingFactor: 0.3 },
    );
    for (let t = 0; t <= 500; t += 16) c.computeAt(t);
    const stateDuring = c.computeAt(530);
    expect(stateDuring.clickPulse).toBeGreaterThan(0);
  });

  it('returns a serializable state', () => {
    const c = new CursorStateComputer(
      telemetry([{ t: 0, x: 100, y: 100, type: 'move' }]),
      { smoothingFactor: 0.3 },
    );
    const state: CursorFrameState = c.computeAt(16);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
