// Projectile parameters are tuned for the game's map scale and match pacing.
export const BULLET_GRAVITY = 20;

export function bulletHeight(y, vy, age) {
  return y + vy * age - .5 * BULLET_GRAVITY * age * age;
}

export function zeroedBulletPitch(sightPitch, range, speed) {
  const rise = Math.sin(sightPitch) * range;
  const horizontal = Math.cos(sightPitch) * range;
  // Solve for the shorter flight to the point on the sight line.
  const term = speed * speed - BULLET_GRAVITY * rise;
  const discriminant = term * term - (BULLET_GRAVITY * range) ** 2;
  if (term <= 0 || discriminant < 0) return sightPitch;
  const timeSquared = 2 * range * range / (term + Math.sqrt(discriminant));
  return Math.atan2(rise + .5 * BULLET_GRAVITY * timeSquared, horizontal);
}

export function aimBullet(origin, target, height, speed) {
  const dx = target.x - origin.x, dz = target.z - origin.z;
  const travel = Math.hypot(dx, dz) / speed;
  const x = dx + (target.velocityX || 0) * travel;
  const z = dz + (target.velocityZ || 0) * travel;
  const flight = Math.hypot(x, z) / speed;
  return {
    yaw: Math.atan2(-x, -z),
    pitch: Math.atan2(target.y + height - origin.y + .5 * BULLET_GRAVITY * flight * flight, Math.hypot(x, z)),
  };
}
