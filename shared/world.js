// The same geometry drives rendering, navigation, and server collision.
import { PORT_MAP } from './port.js';
import { QUARRY_MAP } from './quarry.js';

export const PROTOCOL_VERSION=7;
export const WEAPONS = {
  ar416: { id: 'ar416', classId: 'assault', name: 'AR-416', weapon: 'AR-416', type: 'ШТУРМОВАЯ ВИНТОВКА', mag: 30, reserve: 150, damage: 27, interval: .105, spread: .012, recoil: .019, reload: 2, speed: 6.3, range: 150 },
  ak12:  { id: 'ak12',  classId: 'assault', name: 'АК-12М', weapon: 'АК-12М', type: 'ТЯЖЁЛЫЙ АВТОМАТ',   mag: 30, reserve: 150, damage: 33, interval: .125, spread: .014, recoil: .024, reload: 2.15, speed: 6.15, range: 165 },
  mcx9:  { id: 'mcx9',  classId: 'medic',   name: 'MCX-9',  weapon: 'MCX-9',  type: 'КАРАБИН / ПП',      mag: 32, reserve: 160, damage: 23, interval: .082, spread: .016, recoil: .012, reload: 2, speed: 6.5, range: 100 },
  vk45:  { id: 'vk45',  classId: 'medic',   name: 'ВК-45 «Шквал»', weapon: 'ВК-45 «Шквал»', type: 'ТАКТИЧЕСКИЙ ПП С ПБС', mag: 40, reserve: 160, damage: 20, interval: .066, spread: .014, recoil: .009, reload: 1.85, speed: 6.65, range: 92 },
  mg36:  { id: 'mg36',  classId: 'support', name: 'MG-36',  weapon: 'MG-36',  type: 'РУЧНОЙ ПУЛЕМЁТ',    mag: 60, reserve: 240, damage: 25, interval: .115, spread: .021, recoil: .025, reload: 3.1, speed: 5.8, range: 150 },
  pkp:   { id: 'pkp',   classId: 'support', name: 'ПКП «Печенег»', weapon: 'ПКП «Печенег»', type: 'ЕДИНЫЙ ПУЛЕМЁТ', mag: 100, reserve: 200, damage: 31, interval: .132, spread: .023, recoil: .029, reload: 3.6, speed: 5.55, range: 175 },
  dmr12: { id: 'dmr12', classId: 'recon',   name: 'DMR-12', weapon: 'DMR-12', type: 'МАРКСМАНСКАЯ ВИНТОВКА', mag: 12, reserve: 60, damage: 62, interval: .5, spread: .004, recoil: .043, reload: 2, semiAuto: true, semi: true, speed: 6.1, range: 230 },
  sv98:  { id: 'sv98',  classId: 'recon',   name: 'СВ-98М', weapon: 'СВ-98М', type: 'СНАЙПЕРСКАЯ ВИНТОВКА',  mag: 8, reserve: 40, damage: 92, interval: .88, spread: .002, recoil: .058, reload: 2.45, semiAuto: true, semi: true, speed: 5.9, range: 280 },
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
export function getWeapon(classId = 'assault', weaponId = '') {
  const validClass = Object.hasOwn(CLASSES, classId) ? classId : 'assault';
  if (weaponId && Object.hasOwn(WEAPONS, weaponId) && WEAPONS[weaponId].classId === validClass) {
    return WEAPONS[weaponId];
  }
  return WEAPONS[defaultWeaponId(validClass)] ?? CLASSES[validClass];
}
export const DIFFICULTIES = {
  recruit: { name: 'Новобранец', awareness: 43, reaction: .85, reactionVariance: .35, turnSpeed: 1.8, aimError: .031, burst: .28, pause: .95 },
  regular: { name: 'Обычная', awareness: 55, reaction: .58, reactionVariance: .3, turnSpeed: 2.4, aimError: .021, burst: .38, pause: .72 },
  veteran: { name: 'Ветеран', awareness: 66, reaction: .36, reactionVariance: .18, turnSpeed: 3.2, aimError: .012, burst: .5, pause: .48 },
};
export const DEFAULT_MAP_ID=PORT_MAP.id;
export const MAP=PORT_MAP;
export const MAPS={ [DEFAULT_MAP_ID]:MAP, [QUARRY_MAP.id]:QUARRY_MAP };
export function getMap(mapId){
  return Object.hasOwn(MAPS,mapId)?MAPS[mapId]:MAP;
}
export const PLAYER_RADIUS=.4;
export const EYE_HEIGHT=1.65;
export const CAPTURE_RADIUS=12;
