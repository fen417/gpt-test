import {LONG_BARREL_ID, WEAPON_MODULES, weaponXpForLevel} from '../shared/weapon-modules.js';

const barrel = WEAPON_MODULES[LONG_BARREL_ID];
export const networkWeaponXpCap = weaponXpForLevel(barrel.level);
const receiptAge = 7*24*60*60*1000;

// The browser's profile XP is writable by its owner. Multiplayer uses XP
// credited by the simulation and stored under a server-only write rule.
export function createNetworkWeaponProgress(db, writer) {
  const accounts = new Map();
  let saving, sequence = 0;
  const progressRef = uid => db.ref('profiles').child(uid).child('weaponNetworkProgress');
  async function load(uid) {
    if (accounts.has(uid)) return accounts.get(uid).xp;
    const snapshot = await progressRef(uid).get();
    if (!accounts.has(uid)) {
      const stored = snapshot.val()?.xp;
      const xp = Object.fromEntries(barrel.weapons.map(id => [id, stored?.[id] ?? 0]));
      accounts.set(uid, {xp, pending:{}});
    }
    return accounts.get(uid).xp;
  }
  function credit(uid, id, delta) {
    const account = accounts.get(uid);
    if (!account || !barrel.weapons.includes(id)) return;
    const earned = Math.min(delta, networkWeaponXpCap-account.xp[id]);
    if (earned <= 0) return;
    account.xp[id] += earned;
    account.pending[id] = (account.pending[id] ?? 0) + earned;
  }
  function flush() {
    if (saving) return saving;
    const ready = [];
    for (const [uid, account] of accounts) {
      if (!account.batch && Object.keys(account.pending).length) {
        account.batch = {id:++sequence, xp:account.pending};
        account.pending = {};
      }
      if (account.batch) ready.push([uid, account]);
    }
    if (!ready.length) return Promise.resolve();
    saving = Promise.allSettled(ready.map(async ([uid, account]) => {
      const batch = account.batch, now = Date.now();
      await progressRef(uid).transaction(value => {
        const receipts = value?.receipts ?? {};
        if ((receipts[writer]?.id ?? 0) >= batch.id) return;
        const xp = {...value?.xp};
        for (const [id, earned] of Object.entries(batch.xp))
          xp[id] = Math.min(networkWeaponXpCap, (xp[id] ?? 0)+earned);
        const retained = Object.fromEntries(Object.entries(receipts).filter(([, receipt]) => receipt.at > now-receiptAge));
        return {xp, receipts:{...retained, [writer]:{id:batch.id, at:now}}};
      });
      account.batch = null;
    })).then(results => {
      if (results.some(result => result.status === 'rejected')) console.warn('Could not save network weapon XP. Will retry.');
    }).finally(() => {saving = null;});
    return saving;
  }
  return {load, credit, flush};
}
