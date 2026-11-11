import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MAP, CLASSES, CAPTURE_RADIUS } from '../shared/world.js';
import { createSurfaceMaterials, makeSky, addDistrictDetails, makeSign, addSectorInstances, mapSector, pairMaterials, clonePairedMaterial } from './visuals.js';
import { prepareViewModel, distanceToCover, drawWorldAndViewModel } from './viewmodel.js';
import { createWeaponRig } from './weapons.js';
import {
  createSoldierRig, cloneSoldierRig, animateSoldier,
  soldierHit, soldierThrow, beginDeath, animateDeath,
} from './soldier.js';

const COLORS = { friendly: 0x5bd9e8, enemy: 0xf0a15d, neutral: 0xc8c5ae };
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

// Preserve Three's lighting equations inside each light's range. Outside it,
// the stock shader produces zero, so it can skip attenuation and shading.
const pointVector = 'vec3 lVector = pointLight.position - geometryPosition;';
const boundedLightParameters = THREE.ShaderChunk.lights_pars_begin.replace(pointVector, `${pointVector}
    if (all(equal(pointLight.color, vec3(0.0))) ||
        (pointLight.distance > 0.0 && dot(lVector, lVector) >= pointLight.distance * pointLight.distance)) {
      light.direction = vec3(0.0);
      light.color = vec3(0.0);
      light.visible = false;
      return;
    }`);
const boundedLightFragment = THREE.ShaderChunk.lights_fragment_begin.replace(
  /(getPointLightInfo\( pointLight, geometryPosition, directLight \);[\s\S]*?)(RE_Direct\( directLight,[^;]+;)/,
  '$1if (directLight.visible) { $2 }',
);

function boundedPointLights(shader) {
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <lights_pars_begin>', boundedLightParameters)
    .replace('#include <lights_fragment_begin>', boundedLightFragment);
}

function optimizeLighting(object) {
  if (object.material?.isMeshStandardMaterial) object.material.onBeforeCompile = boundedPointLights;
}

function detectIntegratedGpu(renderer) {
  try {
    let gl = renderer?.getContext?.();
    if (!gl && typeof document !== 'undefined') {
      const probe = document.createElement('canvas');
      probe.width = probe.height = 1;
      gl = probe.getContext('webgl2', { powerPreference: 'high-performance' })
        || probe.getContext('webgl', { powerPreference: 'high-performance' });
    }
    if (!gl) return false;
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const name = `${(debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) || ''} ${gl.getParameter(gl.RENDERER) || ''} ${gl.getParameter(gl.VENDOR) || ''}`;
    return /\bintel\b(?!.*arc)|uhd|hd\s*graphics|hd\s*\d{3,4}|iris|llvmpipe|swiftshader|mesa|mali|adreno|radeon\(tm\)\s*graphics|vega/i.test(name);
  } catch {
    return false;
  }
}

function seeded(seed = 90210) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
}

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function material(color, roughness = 0.85, metalness = 0.05, extra = {}) {
  const highMat = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  highMat.onBeforeCompile = boundedPointLights;
  const lowMat = new THREE.MeshLambertMaterial({ color, ...extra });
  return pairMaterials(highMat, lowMat);
}

