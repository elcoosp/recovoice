import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { CursorTelemetry, CursorEvent } from '../types/recording.js';

const FRAME_RE = /^frame_(\d+)\.png$/;

/**
 * Read the wall-clock (epoch ms) capture time of each recorded frame from the
 * frames' modified timestamps. The recording backend writes one PNG per
 * captured frame alongside video.mp4, then stitches them into the video at a
 * fixed `fps`.
 *
 * Returns an array indexed by frame number (0..n-1) with each frame's capture
 * completion time in epoch ms, or null when the frame sequence is unavailable.
 */
export function readFrameCaptureTimes(
  frameDir: string,
): number[] | null {
  let names: string[];
  try {
    names = readdirSync(frameDir);
  } catch {
    return null;
  }

  const byIndex: Record<number, number> = {};
  let maxIndex = -1;
  for (const name of names) {
    const m = FRAME_RE.exec(name);
    if (!m) continue;
    const index = Number(m[1]!);
    if (!Number.isInteger(index) || index < 0) continue;
    try {
      byIndex[index] = statSync(join(frameDir, name)).mtimeMs;
      if (index > maxIndex) maxIndex = index;
    } catch {
      // unreadable frame; skip it
    }
  }
  // The rate at which frames are actually captured can lag far behind the
  // requested fps (slow machines, heavy load), so the video is a compressed
  // version of real time. require enough samples to reconstruct that mapping.
  if (Object.keys(byIndex).length < 2) return null;

  const times: number[] = [];
  for (let i = 0; i <= maxIndex; i++) {
    if (typeof byIndex[i] === 'number') {
      times[i] = byIndex[i]!;
    } else if (i > 0) {
      // Fill holes (skipped/unlisted frames) with the previous timestamp so
      // the mapping stays monotonic.
      times[i] = times[i - 1]!;
    } else {
      times[i] = 0;
    }
    if (i > 0 && times[i]! < times[i - 1]!) {
      times[i] = times[i - 1]!;
    }
  }
  return times;
}

/**
 * Scale per-frame wall-clock capture times onto a target video duration.
 *
 * Each captured frame i was written at wall-clock time `w[i]`. When the video
 * is normalized to a specific duration (e.g. the narration length) the frame
 * i should be *displayed* at the same proportional position on the timeline,
 * so `v[i] = durationMs * (w[i] - w[0]) / (w[last] - w[0])`. Frames keep their
 * capture cadence relative to each other while the whole span stretches or
 * compresses to `durationMs`.
 *
 * Returns null when the mapping is degenerate (fewer than two frames,
 * non-positive duration or zero wall span), in which case callers should fall
 * back to a plain `frameIndex / fps` timeline.
 */
export function normalizeFrameVideoTimes(
  frameWallTimesMs: number[],
  durationMs: number,
): number[] | null {
  if (frameWallTimesMs.length < 2 || !Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }
  const last = frameWallTimesMs.length - 1;
  const span = frameWallTimesMs[last]! - frameWallTimesMs[0]!;
  if (!(span > 0) || !Number.isFinite(span)) return null;

  const times: number[] = [];
  for (let i = 0; i <= last; i++) {
    times[i] = Math.round(
      (durationMs * (frameWallTimesMs[i]! - frameWallTimesMs[0]!)) / span,
    );
  }
  times[times.length - 1] = Math.round(durationMs);
  return times;
}

/**
 * Remap telemetry event timestamps from the wall clock into video time.
 *
 * Each event happened at wall time `wallBase + e.t`. `frameWallTimesMs` holds
 * the capture-completion time of every recorded frame and `frameVideoTimesMs`
 * the video time that frame is shown at; an event is mapped to the video time
 * of the last frame captured at or before its wall time. With both arrays
 * derived from the same frames, events land exactly where the picture they
 * describe actually appears.
 *
 * Returns the telemetry unchanged when there is no wall base (e.g. non-frame
 * backends, tests) so callers can rely on one code path.
 */
export function resampleTelemetryToVideoTime(
  telemetry: CursorTelemetry,
  frameWallTimesMs: number[],
  frameVideoTimesMs: number[],
): CursorTelemetry {
  const wallBase = telemetry.wallBaseMs;
  if (
    telemetry.events.length === 0 ||
    typeof wallBase !== 'number' ||
    !Number.isFinite(wallBase) ||
    wallBase <= 0 ||
    frameWallTimesMs.length < 2 ||
    frameVideoTimesMs.length !== frameWallTimesMs.length
  ) {
    return telemetry;
  }

  const events: CursorEvent[] = [];
  let lastVideoMs = -1;
  for (const e of telemetry.events) {
    const wallMs = wallBase + e.t;
    const index = frameIndexAt(wallMs, frameWallTimesMs);
    const videoMs = frameVideoTimesMs[index]!;
    // The frame index map is monotonic, but clamp defensively so later events
    // never run backwards on the video timeline.
    const t = Math.round(videoMs >= lastVideoMs ? videoMs : lastVideoMs);
    lastVideoMs = t;
    events.push({ t, x: e.x, y: e.y, type: e.type });
  }

  return {
    events,
    timebaseOrigin: 0,
    viewport: telemetry.viewport,
  };
}

/**
 * Binary search: the index of the last frame captured at or before `wallMs`.
 * Clamps to the first/last frame for events outside the recording span.
 */
export function frameIndexAt(wallMs: number, frameTimesMs: number[]): number {
  const last = frameTimesMs.length - 1;
  if (wallMs <= frameTimesMs[0]!) return 0;
  if (wallMs >= frameTimesMs[last]!) return last;
  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (frameTimesMs[mid]! <= wallMs) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}