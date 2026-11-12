import { makeTerrain } from './terrain.js';
import { scaleAsset, UNIT_SCALE } from './asset-scale.js';

export const emptyMapEdits = () => ({ version: 1, moves: {}, added: {}, removed: [] });

export function routeRoads(nodes, edges) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  return edges.map(([from, to]) => {
    const a = byId.get(from), b = byId.get(to);
    const dx = b.x - a.x, dz = b.z - a.z;
    const w = to.endsWith('-parking') ? 9 : 14;
    return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, w, d: Math.hypot(dx, dz) + w, yaw: Math.atan2(dx, dz) };
  });
}

const layers = {
  box: 'boxes', structure: 'structures', objective: 'points', spawn: 'spawns',
  vehicle: 'vehicleSpawns', road: 'roads', landform: 'landforms',
  landmark: 'landmarks', sign: 'signs', crane: 'cranes', rail: 'railTracks',
};
const cloneKinds = new Set(['box', 'structure', 'vehicle', 'road', 'landform', 'landmark', 'sign', 'crane', 'rail']);

export function mapItems(map, includeVehicleRoutes = false) {
  const items = [];
  const vehicleIds = new Set(map.vehicleSpawns?.map(vehicle => vehicle.id));
  for (const [kind, field] of Object.entries(layers)) {
    if (kind === 'road' && map.vehicleRoutes) continue;
    for (const [i, value] of (map[field] ?? []).entries()) {
      const key = value.editorKey ?? kind + ':' + (value.id ?? i);
      if (kind === 'box' && (value.editorPart || ['port-roof', 'port-crane-leg', 'port-lintel'].includes(value.kind) ||
          (value.kind === 'port-wall' && value.editorParent) ||
          (value.editorParent && value.editorParent === value.editorKey))) continue;
      items.push({ key, kind, value });
    }
  }
  for (const value of map.vehicleRoutes?.nodes ?? []) {
    if (includeVehicleRoutes || !vehicleIds.has(value.id)) items.push({ key: 'route:' + value.id, kind: 'route', value });
  }
  if (map.ship) items.push({ key: 'ship:0', kind: 'ship', value: map.ship });
  return items;
}

export const canCloneItem = item => cloneKinds.has(item.kind);
export const canRemoveItem = item => !['objective', 'spawn', 'route', 'segment'].includes(item.kind);
export const canResizeItem = item => ['box', 'structure', 'road', 'landform', 'vehicle', 'crane', 'rail', 'ship'].includes(item.kind);

export function constrainPosition(map, item, x, z) {
  const half = map.size / 2;
  const playable = ['objective', 'spawn', 'vehicle', 'route'].includes(item.kind);
  const padding = playable ? 3 : 0;
  const area = playable ? map.playArea : null;
  return {
    x: Math.max(playable ? Math.max((area?.minX ?? -half) + padding, (map.shoreX ?? -Infinity) + padding) : -half,
      Math.min((area?.maxX ?? half) - padding, x)),
    z: Math.max((area?.minZ ?? -half) + padding, Math.min((area?.maxZ ?? half) - padding, z)),
  };
}

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const only = (value, keys) => record(value) && Object.keys(value).every(key => keys.includes(key));
const has = (object, key) => Object.hasOwn(object, key);

export function validMapEdits(map, edits) {
  if (!only(edits, ['version', 'moves', 'added', 'removed']) || edits.version !== 1 ||
      !record(edits.moves) || !record(edits.added) || !Array.isArray(edits.removed)) return false;
  if (Object.keys(edits.added).length > 350 || Object.keys(edits.moves).length > 2000 ||
      edits.removed.length > 2000 || new Set(edits.removed).size !== edits.removed.length) return false;
  const items = new Map(mapItems(map, true).map(item => [item.key, item]));
  function validPosition(item, value) {
    if (!Number.isFinite(value.x) || !Number.isFinite(value.z)) return false;
    // Existing background assets can keep their original position outside the arena when resized.
    if (value.x === item.value.x && value.z === item.value.z) return true;
    const bounds = constrainPosition(map, item, value.x, value.z);
    return value.x === bounds.x && value.z === bounds.z;
  }
  function validScale(item, scale) {
    return scale === undefined || (canResizeItem(item) && only(scale, ['x', 'y', 'z']) &&
      ['x', 'y', 'z'].every(axis => Number.isFinite(scale[axis]) && scale[axis] >= .1 && scale[axis] <= 5));
  }
  for (const [key, move] of Object.entries(edits.moves)) {
    const item = items.get(key);
    if (!item || !only(move, ['x', 'z', 'scale']) || !validPosition(item, move) || !validScale(item, move.scale)) return false;
  }
  let extraTerrain = 0, extraVehicles = 0;
  for (const [key, added] of Object.entries(edits.added)) {
    if (!/^new:[0-9a-f]{32}$/.test(key) || !only(added, ['template', 'x', 'z', 'scale'])) return false;
    const template = items.get(added.template);
    if (!template || !canCloneItem(template) || !validPosition(template, added) || !validScale(template, added.scale)) return false;
    if (template.kind === 'landform' && ++extraTerrain > 20) return false;
    if (template.kind === 'vehicle' && ++extraVehicles > 16) return false;
  }
  return edits.removed.every(key => items.has(key) && canRemoveItem(items.get(key)) && !has(edits.moves, key));
}

