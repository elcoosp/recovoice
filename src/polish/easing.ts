export type EasingFunction = (t: number) => number;

export function linear(t: number): number {
  return t;
}

interface CubicBezierCoefficients {
  ax: number;
  bx: number;
  cx: number;
  ay: number;
  by: number;
  cy: number;
}

function coefficientsFor(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): CubicBezierCoefficients {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  return { ax, bx, cx, ay, by, cy };
}

function sampleX(coeffs: CubicBezierCoefficients, t: number): number {
  return ((coeffs.ax * t + coeffs.bx) * t + coeffs.cx) * t;
}

function sampleY(coeffs: CubicBezierCoefficients, t: number): number {
  return ((coeffs.ay * t + coeffs.by) * t + coeffs.cy) * t;
}

function sampleDerivativeX(coeffs: CubicBezierCoefficients, t: number): number {
  return (3 * coeffs.ax * t + 2 * coeffs.bx) * t + coeffs.cx;
}

export function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): EasingFunction {
  const coeffs = coefficientsFor(x1, y1, x2, y2);

  const solveForT = (x: number): number => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const currentX = sampleX(coeffs, t);
      const error = currentX - x;
      if (Math.abs(error) < 1e-6) return t;
      const derivative = sampleDerivativeX(coeffs, t);
      if (Math.abs(derivative) < 1e-6) break;
      t -= error / derivative;
    }

    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 32; i++) {
      const currentX = sampleX(coeffs, t);
      if (Math.abs(currentX - x) < 1e-6) return t;
      if (currentX < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };

  return (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const paramT = solveForT(t);
    return sampleY(coeffs, paramT);
  };
}

export const easeConnectedPan: EasingFunction = cubicBezier(0.1, 0, 0.2, 1);

export const easeOutScreenStudio: EasingFunction = cubicBezier(
  0.16,
  1,
  0.3,
  1,
);

export const easeInOutCubic: EasingFunction = cubicBezier(
  0.645,
  0.045,
  0.355,
  1,
);

/** Strongly eased in/out ramp: holds near the ends, glides in the middle. */
export const easeInOutQuint: EasingFunction = cubicBezier(
  0.83,
  0,
  0.17,
  1,
);

export const easeOutCubic: EasingFunction = cubicBezier(
  0.215,
  0.61,
  0.355,
  1,
);
