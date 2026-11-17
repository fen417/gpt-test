import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { InfantryAssets } from './infantry-assets.js';
import { createInfantry, disposeInfantry, infantryAction, infantryDeath, infantryHit, infantrySeat, infantryTurnTolerance, sampleInfantryClip, setInfantryLod, setInfantryWeapon, updateInfantry } from './infantry.js';
import { VEHICLE_TYPES } from '../shared/vehicles.js';
import { WEAPONS, WEAPON_SWITCH_TIME, WEAPON_SWAP_PHASE } from '../shared/world.js';

const $ = id => document.getElementById(id);
const scenarios = {
  idle: ['Стойка с оружием', 3], walk: ['Ходьба вперёд', 3], run: ['Бег', 3], sprint: ['Спринт', 3],
  back: ['Ходьба назад', 3], 'strafe-left': ['Шаг влево', 3], 'strafe-right': ['Шаг вправо', 3],
  diagonal: ['Движение по диагонали', 3], 'crouch-idle': ['Стойка в приседе', 3], crouch: ['Ходьба в приседе', 3],
  slide: ['Подкат', 3], jump: ['Прыжок и приземление', 2.2], stop: ['Бег → остановка', 4],
  turn: ['Поворот', 7.854], reverse: ['Смена направления', 4], prone: ['Лёжа', 3], crawl: ['Ползком', 3],
  aim: ['Прицеливание', 3], shoot: ['Стрельба', 3], reload: ['Перезарядка', 3], switch: ['Смена оружия', 3.5],
  throw: ['Бросок гранаты', 2], hit: ['Попадание', 2], death: ['Гибель', 4], downed: ['Раненый на земле', 3],
  heal: ['Жест лечения', 2], revive: ['Поднятие союзника', 2], interact: ['Взаимодействие', 2],
  seat: ['Пассажир танка', 3], 'seat-atv': ['Водитель квадроцикла', 3], 'seat-humvee': ['Стрелок «Хамви»', 3],
};
const appendOptions = (select, items) => select.replaceChildren(...items.map(([key, name]) => new Option(name, key)));
appendOptions($('weapon'), Object.values(WEAPONS).map(weapon => [weapon.id, weapon.name]));
$('weapon').value = 'ar416';
appendOptions($('sidearm'), Object.values(WEAPONS).map(weapon => [weapon.id, weapon.name]));
$('sidearm').value = 'p19';
appendOptions($('state'), Object.entries(scenarios).map(([key, [label]]) => [key, label]));

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
} catch (error) {
  $('loading').textContent = 'Для просмотра нужен браузер с WebGL2.';
  throw error;
}
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
$('viewport').append(renderer.domElement);
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
controls.enablePan = false;
controls.minDistance = .16;
controls.maxDistance = 45;
const focus = new THREE.Vector3(), nextFocus = new THREE.Vector3(), offset = new THREE.Vector3();
const teamNames = ['Регулярная армия', 'Полевые силы'];
function size() {
  const { clientWidth: width, clientHeight: height } = $('viewport');
  if (!width || !height) return;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
function closeUp() { return $('focus').value !== 'body'; }
function selectFocus(out) {
  const rig = rigs[0];
  if (!rig) return out.set(0, .92, 0);
  const mode = $('focus').value;
  if (mode === 'right' || mode === 'left') {
    return rig.bones[mode === 'right' ? 'RightHand' : 'LeftHand'].getWorldPosition(out);
  }
  if (mode === 'weapon') {
    if (rig.rifle.visible) return rig.rifle.localToWorld(out.set(0, .07, -.23));
    return rig.bones.RightHand.getWorldPosition(out);
  }
  return out.set(rig.group.position.x - rig.base[0], .92, rig.group.position.z - rig.base[1]);
}
function view() {
  offset.set(...({
    perspective: [2.45, .85, -3.7], front: [0, .23, -3.8],
    side: [4.05, .28, 0], left: [-4.05, .28, 0], back: [0, .24, 3.8], top: [0, 4.0, -.04],
  }[$('view').value]));
  if (closeUp()) offset.multiplyScalar($('focus').value === 'weapon' ? .31 : .23);
  else if (rigs.length > 2) offset.multiplyScalar(2.2);
  selectFocus(focus);
  camera.position.copy(focus).add(offset);
  controls.target.copy(focus);
  controls.update();
}
function arrange() {
  const count = rigs.length;
  const side = ['side', 'left'].includes($('view').value);
  for (const [i, rig] of rigs.entries()) {
    rig.base = [(i % Math.min(count, 8) - (Math.min(count, 8) - 1) / 2) * 1.16, Math.floor(i / 8) * 1.45];
    if (count === 2 && side && !closeUp()) rig.base = [0, i === 0 ? -1 : 1];
    rig.group.visible = rig.shadow.visible = !closeUp() || i === 0;
    rig.group.position.set(rig.base[0] + packet[0], rig.group.position.y, rig.base[1] + packet[1]);
    if (rig.initialized) { rig.motion.x = rig.group.position.x; rig.motion.z = rig.group.position.z; }
  }
  $('team-labels').replaceChildren(...[...new Set(rigs.filter(rig => rig.group.visible).map(rig => rig.team))].map(team => {
    const tag = document.createElement('span');
    tag.textContent = teamNames[team];
    return tag;
  }));
}
new ResizeObserver(size).observe($('viewport'));
const assets = new InfantryAssets(renderer), rigs = [], samples = [];
const review = window.review = { rigs, samples, renderer, scene, camera, ready: false, step };
let last = performance.now(), change = 0, accumulator = 0, elapsed = 0, moving = [0, 0];
let state = $('state').value;
let seeking = false;
let rebuildId = 0;
async function rebuild() {
  const ticket = ++rebuildId;
  const teamSelection = $('team').value;
  const count = teamSelection === 'both' ? Number($('count').value) : 1;
  const weaponId = $('weapon').value, sidearm = $('sidearm').value;
  review.ready = false;
  review.error = null;
  $('loading').hidden = false;
  $('loading').textContent = 'Загрузка моделей…';
  try {
    const teams = teamSelection === 'both' ? [0, 1] : [Number(teamSelection)];
    await Promise.all(teams.flatMap(team => [assets.load(team, weaponId), assets.load(team, sidearm)]));
    if (ticket !== rebuildId) return;
    for (const actor of rigs) { actor.shadow.removeFromParent(); disposeInfantry(actor); }
    rigs.length = samples.length = 0;
    for (let i = 0; i < count; ++i) {
      const team = teams[i % teams.length];
      const rig = createInfantry(assets.get(team, weaponId), {
        id: 'review-' + i, team, classId: WEAPONS[weaponId].classId ?? 'assault', weaponId,
      });
      rig.marker.visible = false;
      rig.shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
      rig.shadow.rotation.x = -Math.PI / 2;
      scene.add(rig.group, rig.shadow);
      rigs.push(rig);
    }
    const selected = $('clip').value;
    appendOptions($('clip'), [...rigs[0].template.clips.keys()].sort().map(name => [name, name]));
    if (rigs[0].template.clips.has(selected)) $('clip').value = selected;
    review.ready = true;
    restart();
    view();
    $('loading').hidden = true;
  } catch (error) {
    if (ticket !== rebuildId) return;
    $('loading').textContent = 'Не удалось загрузить сцену. ' + error.message;
    review.error = String(error);
    console.error(error);
  }
}
const packet = [0, 0];
let shot = 0;

function clipDuration() {
  if ($('source').value === 'clip') {
    const clip = rigs[0]?.template.clips.get($('clip').value);
    if (clip) return Math.max(clip.lower.duration, clip.upper.duration, .001);
  }
  return $('state').value === 'reload' ? WEAPONS[$('weapon').value].reload + 1 : scenarios[$('state').value][1];
}

function restart() {
  if (!review.ready) return;
  elapsed = change = accumulator = shot = 0;
  moving[0] = moving[1] = packet[0] = packet[1] = 0;
  for (const rig of rigs) {
    Object.assign(rig, { initialized: false, poseTime: 0, action: null });
    rig.group.rotation.y = 0;
    rig.group.position.y = 0;
    const weapon = $('weapon').value;
    if (rig.weaponId !== weapon) setInfantryWeapon(rig, assets.get(rig.team, weapon).gun, weapon);
  }
  arrange();
  step(0);
}

function pause(value) {
  $('pause').checked = value;
  $('play-toggle').textContent = value ? 'Продолжить' : 'Пауза';
  accumulator = 0;
}

function seek(time) {
  if (!review.ready) return;
  pause(true);
  restart();
  const dt = 1 / Number($('fps').value);
  if ($('source').value === 'clip') elapsed = time;
  else {
    while (time - elapsed > dt) step(dt);
    if (time > elapsed) step(time - elapsed);
  }
  step(0);
}

function step(dt) {
  const next = $('state').value;
  if (state !== next) {
    state = next;
    change = elapsed;
  }
  const t = elapsed - change;
  if ($('source').value === 'clip') {
    const duration = clipDuration();
    const time = seeking && t === duration ? duration : t % duration;
    for (const rig of rigs) {
      setInfantryLod(rig, Number($('lod').value), false);
      sampleInfantryClip(rig, $('clip').value, time);
    }
    elapsed += dt;
    return;
  }
  const speed = Number($('speed').value);
  const rate = Number($('fps').value);
  const remote = $('remote').checked;
  const slideAge = t % 3 - .28;
  const jumpAge = t % 2.2 - .28;
  const config = WEAPONS[$('weapon').value];
  const modeSpeed = {
    walk: [0, -1.4], run: [0, -6.3], sprint: [0, -9.765],
    'strafe-left': [-3.1, 0], 'strafe-right': [3.1, 0], back: [0, 3.1],
    diagonal: [2.2, -2.2], crouch: [0, -config.speed * .5], slide: [0, slideAge >= 0 ? -6 * Math.max(0, 1 - slideAge) : 0],
    stop: [0, t % 4 < 2 ? -3.1 : 0], reverse: [0, t % 4 < 2 ? -3.1 : 3.1], crawl: [0, -1.0],
  }[state] ?? [0, 0];
  moving[0] += modeSpeed[0] * speed * dt;
  moving[1] += modeSpeed[1] * speed * dt;
  if (!remote || Math.floor(elapsed * 20) !== Math.floor((elapsed + dt) * 20)) {
    packet[0] = moving[0];
    packet[1] = moving[1];
  }
  const lod = Number($('lod').value);
  const blend = remote ? 1 - Math.exp(-dt * 18) : 1;
  const aiming = state === 'aim' || state === 'shoot';
  const pitch = aiming ? THREE.MathUtils.degToRad(Number($('aim-pitch').value)) : 0;
  if (dt && state === 'shoot' && Math.floor(t / config.interval) !== Math.floor((t - dt) / config.interval)) shot++;
  for (const rig of rigs) {
    const jump = state === 'jump' && jumpAge >= 0 && jumpAge < .72;
    const sliding = state === 'slide' && slideAge >= 0 && slideAge < .85;
    const jumpY = jump ? 4.2 * jumpAge * (.72 - jumpAge) : 0;
    const yaw = aiming ? THREE.MathUtils.degToRad(Number($('aim-yaw').value)) : state === 'turn' ? Math.sin(t * .8) * .8 : 0;
    rig.group.position.x = THREE.MathUtils.lerp(rig.group.position.x, rig.base[0] + packet[0], rig.initialized ? blend : 1);
    rig.group.position.y = jumpY;
    rig.group.position.z = THREE.MathUtils.lerp(rig.group.position.z, rig.base[1] + packet[1], rig.initialized ? blend : 1);
    rig.shadow.position.set(rig.group.position.x, -.009, rig.group.position.z);
    rig.shadow.scale.setScalar(1 + jumpY * .28);
    const yawDelta = Math.atan2(Math.sin(yaw - rig.group.rotation.y), Math.cos(yaw - rig.group.rotation.y));
    const tolerance = infantryTurnTolerance(rig, aiming, sliding);
    rig.group.rotation.y += Math.sign(yawDelta) * Math.max(0, Math.abs(yawDelta) - tolerance) * (1 - Math.exp(-dt * 12));
    setInfantryLod(rig, lod, false);
    if (state === 'death') infantryDeath(rig, t % 4);
    else if (state.startsWith('seat')) {
      const [type, index] = state === 'seat-atv' ? ['atv', 0] : state === 'seat-humvee' ? ['humvee', 1] : ['tank', 2];
      infantrySeat(rig, { vehicle: { type }, seat: VEHICLE_TYPES[type].seats[index], index,
        relativeYaw: 0, pitch, shotSeq: shot, dt });
    }
    else {
      const reloadTimer = t % (config.reload + 1);
      const reloading = state === 'reload' && reloadTimer < config.reload;
      const switching = state === 'switch';
      const half = Math.floor((t % 3.5) / 1.75);
      const switchAge = (t % 1.75) - .55;
      const afterSwap = switchAge >= WEAPON_SWITCH_TIME * WEAPON_SWAP_PHASE;
      const secondary = switching && Boolean(half !== Number(afterSwap));
      const weaponId = secondary ? $('sidearm').value : config.id;
      if (rig.weaponId !== weaponId) setInfantryWeapon(rig, assets.get(rig.team, weaponId).gun, weaponId);
      const action = { throw: 'throw', heal: 'heal', revive: 'revive_kneel', interact: 'interact' }[state];
      if (dt && Math.floor((t + dt - .25) / 2) !== Math.floor((t - .25) / 2)) {
        if (action) infantryAction(rig, action);
        if (state === 'hit') infantryHit(rig);
      }
      updateInfantry(rig, {
        yaw, pitch, shotSeq: shot, sprint: state === 'sprint', crouch: state.startsWith('crouch'),
        prone: ['prone', 'crawl', 'downed'].includes(state), downed: state === 'downed',
        sliding, grounded: !jump, aim: aiming,
        reloading, reloadProgress: reloading ? reloadTimer / config.reload : 0,
        equipTime: switching && switchAge >= 0 ? Math.max(0, WEAPON_SWITCH_TIME - switchAge) : 0,
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
    accumulator += dt * Number($('playback').value);
    while (accumulator > quantum) {
      step(quantum);
      accumulator -= quantum;
    }
  }
  if (rigs.length) {
    selectFocus(nextFocus);
    camera.position.add(offset.subVectors(nextFocus, focus));
    focus.copy(nextFocus);
    controls.target.copy(focus);
  }
  controls.update();
  renderer.render(scene, camera);
  if (review.ready) {
    const { calls, triangles } = renderer.info.render;
    $('info').textContent = calls + ' выз. · ' + triangles.toLocaleString('ru') + ' треуг.';
    const duration = clipDuration();
    const displayTime = $('pause').checked && elapsed - change === duration ? duration : (elapsed - change) % duration;
    $('seek').max = duration;
    if (!seeking) $('seek').value = displayTime;
    const format = value => Number(value).toFixed(2).replace('.', ',');
    $('time').textContent = format(seeking ? $('seek').value : displayTime) + ' / ' + format(duration) + ' с';

  }
  requestAnimationFrame(render);
}
function controlsForMode() {
  const raw = $('source').value === 'clip';
  const state = $('state').value;
  $('game-animation').hidden = raw;
  $('raw-animation').hidden = !raw;
  $('secondary-weapon').hidden = raw || state !== 'switch';
  $('aim-controls').hidden = raw || !['aim', 'shoot'].includes(state);
  $('weapon').disabled = raw;
  restart();
}

for (const id of ['state', 'source', 'clip']) $(id).addEventListener('change', controlsForMode);
for (const id of ['count', 'team', 'weapon', 'sidearm']) $(id).addEventListener('change', rebuild);
for (const id of ['view', 'focus']) $(id).addEventListener('change', () => { arrange(); view(); });
for (const id of ['aim-yaw', 'aim-pitch', 'lod']) $(id).addEventListener('input', () => {
  if (review.ready && $('pause').checked) step(0);
});
$('reset-camera').onclick = view;
$('restart').onclick = restart;
$('play-toggle').onclick = () => pause(!$('pause').checked);
$('seek').addEventListener('input', () => { seeking = true; pause(true); });
$('seek').addEventListener('change', () => {
  try { seek(Number($('seek').value)); }
  finally { seeking = false; }
});
$('previous-frame').onclick = () => {
  const time = Number($('seek').value);
  seek(Math.max(0, time - 1 / Number($('fps').value)));
};
$('next-frame').onclick = () => {
  if (!review.ready) return;
  pause(true);
  // Evaluate the next timestamp as well as advancing the simulation clock.
  step(1 / Number($('fps').value));
  step(0);
};
addEventListener('keydown', event => {
  if (event.repeat || event.target !== document.body || event.code !== 'Space') return;
  event.preventDefault();
  pause(!$('pause').checked);
});
size();
rebuild();
requestAnimationFrame(render);
