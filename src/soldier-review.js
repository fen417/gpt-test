import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { InfantryAssets } from './infantry-assets.js';
import { createInfantry, disposeInfantry, infantryAction, infantryDeath, infantryHit, infantrySeat, setInfantryLod, setInfantryWeapon, updateInfantry } from './infantry.js';
import { VEHICLE_TYPES } from '../shared/vehicles.js';

const $ = id => document.getElementById(id);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x343d44);
scene.add(new THREE.HemisphereLight(0xe1edff, 0x7e6f61, 2.3));
const sun = new THREE.DirectionalLight(0xffe9ce, 3.0);
sun.position.set(-3, 6, -4);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xd1e4ff, 1.1);
fill.position.set(3, 4, 2);
scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshStandardMaterial({ color: 0x3b4244 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -.016;
scene.add(floor);
const shadowCanvas = document.createElement('canvas');
shadowCanvas.width = shadowCanvas.height = 64;
const shade = shadowCanvas.getContext('2d');
const gradient = shade.createRadialGradient(32, 32, 6, 32, 32, 32);
gradient.addColorStop(0, 'rgba(12,16,18,.55)');
gradient.addColorStop(1, 'rgba(12,16,18,0)');
shade.fillStyle = gradient;
shade.fillRect(0, 0, 64, 64);
const shadowMaterial = new THREE.MeshBasicMaterial({
  map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false,
});
const shadowGeometry = new THREE.PlaneGeometry(1.2, 1.28);

scene.add(new THREE.GridHelper(400, 400, 0x586468, 0x475256));
const camera = new THREE.PerspectiveCamera(38, 1, .035, 600);
const controls = new OrbitControls(camera, renderer.domElement);
const focus = new THREE.Vector3(), offset = new THREE.Vector3();
function size() {
  const height = Math.max(240, innerHeight - $('toolbar').offsetHeight);
  renderer.setSize(innerWidth, height);
  camera.aspect = innerWidth / height;
  camera.updateProjectionMatrix();
}
function view() {
  offset.set(...({
    perspective: [2.45, .85, -3.7], front: [0, .23, -3.8],
    side: [4.05, .28, 0], back: [0, .24, 3.8],
  }[$('view').value]));
  if (rigs.length > 2) offset.multiplyScalar(2.2);
  camera.position.copy(focus).add(offset);
  controls.target.copy(focus);
  controls.update();
}
addEventListener('resize', size);
const assets = new InfantryAssets(renderer), rigs = [], samples = [];
const review = window.review = { rigs, samples, renderer, scene, camera, ready: false, step };
let last = performance.now(), change = 0, accumulator = 0, elapsed = 0, moving = [0, 0];
let state = $('state').value;
let tracking = false;
let rebuildId = 0;
async function rebuild() {
  const ticket = ++rebuildId;
  const count = Number($('count').value), weaponId = $('weapon').value;
  review.ready = false;
  $('info').textContent = 'Загрузка моделей…';
  try {
    await Promise.all([assets.load(0, weaponId), assets.load(1, weaponId), assets.load(0, 'p19')]);
    if (ticket !== rebuildId) return;
    for (const actor of rigs) { actor.shadow.removeFromParent(); disposeInfantry(actor); }
    rigs.length = samples.length = 0;
    for (let i = 0; i < count; ++i) {
      const team = i % 2;
      const rig = createInfantry(assets.get(team, weaponId), { id: 'review-' + i, team, classId: 'assault', weaponId });
      rig.base = [(i % Math.min(count, 8) - (Math.min(count, 8) - 1) / 2) * 1.16, Math.floor(i / 8) * 1.45];
      if (count === 2 && $('view').value === 'side') rig.base = [0, i === 0 ? -1 : 1];
      rig.marker.visible = false;
      rig.shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
      rig.shadow.rotation.x = -Math.PI / 2;
      scene.add(rig.group, rig.shadow);
      rigs.push(rig);
    }
    elapsed = change = 0;
    moving = [0, 0];
    focus.set(0, .9, 0);
    view();
    step(1 / 60);
    review.ready = true;
  } catch (error) {
    $('info').textContent = error.message;
    review.error = String(error);
    console.error(error);
  }
}
const packet = [0, 0];
let shot = 0;
function step(dt) {
  const next = $('state').value;
  if (state !== next) {
    state = next;
    change = elapsed;
  }
  const t = elapsed - change;
  const speed = Number($('speed').value);
  const rate = Number($('fps').value);
  const remote = $('remote').checked;
  const modeSpeed = {
    walk: [0, -1.4], run: [0, -6.3], sprint: [0, -9.765],
    'strafe-left': [-3.1, 0], 'strafe-right': [3.1, 0], back: [0, 3.1],
    diagonal: [2.2, -2.2], crouch: [0, -2.45], slide: [0, -6 * Math.max(0, 1 - t % 3)],
    stop: [0, t % 4 < 2 ? -3.1 : 0], reverse: [0, t % 4 < 2 ? -3.1 : 3.1], reload: [0, -2.5],
  }[state] ?? [0, 0];
  moving[0] += modeSpeed[0] * speed * dt;
  moving[1] += modeSpeed[1] * speed * dt;
  if (!remote || Math.floor(elapsed * 20) !== Math.floor((elapsed + dt) * 20)) {
    packet[0] = moving[0];
    packet[1] = moving[1];
  }
  const lod = Number($('lod').value);
  const blend = remote ? 1 - Math.exp(-dt * 18) : 1;
  const pitch = state === 'aim' ? Math.sin(t * 1.45) * .42 : 0;
  if (state === 'shoot' && Math.floor(t * 8) !== Math.floor((t - dt) * 8)) shot++;
  for (const rig of rigs) {
    const jump = state === 'jump' && t % 2.2 < .72;
    const jumpY = jump ? 4.2 * (t % 2.2) * (.72 - t % 2.2) : 0;
    const yaw = state === 'aim' ? Math.sin(t) * .45 : state === 'turn' ? Math.sin(t * .8) * .8 : 0;
    rig.group.position.x = THREE.MathUtils.lerp(rig.group.position.x, rig.base[0] + packet[0], rig.initialized ? blend : 1);
    rig.group.position.y = jumpY;
    rig.group.position.z = THREE.MathUtils.lerp(rig.group.position.z, rig.base[1] + packet[1], rig.initialized ? blend : 1);
    rig.shadow.position.set(rig.group.position.x, -.009, rig.group.position.z);
    rig.shadow.scale.setScalar(1 + jumpY * .28);
    const yawDelta = Math.atan2(Math.sin(yaw - rig.group.rotation.y), Math.cos(yaw - rig.group.rotation.y));
    rig.group.rotation.y += Math.sign(yawDelta) * Math.max(0, Math.abs(yawDelta) - .30) * (1 - Math.exp(-dt * 12));
    setInfantryLod(rig, lod, false);
    if (state === 'death') infantryDeath(rig, t % 4);
    else if (state === 'seat') infantrySeat(rig, {
      vehicle: { type: 'tank' }, seat: VEHICLE_TYPES.tank.seats[2], index: 2, relativeYaw: 0, pitch, shotSeq: shot, dt,
    });
    else {
      const reloading = state === 'reload' && t % 3 < 2;
      const switching = state === 'switch', sidearm = switching && t % 3 > 1.16;
      const weaponId = sidearm ? 'p19' : $('weapon').value;
      if (rig.weaponId !== weaponId) setInfantryWeapon(rig, assets.get(rig.team, weaponId).gun, weaponId);
      if (state === 'throw' && Math.floor(t / 2) !== Math.floor((t - dt) / 2)) infantryAction(rig);
      if (state === 'hit' && Math.floor(t / 2) !== Math.floor((t - dt) / 2)) infantryHit(rig);
      updateInfantry(rig, {
        yaw, pitch, shotSeq: shot, sprint: state === 'sprint', crouch: state.startsWith('crouch'),
        sliding: state === 'slide' && t % 3 < .85, grounded: !jump, aim: state === 'aim' || state === 'shoot',
        reloading, reloadProgress: reloading ? (t % 3) / 2 : 0,
        equipTime: switching ? Math.max(0, .38 - ((t + 2) % 3)) : 0,
      }, dt, !rig.initialized);
    }
    rig.initialized = true;
  }
  if (rigs.length && $('diagnostics').checked) {
    const rig = rigs[0];
    for (const [side, leg] of rig.legs.entries()) {
      if (leg.weight <= .5) continue;
      samples.push({ time: elapsed, mode: state, fps: rate, remote, side, x: leg.foot.getWorldPosition(new THREE.Vector3()).toArray(),
        anchor: leg.anchor.toArray(), weight: leg.weight });
    }
    if (samples.length > 3600) samples.splice(0, samples.length - 3600);
  }
  elapsed += dt;
}
function render(now) {
  const dt = Math.min((now - last) / 1000, .1);
  last = now;
  if (review.ready && !$('pause').checked) {
    const quantum = 1 / Number($('fps').value);
    accumulator += dt;
    while (accumulator > quantum) {
      step(quantum);
      accumulator -= quantum;
    }
  }
  if (rigs.length) {
    const center = rigs[0].group.position;
    const x = center.x - rigs[0].base[0], z = center.z - rigs[0].base[1];
    camera.position.x += x - focus.x;
    camera.position.z += z - focus.z;
    focus.set(x, .9, z);
    controls.target.copy(focus);
  }
  controls.update();
  renderer.render(scene, camera);
  if (review.ready) {
    const { calls, triangles } = renderer.info.render;
    $('info').textContent = calls + ' выз. · ' + triangles.toLocaleString('ru') + ' треуг.';
  }
  requestAnimationFrame(render);
}
$('view').onchange = () => {
  if (rigs.length === 2) {
    for (const [i, rig] of rigs.entries()) {
      rig.base = $('view').value === 'side' ? [0, i ? 1 : -1] : [i ? .58 : -.58, 0];
      rig.group.position.x = focus.x + rig.base[0];
      rig.group.position.z = focus.z + rig.base[1];
      rig.initialized = false;
    }
  }
  view();
};
$('count').onchange = $('weapon').onchange = rebuild;
size();
rebuild();
requestAnimationFrame(render);
