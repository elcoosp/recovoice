#!/usr/bin/env bash
set -uo pipefail

COMPILE_OK=true
INCOMPLETE=false

echo "Updating cursor-state to accept effect toggles"
cat > src/polish/cursor-state.ts << 'EOF'
import type { CursorEvent, CursorTelemetry } from '../types/recording.js';
import { Spring1D, springConfigFromSmoothingFactor } from './spring.js';
import { computeSwayAngle } from './cursor-sway.js';
import { computeCursorGhostCount } from './motion-blur.js';

export interface CursorFrameState {
  visible: boolean;
  x: number;
  y: number;
  rotation: number;
  ghostCount: number;
  clickPulse: number;
}

export interface CursorStateOptions {
  smoothingFactor: number;
  /** When true, disables cursor sway (rotation always 0). */
  disableSway?: boolean;
  /** When true, disables cursor motion blur (ghost count always 0). */
  disableMotionBlur?: boolean;
  /** When true, disables click pulse. */
  disableClickPulse?: boolean;
}

const CLICK_PULSE_DURATION_MS = 250;
const FRAME_MS = 16;

export class CursorStateComputer {
  private readonly events: CursorEvent[];
  private readonly springX: Spring1D;
  private readonly springY: Spring1D;
  private readonly opts: Required<CursorStateOptions>;
  private lastT = 0;
  private lastX = 0;
  private lastY = 0;
  private hasSample = false;

  constructor(telemetry: CursorTelemetry, options: CursorStateOptions) {
    this.events = [...telemetry.events].sort((a, b) => a.t - b.t);
    this.opts = {
      smoothingFactor: options.smoothingFactor,
      disableSway: options.disableSway ?? false,
      disableMotionBlur: options.disableMotionBlur ?? false,
      disableClickPulse: options.disableClickPulse ?? false,
    };
    const config = springConfigFromSmoothingFactor(this.opts.smoothingFactor);
    this.springX = new Spring1D(config, 0);
    this.springY = new Spring1D(config, 0);
  }

  computeAt(tMs: number): CursorFrameState {
    if (this.events.length === 0) return hidden();

    const before = this.events.filter((e) => e.t <= tMs);
    if (before.length === 0) return hidden();

    if (!this.hasSample) {
      const first = before[0]!;
      this.springX.position = first.x;
      this.springY.position = first.y;
      this.lastX = first.x;
      this.lastY = first.y;
      this.lastT = first.t;
      this.hasSample = true;
    }

    const latest = before[before.length - 1]!;
    this.springX.setTarget(latest.x);
    this.springY.setTarget(latest.y);

    const dtSec = Math.max(1e-6, (tMs - this.lastT) / 1000);
    const steps = Math.max(1, Math.ceil((dtSec * 1000) / FRAME_MS));
    const stepDt = dtSec / steps;
    for (let i = 0; i < steps; i++) {
      this.springX.step(stepDt);
      this.springY.step(stepDt);
    }

    const currentX = this.springX.position;
    const currentY = this.springY.position;
    const velocityX = (currentX - this.lastX) / dtSec;
    const velocityY = (currentY - this.lastY) / dtSec;
    const speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);

    const rotation = this.opts.disableSway
      ? 0
      : computeSwayAngle(velocityX, velocityY);
    const ghostCount = this.opts.disableMotionBlur
      ? 0
      : computeCursorGhostCount(speed);
    const clickPulse = this.opts.disableClickPulse
      ? 0
      : this.computeClickPulse(tMs);

    this.lastX = currentX;
    this.lastY = currentY;
    this.lastT = tMs;

    return {
      visible: true,
      x: currentX,
      y: currentY,
      rotation,
      ghostCount,
      clickPulse,
    };
  }

  private computeClickPulse(tMs: number): number {
    const click = this.events
      .filter((e) => e.type === 'click' && e.t <= tMs)
      .sort((a, b) => b.t - a.t)[0];
    if (!click) return 0;
    const elapsed = tMs - click.t;
    if (elapsed >= CLICK_PULSE_DURATION_MS) return 0;
    const progress = elapsed / CLICK_PULSE_DURATION_MS;
    return Math.sin(Math.PI * progress);
  }
}

function hidden(): CursorFrameState {
  return {
    visible: false,
    x: 0,
    y: 0,
    rotation: 0,
    ghostCount: 0,
    clickPulse: 0,
  };
}
EOF

