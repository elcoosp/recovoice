import { describe, it, expect } from 'vitest';
import { CursorStateComputer } from '../../src/polish/cursor-state.js';
import type { CursorTelemetry, CursorEvent } from '../../src/types/recording.js';

function telemetry(events: CursorEvent[]): CursorTelemetry {
  return {
    events,
    timebaseOrigin: 0,
    viewport: { width: 800, height: 600 },
  };
}

describe('CursorStateComputer click landing', () => {
  it('pins the cursor to the clicked position exactly', () => {
    const computer = new CursorStateComputer(
      telemetry([
        { t: 0, x: 0, y: 0, type: 'move' },
        { t: 200, x: 400, y: 400, type: 'move' },
        { t: 210, x: 300, y: 300, type: 'click' },
      ]),
      { smoothingFactor: 0.3 },
    );

    // Mid-glide before the arrival move resolves.
    computer.computeAt(0);
    computer.computeAt(100);

    // At the click instant the cursor must land on the clicked pixel, exactly.
    const landed = computer.computeAt(210);
    expect(landed.x).toBe(300);
    expect(landed.y).toBe(300);

    // And stay put while parked (heartbeat moves at the same pixel).
    const parked = computer.computeAt(3000);
    expect(parked.x).toBe(300);
    expect(parked.y).toBe(300);
  });

  it('without a click event the spring is still gliding at the same time', () => {
    const gliding = new CursorStateComputer(
      telemetry([
        { t: 0, x: 0, y: 0, type: 'move' },
        { t: 200, x: 400, y: 400, type: 'move' },
        { t: 210, x: 300, y: 300, type: 'move' },
      ]),
      { smoothingFactor: 0.3 },
    );

    gliding.computeAt(0);
    gliding.computeAt(100);
    const mid = gliding.computeAt(210);
    // The spring has been tracking (400,400) and has not reached (300,300).
    expect(mid.x).toBeLessThan(300);
    expect(mid.x).toBeGreaterThan(0);
  });
});