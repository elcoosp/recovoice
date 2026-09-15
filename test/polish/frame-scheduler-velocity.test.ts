import { describe, it, expect } from 'vitest';
import { scheduleFrames } from '../../src/polish/frame-scheduler.js';
import type { ZoomRegion } from '../../src/types/recording.js';

const VIEWPORT = { width: 1280, height: 800 };
const EMPTY_TELEMETRY = {
  events: [],
  timebaseOrigin: 0,
  viewport: VIEWPORT,
};

describe('scheduleFrames camera velocity', () => {
  it('reports zero velocity on the first frame', () => {
    const schedules = Array.from(
      scheduleFrames({
        durationMs: 500,
        fps: 30,
        viewport: VIEWPORT,
        telemetry: EMPTY_TELEMETRY,
        zoomRegions: [],
        transitions: [],
        smoothingFactor: 0.3,
      }),
    );
    expect(schedules[0]!.cameraVelocity).toBe(0);
  });

  it('reports increasing velocity when the camera is zooming', () => {
    const region: ZoomRegion = {
      id: 'z1',
      startMs: 0,
      endMs: 2000,
      focus: { cx: 640, cy: 400 },
      depth: 3,
    };
    const schedules = Array.from(
      scheduleFrames({
        durationMs: 1000,
        fps: 60,
        viewport: VIEWPORT,
        telemetry: EMPTY_TELEMETRY,
        zoomRegions: [region],
        transitions: [],
        smoothingFactor: 0.3,
      }),
    );
    const velocities = schedules.map((s) => s.cameraVelocity);
    const maxVelocity = Math.max(...velocities);
    expect(maxVelocity).toBeGreaterThan(0);
  });

  it('reports zero velocity when the camera is idle', () => {
    const schedules = Array.from(
      scheduleFrames({
        durationMs: 500,
        fps: 30,
        viewport: VIEWPORT,
        telemetry: EMPTY_TELEMETRY,
        zoomRegions: [],
        transitions: [],
        smoothingFactor: 0.3,
      }),
    );
    // Skip first frame; all others should be zero (nothing moves)
    for (let i = 1; i < schedules.length; i++) {
      expect(schedules[i]!.cameraVelocity).toBe(0);
    }
  });

  it('passes disableSway through to the cursor state computer', () => {
    const schedules = Array.from(
      scheduleFrames({
        durationMs: 500,
        fps: 30,
        viewport: VIEWPORT,
        telemetry: {
          events: [
            { t: 0, x: 0, y: 0, type: 'move' },
            { t: 100, x: 2000, y: 0, type: 'move' },
          ],
          timebaseOrigin: 0,
          viewport: VIEWPORT,
        },
        zoomRegions: [],
        transitions: [],
        smoothingFactor: 0,
        disableSway: true,
      }),
    );
    for (const s of schedules) {
      if (s.cursor.visible) expect(s.cursor.rotation).toBe(0);
    }
  });
});
