import { describe, it, expect } from 'vitest';
import { scheduleFrames } from '../../src/polish/frame-scheduler.js';
import type { CursorTelemetry, ZoomRegion } from '../../src/types/recording.js';
import type { ConnectedTransition } from '../../src/types/recording.js';

const viewport = { width: 1280, height: 800 };
const EMPTY_TELEMETRY: CursorTelemetry = {
  events: [],
  timebaseOrigin: 0,
  viewport,
};

function collectSchedules(
  input: Parameters<typeof scheduleFrames>[0],
): ReturnType<typeof scheduleFrames> extends Generator<infer T> ? T[] : never {
  const out: unknown[] = [];
  for (const s of scheduleFrames(input)) out.push(s);
  return out as never;
}

describe('scheduleFrames', () => {
  it('produces the correct number of frames for the duration and fps', () => {
    const schedules = collectSchedules({
      durationMs: 1000,
      fps: 30,
      viewport,
      telemetry: EMPTY_TELEMETRY,
      zoomRegions: [],
      transitions: [],
      smoothingFactor: 0.3,
    });
    expect(schedules).toHaveLength(30);
  });

  it('assigns monotonic increasing timestamps', () => {
    const schedules = collectSchedules({
      durationMs: 1000,
      fps: 30,
      viewport,
      telemetry: EMPTY_TELEMETRY,
      zoomRegions: [],
      transitions: [],
      smoothingFactor: 0.3,
    });
    for (let i = 1; i < schedules.length; i++) {
      expect(schedules[i]!.tMs).toBeGreaterThan(schedules[i - 1]!.tMs);
    }
  });

  it('starts at tMs 0', () => {
    const schedules = collectSchedules({
      durationMs: 1000,
      fps: 30,
      viewport,
      telemetry: EMPTY_TELEMETRY,
      zoomRegions: [],
      transitions: [],
      smoothingFactor: 0.3,
    });
    expect(schedules[0]!.tMs).toBe(0);
  });

  it('returns identity camera when no zoom regions are given', () => {
    const schedules = collectSchedules({
      durationMs: 500,
      fps: 30,
      viewport,
      telemetry: EMPTY_TELEMETRY,
      zoomRegions: [],
      transitions: [],
      smoothingFactor: 0.3,
    });
    for (const s of schedules) {
      expect(s.camera.scale).toBe(1);
      expect(s.camera.translateX).toBe(0);
      expect(s.camera.translateY).toBe(0);
    }
  });

  it('applies zoom scale during a zoom region', () => {
    const region: ZoomRegion = {
      id: 'z1',
      startMs: 100,
      endMs: 900,
      focus: { cx: 640, cy: 400 },
      depth: 2,
    };
    const schedules = collectSchedules({
      durationMs: 1000,
      fps: 30,
      viewport,
      telemetry: EMPTY_TELEMETRY,
      zoomRegions: [region],
      transitions: [],
      smoothingFactor: 0.3,
    });
    // Mid region (t=500ms) should be fully zoomed
    const mid = schedules.find((s) => s.tMs >= 500 && s.tMs < 533);
    expect(mid).toBeDefined();
    expect(mid!.camera.scale).toBeCloseTo(2, 1);
  });

  it('keeps camera identity at end of duration when no regions are active', () => {
    const region: ZoomRegion = {
      id: 'z1',
      startMs: 100,
      endMs: 500,
      focus: { cx: 640, cy: 400 },
      depth: 2,
    };
    const schedules = collectSchedules({
      durationMs: 2000,
      fps: 30,
      viewport,
      telemetry: EMPTY_TELEMETRY,
      zoomRegions: [region],
      transitions: [],
      smoothingFactor: 0.3,
    });
    const last = schedules[schedules.length - 1]!;
    expect(last.camera.scale).toBe(1);
  });

  it('produces cursor states in order', () => {
    const telemetry: CursorTelemetry = {
      events: [
        { t: 0, x: 0, y: 0, type: 'move' },
        { t: 100, x: 100, y: 50, type: 'move' },
        { t: 500, x: 500, y: 400, type: 'move' },
      ],
      timebaseOrigin: 0,
      viewport,
    };
    const schedules = collectSchedules({
      durationMs: 1000,
      fps: 30,
      viewport,
      telemetry,
      zoomRegions: [],
      transitions: [],
      smoothingFactor: 0.3,
    });
    // Cursor should be visible from the first event onward
    expect(schedules[0]!.cursor.visible).toBe(true);
    // Cursor should converge to the last position
    const last = schedules[schedules.length - 1]!;
    expect(Math.abs(last.cursor.x - 500)).toBeLessThan(50);
  });

  it('produces cursor hidden when there are no events', () => {
    const schedules = collectSchedules({
      durationMs: 500,
      fps: 30,
      viewport,
      telemetry: EMPTY_TELEMETRY,
      zoomRegions: [],
      transitions: [],
      smoothingFactor: 0.3,
    });
    for (const s of schedules) {
      expect(s.cursor.visible).toBe(false);
    }
  });

  it('interpolates camera between connected regions', () => {
    const a: ZoomRegion = {
      id: 'a',
      startMs: 0,
      endMs: 500,
      focus: { cx: 300, cy: 300 },
      depth: 1.5,
    };
    const b: ZoomRegion = {
      id: 'b',
      startMs: 1500,
      endMs: 2500,
      focus: { cx: 900, cy: 600 },
      depth: 1.5,
    };
    const transitions: ConnectedTransition[] = [
      { fromRegion: a, toRegion: b, panStartMs: 500, panEndMs: 1500 },
    ];
    const schedules = collectSchedules({
      durationMs: 3000,
      fps: 30,
      viewport,
      telemetry: EMPTY_TELEMETRY,
      zoomRegions: [a, b],
      transitions,
      smoothingFactor: 0.3,
    });
    const mid = schedules.find((s) => s.tMs >= 990 && s.tMs < 1030)!;
    expect(mid.camera.scale).toBeGreaterThan(1);
    expect(mid.camera.scale).toBeLessThan(1.5 + 1e-6);
  });

  it('stops exactly at duration (does not exceed it)', () => {
    const schedules = collectSchedules({
      durationMs: 100,
      fps: 30,
      viewport,
      telemetry: EMPTY_TELEMETRY,
      zoomRegions: [],
      transitions: [],
      smoothingFactor: 0.3,
    });
    // At 30fps, 100ms = frames at 0, 33, 66 = 3 frames (last < 100)
    expect(schedules.length).toBe(3);
    expect(schedules[schedules.length - 1]!.tMs).toBeLessThan(100);
  });

  it('handles fps 60 without dropping frames', () => {
    const schedules = collectSchedules({
      durationMs: 1000,
      fps: 60,
      viewport,
      telemetry: EMPTY_TELEMETRY,
      zoomRegions: [],
      transitions: [],
      smoothingFactor: 0.3,
    });
    expect(schedules).toHaveLength(60);
  });
});
