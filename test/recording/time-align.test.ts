import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readFrameCaptureTimes,
  normalizeFrameVideoTimes,
  resampleTelemetryToVideoTime,
} from '../../src/recording/time-align.js';
import type { CursorTelemetry } from '../../src/types/recording.js';

const telemetry = (events: CursorTelemetry['events']): CursorTelemetry => ({
  events,
  timebaseOrigin: 0,
  viewport: { width: 800, height: 600 },
  wallBaseMs: 1000,
});

describe('normalizeFrameVideoTimes', () => {
  it('scales frame wall times onto the target duration proportionally', () => {
    // Frames captured at wall 1000/2000/3000 over a 9s target.
    const out = normalizeFrameVideoTimes([1000, 2000, 3000], 9000);
    expect(out).toEqual([0, 4500, 9000]);
  });

  it('compresses when the target is shorter than the wall span', () => {
    const out = normalizeFrameVideoTimes([1000, 2000, 5000], 4000);
    // span 4000 -> scale 1ms wall per ms video over [2000,5000]: 0, 1000, 4000
    expect(out).toEqual([0, 1000, 4000]);
  });

  it('returns null without a finite positive duration', () => {
    expect(normalizeFrameVideoTimes([1000, 2000], 0)).toBeNull();
    expect(normalizeFrameVideoTimes([1000, 2000], NaN)).toBeNull();
  });

  it('returns null with fewer than two frames or a degenerate span', () => {
    expect(normalizeFrameVideoTimes([1000], 9000)).toBeNull();
    expect(normalizeFrameVideoTimes([1000, 1000], 9000)).toBeNull();
  });
});

describe('resampleTelemetryToVideoTime', () => {
  // Frames captured at wall 1000/2000/3000ms, normalized to a 9s video so the
  // display times are 0/4500/9000ms.
  const frameWallTimes = [1000, 2000, 3000];
  const frameVideoTimes = [0, 4500, 9000];

  it('maps wall-clock events onto the normalized video timeline', () => {
    const out = resampleTelemetryToVideoTime(
      telemetry([
        // wall 1500 (frame 0), 2500 (frame 1), 3500 (frame 2)
        { t: 500, x: 10, y: 10, type: 'move' },
        { t: 1500, x: 20, y: 20, type: 'move' },
        { t: 2500, x: 30, y: 30, type: 'click' },
      ]),
      frameWallTimes,
      frameVideoTimes,
    );
    expect(out.events.map((e) => e.t)).toEqual([0, 4500, 9000]);
    expect(out.events[2]).toMatchObject({ x: 30, y: 30, type: 'click' });
    expect(out.timebaseOrigin).toBe(0);
  });

  it('clamps events that precede the first or follow the last frame', () => {
    const out = resampleTelemetryToVideoTime(
      telemetry([
        { t: -100, x: 1, y: 1, type: 'move' },
        { t: 5000, x: 2, y: 2, type: 'move' },
      ]),
      frameWallTimes,
      frameVideoTimes,
    );
    expect(out.events.map((e) => e.t)).toEqual([0, 9000]);
  });

  it('keeps event order monotonic on the video timeline', () => {
    const out = resampleTelemetryToVideoTime(
      telemetry([
        { t: 100, x: 1, y: 1, type: 'move' },
        { t: 200, x: 2, y: 2, type: 'move' },
      ]),
      frameWallTimes,
      frameVideoTimes,
    );
    const ts = out.events.map((e) => e.t);
    for (let i = 1; i < ts.length; i++) expect(ts[i]!).toBeGreaterThanOrEqual(ts[i - 1]!);
  });

  it('returns the telemetry unchanged without a wall base', () => {
    const original = telemetry([{ t: 42, x: 1, y: 2, type: 'move' }]);
    delete original.wallBaseMs;
    const out = resampleTelemetryToVideoTime(
      original,
      frameWallTimes,
      frameVideoTimes,
    );
    expect(out).toBe(original);
  });

  it('returns the telemetry unchanged with too few frames', () => {
    const original = telemetry([{ t: 42, x: 1, y: 2, type: 'move' }]);
    expect(resampleTelemetryToVideoTime(original, [1000], [0])).toBe(original);
  });

  it('returns the telemetry unchanged when frame arrays disagree', () => {
    const original = telemetry([{ t: 42, x: 1, y: 2, type: 'move' }]);
    expect(
      resampleTelemetryToVideoTime(original, frameWallTimes, [0, 4500]),
    ).toBe(original);
  });
});

describe('readFrameCaptureTimes', () => {
  let dir: string;

  function makeFrames(timesMs: Record<number, number>): void {
    for (const [index, ms] of Object.entries(timesMs)) {
      const path = join(dir, `frame_${Number(index).toString().padStart(6, '0')}.png`);
      writeFileSync(path, 'x');
      utimesSync(path, new Date(ms) as unknown as Date, new Date(ms) as unknown as Date);
    }
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'recovoice-align-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns per-frame epoch ms indexed by frame number', () => {
    makeFrames({ 0: 100000, 1: 101000, 2: 102000 });
    const times = readFrameCaptureTimes(dir);
    expect(times).toEqual([100000, 101000, 102000]);
  });

  it('returns null when the directory does not exist', () => {
    expect(readFrameCaptureTimes(join(dir, 'missing'))).toBeNull();
  });

  it('returns null with fewer than two frames', () => {
    makeFrames({ 0: 100000 });
    expect(readFrameCaptureTimes(dir)).toBeNull();
  });

  it('keeps the mapping monotonic when timestamps go backwards', () => {
    makeFrames({ 0: 100000, 1: 99000, 2: 103000 });
    const times = readFrameCaptureTimes(dir);
    expect(times).toEqual([100000, 100000, 103000]);
  });
});