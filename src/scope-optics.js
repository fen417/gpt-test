export const SCOPE_ZOOMS = {
  dmr12: [2],
  sv98: [2, 4],
};

export function scopeMagnification(weaponId, selected) {
  const zooms = SCOPE_ZOOMS[weaponId];
  return zooms?.includes(selected) ? selected : zooms?.[0] ?? 1;
}
