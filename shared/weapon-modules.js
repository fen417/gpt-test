export const WEAPON_SLOTS = Object.freeze({
  optic: 'Оптика',
  barrel: 'Ствол',
  magazine: 'Магазин',
  stock: 'Приклад',
});

export const XP_PER_WEAPON_KILL = 100;
const levelKills = [0, 25, 60, 110, 180, 290, 400, 600, 860, 1000, 1300, 1600];
const killsPerLaterLevel = 300;

export function weaponXpForLevel(level) {
  if (level <= 1) return 0;
  const kills = levelKills[level - 1] ?? levelKills.at(-1) + (level - levelKills.length) * killsPerLaterLevel;
  return kills * XP_PER_WEAPON_KILL;
}

export function weaponLevel(xp = 0) {
  const kills = xp / XP_PER_WEAPON_KILL;
  const next = levelKills.findIndex(threshold => kills < threshold);
  if (next !== -1) return Math.max(1, next);
  return levelKills.length + Math.floor((kills - levelKills.at(-1)) / killsPerLaterLevel);
}

export function weaponLevelProgress(xp = 0) {
  const level = weaponLevel(xp);
  const start = weaponXpForLevel(level);
  return {level, earned: xp - start, required: weaponXpForLevel(level + 1) - start};
}

export const LONG_BARREL_ID = 'long-barrel';
export const EXTENDED_MAGAZINE_ID = 'extended-magazine';
export const COMPENSATOR_ID = 'compensator';
export const LIGHT_STOCK_ID = 'light-stock';
export const FAST_MAGAZINE_ID = 'fast-magazine';
export const STABLE_STOCK_ID = 'stable-stock';
export const PRISM_OPTIC_ID = 'prism-2';
export const VARIABLE_OPTIC_ID = 'variable-12';
export const TACTICAL_OPTIC_ID = 'tactical-3';
const primaryWeapons = ['ar416', 'ak12', 'mcx9', 'vk45', 'mg36', 'pkp', 'dmr12', 'sv98'];

export const WEAPON_MODULES = Object.freeze({
  'collimator-15': {
    slot: 'optic', name: 'Коллиматор 1,5×', level: 2, zoom: 1.5,
    weapons: ['ar416', 'ak12', 'mcx9', 'vk45', 'mg36', 'pkp', 'p19', 'm50'],
  },
  [PRISM_OPTIC_ID]: {
    slot:'optic', name:'Призма 2×', level:4, zooms:[2], reticle:'chevron',
    weapons:primaryWeapons, modifiers:{adsSpreadScale:.95,aimTime:1.08},
  },
  [VARIABLE_OPTIC_ID]: {
    slot:'optic', name:'Панорама 1–2×', level:6, zooms:[1,2], reticle:'ring',
    weapons:primaryWeapons, modifiers:{aimTime:1.13},
  },
  [TACTICAL_OPTIC_ID]: {
    slot:'optic', name:'Тактический прицел 3×', level:7, zooms:[3], reticle:'ladder',
    weapons:primaryWeapons, modifiers:{adsSpreadScale:.88,aimTime:1.23},
  },
  [LONG_BARREL_ID]: {
    slot: 'barrel', name: 'Удлинённый ствол', level: 3,
    weapons: primaryWeapons,
    modifiers: {hipSpreadScale: .90, adsSpreadScale: .85, aimTime: 1.10},
  },
  [EXTENDED_MAGAZINE_ID]: {
    slot: 'magazine', name: 'Увеличенный магазин', level: 4,
    weapons: [...primaryWeapons, 'p19', 'm50'],
    modifiers: {mag: 1.20, reload: 1.25},
  },
  [COMPENSATOR_ID]: {
    slot: 'barrel', name: 'Компенсатор', level: 5,
    weapons: primaryWeapons,
    modifiers: {recoil: .85, hipSpreadScale: 1.10},
  },
  [LIGHT_STOCK_ID]: {
    slot: 'stock', name: 'Облегчённый приклад', level: 6,
    weapons: primaryWeapons,
    modifiers: {aimTime: .85, recoil: 1.10},
  },
  [FAST_MAGAZINE_ID]: {
    slot:'magazine', name:'Компактный магазин', level:5,
    weapons:primaryWeapons, modifiers:{mag:.85,reload:.82},
  },
  [STABLE_STOCK_ID]: {
    slot:'stock', name:'Упорный приклад', level:7,
    weapons:primaryWeapons, modifiers:{recoil:.82,aimTime:1.16},
  },
});

const snapshotSlots = {
  barrel:[undefined,LONG_BARREL_ID,COMPENSATOR_ID],
  magazine:[undefined,EXTENDED_MAGAZINE_ID,FAST_MAGAZINE_ID],
  stock:[undefined,LIGHT_STOCK_ID,STABLE_STOCK_ID],
  optic:[undefined,'collimator-15',PRISM_OPTIC_ID,VARIABLE_OPTIC_ID,TACTICAL_OPTIC_ID],
};
export function weaponAttachmentFlags(slots) {
  return Math.max(0,snapshotSlots.barrel.indexOf(slots?.barrel))
    | Math.max(0,snapshotSlots.magazine.indexOf(slots?.magazine)) << 2
    | Math.max(0,snapshotSlots.stock.indexOf(slots?.stock)) << 4
    | Math.max(0,snapshotSlots.optic.indexOf(slots?.optic)) << 6;
}

const snapshotUpgrades = Array.from({length: 512}, (_, flags) => flags ? Object.freeze({
  barrel:snapshotSlots.barrel[flags & 3],
  magazine:snapshotSlots.magazine[flags >> 2 & 3],
  stock:snapshotSlots.stock[flags >> 4 & 3],
  optic:snapshotSlots.optic[flags >> 6 & 7],
}) : undefined);

export function weaponAttachmentsFromFlags(flags) {
  return snapshotUpgrades[flags & 511];
}

export function weaponModules(weaponId, slot) {
  return Object.entries(WEAPON_MODULES).filter(([, part]) =>
    part.slot === slot && part.weapons.includes(weaponId));
}

export function getWeaponModule(weaponId, slot, id) {
  const part = Object.hasOwn(WEAPON_MODULES, id) ? WEAPON_MODULES[id] : null;
  return part?.slot === slot && part.weapons.includes(weaponId) ? part : null;
}

const statCache = new WeakMap();

// Modifiers multiply across slots. Capacity is rounded once after composition.
export function resolveWeaponModules(base, slots) {
  if (!slots) return base;
  let cache = statCache.get(slots);
  if (!cache) statCache.set(slots, cache = new WeakMap());
  if (cache.has(base)) return cache.get(base);
  let weapon = base;
  for (const slot of Object.keys(WEAPON_SLOTS)) {
    const modifiers = getWeaponModule(base.id, slot, slots[slot])?.modifiers;
    if (!modifiers) continue;
    if (weapon === base) weapon = {...base};
    for (const [stat, multiplier] of Object.entries(modifiers)) weapon[stat] = (weapon[stat] ?? 1) * multiplier;
  }
  if (weapon !== base) weapon.mag = Math.max(1, Math.round(weapon.mag));
  cache.set(base, weapon);
  return weapon;
}
