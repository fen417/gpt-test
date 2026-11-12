export const SLIDE = Object.freeze({ duration: 1.05, cooldown: 1.8, friction: 7.5, minSpeed: 2.8, turnRate: .65 });

// Authoritative momentum is independent of camera yaw. Steering can bend the
// trajectory slowly, while reverse input adds braking instead of reversing it.
export function slideVelocity(player, input, weapon, dt, heightAt) {
  player.slideCooldown = Math.max(0, (player.slideCooldown ?? 0) - dt);
  const pressed = input.crouch && !player.crouchHeld;
  player.crouchHeld = input.crouch;
  if (!player.grounded) player.slideTime = 0;
  if (pressed && player.grounded && player.slideCooldown === 0 && player.wasSprinting &&
      player.moveSpeed >= weapon.speed * 1.2 && !input.jump) {
    const magnitude = Math.hypot(player.velocityX, player.velocityZ);
    if (magnitude > .1) {
      const impulse = Math.min(weapon.speed * 1.7, magnitude * 1.07);
      player.slideVx = player.velocityX / magnitude * impulse;
      player.slideVz = player.velocityZ / magnitude * impulse;
      player.slideTime = SLIDE.duration;
      player.slideCooldown = SLIDE.cooldown;
    }
  }
  player.wasSprinting = !player.slideTime && input.sprint && !input.crouch && !input.aim && !input.fire &&
    player.moveSpeed > weapon.speed * 1.1;
  if (!(player.slideTime > 0)) return null;
  const oldSpeed = Math.hypot(player.slideVx, player.slideVz);
  let yaw = Math.atan2(-player.slideVx, -player.slideVz), brake = 1;
  const wishX = -Math.sin(player.yaw) * input.forward + Math.cos(player.yaw) * input.strafe;
  const wishZ = -Math.cos(player.yaw) * input.forward - Math.sin(player.yaw) * input.strafe;
  if (Math.hypot(wishX, wishZ) > .1) {
    const desired = Math.atan2(-wishX, -wishZ), delta = Math.atan2(Math.sin(desired - yaw), Math.cos(desired - yaw));
    if (Math.abs(delta) > Math.PI * .6) brake = 1.8;
    else yaw += Math.max(-SLIDE.turnRate * dt, Math.min(SLIDE.turnRate * dt, delta));
  }
  const vx = -Math.sin(yaw), vz = -Math.cos(yaw);
  const grade = heightAt(player.x + vx * .5, player.z + vz * .5) - heightAt(player.x - vx * .5, player.z - vz * .5);
  const speed = Math.max(0, Math.min(weapon.speed * 1.8, oldSpeed - (SLIDE.friction * brake + Math.max(-1, Math.min(1, grade)) * 4) * dt));
  player.slideTime = Math.max(0, player.slideTime - dt);
  if (speed < SLIDE.minSpeed || !player.slideTime || input.jump) { player.slideTime = 0; return null; }
  player.slideVx = vx * speed; player.slideVz = vz * speed;
  return { vx: player.slideVx, vz: player.slideVz };
}
