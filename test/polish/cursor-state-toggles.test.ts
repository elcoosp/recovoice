import { describe, it, expect } from 'vitest';
import { CursorStateComputer } from '../../src/polish/cursor-state.js';
import type { CursorTelemetry } from '../../src/types/recording.js';

function telemetry(events: CursorTelemetry['events']): CursorTelemetry {
  return { events, timebaseOrigin: 0, viewport: { width: 1280, height: 800 } };
}

const FAST_MOVE: CursorTelemetry = telemetry([
  { t: 0, x: 0, y: 0, type: 'move' },
  { t: 16, x: 2000, y: 0, type: 'move' },
  { t: 500, x: 2000, y: 0, type: 'click' },
]);

describe('CursorStateComputer toggles', () => {
  it('disables sway when disableSway is set', () => {
    const c = new CursorStateComputer(FAST_MOVE, {
      smoothingFactor: 0,
      disableSway: true,
    });
    for (let t = 0; t <= 200; t += 16) c.computeAt(t);
    const state = c.computeAt(216);
    expect(state.rotation).toBe(0);
  });

  it('produces nonzero sway when not disabled', () => {
    const c = new CursorStateComputer(FAST_MOVE, { smoothingFactor: 0 });
    for (let t = 0; t <= 100; t += 16) c.computeAt(t);
    const state = c.computeAt(116);
    expect(Math.abs(state.rotation)).toBeGreaterThan(0);
  });

  it('disables ghost trail when disableMotionBlur is set', () => {
    const c = new CursorStateComputer(FAST_MOVE, {
      smoothingFactor: 0,
      disableMotionBlur: true,
    });
    const state = c.computeAt(16);
    expect(state.ghostCount).toBe(0);
  });

  it('disables click pulse when disableClickPulse is set', () => {
    const c = new CursorStateComputer(FAST_MOVE, {
      smoothingFactor: 0,
      disableClickPulse: true,
    });
    for (let t = 0; t <= 500; t += 16) c.computeAt(t);
    const state = c.computeAt(520);
    expect(state.clickPulse).toBe(0);
  });
});
