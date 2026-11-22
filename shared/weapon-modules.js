export const WEAPON_SLOTS = Object.freeze({
  optic: 'Оптика',
  barrel: 'Ствол',
  magazine: 'Магазин',
  stock: 'Приклад',
});

export const XP_PER_WEAPON_KILL = 100;
export const XP_PER_WEAPON_LEVEL = 500;
export const weaponLevel = (xp = 0) => 1 + Math.floor(xp / XP_PER_WEAPON_LEVEL);

export const WEAPON_MODULES = Object.freeze({
  'collimator-15': {
    slot: 'optic', name: 'Коллиматор 1,5×', level: 2, zoom: 1.5,
    weapons: ['ar416', 'ak12', 'mcx9', 'vk45', 'mg36', 'pkp', 'p19', 'm50'],
  },
});

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
    if (weapon === base) weapon = {...base, hipSpreadScale: 1, adsSpreadScale: 1};
    for (const stat of ['mag', 'reload', 'range', 'projectileSpeed', 'recoil', 'hipSpreadScale', 'adsSpreadScale']) {
      weapon[stat] *= modifiers[stat] ?? 1;
    }
  }
  if (weapon !== base) weapon.mag = Math.max(1, Math.round(weapon.mag));
  cache.set(base, weapon);
  return weapon;
}
