export function portLayoutKey(map) {
  const source = JSON.stringify([map.size, map.shoreX, map.boxes, map.structures,
    map.roads, map.cranes, map.railTracks, map.ship, map.signs],
  (_, value) => typeof value === 'number' ? Math.round(value * 1000) : value);
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}
