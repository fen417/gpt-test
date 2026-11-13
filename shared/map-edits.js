import { makeTerrain } from './terrain.js';
import { scaleAsset, UNIT_SCALE } from './asset-scale.js';
import { fitLowProp, groundAsset, shipTerrainPad } from './asset-grounding.js';
import { rotateMapAssets } from './geometry.js';

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
const cloneKinds = new Set(['box', 'structure', 'vehicle', 'road', 'landform', 'landmark', 'sign', 'crane', 'rail', 'ship']);

export function mapItems(map, includeVehicleRoutes = false) {
  const items = [];
  const vehicleIds = new Set(map.vehicleSpawns?.map(vehicle => vehicle.id));
  for (const [kind, field] of Object.entries(layers)) {
    for (const [i, value] of (map[field] ?? []).entries()) {
      if (kind === 'road' && map.vehicleRoutes && !value.editorKey?.startsWith('new:')) continue;
      const key = value.editorKey ?? kind + ':' + (value.id ?? i);
      if (kind === 'box' && (value.editorPart || ['port-roof', 'port-crane-leg', 'port-lintel'].includes(value.kind) ||
          (value.kind === 'port-wall' && value.editorParent) ||
          (value.editorParent && value.editorParent === value.editorKey))) continue;
      if (value.editorPose) {
        const { x, y, z } = value.editorPose;
        items.push({ key, kind, value: { ...value, x, z, baseY: y }, geometryValue: value });
      } else items.push({ key, kind, value });
    }
  }
  for (const value of map.vehicleRoutes?.nodes ?? []) {
    if (includeVehicleRoutes || !vehicleIds.has(value.id)) items.push({ key: 'route:' + value.id, kind: 'route', value });
  }
  if (map.ship) items.push({ key: map.ship.editorKey ?? 'ship:0', kind: 'ship', value: map.ship });
  for (const value of map.extraShips ?? []) items.push({ key: value.editorKey, kind: 'ship', value });
  return items;
}

export function assetCatalog(map, sources = {}) {
  const result = new Map(mapItems(map, true).map(item => [item.key, { ...item, sourceMap: map, sourceKey: item.key }]));
  for (const source of Object.values(sources)) {
    const templates = mapItems(source, true);
    if (source.vehicleRoutes) source.roads.forEach((value, i) => templates.push({ key: 'road:' + i, kind: 'road', value }));
    for (const item of templates) result.set(source.id + '/' + item.key,
      { ...item, key: source.id + '/' + item.key, sourceMap: source, sourceKey: item.key });
  }
  return result;
}

export const canCloneItem = item => cloneKinds.has(item.kind);
export const canRemoveItem = item => !['objective', 'spawn', 'route', 'segment'].includes(item.kind);
export const canResizeItem = item => ['box', 'structure', 'road', 'landform', 'vehicle', 'sign', 'crane', 'rail', 'ship'].includes(item.kind);
export const canRotateItem = item => ['box','structure','vehicle','sign','crane','rail','ship'].includes(item.kind);

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

export function validMapEdits(map, edits, sources) {
  if (!only(edits, ['version', 'moves', 'added', 'removed']) || edits.version !== 1 ||
      !record(edits.moves) || !record(edits.added) || !Array.isArray(edits.removed)) return false;
  if (Object.keys(edits.added).length > 350 || Object.keys(edits.moves).length > 2000 ||
      edits.removed.length > 2000 || new Set(edits.removed).size !== edits.removed.length) return false;
  const items = assetCatalog(map, sources);
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
  const validRotation=(item,value)=>value===undefined||(canRotateItem(item)&&only(value,['x','y','z'])&&
    ['x','y','z'].every(axis=>Number.isFinite(value[axis])&&Math.abs(value[axis])<=Math.PI*2));
  const validHeight=(item,value)=>value===undefined||
    (item.kind==='box'&&item.value.editorParent&&Number.isFinite(value)&&Math.abs(value)<=2048);
  for (const [key, move] of Object.entries(edits.moves)) {
    const item = items.get(key);
    if (key.includes('/')) return false;
    if (!item || !only(move, ['x', 'z', 'y', 'scale','rotation']) || !validPosition(item, move) ||
        !validScale(item, move.scale) || !validRotation(item, move.rotation) || !validHeight(item, move.y)) return false;
  }
  let extraTerrain = 0, extraVehicles = 0;
  for (const [key, added] of Object.entries(edits.added)) {
    if (!/^new:[0-9a-f]{32}$/.test(key) || !only(added, ['template', 'x', 'z', 'scale','rotation'])) return false;
    const template = items.get(added.template);
    if (!template || !canCloneItem(template) || !validPosition(template, added) ||
        !validScale(template, added.scale) || !validRotation(template, added.rotation)) return false;
    if (template.kind === 'landform' && ++extraTerrain > 20) return false;
    if (template.kind === 'vehicle' && ++extraVehicles > 16) return false;
  }
  return edits.removed.every(key => !key.includes('/') && items.has(key) && canRemoveItem(items.get(key)) && !has(edits.moves, key));
}