export function applyMapEdits(base, edits) {
  if (!Object.keys(edits.moves).length && !Object.keys(edits.added).length && !edits.removed.length) return base;
  const items = new Map(mapItems(base).map(item => [item.key, item]));
  const removed = new Set(edits.removed);
  const added = Object.entries(edits.added);
  const at = (value, key) => {
    const direct = edits.moves[key];
    const parent = edits.moves[value.editorParent], original = items.get(value.editorParent)?.value;
    const parentScale = parent?.scale ?? UNIT_SCALE, ownScale = direct?.scale ?? UNIT_SCALE;
    const result = scaleAsset(value, {
      x: parentScale.x * ownScale.x, y: parentScale.y * ownScale.y, z: parentScale.z * ownScale.z,
    });
    if (parent && original) {
      result.x = parent.x + (value.x - original.x) * parentScale.x;
      result.z = parent.z + (value.z - original.z) * parentScale.z;
    }
    if (direct) { result.x = direct.x; result.z = direct.z; }
    return result;
  };
  const map = { ...base };
  for (const [kind, field] of Object.entries(layers)) {
    if (!base[field] || kind === 'box' || (kind === 'road' && base.vehicleRoutes)) continue;
    map[field] = base[field].flatMap((value, i) => {
      const key = kind + ':' + (value.id ?? i);
      return removed.has(key) ? [] : [{ ...at(value, key), editorKey: key }];
    });
    for (const [key, placement] of added) {
      const template = items.get(placement.template);
      if (template.kind !== kind) continue;
      map[field].push({ ...scaleAsset(template.value, placement.scale), id: key, editorKey: key, x: placement.x, z: placement.z });
    }
  }
  if (base.ship) map.ship = removed.has('ship:0') ? null : at(base.ship, 'ship:0');
  if (base.landforms && (added.some(([, placement]) => items.get(placement.template).kind === 'landform') ||
      Object.keys(edits.moves).some(key => key.startsWith('landform:')) ||
      edits.removed.some(key => key.startsWith('landform:')))) {
    map.terrain = makeTerrain(base.size, map.landforms, base.terrain.cell);
  }
  const changedStructures = added.some(([, placement]) => items.get(placement.template).kind === 'structure') ||
    [...Object.keys(edits.moves), ...edits.removed].some(key => key.startsWith('structure:'));
  if (base.terrainPads && (changedStructures || map.terrain !== base.terrain)) {
    const relief = makeTerrain(base.size, map.landforms, base.terrain.cell);
    map.terrainPads = map.structures.filter(structure => structure.terrainPad).map(structure => ({
      x: structure.x, z: structure.z, w: structure.w + 8, d: structure.d + 8,
      height: relief.heightAt(structure.x, structure.z), blend: 4,
    }));
    map.terrain = makeTerrain(base.size, map.landforms, base.terrain.cell, map.terrainPads);
  }
  const elevation = (original, moved) => {
    const originalParent = items.get(original.editorParent)?.value;
    const parent = map.structures?.find(structure => structure.editorKey === moved.editorParent);
    if (parent && originalParent) return { ...moved, baseY: (parent.baseY ?? 0) +
      ((original.baseY ?? 0) - (originalParent.baseY ?? 0)) * (parent.modelScale?.y ?? 1) };
    if (!base.terrain) return moved;
    if (map.terrain === base.terrain && original.x === moved.x && original.z === moved.z) return moved;
    return { ...moved, baseY: map.terrain.heightAt(moved.x, moved.z) +
      ((original.baseY ?? base.terrain.heightAt(original.x, original.z)) - base.terrain.heightAt(original.x, original.z)) };
  };
  if (map.structures) {
    map.structures = map.structures.map(structure => {
      const source = edits.added[structure.editorKey]?.template ?? structure.editorKey;
      return elevation(items.get(source).value, structure);
    });
  }
  if (map.ship && base.terrain) map.ship = elevation(base.ship, map.ship);
  map.boxes = base.boxes.flatMap(box => {
    const key = 'box:' + box.id;
    if (removed.has(key) || removed.has(box.editorParent)) return [];
    return [elevation(box, at(box, key))];
  });
  for (const [key, placement] of added) {
    const { kind, value } = items.get(placement.template);
    if (kind === 'box') {
      map.boxes.push(elevation(value, { ...scaleAsset(value, placement.scale), id: key, editorKey: key, editorParent: undefined, x: placement.x, z: placement.z }));
    }
    for (const box of base.boxes.filter(box => box.editorParent === placement.template)) {
      const childKey = key + '/' + box.id;
      const scale = placement.scale ?? UNIT_SCALE;
      map.boxes.push(elevation(box, { ...scaleAsset(box, scale),
        x: placement.x + (box.x - value.x) * scale.x, z: placement.z + (box.z - value.z) * scale.z,
        id: childKey, editorKey: key, editorParent: key }));
    }
  }
  if (map.terrain) map.points = map.points.map(point => ({ ...point, y: map.terrain.heightAt(point.x, point.z) }));
  map.districts = [...map.points, ...map.landmarks];
  if (base.vehicleRoutes) {
    const vehicles = new Set(base.vehicleSpawns.map(vehicle => vehicle.id));
    const nodes = base.vehicleRoutes.nodes.map(node => {
      const vehicleKey = 'vehicle:' + node.id;
      return at(node, vehicles.has(node.id) && !removed.has(vehicleKey) ? vehicleKey : 'route:' + node.id);
    });
    map.vehicleRoutes = { ...base.vehicleRoutes, nodes };
    map.roads = routeRoads(nodes, base.vehicleRoutes.edges);
  }
  return map;
}
