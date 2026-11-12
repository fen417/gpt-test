// Full state, compact on the wire: no delta baseline to lose under congestion.
const PLAYER_FIELDS = 'id name team classId weaponId primaryWeaponId sidearmId weaponSlot equipTime x y z yaw pitch hp alive ammo reserve kills deaths assists score respawnIn reloading reloadProgress shotSeq spread crouch sliding slideYaw sprint aim grounded bot protected gadgetCooldown secondaryCooldown rockets gadgetAction gadgetActionRemaining gadgetTargetId grenades spotted vehicleId vehicleSeat'.split(' ');
const precise = value => typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 1000) / 1000 : value;
const compactObject = object => Object.fromEntries(Object.entries(object).map(([key, value]) => [key, precise(value)]));

export function packSnapshot(state, afterEvent = 0) {
  return { ...state, wire: 1,
    players: state.players.map(player => PLAYER_FIELDS.map(key => precise(player[key]))),
    events: (state.events || []).filter(event => event.id > afterEvent).map(compactObject),
    vehicles: (state.vehicles || []).map(compactObject),
    grenades: (state.grenades || []).map(compactObject),
    deployables: (state.deployables || []).map(compactObject),
    rockets: (state.rockets || []).map(compactObject),
  };
}

export function unpackSnapshot(state) {
  if (!state || state.wire !== 1) return state;
  if (!Array.isArray(state.players) || state.players.length > 128) return null;
  const players = [];
  for (const row of state.players) {
    if (!Array.isArray(row) || row.length !== PLAYER_FIELDS.length) return null;
    const player = {};
    for (let i = 0; i < PLAYER_FIELDS.length; i++) player[PLAYER_FIELDS[i]] = row[i];
    players.push(player);
  }
  return { ...state, players };
}
