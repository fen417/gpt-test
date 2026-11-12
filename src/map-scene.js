import * as THREE from 'three';
import { mapItems } from '../shared/map-edits.js';
import { localAsset, UNIT_SCALE } from '../shared/asset-scale.js';
import { addPortGround, createPortModelBuilder } from './port-visuals.js';
import { addQuarryGround, addQuarryAsset, addQuarrySigns } from './quarry-visuals.js';
import { addVillageGround, createVillageModelBuilder } from './village-visuals.js';
import { addWarehouseDetails } from './visuals.js';
import { createVehicleRig } from './vehicles.js';

function fences(owner, map) {
  if (map.playArea) return;
  const limit = map.size / 2, west = map.shoreX ?? -limit - 1;
  const material = owner.materials.steel;
  for (let x = west; x <= limit; x += 10) for (const side of [-1, 1])
    owner.cylinder(owner.scene, x, 1.7, side * (limit + 1), .055, 3.4, material);
  const sides = map.shoreX === undefined ? [-1, 1] : [1];
  for (let z = -limit; z <= limit; z += 10) for (const side of sides)
    owner.cylinder(owner.scene, side * (limit + 1), 1.7, z, .055, 3.4, material);
  for (const y of [.7, 1.7, 2.7]) {
    for (const side of [-1, 1]) owner.box(owner.scene, (west + limit) / 2, y, side * (limit + 1),
      limit - west, .025, .025, material, false);
    for (const side of sides) owner.box(owner.scene, side * (limit + 1), y, 0,
      .025, .025, map.size, material, false);
  }
}

export function buildMapScene(owner, map, { editable = false } = {}) {
  const parent = owner.scene, previousMap = owner.map;
  const root = new THREE.Group(), background = new THREE.Group(), groups = new Map();
  let roadSurface;
  const items = mapItems(map);
  const represented = new Set(items.filter(item => item.kind === 'box').map(item => item.value.id));
  root.add(background);
  parent.add(root);
  owner.scene = background;
  owner.map = map;
  try {
    if (map.shoreX !== undefined) {
      addPortGround(owner, map, false);
      if (map.vehicleRoutes) createPortModelBuilder(owner)({ roads: map.roads });
    }
    else if (map.theme === 'desert-village') roadSurface = addVillageGround(owner, map, false);
    else {
      const span = map.size + 256, segments = span / map.terrain.cell;
      const geometry = new THREE.PlaneGeometry(span, span, segments, segments);
      const uv = geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * span / 9, uv.getY(i) * span / 9);
      const ground = new THREE.Mesh(geometry, owner.surfaces.ground);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      background.add(ground);
      addQuarryGround(owner, map, ground, false);
    }
    fences(owner, map);
    if (editable) owner.mergeStaticWorld(new Set());
    const portModels = createPortModelBuilder(owner);
    const villageModels = createVillageModelBuilder(owner);
    for (const item of items) {
      const { key, kind, value } = item;
      const assetMapId = value.assetMapId ?? map.id;
      if (['landform', 'landmark', 'spawn', 'route'].includes(kind) || (kind === 'vehicle' && !editable)) continue;
      const group = new THREE.Group();
      group.userData.editorKey = key;
      group.userData.editorParent = value.editorParent;
      groups.set(key, group);
      root.add(group);
      owner.scene = group;
      const scale = value.modelScale ?? UNIT_SCALE;
      const anchor = { x: value.x, z: value.z, baseY: value.baseY ?? value.y ?? map.terrain?.heightAt(value.x, value.z) ?? 0 };
      const local = localAsset(value, anchor, scale);
      const parts = kind === 'box' ? [local] : map.boxes.filter(box =>
        box.editorParent === key && !represented.has(box.id)).map(box => localAsset(box, anchor, scale));
      if (kind === 'objective') {
        owner.map = { ...map, terrain: map.terrain && { heightAt: (x, z) =>
          map.terrain.heightAt(x + anchor.x, z + anchor.z) - anchor.baseY } };
        owner.makeFlag({ ...local, y: 0 });
        owner.map = map;
      } else if (kind === 'vehicle') {
        const rig = createVehicleRig(value.type, owner.createMaterial, [0x5bd9e8, 0xf0a15d]);
        for (const rider of rig.riders) rider.visible = false;
        rig.driverGloves.visible = false;
        if (rig.gunnerGloves) rig.gunnerGloves.visible = false;
        if (rig.turret) rig.turret.flash.visible = false;
        group.add(rig.group);
      } else if (kind === 'road' && (roadSurface || map.id === 'quarry')) {
        // Roads belong to the shared terrain mask. Their groups remain selectable.
      } else {
        if (kind === 'ship') portModels({ ship: local });
        else if (assetMapId === 'port' || (kind === 'road' && assetMapId === 'quarry')) {
          const fields = { structure: 'structures', road: 'roads', crane: 'cranes', rail: 'railTracks', sign: 'signs' };
          const field = fields[kind];
          portModels(field ? { boxes: parts, [field]: [local] } : { boxes: parts });
        } else if (assetMapId === 'village') {
          const terrain = { heightAt: (x, z) =>
            ((map.terrain?.heightAt(x * scale.x + anchor.x, z * scale.z + anchor.z) ?? 0) - anchor.baseY) / scale.y };
          villageModels(parts, kind === 'structure' ? [local] : [], kind === 'road' && !roadSurface ? [local] : [], terrain);
        } else {
          if (kind === 'structure') addWarehouseDetails(owner, [local]);
          const terrain = { heightAt: (x, z) =>
            ((map.terrain?.heightAt(x * scale.x + anchor.x, z * scale.z + anchor.z) ?? 0) - anchor.baseY) / scale.y };
          if (kind === 'sign') addQuarrySigns(owner, { terrain, signs: [local] });
          for (const part of parts) addQuarryAsset(owner, part, { ...map, terrain });
        }
        owner.buildMapBoxes(parts);
      }
      if (editable) owner.mergeStaticWorld(new Set());
      group.position.set(anchor.x, anchor.baseY, anchor.z);
      group.scale.set(scale.x, scale.y, scale.z);
    }
    return { root, groups, owner, roadSurface };
  } finally {
    owner.scene = parent;
    owner.map = previousMap;
  }
}

export function disposeMapScene(level, surfaces) {
  const geometries = new Set(Object.values(level.owner.geo)), materials = new Set(), textures = new Set();
  const sharedMaterials = new Set(Object.values(surfaces).filter(value => value?.isMaterial));
  const sharedTextures = new Set(Object.values(surfaces.maps));
  function collectMaterial(material) {
    if (!material || sharedMaterials.has(material) || materials.has(material)) return;
    materials.add(material);
    for (const value of Object.values(material)) if (value?.isTexture && !sharedTextures.has(value)) textures.add(value);
    collectMaterial(material._lowMaterial);
    collectMaterial(material._highMaterial);
  }
  level.root.traverse(object => {
    if (object.isInstancedMesh) object.dispose();
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) collectMaterial(material);
  });
  for (const material of Object.values(level.owner.materials)) collectMaterial(material);
  for (const texture of level.owner.flagLogos ?? []) textures.add(texture);
  level.root.removeFromParent();
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  textures.forEach(texture => texture.dispose());
}
