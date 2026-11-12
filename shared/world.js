// The same geometry drives rendering, navigation, and server collision.
import { PORT_MAP } from './port.js';
import { QUARRY_MAP } from './quarry.js';
import { VILLAGE_MAP } from './village.js';
import { applyMapEdits } from './map-edits.js';
import portEdits from './maps/port.json' with { type: 'json' };
import quarryEdits from './maps/quarry.json' with { type: 'json' };
import villageEdits from './maps/village.json' with { type: 'json' };

export const PROTOCOL_VERSION=14;
export const WEAPON_SWITCH_TIME = .38;
export const WEAPON_SWAP_PHASE = .42;
export function weaponSwitchPose(remaining=0){
  const phase=1-Math.max(0,Math.min(1,remaining/WEAPON_SWITCH_TIME));
  const t=phase<WEAPON_SWAP_PHASE ? phase/WEAPON_SWAP_PHASE : (1-phase)/(1-WEAPON_SWAP_PHASE);
  return {stowing:phase<WEAPON_SWAP_PHASE,lowered:t*t*(3-2*t)};
}
export const SIDEARMS = ['p19', 'm50'];
export const WEAPONS = {
  p19:  { id: 'p19', name: 'P-19', weapon: 'P-19', type: 'КОМПАКТНЫЙ ПИСТОЛЕТ', sidearm: true, mag: 15, reserve: 45, damage: 29, interval: .17, spread: .028, recoil: .024, reload: 1.35, speed: 6.5, range: 88, projectileSpeed: 270, semiAuto: true },
  m50:  { id: 'm50', name: 'M-50 «Орёл»', weapon: 'M-50 «Орёл»', type: 'ТЯЖЁЛЫЙ ПИСТОЛЕТ', sidearm: true, mag: 7, reserve: 28, damage: 62, interval: .38, spread: .071, recoil: .056, reload: 1.65, speed: 6.25, range: 115, projectileSpeed: 325, semiAuto: true },
  ar416: { id: 'ar416', classId: 'assault', name: 'AR-416', weapon: 'AR-416', type: 'ШТУРМОВАЯ ВИНТОВКА', mag: 30, reserve: 150, damage: 27, interval: .105, spread: .012, recoil: .019, reload: 2, speed: 6.3, range: 150, projectileSpeed: 340 },
  ak12:  { id: 'ak12',  classId: 'assault', name: 'АК-12М', weapon: 'АК-12М', type: 'ТЯЖЁЛЫЙ АВТОМАТ',   mag: 30, reserve: 150, damage: 33, interval: .125, spread: .014, recoil: .024, reload: 2.15, speed: 6.15, range: 165, projectileSpeed: 315 },
  mcx9:  { id: 'mcx9',  classId: 'medic',   name: 'MCX-9',  weapon: 'MCX-9',  type: 'КАРАБИН / ПП',      mag: 32, reserve: 160, damage: 23, interval: .082, spread: .016, recoil: .012, reload: 2, speed: 6.5, range: 100, projectileSpeed: 265 },
  vk45:  { id: 'vk45',  classId: 'medic',   name: 'ВК-45 «Шквал»', weapon: 'ВК-45 «Шквал»', type: 'ТАКТИЧЕСКИЙ ПП С ПБС', mag: 40, reserve: 160, damage: 20, interval: .066, spread: .014, recoil: .009, reload: 1.85, speed: 6.65, range: 92, projectileSpeed: 235 },
  mg36:  { id: 'mg36',  classId: 'support', name: 'MG-36',  weapon: 'MG-36',  type: 'РУЧНОЙ ПУЛЕМЁТ',    mag: 60, reserve: 240, damage: 25, interval: .115, spread: .021, recoil: .025, reload: 3.1, speed: 5.8, range: 150, projectileSpeed: 340 },
  pkp:   { id: 'pkp',   classId: 'support', name: 'ПКП «Печенег»', weapon: 'ПКП «Печенег»', type: 'ЕДИНЫЙ ПУЛЕМЁТ', mag: 100, reserve: 200, damage: 31, interval: .132, spread: .023, recoil: .029, reload: 3.6, speed: 5.55, range: 175, projectileSpeed: 380 },
  dmr12: { id: 'dmr12', classId: 'recon',   name: 'DMR-12', weapon: 'DMR-12', type: 'МАРКСМАНСКАЯ ВИНТОВКА', mag: 12, reserve: 60, damage: 62, interval: .5, spread: .004, recoil: .043, reload: 2, semiAuto: true, semi: true, speed: 6.1, range: 230, projectileSpeed: 390, zeroRange: 80 },
  sv98:  { id: 'sv98',  classId: 'recon',   name: 'СВ-98М', weapon: 'СВ-98М', type: 'СНАЙПЕРСКАЯ ВИНТОВКА',  mag: 8, reserve: 40, damage: 92, interval: .88, spread: .002, recoil: .058, reload: 2.45, semiAuto: true, semi: true, speed: 5.9, range: 280, projectileSpeed: 440, zeroRange: 80 },
};
export const CLASS_WEAPONS = {
  assault: ['ar416', 'ak12'],
  medic: ['mcx9', 'vk45'],
  support: ['mg36', 'pkp'],
  recon: ['dmr12', 'sv98'],
};
export const CLASSES = {
  assault: { name: 'Штурмовик', weapon: 'AR-416', weaponId: 'ar416', weapons: CLASS_WEAPONS.assault, mag: 30, reserve: 150, damage: 27, interval: .105, spread: .012, recoil: .019, reload: 2, speed: 6.3, range: 150 },
  medic: { name: 'Медик', weapon: 'MCX-9', weaponId: 'mcx9', weapons: CLASS_WEAPONS.medic, mag: 32, reserve: 160, damage: 23, interval: .082, spread: .016, recoil: .012, reload: 2, speed: 6.5, range: 100 },
  support: { name: 'Поддержка', weapon: 'MG-36', weaponId: 'mg36', weapons: CLASS_WEAPONS.support, mag: 60, reserve: 240, damage: 25, interval: .115, spread: .021, recoil: .025, reload: 3.1, speed: 5.8, range: 150 },
  recon: { name: 'Разведчик', weapon: 'DMR-12', weaponId: 'dmr12', weapons: CLASS_WEAPONS.recon, mag: 12, reserve: 60, damage: 62, interval: .5, spread: .004, recoil: .043, reload: 2, semiAuto: true, speed: 6.1, range: 230 },
};
export function defaultWeaponId(classId = 'assault') {
  return CLASS_WEAPONS[classId]?.[0] ?? 'ar416';
}
export const getSidearm = id => WEAPONS[SIDEARMS.includes(id) ? id : SIDEARMS[0]];

