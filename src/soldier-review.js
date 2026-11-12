import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  createSoldierRig,
  cloneSoldierRig,
  animateSoldier,
  beginDeath,
  animateDeath,
} from "./soldier.js";
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: true,
});
const viewportHeight = () =>
  Math.max(200, innerHeight - document.querySelector("nav").offsetHeight);
renderer.setSize(innerWidth, viewportHeight());
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#343e44");
scene.add(new THREE.HemisphereLight(0xe3efff, 0x575044, 2));
const light = new THREE.DirectionalLight(0xffeed9, 3);
light.position.set(-3, 5, -4);
scene.add(light);
const camera = new THREE.PerspectiveCamera(
  38,
  innerWidth / viewportHeight(),
  0.05,
  300,
);
camera.position.set(2.5, 1.8, -3.4);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.95, 0);
controls.update();
addEventListener("resize", () => {
  camera.aspect = innerWidth / viewportHeight();
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, viewportHeight());
});
scene.add(new THREE.GridHelper(100, 100, 0x839391, 0x566360));
const owner = {},
  rigs = [],
  templates = new Map();
let elapsed = 0,
  prev = performance.now(),
  uniform = false;
const $ = (id) => document.getElementById(id);
function rebuild() {
  for (const r of rigs) {
    scene.remove(r.group);
    r.body.skeleton.dispose();
    r.marker.material.dispose();
    r.flash.material.dispose();
    r.uniformGeometry?.dispose();
  }
  rigs.length = 0;
  const count = +$("count").value,
    weaponId = $("weapon").value,
    classId =
      weaponId === "sv98"
        ? "recon"
        : weaponId === "mg36"
          ? "support"
          : weaponId === "mcx9"
            ? "medic"
            : "assault";
  for (let i = 0; i < count; i++) {
    const team = count === 1 ? 0 : i % 2,
      key = team + ":" + weaponId;
    let template = templates.get(key);
    if (!template) {
      template = createSoldierRig(owner, { team, classId, weaponId });
      templates.set(key, template);
    }
    const rig = cloneSoldierRig(template, { team, classId, weaponId });
    rig.marker.visible = false;
    rig.group.position.set(
      ((i % 8) - (Math.min(count, 8) - 1) / 2) * 1.2,
      0,
      Math.floor(i / 8) * 1.5,
    );
    rig.base = rig.group.position.clone();
    rig.simX = 0;
    rig.simZ = 0;
    rig.simYaw = 0;
    rig.modeTime = 0;
    rig.netX = 0;
    rig.netZ = 0;
    rig.netYaw = 0;
    scene.add(rig.group);
    rigs.push(rig);
  }
  setUniform();
}
function setUniform() {
  for (const rig of rigs) {
    if (uniform) {
      const g = rig.detailGeometry.clone(),
        idx = [],
        uv = g.attributes.uv;
      for (let i = 0; i < g.index.count; i += 3) {
        const a = g.index.getX(i);
        if (
          g.attributes.bodySurface
            ? g.attributes.bodySurface.getX(a) > 0
            : uv.getX(a) < 0.4
        )
          idx.push(g.index.getX(i), g.index.getX(i + 1), g.index.getX(i + 2));
      }
      g.setIndex(idx);
      rig.uniformGeometry = g;
    } else {
      rig.uniformGeometry?.dispose();
      rig.uniformGeometry = null;
    }
  }
}
$("uniform").onclick = () => {
  uniform = !uniform;
  setUniform();
};
$("count").onchange = $("weapon").onchange = rebuild;
$("view").onchange = () => {
  const p = {
    front: [0, 1, -4.2],
    back: [0, 1, 4.2],
    side: [4.2, 1, 0],
    perspective: [2.5, 1.8, -3.4],
  }[$("view").value];
  camera.position.set(...p);
  controls.target.set(0, 0.95, 0);
  controls.update();
};
const samples = [];
window.review = { rigs, renderer, scene, camera, samples, ready: false };

let accumulator = 0,
  lastMode = "",
  focusX = 0,
  focusZ = 0;