echo "Updating frame-scheduler to accept polish toggles and pass through"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
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
EOF
cat > "$NEW_TMP" << 'EOF'
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
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/polish/frame-scheduler.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: frame-scheduler block not found")
    sys.exit(1)
content = content.replace(old, new, 1)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch 1 succeeded"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: Python patch 1 failed"
  rm -f "$OLD_TMP" "$NEW_TMP"
  exit 1
fi

echo "Adding blurRadius to RenderFrameInput and applying it"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
export interface RenderFrameInput {
  video: unknown;
  videoWidth: number;
  videoHeight: number;
  camera: CameraState;
  cursor: CursorFrameState;
  background: BackgroundConfig;
  frame: Required<FrameConfig>;
  cursorStyle?: CursorStyle;
}
EOF
cat > "$NEW_TMP" << 'EOF'
export interface RenderFrameInput {
  video: unknown;
  videoWidth: number;
  videoHeight: number;
  camera: CameraState;
  cursor: CursorFrameState;
  background: BackgroundConfig;
  frame: Required<FrameConfig>;
  cursorStyle?: CursorStyle;
  /** Zoom motion blur radius in px; 0 disables. */
  zoomBlurRadius?: number;
}
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/compositor/frame-renderer.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: RenderFrameInput block not found")
    sys.exit(1)
content = content.replace(old, new, 1)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch 2 succeeded"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: Python patch 2 failed"
  rm -f "$OLD_TMP" "$NEW_TMP"
  exit 1
fi

echo "Applying zoom blur in drawFrame"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
  // Frame content
  ctx.save();
  ctx.beginPath();
  roundRectPath(
    ctx,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    input.frame.borderRadius,
  );
  ctx.clip();
EOF
cat > "$NEW_TMP" << 'EOF'
  // Frame content
  ctx.save();
  ctx.beginPath();
  roundRectPath(
    ctx,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    input.frame.borderRadius,
  );
  ctx.clip();

  const zoomBlur = input.zoomBlurRadius ?? 0;
  if (zoomBlur > 0.1) {
    ctx.filter = `blur(${zoomBlur.toFixed(2)}px)`;
  }
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/compositor/frame-renderer.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: drawFrame clip block not found")
    sys.exit(1)
content = content.replace(old, new, 1)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch 3 succeeded"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: Python patch 3 failed"
  rm -f "$OLD_TMP" "$NEW_TMP"
  exit 1
fi

echo "Resetting filter after drawImage"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
  ctx.drawImage(
    input.video,
    0,
    0,
    input.videoWidth,
    input.videoHeight,
  );
  ctx.restore();
}
EOF
cat > "$NEW_TMP" << 'EOF'
  ctx.drawImage(
    input.video,
    0,
    0,
    input.videoWidth,
    input.videoHeight,
  );
  ctx.filter = 'none';
  ctx.restore();
}
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/compositor/frame-renderer.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: drawImage reset block not found")
    sys.exit(1)
content = content.replace(old, new, 1)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch 4 succeeded"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: Python patch 4 failed"
  rm -f "$OLD_TMP" "$NEW_TMP"
  exit 1
fi

echo "Updating polish-compositor to read polish toggles and compute blur"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
    const schedules = Array.from(
      scheduleFrames({
        durationMs: this.opts.durationMs,
        fps: this.opts.fps,
        viewport,
        telemetry: this.opts.telemetry,
        zoomRegions: analysis.zoomRegions,
        transitions: analysis.transitions,
        smoothingFactor: this.opts.smoothingFactor ?? 0.3,
      }),
    );
EOF
cat > "$NEW_TMP" << 'EOF'
    const polish = this.opts.polish ?? {};
    const scheduleInput: Parameters<typeof scheduleFrames>[0] = {
      durationMs: this.opts.durationMs,
      fps: this.opts.fps,
      viewport,
      telemetry: this.opts.telemetry,
      zoomRegions: analysis.zoomRegions,
      transitions: analysis.transitions,
      smoothingFactor:
        typeof polish.cursorSmoothing === 'number'
          ? polish.cursorSmoothing
          : this.opts.smoothingFactor ?? 0.3,
    };
    if (polish.cursorSway === false) scheduleInput.disableSway = true;
    if (polish.cursorMotionBlur === false)
      scheduleInput.disableCursorMotionBlur = true;
    if (polish.zoomMotionBlur === false)
      scheduleInput.disableZoomMotionBlur = true;

    const schedules = Array.from(scheduleFrames(scheduleInput));
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/compositor/polish-compositor.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: scheduleFrames block not found")
    sys.exit(1)
