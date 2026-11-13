import * as THREE from 'three';
import { CachedShadows } from './cached-shadows.js';
import { InteriorVisibility } from './interior-visibility.js';
import { gadgetPalette, createGadgetModel, gadgetTemplates } from './gadget-models.js';
import { buildSpecialProp, SPECIAL_PROP_KINDS } from '../shared/prop-models.js';
import { getAssetColliders } from '../shared/asset-colliders.js';
import { buildMapScene } from './map-scene.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { getMap, CLASSES, CLASS_WEAPONS, SIDEARMS, weaponSwitchPose, getWeapon, defaultWeaponId, CAPTURE_RADIUS, EYE_HEIGHT, CROUCH_EYE_HEIGHT } from '../shared/world.js';
import { BULLET_GRAVITY, bulletHeight } from '../shared/ballistics.js';
import { createSurfaceMaterials, makeSky, makeSign, addSectorInstances, mapSector, pairMaterials, clonePairedMaterial } from './visuals.js';
import { prepareViewModel, distanceToCover, drawWorldAndViewModel } from './viewmodel.js';
import { createWeaponRig } from './weapons.js';
import { LAUNCHER_POSE, SUPPLY_POSE } from './gadget-poses.js';
import { drawFlagBanner } from './logos.js';
import { canFirePassengerWeapon, getVehicleSeatPose, TURRET_MAX_PITCH, TURRET_MIN_PITCH, VEHICLE_TYPES } from '../shared/vehicles.js';
import { createVehicleRig, disposeVehicleRig, updateVehicleRig } from './vehicles.js';
import { BulletMarks } from './bullet-marks.js';
import {
  createSoldierRig, cloneSoldierRig, animateSoldier,
  soldierHit, soldierThrow, beginDeath, animateDeath, poseSeatedSoldier,
} from './soldier.js';

const COLORS = { friendly: 0x5bd9e8, enemy: 0xf0a15d, neutral: 0xc8c5ae };
const TEAM_COLORS = [0x5bd9e8, 0xf0a15d];
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

const FLAG_LOW = 0.6, FLAG_HIGH = 4.05;
function setFlagColor(mesh, color) {
  const m = mesh.material;
  m.color.setHex(color);
  if (m._lowMaterial) m._lowMaterial.color.setHex(color);
  if (m._highMaterial) m._highMaterial.color.setHex(color);
}

function setFlagMap(mesh, texture) {
  for (const m of [mesh.material, mesh.material._lowMaterial, mesh.material._highMaterial]) {
    if (m && m.map !== texture) m.map = texture;
  }
}

function seeded(seed = 90210) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
}

const insideFootprint = (box, x, z) => Math.abs(x - box.x) <= box.w / 2 && Math.abs(z - box.z) <= box.d / 2;
const boxTop = box => (box.baseY ?? 0) + box.h;

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

function mapMaterials(surfaces) {
  return {
    concrete: surfaces.concrete, darkConcrete: material(0x414948), edge: material(0x929087),
    asphalt: surfaces.asphalt, steel: material(0x323c3e, 0.55, 0.65), rust: material(0x735344, 0.8, 0.4),
    roof: material(0x4e5655), window: material(0x23363e, 0.25, 0.4),
    marking: material(0xb5b1a0, 0.85, 0.05, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    sand: material(0x9c8e70, 0.95, 0.02), foliage: material(0x4c6444, 0.92, 0.02), foliageDark: material(0x3b5236, 0.95, 0.02),
    tire: material(0x1e2223, 0.92, 0.05), glass: material(0x1c2f38, 0.18, 0.55), tailLight: material(0xb83228, 0.4, 0.2, { emissive: 0x6e1810, emissiveIntensity: 0.35 }),
    pole: material(0x788185, 0.4, 0.75),
    stripe: material(0xc49a38, 0.65, 0.2), skyline: material(0x697476), crane: material(0x776f57, 0.8, 0.4),
    glow: new THREE.MeshBasicMaterial({ color: 0xffd8a1 }),
  };
}

function mapGeometry() {
  return {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 10),
    sphere: new THREE.SphereGeometry(1, 10, 8),
    rounded: new RoundedBoxGeometry(1, 1, 1, 1, 0.12),
  };
}

export function createMapModelBuilder(surfaces) {
  const { box, cylinder, rounded, buildMapBoxes, makeFlag, mergeStaticWorld } = GameRenderer.prototype;
  return { box, cylinder, rounded, buildMapBoxes, makeFlag, mergeStaticWorld, flags: new Map(), materials: mapMaterials(surfaces),
    geo: mapGeometry(), surfaces, surfaceCache: new Map(), random: seeded(), createMaterial: material };
}

