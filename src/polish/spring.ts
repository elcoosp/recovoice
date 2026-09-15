export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
}

export const DEFAULT_SPRING_CONFIG: SpringConfig = {
  stiffness: 180,
  damping: 22,
  mass: 1,
};

export const SWAY_DAMPING_FACTOR = 0.9;
export const SWAY_MASS_FACTOR = 0.8;

export const SwaySpringConfig: SpringConfig = {
  stiffness: DEFAULT_SPRING_CONFIG.stiffness,
  damping: DEFAULT_SPRING_CONFIG.damping * SWAY_DAMPING_FACTOR,
  mass: DEFAULT_SPRING_CONFIG.mass * SWAY_MASS_FACTOR,
};

export function springConfigFromSmoothingFactor(
  smoothingFactor: number,
): SpringConfig {
  const clamped = Math.min(1, Math.max(0, smoothingFactor));
  const stiffness =
    DEFAULT_SPRING_CONFIG.stiffness * (1 - clamped * 0.85);
  const damping =
    DEFAULT_SPRING_CONFIG.damping * (1 - clamped * 0.5);
  return {
    stiffness,
    damping,
    mass: DEFAULT_SPRING_CONFIG.mass,
  };
}

export class Spring1D {
  position: number;
  velocity: number;
  target: number;
  private config: SpringConfig;

  constructor(config: SpringConfig, initial: number) {
    this.config = config;
    this.position = initial;
    this.velocity = 0;
    this.target = initial;
  }

  setTarget(value: number): void {
    this.target = value;
  }

  step(dt: number): void {
    const { stiffness, damping, mass } = this.config;
    const springForce = (this.target - this.position) * stiffness;
    const dampingForce = -this.velocity * damping;
    const acceleration = (springForce + dampingForce) / mass;
    this.velocity += acceleration * dt;
    this.position += this.velocity * dt;
  }
}
