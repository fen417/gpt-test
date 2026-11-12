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
renderer.setSize(innerWidth, innerHeight - 60);
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
  innerWidth / (innerHeight - 60),
  0.05,
  300,
);
camera.position.set(2.5, 1.8, -3.4);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.95, 0);
controls.update();
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
function frame(now) {
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  elapsed += dt;
  const mode = $("state").value;
  const start = performance.now();
  for (const rig of rigs) {
    rig.group.position.copy(rig.base);
    rig.group.rotation.x = 0;
    rig.group.rotation.z = 0;
    if (mode === "walk" || mode === "sprint")
      rig.group.position.z = -elapsed * (mode === "sprint" ? 6 : 2);
    const player = {
      x: rig.group.position.x,
      z: rig.group.position.z,
      y: 0,
      yaw: 0,
      pitch: 0,
      aim: mode === "idle",
      crouch: mode === "crouch",
      sprint: mode === "sprint",
      grounded: mode !== "jump",
      reloading: mode === "reload",
      reloadProgress: (elapsed % 2) / 2,
      shotSeq: 0,
    };
    if (mode === "jump")
      rig.group.position.y = Math.sin(elapsed * 3) ** 2 * 0.7;
    if (mode === "death") {
      if (!rig.death) beginDeath(rig, 0);
      animateDeath(rig, { age: elapsed % 3 });
    } else if (mode === "rest") {
      rig.pose.position.set(0, 0, 0);
      rig.pose.rotation.set(0, 0, 0);
      rig.spine.rotation.set(0, 0, 0);
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
    if (mode === "walk" || mode === "sprint") rig.group.position.copy(rig.base);
    rig.body.geometry =
      rig.uniformGeometry ||
      [rig.detailGeometry, rig.mediumGeometry, rig.distantGeometry][
        +$("lod").value
      ];
  }
  const cpu = performance.now() - start;
  renderer.render(scene, camera);
  samples.push({
    cpu,
    frame: performance.now() - start,
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  });
  if (samples.length > 240) samples.shift();
  const r = rigs[0];
  $("info").textContent =
    `LOD: ${[r.detailGeometry, r.mediumGeometry || r.detailGeometry, r.distantGeometry].map((g) => g.index.count / 3).join(" / ")} tris\n${renderer.info.render.calls} calls · ${cpu.toFixed(2)} ms animation`;
  window.review.ready = true;
  if (!window.review.pause) requestAnimationFrame(frame);
}
rebuild();
requestAnimationFrame(frame);
