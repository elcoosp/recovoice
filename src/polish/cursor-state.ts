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
}

const CLICK_PULSE_DURATION_MS = 250;
const FRAME_MS = 16;

export class CursorStateComputer {
  private readonly events: CursorEvent[];
  private readonly springX: Spring1D;
  private readonly springY: Spring1D;
  private lastT = 0;
  private lastX = 0;
  private lastY = 0;
  private hasSample = false;

  constructor(telemetry: CursorTelemetry, options: CursorStateOptions) {
    this.events = [...telemetry.events].sort((a, b) => a.t - b.t);
    const config = springConfigFromSmoothingFactor(options.smoothingFactor);
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
    const substepMs = FRAME_MS;
    const steps = Math.max(1, Math.ceil((dtSec * 1000) / substepMs));
    const stepDt = dtSec / steps;
    for (let i = 0; i < steps; i++) {
      this.springX.step(stepDt);
      this.springY.step(stepDt);
    }

    const currentX = this.springX.position;
    const currentY = this.springY.position;
    const velocityX = (currentX - this.lastX) / dtSec;
    const velocityY = (currentY - this.lastY) / dtSec;

    const rotation = computeSwayAngle(velocityX, velocityY);
    const ghostCount = computeCursorGhostCount(
      Math.sqrt(velocityX * velocityX + velocityY * velocityY),
    );
    const clickPulse = this.computeClickPulse(tMs);

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