export class GameRenderer {
  constructor(canvas, { onError, antialias = 'auto' } = {}) {
    this.canvas = canvas;
    this.gfx = { shadows: 'auto', resolution: 'auto' };
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
    this.vehicleRigs = new Map();
    this.equipmentMeshes = new Map();
    this.rocketMeshes = new Map();
    this.rocketGlowMaterial=new THREE.MeshBasicMaterial({color:0xffdb8b,toneMapped:false});
    this.rocketTrailMaterial=new THREE.LineBasicMaterial({color:0xddd8c9,transparent:true,opacity:.48,depthWrite:false});
    this.remoteTools = new Map();
    this.reviveRings = new Map();
    this.reviveMaterial=new THREE.MeshBasicMaterial({color:0x8ef3be,transparent:true,opacity:.7,depthWrite:false,side:THREE.DoubleSide});
    this.equipmentPalette = gadgetPalette((name,color,roughness,metalness,extra)=>material(color,roughness,metalness,extra));
    this.throwTimer = 0;
    this.throwDuration = 0.68;
    this.gadgetTimer = 0;
    this.gadgetDuration = 0.65;
    this.effects = [];
    this.bulletMarks = new BulletMarks();
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
    this.vehicleSeatAnchor = new THREE.Vector3();
    this.cameraPlayerId = null;
    this.cameraAlive = null;
    this.scratchPosition = new THREE.Vector3();
    this.viewFrustum = new THREE.Frustum();
    this.viewProjection = new THREE.Matrix4();
    this.soldierBounds = new THREE.Sphere(new THREE.Vector3(), 2.5);
    this.flagBounds = new THREE.Sphere(new THREE.Vector3(), 4.5);
    this.effectBounds = new THREE.Sphere(new THREE.Vector3(), 12);
    this.cachedShadows=new CachedShadows();this.interiorVisibility=new InteriorVisibility();
    this.surfaceCache = new Map();
    this.soldierMaterials = new Map();
    this.random = seeded();
    const integratedProbe = detectIntegratedGpu();
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: antialias === 'on' ? true : antialias === 'off' ? false : !integratedProbe,
        stencil: false,
        powerPreference: 'high-performance',
        alpha: false,
      });
    } catch (error) {
      onError?.(error);
      throw error;
    }
    this.cachedShadows.install(this);
    this.integratedGpu = integratedProbe || detectIntegratedGpu(this.renderer);
    if (canvas && typeof canvas.addEventListener === 'function') {
      canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();
      }, false);
      canvas.addEventListener('webglcontextrestored', () => {
        this.cachedShadows.disposeTargets();this.cachedShadows.size=null;this.cachedShadows.install(this);
        this.cachedShadows.invalidate();
        this.sun.shadow.needsUpdate = true;
        this.renderer.shadowMap.needsUpdate = true;
      }, false);
    }
    this.grenadeMaterial = material(0x4b5842, 0.72, 0.32);
    this.grenadeLedMaterial = material(0xff3b28, 0.25, 0.1, { emissive: 0xff3b28, emissiveIntensity: 1.4 });
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
    this.sunOffset = new THREE.Vector3(-90, 75, 65);
    this.sunForward = this.sunOffset.clone().negate().normalize();
    this.sunRight = new THREE.Vector3().crossVectors(this.sunForward, new THREE.Vector3(0, 1, 0)).normalize();
    this.sunUp = new THREE.Vector3().crossVectors(this.sunRight, this.sunForward).normalize();
    this.shadowMapSize = this.integratedGpu ? 1024 : 2048;
    this.shadowExtent = 72;
    this.sun.position.copy(this.sunOffset);
    this.sun.castShadow = true;
    this.sun.shadow.autoUpdate = false;
    this.sun.shadow.mapSize.set(this.shadowMapSize, this.shadowMapSize);
    Object.assign(this.sun.shadow.camera, {
      left: -this.shadowExtent, right: this.shadowExtent,
      top: this.shadowExtent, bottom: -this.shadowExtent,
      near: 15, far: 220,
    });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.needsUpdate = true;
    this.renderer.shadowMap.needsUpdate = true;
    this.scene.add(this.sun, this.sun.target);
    this.updateSunShadow(0, 0);
    this.geo = {
      ...mapGeometry(),
      shell: new THREE.CylinderGeometry(.009, .009, .043, 6),
      gadgetRing: new THREE.RingGeometry(0.82, 1.0, 28),
    };
    this.gadgetAssets = {
      team0: material(TEAM_COLORS[0] ?? COLORS.friendly, 0.35, 0.3, {
        emissive: TEAM_COLORS[0] ?? COLORS.friendly,
        emissiveIntensity: 0.55,
      }),
      team1: material(TEAM_COLORS[1] ?? COLORS.enemy, 0.35, 0.3, {
        emissive: TEAM_COLORS[1] ?? COLORS.enemy,
        emissiveIntensity: 0.55,
      }),
      white: material(0xe4e8e2, 0.65, 0.12),
      red: material(0xd93832, 0.45, 0.1, { emissive: 0x991815, emissiveIntensity: 0.35 }),
      green: material(0x52e088, 0.3, 0.2, { emissive: 0x28b862, emissiveIntensity: 0.65 }),
    };
    this.surfaces = createSurfaceMaterials(this.renderer, { useBump: true });
    for (const m of [this.surfaces.asphalt, this.surfaces.asphalt._lowMaterial]) {
      if (m) { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2; }
    }
    this.atmosphere = makeSky(this.scene, this.renderer);
    this.materials = mapMaterials(this.surfaces);
    this.worldRoot = new THREE.Group();
    this.worldRoot.add(this.atmosphere.sky);
    this.scene.add(this.worldRoot);
    this.worlds = new Map();
    this.setMap();
    this.scene.matrixAutoUpdate = false;
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
    this.effectBatches = {};
    for (const [type, geometry, mat] of [['spark', this.geo.sphere, this.sparkMaterial], ['shell', this.geo.shell, this.shellMaterial]]) {
      const batch = new THREE.InstancedMesh(geometry, mat, 160);
      batch.name = `pooled-${type}`;
      batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      batch.count = 0;
      batch.frustumCulled = false;
      this.effectBatches[type] = batch;
      this.worldRoot.add(batch);
    }
    const smokeGeometry = new THREE.PlaneGeometry(1, 1);
    smokeGeometry.setAttribute('instanceAlpha', new THREE.InstancedBufferAttribute(new Float32Array(160), 1).setUsage(THREE.DynamicDrawUsage));
    smokeGeometry.setAttribute('instanceRotation', new THREE.InstancedBufferAttribute(new Float32Array(160), 1).setUsage(THREE.DynamicDrawUsage));
    const smokeMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: this.smokeTexture } }]),
      vertexShader: `
        attribute float instanceAlpha; attribute float instanceRotation;
        varying vec2 smokeUv; varying vec4 smokeColor;
        #include <fog_pars_vertex>
        void main() {
          smokeUv = uv; smokeColor = vec4(instanceColor, instanceAlpha);
          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.,0.,0.,1.);
          float c = cos(instanceRotation), s = sin(instanceRotation);
          vec2 p = mat2(c,s,-s,c) * position.xy;
          mvPosition.xy += p * vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform sampler2D map; varying vec2 smokeUv; varying vec4 smokeColor;
        #include <fog_pars_fragment>
        void main() {
          gl_FragColor = texture2D(map,smokeUv) * smokeColor;
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    const smokeBatch = new THREE.InstancedMesh(smokeGeometry, smokeMaterial, 160);
    smokeBatch.name = 'sorted-smoke-billboards'; smokeBatch.count = 0; smokeBatch.frustumCulled = false;
    smokeBatch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    smokeBatch.setColorAt(0, new THREE.Color(0xffffff));
    smokeBatch.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.effectBatches.smoke = smokeBatch;
    this.smokeOrder = [];
    this.worldRoot.add(smokeBatch);
    this.scene.traverse(optimizeLighting);
    this.warmup();
    this.resize();
  }

  getQualityMaterial(mat) {
    if (!mat) return mat;
    return (this.lowQuality ? mat._lowMaterial : mat._highMaterial) || mat;
  }

  // Pre-build all soldier rigs, effect pools and compile shaders upfront so
  // spawning bots, shooting or throwing grenades never stalls a frame.
  warmup() {
    for (const team of [0, 1]) {
      for (const classId of Object.keys(CLASSES)) {
        for (const weaponId of [...CLASS_WEAPONS[classId], ...SIDEARMS]) {
          const key = `${team}:${classId}:${weaponId}`;
          if (!this.soldierTemplates.has(key)) {
            const template = createSoldierRig(this, { id: key, team, classId, weaponId, x: 0, y: 0, z: 0, shotSeq: 0 });
            if (!this.integratedGpu) template.group.traverse(optimizeLighting);
            this.soldierTemplates.set(key, template);
          }
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

    const sampleSoldier0 = this.soldierTemplates.get('0:assault:ar416')?.group;
    const sampleSoldier1 = this.soldierTemplates.get('1:recon:sv98')?.group;
    const sampleGrenade = this.createGrenadeMesh();
    const sampleGadgetGroup = new THREE.Group();
    for (const m of Object.values(this.gadgetAssets)) {
      sampleGadgetGroup.add(new THREE.Mesh(this.geo.box, m));
      if (m._lowMaterial) sampleGadgetGroup.add(new THREE.Mesh(this.geo.box, m._lowMaterial));
    }
    const sampleTracer = this.effectPools.tracer[0]?.mesh;
    const sampleSmoke = this.effectPools.smoke[0]?.mesh;
    const sampleSpark = this.effectPools.spark[0]?.mesh;
    const sampleShell = this.effectPools.shell[0]?.mesh;
    const temp = [sampleSoldier0, sampleSoldier1, sampleGrenade, sampleGadgetGroup, sampleTracer, sampleSmoke, sampleSpark, sampleShell].filter(Boolean);
    for (const node of temp) this.worldRoot.add(node);
    for (const f of this.flags.values()) f.teamFlag.visible = true;
    try {
      this.renderer.compile(this.scene, this.camera);
    } catch {
      // Ignore compile errors in headless/stub environments.
    }
    for (const f of this.flags.values()) f.teamFlag.visible = false;
    for (const node of temp) node.removeFromParent();
  }

  createTracerEffect() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.boundingSphere = new THREE.Sphere();
    const mesh = new THREE.Line(geometry, new THREE.LineBasicMaterial({
      color: 0xffca79, transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    return { mesh, type: 'tracer', origin: new THREE.Vector3(), velocity: new THREE.Vector3() };
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

  setMap(mapId) {
    const map = getMap(mapId);
    if (this.map === map) return;
    let world = this.worlds.get(map.id);
    if (!world) {
      const live = { scene: this.scene, map: this.map, flags: this.flags, portWater: this.portWater, random: this.random };
      const root = new THREE.Group();
      root.name = `map-${map.id}`;
      this.map = map;
      this.random = seeded();
      this.flags = new Map();
      this.portWater = null;
      // Builders target an isolated container, never the live scene. No scene
      // child-diff or reparenting heuristic can leave geometry from another map.
      this.scene = root;
      try {
        this.buildWorld();
        this.mergeStaticWorld(new Set());
        world = { root, flags: this.flags, water: this.portWater };
      } finally {
        Object.assign(this, live);
      }
      root.updateMatrixWorld(true);
      root.traverse(object => {
        optimizeLighting(object);
        object.matrixAutoUpdate = false;
        object.matrixWorldAutoUpdate = false;
      });
      this.worlds.set(map.id, world);
    }
    this.clearVehicles();
    this.clearMapDynamics();
    this.staticRoot?.removeFromParent();
    this.map = map;
    this.scene.fog.density = map.fogDensity ?? .0034;
    this.scene.fog.color.set(map.fogColor ?? 0x9aa7a7);
    this.scene.background.set(map.fogColor ?? 0x9aa7a7);
    this.sun.color.set(map.sunColor ?? 0xffd7a4);
    this.atmosphere.sky.material.uniforms.hazeAmount.value = map.theme === 'desert-village' ? .23 : 0;
    this.staticRoot = world.root;
    this.flags = world.flags;
    this.portWater = world.water;
    for (const f of this.flags.values()) { f.fromOwned = false; f.neutralH = 1; f.teamH = 0; }
    this.worldRoot.add(this.staticRoot);
    if (this.lowQuality !== undefined) this.staticRoot.traverse(object => {
      const mat = object.material;
      const next = this.lowQuality ? mat?._lowMaterial : mat?._highMaterial;
      if (next) object.material = next;
    });
    this.staticMenuShadows = false;
    this.cameraPlayerId = null;
  }

  clearMapDynamics() {
    this.bulletMarks.clear();
    for (const soldier of this.soldiers.values()) this.removeSoldier(soldier);
    this.soldiers.clear();
    for (const mesh of this.grenadeMeshes.values()) mesh.removeFromParent();
    this.grenadeMeshes.clear();
    for(const model of this.rocketMeshes.values()){
      const line=model.userData.flight?.line;if(line){line.removeFromParent();line.geometry.dispose();}
    }
    for(const cache of [this.equipmentMeshes,this.rocketMeshes,this.remoteTools,this.reviveRings]){
      for(const model of cache.values())model.removeFromParent();
      cache.clear();
    }
    for (const effect of this.effects) {
      if (effect.type === 'light') effect.mesh.intensity = 0;
      else { effect.mesh.removeFromParent(); this.effectPools[effect.type].push(effect); }
    }
    this.effects.length = 0;
    for (const batch of Object.values(this.effectBatches || {})) batch.count = 0;
    this.seenEvents.clear();
    this.lastShot = -1;
    this.throwTimer = this.gadgetTimer = 0;
  }

  buildWorld() {
    buildMapScene(this, this.map);
  }

  buildMapBoxes(boxes) {
    const windowMatrices = [], litMatrices = [], frameMatrices = [];
    const dummy = new THREE.Object3D();
    for (const b of boxes) {
      if (b.kind === 'rock' || b.kind === 'pump-manifold' || b.kind.startsWith('port-') || b.kind.startsWith('village-')) continue;
      const elevation = b.baseY ?? 0;
      const parent = elevation ? new THREE.Group() : this.scene;
      if (elevation) { parent.position.y = elevation; this.scene.add(parent); }
      const h = b.h ?? 3, w = b.w ?? 4, d = b.d ?? 4;
      if (b.kind === 'roof') {
        this.box(parent, b.x, h / 2, b.z, w, h, d, this.surfaces.metal);
        continue;
      }
      const specialProp = SPECIAL_PROP_KINDS.has(b.kind);
      const building = h > 5 && !['wall', 'pillar'].includes(b.kind) && !specialProp;
      const container = String(b.kind || '').includes('container');
      const surface = b.kind === 'crate' ? this.surfaces.wood : b.kind === 'tent' ? this.surfaces.cloth : container || b.kind === 'warehouse' || b.kind === 'truck' || b.kind === 'car' || b.kind === 'fueltank' || b.kind === 'generator' || b.kind === 'kiosk' ? this.surfaces.metal : b.kind === 'factory' || b.kind === 'wall' ? this.surfaces.brick : this.surfaces.concrete;
      const color = b.color || '#969b92', cacheKey = `${surface.uuid}:${color}`;
      if (!this.surfaceCache.has(cacheKey)) { this.surfaceCache.set(cacheKey, clonePairedMaterial(surface, color)); }
      const mat = b.kind === 'pillar' ? this.materials.steel : this.surfaceCache.get(cacheKey);
      if (buildSpecialProp.call(this, parent, b, mat)) continue;
      this.box(parent, b.x, h / 2, b.z, w, h, d, mat);
      if (b.kind === 'wall') {
        this.box(parent, b.x, h + 0.05, b.z, w + .08, .16, d + .08, this.materials.edge);
      } else if (b.kind === 'pillar') {
        this.box(parent, b.x, .12, b.z, w + .25, .24, d + .25, this.materials.rust);
      } else if (building) {
        this.box(parent, b.x, h + 0.13, b.z, w + 0.3, 0.26, d + 0.3, this.materials.edge);
        this.box(parent, b.x, 0.45, b.z, w + 0.12, 0.9, d + 0.12, this.materials.darkConcrete);
        if (b.kind === 'warehouse') {
          const rise = Math.min(2.6, w * .1), half = w / 2, slope = Math.atan2(rise, half);
          for (const side of [-1, 1]) { const roof = this.box(parent, b.x + side * w / 4, h + rise / 2 + .12, b.z, Math.hypot(half, rise) + .3, .14, d + .6, this.surfaces.metal); roof.rotation.z = -side * slope; }
        } else if (b.kind === 'factory') {
          this.cylinder(parent, b.x + w * .28, h + 4, b.z - d * .25, .48, 8, this.surfaces.brick, 14);
          this.cylinder(parent, b.x + w * .28, h + 8.05, b.z - d * .25, .58, .25, this.materials.steel, 14);
          const tank = this.cylinder(parent, b.x - w * .22, h + 1.8, b.z + d * .2, 1.2, 3.3, this.materials.edge, 16);
          this.cylinder(parent, tank.position.x, h + 3.5, tank.position.z, 1.28, .16, this.materials.steel, 16);
        }
        for (let y = 2.8; y < h - 0.9; y += 3.1) {
          for (const face of [-1, 1]) {
            for (let x = -w / 2 + 1.5; x < w / 2 - 0.7; x += 2.7) {
              dummy.position.set(b.x + x, y + elevation, b.z + face * (d / 2 + 0.095)); dummy.rotation.set(0, 0, 0); dummy.scale.set(1.3, 1.55, 0.045); dummy.updateMatrix();
              (this.random() > 0.88 ? litMatrices : windowMatrices).push(dummy.matrix.clone());
              dummy.position.z = b.z + face * (d / 2 + .04); dummy.scale.set(1.5, 1.75, .055); dummy.updateMatrix(); frameMatrices.push(dummy.matrix.clone());
            }
            for (let z = -d / 2 + 1.5; z < d / 2 - 0.7; z += 2.7) {
              dummy.position.set(b.x + face * (w / 2 + 0.095), y + elevation, b.z + z); dummy.rotation.set(0, 0, 0); dummy.scale.set(0.045, 1.55, 1.3); dummy.updateMatrix();
              (this.random() > 0.9 ? litMatrices : windowMatrices).push(dummy.matrix.clone());
              dummy.position.x = b.x + face * (w / 2 + .04); dummy.scale.set(.055, 1.75, 1.5); dummy.updateMatrix(); frameMatrices.push(dummy.matrix.clone());
            }
          }
        }
        const vents = Math.min(3, Math.floor(w * d / 70));
        for (let i = 0; i < vents; i++) {
          const vx = b.x + (this.random() - 0.5) * w * 0.55, vz = b.z + (this.random() - 0.5) * d * 0.55;
          this.box(parent, vx, h + 0.7, vz, 1.7, 1.1, 1.5, this.materials.steel);
          this.cylinder(parent, vx + 0.3, h + 1.7, vz, 0.19, 1.2, this.materials.rust);
        }
        // Drainpipes and a concrete loading-door trim add depth at street level.
        this.cylinder(parent, b.x + w / 2 - 0.2, h / 2, b.z - d / 2 - 0.12, 0.075, h, this.materials.rust);
        // Facade pilasters, weathered service signage and a shallow loading canopy.
        for (let fx = -w / 2 + 1; fx < w / 2; fx += 7) this.box(parent, b.x + fx, h / 2, b.z + d / 2 + .07, .18, h, .2, this.materials.edge);
        for (let y = 3.9; y < h - 1; y += 3.1) this.box(parent, b.x, y, b.z + d / 2 + .05, w, .09, .12, this.materials.edge);
        if (w > 12) {
          const sign = makeSign(b.kind === 'factory' ? 'SECTOR' : 'DEPOT', `${String(b.id || '').replace('obj-', '').padStart(2, '0')}  /  RESTRICTED`, Math.min(4.5, w * .22), this.integratedGpu);
          sign.position.set(b.x, Math.min(h - 1.5, 6), b.z + d / 2 + .16); parent.add(sign);
          this.box(parent, b.x, 3.45, b.z + d / 2 + .6, 5.5, .12, 1.25, this.materials.steel);
        }
        if (w > 8) {
          this.box(parent, b.x, 1.45, b.z + d / 2 + 0.035, Math.min(4.1, w * 0.4), 2.9, 0.06, this.materials.steel);
          for (let y = 0.3; y < 2.8; y += 0.27) this.box(parent, b.x, y, b.z + d / 2 + 0.075, Math.min(4.1, w * 0.4), 0.035, 0.03, this.materials.edge, false);
        }
      } else if (container) {
        for (let x = -w / 2 + 0.25; x < w / 2; x += 0.6) {
          for (const side of [-1, 1]) this.box(parent, b.x + x, h / 2, b.z + side * (d / 2 + 0.02), 0.065, h * 0.92, 0.05, mat, false);
        }
        this.box(parent, b.x, h + 0.025, b.z, w + 0.05, 0.05, d + 0.05, this.materials.steel, false);
        for (const side of [-1, 1]) {
          if (w > d) this.cylinder(parent, b.x + w / 2 + .035, h / 2, b.z + side * d * .22, .035, h * .88, this.materials.pole);
          else this.cylinder(parent, b.x + side * w * .22, h / 2, b.z + d / 2 + .035, .035, h * .88, this.materials.pole);
        }
      } else if (b.kind === 'crate') {
        for (const side of [-1, 1]) {
          this.box(parent, b.x + side * w * .33, h / 2, b.z, .09, h + .025, d + .035, this.materials.steel);
          this.box(parent, b.x, h * .2, b.z + side * (d / 2 + .013), w + .03, .12, .045, this.materials.rust);
        }
      } else {
        this.box(parent, b.x, h - 0.035, b.z, w + 0.08, 0.16, d + 0.08, this.materials.edge);
        if (h < 2) {
          this.box(parent, b.x, h * 0.65, b.z + d / 2 + 0.015, w * 0.85, Math.min(0.14, h * 0.15), 0.02, this.materials.stripe, false);
        }
      }
    }
    const litWindowMat = material(0xb5a27c, 0.6, 0.2, { emissive: 0x7c633c, emissiveIntensity: 0.45 }, this.integratedGpu);
    for (const [matrices, mat] of [[frameMatrices, this.materials.edge], [windowMatrices, this.materials.window], [litMatrices, litWindowMat]]) {
      addSectorInstances(this.scene, this.geo.box, mat, matrices);
    }
  }

  mergeStaticWorld(existing) {
    // Batch immutable map details by material, keeping animated flags separate.
    this.scene.updateMatrixWorld(true);
    const dynamic = new Set([...this.flags.values()].map(f => f.group));
    const batches = new Map();
    for (const root of this.scene.children) if (!existing.has(root)) root.traverse(object => {
      if (!object.isMesh || object.isInstancedMesh || object.userData.noBatch || Array.isArray(object.material)) return;
      for (let node = object; node; node = node.parent) if (dynamic.has(node) || node === this.camera) return;
      const sector = mapSector(object.matrixWorld, this.map?.id==='village'?32:96);
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
    const group = new THREE.Group(); group.position.set(point.x, point.y ?? 0, point.z); this.scene.add(group);
    this.cylinder(group, 0, 2.4, 0, 0.045, 4.8, this.materials.pole);
    const flagMaterial = pairMaterials(
      new THREE.MeshStandardMaterial({ color: COLORS.neutral, side: THREE.DoubleSide, roughness: 0.95 }),
      new THREE.MeshLambertMaterial({ color: COLORS.neutral, side: THREE.DoubleSide }),
    );
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 0.85, 8, 1), flagMaterial);
    flag.position.set(0.8, 4.05, 0); group.add(flag);
    if (!this.flagLogos) {
      this.flagLogos = TEAM_COLORS.map((hex, team) => {
        const banner = document.createElement('canvas'); banner.width = 512; banner.height = 280;
        drawFlagBanner(banner, team, hex);
        const tex = new THREE.CanvasTexture(banner); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
        return tex;
      });
    }
    const teamFlagMaterial = pairMaterials(
      new THREE.MeshStandardMaterial({ color: 0xffffff, map: this.flagLogos[0], side: THREE.DoubleSide, roughness: 0.95 }),
      new THREE.MeshLambertMaterial({ color: 0xffffff, map: this.flagLogos[0], side: THREE.DoubleSide }),
    );
    const teamFlag = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 0.85, 8, 1), teamFlagMaterial);
    teamFlag.position.set(0.8, FLAG_LOW, 0); teamFlag.visible = false; group.add(teamFlag);
    const ring = new THREE.Mesh(new THREE.RingGeometry(CAPTURE_RADIUS - 0.13, CAPTURE_RADIUS, 36), new THREE.MeshBasicMaterial({ color: COLORS.neutral, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
    if (this.map.terrain) {
      const vertices = ring.geometry.attributes.position;
      for (let i = 0; i < vertices.count; i++) {
        const height = this.map.terrain.heightAt(point.x + vertices.getX(i), point.z - vertices.getY(i));
        vertices.setZ(i, height - (point.y ?? 0));
      }
    }
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; group.add(ring);
    const texture = canvasTexture(128, (ctx) => {
      ctx.fillStyle = 'rgba(12,23,28,.82)'; ctx.beginPath(); ctx.moveTo(64, 4); ctx.lineTo(118, 64); ctx.lineTo(64, 124); ctx.lineTo(10, 64); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#d7e1df'; ctx.lineWidth = 3; ctx.stroke();
      ctx.font = 'bold 68px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f3f4e9'; ctx.fillText(String(point.id), 64, 66);
    });
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true }));
    label.position.set(0, 6.2, 0); label.scale.set(1.75, 1.75, 1.75); group.add(label);
    this.flags.set(point.id, { group, flag, teamFlag, ring, label, neutralH: 1, teamH: 0, fromOwned: false });
  }

  buildWeapon() {
    this.weaponRig = createWeaponRig(this);
    this.weapon = this.weaponRig.weapon;
    this.camera.add(this.weapon);
    prepareViewModel(this.weapon);
  }

  makeSoldier(player) {
    const weaponId = player.weaponId || defaultWeaponId(player.classId);
    const key = `${player.team}:${player.classId}:${weaponId}`;
    let template = this.soldierTemplates.get(key);
    if (!template) {
      template = createSoldierRig(this, { ...player, weaponId });
      if (!this.integratedGpu) template.group.traverse(optimizeLighting);
      this.soldierTemplates.set(key, template);
    }
    const rig = cloneSoldierRig(template, { ...player, weaponId });
    rig.weaponId = weaponId;
    rig.stepIndex = this.soldiers.size;
    return rig;
  }

  removeSoldier(soldier) {
    soldier.group.removeFromParent();
    soldier.body.skeleton.dispose();
    soldier.flash.material.dispose();
    soldier.marker.material.dispose();
  }

  clearVehicles() {
    for (const rig of this.vehicleRigs.values()) disposeVehicleRig(rig);
    this.vehicleRigs.clear();
  }

  updateVehicles(state, player, dt, view) {
    const active = new Set();
    const blend = view.networkInterpolated ? 1 : 1 - Math.exp(-dt * 22);
    let mounted = null;
    for (const vehicle of state.vehicles ?? []) {
      active.add(vehicle.id);
      let rig = this.vehicleRigs.get(vehicle.id);
      const local = player?.vehicleId === vehicle.id && player.alive !== false;
      const distance = player ? Math.hypot(vehicle.x - player.x, vehicle.z - player.z) : 0;
      if ((vehicle.hp <= 0 && vehicle.wreckTime <= 0) || (!local && distance > 190)) {
        if (rig) {
          rig.group.visible = false;
          rig.initialized = false;
          rig.gunSeq = undefined;
        }
        continue;
      }
      if (!rig) {
        rig = createVehicleRig(vehicle.type, material, TEAM_COLORS);
        rig.group.traverse(object => {
          optimizeLighting(object);
          if (object.material) object.material = this.getQualityMaterial(object.material);
        });
        this.vehicleRigs.set(vehicle.id, rig);
        this.worldRoot.add(rig.group);
      }
      rig.group.visible = true;
      updateVehicleRig(rig, vehicle, player, dt, blend, view, this.lowQuality, this.map.terrain);
      if (local) mounted = { vehicle, rig };
      const damaged = vehicle.hp < vehicle.maxHp * .33;
      if (damaged && distance < 90 && this.effects.length < 70 && this.clock >= (rig.nextSmoke ?? 0)) {
        rig.nextSmoke = this.clock + (vehicle.hp > 0 ? .35 : .16);
        const atv = vehicle.type === 'atv', z = atv ? -.79 : -1.74;
        this.smoke(vehicle.x + Math.sin(vehicle.yaw)*z, (vehicle.y ?? 0) + (atv ? .88 : 1.20),
          vehicle.z + Math.cos(vehicle.yaw)*z, local ? .19 : vehicle.hp > 0 ? .34 : .68,
          local ? .62 : 1.6, 0x50504a);
      }
    }
    for (const [id, rig] of this.vehicleRigs) {
      if (active.has(id)) continue;
      disposeVehicleRig(rig);
      this.vehicleRigs.delete(id);
    }
    return mounted;
  }

  updateSoldiers(state, localId, dt, networkInterpolated=false) {
    const active = this.activeSoldiers;
    active.clear();
    const local = state.players.find(p => p.id === localId), localTeam = local?.team ?? 0;
    const blend = networkInterpolated || this.scoped ? 1 : 1 - Math.exp(-dt * 18);
    let shadowFrustum = null;
    if (this.renderer.shadowMap.enabled) {
      this.sun.updateMatrixWorld();
      this.sun.target.updateMatrixWorld();
      this.sun.shadow.updateMatrices(this.sun);
      shadowFrustum = this.sun.shadow.getFrustum();
    }
    const distantLimit = this.lowQuality ? 55 : (this.integratedGpu ? 70 : 95);
    // Use projected size so magnification keeps distant targets detailed.
    const viewScale = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) /
      Math.tan(THREE.MathUtils.degToRad(85 / 2));
    for (const player of state.players) {
      if (player.id === localId) continue;
      active.add(player.id);
      const activeWeaponId = player.weaponId || defaultWeaponId(player.classId);
      let soldier = this.soldiers.get(player.id);
      const stowing = soldier && soldier.classId === player.classId && soldier.team === player.team &&
        weaponSwitchPose(player.equipTime).stowing;
      const weaponId = stowing ? soldier.weaponId : activeWeaponId;
      let previousRig = null, previousParent = null;
      if (soldier && (soldier.classId !== player.classId || soldier.team !== player.team || soldier.weaponId !== weaponId)) {
        if (soldier.classId === player.classId && soldier.team === player.team && soldier.alive && player.alive !== false) {
          previousRig = soldier;
          previousParent = soldier.group.parent;
        }
        this.removeSoldier(soldier);
        soldier = null;
      }
      if (!soldier) {
        soldier = this.makeSoldier(player);
        if (previousRig) {
          soldier.group.position.copy(previousRig.group.position);
          soldier.group.rotation.copy(previousRig.group.rotation);
          soldier.pose.position.copy(previousRig.pose.position);
          soldier.motion = previousRig.motion;
          soldier.initialized = previousRig.initialized;
          previousParent?.add(soldier.group);
        }
        this.soldiers.set(player.id, soldier);
      }
      const { group } = soldier;
      if(player.vehicleId&&player.alive!==false){
        const vehicle=state.vehicles.find(v=>v.id===player.vehicleId),rig=this.vehicleRigs.get(player.vehicleId);
        if(!vehicle||!rig?.group.visible){group.removeFromParent();soldier.initialized=false;continue;}
        const index=player.vehicleSeat,seat=VEHICLE_TYPES[vehicle.type].seats[index];
        if(group.parent!==rig.body)rig.body.add(group);
        group.userData.seatedActor=true;
        group.position.set(seat.x,seat.height-1.65,seat.z);
        const relativeYaw=vehicle.type==='humvee'&&index===1?(rig.turretYaw??0):0;
        group.rotation.set(0,relativeYaw,0);group.visible=true;
        const position=getVehicleSeatPose(vehicle,index),distSq=this.camera.position.distanceToSquared(this.scratchPosition.set(position.x,position.y,position.z))*viewScale**2;
        soldier.body.geometry=distSq>(this.lowQuality?55:95)**2?soldier.distantGeometry:distSq>28**2?soldier.mediumGeometry:soldier.detailGeometry;
        soldier.body.castShadow=!this.lowQuality&&distSq<48**2;
        this.soldierBounds.center.set(position.x,position.y-.4,position.z);
        group.visible=this.viewFrustum.intersectsSphere(this.soldierBounds)||Boolean(shadowFrustum?.intersectsSphere(this.soldierBounds)&&distSq<48**2);
        poseSeatedSoldier(soldier,{vehicle,seat,index,relativeYaw:Math.atan2(Math.sin(player.yaw-vehicle.yaw-relativeYaw),Math.cos(player.yaw-vehicle.yaw-relativeYaw)),pitch:player.pitch,shotSeq:player.shotSeq,dt});
        rig.riders[index].visible=false;soldier.seated=true;
        continue;
      }
      if(soldier.seated){
        group.userData.seatedActor=false;
        group.removeFromParent();this.worldRoot.add(group);group.rotation.set(0,player.yaw,0);soldier.initialized=false;soldier.seated=false;
        const shadow=group.getObjectByName('soldier-contact-shadow');if(shadow)shadow.visible=true;
      }
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
      const distSq = local ? (player.x - local.x) ** 2 + (player.z - local.z) ** 2 : 0;
      const shadowVisible = !this.lowQuality && distSq < 48 * 48 && shadowFrustum?.intersectsSphere(this.soldierBounds);
      const visible = externalScene || ((alive || soldier.deathAge < 4.1) &&
        (this.viewFrustum.intersectsSphere(this.soldierBounds) || shadowVisible));
      if (!visible) {
        if (!externalScene) group.removeFromParent();
        continue;
      }
      const returning = !group.parent;
      if (returning) this.worldRoot.add(group);
      group.visible = true;
      if (!alive) {
        soldier.body.geometry = soldier.detailGeometry;
        animateDeath(soldier, { age: soldier.deathAge });
        continue;
      }
      const crouched = player.crouching || player.crouch;
      const projectedDistanceSq = this.camera.position.distanceToSquared(this.soldierBounds.center) * viewScale ** 2;
      const wasDistant = soldier.body.geometry === soldier.distantGeometry;
      const lodThreshold = distantLimit * (wasDistant ? .94 : 1.06);
      const distant = !externalScene && Boolean(local) && projectedDistanceSq > lodThreshold ** 2;
      const wasMedium = soldier.body.geometry === soldier.mediumGeometry;
      const nearLimit = (this.lowQuality ? 17 : 28) * (wasMedium ? .94 : 1.06);
      soldier.body.geometry = distant ? soldier.distantGeometry
        : projectedDistanceSq > nearLimit ** 2 ? soldier.mediumGeometry : soldier.detailGeometry;
      soldier.body.castShadow = !distant && !this.lowQuality && distSq < 48 * 48;
      soldier.rifle.scale.setScalar(1);
      const mustReset = reset || respawned || returning;
      const reducedRate = !externalScene && !this.scoped && projectedDistanceSq > 30 ** 2;
      const animationInterval = distant ? 1 / 20 : 1 / 30;
      soldier.animationDt = mustReset ? dt : (soldier.animationDt || 0) + dt;
      if (!reducedRate || previousRig || mustReset || soldier.animationDt >= animationInterval) {
        animateSoldier(soldier, { dt: soldier.animationDt, player, reset: mustReset, terrain: this.map.terrain });
        soldier.animationDt = 0;
      }
      if (distant) soldier.flash.visible = false;
      soldier.marker.material.color.setHex(TEAM_COLORS[player.team] ?? COLORS.friendly);
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
      if (event.type === 'grenade') {
        if (event.playerId === localId) this.throwTimer = this.throwDuration;
        else soldierThrow(this.soldiers.get(event.playerId));
        continue;
      }
      if (event.type === 'gadget') {
        if (event.playerId === localId) this.gadgetTimer = this.gadgetDuration;
        else if(event.kind==='ammo'||event.kind==='medkit'||event.kind==='beacon')soldierThrow(this.soldiers.get(event.playerId));
        continue;
      }
      if(event.type==='equipmentDestroyed'){
        this.smoke(event.x,event.y+.3,event.z,.3,.6,0x989181);this.spark(event.x,event.y+.3,event.z);continue;
      }
      if(event.type==='rocketLaunch'){
        if(event.playerId===localId)this.kick=1;
        if(event.rocketId&&!this.rocketMeshes.has(event.rocketId)&&state.time-event.time<.2){
          this.createRocketVisual({...event,id:event.rocketId},event.time);
        }
        const x=event.x,z=event.z;
        for(let i=0;i<3;i++)this.smoke(x,event.y-.1,z,.2+i*.06,.35,0xb1ab9c);
        continue;
      }
      if (event.type === 'shot') {
        const player = state.players.find(p => p.id === event.playerId);
        const own = event.playerId === localId;
        const age = Math.max(0, state.time - event.time);
        if (this.effects.length >= 120) continue;
        if (age < event.life) this.tracer(event, age);
        if (age > .27) continue;
        if (own && this.weapon.visible && !event.mounted) {
          const yaw = player?.yaw || 0;
          const effect = this.effectPools.shell.pop() ?? { mesh: new THREE.Mesh(this.geo.shell, this.shellMaterial), type: 'shell' };
          const shell = effect.mesh;
          this.weaponRig.ejection.getWorldPosition(shell.position);
          shell.scale.setScalar(getWeapon(event.classId,event.weaponId).sidearm ? .57 : 1);
          shell.rotation.set(0, 0, Math.PI / 2);
          Object.assign(effect, { age: 0, life: 1.1, vx: Math.cos(yaw) * 2.9, vy: .85 + this.random() * .7, vz: -Math.sin(yaw) * 2.9, spin: 8 + this.random() * 8 });
          this.effects.push(effect);
          if (!this.lowQuality && !this.integratedGpu && this.wallStow < .3 && (event.shotSeq ?? event.id) % 2 === 0) {
            const muzzle = this.weaponRig.muzzleFlash.getWorldPosition(this.scratchPosition);
            this.smoke(muzzle.x, muzzle.y, muzzle.z, .13, .42, 0xa4a79b);
          }
        }
      }
      if (event.type === 'bulletImpact') {
        const tracer = this.effects.find(effect => effect.type === 'tracer' && effect.shotId === event.shotId);
        if (tracer) tracer.life = Math.min(tracer.life, event.flight);
        const { tx, ty, tz, impact } = event;
        this.bulletMarks.add(event, this.map, this.staticRoot, this.worldRoot, this.vehicleRigs.get(event.impactVehicleId));
        if (!impact || state.time - event.time > .27 || this.effects.length >= 120) continue;
        this.effectBounds.center.set(tx, ty, tz);
        const impactRange = event.weaponId === 'sv98' ? getWeapon('recon', 'sv98').range + 20 : 165;
        if (this.camera.position.distanceToSquared(this.effectBounds.center) > impactRange ** 2 ||
          !this.viewFrustum.intersectsSphere(this.effectBounds)) continue;
        if (impact === 'metal') {
          for (let i = 0; i < (this.lowQuality || this.integratedGpu ? 1 : 4); i++) this.spark(tx, ty, tz);
          this.smoke(tx, ty, tz, .18, .32, 0x92968e);
        } else {
          const colors = { wood: 0xb59b75, concrete: 0xb9b2a0, ground: 0x9a8666, flesh: 0x827065, shield: 0x8bc5ca };
          this.smoke(tx, ty, tz, impact === 'flesh' ? .14 : .28, impact === 'shield' ? .25 : .57, colors[impact] ?? colors.concrete);
        }
      }
      if (event.type === 'explosion') {
        const x = event.x || 0, y = event.y ?? 0.6, z = event.z || 0;
        const flight=this.rocketMeshes.get(event.rocketId)?.userData.flight;
        if(flight){flight.impact={x,y,z,at:this.clock,event};flight.from.copy(this.rocketMeshes.get(event.rocketId).position);}
        else this.explosionVisual(event,state);
      }
    }
    while (this.seenEvents.size > 900) {
      this.seenEvents.delete(this.seenEvents.keys().next().value);
    }
  }
  explosionVisual(event,state) {
    const x=event.x??0,y=event.y??.6,z=event.z??0;
    if(state.time-event.time>.6||this.camera.position.distanceToSquared(this.scratchPosition.set(x,y,z))>180**2)return;
    this.effectBounds.center.set(x,y,z);
    if(!this.viewFrustum.intersectsSphere(this.effectBounds))return;
    const reduced=this.lowQuality||this.integratedGpu,count=reduced?8:13;
    for(let i=0;i<count;i++)this.smoke(x+(this.random()-.5)*2,y+this.random()*2,z+(this.random()-.5)*2,1.1+this.random()*1.4,2.5+this.random()*2,i<3?0xffb668:0x535953);
    this.blastFlash(x,y+1,z);
    for(let i=0;i<(reduced?6:14);i++)this.spark(x,y+.3,z,3);
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

  tracer({ id, x, y, z, vx, vy, vz, life }, age) {
    const tx = x + vx * life, ty = bulletHeight(y, vy, life), tz = z + vz * life;
    const bounds = this.effectBounds;
    bounds.center.set((x + tx) / 2, (y + ty) / 2, (z + tz) / 2);
    bounds.radius = Math.hypot(tx - x, ty - y, tz - z) / 2 + BULLET_GRAVITY * life ** 2 / 8;
    const visible = this.viewFrustum.intersectsSphere(bounds);
    bounds.radius = 12;
    if (!visible) return;
    const effect = this.effectPools.tracer.pop() ?? this.createTracerEffect();
    Object.assign(effect, { age, life, shotId: id, tailTime: 11 / Math.hypot(vx, vy, vz) });
    effect.origin.set(x, y, z);
    effect.velocity.set(vx, vy, vz);
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
    sprite.position.set(x, y, z); sprite.scale.setScalar(size);
    Object.assign(effect, { age: 0, life, size, vx: (this.random() - 0.5) * 0.6, vz: (this.random() - 0.5) * 0.6 });
    this.effects.push(effect);
  }

  spark(x, y, z, force = 1) {
    if (this.effects.length > 140) return;
    const effect = this.effectPools.spark.pop() ?? { mesh: new THREE.Mesh(this.geo.sphere, this.sparkMaterial), type: 'spark' };
    const { mesh } = effect;
    mesh.rotation.set(0, 0, 0);
    mesh.scale.setScalar(.014 * force); mesh.position.set(x, y, z);
    Object.assign(effect, { age: 0, life: .2 + this.random() * .2, vx: (this.random() - .5) * 4 * force, vy: (1 + this.random() * 2) * force, vz: (this.random() - .5) * 4 * force });
    this.effects.push(effect);
  }

  updateEffects(dt) {
    this.bulletMarks.update(dt);
    for (const batch of Object.values(this.effectBatches)) batch.count = 0;
    this.smokeOrder.length = 0;
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
        const head = effect.age;
        const tail = Math.max(0, head - effect.tailTime);
        const positions = effect.mesh.geometry.attributes.position;
        const { origin, velocity } = effect;
        const tx = origin.x + velocity.x * tail, ty = bulletHeight(origin.y, velocity.y, tail), tz = origin.z + velocity.z * tail;
        const hx = origin.x + velocity.x * head, hy = bulletHeight(origin.y, velocity.y, head), hz = origin.z + velocity.z * head;
        positions.setXYZ(0, tx, ty, tz);
        positions.setXYZ(1, hx, hy, hz);
        positions.needsUpdate = true;
        effect.mesh.geometry.boundingSphere.center.set((tx + hx) / 2, (ty + hy) / 2, (tz + hz) / 2);
        effect.mesh.geometry.boundingSphere.radius = Math.hypot(hx - tx, hy - ty, hz - tz) / 2 + .05;
        effect.mesh.material.opacity = alpha * .8;
      } else if (effect.type === 'smoke') {
        effect.mesh.position.x += effect.vx * dt; effect.mesh.position.z += effect.vz * dt; effect.mesh.position.y += dt * 0.8;
        effect.mesh.scale.setScalar(effect.size * (1 + effect.age * 1.5)); effect.mesh.material.opacity = alpha * 0.55;
        const p = effect.mesh.position, view = this.camera.matrixWorldInverse.elements;
        effect.sortDepth = view[2]*p.x + view[6]*p.y + view[10]*p.z + view[14];
        this.smokeOrder.push(effect);
      } else if (effect.type === 'spark' || effect.type === 'shell') {
        effect.vy -= dt * 9.8; effect.mesh.position.x += effect.vx * dt; effect.mesh.position.y += effect.vy * dt; effect.mesh.position.z += effect.vz * dt;
        effect.mesh.rotation.x += dt * (effect.spin || 9); effect.mesh.rotation.z += dt * (effect.spin || 6);
        if (effect.mesh.position.y < .03) { effect.mesh.position.y = .03; effect.vy = Math.abs(effect.vy) * .25; effect.vx *= .72; effect.vz *= .72; }
        if (effect.type === 'spark') effect.mesh.scale.setScalar(.025 * alpha);
      } else if (effect.type === 'light') effect.mesh.intensity = alpha * 18;
      const batch = this.effectBatches[effect.type];
      if (batch && effect.type !== 'smoke' && batch.count < batch.instanceMatrix.count) {
        effect.mesh.updateMatrix();
        batch.setMatrixAt(batch.count++, effect.mesh.matrix);
      }
    }
    // Back-to-front ordering preserves alpha compositing while all puffs share
    // one draw call. Sorting at most 140 records is cheaper than 140 submissions.
    this.smokeOrder.sort((a,b) => a.sortDepth - b.sortDepth);
    const smoke = this.effectBatches.smoke;
    for (const effect of this.smokeOrder) {
      if (smoke.count >= smoke.instanceMatrix.count) break;
      const index = smoke.count++, sprite = effect.mesh;
      sprite.updateMatrix(); smoke.setMatrixAt(index, sprite.matrix);
      smoke.setColorAt(index, sprite.material.color);
      smoke.geometry.attributes.instanceAlpha.setX(index, sprite.material.opacity);
      smoke.geometry.attributes.instanceRotation.setX(index, sprite.material.rotation);
    }
    if (smoke.count) {
      smoke.instanceColor.needsUpdate = true;
      smoke.geometry.attributes.instanceAlpha.needsUpdate = true;
      smoke.geometry.attributes.instanceRotation.needsUpdate = true;
    }
    for (const batch of Object.values(this.effectBatches)) if (batch.count) batch.instanceMatrix.needsUpdate = true;
  }

  createGrenadeMesh() {
    const group = new THREE.Group();
    group.scale.setScalar(1.65);
    const body = new THREE.Mesh(this.geo.cylinder, this.grenadeMaterial);
    body.scale.set(0.088, 0.125, 0.088);
    body.castShadow = !this.lowQuality;
    group.add(body);
    for (const dy of [-0.056, 0.056]) {
      const cap = new THREE.Mesh(this.geo.sphere, this.grenadeMaterial);
      cap.position.y = dy;
      cap.scale.set(0.086, 0.052, 0.086);
      group.add(cap);
    }
    for (const ry of [-0.036, 0, 0.036]) {
      const rib = new THREE.Mesh(this.geo.cylinder, this.materials.steel);
      rib.position.y = ry;
      rib.scale.set(0.094, 0.012, 0.094);
      group.add(rib);
    }
    const band = new THREE.Mesh(this.geo.cylinder, this.materials.stripe);
    band.position.y = 0.022;
    band.scale.set(0.095, 0.015, 0.095);
    group.add(band);
    const neck = new THREE.Mesh(this.geo.cylinder, this.materials.steel);
    neck.position.y = 0.088;
    neck.scale.set(0.038, 0.038, 0.038);
    group.add(neck);
    const fuze = new THREE.Mesh(this.geo.box, this.materials.steel);
    fuze.position.set(0, 0.112, -0.008);
    fuze.scale.set(0.055, 0.034, 0.068);
    group.add(fuze);
    const spoon = new THREE.Mesh(this.geo.box, this.materials.steel);
    spoon.position.set(0, 0.035, 0.072);
    spoon.rotation.x = 0.16;
    spoon.scale.set(0.026, 0.135, 0.014);
    group.add(spoon);
    const led = new THREE.Mesh(this.geo.sphere, this.grenadeLedMaterial);
    led.position.set(0, 0.134, 0);
    led.scale.setScalar(0.028);
    group.add(led);
    return group;
  }

  createRocketVisual(item,time) {
    const model=createGadgetModel('rocket',this.equipmentPalette);
    model.traverse(object=>{if(object.material)object.material=this.getQualityMaterial(object.material);});
    model.position.set(item.x,item.y,item.z);model.rotation.order='YXZ';
    model.rotation.y=Math.atan2(-item.vx,-item.vz);model.rotation.x=Math.atan2(item.vy,Math.hypot(item.vx,item.vz));
    const exhaust=new THREE.Mesh(this.geo.sphere,this.rocketGlowMaterial);
    exhaust.name='rocket-exhaust';exhaust.position.z=.30;exhaust.scale.set(.055,.055,.22);model.add(exhaust);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(32*3),3).setUsage(THREE.DynamicDrawUsage));geometry.setDrawRange(0,0);
    const line=new THREE.Line(geometry,this.rocketTrailMaterial);line.frustumCulled=false;
    model.userData.flight={line,exhaust,from:model.position.clone(),to:model.position.clone(),phase:0,interval:1/20,sampleTime:time,
      samples:[],smokePosition:model.position.clone(),impact:null};
    this.worldRoot.add(model,line);this.rocketMeshes.set(item.id,model);return model;
  }

  syncRockets(state,dt) {
    const active=new Set();
    for(const item of state.rockets??[]){
      active.add(item.id);
      const model=this.rocketMeshes.get(item.id)??this.createRocketVisual(item,state.time),flight=model.userData.flight;
      if(flight.sampleTime!==state.time){
        flight.from.copy(model.position);flight.to.set(item.x,item.y,item.z);flight.phase=0;
        flight.interval=clamp(state.time-flight.sampleTime,1/60,.075);flight.sampleTime=state.time;
      }
      flight.phase+=dt;model.position.lerpVectors(flight.from,flight.to,clamp(flight.phase/flight.interval,0,1));
      model.rotation.y=Math.atan2(-item.vx,-item.vz);model.rotation.x=Math.atan2(item.vy,Math.hypot(item.vx,item.vz));
      model.visible=true;flight.exhaust.visible=true;
      const flicker=1+Math.sin(this.clock*90)*.12;
      flight.exhaust.scale.set(.055*flicker,.055*flicker,.20*flicker);
      if(flight.smokePosition.distanceToSquared(model.position)>2.6**2&&this.effects.length<110&&this.camera.position.distanceToSquared(model.position)<160**2){
        this.smoke(model.position.x,model.position.y,model.position.z,.24,.55,0xbcb8ad);flight.smokePosition.copy(model.position);
      }
    }
    for(const [id,model] of this.rocketMeshes){
      const flight=model.userData.flight;
      if(!active.has(id)){
        flight.impact??={x:model.position.x,y:model.position.y,z:model.position.z,at:this.clock};
        const impact=flight.impact,progress=clamp((this.clock-impact.at)/.05,0,1);
        model.position.set(lerp(flight.from.x,impact.x,progress),lerp(flight.from.y,impact.y,progress),lerp(flight.from.z,impact.z,progress));
        model.visible=progress<1;flight.exhaust.visible=false;
        if(progress===1&&impact.event&&!impact.rendered){this.explosionVisual(impact.event,state);impact.rendered=true;}
        if(this.clock-impact.at>.45){flight.line.removeFromParent();flight.line.geometry.dispose();model.removeFromParent();this.rocketMeshes.delete(id);continue;}
      }
      const samples=flight.samples,last=samples[samples.length-1];
      if(!last||Math.hypot(last.x-model.position.x,last.y-model.position.y,last.z-model.position.z)>.6){
        samples.push({x:model.position.x,y:model.position.y,z:model.position.z,at:this.clock});
      }
      while(samples.length&&(this.clock-samples[0].at>.4||samples.length>31))samples.shift();
      const attribute=flight.line.geometry.attributes.position;
      attribute.setXYZ(0,model.position.x,model.position.y,model.position.z);
      for(let i=0;i<samples.length;i++){const p=samples[samples.length-1-i];attribute.setXYZ(i+1,p.x,p.y,p.z);}
      attribute.needsUpdate=true;flight.line.geometry.setDrawRange(0,samples.length+1);flight.line.visible=samples.length>1;
    }
  }

  syncEquipment(state,localId,dt) {
    const local=state.players.find(player=>player.id===localId),revivable=new Set();
    if(local?.alive&&local.classId==='medic'&&!local.vehicleId){
      for(const ally of state.players){
        if(ally.alive||ally.team!==local.team||ally.respawnIn<=0||Math.hypot(ally.x-local.x,ally.z-local.z)>30)continue;
        revivable.add(ally.id);
        let ring=this.reviveRings.get(ally.id);
        if(!ring){ring=new THREE.Mesh(this.geo.gadgetRing,this.reviveMaterial);ring.rotation.x=-Math.PI/2;this.worldRoot.add(ring);this.reviveRings.set(ally.id,ring);}
        ring.visible=true;ring.position.set(ally.x,ally.y+.035,ally.z);ring.scale.setScalar(.65+Math.sin(this.clock*5)*.035);
      }
    }
    for(const [id,ring] of this.reviveRings)if(!revivable.has(id)){ring.removeFromParent();this.reviveRings.delete(id);}
    const sync=(items,cache,kindOf)=>{
      const active=new Set();
      for(const item of items){
        active.add(item.id);let model=cache.get(item.id);
        if(!model){
          model=createGadgetModel(kindOf(item),this.equipmentPalette);
          if(item.kind==='beacon'){
            const led=new THREE.Mesh(this.geo.sphere,this.getQualityMaterial(item.team===1?this.gadgetAssets.team1:this.gadgetAssets.team0));
            led.name='equipment-status';led.position.set(.06,.34,-.14);led.scale.setScalar(.022);model.add(led);
          }
          model.traverse(object=>{if(object.material)object.material=this.getQualityMaterial(object.material);});
          cache.set(item.id,model);this.worldRoot.add(model);
        }
        model.visible=true;
        const led=model.getObjectByName('equipment-status');if(led)led.visible=Math.sin(this.clock*4.5)>-.2;
        // The medical case is authored around its centre; its base must rest
        // on the same authoritative support height as the ammo box.
        model.position.set(item.x,item.y+(item.kind==='medkit'?.08:0),item.z);
        model.rotation.order='YXZ';
        model.rotation.y=item.yaw??Math.atan2(-item.vx,-item.vz);
        if(item.vy!==undefined)model.rotation.x=Math.atan2(item.vy,Math.hypot(item.vx,item.vz));
      }
      for(const [id,model] of cache)if(!active.has(id)){model.removeFromParent();cache.delete(id);}
    };
    sync(state.deployables??[],this.equipmentMeshes,item=>item.kind);
    this.syncRockets(state,dt);
    for(const player of state.players){
      if(player.alive&&player.gadgetAction==='repair'&&this.random()<dt*16){
        const vehicle=state.vehicles?.find(item=>item.id===player.gadgetTargetId);
        if(vehicle){
          const dx=player.x-vehicle.x,dz=player.z-vehicle.z,length=Math.max(.1,Math.hypot(dx,dz));
          this.spark(vehicle.x+dx/length,vehicle.y+.8,vehicle.z+dz/length,.6);
        }
      }
    }
    const active=new Set();
    for(const player of state.players){
      if(player.id===localId)continue;
      const soldier=this.soldiers.get(player.id);
      if(!soldier)continue;
      soldier.rifle.scale.setScalar(1);
      const kind=player.heldGadget??player.gadgetAction;
      if(!player.alive||!kind||!soldier.group.parent)continue;
      active.add(player.id);
      let model=this.remoteTools.get(player.id);
      if(model?.userData.kind!==kind){
        model?.removeFromParent();
        model=createGadgetModel(kind,this.equipmentPalette);model.userData.kind=kind;
        model.traverse(object=>{if(object.material)object.material=this.getQualityMaterial(object.material);});
        this.remoteTools.set(player.id,model);
      }
      if(model.parent!==soldier.group)soldier.group.add(model);
      model.position.set(.10,(player.crouch?.86:1.22),-.30);
      model.rotation.set(player.pitch??0,0,0);
      model.scale.setScalar(kind==='beacon'?.4:kind==='ammo'?.75:1);
      soldier.rifle.scale.setScalar(.001);soldier.flash.visible=false;
      const flame=model.getObjectByName('tool-flame');
      if(flame){flame.visible=player.gadgetAction==='repair';flame.scale.setScalar(.8+Math.sin(this.clock*43)*.15);}
    }
    for(const [id,model] of this.remoteTools)if(!active.has(id)){model.removeFromParent();this.remoteTools.delete(id);}
  }

  updateGrenades(state, localId) {
    const active = this.activeGrenades;
    active.clear();
    const localPlayer = state.players?.find(p => p.id === localId);
    this.grenadeLedMaterial.emissiveIntensity = 0.5 + (Math.sin(this.clock * 22) + 1) * 1.25;
    for (const grenade of state.grenades || []) {
      active.add(grenade.id);
      let mesh = this.grenadeMeshes.get(grenade.id);
      if (!mesh) {
        mesh = this.createGrenadeMesh();
        this.worldRoot.add(mesh);
        this.grenadeMeshes.set(grenade.id, mesh);
      }
      const numId = Number(String(grenade.id).replace(/\D+/g, '')) || 0;
      const fuse = grenade.fuse ?? 1.8;
      const age = clamp(1.8 - fuse, 0, 1.8);
      const ownFresh = grenade.ownerId === localId && localPlayer && age < 0.28;
      mesh.visible = true;
      let gx = grenade.x, gy = grenade.y, gz = grenade.z;
      if (ownFresh) {
        const releaseBlend = 1 - clamp(age / 0.28, 0, 1);
        const yaw = localPlayer.yaw || 0;
        const rightX = Math.cos(yaw), rightZ = -Math.sin(yaw);
        gx -= rightX * 0.18 * releaseBlend;
        gy -= 0.08 * releaseBlend;
        gz -= rightZ * 0.18 * releaseBlend;
      }
      mesh.position.set(gx, gy, gz);
      mesh.rotation.set(this.clock * 9.5 + numId, this.clock * 6.2 + numId * 0.7, this.clock * 7.4);
      if (!this.lowQuality && ((this.frameCount + numId) % 3 === 0)) {
        this.smoke(gx, gy, gz, 0.2, 0.35, 0x8d9087);
      }
    }
    for (const [id, mesh] of this.grenadeMeshes) if (!active.has(id)) { mesh.removeFromParent(); this.grenadeMeshes.delete(id); }
  }

  updatePixelRatio() {
    const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 1.5);
    const ratio = this.gfx.resolution !== 'auto'
      ? clamp(Number(this.gfx.resolution) || 1, 0.5, 2)
      : this.lowQuality
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

  applyShadows() {
    const mode = this.gfx.shadows;
    const level = mode === 'auto' ? (this.lowQuality ? 'off' : (this.integratedGpu ? 'medium' : 'high')) : mode;
    const size = { low: 512, medium: 1024, high: 2048 }[level] || 0;
    const on = size > 0;
    this.renderer.shadowMap.enabled = on;
    this.sun.castShadow = on;
    if (on && size !== this.shadowMapSize) {
      this.shadowMapSize = size;
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.dispose();
      this.lastShadowTx = undefined;
    }
    if (on) {
      this.sun.shadow.needsUpdate = true;
      this.renderer.shadowMap.needsUpdate = true;
    }
  }

  applyQuality(low) {
    this.lowQuality = low;
    this.adaptiveScale = 1;
    this.applyShadows();
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

  updateSunShadow(anchorX = 0, anchorZ = 0) {
    const texelSize = (this.shadowExtent * 2) / this.shadowMapSize;
    const texel = texelSize*Math.ceil(4/texelSize);
    const rx = Math.round((anchorX * this.sunRight.x + anchorZ * this.sunRight.z) / texel) * texel;
    const ry = Math.round((anchorX * this.sunUp.x + anchorZ * this.sunUp.z) / texel) * texel;
    const rz = Math.round((anchorX * this.sunForward.x + anchorZ * this.sunForward.z) / 2) * 2;
    const tx = rx * this.sunRight.x + ry * this.sunUp.x + rz * this.sunForward.x;
    const ty = rx * this.sunRight.y + ry * this.sunUp.y + rz * this.sunForward.y;
    const tz = rx * this.sunRight.z + ry * this.sunUp.z + rz * this.sunForward.z;
    if (this.lastShadowTx !== tx || this.lastShadowTz !== tz) {
      this.lastShadowTx = tx;
      this.lastShadowTz = tz;
      this.sun.target.position.set(tx, ty, tz);
      this.sun.position.set(tx + this.sunOffset.x, ty + this.sunOffset.y, tz + this.sunOffset.z);
      this.sun.updateMatrixWorld(true);
      this.sun.target.updateMatrixWorld(true);
    }
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
      if (this.renderer.shadowMap.enabled) {
        this.sun.shadow.needsUpdate = true;
        this.renderer.shadowMap.needsUpdate = true;
      }
    }
    if(!menu)this.interiorVisibility.apply(this);
    try{drawWorldAndViewModel(this.renderer, this.scene, this.camera, this.weapon, this.worldRoot);}
    finally{this.interiorVisibility.restore();}
  }

  placeVehicleCamera({ vehicle, rig }, seat, yaw, pitch, shake) {
    const humvee = vehicle.type === 'humvee';
    const index=VEHICLE_TYPES[vehicle.type].seats.indexOf(seat);
    const eye=getVehicleSeatPose({ ...vehicle,x:rig.group.position.x,y:rig.group.position.y,z:rig.group.position.z,yaw:rig.group.rotation.y },index);
    this.camera.position.set(eye.x,eye.y,eye.z);
    if (shake && seat.role==='driver') this.camera.position.y += Math.sin(this.clock * 28) * Math.min(.012, Math.abs(vehicle.speed) * .001) * (humvee ? .65 : 1);
    const gunner = seat.role === 'gunner';
    const roll = shake && seat.role==='driver' ? rig.body.rotation.z * (humvee ? .62 : 1) : 0;
    this.camera.rotation.set(gunner ? clamp(pitch, TURRET_MIN_PITCH, TURRET_MAX_PITCH) : pitch, yaw, roll, 'YXZ');
    this.cameraPlayerId = null;
    this.cameraAlive = true;
    this.updateSunShadow(vehicle.x, vehicle.z);
  }

  render(state, localId, dt, view = {}) {
    this.setMap(state?.mapId ?? view.mapId);
    const rawDt = dt || 0.016;
    dt = Math.min(rawDt, 0.1); this.clock += dt;
    this.scoped = false;
    if (this.map.shoreX !== undefined && this.portWater) {
      this.portWater.offset.set((this.clock * .011) % 1, (this.clock * .017) % 1);
    }
    const low = view.quality === 'low';
    if (this.lowQuality !== low) {
      this.applyQuality(low);
    }
    const gfx = view.gfx;
    if (gfx && (gfx.shadows !== this.gfx.shadows || gfx.resolution !== this.gfx.resolution)) {
      this.gfx = { shadows: gfx.shadows, resolution: gfx.resolution };
      this.applyShadows();
      this.updatePixelRatio();
    }
    if (low && this.gfx.resolution === 'auto' && rawDt > 0.004 && rawDt < 0.09) {
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
      if (this.vehicleRigs.size) this.clearVehicles();
      const angle = this.clock * 0.012, radius = this.map.terrain ? this.map.size * .29 : 130;
      if (this.map.shoreX !== undefined) {
        this.camera.position.set(-136 + Math.sin(angle - .6) * 86, 68 + Math.sin(this.clock * .025) * 7, 26 + Math.cos(angle - .6) * 122);
        this.camera.lookAt(-73, 4, 4);
      } else {
        this.camera.position.set(Math.sin(angle + .9) * radius, 94 + Math.sin(this.clock * .025) * 8, Math.cos(angle + .9) * radius);
        this.camera.lookAt(0, 3, -12);
      }
      this.weapon.visible = false;
      this.viewWeaponTarget = null;
      this.atmosphere.sky.position.copy(this.camera.position);
      if (this.camera.fov !== 70 || this.camera.near !== 2) {
        this.camera.fov = 70;
        this.camera.near = 2;
        this.camera.updateProjectionMatrix();
      }
      this.updateSunShadow(0, 0);
      for (const soldier of this.soldiers.values()) soldier.group.visible = false;
      for (const grenade of this.grenadeMeshes.values()) grenade.visible = false;
      for(const cache of [this.equipmentMeshes,this.rocketMeshes,this.reviveRings])for(const model of cache.values())model.visible=false;
      for(const model of this.rocketMeshes.values())model.userData.flight.line.visible=false;
      this.updateEffects(dt);
      this.drawScene(true); return;
    }
    if (this.lastStateTime !== undefined && state.time < this.lastStateTime - 1) {
      this.bulletMarks.clear();
      for (const f of this.flags.values()) { f.fromOwned = false; f.neutralH = 1; f.teamH = 0; }
    }
    this.lastStateTime = state.time;
    for (const event of state.events || []) {
      if (event.playerId === localId) {
        const key = event.id ?? `${event.type}:${event.playerId}:${event.time}:${event.x}:${event.z}`;
        if (!this.seenEvents.has(key)) {
          if (event.type === 'grenade') this.throwTimer = this.throwDuration;
          else if (event.type === 'gadget') this.gadgetTimer = this.gadgetDuration;
        }
      }
    }
    this.throwTimer = Math.max(0, this.throwTimer - dt);
    const player = state.players.find(p => p.id === localId);
    const gadgetKind=player?.heldGadget??player?.gadgetAction??null;
    this.gadgetDuration=gadgetKind==='launcher'?1.05:gadgetKind==='defibrillator'?.7:gadgetKind==='medkit'?.85:.75;
    this.gadgetTimer=player?.gadgetActionRemaining??0;
    const throwPhase = this.throwTimer > 0 ? 1 - this.throwTimer / this.throwDuration : 0;
    const gadgetPhase=(player?.heldGadget||gadgetKind==='repair') ? .5 : this.gadgetTimer>0?clamp(1-this.gadgetTimer/this.gadgetDuration,.001,.999):0;
    const isAlive = player?.alive !== false;
    const mounted = this.updateVehicles(state, player, dt, view);
    const seat = mounted && VEHICLE_TYPES[mounted.vehicle.type].seats[player.vehicleSeat];
    const passenger = seat?.role === 'passenger';
    if (player && !isAlive) {
      const focusX = view.deployTarget?.x ?? player.x ?? 0;
      const focusZ = view.deployTarget?.z ?? player.z ?? 0;
      const orbit = this.clock * 0.08;
      const desiredX = focusX + Math.sin(orbit) * 32;
      const ground = this.map.terrain?.heightAt(focusX, focusZ) ?? 0;
      const desiredY = ground + 46;
      const desiredZ = focusZ + Math.cos(orbit) * 32;
      if (this.cameraAlive !== false) {
        this.camera.position.set(player.x, (player.y ?? 0) + 4, player.z + 6);
      }
      const pan = 1 - Math.exp(-dt * 4.5);
      this.camera.position.x = lerp(this.camera.position.x, desiredX, pan);
      this.camera.position.y = lerp(this.camera.position.y, desiredY, pan);
      this.camera.position.z = lerp(this.camera.position.z, desiredZ, pan);
      this.camera.lookAt(focusX, ground + 1.5, focusZ);
      this.cameraPlayerId = localId;
      this.cameraAlive = false;
      this.weapon.visible = false;
      this.viewWeaponTarget = null;
      if (Math.abs(this.camera.fov - 65) > 0.1 || this.camera.near !== 0.5) {
        this.camera.fov = 65;
        this.camera.near = 0.5;
        this.camera.updateProjectionMatrix();
      }
      this.updateSunShadow(focusX, focusZ);
    } else if (mounted && !passenger) {
      this.placeVehicleCamera(mounted, seat, view.yaw ?? player.yaw, view.pitch ?? player.pitch, shake);
      this.weapon.visible = false;
      this.viewWeaponTarget = null;
      this.wallStow = this.aimAmount = this.sprintBlend = 0;
      if (Math.abs(this.camera.fov - baseFov) > .03 || this.camera.near !== .045) {
        this.camera.fov = baseFov;
        this.camera.near = .045;
        this.camera.updateProjectionMatrix();
      }
    } else if (player) {
      const activeWeaponId = player.weaponId || defaultWeaponId(player.classId);
      if (this.viewWeaponTarget !== activeWeaponId || this.viewWeaponPlayer !== player.id) {
        this.weaponSwitch = player.equipTime > 0 && this.viewWeaponPlayer === player.id && this.viewWeaponTarget
          ? { from: this.presentedWeaponId, left: player.equipTime } : null;
        this.viewWeaponPlayer = player.id;
        this.viewWeaponTarget = activeWeaponId;
        this.kick = 0;
      }
      const swap = this.weaponSwitch;
      if (swap) {
        swap.left = Math.max(0, swap.left - dt);
        if (swap.left === 0) this.weaponSwitch = null;
      }
      const {stowing,lowered:gunLowered}=weaponSwitchPose(swap?.left);
      const lowered=Math.max(gunLowered,!swap?clamp(player.equipTime/.32,0,1):0);
      this.presentedWeaponId = stowing ? swap.from : activeWeaponId;
      const pistol = getWeapon(player.classId, this.presentedWeaponId).sidearm;
      const yaw = view.yaw ?? player.yaw ?? 0, pitch = view.pitch ?? player.pitch ?? 0;
      const sliding = !passenger && Boolean(player.sliding);
      const crouching = !passenger && Boolean(sliding || player.crouch || player.crouching || view.crouch);
      const targetHeight = crouching ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
      this.eyeHeight=lerp(this.eyeHeight??targetHeight,targetHeight,1-Math.exp(-dt*20));
      this.slideBlend=lerp(this.slideBlend??0,sliding?1:0,1-Math.exp(-dt*16));
      const height=this.eyeHeight;
      const passengerCanFire = passenger && canFirePassengerWeapon(mounted.vehicle, player.vehicleSeat, yaw, pitch);
      const coverDistance = passenger ? 1.6 : distanceToCover(
        { x: player.x, y: (player.y || 0) + height, z: player.z },
        { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) }, getAssetColliders(this.map), 1.6,
      );
      const stow = passenger && !passengerCanFire ? .65 : clamp((1.45 - coverDistance) / 1.05, 0, 1);
      this.wallStow = lerp(this.wallStow, stow, 1 - Math.exp(-dt * 14));
      this.aimAmount = lerp(this.aimAmount, view.aim && isAlive && !this.weaponSwitch && !player.reloading && this.throwTimer <= 0 && (player.heldGadget||this.gadgetTimer<=0) && this.wallStow < .2 ? 1 : 0, 1 - Math.exp(-dt * 15));
      const scopedWeapon = !gadgetKind&&player.classId === 'recon' && !pistol && !this.weaponSwitch;
      this.scoped = isAlive && scopedWeapon && this.aimAmount >= .92;
      this.reloadAmount = lerp(this.reloadAmount, player.reloading ? 1 : 0, 1 - Math.exp(-dt * 12));
      const weapon = getWeapon(player.classId, player.weaponId);
      const observedReload = Number.isFinite(player.reloadProgress) ? player.reloadProgress : null;
      if (player.reloading && (!this.wasReloading || this.lastReloadProgress !== observedReload)) {
        if (!this.wasReloading || observedReload !== null) this.reloadStarted = this.clock - (observedReload ?? 0) * weapon.reload;
        this.lastReloadProgress = observedReload;
      }
      this.wasReloading = !!player.reloading;
      const reloadPhase = player.reloading ? clamp((this.clock - (this.reloadStarted ?? this.clock)) / weapon.reload, 0, 1) : 1;
      const reloadMotion = Math.sin(reloadPhase * Math.PI) * this.reloadAmount;
      const moving = passenger ? 0 : clamp(Number(view.move) || 0, 0, 1);
      const grounded = player.grounded !== false;
      const sprint = !crouching && !sliding && view.sprint && !view.aim && moving > .1 && !player.reloading;
      this.handlingMove = lerp(this.handlingMove, grounded && !sliding ? moving : 0, 1 - Math.exp(-dt * 9));
      this.sprintBlend = lerp(this.sprintBlend, sprint ? 1 : 0, 1 - Math.exp(-dt * 11));
      this.strafeBlend = lerp(this.strafeBlend, passenger ? 0 : Number(view.strafe) || 0, 1 - Math.exp(-dt * 9));
      if (grounded && !this.previousGrounded) this.landDip = .09;
      this.previousGrounded = grounded;
      this.landDip *= Math.exp(-dt * 12);
      this.handlingCycle += dt * lerp(crouching ? 7 : 10, 12, this.sprintBlend);
      const cycle = this.handlingCycle;
      const bob = this.handlingMove * (1 - this.aimAmount * .84) * (crouching ? .65 : 1);
      const target = this.scratchPosition.set(player.x, player.y || 0, player.z);
      // Smooth authoritative 20 Hz movement without delaying mouse look. A
      // respawn/teleport must never drag the camera across the entire map.
      if (passenger) {
        this.placeVehicleCamera(mounted, seat, yaw, pitch, shake && !this.scoped);
        if (this.scoped) {
          const eye = getVehicleSeatPose(mounted.vehicle, player.vehicleSeat);
          this.camera.position.set(eye.x, eye.y, eye.z);
        }
      } else {
        if (this.cameraPlayerId !== localId || this.cameraAlive !== isAlive || this.cameraAnchor.distanceToSquared(target) > 64) {
          this.cameraAnchor.copy(target);
          this.lastYaw = yaw; this.lastPitch = pitch;
        } else if(view.networkInterpolated)this.cameraAnchor.copy(target);
        else this.cameraAnchor.lerp(target, 1 - Math.exp(-dt * 28));
        this.cameraPlayerId = localId; this.cameraAlive = isAlive;
        const anchor = this.scoped ? target : this.cameraAnchor;
        const sway = shake && !this.scoped;
        this.camera.position.set(anchor.x, anchor.y + height + (sway ? Math.sin(cycle * 2) * .016 * bob - this.landDip * .4 : 0), anchor.z);
        this.camera.rotation.set(pitch, yaw, sway ? Math.sin(cycle) * .003 * bob - this.strafeBlend * .005 + this.slideBlend*.018 : 0, 'YXZ');
        this.updateSunShadow(this.cameraAnchor.x, this.cameraAnchor.z);
      }
      this.kick = Math.max(view.recoil || 0, this.kick * Math.exp(-dt * 16));
      if (player.shotSeq !== undefined && player.shotSeq !== this.lastShot) {
        if (this.lastShot !== -1) this.kick = 1;
        this.lastShot = player.shotSeq;
      }
      const aimFov = scopedWeapon
        ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(baseFov) / 2) / (player.weaponId === 'sv98' ? clamp(Number(view.scopeZoom) || 8, 6, 12) : 4)))
        : baseFov - (gadgetKind==='launcher'?30:gadgetKind?10:pistol?13:23);
      const fov = lerp(baseFov + this.sprintBlend * 6 + this.slideBlend*3, aimFov, this.aimAmount);
      if (Math.abs(this.camera.fov - fov) > 0.03 || this.camera.near !== .045) {
        this.camera.fov = fov;
        this.camera.near = .045;
        this.camera.updateProjectionMatrix();
      }
      this.swayX = lerp(this.swayX, clamp(Math.atan2(Math.sin(yaw - this.lastYaw), Math.cos(yaw - this.lastYaw)) * 1.3, -0.025, 0.025), 0.18);
      this.swayY = lerp(this.swayY, clamp((pitch - this.lastPitch) * 1.3, -0.02, 0.02), 0.18);
      this.lastYaw = yaw; this.lastPitch = pitch;
      this.weapon.visible = isAlive && !this.scoped;
      this.weaponRig.update({
        classId: player.classId,
        team: player.team,
        weaponId: this.presentedWeaponId,
        aim: this.aimAmount,
        reloadMotion,
        reloadPhase,
        reloadEmpty: player.ammo === 0,
        kick: this.kick,
        clock: this.clock,
        throwPhase,
        gadgetPhase,
        gadgetKind,
        toolActive:Boolean(player.gadgetAction),
        toolProgress:clamp(1-this.gadgetTimer/this.gadgetDuration,0,1),
      });
      const kick = this.kick * clamp(weapon.recoil / .019, .7, 1.65);
      const actionTilt = Math.sin(Math.max(throwPhase, player.heldGadget?0:gadgetPhase) * Math.PI);
      const closeOptic=!pistol&&!scopedWeapon&&['reflex','compact'].includes(this.weaponRig.sightType);
      const adsZ=pistol?-.46:scopedWeapon?-.32:closeOptic?-.13:-.27;
      this.weapon.position.set(
        lerp(pistol ? .15 : .26, 0, this.aimAmount) + Math.sin(cycle) * .015 * bob - this.swayX + this.sprintBlend * .035 + actionTilt * .055 + lowered * .06,
        lerp(pistol ? -.105 : -.23, pistol ? -this.weaponRig.pistolSightHeight : -.167, this.aimAmount) + Math.cos(cycle * 2) * .01 * bob - this.swayY - reloadMotion * .10 - this.sprintBlend * .07 - this.landDip * .75 - actionTilt * .065 - lowered * .42,
        lerp(pistol ? -.50 : -.42, adsZ, this.aimAmount) + kick * .056 + reloadMotion * .06 + actionTilt * .04 + lowered * .14,
      );
      this.weapon.rotation.set(
        kick * (pistol ? .089 : .062) - reloadMotion * .39 - this.sprintBlend * .25 + Math.cos(cycle) * bob * .022 - actionTilt * .18 - lowered * .72,
        -reloadMotion * .22 + this.sprintBlend * .34 + this.strafeBlend * .028 * (1 - this.aimAmount) - actionTilt * .22,
        -reloadMotion * .47 + this.sprintBlend * .24 + Math.sin(cycle) * bob * .018 - actionTilt * .36 + lowered * .24,
      );
      if(gadgetKind){
        const launcher=gadgetKind==='launcher';
        const framing=launcher?LAUNCHER_POSE:(gadgetKind==='ammo'||gadgetKind==='medkit')?SUPPLY_POSE:null;
        this.weapon.position.set(
          lerp(framing?.hip[0]??.08,framing?.ads[0]??.02,this.aimAmount)+Math.sin(cycle)*.007*bob-this.swayX,
          lerp(framing?.hip[1]??-.27,framing?.ads[1]??-.22,this.aimAmount)-this.landDip*.4-lowered*.42,
          lerp(framing?.hip[2]??-.43,framing?.ads[2]??-.39,this.aimAmount)+kick*.075+lowered*.14,
        );
        this.weapon.rotation.set(kick*.09+Math.cos(cycle)*bob*.009-lowered*.4,-this.swayX*.3,Math.sin(cycle)*bob*.008);
      }
      this.weapon.position.y -= this.wallStow * .28; this.weapon.position.z += this.wallStow * .18; this.weapon.rotation.x -= this.wallStow * .85;
    }
    this.camera.updateMatrixWorld();
    this.viewProjection.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.viewFrustum.setFromProjectionMatrix(this.viewProjection);
    for (const point of state.points || []) {
      const flag = this.flags.get(point.id); if (!flag) continue;
      const color = point.owner === -1 || point.owner == null ? COLORS.neutral : (TEAM_COLORS[point.owner] ?? COLORS.neutral);
      flag.ring.material.color.setHex(color); flag.label.material.color.setHex(color);
      flag.ring.material.opacity = point.contested ? 0.22 + Math.sin(this.clock * 8) * 0.12 : 0.19;
      // Battlefield-style flag: neutral flag drops during the first half of a capture,
      // then the capturing team's flag rises. Capturing an owned point lowers the
      // defenders' flag first and then raises the attackers'.
      const progress = point.progress || 0, magnitude = Math.min(1, Math.abs(progress));
      const sideTeam = progress < 0 ? 0 : 1;
      let neutralTarget = 0, teamTarget = 0, teamIdx = sideTeam;
      if (point.owner === 0 || point.owner === 1) {
        flag.fromOwned = true;
        teamTarget = magnitude;
        teamIdx = point.owner;
      } else if (flag.fromOwned) {
        teamTarget = magnitude;
      } else {
        neutralTarget = clamp(1 - magnitude * 2, 0, 1);
        teamTarget = clamp(magnitude * 2 - 1, 0, 1);
      }
      const follow = 1 - Math.exp(-dt * 6);
      flag.neutralH = lerp(flag.neutralH, neutralTarget, follow);
      flag.teamH = lerp(flag.teamH, teamTarget, follow);
      setFlagColor(flag.teamFlag, 0xffffff);
      setFlagMap(flag.teamFlag, this.flagLogos[teamIdx]);
      setFlagColor(flag.flag, COLORS.neutral);
      for (const [mesh, h] of [[flag.flag, flag.neutralH], [flag.teamFlag, flag.teamH]]) {
        const visible = h > 0.015;
        mesh.visible = visible;
        if (!visible) continue;
        mesh.position.y = lerp(FLAG_LOW, FLAG_HIGH, h);
        mesh.updateMatrix();
        mesh.matrixWorld.multiplyMatrices(flag.group.matrixWorld, mesh.matrix);
      }
      this.flagBounds.center.set(point.x, (point.y ?? 0) + 3, point.z);
      if (this.camera.position.distanceToSquared(this.flagBounds.center) < 95 * 95 && this.viewFrustum.intersectsSphere(this.flagBounds)) {
        for (const mesh of [flag.flag, flag.teamFlag]) {
          if (!mesh.visible) continue;
          const positions = mesh.geometry.attributes.position;
          for (let i = 0; i < positions.count; i++) { const x = positions.getX(i) + 0.775; positions.setZ(i, Math.sin(this.clock * 3.5 + x * 4) * 0.09 * x); }
          positions.needsUpdate = true;
        }
      }
    }
    this.updateSoldiers(state, localId, dt, view.networkInterpolated); this.updateGrenades(state, localId); this.processEvents(state, localId); this.syncEquipment(state,localId,dt); this.updateEffects(dt);
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
    this.cachedShadows.dispose();
    this.bulletMarks.dispose();
    this.clearVehicles();
    const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
    const collect = object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.skeleton) skeletons.add(object.skeleton);
      for (const mat of object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []) {
        materials.add(mat); for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
      }
    };
    this.scene.traverse(collect);
    for(const template of gadgetTemplates(this.equipmentPalette))template.traverse(collect);
    for (const world of this.worlds.values()) if (!world.root.parent) world.root.traverse(collect);
    for (const soldier of this.soldiers.values()) if (!soldier.group.parent) soldier.group.traverse(collect);
    for (const soldier of this.soldierTemplates.values()) {
      soldier.group.traverse(collect);
      geometries.add(soldier.distantGeometry);
      geometries.add(soldier.mediumGeometry);
    }
    for (const pool of Object.values(this.effectPools)) for (const effect of pool) collect(effect.mesh);
    if (this.soldierAtlas) {
      materials.add(this.soldierAtlas);
      for (const value of Object.values(this.soldierAtlas)) if (value?.isTexture) textures.add(value);
    }
    textures.add(this.smokeTexture);
    materials.add(this.grenadeMaterial);
    materials.add(this.reviveMaterial);
    materials.add(this.rocketGlowMaterial);materials.add(this.rocketTrailMaterial);
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
    skeletons.forEach(skeleton => skeleton.dispose());
    this.weaponRig?.dispose?.();
    this.atmosphere.target.dispose();
    this.renderer.dispose();
  }
}