content = content.replace(old, new, 1)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch 5 succeeded"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: Python patch 5 failed"
  rm -f "$OLD_TMP" "$NEW_TMP"
  exit 1
fi

echo "Passing zoom blur radius to renderFrame"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
        renderFrame(canvas, {
          video: scratchCanvas,
          videoWidth: viewport.width,
          videoHeight: viewport.height,
          camera: schedule.camera,
          cursor: schedule.cursor,
          background: bg,
          frame: frameCfg,
          cursorStyle: DEFAULT_CURSOR_STYLE,
        });
EOF
cat > "$NEW_TMP" << 'EOF'
        const zoomBlurEnabled = polish.zoomMotionBlur !== false;
        const zoomBlurRadius = zoomBlurEnabled
          ? computeZoomBlurRadius(schedule.cameraVelocity)
          : 0;
        renderFrame(canvas, {
          video: scratchCanvas,
          videoWidth: viewport.width,
          videoHeight: viewport.height,
          camera: schedule.camera,
          cursor: schedule.cursor,
          background: bg,
          frame: frameCfg,
          cursorStyle: DEFAULT_CURSOR_STYLE,
          zoomBlurRadius,
        });
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/compositor/polish-compositor.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: renderFrame call not found")
    sys.exit(1)
content = content.replace(old, new, 1)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch 6 succeeded"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: Python patch 6 failed"
  rm -f "$OLD_TMP" "$NEW_TMP"
  exit 1
fi

echo "Adding computeZoomBlurRadius import to polish-compositor"
OLD_TMP=$(mktemp) || { echo "ERROR: cannot create temp file"; exit 1; }
NEW_TMP=$(mktemp)
cat > "$OLD_TMP" << 'EOF'
import {
  createNapiCanvas,
  isNapiCanvasAvailable,
} from './napi-canvas.js';
EOF
cat > "$NEW_TMP" << 'EOF'
import {
  createNapiCanvas,
  isNapiCanvasAvailable,
} from './napi-canvas.js';
import { computeZoomBlurRadius } from '../polish/motion-blur.js';
EOF
if python3 - "$OLD_TMP" "$NEW_TMP" src/compositor/polish-compositor.ts << 'PYEOF'
import sys
with open(sys.argv[1], 'r') as f: old = f.read()
with open(sys.argv[2], 'r') as f: new = f.read()
with open(sys.argv[3], 'r') as f: content = f.read()
if old not in content:
    print("ERROR: napi-canvas import block not found")
    sys.exit(1)
content = content.replace(old, new, 1)
with open(sys.argv[3], 'w') as f: f.write(content)
PYEOF
then
  echo "Python patch 7 succeeded"
  rm "$OLD_TMP" "$NEW_TMP"
else
  echo "ERROR: Python patch 7 failed"
  rm -f "$OLD_TMP" "$NEW_TMP"
  exit 1
fi

echo "Writing test/polish/cursor-state-toggles.test.ts"
cat > test/polish/cursor-state-toggles.test.ts << 'EOF'
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
EOF

echo "Writing test/polish/frame-scheduler-velocity.test.ts"
cat > test/polish/frame-scheduler-velocity.test.ts << 'EOF'
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
EOF

echo "Writing test/compositor/frame-renderer-blur.test.ts"
cat > test/compositor/frame-renderer-blur.test.ts << 'EOF'
import { describe, it, expect, beforeEach } from 'vitest';
import {
  renderFrame,
  DEFAULT_CURSOR_STYLE,
  DEFAULT_FRAME_CONFIG,
} from '../../src/compositor/frame-renderer.js';
import type {
  CanvasLike,
  CanvasGradientLike,
} from '../../src/compositor/canvas-types.js';

interface Call {
  method: string;
  args: unknown[];
}

