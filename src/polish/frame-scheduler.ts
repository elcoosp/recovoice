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
  disableSway?: boolean;
  disableCursorMotionBlur?: boolean;
  disableClickPulse?: boolean;
  disableZoomMotionBlur?: boolean;
}

export interface FrameSchedule {
  frameIndex: number;
  tMs: number;
  camera: CameraState;
  cursor: CursorFrameState;
  cameraVelocity: number;
}

export function* scheduleFrames(input: ScheduleInput): Generator<FrameSchedule> {
  const {
    durationMs,
    fps,
    viewport,
    telemetry,
    zoomRegions,
    transitions,
    smoothingFactor,
  } = input;

  const frameIntervalMs = 1000 / fps;
  const totalFrames = Math.round((durationMs * fps) / 1000);

  const cursorOptions: {
    smoothingFactor: number;
    disableSway?: boolean;
    disableMotionBlur?: boolean;
    disableClickPulse?: boolean;
  } = { smoothingFactor };
  if (input.disableSway) cursorOptions.disableSway = true;
  if (input.disableCursorMotionBlur) cursorOptions.disableMotionBlur = true;
  if (input.disableClickPulse) cursorOptions.disableClickPulse = true;

  const cursorComputer = new CursorStateComputer(telemetry, cursorOptions);

  let previousCamera: CameraState | null = null;

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    const tMs = frameIndex * frameIntervalMs;
    const camera = computeCameraState({
      zoomRegions,
      transitions,
      tMs,
      viewport,
    });

    let cameraVelocity = 0;
    if (previousCamera) {
      const dScale = Math.abs(camera.scale - previousCamera.scale);
      const dPan = Math.sqrt(
        (camera.translateX - previousCamera.translateX) ** 2 +
          (camera.translateY - previousCamera.translateY) ** 2,
      );
      const dtSec = frameIntervalMs / 1000;
      cameraVelocity = (dScale * 100 + dPan) / dtSec;
    }
    previousCamera = camera;

    const cursor = cursorComputer.computeAt(tMs);
    yield { frameIndex, tMs, camera, cursor, cameraVelocity };
  }
}
