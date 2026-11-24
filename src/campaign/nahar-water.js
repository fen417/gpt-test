import * as THREE from 'three';
import {NAHAR_WATER} from '../../shared/campaign/nahar.js';

function rippleMaps() {
  const size = 128, tau = 2 * Math.PI;
  const elevations = new Float32Array(size * size);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const u = x * tau / size, v = z * tau / size;
    const wind = 3 * u + 5 * v + Math.sin(2 * u - v) * .8;
    elevations[z * size + x] = Math.sin(wind) * (.64 + .20 * Math.cos(u - 2 * v)) +
      .35 * Math.sin(7 * u - 9 * v + Math.cos(u + 2 * v) * 1.2) +
      .13 * Math.sin(13 * u + 16 * v);
  }
  const normal = new Uint8Array(size * size * 4), color = new Uint8Array(normal.length);
  const sample = (x, z) => elevations[((z + size) % size) * size + (x + size) % size];
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const i = (z * size + x) * 4;
    const dx = (sample(x - 1, z) - sample(x + 1, z)) * .86;
    const dy = (sample(x, z - 1) - sample(x, z + 1)) * .86;
    const length = Math.hypot(dx, dy, 1);
    normal.set([128 + 127 * dx / length, 128 + 127 * dy / length, 128 + 127 / length, 255], i);
    const luma = 226 + 15 * sample(x, z);
    color.set([luma, luma, luma, 255], i);
  }
  const texture = (data, width, depth) => {
    const map = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.anisotropy = 4;
    map.repeat.set(NAHAR_WATER.w / width, NAHAR_WATER.d / depth);
    map.needsUpdate = true;
    return map;
  };
  return {normal: texture(normal, 10.5, 7.4), color: texture(color, 17.3, 11.8)};
}

export class NaharWater {
  constructor(renderer, parent) {
    const {x, y, z, w, d} = NAHAR_WATER;
    const geometry = new THREE.PlaneGeometry(w, d, 1, 32).rotateX(-Math.PI / 2);
    const vertices = geometry.getAttribute('position'), colors = [];
    const deep = new THREE.Color('#435b50'), sediment = new THREE.Color('#7d7255');
    const color = new THREE.Color();
    for (let i = 0; i < vertices.count; i++) {
      const edge = THREE.MathUtils.smoothstep(Math.abs(vertices.getZ(i)), 8, 13);
      color.copy(deep).lerp(sediment, edge);
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.maps = rippleMaps();
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true, normalMap: this.maps.normal, normalScale: new THREE.Vector2(.63, .63),
      map: this.maps.color, roughness: .23, metalness: .08,
      envMap: renderer.atmosphere.envTexture, envMapIntensity: .85,
    });
    this.surface = new THREE.Mesh(geometry, material);
    this.surface.name = 'Nahar canal surface';
    this.surface.position.set(x, y, z);
    this.surface.receiveShadow = true;
    parent.add(this.surface);
  }

  update(clock, fogDensity, lowQuality) {
    // The fine ridges drift downstream while the broad patches move more slowly.
    this.maps.normal.offset.set((clock * .058) % 1, (clock * .006) % 1);
    this.maps.color.offset.set((clock * .024) % 1, 0);
    const haze = THREE.MathUtils.smoothstep(fogDensity, .00172, .0047);
    this.surface.material.roughness = .23 + haze * .16;
    this.surface.material.envMapIntensity = .85 - haze * .35;
    this.surface.receiveShadow = !lowQuality;
  }

  dispose() {
    this.surface.removeFromParent();
    this.surface.geometry.dispose();
    this.surface.material.dispose();
    this.maps.normal.dispose();
    this.maps.color.dispose();
  }
}
