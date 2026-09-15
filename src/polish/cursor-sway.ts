export const MAX_ROTATION = Math.PI / 18;
export const SPEED_REFERENCE = 1400;
export const VERTICAL_WEIGHT = 0.65;
export const INTENSITY_SCALE = 3;
export const SWAY_THRESHOLD = 10;

export function computeSwayAngle(
  velocityX: number,
  velocityY: number,
): number {
  const speed = Math.sqrt(
    velocityX * velocityX + velocityY * velocityY,
  );
  if (speed < SWAY_THRESHOLD) return 0;

  const weightedY = velocityY * VERTICAL_WEIGHT;
  const weightedMagnitude = Math.sqrt(
    velocityX * velocityX + weightedY * weightedY,
  );
  const effectiveMagnitude = weightedMagnitude / speed;

  const speedFactor = Math.min(1, speed / SPEED_REFERENCE);
  const sign =
    Math.sign(velocityX) || Math.sign(velocityY) || 0;

  return sign * MAX_ROTATION * effectiveMagnitude * speedFactor;
}
