import { getWeaponModule } from '../shared/weapon-modules.js';

export const SCOPE_ZOOMS = {
  dmr12: [2],
  sv98: [2, 4],
};

export function opticZooms(weaponId, opticId) {
  const optic=getWeaponModule(weaponId,'optic',opticId);
  return optic?.zooms ?? (optic?.zoom ? [optic.zoom] : SCOPE_ZOOMS[weaponId]);
}

export function scopeMagnification(weaponId, selected, opticId) {
  const zooms = opticZooms(weaponId, opticId);
  return zooms?.includes(selected) ? selected : zooms?.[0] ?? 1;
}
