import { gaitForSpeed, updateFootContacts } from "../src/soldier-locomotion.js";
import assert from "node:assert/strict";
import { test } from "node:test";
const point = () => ({ x: 0, y: 0, z: 0 });
function makeMotion() {
  return {
    feet: [-1, 1].map((side) => ({
      planted: { x: side * 0.106, y: 0, z: 0 },
      start: point(),
      end: point(),
      local: point(),
      yaw: 0,
      age: 0,
      lift: 0,
      swinging: false,
      landings: 0,
    })),
    phase: 0.05,
    stepTimer: 0,
    nextFoot: 0,
    gait: {},
    speed: 0,
    vx: 0,
    vz: 0,
    dx: 0,
    dz: 0,
    air: 0,
    slide: 0,
    crouch: 0,
    sprint: 0,
    stillTime: 0,
    hipYaw: 0,
  };
}
function run(
  fps,
  speed,
  {
    direction = [0, -1],
    crouch = 0,
    sprint = 0,
    remote = false,
    stop = Infinity,
    turn = Infinity,
    reverse = Infinity,
    duration = 8,
  } = {},
) {
  const m = makeMotion(),
    p = point(),
    dt = 1 / fps;
  let yaw = 0,
    maxSlip = 0,
    maxReach = 0,
    maxJump = 0,
    phaseTravel = 0,
    lastPhase = m.phase,
    contactFrames = 0;
  for (let f = 0; f < duration * fps; f++) {
    const t = f * dt,
      sign = t >= reverse ? -1 : 1,
      v = t >= stop ? 0 : speed;
    const tx = direction[0] * v * sign,
      tz = direction[1] * v * sign;
    const oldx = p.x,
      oldz = p.z;
    if (remote) {
      const sample = Math.floor(t * 20) / 20;
      p.x += (sample * tx - p.x) * (1 - Math.exp(-dt * 18));
      p.z += (sample * tz - p.z) * (1 - Math.exp(-dt * 18));
    } else {
      p.x += tx * dt;
      p.z += tz * dt;
    }
    m.dx = p.x - oldx;
    m.dz = p.z - oldz;
    const response = 1 - Math.exp(-dt * 22);
    m.vx += (m.dx / dt - m.vx) * response;
    m.vz += (m.dz / dt - m.vz) * response;
    m.speed += (Math.hypot(m.dx, m.dz) / dt - m.speed) * response;
    m.stillTime = Math.hypot(m.dx, m.dz) / dt < 0.035 ? m.stillTime + dt : 0;
    m.crouch = crouch;
    m.sprint = sprint;
    if (t >= turn) yaw = Math.PI;
    const before = m.feet.map((foot) => ({
      x: foot.planted.x,
      z: foot.planted.z,
      swinging: foot.swinging,
      n: foot.landings,
      fx: foot.local.x,
      fz: foot.local.z,
    }));
    updateFootContacts(m, p, yaw, dt);
    phaseTravel += (m.phase - lastPhase + 1) % 1;
    lastPhase = m.phase;
    m.feet.forEach((foot, i) => {
      assert.ok(
        [foot.local.x, foot.local.y, foot.local.z, foot.yaw].every(
          Number.isFinite,
        ),
      );
      maxReach = Math.max(
        maxReach,
        Math.hypot(foot.local.x - (i ? 0.1 : -0.1), foot.local.z),
      );
      maxJump = Math.max(
        maxJump,
        Math.hypot(foot.local.x - before[i].fx, foot.local.z - before[i].fz),
      );
      if (
        !foot.swinging &&
        !before[i].swinging &&
        foot.landings === before[i].n
      ) {
        contactFrames++;
        maxSlip = Math.max(
          maxSlip,
          Math.hypot(
            foot.planted.x - before[i].x,
            foot.planted.z - before[i].z,
          ),
        );
      }
    });
  }
  return {
    fps,
    speed,
    landings: m.feet.reduce((n, f) => n + f.landings, 0),
    frequency: m.gait.frequency,
    length: m.gait.stepLength,
    maxSlip,
    maxReach,
    maxJump,
    phaseTravel,
    contactFrames,
    settled: m.feet.every((f) => !f.swinging),
    m,
  };
}
const reports = [],
  startupReports = [];
for (const [name, speed, options] of [
  ["slow", 0.7, {}],
  ["walk", 1.4, {}],
  ["run", 3.1, {}],
  ["game-run", 6.3, {}],
  ["sprint", 9.765, { sprint: 1 }],
  ["strafe", 3.1, { direction: [1, 0] }],
  ["back", 3.1, { direction: [0, 1] }],
  ["diagonal", 3.1, { direction: [Math.SQRT1_2, -Math.SQRT1_2] }],
  ["crouch", 2.8, { crouch: 1 }],
  ["stop", 3.1, { stop: 3 }],
  ["pivot", 0, { turn: 3 }],
  ["reverse", 3.1, { reverse: 3 }],
  ["network", 6.3, { remote: true }],
]) {
  test(name + " contacts and FPS independence", () => {
    const runs = [30, 60, 120].map((fps) => run(fps, speed, options));
    for (const r of runs) {
      assert.ok(r.maxSlip < 1e-7, "world-space stance slip " + r.maxSlip);
      assert.ok(r.maxReach < 0.63, "leg overreach " + r.maxReach);
      assert.ok(r.maxJump < 0.7, "foot discontinuity " + r.maxJump);
      if (name === "stop" || name === "pivot")
        assert.ok(r.settled, "did not settle");
      reports.push({ name, ...r, m: undefined });
    }
    assert.ok(
      Math.max(...runs.map((r) => r.landings)) -
        Math.min(...runs.map((r) => r.landings)) <=
        2,
      "FPS-dependent landing count",
    );
    assert.ok(
      Math.max(...runs.map((r) => r.phaseTravel)) -
        Math.min(...runs.map((r) => r.phaseTravel)) <
        0.3,
      "FPS-dependent phase",
    );
  });
}
test("one cycle equals two steps", () => {
  const g = gaitForSpeed(1.4, 0, 0, {});
  assert.ok(Math.abs(g.frequency * g.stepLength - 1.4) < 1e-12);
  const r = run(120, 1.4, { duration: 20 });
  assert.ok(Math.abs(r.landings / 20 - g.frequency) < 0.2, JSON.stringify(r));
});
process.on("exit", () => {
  if (process.env.STARTUP_REPORT)
    console.log("STARTUP_REPORT " + JSON.stringify(startupReports));
  if (process.env.GAIT_REPORT)
    console.log("GAIT_REPORT " + JSON.stringify(reports));
});