const contactMaterial = new THREE.MeshBasicMaterial({ color: 0x71ff94 });
const contactGeometry = new THREE.SphereGeometry(0.025, 8, 6);
const contacts = [
  new THREE.Mesh(contactGeometry, contactMaterial),
  new THREE.Mesh(contactGeometry, contactMaterial),
];
for (const marker of contacts) scene.add(marker);
function simulate(dt, mode) {
  for (const rig of rigs) {
    rig.modeTime += dt;
    const t = rig.modeTime;
    let vx = 0,
      vz = 0,
      yaw = 0;
    if (mode === "walk") vz = -1.4;
    if (mode === "run" || mode === "reload") vz = -6.3;
    if (mode === "sprint") vz = -9.765;
    if (mode === "crouch") vz = -2.8;
    if (mode === "strafe-left") vx = -3.1;
    if (mode === "strafe-right") vx = 3.1;
    if (mode === "back") vz = 3.1;
    if (mode === "diagonal") {
      vx = 3.1 * Math.SQRT1_2;
      vz = -3.1 * Math.SQRT1_2;
    }
    if (mode === "stop") vz = t % 6 < 3 ? -3.1 : 0;
    if (mode === "reverse") vz = t % 6 < 3 ? -3.1 : 3.1;
    if (mode === "turn") yaw = t % 6 < 3 ? 0 : Math.PI;
    rig.simX += vx * dt;
    rig.simZ += vz * dt;
    if ($("remote").checked) {
      if (Math.floor(t * 20) !== Math.floor((t - dt) * 20)) {
        rig.netX = rig.simX;
        rig.netZ = rig.simZ;
        rig.netYaw = yaw;
      }
      const blend = 1 - Math.exp(-dt * 18);
      rig.group.position.x +=
        (rig.base.x + rig.netX - rig.group.position.x) * blend;
      rig.group.position.z +=
        (rig.base.z + rig.netZ - rig.group.position.z) * blend;
      rig.group.rotation.y +=
        Math.atan2(
          Math.sin(rig.netYaw - rig.group.rotation.y),
          Math.cos(rig.netYaw - rig.group.rotation.y),
        ) * blend;
    } else {
      rig.group.position.set(rig.base.x + rig.simX, 0, rig.base.z + rig.simZ);
      rig.group.rotation.y = yaw;
    }
    rig.group.rotation.x = 0;
    rig.group.rotation.z = 0;
    const player = {
      x: rig.group.position.x,
      z: rig.group.position.z,
      y: 0,
      yaw: rig.group.rotation.y,
      pitch: 0,
      aim: mode === "idle",
      crouch: mode === "crouch",
      sprint: mode === "sprint",
      grounded: mode !== "jump",
      reloading: mode === "reload",
      reloadProgress: (t % 2) / 2,
      shotSeq: 0,
    };
    if (mode === "jump") rig.group.position.y = Math.sin(t * 3) ** 2 * 0.7;
    if (mode === "death") {
      if (!rig.death) beginDeath(rig, 0);
      animateDeath(rig, { age: t % 3 });
    } else if (mode === "rest") {
      rig.pose.position.set(0, 0, 0);
      rig.pose.rotation.set(0, 0, 0);
      rig.spine.rotation.set(0, 0, 0);
      rig.head.rotation.set(0, 0, 0);
      for (const b of [
        ...rig.arms,
        ...rig.elbows,
        ...rig.legs,
        ...rig.knees,
        ...rig.ankles,
        ...rig.wrists,
      ])
        b.quaternion.identity();
    } else {
      rig.death = null;
      animateSoldier(rig, { dt, player });
    }
    rig.body.geometry =
      rig.uniformGeometry ||
      [rig.detailGeometry, rig.mediumGeometry, rig.distantGeometry][
        +$("lod").value
      ];
  }
}
function frame(now) {
  const dt = Math.min(0.1, (now - prev) / 1000);
  prev = now;
  elapsed += dt;
  const mode = $("state").value;
  if (mode !== lastMode) {
    for (const rig of rigs) {
      rig.modeTime = 0;
      if (
        [mode, lastMode].some((state) => state === "death" || state === "rest")
      )
        rig.motion = null;
      rig.death = null;
    }
    lastMode = mode;
  }
  const start = performance.now(),
    step = 1 / +$("fps").value;
  accumulator += dt;
  while (accumulator >= step) {
    simulate(step, mode);
    accumulator -= step;
  }
  const cpu = performance.now() - start,
    rig = rigs[0];
  const fx = rig.group.position.x - rig.base.x,
    fz = rig.group.position.z - rig.base.z;
  camera.position.x += fx - focusX;
  camera.position.z += fz - focusZ;
  controls.target.x += fx - focusX;
  controls.target.z += fz - focusZ;
  focusX = fx;
  focusZ = fz;
  controls.update();
  for (let i = 0; i < 2; i++) {
    const foot = rig.motion?.feet[i];
    contacts[i].visible = $("diagnostics").checked && Boolean(foot);
    if (foot)
      contacts[i].position.set(
        foot.planted.x,
        0.035 + foot.lift,
        foot.planted.z,
      );
  }
  renderer.render(scene, camera);
  samples.push({
    cpu,
    frame: performance.now() - start,
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  });
  if (samples.length > 240) samples.shift();
  const m = rig.motion,
    g = m?.gait;
  $("info").textContent =
    $("diagnostics").checked && g
      ? g.state +
        " / " +
        g.direction +
        " · " +
        m.speed.toFixed(2) +
        " м/с\nшаг " +
        g.stepLength.toFixed(2) +
        " м · " +
        g.frequency.toFixed(2) +
        " шаг/с · фаза " +
        m.phase.toFixed(2)
      : [rig.detailGeometry, rig.mediumGeometry, rig.distantGeometry]
          .map((g) => g.index.count / 3)
          .join(" / ") + " tris";
  window.review.ready = true;
  if (!window.review.pause) requestAnimationFrame(frame);
}
window.review.simulate = simulate;
rebuild();
requestAnimationFrame(frame);
