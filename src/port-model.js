import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { pairMaterials } from './visuals.js';
import { portLayoutKey } from './port-layout-key.js';
import {MapTextures} from './map-textures.js';
import manifest from './assets/port/manifest.json' with { type: 'json' };

const baseUrl = new URL('./assets/port/base.glb', import.meta.url).href;
const detailUrl = new URL('./assets/port/detail.glb', import.meta.url).href;
const paintUrl = new URL('./assets/port/paint.webp', import.meta.url).href;

export function hasPortAsset(map) {
  return map.id === 'port' && portLayoutKey(map) === manifest.layout;
}

export class PortModel {
  constructor(owner) {
    this.owner = owner;
    this.loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    this.materials = new Map();
    this.textureLoader = new MapTextures();
  }

  loadBase() {
    return this.baseLoad ??= this.load(baseUrl, 'port-base').then(scene => this.base = scene);
  }

  loadDetail() {
    return this.detailLoad ??= this.load(detailUrl, 'port-detail').then(scene => this.detail = scene);
  }

  async load(url, name) {
    try {
      const { scene } = await this.loader.loadAsync(url);
      const originals = new Set();
      scene.traverse(mesh => {
        if (!mesh.isMesh) return;
        originals.add(mesh.material);
        if (this.disposed) {
          mesh.geometry.dispose();
          return;
        }
        const uv = mesh.geometry.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
        mesh.material = this.surface(mesh.userData.portSurface);
        mesh.castShadow = mesh.userData.portCaster === true;
        mesh.receiveShadow = true;
        mesh.geometry.computeBoundingSphere();
      });
      for (const material of originals) material.dispose();
      if (this.disposed) return null;
      scene.name = name;
      return scene;
    } catch (error) {
      console.warn('Port geometry', error);
      return null;
    }
  }

  surface(name) {
    if (this.materials.has(name)) return this.materials.get(name);
    const source = this.owner.surfaces[name === 'deck' ? 'concrete' : name];
    let map = source?.map ?? null;
    if (name === 'painted') {
      map = this.paint = this.textureLoader.load(paintUrl);
      map.colorSpace = THREE.SRGBColorSpace;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
    }
    const options = { vertexColors: true, map };
    let high = new THREE.MeshStandardMaterial({
      ...options, normalMap: source?.normalMap ?? null,
      normalScale: new THREE.Vector2(.29, .29),
      roughness: name === 'glazing' ? .31 : name === 'painted' ? .71 : name === 'metal' ? .67 : source?.roughness ?? .9,
      metalness: name === 'metal' || name === 'painted' ? .27 : name === 'glazing' ? .16 : 0,
    });
    let low = new THREE.MeshLambertMaterial(options);
    const enhanced={deck:'concrete',concrete:'concrete',asphalt:'asphalt',brick:'brick',wood:'wood',metal:'metal',cloth:'cloth',ground:'earth'}[name];
    if(enhanced)high.userData.remasterSurface=low.userData.remasterSurface=enhanced;
    if (name === 'deck' || name === 'asphalt') {
      const shadows = this.owner.groundShadows;
      high = shadows.apply(high) ?? high;
      low = shadows.apply(low) ?? low;
    }
    this.materials.set(name, pairMaterials(high, low));
    return high;
  }

  dispose() {
    this.disposed = true;
    for (const scene of [this.base, this.detail]) {
      scene?.removeFromParent();
      scene?.traverse(mesh => mesh.geometry?.dispose());
    }
    for (const material of this.materials.values()) {
      material._lowMaterial.dispose();
      material.dispose();
    }
    this.paint?.dispose();
  }
}