export function applyMapEdits(base, edits, sources) {
  if (!Object.keys(edits.moves).length && !Object.keys(edits.added).length && !edits.removed.length) return base;
  const items = assetCatalog(base, sources);
  const originals = new Map(Object.values({ ...sources, [base.id]: base }).map(source =>
    [source, new Map(mapItems(source, true).map(item => [item.key, item.value]))]));
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
    if(direct?.rotation)Object.assign(result,{modelRotation:{...direct.rotation},authoredRotation:true});
    if(direct?.y!==undefined)result.authoredY=direct.y;
    return result;
  };
  const map = { ...base };
  const copied = (template, placement, key) => ({ ...scaleAsset(template.value, placement.scale),
    id: key, editorKey: key, editorParent: undefined, x: placement.x, z: placement.z,
    assetMapId: template.sourceMap.id, assetTemplate: template.sourceKey,
    ...(placement.rotation?{modelRotation:{...placement.rotation},authoredRotation:true}:{}),
    modelSeed: template.value.modelSeed ?? template.value.id ?? template.sourceKey });
  for (const [kind, field] of Object.entries(layers)) {
    if (kind === 'box' || (kind === 'road' && base.vehicleRoutes)) continue;
    if (!base[field] && !added.some(([, placement]) => items.get(placement.template).kind === kind)) continue;
    map[field] = (base[field] ?? []).flatMap((value, i) => {
      const key = kind + ':' + (value.id ?? i);
      return removed.has(key) ? [] : [{ ...at(value, key), editorKey: key }];
    });
    for (const [key, placement] of added) {
      const template = items.get(placement.template);
      if (template.kind !== kind) continue;
      map[field].push(copied(template, placement, key));
    }
  }
  if (base.ship) map.ship = removed.has('ship:0') ? null : at(base.ship, 'ship:0');
  map.extraShips = added.filter(([, placement]) => items.get(placement.template).kind === 'ship')
    .map(([key, placement]) => copied(items.get(placement.template), placement, key));
  if (added.some(([, placement]) => items.get(placement.template).kind === 'landform') ||
      Object.keys(edits.moves).some(key => key.startsWith('landform:')) ||
      edits.removed.some(key => key.startsWith('landform:'))) {
    map.terrain = makeTerrain(base.size, map.landforms ?? [], base.terrain?.cell ?? 4);
  }
  const changedStructures = added.some(([, placement]) => items.get(placement.template).kind === 'structure') ||
    [...Object.keys(edits.moves), ...edits.removed].some(key => key.startsWith('structure:'));
  const changedShips = added.some(([, placement]) => items.get(placement.template).kind === 'ship') ||
    [...Object.keys(edits.moves), ...edits.removed].some(key => key.startsWith('ship:'));
  if (map.terrain && (changedStructures || changedShips || map.terrain !== base.terrain)) {
    const relief = makeTerrain(base.size, map.landforms ?? [], map.terrain.cell);
    map.terrainPads = (map.structures ?? []).filter(structure => structure.terrainPad).map(structure => ({
      x: structure.x, z: structure.z, w: structure.w + 8, d: structure.d + 8,
      height: relief.heightAt(structure.x, structure.z), blend: base.terrainPadBlend??4,
      ...(base.id==='village'?{protectedW:structure.w+4,protectedD:structure.d+4}:{}),
    }));
    for (const ship of [map.ship, ...map.extraShips].filter(ship => ship?.terrainPad)) map.terrainPads.push(shipTerrainPad(ship, relief));
    map.terrain = makeTerrain(base.size, map.landforms ?? [], map.terrain.cell, map.terrainPads);
  }
  const elevation = (original, moved, sourceMap = base) => {
    if(moved.authoredY!==undefined)return {...moved,baseY:moved.authoredY};
    if(moved.groundFit&&map.terrain&&!moved.editorParent)return fitLowProp(moved,map.terrain);
    if (moved.terrainPad && moved.beached && map.terrain) return { ...moved, baseY:
      map.terrain.heightAt(moved.x, moved.z) + 2 * (moved.modelScale?.y ?? 1) };
    if (!moved.editorParent && map.terrain && ['village-barricade', 'wall', 'barrier', 'sandbags'].includes(moved.kind)) return groundAsset(moved, map.terrain);
    const originalParent = originals.get(sourceMap)?.get(original.editorParent);
    const parent = [...(map.structures ?? []), ...(map.cranes ?? []), ...(map.railTracks ?? []), ...map.extraShips]
      .find(structure => structure.editorKey === moved.editorParent);
    if (parent && originalParent) return { ...moved, baseY: (parent.baseY ?? map.terrain?.heightAt(parent.x, parent.z) ?? 0) +
      ((original.baseY ?? 0) - (originalParent.baseY ?? sourceMap.terrain?.heightAt(originalParent.x, originalParent.z) ?? 0)) * (parent.modelScale?.y ?? 1) };
    if (!map.terrain) return { ...moved, baseY: ((original.baseY ?? 0) - (sourceMap.terrain?.heightAt(original.x, original.z) ?? 0)) * (moved.modelScale?.y ?? 1) };
    if (sourceMap === base && map.terrain === base.terrain && original.x === moved.x && original.z === moved.z) return moved;
    return { ...moved, baseY: map.terrain.heightAt(moved.x, moved.z) +
      ((original.baseY ?? sourceMap.terrain?.heightAt(original.x, original.z) ?? 0) - (sourceMap.terrain?.heightAt(original.x, original.z) ?? 0)) * (moved.modelScale?.y ?? 1) };
  };
  if (map.structures) {
    map.structures = map.structures.map(structure => {
      const source = edits.added[structure.editorKey]?.template ?? structure.editorKey;
      const template = items.get(source);
      return elevation(template.value, structure, template.sourceMap);
    });
  }
  for (const field of ['cranes', 'railTracks']) if (map[field]) map[field] = map[field].map(value => {
    const template = items.get(edits.added[value.editorKey]?.template ?? value.editorKey);
    return elevation(template.value, value, template.sourceMap);
  });
  if (map.ship) map.ship = elevation(base.ship, map.ship);
  map.extraShips = map.extraShips.map(ship => {
    const template = items.get(edits.added[ship.editorKey].template);
    return elevation(template.value, ship, template.sourceMap);
  });
  map.boxes = base.boxes.flatMap(box => {
    const key = 'box:' + box.id;
    if (removed.has(key) || removed.has(box.editorParent)) return [];
    return [elevation(box, at(box, key))];
  });
  for (const [key, placement] of added) {
    const template = items.get(placement.template), { kind, value, sourceMap, sourceKey } = template;
    if (kind === 'box') {
      map.boxes.push(elevation(value, copied(template, placement, key), sourceMap));
    }
    if (kind === 'ship') {
      const ship = map.extraShips.find(ship => ship.editorKey === key), scaleY = ship.modelScale.y;
      map.boxes.push({ id: key + '/hull', editorKey: key, editorParent: key, editorPart: true,
        kind: 'port-ship-hull', x: ship.x, z: ship.z, w: ship.w, d: ship.d,
        baseY: (ship.baseY ?? 0) - 2.7 * scaleY, h: 7.4 * scaleY, modelScale: ship.modelScale });
    }
    for (const box of sourceMap.boxes.filter(box => box.editorParent === sourceKey)) {
      const childKey = key + '/' + box.id;
      const scale = placement.scale ?? UNIT_SCALE;
      map.boxes.push(elevation(box, { ...scaleAsset(box, scale),
        x: placement.x + (box.x - value.x) * scale.x, z: placement.z + (box.z - value.z) * scale.z,
        id: childKey, editorKey: key, editorParent: key,
        assetMapId: sourceMap.id, assetTemplate: 'box:' + box.id }, sourceMap));
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
    if (added.some(([, placement]) => items.get(placement.template).kind === 'road')) {
      map.editableRoads = true;
      map.roads = map.roads.map((road, i) => ({ ...road, editorKey: 'generated-road:' + i }));
      for (const [key, placement] of added) {
        const template = items.get(placement.template);
        if (template.kind === 'road') map.roads.push(copied(template, placement, key));
      }
    }
  }
  if (map.structures?.some(structure => structure.floors > 1)) map.stepHeight ??= .3;
  return rotateMapAssets(map,edits);
}
