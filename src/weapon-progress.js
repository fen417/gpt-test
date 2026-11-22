import {WEAPONS} from '../shared/world.js';
import {
  WEAPON_SLOTS, WEAPON_MODULES, XP_PER_WEAPON_KILL,
  getWeaponModule, weaponLevel, weaponLevelProgress,
} from '../shared/weapon-modules.js';

const read = key => {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
};
const namespace = 'sector09-weapon-progress:';
export function weaponProgressId(){
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  const hex=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
export const weaponDevice = read(namespace+'device') ?? weaponProgressId();
write(namespace+'device', weaponDevice);
const storageKey = uid => namespace+(uid ?? 'guest');
const number = value => Number.isSafeInteger(value) && value > 0 ? value : 0;
const readProgress = uid => ({xp:{}, round:{}, loadout:{}, ...read(storageKey(uid))});

export function createWeaponProgress() {
  let uid = null, remote = null, networkXp = null, local = readProgress(uid);
  const store = () => write(storageKey(uid), local);
  function xpOf(id) {
    let total = Math.max(number(local.xp[id]), number(remote?.devices?.[weaponDevice]?.[id]));
    for (const [device, xp] of Object.entries(remote?.devices ?? {})) {
      if (device !== weaponDevice) total += number(xp[id]);
    }
    return Math.max(total,number(networkXp?.[id]));
  }
  return {
    updateAccount(account, cloudData, verifiedXp) {
      if (uid !== account) local = readProgress(account);
      uid = account;
      remote = cloudData;
      networkXp = verifiedXp;
    },
    xpOf,
    loadout(verifiedXp) {
      const selection = {};
      for (const weaponId of Object.keys(WEAPONS)) {
        for (const slot of Object.keys(WEAPON_SLOTS)) {
          const cur = local.loadout[weaponId]?.[slot], synced = remote?.loadout?.[weaponId]?.[slot];
          const id = (number(cur?.at) >= number(synced?.at) ? cur : synced)?.id;
          const part = getWeaponModule(weaponId, slot, id);
          const availableXp = Math.max(xpOf(weaponId),number(verifiedXp?.[weaponId]));
          if (part && weaponLevel(availableXp) >= part.level) (selection[weaponId] ??= {})[slot] = id;
        }
      }
      return selection;
    },
    select(weaponId, slot, id, verifiedXp = 0) {
      if (!Object.hasOwn(WEAPONS, weaponId) || !Object.hasOwn(WEAPON_SLOTS, slot)) return false;
      const part = getWeaponModule(weaponId, slot, id);
      if (id !== 'stock' && (!part || weaponLevel(Math.max(xpOf(weaponId),verifiedXp)) < part.level)) return false;
      local = read(storageKey(uid)) ?? local;
      const previous = Math.max(number(local.loadout[weaponId]?.[slot]?.at), number(remote?.loadout?.[weaponId]?.[slot]?.at));
      (local.loadout[weaponId] ??= {})[slot] = {id, at:Math.max(Date.now(), previous+1)};
      store();
      return true;
    },
    credit(roundId, kills) {
      if (!roundId) return false;
      let changed = false;
      const stored = read(storageKey(uid));
      if (stored) local = stored;
      const offset = local.round[roundId] ?? {};
      for (const id of Object.keys(WEAPONS)) {
        const count = number(kills[id]), prior = number(offset[id]);
        if (count <= prior) continue;
        const start = Math.max(number(local.xp[id]), number(remote?.devices?.[weaponDevice]?.[id]));
        local.xp[id] = start + (count-prior)*XP_PER_WEAPON_KILL;
        offset[id] = count;
        changed = true;
      }
      if (changed) {
        delete local.round[roundId];
        local.round[roundId] = offset;
        const roundIds = Object.keys(local.round);
        for (const id of roundIds.slice(0, Math.max(0,roundIds.length-64))) delete local.round[id];
        store();
      }
      return changed;
    },
    dataForSync() { return {xp:local.xp, loadout:local.loadout}; },
  };
}

const node = (tag, value, className) => {
  const element = document.createElement(tag);
  if (value) element.textContent = value;
  if (className) element.className = className;
  return element;
};

export function renderWeaponResults(container, kills, xpOf) {
  if (!container) return;
  const list = node('ul');
  for (const [id, count] of Object.entries(kills).sort(([,a],[,b])=>b-a)) {
    if (!count || !Object.hasOwn(WEAPONS,id)) continue;
    const earned = count*XP_PER_WEAPON_KILL, after = xpOf(id);
    const beforeLevel = weaponLevel(Math.max(0,after-earned));
    const {level:afterLevel, earned:levelXp, required} = weaponLevelProgress(after);
    const bar = node('progress');
    bar.max = required;
    bar.value = levelXp;
    bar.setAttribute('aria-label','Прогресс до следующего уровня '+WEAPONS[id].name);
    const unlocks = Object.values(WEAPON_MODULES)
      .filter(part=>part.weapons.includes(id)&&part.level>beforeLevel&&part.level<=afterLevel)
      .map(part=>part.name);
    const row = node('li');
    const header = node('div',null,'weapon-xp-row');
    header.append(node('strong',WEAPONS[id].name),node('span','+'+earned+' очк.'));
    row.append(header,bar,node('small',`Уровень ${afterLevel} · ${bar.value} / ${bar.max} очк. · Устранений ${count}`));
    if (unlocks.length) row.append(node('div','Открыто: '+unlocks.join(', '),'weapon-xp-unlock'));
    list.append(row);
  }
  container.replaceChildren(node('h3','Прокачка оружия'),
    list.childElementCount ? list : node('p','За этот бой очки оружия не начислены.'));
}