export function getPrimaryWeapon(classId = 'assault', weaponId = '') {
  const validClass = Object.hasOwn(CLASSES, classId) ? classId : 'assault';
  if (weaponId && Object.hasOwn(WEAPONS, weaponId) && WEAPONS[weaponId].classId === validClass) {
    return WEAPONS[weaponId];
  }
  return WEAPONS[defaultWeaponId(validClass)] ?? CLASSES[validClass];
}
export function getWeapon(classId = 'assault', weaponId = '') {
  return SIDEARMS.includes(weaponId) ? WEAPONS[weaponId] : getPrimaryWeapon(classId, weaponId);
}
export const DIFFICULTIES = {
  recruit: { name: 'Новобранец', awareness: 43, reaction: .85, reactionVariance: .35, turnSpeed: 1.8, aimError: .031, burst: .28, pause: .95 },
  regular: { name: 'Обычная', awareness: 55, reaction: .58, reactionVariance: .3, turnSpeed: 2.4, aimError: .021, burst: .38, pause: .72 },
  veteran: { name: 'Ветеран', awareness: 66, reaction: .36, reactionVariance: .18, turnSpeed: 3.2, aimError: .012, burst: .5, pause: .48 },
};
export const DEFAULT_MAP_ID=PORT_MAP.id;
export const BASE_MAPS = { port: PORT_MAP, quarry: QUARRY_MAP, village: VILLAGE_MAP };
export const MAP_EDITS = { port: portEdits, quarry: quarryEdits, village: villageEdits };
function mapLayoutRevision() {
  const hasChanges = Object.values(MAP_EDITS).some(({ moves, added, removed }) =>
    Object.keys(moves).length || Object.keys(added).length || removed.length);
  if (!hasChanges) return '';
  let hash = 2166136261;
  const layout = JSON.stringify(MAP_EDITS);
  for (let i = 0; i < layout.length; i++) hash = Math.imul(hash ^ layout.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}
export const MAP_LAYOUT_REVISION = mapLayoutRevision();
export const MAPS = Object.fromEntries(Object.entries(BASE_MAPS).map(([id, map]) => [id, applyMapEdits(map, MAP_EDITS[id])]));
export const MAP=MAPS[DEFAULT_MAP_ID];
export function getMap(mapId){
  return Object.hasOwn(MAPS,mapId)?MAPS[mapId]:MAP;
}
export const PLAYER_RADIUS=.4;
export const EYE_HEIGHT=1.65;
export const CROUCH_EYE_HEIGHT=1.05;
export const CAPTURE_RADIUS=12;
export const CAPTURE_RATE=.07;
export const canSpawnAtPoint = (point, team) =>
  Boolean(point && point.owner === team && !point.contested && !point.spawnBlocked);
