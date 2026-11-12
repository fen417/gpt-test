// A step is one landing, a cycle is two. All distances are metres and times seconds.
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const angle = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const ANKLE = 0.109;

export function gaitForSpeed(speed, crouch, sprint, out) {
  const run = smooth(1.65, 4.8, speed),
    fast = smooth(4.8, 10.4, speed);
  let length = mix(mix(0.38, 0.78, smooth(0.15, 1.8, speed)), 1.25, run);
  // The game's 10 m/s sprint requires a flight phase: realistic leg excursion
  // cannot cover that speed with a grounded walk or a 1.3 m landing spacing.
  const runningFrequency = mix(3.35, 4.0, smooth(3.3, 6.3, speed));
  length = mix(length, speed / runningFrequency, smooth(3.3, 4.8, speed));
  length = mix(length, speed / 4.4, fast);
  length = mix(length, mix(0.34, 0.92, smooth(0.1, 3.5, speed)), crouch);
  out.stepLength = Math.max(0.28, length);
  out.frequency = speed / out.stepLength;
  out.duty = mix(mix(0.58, 0.3, run), 0.21, fast);
  out.duty = mix(out.duty, 0.48, crouch);
  out.duty = Math.min(out.duty, 0.8 / (2 * out.stepLength));
  out.lift = mix(mix(0.045, 0.105, run), 0.15, fast) * (1 - crouch * 0.4);
  out.run = run;
  out.fast = fast;
  out.state =
    speed < 0.12
      ? "idle"
      : crouch > 0.5
        ? "crouch"
        : sprint > 0.5
          ? "sprint"
          : run > 0.45
            ? "run"
            : "walk";
  return out;
}

function launch(
  foot,
  x,
  z,
  yaw,
  vx,
  vz,
  gait,
  settling,
  side,
  crouch,
  starting = false,
) {
  foot.start.x = foot.planted.x;
  foot.start.z = foot.planted.z;
  foot.startYaw = foot.yaw;
  foot.endYaw = foot.yaw + angle(foot.yaw, yaw - side * 0.065);
  foot.age = 0;
  foot.startLift = foot.lift;
  foot.duration = settling
    ? 0.2
    : clamp(((1 - gait.duty) * 2) / Math.max(0.3, gait.frequency), 0.12, 0.65);
  // The first push-off is a short acceleration step. Do not retain the slow
  // walk duration calculated while the velocity filter is still warming up.
  if (starting) foot.duration = Math.min(foot.duration, 0.18);
  foot.stepLift = settling ? 0.035 : gait.lift;
  foot.settling = settling;
  foot.swinging = true;
  const stance = (gait.duty * 2) / Math.max(0.3, gait.frequency);
  const lead = settling ? 0 : Math.min(0.4, Math.hypot(vx, vz) * stance * 0.5);
  const speed = Math.hypot(vx, vz),
    cos = Math.cos(yaw),
    sin = Math.sin(yaw);
  const lateral = side * (0.106 + 0.018 * crouch);
  foot.end.x = x + lateral * cos + (speed > 0.01 ? (vx / speed) * lead : 0);
  foot.end.z = z - lateral * sin + (speed > 0.01 ? (vz / speed) * lead : 0);
  foot.lead = lead;
}

