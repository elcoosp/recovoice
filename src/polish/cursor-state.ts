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
  /** Position of the most recent click, in viewport coordinates. */
  clickX: number;
  clickY: number;
  /** 0..1 expanding click-ripple intensity (0 when idle). */
  clickRipple: number;
}

export interface CursorStateOptions {
  smoothingFactor: number;
  /** When true, disables cursor sway (rotation always 0). */
  disableSway?: boolean;
  /** When true, disables cursor motion blur (ghost count always 0). */
  disableMotionBlur?: boolean;
  /** When true, disables click pulse. */
  disableClickPulse?: boolean;
  /**
   * When true, uses raw cursor positions without spring smoothing.
   */
  disableSmoothing?: boolean;
}

const CLICK_PULSE_DURATION_MS = 250;
const CLICK_RIPPLE_DURATION_MS = 600;
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
      disableSmoothing: options.disableSmoothing ?? false,
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

    // A click pins the cursor to the target: the pointer lands decisively at
    // the element it clicked, so text that types immediately after (which is
    // only visible in the recorded picture, not in telemetry) never appears
    // before the cursor is sitting on the field. Without this, spring
    // smoothing would still be gliding into place while the input fills.
    if (latest.type === 'click' && !this.opts.disableSmoothing) {
      this.springX.setTarget(latest.x);
      this.springX.position = latest.x;
      this.springX.velocity = 0;
      this.springY.setTarget(latest.y);
      this.springY.position = latest.y;
      this.springY.velocity = 0;
      this.lastX = latest.x;
      this.lastY = latest.y;
    }

    if (this.opts.disableSmoothing) {
      const rawX = latest.x;
      const rawY = latest.y;
      const dtRaw = Math.max(1e-6, (tMs - this.lastT) / 1000);
      const velX = (rawX - this.lastX) / dtRaw;
      const velY = (rawY - this.lastY) / dtRaw;
      const rawSpeed = Math.sqrt(velX * velX + velY * velY);

      const rotation = this.opts.disableSway
        ? 0
        : computeSwayAngle(velX, velY);
      const ghostCount = this.opts.disableMotionBlur
        ? 0
        : computeCursorGhostCount(rawSpeed);
      const clickPulse = this.opts.disableClickPulse
        ? 0
        : this.computeClickPulse(tMs);
      const ripple = this.opts.disableClickPulse
        ? this.clickRippleIdle()
        : this.computeClickRipple(tMs);

      this.lastX = rawX;
      this.lastY = rawY;
      this.lastT = tMs;

      return {
        visible: true,
        x: rawX,
        y: rawY,
        rotation,
        ghostCount,
        clickPulse,
        clickX: ripple.x,
        clickY: ripple.y,
        clickRipple: ripple.ripple,
      };
    }

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
    const ripple = this.opts.disableClickPulse
      ? this.clickRippleIdle()
      : this.computeClickRipple(tMs);

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
      clickX: ripple.x,
      clickY: ripple.y,
      clickRipple: ripple.ripple,
    };
  }

  private computeClickRipple(
    tMs: number,
  ): { x: number; y: number; ripple: number } {
    let latest: CursorEvent | null = null;
    for (const e of this.events) {
      if (e.type === 'click' && e.t <= tMs) latest = e;
    }
    if (!latest) return this.clickRippleIdle();
    const elapsed = tMs - latest.t;
    if (elapsed >= CLICK_RIPPLE_DURATION_MS) return this.clickRippleIdle();
    const progress = elapsed / CLICK_RIPPLE_DURATION_MS;
    return {
      x: latest.x,
      y: latest.y,
      ripple: Math.sin(Math.PI * progress),
    };
  }

  private clickRippleIdle(): { x: number; y: number; ripple: number } {
    return { x: 0, y: 0, ripple: 0 };
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
    clickX: 0,
    clickY: 0,
    clickRipple: 0,
  };
}