test("jump releases old contacts and landing recovers", () => {
  const m = makeMotion(),
    p = point();
  for (let i = 0; i < 100; i++) {
    m.dx = 0;
    m.dz = -0.05;
    p.z -= 0.05;
    m.vz = -3;
    m.speed = 3;
    m.air = i >= 20 && i < 50 ? 1 : 0;
    updateFootContacts(m, p, 0, 1 / 60);
    for (const f of m.feet) assert.ok(Math.hypot(f.local.x, f.local.z) < 0.65);
  }
  assert.ok(m.feet.some((f) => f.landings > 0));
});
test("slide suspends stepping without resetting cycle", () => {
  const m = makeMotion(),
    p = point();
  m.phase = 0.37;
  m.slide = 1;
  m.speed = 6;
  m.vz = -6;
  for (let i = 0; i < 60; i++) {
    m.dx = 0;
    m.dz = -0.1;
    p.z -= 0.1;
    updateFootContacts(m, p, 0, 1 / 60);
  }
  assert.equal(m.phase, 0.37);
  assert.ok(m.feet.every((f) => !f.swinging));
});

function startup(fps, speed, { remote = false, resume = false } = {}) {
  const m = makeMotion(),
    p = point(),
    dt = 1 / fps;
  let time = 0,
    firstLift = Infinity,
    firstLanding = Infinity,
    firstDistance = Infinity,
    settlingOnFirstMovement = null;
  // Idle long enough to reproduce the zero-speed/settling state before a start.
  for (let i = 0; i < fps; i++) updateFootContacts(m, p, 0, dt);
  if (resume) {
    const foot = m.feet[0];
    foot.swinging = true;
    foot.settling = true;
    foot.duration = 0.2;
    foot.age = 0.01;
    foot.startLift = 0;
    foot.stepLift = 0.035;
    foot.start.x = foot.planted.x;
    foot.start.z = foot.planted.z;
    foot.end.x = foot.planted.x;
    foot.end.z = foot.planted.z - 0.12;
    foot.startYaw = foot.endYaw = foot.yaw;
  }
  for (let i = 0; i < fps; i++) {
    time += dt;
    const before = p.z;
    if (remote)
      p.z +=
        ((-speed * Math.floor(time * 20 + 1e-8)) / 20 - p.z) *
        (1 - Math.exp(-dt * 18));
    else p.z = -speed * time;
    m.dx = 0;
    m.dz = p.z - before;
    const response = 1 - Math.exp(-dt * 22);
    m.vz += (m.dz / dt - m.vz) * response;
    m.speed += (Math.abs(m.dz) / dt - m.speed) * response;
    m.stillTime = Math.abs(m.dz) / dt < 0.035 ? m.stillTime + dt : 0;
    updateFootContacts(m, p, 0, dt);
    if (m.speed > 0.14 && settlingOnFirstMovement === null)
      settlingOnFirstMovement = m.feet.some((f) => f.swinging && f.settling);
    if (
      Math.max(...m.feet.map((f) => f.lift)) >= 0.02 &&
      firstLift === Infinity
    )
      firstLift = time;
    if (m.feet.some((f) => f.landings > 0) && firstLanding === Infinity) {
      firstLanding = time;
      firstDistance = Math.abs(p.z);
    }
  }
  return {
    fps,
    speed,
    remote,
    resume,
    firstLift,
    firstLanding,
    firstDistance,
    settlingOnFirstMovement,
  };
}
for (const remote of [false, true])
  for (const resume of [false, true]) {
    test(`immediate start ${remote ? "snapshots" : "direct"} ${resume ? "from settling" : "from idle"}`, () => {
      for (const fps of [20, 30, 60, 120])
        for (const speed of [6.3, 9.765]) {
          const r = startup(fps, speed, { remote, resume });
          startupReports.push(r);
          assert.equal(
            r.settlingOnFirstMovement,
            false,
            "stale settling step " + JSON.stringify(r),
          );
          assert.ok(
            r.firstLift <= (remote ? 0.15 : 0.085),
            "late first lift " + JSON.stringify(r),
          );
          assert.ok(
            r.firstLanding <= (remote ? 0.29 : 0.23),
            "late first contact " + JSON.stringify(r),
          );
        }
    });
  }
