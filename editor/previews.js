import * as THREE from 'three';
import { createMapModelBuilder } from '../src/renderer.js';
import { createPortModelBuilder } from '../src/port-visuals.js';
import { addQuarryAsset, addQuarrySigns } from '../src/quarry-visuals.js';
import { createVillageModelBuilder } from '../src/village-visuals.js';
import { createVehicleRig, disposeVehicleRig } from '../src/vehicles.js';
import { addWarehouseDetails, makeSign } from '../src/visuals.js';
import { makeTerrain } from '../shared/terrain.js';

const width = 360, height = 200;
const portLayers = { road: 'roads', crane: 'cranes', rail: 'railTracks', sign: 'signs', structure: 'structures' };

function terrainModel(owner, form) {
  const size = Math.ceil(Math.max(form.rx, form.rz) / 4) * 8 + 16;
  const terrain = makeTerrain(size, [{ ...form, x: 0, z: 0 }]);
  const segments = size / terrain.cell;
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) {
    position.setY(i, terrain.heightAt(position.getX(i), position.getZ(i)));
    uv.setXY(i, uv.getX(i) * size / 12, uv.getY(i) * size / 12);
  }
  geometry.computeVertexNormals();
  owner.scene.add(new THREE.Mesh(geometry, owner.surfaces.ground));
}

function frame(camera, group, direction) {
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  if (bounds.isEmpty()) throw new Error('Missing map asset geometry');
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  camera.position.copy(direction.normalize().multiplyScalar(size.length() * 2).add(center));
  camera.lookAt(center);
  camera.far = Math.max(50, size.length() * 5);
  camera.updateMatrixWorld(true);

  let right = 0, top = 0;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const corner = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    right = Math.max(right, Math.abs(corner.x));
    top = Math.max(top, Math.abs(corner.y));
  }
  const aspect = width / height;
  camera.top = Math.max(top, right / aspect, .1) * 1.16;
  camera.right = camera.top * aspect;
  camera.bottom = -camera.top;
  camera.left = -camera.right;
  camera.updateProjectionMatrix();
}

export function createAssetPreviews(surfaces) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xeef6ff, 0x8e8072, 2.5));
  const key = new THREE.DirectionalLight(0xffedda, 3.2);
  key.position.set(3, 7, 5);
  const fill = new THREE.DirectionalLight(0xb7dbff, 1.25);
  fill.position.set(-4, 2, -4);
  scene.add(key, fill);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 1000);
  const owner = createMapModelBuilder(surfaces);
  const addPortModels = createPortModelBuilder(owner);
  const addVillageModels = createVillageModelBuilder(owner);
  const sharedGeometry = new Set(Object.values(owner.geo));
  const previews = new Map();
  let queue = Promise.resolve();

  function render(map, { key, kind, value }) {
    const group = new THREE.Group();
    owner.scene = group;
    scene.add(group);
    let vehicle;
    try {
      const boxes = kind === 'box' ? [value] : map.boxes.filter(box => box.editorParent === key);
      if (kind === 'vehicle') {
        vehicle = createVehicleRig(value.type, owner.createMaterial, [0x5bd9e8, 0xf0a15d]);
        for (const rider of vehicle.riders) rider.visible = false;
        vehicle.driverGloves.visible = false;
        if (vehicle.gunnerGloves) vehicle.gunnerGloves.visible = false;
        if (vehicle.turret) vehicle.turret.flash.visible = false;
        group.add(vehicle.group);
      } else if (kind === 'landform') {
        terrainModel(owner, value);
      } else if (kind === 'landmark') {
        group.add(makeSign(value.name, '', 3.3));
      } else {
        if (map.shoreX !== undefined) {
          const layer = portLayers[kind];
          addPortModels(layer ? { boxes, [layer]: [value] } : { boxes });
        } else if (map.theme === 'desert-village') {
          addVillageModels(boxes, kind === 'structure' ? [value] : [], kind === 'road' ? [value] : []);
        } else {
          if (kind === 'structure') addWarehouseDetails(owner, [value]);
          if (kind === 'sign') addQuarrySigns(owner, { terrain: map.terrain, signs: [value] });
          for (const box of boxes) addQuarryAsset(owner, box, map);
        }
        owner.buildMapBoxes(boxes);
      }
      const angle = kind === 'vehicle' || (kind === 'sign' && map.terrain && value.yaw !== 0) ? -1.4 : 1.4;
      frame(camera, group, new THREE.Vector3(1, .85, angle));
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    } finally {
      if (vehicle) disposeVehicleRig(vehicle);
      group.traverse(object => {
        if (object.isInstancedMesh) object.dispose();
        if (object.geometry && !sharedGeometry.has(object.geometry)) object.geometry.dispose();
      });
      group.removeFromParent();
      owner.scene = null;
    }
  }

  return (map, item) => {
    const key = map.id + '/' + item.key;
    if (!previews.has(key)) {
      const job = queue.then(() => new Promise(resolve => requestAnimationFrame(resolve))).then(() => render(map, item));
      previews.set(key, job);
      queue = job.catch(() => {});
    }
    return previews.get(key);
  };
}