export class GameRenderer {
  constructor(canvas, { onError } = {}) {
    this.canvas = canvas;
    this.clock = 0;
    this.frameCount = 0;
    this.smoothDt = 0.0166;
    this.adaptiveScale = 1;
    this.scaleCooldown = 0;
    this.soldiers = new Map();
    this.soldierTemplates = new Map();
    this.activeSoldiers = new Set();
    this.flags = new Map();
    this.grenadeMeshes = new Map();
    this.activeGrenades = new Set();
    this.effects = [];
    this.effectPools = { tracer: [], shell: [], smoke: [], spark: [] };
    this.seenEvents = new Set();
    this.lastShot = -1;
    this.kick = 0;
    this.aimAmount = 0;
    this.reloadAmount = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.lastYaw = 0;
    this.lastPitch = 0;
    this.handlingCycle = 0;
    this.handlingMove = 0;
    this.sprintBlend = 0;
    this.strafeBlend = 0;
    this.landDip = 0;
    this.previousGrounded = true;
    this.cameraAnchor = new THREE.Vector3();
    this.cameraPlayerId = null;
    this.cameraAlive = null;
    this.scratchPosition = new THREE.Vector3();
    this.viewFrustum = new THREE.Frustum();
    this.viewProjection = new THREE.Matrix4();
    this.soldierBounds = new THREE.Sphere(new THREE.Vector3(), 2.5);
    this.flagBounds = new THREE.Sphere(new THREE.Vector3(), 4.5);
    this.surfaceCache = new Map();
    this.soldierMaterials = new Map();
    this.random = seeded();
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        stencil: false,
        powerPreference: 'high-performance',
        alpha: false,
      });
    } catch (error) {
      onError?.(error);
      throw error;
    }
    this.integratedGpu = detectIntegratedGpu(this.renderer);
    this.grenadeMaterial = material(0x485545, 0.7, 0.4, { emissive: 0xa96220, emissiveIntensity: 0.2 });
    this.updatePixelRatio();
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = this.integratedGpu ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9aa7a7);
    this.scene.fog = new THREE.FogExp2(0x9aa7a7, 0.0034);
    this.camera = new THREE.PerspectiveCamera(85, 1, 0.045, 950);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.hemiLight = new THREE.HemisphereLight(0xc3d9e9, 0x777060, 2.0);
    this.ambientLight = new THREE.AmbientLight(0x8e9eaa, 0.2);
    this.scene.add(this.hemiLight, this.ambientLight);
    this.sun = new THREE.DirectionalLight(0xffd7a4, 3.5);
    this.sun.position.set(-90, 75, 65);
    this.sun.castShadow = true;
    this.sun.shadow.autoUpdate = false;
    const shadowMapSize = this.integratedGpu ? 1024 : 2048;
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    Object.assign(this.sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 220 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.needsUpdate = true;
    this.renderer.shadowMap.needsUpdate = true;
    this.scene.add(this.sun, this.sun.target);
    this.geo = {
      box: new THREE.BoxGeometry(1, 1, 1),
      cylinder: new THREE.CylinderGeometry(1, 1, 1, 10),
      sphere: new THREE.SphereGeometry(1, 10, 8),
      rounded: new RoundedBoxGeometry(1, 1, 1, 1, 0.12),
      shell: new THREE.CylinderGeometry(.009, .009, .043, 6),
    };
    this.surfaces = createSurfaceMaterials(this.renderer, { useBump: true });
    this.atmosphere = makeSky(this.scene, this.renderer);
    this.materials = {
      concrete: this.surfaces.concrete, darkConcrete: material(0x414948), edge: material(0x929087),
      asphalt: this.surfaces.asphalt, steel: material(0x323c3e, 0.55, 0.65), rust: material(0x735344, 0.8, 0.4),
      roof: material(0x4e5655), window: material(0x23363e, 0.25, 0.4), marking: material(0xb5b1a0),
      sand: material(0x8d8067), foliage: material(0x4c5b4c), pole: material(0x788185, 0.4, 0.75),
      stripe: material(0x9b8a55), skyline: material(0x697476), crane: material(0x776f57, 0.8, 0.4),
      glow: new THREE.MeshBasicMaterial({ color: 0xffd8a1 }),
    };
    this.buildWorld();
    this.mergeStaticWorld();
    this.worldRoot = new THREE.Group();
    for (const object of [...this.scene.children]) {
      if (!object.isLight && object !== this.camera && object !== this.sun.target) this.worldRoot.add(object);
    }
    this.scene.add(this.worldRoot);
    this.scene.updateMatrixWorld(true);
    this.scene.matrixAutoUpdate = false;
    this.worldRoot.traverse(object => {
      if (object !== this.atmosphere.sky) {
        object.matrixAutoUpdate = false;
        object.matrixWorldAutoUpdate = false;
      }
    });
    this.buildWeapon();
    this.scene.traverse(object => { if (object.isLight) object.layers.enable(1); });
    // Keep the light count constant (1 blast light) so shader programs stay cached and fast.
    this.blastLights = Array.from({ length: 1 }, () => {
      const mesh = new THREE.PointLight(0xffaa55, 0, 15, 2);
      this.scene.add(mesh);
      return { mesh, age: 0, life: 0.22, type: 'light' };
    });
    this.wallStow = 0;
    this.smokeTexture = canvasTexture(64, (ctx, size) => {
      const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      gradient.addColorStop(0, 'rgba(255,255,255,.65)'); gradient.addColorStop(0.4, 'rgba(255,255,255,.45)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, size, size);
      ctx.globalCompositeOperation = 'source-atop';
      for (let i = 0; i < 25; i++) {
        const x = this.random() * size, y = this.random() * size, r = 4 + this.random() * 12;
        const cloud = ctx.createRadialGradient(x, y, 0, x, y, r); cloud.addColorStop(0, 'rgba(120,120,120,.22)'); cloud.addColorStop(1, 'rgba(120,120,120,0)'); ctx.fillStyle = cloud; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
    });
    this.shellMaterial = material(0xb9954c, .32, .82);
    this.sparkMaterial = new THREE.MeshBasicMaterial({ color: 0xffc475 });
    this.scene.traverse(optimizeLighting);
    this.warmup();
    this.resize();
  }

  // Pre-build all soldier rigs, effect pools and compile shaders upfront so
  // spawning bots, shooting or throwing grenades never stalls a frame.
  warmup() {
    for (const team of [0, 1]) {
      for (const classId of Object.keys(CLASSES)) {
        const key = `${team}:${classId}`;
        if (!this.soldierTemplates.has(key)) {
          const template = createSoldierRig(this, { id: key, team, classId, x: 0, y: 0, z: 0, shotSeq: 0 });
          if (!this.integratedGpu) template.group.traverse(optimizeLighting);
          this.soldierTemplates.set(key, template);
        }
      }
    }
    for (let i = 0; i < 16; i++) this.effectPools.tracer.push(this.createTracerEffect());
    for (let i = 0; i < 12; i++) this.effectPools.shell.push({ mesh: new THREE.Mesh(this.geo.shell, this.shellMaterial), type: 'shell' });
    for (let i = 0; i < 36; i++) this.effectPools.smoke.push({
      mesh: new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTexture, transparent: true, depthWrite: false })),
      type: 'smoke',
    });
    for (let i = 0; i < 32; i++) this.effectPools.spark.push({ mesh: new THREE.Mesh(this.geo.sphere, this.sparkMaterial), type: 'spark' });

    const sampleSoldier = this.soldierTemplates.get('0:assault')?.group;
    const sampleTracer = this.effectPools.tracer[0]?.mesh;
    const sampleSmoke = this.effectPools.smoke[0]?.mesh;
    const sampleSpark = this.effectPools.spark[0]?.mesh;
    const sampleShell = this.effectPools.shell[0]?.mesh;
    const temp = [sampleSoldier, sampleTracer, sampleSmoke, sampleSpark, sampleShell].filter(Boolean);
    for (const node of temp) this.worldRoot.add(node);
    try {
      this.renderer.compile(this.scene, this.camera);
    } catch {
      // Ignore compile errors in headless/stub environments.
    }
    for (const node of temp) node.removeFromParent();
  }

  createTracerEffect() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.boundingSphere = new THREE.Sphere();
    const mesh = new THREE.Line(geometry, new THREE.LineBasicMaterial({
      color: 0xffca79, transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    return { mesh, type: 'tracer', origin: new THREE.Vector3(), direction: new THREE.Vector3() };
  }

  box(parent, x, y, z, w, h, d, mat, shadow = true) {
    let geometry = this.geo.box;
    if (mat.map && mat.userData.tileSize) {
      geometry = geometry.clone();
      const tile = mat.userData.tileSize, uv = geometry.attributes.uv, position = geometry.attributes.position, normal = geometry.attributes.normal;
      for (let i = 0; i < uv.count; i++) {
        const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i));
        const u = nx > 0.5 ? (position.getZ(i) + .5) * d : (position.getX(i) + .5) * w;
        const v = ny > 0.5 ? (position.getZ(i) + .5) * d : (position.getY(i) + .5) * h;
        uv.setXY(i, u / tile, v / tile);
      }
      geometry.userData.owned = true;
    }
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
    mesh.castShadow = shadow; mesh.receiveShadow = shadow;
    parent.add(mesh); return mesh;
  }

  cylinder(parent, x, y, z, radius, height, mat, segments = 10) {
    const mesh = new THREE.Mesh(segments === 10 ? this.geo.cylinder : new THREE.CylinderGeometry(1, 1, 1, segments), mat);
    mesh.position.set(x, y, z); mesh.scale.set(radius, height, radius); mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }

  rounded(parent, x, y, z, w, h, d, mat) {
    const mesh = new THREE.Mesh(this.geo.rounded, mat);
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }

  batchActor(group) {
    // Preserve articulated joints while combining the rigid pieces at each joint.
    for (const child of [...group.children]) if (child.isGroup) this.batchActor(child);
    const byMaterial = new Map();
    for (const child of group.children) if (child.isMesh && !child.userData.animated) {
      const key = child.material.uuid;
      if (!byMaterial.has(key)) byMaterial.set(key, []); byMaterial.get(key).push(child);
    }
    for (const meshes of byMaterial.values()) {
      if (meshes.length < 2) continue;
      const geometries = meshes.map(mesh => {
        mesh.updateMatrix(); let geometry = mesh.geometry.clone().applyMatrix4(mesh.matrix);
        if (geometry.index) { const expanded = geometry.toNonIndexed(); geometry.dispose(); geometry = expanded; }
        return geometry;
      });
      const geometry = mergeGeometries(geometries, false); geometries.forEach(g => g.dispose());
      if (!geometry) continue;
      geometry.userData.actorOwned = true;
      const combined = new THREE.Mesh(geometry, meshes[0].material); combined.castShadow = true; combined.receiveShadow = true;
      for (const mesh of meshes) { mesh.removeFromParent(); if (mesh.geometry.userData.owned) mesh.geometry.dispose(); }
      group.add(combined);
    }
  }

  buildWorld() {
    const random = this.random;
    const size = MAP.size || 200;
    const groundGeometry = new THREE.PlaneGeometry(size + 250, size + 250);
    const guv = groundGeometry.attributes.uv;
    for (let i = 0; i < guv.count; i++) guv.setXY(i, guv.getX(i) * (size + 250) / 9, guv.getY(i) * (size + 250) / 9);
    const ground = new THREE.Mesh(groundGeometry, this.surfaces.ground);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.scene.add(ground);
    // Painted service roads are flat: no invisible curb collision.
    const crossStreets = size > 250 ? [-110, -40, 0, 40, 110] : [0];
    // End the avenue at each crossing instead of stacking asphalt surfaces.
    const roadEdge = size / 2 + 5;
    const road = (x, z, w, d) => this.box(this.scene, x, .048, z, w, .024, d, this.materials.asphalt, false);
    let avenueStart = -roadEdge;
    for (const z of crossStreets) {
      const avenueEnd = z - 7.5;
      road(0, (avenueStart + avenueEnd) / 2, 24, avenueEnd - avenueStart);
      road(0, z, size + 10, 15);
      avenueStart = z + 7.5;
    }
    road(0, (avenueStart + roadEdge) / 2, 24, roadEdge - avenueStart);
    for (let i = -size / 2 + 8; i < size / 2; i += 10) {
      if (crossStreets.every(z => Math.abs(i - z) > 9)) {
        this.box(this.scene, 0, 0.068, i, 0.13, 0.009, 4.8, this.materials.marking, false);
      }
      for (const z of crossStreets) if (Math.abs(i) > 15) this.box(this.scene, i, 0.068, z, 4.8, 0.009, 0.13, this.materials.marking, false);
    }
    const windowMatrices = [], litMatrices = [], frameMatrices = [];
    const dummy = new THREE.Object3D();
    for (const b of MAP.boxes || []) {
      const h = b.h ?? 3, w = b.w ?? 4, d = b.d ?? 4;
      const building = h > 5 && !['wall', 'pillar'].includes(b.kind);
      const container = String(b.kind || '').includes('container');
      const surface = b.kind === 'crate' ? this.surfaces.wood : container || b.kind === 'warehouse' ? this.surfaces.metal : b.kind === 'factory' || b.kind === 'wall' ? this.surfaces.brick : this.surfaces.concrete;
      const color = b.color || '#969b92', cacheKey = `${surface.uuid}:${color}`;
      if (!this.surfaceCache.has(cacheKey)) { this.surfaceCache.set(cacheKey, clonePairedMaterial(surface, color)); }
      const mat = b.kind === 'pillar' ? this.materials.steel : this.surfaceCache.get(cacheKey);
      this.box(this.scene, b.x, h / 2, b.z, w, h, d, mat);
      if (b.kind === 'wall') {
        this.box(this.scene, b.x, h + 0.05, b.z, w + .08, .16, d + .08, this.materials.edge);
      } else if (b.kind === 'pillar') {
        this.box(this.scene, b.x, .12, b.z, w + .25, .24, d + .25, this.materials.rust);
      } else if (building) {
        this.box(this.scene, b.x, h + 0.13, b.z, w + 0.3, 0.26, d + 0.3, this.materials.edge);
        this.box(this.scene, b.x, 0.45, b.z, w + 0.12, 0.9, d + 0.12, this.materials.darkConcrete);
        if (b.kind === 'warehouse') {
          const rise = Math.min(2.6, w * .1), half = w / 2, slope = Math.atan2(rise, half);
          for (const side of [-1, 1]) { const roof = this.box(this.scene, b.x + side * w / 4, h + rise / 2 + .12, b.z, Math.hypot(half, rise) + .3, .14, d + .6, this.surfaces.metal); roof.rotation.z = -side * slope; }
        } else if (b.kind === 'factory') {
          this.cylinder(this.scene, b.x + w * .28, h + 4, b.z - d * .25, .48, 8, this.surfaces.brick, 14);
          this.cylinder(this.scene, b.x + w * .28, h + 8.05, b.z - d * .25, .58, .25, this.materials.steel, 14);
          const tank = this.cylinder(this.scene, b.x - w * .22, h + 1.8, b.z + d * .2, 1.2, 3.3, this.materials.edge, 16);
          this.cylinder(this.scene, tank.position.x, h + 3.5, tank.position.z, 1.28, .16, this.materials.steel, 16);
        }
        for (let y = 2.8; y < h - 0.9; y += 3.1) {
          for (const face of [-1, 1]) {
            for (let x = -w / 2 + 1.5; x < w / 2 - 0.7; x += 2.7) {
              dummy.position.set(b.x + x, y, b.z + face * (d / 2 + 0.063)); dummy.rotation.set(0, 0, 0); dummy.scale.set(1.3, 1.55, 0.028); dummy.updateMatrix();
              (random() > 0.88 ? litMatrices : windowMatrices).push(dummy.matrix.clone());
              dummy.position.z = b.z + face * (d / 2 + .025); dummy.scale.set(1.5, 1.75, .042); dummy.updateMatrix(); frameMatrices.push(dummy.matrix.clone());
            }
            for (let z = -d / 2 + 1.5; z < d / 2 - 0.7; z += 2.7) {
              dummy.position.set(b.x + face * (w / 2 + 0.063), y, b.z + z); dummy.rotation.set(0, 0, 0); dummy.scale.set(0.028, 1.55, 1.3); dummy.updateMatrix();
              (random() > 0.9 ? litMatrices : windowMatrices).push(dummy.matrix.clone());
              dummy.position.x = b.x + face * (w / 2 + .025); dummy.scale.set(.042, 1.75, 1.5); dummy.updateMatrix(); frameMatrices.push(dummy.matrix.clone());
            }
          }
        }
        const vents = Math.min(3, Math.floor(w * d / 70));
        for (let i = 0; i < vents; i++) {
          const vx = b.x + (random() - 0.5) * w * 0.55, vz = b.z + (random() - 0.5) * d * 0.55;
          this.box(this.scene, vx, h + 0.7, vz, 1.7, 1.1, 1.5, this.materials.steel);
          this.cylinder(this.scene, vx + 0.3, h + 1.7, vz, 0.19, 1.2, this.materials.rust);
        }
        // Drainpipes and a concrete loading-door trim add depth at street level.
        this.cylinder(this.scene, b.x + w / 2 - 0.2, h / 2, b.z - d / 2 - 0.12, 0.075, h, this.materials.rust);
        // Facade pilasters, weathered service signage and a shallow loading canopy.
        for (let fx = -w / 2 + 1; fx < w / 2; fx += 7) this.box(this.scene, b.x + fx, h / 2, b.z + d / 2 + .07, .18, h, .2, this.materials.edge);
        for (let y = 3.9; y < h - 1; y += 3.1) this.box(this.scene, b.x, y, b.z + d / 2 + .05, w, .09, .12, this.materials.edge);
        if (w > 12) {
          const sign = makeSign(b.kind === 'factory' ? 'SECTOR' : 'DEPOT', `${String(b.id || '').replace('obj-', '').padStart(2, '0')}  /  RESTRICTED`, Math.min(4.5, w * .22), this.integratedGpu);
          sign.position.set(b.x, Math.min(h - 1.5, 6), b.z + d / 2 + .16); this.scene.add(sign);
          this.box(this.scene, b.x, 3.45, b.z + d / 2 + .6, 5.5, .12, 1.25, this.materials.steel);
        }
        if (w > 8) {
          this.box(this.scene, b.x, 1.45, b.z + d / 2 + 0.035, Math.min(4.1, w * 0.4), 2.9, 0.06, this.materials.steel);
          for (let y = 0.3; y < 2.8; y += 0.27) this.box(this.scene, b.x, y, b.z + d / 2 + 0.075, Math.min(4.1, w * 0.4), 0.035, 0.03, this.materials.edge, false);
        }
      } else if (container) {
        for (let x = -w / 2 + 0.25; x < w / 2; x += 0.6) {
          for (const side of [-1, 1]) this.box(this.scene, b.x + x, h / 2, b.z + side * (d / 2 + 0.02), 0.065, h * 0.92, 0.05, mat, false);
        }
        this.box(this.scene, b.x, h + 0.025, b.z, w + 0.05, 0.05, d + 0.05, this.materials.steel, false);
        for (const side of [-1, 1]) {
          if (w > d) this.cylinder(this.scene, b.x + w / 2 + .035, h / 2, b.z + side * d * .22, .035, h * .88, this.materials.pole);
          else this.cylinder(this.scene, b.x + side * w * .22, h / 2, b.z + d / 2 + .035, .035, h * .88, this.materials.pole);
        }
      } else if (b.kind === 'crate') {
        for (const side of [-1, 1]) {
          this.box(this.scene, b.x + side * w * .33, h / 2, b.z, .09, h + .025, d + .035, this.materials.steel);
          this.box(this.scene, b.x, h * .2, b.z + side * (d / 2 + .013), w + .03, .12, .045, this.materials.rust);
        }
      } else {
        this.box(this.scene, b.x, h - 0.035, b.z, w + 0.08, 0.16, d + 0.08, this.materials.edge);
        if (h < 2) {
          this.box(this.scene, b.x, h * 0.65, b.z + d / 2 + 0.015, w * 0.85, Math.min(0.14, h * 0.15), 0.02, this.materials.stripe, false);
        }
      }
    }
    const litWindowMat = material(0xb5a27c, 0.6, 0.2, { emissive: 0x7c633c, emissiveIntensity: 0.45 }, this.integratedGpu);
    for (const [matrices, mat] of [[frameMatrices, this.materials.edge], [windowMatrices, this.materials.window], [litMatrices, litWindowMat]]) {
      addSectorInstances(this.scene, this.geo.box, mat, matrices);
    }
    // The non-playable port skyline encloses the battlefield.
    const limit = size / 2;
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2;
      const x = Math.sin(angle) * (limit + 35 + random() * 30), z = Math.cos(angle) * (limit + 35 + random() * 30);
      const height = 12 + random() * 28;
      this.box(this.scene, x, height / 2 - 0.3, z, 12 + random() * 15, height, 10 + random() * 20, this.materials.skyline, false);
    }
    for (let i = 0; i < 3; i++) this.crane(-limit - 20 + i * 45, -limit - 28, i * 0.5);
    for (const point of MAP.points || []) this.makeFlag(point);
    addDistrictDetails(this, MAP);
    // Boundary fence posts and wire are outside playable ground.
    const fenceMat = material(0x697674, 0.7, 0.45, {}, this.integratedGpu);
    for (let i = -limit; i <= limit; i += 10) {
      for (const side of [-1, 1]) {
        this.cylinder(this.scene, i, 1.7, side * (limit + 1), 0.055, 3.4, fenceMat);
        this.cylinder(this.scene, side * (limit + 1), 1.7, i, 0.055, 3.4, fenceMat);
      }
    }
    for (const side of [-1, 1]) for (const y of [0.7, 1.7, 2.7]) {
      this.box(this.scene, 0, y, side * (limit + 1), size, 0.025, 0.025, fenceMat, false);
      this.box(this.scene, side * (limit + 1), y, 0, 0.025, 0.025, size, fenceMat, false);
    }
  }

  crane(x, z, angle) {
    const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = angle; this.scene.add(group);
    const mat = this.materials.crane;
    for (const side of [-1, 1]) this.box(group, side * 3, 13, 0, 0.6, 26, 0.6, mat, false);
    for (let y = 3; y < 26; y += 4) {
      const bar = this.box(group, 0, y, 0, 6.5, 0.35, 0.5, mat, false); bar.rotation.z = (y % 8 < 4 ? -1 : 1) * 0.45;
    }
    this.box(group, 8, 26, 0, 30, 0.9, 1.3, mat, false);
    this.box(group, -6, 24.8, 0, 3, 2.5, 3, this.materials.darkConcrete, false);
    this.box(group, 18, 18, 0, 0.06, 15, 0.06, this.materials.steel, false);
    this.box(group, 18, 10.5, 0, 0.6, 0.3, 0.6, this.materials.steel, false);
  }

  mergeStaticWorld() {
    // Batch immutable map details by material, keeping animated flags separate.
    this.scene.updateMatrixWorld(true);
    const dynamic = new Set([...this.flags.values()].map(f => f.group));
    const batches = new Map();
    this.scene.traverse(object => {
      if (!object.isMesh || object.isInstancedMesh || object.userData.noBatch || Array.isArray(object.material)) return;
      for (let node = object; node; node = node.parent) if (dynamic.has(node) || node === this.camera) return;
      const sector = object.material.transparent ? 'transparent' : mapSector(object.matrixWorld);
      const key = `${object.material.uuid}:${object.castShadow}:${object.receiveShadow}:${!!object.geometry.index}:${sector}`;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(object);
    });
    for (const meshes of batches.values()) {
      if (meshes.length < 2) continue;
      const sources = meshes.map(mesh => mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
      const geometry = mergeGeometries(sources, false);
      sources.forEach(source => source.dispose());
      if (!geometry) continue;
      geometry.computeBoundingSphere();
      const combined = new THREE.Mesh(geometry, meshes[0].material);
      combined.castShadow = meshes[0].castShadow; combined.receiveShadow = meshes[0].receiveShadow;
      meshes.forEach(mesh => { mesh.removeFromParent(); if (mesh.geometry.userData.owned) mesh.geometry.dispose(); }); this.scene.add(combined);
    }
  }

  makeFlag(point) {
    const group = new THREE.Group(); group.position.set(point.x, 0, point.z); this.scene.add(group);
    this.cylinder(group, 0, 2.4, 0, 0.045, 4.8, this.materials.pole);
    const flagMaterial = pairMaterials(
      new THREE.MeshStandardMaterial({ color: COLORS.neutral, side: THREE.DoubleSide, roughness: 0.95 }),
      new THREE.MeshLambertMaterial({ color: COLORS.neutral, side: THREE.DoubleSide }),
    );
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 0.85, 8, 1), flagMaterial);
    flag.position.set(0.8, 4.05, 0); group.add(flag);
    const ring = new THREE.Mesh(new THREE.RingGeometry(CAPTURE_RADIUS - 0.13, CAPTURE_RADIUS, 36), new THREE.MeshBasicMaterial({ color: COLORS.neutral, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.045; group.add(ring);
    const texture = canvasTexture(128, (ctx) => {
      ctx.fillStyle = 'rgba(12,23,28,.82)'; ctx.beginPath(); ctx.moveTo(64, 4); ctx.lineTo(118, 64); ctx.lineTo(64, 124); ctx.lineTo(10, 64); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#d7e1df'; ctx.lineWidth = 3; ctx.stroke();
      ctx.font = 'bold 68px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f3f4e9'; ctx.fillText(String(point.id), 64, 66);
    });
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true }));
    label.position.set(0, 6.2, 0); label.scale.set(1.75, 1.75, 1.75); group.add(label);
    this.flags.set(point.id, { group, flag, ring, label });
  }

  buildWeapon() {
    this.weaponRig = createWeaponRig(this);
    this.weapon = this.weaponRig.weapon;
    this.camera.add(this.weapon);
    prepareViewModel(this.weapon);
  }

  makeSoldier(player) {
    const key = `${player.team}:${player.classId}`;
    let template = this.soldierTemplates.get(key);
    if (!template) {
      template = createSoldierRig(this, player);
      if (!this.integratedGpu) template.group.traverse(optimizeLighting);
      this.soldierTemplates.set(key, template);
    }
    const rig = cloneSoldierRig(template, player);
    rig.stepIndex = this.soldiers.size;
    return rig;
  }

  removeSoldier(soldier) {
    soldier.group.removeFromParent();
    soldier.flash.material.dispose();
    soldier.marker.material.dispose();
  }

  updateSoldiers(state, localId, dt) {
    const active = this.activeSoldiers;
    active.clear();
    const local = state.players.find(p => p.id === localId), localTeam = local?.team ?? 0;
    const blend = 1 - Math.exp(-dt * 18);
    let shadowFrustum = null;
    if (this.renderer.shadowMap.enabled) {
      this.sun.updateMatrixWorld();
      this.sun.target.updateMatrixWorld();
      this.sun.shadow.updateMatrices(this.sun);
      shadowFrustum = this.sun.shadow.getFrustum();
    }
    const distantLimit = this.lowQuality ? 55 : (this.integratedGpu ? 70 : 95);
    const distantLimitSq = distantLimit * distantLimit;
    for (const player of state.players) {
      if (player.id === localId) continue;
      active.add(player.id);
      let soldier = this.soldiers.get(player.id);
      if (soldier && (soldier.classId !== player.classId || soldier.team !== player.team)) {
        this.removeSoldier(soldier);
        soldier = null;
      }
      if (!soldier) {
        soldier = this.makeSoldier(player);
        this.soldiers.set(player.id, soldier);
      }
      const { group } = soldier;
      const externalScene = Boolean(group.parent && group.parent !== this.worldRoot);
      const alive = player.alive !== false;
      const target = this.scratchPosition.set(player.x, player.y || 0, player.z);
      const reset = !soldier.initialized || group.position.distanceToSquared(target) > 25;
      if (alive) {
        if (!soldier.alive) {
          group.rotation.x = 0;
          group.rotation.z = 0;
          soldier.death = null;
          soldier.deathAge = 0;
        }
        const interpolation = reset || !soldier.alive ? 1 : blend;
        group.position.lerp(target, interpolation);
        const yawDifference = (player.yaw || 0) - group.rotation.y;
        group.rotation.y += Math.atan2(Math.sin(yawDifference), Math.cos(yawDifference)) * interpolation;
      } else {
        if (!soldier.initialized) group.position.copy(target);
        if (soldier.alive) {
          soldier.deathAge = 0;
          beginDeath(soldier, target.y);
        }
        soldier.deathAge += dt;
      }
      const respawned = alive && !soldier.alive;
      soldier.alive = alive;
      soldier.initialized = true;
      this.soldierBounds.center.copy(group.position);
      this.soldierBounds.center.y += .9;
      const visible = externalScene || ((alive || soldier.deathAge < 3.6) &&
        (this.viewFrustum.intersectsSphere(this.soldierBounds) || shadowFrustum?.intersectsSphere(this.soldierBounds)));
      if (!visible) {
        if (!externalScene) group.removeFromParent();
        continue;
      }
      const returning = !group.parent;
      if (returning) this.worldRoot.add(group);
      group.visible = true;
      if (!alive) {
        if (soldier.body) soldier.body.visible = true;
        soldier.pose.visible = true;
        soldier.distant.visible = false;
        animateDeath(soldier, { age: soldier.deathAge });
        continue;
      }
      const crouched = player.crouching || player.crouch;
      const distSq = local ? (player.x - local.x) ** 2 + (player.z - local.z) ** 2 : 0;
      const distant = !externalScene && local && distSq > distantLimitSq;
      if (soldier.body) {
        soldier.body.visible = !distant;
        soldier.body.castShadow = !this.lowQuality && distSq < 48 * 48;
      }
      if (!distant) {
        const mustReset = reset || respawned || returning || soldier.distant.visible;
        const halfRate = this.lowQuality && !externalScene && distSq > 26 * 26 && !mustReset;
        if (!halfRate || ((this.frameCount + (soldier.stepIndex || 0)) & 1) === 0) {
          animateSoldier(soldier, { dt: halfRate ? dt * 2 : dt, player, reset: mustReset });
        }
      } else soldier.flash.visible = false;
      soldier.pose.visible = !distant;
      soldier.distant.visible = !!distant;
      soldier.marker.material.color.setHex(player.team === localTeam ? COLORS.friendly : COLORS.enemy);
      soldier.marker.visible = player.team === localTeam;
      soldier.marker.position.y = (crouched ? 1.55 : 1.94) + Math.sin(this.clock * 2) * .025;
    }
    for (const [id, soldier] of this.soldiers) if (!active.has(id)) { this.removeSoldier(soldier); this.soldiers.delete(id); }
  }

  processEvents(state, localId) {
    for (const event of state.events || []) {
      const key = event.id ?? `${event.type}:${event.playerId}:${event.time}:${event.x}:${event.z}`;
      if (this.seenEvents.has(key)) continue;
      this.seenEvents.add(key);
      if (event.type === 'damage' && event.playerId !== localId) {
        soldierHit(this.soldiers.get(event.playerId), event.x ?? 0, event.z ?? 0);
        continue;
      }
      if (event.type === 'grenade' && event.playerId !== localId) {
        soldierThrow(this.soldiers.get(event.playerId));
        continue;
      }
      if (event.type === 'shot') {
        const player = state.players.find(p => p.id === event.playerId);
        const x = event.x ?? player?.x ?? 0, y = event.y ?? ((player?.y || 0) + 1.35), z = event.z ?? player?.z ?? 0;
        const tx = event.tx ?? x - Math.sin(player?.yaw || 0) * 60;
        const ty = event.ty ?? y + Math.sin(player?.pitch || 0) * 60;
        const tz = event.tz ?? z - Math.cos(player?.yaw || 0) * 60;
        const length = Math.hypot(tx - x, ty - y, tz - z);
        const own = event.playerId === localId;
        if (!own && state.time - event.time > .27) continue;
        const distance = Math.min(
          this.camera.position.distanceToSquared(this.scratchPosition.set(x, y, z)),
          this.camera.position.distanceToSquared(this.scratchPosition.set(tx, ty, tz)),
        );
        if (distance > 165 ** 2 || this.effects.length >= 120) continue;
        if (length > 7 && (event.shotSeq ?? event.id) % 3 === 0) {
          this.tracer(x, y, z, tx, ty, tz, length);
        }
        if (own && this.weapon.visible) {
          const yaw = player?.yaw || 0;
          const effect = this.effectPools.shell.pop() ?? { mesh: new THREE.Mesh(this.geo.shell, this.shellMaterial), type: 'shell' };
          const shell = effect.mesh;
          this.weaponRig.bolt.getWorldPosition(shell.position);
          shell.rotation.set(0, 0, Math.PI / 2);
          this.worldRoot.add(shell);
          Object.assign(effect, { age: 0, life: 1.1, vx: Math.cos(yaw) * 2.9, vy: .85 + this.random() * .7, vz: -Math.sin(yaw) * 2.9, spin: 8 + this.random() * 8 });
          this.effects.push(effect);
          if (!this.lowQuality && !this.integratedGpu && this.wallStow < .3 && (event.shotSeq ?? event.id) % 2 === 0) {
            const muzzle = this.weaponRig.muzzleFlash.getWorldPosition(this.scratchPosition);
            this.smoke(muzzle.x, muzzle.y, muzzle.z, .13, .42, 0xa4a79b);
          }
        }
        const range = CLASSES[player?.classId]?.range || 200;
        const impact = event.impact === undefined && length < range - 1 ? (event.hit ? 'flesh' : 'concrete') : event.impact;
        if (impact === 'metal') {
          for (let i = 0; i < (this.lowQuality || this.integratedGpu ? 1 : 4); i++) this.spark(tx, ty, tz);
          this.smoke(tx, ty, tz, .18, .32, 0x92968e);
        } else if (impact) {
          const colors = { wood: 0xb59b75, concrete: 0xb9b2a0, ground: 0x9a8666, flesh: 0x827065, shield: 0x8bc5ca };
          this.smoke(tx, ty, tz, impact === 'flesh' ? .14 : .28, impact === 'shield' ? .25 : .57, colors[impact] ?? colors.concrete);
        }
      }
      if (event.type === 'explosion') {
        const x = event.x || 0, y = event.y ?? 0.6, z = event.z || 0;
        const count = this.lowQuality || this.integratedGpu ? 8 : 13;
        for (let i = 0; i < count; i++) this.smoke(x + (this.random() - 0.5) * 2, y + this.random() * 2, z + (this.random() - 0.5) * 2, 1.1 + this.random() * 1.4, 2.5 + this.random() * 2, i < 3 ? 0xffb668 : 0x535953);
        this.blastFlash(x, y + 1, z);
        for (let i = 0; i < (this.lowQuality || this.integratedGpu ? 6 : 14); i++) this.spark(x, y + .3, z, 3);
      }
    }
    while (this.seenEvents.size > 900) {
      this.seenEvents.delete(this.seenEvents.keys().next().value);
    }
  }

  blastFlash(x, y, z) {
    if (this.lowQuality || !this.blastLights.length) return;
    const light = this.blastLights.find(effect => effect.mesh.intensity === 0);
    if (light) this.effects.push(light);
    const effect = light ?? this.blastLights[0];
    effect.age = 0;
    effect.mesh.position.set(x, y, z);
    effect.mesh.intensity = 18;
  }

  tracer(x, y, z, tx, ty, tz, length) {
    const effect = this.effectPools.tracer.pop() ?? this.createTracerEffect();
    effect.age = 0;
    effect.life = clamp(length / 950, .048, .19);
    effect.length = length;
    effect.origin.set(x, y, z);
    effect.direction.set(tx - x, ty - y, tz - z).multiplyScalar(1 / length);
    const bounds = effect.mesh.geometry.boundingSphere;
    bounds.center.copy(effect.origin).addScaledVector(effect.direction, length / 2);
    bounds.radius = length / 2 + .05;
    this.worldRoot.add(effect.mesh);
    this.effects.push(effect);
  }

  smoke(x, y, z, size, life, color) {
    if (this.effects.length > 140) return;
    const effect = this.effectPools.smoke.pop() ?? {
      mesh: new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTexture, transparent: true, depthWrite: false })),
      type: 'smoke',
    };
    const sprite = effect.mesh;
    sprite.material.color.setHex(color);
    sprite.material.rotation = this.random() * Math.PI;
    sprite.position.set(x, y, z); sprite.scale.setScalar(size); this.worldRoot.add(sprite);
    Object.assign(effect, { age: 0, life, size, vx: (this.random() - 0.5) * 0.6, vz: (this.random() - 0.5) * 0.6 });
    this.effects.push(effect);
  }

  spark(x, y, z, force = 1) {
    if (this.effects.length > 140) return;
    const effect = this.effectPools.spark.pop() ?? { mesh: new THREE.Mesh(this.geo.sphere, this.sparkMaterial), type: 'spark' };
    const { mesh } = effect;
    mesh.rotation.set(0, 0, 0);
    mesh.scale.setScalar(.014 * force); mesh.position.set(x, y, z); this.worldRoot.add(mesh);
    Object.assign(effect, { age: 0, life: .2 + this.random() * .2, vx: (this.random() - .5) * 4 * force, vy: (1 + this.random() * 2) * force, vz: (this.random() - .5) * 4 * force });
    this.effects.push(effect);
  }

  updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i]; effect.age += dt;
      if (effect.age >= effect.life) {
        if (effect.type === 'light') effect.mesh.intensity = 0;
        else {
          effect.mesh.removeFromParent();
          this.effectPools[effect.type].push(effect);
        }
        const last = this.effects.length - 1;
        if (i !== last) this.effects[i] = this.effects[last];
        this.effects.pop();
        continue;
      }
      const alpha = 1 - effect.age / effect.life;
      if (effect.type === 'tracer') {
        const head = Math.min(effect.length, 4 + effect.age / effect.life * effect.length);
        const tail = Math.max(.75, head - 11);
        const positions = effect.mesh.geometry.attributes.position;
        const { origin, direction } = effect;
        positions.setXYZ(0, origin.x + direction.x * tail, origin.y + direction.y * tail, origin.z + direction.z * tail);
        positions.setXYZ(1, origin.x + direction.x * head, origin.y + direction.y * head, origin.z + direction.z * head);
        positions.needsUpdate = true;
        effect.mesh.material.opacity = alpha * .8;
      } else if (effect.type === 'smoke') {
        effect.mesh.position.x += effect.vx * dt; effect.mesh.position.z += effect.vz * dt; effect.mesh.position.y += dt * 0.8;
        effect.mesh.scale.setScalar(effect.size * (1 + effect.age * 1.5)); effect.mesh.material.opacity = alpha * 0.55;
      } else if (effect.type === 'spark' || effect.type === 'shell') {
        effect.vy -= dt * 9.8; effect.mesh.position.x += effect.vx * dt; effect.mesh.position.y += effect.vy * dt; effect.mesh.position.z += effect.vz * dt;
        effect.mesh.rotation.x += dt * (effect.spin || 9); effect.mesh.rotation.z += dt * (effect.spin || 6);
        if (effect.mesh.position.y < .03) { effect.mesh.position.y = .03; effect.vy = Math.abs(effect.vy) * .25; effect.vx *= .72; effect.vz *= .72; }
        if (effect.type === 'spark') effect.mesh.scale.setScalar(.025 * alpha);
      } else if (effect.type === 'light') effect.mesh.intensity = alpha * 18;
    }
  }

  updateGrenades(state) {
    const active = this.activeGrenades;
    active.clear();
    this.grenadeMaterial.emissiveIntensity = 0.1 + (Math.sin(this.clock * 12) + 1) * 0.6;
    for (const grenade of state.grenades || []) {
      active.add(grenade.id);
      let mesh = this.grenadeMeshes.get(grenade.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.geo.sphere, this.grenadeMaterial);
        mesh.scale.set(0.11, 0.15, 0.11); mesh.castShadow = !this.lowQuality; this.worldRoot.add(mesh); this.grenadeMeshes.set(grenade.id, mesh);
      }
      mesh.visible = true; mesh.position.set(grenade.x, grenade.y, grenade.z); mesh.rotation.x = this.clock * 4;
    }
    for (const [id, mesh] of this.grenadeMeshes) if (!active.has(id)) { mesh.removeFromParent(); this.grenadeMeshes.delete(id); }
  }

  updatePixelRatio() {
    const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 1.5);
    const ratio = this.lowQuality
      ? clamp((this.integratedGpu ? 0.68 : 0.78) * (this.adaptiveScale || 1), 0.55, 1)
      : dpr;
    if (this.currentPixelRatio !== ratio) {
      this.currentPixelRatio = ratio;
      this.renderer.setPixelRatio(ratio);
      if (this.viewportWidth && this.viewportHeight) {
        this.renderer.setSize(this.viewportWidth, this.viewportHeight, false);
      }
    }
  }

  applyQuality(low) {
    this.lowQuality = low;
    this.adaptiveScale = 1;
    this.renderer.shadowMap.enabled = !low;
    this.sun.castShadow = !low;
    if (!low) {
      this.sun.shadow.needsUpdate = true;
      this.renderer.shadowMap.needsUpdate = true;
    }
    this.scene.environment = low ? null : this.atmosphere.envTexture;
    this.hemiLight.intensity = low ? 2.35 : 2.0;
    this.ambientLight.intensity = low ? 0.38 : 0.2;
    const swap = object => {
      const m = object.material;
      if (!m || Array.isArray(m)) return;
      const next = low ? m._lowMaterial : m._highMaterial;
      if (next && next !== m) object.material = next;
    };
    this.scene.traverse(swap);
    for (const soldier of this.soldiers.values()) if (!soldier.group.parent) soldier.group.traverse(swap);
    for (const template of this.soldierTemplates.values()) template.group.traverse(swap);
    if (this.soldierAtlas) {
      this.soldierAtlas = (low ? this.soldierAtlas._lowMaterial : this.soldierAtlas._highMaterial) || this.soldierAtlas;
    }
    this.updatePixelRatio();
    this.resize();
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
  }

  drawScene(menu = false) {
    this.frameCount++;
    if (menu) {
      if (!this.staticMenuShadows && this.renderer.shadowMap.enabled) {
        this.staticMenuShadows = true;
        this.sun.shadow.needsUpdate = true;
        this.renderer.shadowMap.needsUpdate = true;
      }
    } else {
      this.staticMenuShadows = false;
      if (this.renderer.shadowMap.enabled && (!this.integratedGpu || (this.frameCount & 1) === 0)) {
        this.sun.shadow.needsUpdate = true;
        this.renderer.shadowMap.needsUpdate = true;
      }
    }
    drawWorldAndViewModel(this.renderer, this.scene, this.camera, this.weapon, this.worldRoot);
  }

  render(state, localId, dt, view = {}) {
    const rawDt = dt || 0.016;
    dt = Math.min(rawDt, 0.1); this.clock += dt;
    this.scoped = false;
    const low = view.quality === 'low';
    if (this.lowQuality !== low) {
      this.applyQuality(low);
    }
    if (low && rawDt > 0.004 && rawDt < 0.09) {
      this.smoothDt = lerp(this.smoothDt, rawDt, 0.08);
      if (this.scaleCooldown > 0) this.scaleCooldown -= dt;
      else if (this.smoothDt > 0.021 && this.adaptiveScale > 0.75) {
        this.adaptiveScale = Math.max(0.75, Number((this.adaptiveScale - 0.07).toFixed(2)));
        this.scaleCooldown = 0.85;
        this.updatePixelRatio();
      } else if (this.smoothDt < 0.0167 && this.adaptiveScale < 1) {
        this.adaptiveScale = Math.min(1, Number((this.adaptiveScale + 0.04).toFixed(2)));
        this.scaleCooldown = 1.6;
        this.updatePixelRatio();
      }
    }
    const baseFov = clamp(Number(view.fov) || 85, 65, 105), shake = view.shake !== false;
    this.renderer.toneMappingExposure = 1.06 * clamp(Number(view.brightness) || 1, .6, 1.5);
    if (!state?.players) {
      this.cameraPlayerId = null;
      const angle = this.clock * 0.012, radius = Math.min(MAP.size * .36, 130);
      this.camera.position.set(Math.sin(angle + 0.9) * radius, 58 + Math.sin(this.clock * .025) * 8, Math.cos(angle + 0.9) * radius);
      this.camera.lookAt(0, 3, -12); this.weapon.visible = false;
      this.atmosphere.sky.position.copy(this.camera.position);
      if (this.camera.fov !== 70 || this.camera.near !== 2) {
        this.camera.fov = 70;
        this.camera.near = 2;
        this.camera.updateProjectionMatrix();
      }
      this.sun.position.set(-90, 75, 65); this.sun.target.position.set(0, 0, 0);
      for (const soldier of this.soldiers.values()) soldier.group.visible = false;
      for (const grenade of this.grenadeMeshes.values()) grenade.visible = false;
      this.updateEffects(dt);
      this.drawScene(true); return;
    }
    const player = state.players.find(p => p.id === localId);
    const isAlive = player?.alive !== false;
    if (player && !isAlive) {
      const focusX = view.deployTarget?.x ?? player.x ?? 0;
      const focusZ = view.deployTarget?.z ?? player.z ?? 0;
      const orbit = this.clock * 0.08;
      const desiredX = focusX + Math.sin(orbit) * 32;
      const desiredY = 46;
      const desiredZ = focusZ + Math.cos(orbit) * 32;
      if (this.cameraAlive !== false) {
        this.camera.position.set(player.x, 4, player.z + 6);
      }
      const pan = 1 - Math.exp(-dt * 4.5);
      this.camera.position.x = lerp(this.camera.position.x, desiredX, pan);
      this.camera.position.y = lerp(this.camera.position.y, desiredY, pan);
      this.camera.position.z = lerp(this.camera.position.z, desiredZ, pan);
      this.camera.lookAt(focusX, 1.5, focusZ);
      this.cameraPlayerId = localId;
      this.cameraAlive = false;
      this.weapon.visible = false;
      if (Math.abs(this.camera.fov - 65) > 0.1 || this.camera.near !== 0.5) {
        this.camera.fov = 65;
        this.camera.near = 0.5;
        this.camera.updateProjectionMatrix();
      }
    } else if (player) {
      const yaw = view.yaw ?? player.yaw ?? 0, pitch = view.pitch ?? player.pitch ?? 0;
      const crouching = view.crouch ?? player.crouching ?? player.crouch;
      const height = isAlive ? (crouching ? 1.05 : 1.65) : 0.5;
      const coverDistance = distanceToCover({ x: player.x, y: (player.y || 0) + height, z: player.z }, { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) }, MAP.boxes, 1.6);
      this.wallStow = lerp(this.wallStow, clamp((1.45 - coverDistance) / 1.05, 0, 1), 1 - Math.exp(-dt * 14));
      this.aimAmount = lerp(this.aimAmount, view.aim && isAlive && !player.reloading && this.wallStow < .2 ? 1 : 0, 1 - Math.exp(-dt * 15));
      this.reloadAmount = lerp(this.reloadAmount, player.reloading ? 1 : 0, 1 - Math.exp(-dt * 12));
      const weapon = CLASSES[player.classId] ?? CLASSES.assault;
      const observedReload = Number.isFinite(player.reloadProgress) ? player.reloadProgress : null;
      if (player.reloading && (!this.wasReloading || this.lastReloadProgress !== observedReload)) {
        if (!this.wasReloading || observedReload !== null) this.reloadStarted = this.clock - (observedReload ?? 0) * weapon.reload;
        this.lastReloadProgress = observedReload;
      }
      this.wasReloading = !!player.reloading;
      const reloadPhase = player.reloading ? clamp((this.clock - (this.reloadStarted ?? this.clock)) / weapon.reload, 0, 1) : 1;
      const reloadMotion = Math.sin(reloadPhase * Math.PI) * this.reloadAmount;
      const moving = clamp(Number(view.move) || 0, 0, 1);
      const grounded = player.grounded !== false;
      const sprint = view.sprint && !view.aim && moving > .1 && !player.reloading;
      this.handlingMove = lerp(this.handlingMove, grounded ? moving : 0, 1 - Math.exp(-dt * 9));
      this.sprintBlend = lerp(this.sprintBlend, sprint ? 1 : 0, 1 - Math.exp(-dt * 11));
      this.strafeBlend = lerp(this.strafeBlend, Number(view.strafe) || 0, 1 - Math.exp(-dt * 9));
      if (grounded && !this.previousGrounded) this.landDip = .09;
      this.previousGrounded = grounded;
      this.landDip *= Math.exp(-dt * 12);
      this.handlingCycle += dt * lerp(crouching ? 7 : 10, 15, this.sprintBlend);
      const cycle = this.handlingCycle;
      const bob = this.handlingMove * (1 - this.aimAmount * .84) * (crouching ? .65 : 1);
      const target = this.scratchPosition.set(player.x, player.y || 0, player.z);
      // Smooth authoritative 20 Hz movement without delaying mouse look. A
      // respawn/teleport must never drag the camera across the entire map.
      if (this.cameraPlayerId !== localId || this.cameraAlive !== isAlive || this.cameraAnchor.distanceToSquared(target) > 64) {
        this.cameraAnchor.copy(target);
        this.lastYaw = yaw; this.lastPitch = pitch;
      } else this.cameraAnchor.lerp(target, 1 - Math.exp(-dt * 28));
      this.cameraPlayerId = localId; this.cameraAlive = isAlive;
      this.camera.position.set(this.cameraAnchor.x, this.cameraAnchor.y + height + (shake ? Math.sin(cycle * 2) * .016 * bob - this.landDip * .4 : 0), this.cameraAnchor.z);
      this.kick = Math.max(view.recoil || 0, this.kick * Math.exp(-dt * 16));
      if (player.shotSeq !== undefined && player.shotSeq !== this.lastShot) {
        if (this.lastShot !== -1) this.kick = 1;
        this.lastShot = player.shotSeq;
      }
      this.camera.rotation.set(pitch, yaw, shake ? Math.sin(cycle) * .003 * bob - this.strafeBlend * .005 : 0, 'YXZ');
      const aimFov = player.classId === 'recon'
        ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(baseFov) / 2) / 4))
        : baseFov - 23;
      const fov = lerp(baseFov + this.sprintBlend * 6, aimFov, this.aimAmount);
      if (Math.abs(this.camera.fov - fov) > 0.03 || this.camera.near !== .045) {
        this.camera.fov = fov;
        this.camera.near = .045;
        this.camera.updateProjectionMatrix();
      }
      this.swayX = lerp(this.swayX, clamp(Math.atan2(Math.sin(yaw - this.lastYaw), Math.cos(yaw - this.lastYaw)) * 1.3, -0.025, 0.025), 0.18);
      this.swayY = lerp(this.swayY, clamp((pitch - this.lastPitch) * 1.3, -0.02, 0.02), 0.18);
      this.lastYaw = yaw; this.lastPitch = pitch;
      this.scoped = isAlive && player.classId === 'recon' && this.aimAmount >= .92;
      this.weapon.visible = isAlive && !this.scoped;
      this.weaponRig.update({ classId: player.classId, aim: this.aimAmount, reloadMotion, reloadPhase, reloadEmpty: player.ammo === 0, kick: this.kick, clock: this.clock });
      const kick = this.kick * clamp(weapon.recoil / .019, .7, 1.65);
      this.weapon.position.set(
        lerp(.26, 0, this.aimAmount) + Math.sin(cycle) * .015 * bob - this.swayX + this.sprintBlend * .035,
        lerp(-.23, -.167, this.aimAmount) + Math.cos(cycle * 2) * .01 * bob - this.swayY - reloadMotion * .10 - this.sprintBlend * .07 - this.landDip * .75,
        lerp(-.42, -.32, this.aimAmount) + kick * .056 + reloadMotion * .06,
      );
      this.weapon.rotation.set(
        kick * .062 - reloadMotion * .39 - this.sprintBlend * .25 + Math.cos(cycle) * bob * .022,
        -reloadMotion * .22 + this.sprintBlend * .34 + this.strafeBlend * .028 * (1 - this.aimAmount),
        -reloadMotion * .47 + this.sprintBlend * .24 + Math.sin(cycle) * bob * .018,
      );
      this.weapon.position.y -= this.wallStow * .28; this.weapon.position.z += this.wallStow * .18; this.weapon.rotation.x -= this.wallStow * .85;
      const sx = Math.round(this.cameraAnchor.x * 0.5) * 2;
      const sz = Math.round(this.cameraAnchor.z * 0.5) * 2;
      this.sun.position.set(sx - 90, 75, sz + 65);
      this.sun.target.position.set(sx, 0, sz);
    }
    this.camera.updateMatrixWorld();
    this.viewProjection.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.viewFrustum.setFromProjectionMatrix(this.viewProjection);
    const localTeam = player?.team ?? 0;
    for (const point of state.points || []) {
      const flag = this.flags.get(point.id); if (!flag) continue;
      const color = point.owner === -1 || point.owner == null ? COLORS.neutral : point.owner === localTeam ? COLORS.friendly : COLORS.enemy;
      flag.flag.material.color.setHex(color); flag.ring.material.color.setHex(color); flag.label.material.color.setHex(color);
      flag.ring.material.opacity = point.contested ? 0.22 + Math.sin(this.clock * 8) * 0.12 : 0.19;
      this.flagBounds.center.set(point.x, 3, point.z);
      if (this.camera.position.distanceToSquared(this.flagBounds.center) < 95 * 95 && this.viewFrustum.intersectsSphere(this.flagBounds)) {
        const positions = flag.flag.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) { const x = positions.getX(i) + 0.775; positions.setZ(i, Math.sin(this.clock * 3.5 + x * 4) * 0.09 * x); }
        positions.needsUpdate = true;
      }
    }
    this.updateSoldiers(state, localId, dt); this.updateGrenades(state); this.processEvents(state, localId); this.updateEffects(dt);
    this.atmosphere.sky.position.copy(this.camera.position);
    this.drawScene();
  }

  getStats() { return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, effects: this.effects.length, geometries: this.renderer.info.memory.geometries, pixelRatio: this.currentPixelRatio, integratedGpu: this.integratedGpu }; }

  project(x, y, z) {
    const position = this.scratchPosition.set(x, y, z).project(this.camera);
    const width = this.viewportWidth, height = this.viewportHeight;
    return { x: (position.x * 0.5 + 0.5) * width, y: (-position.y * 0.5 + 0.5) * height, visible: position.z > -1 && position.z < 1 && Math.abs(position.x) < 1.1 && Math.abs(position.y) < 1.1 };
  }

  dispose() {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    const collect = object => {
      if (object.geometry) geometries.add(object.geometry);
      for (const mat of object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []) {
        materials.add(mat); for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
      }
    };
    this.scene.traverse(collect);
    for (const soldier of this.soldiers.values()) if (!soldier.group.parent) soldier.group.traverse(collect);
    for (const soldier of this.soldierTemplates.values()) soldier.group.traverse(collect);
    for (const pool of Object.values(this.effectPools)) for (const effect of pool) collect(effect.mesh);
    if (this.soldierAtlas) {
      materials.add(this.soldierAtlas);
      for (const value of Object.values(this.soldierAtlas)) if (value?.isTexture) textures.add(value);
    }
    textures.add(this.smokeTexture);
    materials.add(this.grenadeMaterial);
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
    this.weaponRig?.dispose?.();
    this.atmosphere.target.dispose();
    this.renderer.dispose();
  }
}
