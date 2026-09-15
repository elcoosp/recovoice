import type {
  ConnectedTransition,
  CursorTelemetry,
  ZoomRegion,
} from '../types/recording.js';
import { computeCameraState, type CameraState } from './camera-state.js';
import { CursorStateComputer, type CursorFrameState } from './cursor-state.js';

export interface ScheduleInput {
  durationMs: number;
  fps: number;
  viewport: { width: number; height: number };
  telemetry: CursorTelemetry;
  zoomRegions: ZoomRegion[];
  transitions: ConnectedTransition[];
  smoothingFactor: number;
}

export interface FrameSchedule {
  frameIndex: number;
  tMs: number;
  camera: CameraState;
  cursor: CursorFrameState;
}

export function* scheduleFrames(input: ScheduleInput): Generator<FrameSchedule> {
  const { durationMs, fps, viewport, telemetry, zoomRegions, transitions, smoothingFactor } = input;
  const frameIntervalMs = 1000 / fps;
  const totalFrames = Math.round((durationMs * fps) / 1000);
  const cursorComputer = new CursorStateComputer(telemetry, { smoothingFactor });

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    const tMs = frameIndex * frameIntervalMs;
    const camera = computeCameraState({
      zoomRegions,
      transitions,
      tMs,
      viewport,
    });
    const cursor = cursorComputer.computeAt(tMs);
    yield { frameIndex, tMs, camera, cursor };
  }
}