function makeMockCanvas(width: number, height: number): {
  canvas: CanvasLike;
  calls: Call[];
  ctxRef: { filter: string };
} {
  const calls: Call[] = [];
  const gradient: CanvasGradientLike = { addColorStop: () => undefined };
  const ctxRef = { filter: 'none' };
  const ctx = {
    save: () => calls.push({ method: 'save', args: [] }),
    restore: () => calls.push({ method: 'restore', args: [] }),
    translate: (...args: unknown[]) => calls.push({ method: 'translate', args }),
    scale: (...args: unknown[]) => calls.push({ method: 'scale', args }),
    rotate: (...args: unknown[]) => calls.push({ method: 'rotate', args }),
    clearRect: (...args: unknown[]) => calls.push({ method: 'clearRect', args }),
    fillRect: (...args: unknown[]) => calls.push({ method: 'fillRect', args }),
    strokeRect: (...args: unknown[]) => calls.push({ method: 'strokeRect', args }),
    drawImage: (...args: unknown[]) => calls.push({ method: 'drawImage', args }),
    beginPath: () => calls.push({ method: 'beginPath', args: [] }),
    moveTo: (...args: unknown[]) => calls.push({ method: 'moveTo', args }),
    lineTo: (...args: unknown[]) => calls.push({ method: 'lineTo', args }),
    quadraticCurveTo: (...args: unknown[]) =>
      calls.push({ method: 'quadraticCurveTo', args }),
    closePath: () => calls.push({ method: 'closePath', args: [] }),
    arc: (...args: unknown[]) => calls.push({ method: 'arc', args }),
    fill: () => calls.push({ method: 'fill', args: [] }),
    stroke: () => calls.push({ method: 'stroke', args: [] }),
    clip: () => calls.push({ method: 'clip', args: [] }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    get filter() {
      return ctxRef.filter;
    },
    set filter(v: string) {
      ctxRef.filter = v;
      calls.push({ method: 'filter', args: [v] });
    },
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  };
  const canvas: CanvasLike = {
    width,
    height,
    getContext: () => ctx,
  };
  return { canvas, calls, ctxRef };
}

const camera = { scale: 1, translateX: 0, translateY: 0 };
const hiddenCursor = {
  visible: false,
  x: 0,
  y: 0,
  rotation: 0,
  ghostCount: 0,
  clickPulse: 0,
};

describe('renderFrame zoom blur', () => {
  let canvas: CanvasLike;
  let calls: Call[];

  beforeEach(() => {
    const mock = makeMockCanvas(1920, 1080);
    canvas = mock.canvas;
    calls = mock.calls;
  });

  it('does not set a filter when zoomBlurRadius is 0', () => {
    renderFrame(canvas, {
      video: {},
      videoWidth: 1280,
      videoHeight: 800,
      camera,
      cursor: hiddenCursor,
      background: { type: 'solid' },
      frame: DEFAULT_FRAME_CONFIG,
      cursorStyle: DEFAULT_CURSOR_STYLE,
      zoomBlurRadius: 0,
    });
    const filterCalls = calls.filter((c) => c.method === 'filter');
    expect(filterCalls.every((c) => c.args[0] === 'none')).toBe(true);
  });

  it('sets a filter when zoomBlurRadius is above threshold', () => {
    renderFrame(canvas, {
      video: {},
      videoWidth: 1280,
      videoHeight: 800,
      camera,
      cursor: hiddenCursor,
      background: { type: 'solid' },
      frame: DEFAULT_FRAME_CONFIG,
      cursorStyle: DEFAULT_CURSOR_STYLE,
      zoomBlurRadius: 5,
    });
    const filterCalls = calls.filter((c) => c.method === 'filter');
    expect(filterCalls.some((c) => String(c.args[0]).startsWith('blur('))).toBe(true);
  });

  it('resets filter to none after drawing the frame', () => {
    renderFrame(canvas, {
      video: {},
      videoWidth: 1280,
      videoHeight: 800,
      camera,
      cursor: hiddenCursor,
      background: { type: 'solid' },
      frame: DEFAULT_FRAME_CONFIG,
      cursorStyle: DEFAULT_CURSOR_STYLE,
      zoomBlurRadius: 5,
    });
    const filterCalls = calls.filter((c) => c.method === 'filter');
    const last = filterCalls[filterCalls.length - 1];
    expect(last!.args[0]).toBe('none');
  });
});
EOF

echo "Checking compilation"
if ! pnpm exec tsc --noEmit 2>&1; then
  echo "Compilation failed - will skip commit"
  COMPILE_OK=false
fi

if [ "$INCOMPLETE" = true ] || [ "$COMPILE_OK" = false ]; then
  echo "Skipping tests and commit due to incomplete files or compilation errors"
  exit 1
fi

echo "Running tests"
if pnpm exec vitest run 2>&1; then
  echo "All tests passed. Committing."
  git add -A
  git commit -m "feat(polish): wire per-effect toggles and zoom motion blur into the render path"
else
  echo "Tests failed. Fix errors then run the next script."
  exit 1
fi