// Only swing feet move in world coordinates. Stance feet keep their touchdown
// point until toe-off. The renderer supplies its interpolated root, not packets.
export function updateFootContacts(motion, position, yaw, dt) {
  const gait = gaitForSpeed(
    motion.speed,
    motion.crouch,
    motion.sprint,
    motion.gait,
  );
  const sideSpeed = motion.vx * Math.cos(yaw) - motion.vz * Math.sin(yaw);
  const forwardSpeed = -motion.vx * Math.sin(yaw) - motion.vz * Math.cos(yaw);
  const lateral = Math.abs(sideSpeed) / Math.max(0.1, motion.speed);
  gait.duty = mix(
    gait.duty,
    Math.min(gait.duty, 0.27),
    smooth(0.3, 0.8, lateral),
  );
  gait.direction =
    lateral > 0.75
      ? sideSpeed < 0
        ? "left"
        : "right"
      : forwardSpeed < -0.1
        ? "back"
        : lateral > 0.25
          ? "diagonal"
          : "forward";
  if (motion.air > 0.5) gait.state = "air";
  else if (motion.slide > 0.25) gait.state = "slide";
  const feet = motion.feet;
  const moving =
    motion.speed > 0.14 &&
    motion.stillTime < 0.09 &&
    motion.air < 0.5 &&
    motion.slide < 0.25;
  const starting = moving && !motion.contactMoving;
  let takeoffGait = gait,
    takeoffVx = motion.vx,
    takeoffVz = motion.vz;
  if (starting) {
    const observedSpeed = Math.hypot(motion.dx, motion.dz) / dt;
    const velocityScale = Math.min(1, 12 / Math.max(0.001, observedSpeed));
    takeoffVx = (motion.dx / dt) * velocityScale;
    takeoffVz = (motion.dz / dt) * velocityScale;
    motion.takeoffGait ??= {};
    takeoffGait = gaitForSpeed(
      Math.min(12, Math.max(observedSpeed, motion.speed)),
      motion.crouch,
      motion.sprint,
      motion.takeoffGait,
    );
    // A stop/turn correction must hand over immediately when locomotion resumes.
    if (feet[motion.nextFoot].swinging) motion.nextFoot = 1 - motion.nextFoot;
    let resumedCorrection = false;
    for (let i = 0; i < feet.length; i++)
      if (feet[i].swinging && feet[i].settling) {
        launch(
          feet[i],
          position.x - motion.dx,
          position.z - motion.dz,
          yaw + motion.hipYaw,
          takeoffVx,
          takeoffVz,
          takeoffGait,
          false,
          i ? 1 : -1,
          motion.crouch,
          true,
        );
        motion.nextFoot = 1 - i;
        resumedCorrection = true;
      }
    motion.stepTimer = resumedCorrection
      ? 1 / Math.max(0.3, takeoffGait.frequency)
      : 0;
  }
  const substeps = Math.max(1, Math.ceil(dt / (1 / 120))),
    h = dt / substeps;
  const previousYaw = motion.contactYaw ?? yaw;
  for (let sub = 1; sub <= substeps; sub++) {
    const fraction = sub / substeps;
    const x = position.x - motion.dx * (1 - fraction),
      z = position.z - motion.dz * (1 - fraction);
    const rootYaw = previousYaw + angle(previousYaw, yaw) * fraction;
    const footYaw = rootYaw + motion.hipYaw,
      cos = Math.cos(rootYaw),
      sin = Math.sin(rootYaw);
    if (moving) {
      motion.phase = (motion.phase + h * gait.frequency * 0.5) % 1;
      motion.stepTimer -= h;
      if (motion.stepTimer <= 0) {
        const i = motion.nextFoot,
          foot = feet[i];
        if (!foot.swinging) {
          launch(
            foot,
            x,
            z,
            footYaw,
            starting ? takeoffVx : motion.vx,
            starting ? takeoffVz : motion.vz,
            starting ? takeoffGait : gait,
            false,
            i ? 1 : -1,
            motion.crouch,
            starting,
          );
          motion.nextFoot = 1 - i;
          motion.stepTimer =
            1 / Math.max(0.3, (starting ? takeoffGait : gait).frequency);
        }
      }
    } else motion.stepTimer = 0;

    for (let i = 0; i < 2; i++) {
      const foot = feet[i],
        side = i ? 1 : -1;
      let dx = foot.planted.x - x,
        dz = foot.planted.z - z;
      const localX = dx * cos - dz * sin,
        localZ = dx * sin + dz * cos;
      // Catch an acceleration/reversal before a locked leg leaves IK reach.
      if (
        moving &&
        !foot.swinging &&
        Math.hypot(localX - side * 0.1, localZ) > 0.47
      ) {
        launch(
          foot,
          x,
          z,
          footYaw,
          motion.vx,
          motion.vz,
          gait,
          false,
          side,
          motion.crouch,
        );
        motion.nextFoot = 1 - i;
        motion.stepTimer = 1 / Math.max(0.3, gait.frequency);
      }
      if (
        !moving &&
        motion.air < 0.5 &&
        motion.slide < 0.25 &&
        !foot.swinging &&
        !feet[1 - i].swinging
      ) {
        const width = side * (0.106 + 0.018 * motion.crouch);
        const tx = x + width * Math.cos(footYaw),
          tz = z - width * Math.sin(footYaw);
        if (
          Math.hypot(foot.planted.x - tx, foot.planted.z - tz) > 0.1 ||
          Math.abs(angle(foot.yaw, footYaw - side * 0.065)) > 0.32
        )
          launch(foot, x, z, footYaw, 0, 0, gait, true, side, motion.crouch);
      }
      if (foot.swinging) {
        foot.age += h;
        const t = clamp(foot.age / foot.duration, 0, 1),
          ease = t * t * (3 - 2 * t);
        if (!foot.settling) {
          // Predict touchdown only while airborne. Direction changes update the
          // target without dragging a supporting foot or snapping its phase.
          const remaining = foot.duration - foot.age,
            speed = Math.hypot(motion.vx, motion.vz);
          const width = side * (0.106 + 0.018 * motion.crouch);
          const leadX = speed > 0.01 ? (motion.vx / speed) * foot.lead : 0;
          const leadZ = speed > 0.01 ? (motion.vz / speed) * foot.lead : 0;
          const response = 1 - Math.exp(-h * 24);
          foot.end.x = mix(
            foot.end.x,
            x +
              motion.vx * Math.max(0, remaining) +
              width * Math.cos(footYaw) +
              leadX,
            response,
          );
          foot.end.z = mix(
            foot.end.z,
            z +
              motion.vz * Math.max(0, remaining) -
              width * Math.sin(footYaw) +
              leadZ,
            response,
          );
        }
        foot.planted.x = mix(foot.start.x, foot.end.x, ease);
        foot.planted.z = mix(foot.start.z, foot.end.z, ease);
        foot.yaw = mix(foot.startYaw, foot.endYaw, ease);
        foot.lift =
          foot.startLift * (1 - ease) +
          Math.sin(Math.PI * t) ** 1.3 * foot.stepLift;
        if (t >= 1) {
          foot.swinging = false;
          foot.lift = 0;
          foot.landings++;
        }
      } else foot.lift *= Math.exp(-h * 24);
      dx = foot.planted.x - x;
      dz = foot.planted.z - z;
      let fx = dx * cos - dz * sin,
        fz = dx * sin + dz * cos;
      if (foot.swinging) {
        // Anatomical excursion is separate from root distance between landings.
        const correction = smooth(0, 0.35, foot.age / foot.duration);
        fx = mix(
          fx,
          side < 0 ? Math.min(fx, -0.025) : Math.max(fx, 0.025),
          correction,
        );
        const reach = Math.hypot(fx - side * 0.1, fz);
        if (reach > 0.46) {
          fx = side * 0.1 + ((fx - side * 0.1) * 0.46) / reach;
          fz *= 0.46 / reach;
        }
        foot.planted.x = x + fx * cos + fz * sin;
        foot.planted.z = z - fx * sin + fz * cos;
      }
      if (motion.air > 0.5 || motion.slide > 0.25) {
        // No ground locks carried across a jump, landing or vehicle slide.
        fx = side * 0.11;
        fz = i ? 0.1 : -0.12;
        foot.lift = motion.air > 0.5 ? (i ? 0.16 : 0.09) : 0;
        foot.planted.x = x + fx * cos + fz * sin;
        foot.planted.z = z - fx * sin + fz * cos;
        foot.swinging = false;
      }
      foot.local.x = fx;
      foot.local.z = fz;
      foot.local.y = ANKLE + foot.lift;
    }
  }
  motion.contactYaw = yaw;
  motion.contactMoving = moving;
}
