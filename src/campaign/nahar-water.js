import * as THREE from 'three';
import {NAHAR_WATER} from '../../shared/campaign/nahar.js';

function rippleMap() {
  const size = 128, tau = 2 * Math.PI;
  const elevations = new Float32Array(size * size);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const u = x * tau / size, v = z * tau / size;
    const wind = 2 * u + 4 * v + Math.sin(2 * u - v) * 1.15;
    elevations[z * size + x] = Math.sin(wind) * (.52 + .19 * Math.cos(u - 2 * v)) +
      .37 * Math.sin(4 * u - 3 * v + Math.cos(u + 2 * v) * .85) +
      .09 * Math.sin(7 * u + 9 * v);
  }
  const normal = new Uint8Array(size * size * 4);
  const sample = (x, z) => elevations[((z + size) % size) * size + (x + size) % size];
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const i = (z * size + x) * 4;
    const dx = (sample(x - 1, z) - sample(x + 1, z)) * .86;
    const dy = (sample(x, z - 1) - sample(x, z + 1)) * .86;
    const length = Math.hypot(dx, dy, 1);
    normal.set([128 + 127 * dx / length, 128 + 127 * dy / length, 128 + 127 / length, 255], i);
  }
  const map = new THREE.DataTexture(normal, size, size, THREE.RGBAFormat);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 4;
  map.needsUpdate = true;
  return map;
}

function bankAt(terrain, x, side) {
  const {z, y, d} = NAHAR_WATER;
  let wet = 0, dry = d / 2;
  for (let i = 0; i < 10; i++) {
    const middle = (wet + dry) / 2;
    if (terrain.heightAt(x, z + side * middle) < y) wet = middle;
    else dry = middle;
  }
  const uneven = .5 + .32 * Math.sin(x * .13 + side) + .17 * Math.sin(x * .38 + 2 * side);
  return {edge: (wet + dry) / 2, fade: .7 + uneven * 1.35, damp: .45 + uneven * 1.25};
}

function stripGeometry(strips) {
  const positions = [], uv = [], colors = [], indices = [];
  for (const columns of strips) {
    const first = positions.length / 3, rows = columns[0].length;
    for (const [i, column] of columns.entries()) for (const [j, {x, y, z, color, alpha}] of column.entries()) {
      positions.push(x, y, z);
      uv.push(x / 13.2, -z / 9.6);
      colors.push(color.r, color.g, color.b, alpha);
      if (i > 0 && j > 0) {
        const v = first + i * rows + j;
        indices.push(v - rows - 1, v - rows, v - 1, v - rows, v, v - 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function canalGeometry(terrain) {
  const {x, y, z, w} = NAHAR_WATER;
  const deep = new THREE.Color('#4d6055'), silt = new THREE.Color('#75694f');
  const mud = new THREE.Color('#473e30');
  const water = [], banks = [[], []];
  const segments = Math.ceil(w / 4);
  for (let i = 0; i <= segments; i++) {
    const along = x + (i / segments - .5) * w;
    const sampleX = THREE.MathUtils.clamp(along, x - w / 2 + .001, x + w / 2 - .001);
    const waterPoint = (offset, color, alpha) => ({x: along, y, z: z + offset, color, alpha});
    const crossSection = [];
    for (const [bank, side] of [-1, 1].entries()) {
      const {edge, fade, damp} = bankAt(terrain, sampleX, side);
      const waterSection = [
        waterPoint(side * edge, silt, 0),
        waterPoint(side * (edge - fade * .36), silt, .36),
        waterPoint(side * (edge - fade), silt, 1),
        waterPoint(side * (edge - fade - 1.55), deep, 1),
      ];
      crossSection.push(...(side < 0 ? waterSection : waterSection.reverse()));
      const bankSection = [[-fade, 0], [-fade * .53, .24], [-.22, .49], [.28, .38], [damp, 0]]
        .map(([offset, alpha]) => {
          const bankZ = z + side * (edge + offset);
          return {x: along, y: terrain.heightAt(sampleX, bankZ) + .026, z: bankZ, color: mud, alpha};
        });
      banks[bank].push(side < 0 ? bankSection.reverse() : bankSection);
    }
    water.push(crossSection);
  }
  return {water: stripGeometry([water]), banks: stripGeometry(banks)};
}

export class NaharWater {
  constructor(renderer, parent) {
    const geometry = canalGeometry(renderer.map.terrain);
    this.ripples = rippleMap();
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true, transparent: true, alphaTest: .015,
      normalMap: this.ripples, normalScale: new THREE.Vector2(.22, .17),
      roughness: .41, metalness: .03, envMap: renderer.atmosphere.envTexture, envMapIntensity: .53,
    });
    this.surface = new THREE.Mesh(geometry.water, material);
    this.surface.name = 'Nahar canal surface';
    this.surface.renderOrder = -1;
    this.banks = new THREE.Mesh(geometry.banks, new THREE.MeshLambertMaterial({
      vertexColors: true, transparent: true, depthWrite: false, alphaTest: .012,
    }));
    this.banks.name = 'Nahar damp banks';
    this.banks.renderOrder = -2;
    parent.add(this.banks, this.surface);
  }

  update(clock, fogDensity, lowQuality) {
    this.ripples.offset.set((clock * .033) % 1, (clock * .003) % 1);
    const haze = THREE.MathUtils.smoothstep(fogDensity, .00172, .0047);
    this.surface.material.roughness = .41 + haze * .1;
    this.surface.material.envMapIntensity = .53 - haze * .23;
    this.surface.receiveShadow = !lowQuality;
    this.banks.receiveShadow = !lowQuality;
  }

  dispose() {
    for (const mesh of [this.surface, this.banks]) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.ripples.dispose();
  }
}
