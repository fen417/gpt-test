import {batchStaticWorld} from './static-batching.js';
import {applyTextureFiltering} from './texture-quality.js';
import {applyPistolSprintPose} from './pistol-pose.js';
import * as THREE from 'three';
import { CachedShadows } from './cached-shadows.js';
import { InfantryAssets } from './infantry-assets.js';
import {GroundShadows} from './ground-shadows.js';
import {PostPass} from './post-pass.js';
import {AdaptiveResolution} from './adaptive-resolution.js';
import { GpuTimer } from './gpu-timer.js';
import { ReloadTimeline } from './reload-timeline.js';
import { InteriorVisibility } from './interior-visibility.js';
import { gadgetPalette, createGadgetModel, gadgetTemplates } from './gadget-models.js';
import { buildSpecialProp, SPECIAL_PROP_KINDS } from '../shared/prop-models.js';
import { getAssetColliders } from '../shared/asset-colliders.js';
import { buildMapScene } from './map-scene.js';
import { VillageModel, dryWindAssets, alhadraAssets } from './village-model.js';
import { hasPortAsset, PortModel } from './port-model.js';
import { ArchitecturalMapModel, lagunaAssets, estateAssets } from './architectural-map-model.js';
import { loadQuarryDetail, disposeQuarryDetail } from './quarry-model.js';
import { addPortLabels, addPortWater } from './port-visuals.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { getMap, CLASSES, CLASS_WEAPONS, SIDEARMS, weaponSwitchPose, getWeapon, defaultWeaponId, CAPTURE_RADIUS, EYE_HEIGHT, CROUCH_EYE_HEIGHT } from '../shared/world.js';
import { BULLET_GRAVITY, bulletHeight } from '../shared/ballistics.js';
import { createSurfaceMaterials, makeSky, makeSign, addSectorInstances, mapSector, pairMaterials, clonePairedMaterial } from './visuals.js';
import { prepareViewModel, distanceToCover, drawWorldAndViewModel } from './viewmodel.js';
import { createWeaponRig } from './weapons.js';
import { SCOPE_ZOOMS, scopeMagnification } from './scope-optics.js';
import {sameSquad} from '../shared/squads.js';
import { LAUNCHER_POSE, SUPPLY_POSE, DEFIB_POSE } from './gadget-poses.js';
import { drawFlagBanner } from './logos.js';
import { canFirePassengerWeapon, getVehicleSeatPose, TURRET_MAX_PITCH, TURRET_MIN_PITCH, VEHICLE_TYPES, isEnclosedTankCrew } from '../shared/vehicles.js';
import { tankMachineGunMuzzle, tankMuzzle, TANK_MG } from '../shared/tank.js';
import { createVehicleRig, disposeVehicleRig, updateVehicleRig, warmTankAssets,tankAssetsReady,placeTankCamera, fallbackRiderVisible } from './vehicles.js';
import { lightVehicleModels } from './light-vehicle-models.js';
import { BulletMarks } from './bullet-marks.js';
import {
  createInfantry, setInfantryWeapon, disposeInfantry, setInfantryLod, updateInfantry,
  infantryHit, infantryAction, infantryDeath, infantrySeat, infantryTurnTolerance,
} from './infantry.js';

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

const optimizedLighting=new WeakSet();
export function optimizeLighting(object) {
  const material=object.material;
  if (!(material?.isMeshStandardMaterial||material?.isMeshLambertMaterial)||optimizedLighting.has(material))return;
  optimizedLighting.add(material);const previous=material.onBeforeCompile;
  material.onBeforeCompile=(shader,renderer)=>{previous.call(material,shader,renderer);boundedPointLights(shader);};
}

function detectIntegratedGpu(renderer) {
  try {
    let gl = renderer?.getContext?.(), temporary=false;
    if (!gl && typeof document !== 'undefined') {
      temporary=true;const probe = document.createElement('canvas');
      probe.width = probe.height = 1;
      gl = probe.getContext('webgl2', { powerPreference: 'high-performance' })
        || probe.getContext('webgl', { powerPreference: 'high-performance' });
    }
    if (!gl) return false;
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const name = `${(debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) || ''} ${gl.getParameter(gl.RENDERER) || ''} ${gl.getParameter(gl.VENDOR) || ''}`;
    if(temporary)gl.getExtension('WEBGL_lose_context')?.loseContext();
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
  constructor(canvas, { onError, antialias = 'auto', webgpu = null } = {}) {
    this.webgpu=webgpu;
    this.api=webgpu?'webgpu':'webgl2';
    this.gpuName=webgpu?.gpuName??null;
    this.canvas = canvas;
    this.perfEnabled=typeof location!=='undefined'&&new URLSearchParams(location.search).has('perf');
    this.gfx = { shadows: 'auto', resolution: 'auto', fsr: 'off', fsrQuality: 'quality', fsrSharpness: 40, frameGeneration:'off' };
    this.clock = 0;
    this.frameCount = 0;
    this.smoothDt = 0.0166;
    this.adaptiveScale = 1;this.resolutionController=new AdaptiveResolution();
    this.scaleCooldown = 0;
    this.soldiers = new Map();
    this.activeSoldiers = new Set();
    this.flags = new Map();
    this.grenadeMeshes = new Map();
    this.activeGrenades = new Set();
    this.vehicleRigs = new Map();
    this.equipmentMeshes = new Map();
    this.rocketMeshes = new Map();
    this.rocketFlareTexture=canvasTexture(32,(ctx,size)=>{const g=ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);g.addColorStop(0,'rgba(255,255,230,1)');g.addColorStop(.2,'rgba(255,207,115,.85)');g.addColorStop(1,'rgba(255,120,30,0)');ctx.fillStyle=g;ctx.fillRect(0,0,size,size);});
    this.rocketFlareMaterial=new THREE.SpriteMaterial({map:this.rocketFlareTexture,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
    this.rocketGlowMaterial=new THREE.MeshBasicMaterial({color:0xffdb8b,toneMapped:false});
    this.rocketTrailMaterial=new THREE.LineBasicMaterial({color:0xddd8c9,transparent:true,opacity:.7,depthWrite:false});
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
    this.cachedShadows=webgpu?{install(){},invalidate(){},disposeTargets(){},dispose(){}}:new CachedShadows();this.interiorVisibility=new InteriorVisibility();
    this.surfaceCache = new Map();
    this.random = seeded();
    const integratedProbe = detectIntegratedGpu();
    try {
      this.renderer = webgpu?.renderer ?? new THREE.WebGLRenderer({
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
    this.gpuTimer=webgpu?new webgpu.GpuTimer(this.renderer):new GpuTimer(this.renderer.getContext());
    this.postPass=webgpu?new webgpu.PostPass(this.renderer,{antialias}):new PostPass(this.renderer,{antialias});
    this.frameGeneration=webgpu?new webgpu.FrameGeneration(this.renderer,this.postPass):null;
    if(this.frameGeneration)this.postPass.frameGeneration=this.frameGeneration;
    if(!webgpu)this.cachedShadows.install(this);
    this.integratedGpu = integratedProbe || detectIntegratedGpu(this.renderer);
    if (!webgpu && canvas && typeof canvas.addEventListener === 'function') {
      canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();
      }, false);
      canvas.addEventListener('webglcontextrestored', () => {
        const enabled=this.gpuTimer.enabled;this.gpuTimer=new GpuTimer(this.renderer.getContext());this.gpuTimer.enabled=enabled;
        this.cachedShadows.disposeTargets();this.cachedShadows.size=null;this.cachedShadows.install(this);
        this.cachedShadows.invalidate();
        this.sun.shadow.needsUpdate = true;
        this.renderer.shadowMap.needsUpdate = true;
      }, false);
    }
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
    this.groundShadows=webgpu?new webgpu.GroundShadows():new GroundShadows();
    this.surfaces = createSurfaceMaterials(this.renderer, { useBump: true, anisotropy:this.maxAnisotropy() });
    this.surfaces.ready.then(()=>{this.surfacesReady=true;}).catch(error=>{this.surfacesReady=true;console.error('Surface assets failed',error);});
    for (const m of [this.surfaces.asphalt, this.surfaces.asphalt._lowMaterial]) {
      if (m) { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2; }
    }
    this.atmosphere = webgpu?webgpu.makeSky(this.scene,this.renderer):makeSky(this.scene, this.renderer);
    this.materials = mapMaterials(this.surfaces);
    this.worldRoot = new THREE.Group();
    this.worldRoot.add(this.atmosphere.sky);
    this.scene.add(this.worldRoot);
    this.worlds = new Map();
    this.villageModel = new VillageModel(this,dryWindAssets);
    this.alhadraModel = new VillageModel(this,alhadraAssets);
    this.portModel = new PortModel(this);
    this.lagunaModel = new ArchitecturalMapModel(this,lagunaAssets);
    this.estateModel = new ArchitecturalMapModel(this,estateAssets);
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
    const smokeMaterial = webgpu?webgpu.createSmokeMaterial(this.smokeTexture):new THREE.ShaderMaterial({
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
    if(!webgpu)this.scene.traverse(optimizeLighting);
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
    for (let i = 0; i < 16; i++) this.effectPools.tracer.push(this.createTracerEffect());
    for (let i = 0; i < 12; i++) this.effectPools.shell.push({ mesh: new THREE.Mesh(this.geo.shell, this.shellMaterial), type: 'shell' });
    for (let i = 0; i < 36; i++) this.effectPools.smoke.push({
      mesh: new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTexture, transparent: true, depthWrite: false })),
      type: 'smoke',
    });
    for (let i = 0; i < 32; i++) this.effectPools.spark.push({ mesh: new THREE.Mesh(this.geo.sphere, this.sparkMaterial), type: 'spark' });

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
    const temp = [sampleGrenade, sampleGadgetGroup, sampleTracer, sampleSmoke, sampleSpark, sampleShell].filter(Boolean);
    for (const node of temp) this.worldRoot.add(node);
    for (const f of this.flags.values()) f.teamFlag.visible = true;
    try {
      if(!this.webgpu)this.renderer.compile(this.scene, this.camera);
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
    if(['quarry','alhadra','alhadra-desert','tel-mazin','safra'].includes(mapId)&&!this.tankWarmup)this.tankWarmup=this.surfaces.ready.then(()=>warmTankAssets(this.renderer,this.scene,this.camera,optimizeLighting)).catch(error=>console.error('Tank assets:',error));
    const map = getMap(mapId);
    if (this.map === map) return;
    for(const type of new Set(map.vehicleSpawns?.map(vehicle=>vehicle.type)))lightVehicleModels[type]?.load();
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
        const model = this.bakedMapModel(map);
        let fallback, portLabels;
        if(model){
          for(const point of map.points)this.makeFlag(point);
          if(model===this.portModel){
            addPortWater(this,map);
            portLabels=new THREE.Group();
            root.add(portLabels);
            this.scene=portLabels;
            addPortLabels(this,map);
          }
          if(model.base)root.add(model.base);
          else if(model===this.villageModel||model===this.alhadraModel){
            fallback=new THREE.Group();
            root.add(fallback);this.scene=fallback;
            buildMapScene(this,map,{skipObjectives:true});
            this.mergeStaticWorld(new Set());
          }
        }else{
          this.buildWorld();
          if(map.theme!=='pool-day')this.mergeStaticWorld(new Set());
        }
        const details=[];
        root.traverse(object=>{if(object.userData.detailLevel&&(object.isMesh||object.children.length))details.push(object);});
        world = { root, flags: this.flags, water: this.portWater, details, model, fallback, portLabels };
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
      if(world.model&&!world.model.base)world.model.loadBase().then(base=>{
        if(world.model.disposed)return;
        if(base)this.installBakedBase(world,base);
        else if(world.model===this.portModel||world.model===this.lagunaModel||world.model===this.estateModel)this.installMapFallback(world,map);
      });
    }
    this.clearVehicles();
    this.clearMapDynamics();
    this.staticRoot?.removeFromParent();
    this.map = map;
    this.scene.fog.density = map.fogDensity ?? .0034;
    this.scene.fog.color.set(map.fogColor ?? 0x9aa7a7);
    this.scene.background.set(map.fogColor ?? 0x9aa7a7);
    // Map-specific light balance: Linden Estate has enclosed rooms and large
    // roof shadows. Neutral daylight + ambient bounce keeps the house legible
    // without overexposing the courtyard. Defaults preserve all other maps.
    this.sun.color.set(map.sunColor ?? 0xffd7a4);
    this.sun.intensity=map.sunIntensity??3.5;
    this.hemiLight.intensity=map.hemisphereLightIntensity??2.0;
    this.ambientLight.intensity=map.ambientLightIntensity??.2;
    this.renderer.toneMappingExposure=map.toneMappingExposure??1.06;
    if(this.webgpu)this.atmosphere.hazeAmount.value=map.theme==='desert-village'?.16:0;
    else this.atmosphere.sky.material.uniforms.hazeAmount.value = map.theme === 'desert-village' ? .16 : 0;
    this.staticRoot = world.root;
    this.mapDetails=world.details;this.detailLevel=undefined;
    this.groundShadows.setMap(map);
    const shadowMaterials=new Map();
    this.staticRoot.traverse(mesh=>{
      if(!mesh.receiveShadow||mesh.castShadow||!mesh.material||Array.isArray(mesh.material)||mesh.userData.villageSurface||mesh.userData.portSurface||mesh.userData.architecturalSurface)return;
      const source=mesh.material._highMaterial??mesh.material;
      if(source.userData.groundShadowPatched)return;
      if(!shadowMaterials.has(source)){
        const high=source.clone(),low=(source._lowMaterial??source).clone();
        high.onBeforeCompile=source.onBeforeCompile;low.onBeforeCompile=(source._lowMaterial??source).onBeforeCompile;
        high.customProgramCacheKey=source.customProgramCacheKey;low.customProgramCacheKey=(source._lowMaterial??source).customProgramCacheKey;
        if(source.roadMask)high.roadMask=low.roadMask=source.roadMask;
        const patchedHigh=this.groundShadows.apply(high)??high,patchedLow=this.groundShadows.apply(low)??low;
        pairMaterials(patchedHigh,patchedLow);shadowMaterials.set(source,patchedHigh);
      }
      mesh.material=shadowMaterials.get(source);
    });
    this.flags = world.flags;
    this.portWater = world.water;
    for (const f of this.flags.values()) { f.fromOwned = false; f.neutralH = 1; f.teamH = 0; }
    this.worldRoot.add(this.staticRoot);
    this.updateTextureFiltering();
    if (this.lowQuality !== undefined) this.staticRoot.traverse(object => {
      const mat = object.material;
      const next = this.lowQuality ? mat?._lowMaterial : mat?._highMaterial;
      if (next) object.material = next;
    });
    this.staticMenuShadows = false;
    this.cameraPlayerId = null;
  }

  async preloadMapVisuals(mapId,{quality='high',gfx}={}) {
    const model=this.bakedMapModel(getMap(mapId));
    if(!model)return;
    const base=await model.loadBase();
    if(base&&quality==='high'&&['auto','high'].includes(gfx?.detail??'auto'))await model.loadDetail();
    await model.textureLoader.ready();
  }

  async prepareMatchMap(mapId,view,signal) {
    await this.preloadMapVisuals(mapId,view);
    signal.throwIfAborted();
    this.setMap(mapId);
    const world=this.worlds.get(this.map.id);
    const detail=view.quality==='high'&&['auto','high'].includes(view.gfx.detail);
    if(world.model)this.updateBakedDetail(world,detail);
    if(this.map.id==='quarry')this.updateQuarryDetail(world,this.map,detail);
    await Promise.allSettled([this.surfaces.ready,this.groundShadows.textureLoader.ready(),world.quarryLoad,this.tankWarmup]);
  }

  async preloadMatchActors(state) {
    this.infantry??=new InfantryAssets(this.renderer);
    const units=new Map();
    for(const player of state.players){
      const weapon=player.weaponId||defaultWeaponId(player.classId);
      units.set(player.team+'/'+weapon,[player.team,weapon]);
    }
    const vehicleTypes=new Set([...(state.vehicles??[]),...(this.map.vehicleSpawns??[])].map(vehicle=>vehicle.type));
    await Promise.allSettled([
      ...Array.from(units.values(),([team,weapon])=>this.infantry.load(team,weapon)),
      ...Array.from(vehicleTypes,type=>lightVehicleModels[type]?.load()),
    ]);
  }

  async warmMatchFrame(state,localId,view,signal) {
    const local=state.players.find(player=>player.id===localId);
    this.render({...state,events:[]},localId,1/60,{
      ...view,yaw:local?.yaw??0,pitch:local?.pitch??0,vehicleCameraYaw:local?.yaw??0,paused:true,warming:true,
    });
    await this.renderer.compileAsync?.(this.scene,this.camera);
    signal.throwIfAborted();
    if(this.api==='webgpu'){
      await this.renderer.backend.device.queue.onSubmittedWorkDone();
    }else{
      const gl=this.renderer.getContext();
      const fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
      if(!fence)return;
      gl.flush();
      const deadline=performance.now()+750;
      try{
        while(performance.now()<deadline&&gl.clientWaitSync(fence,0,0)===gl.TIMEOUT_EXPIRED){
          signal.throwIfAborted();
          await new Promise(resolve=>requestAnimationFrame(resolve));
        }
      }finally{gl.deleteSync(fence);}
    }
  }

  bakedMapModel(map) {
    if(hasPortAsset(map))return this.portModel;
    if(this.villageModel.matches(map))return this.villageModel;
    if(this.alhadraModel.matches(map))return this.alhadraModel;
    if(map===lagunaAssets.map)return this.lagunaModel;
    if(map===estateAssets.map)return this.estateModel;
  }

  installBakedLayer(world,layer) {
    world.root.add(layer);
    layer.updateMatrixWorld(true);
    layer.traverse(object=>{
      optimizeLighting(object);
      if(this.lowQuality&&object.material?._lowMaterial)object.material=object.material._lowMaterial;
      object.matrixAutoUpdate=false;
      object.matrixWorldAutoUpdate=false;
    });
    this.updateTextureFiltering();
    this.invalidateBakedVisibility();
  }

  invalidateBakedVisibility() {
    this.interiorVisibility.root=null;
    this.cachedShadows.invalidate(true);
    this.sun.shadow.needsUpdate=true;
    this.renderer.shadowMap.needsUpdate=true;
    this.staticMenuShadows=false;
  }

  updateQuarryDetail(world,map,wanted) {
    world.wantsQuarryDetail=wanted;
    if(world.quarryDetail){
      if(world.quarryDetail.visible!==wanted){
        world.quarryDetail.visible=wanted;
        this.invalidateBakedVisibility();
      }
    }else if(wanted){
      world.quarryLoad??=loadQuarryDetail(map,this.surfaces.metal).then(layer=>{
        if(this.disposed){
          disposeQuarryDetail(layer);
          return;
        }
        world.quarryDetail=layer;
        layer.visible=world.wantsQuarryDetail;
        this.installBakedLayer(world,layer);
      }).catch(error=>console.warn('Quarry detail',error));
    }
  }

  installMapFallback(world,map) {
    const fallback=new THREE.Group();
    const live={scene:this.scene,map:this.map,flags:this.flags,random:this.random};
    try{
      Object.assign(this,{scene:fallback,map,flags:world.flags,random:seeded()});
      buildMapScene(this,map,{skipObjectives:true,skipPortWater:true});
      this.mergeStaticWorld(new Set());
    }finally{Object.assign(this,live);}
    world.portLabels?.removeFromParent();
    this.installBakedLayer(world,fallback);
  }

  installBakedBase(world,base) {
    if(world.fallback){
      const geometries=new Set();
      world.fallback.traverse(object=>{
        if(object.geometry?.userData.owned)geometries.add(object.geometry);
      });
      world.fallback.removeFromParent();
      world.fallback=null;
      world.details.length=0;
      geometries.forEach(geometry=>geometry.dispose());
    }
    this.installBakedLayer(world,base);
    this.updateBakedDetail(world,world.wantsDetail);
  }

  updateBakedDetail(world,wanted) {
    world.wantsDetail=wanted;
    const {base,detail}=world.model;
    if(!base||world.fallback)return;
    if(wanted&&!detail){
      world.model.loadDetail().then(layer=>{
        if(layer&&!world.model.disposed)this.updateBakedDetail(world,world.wantsDetail);
      });
      return;
    }
    const visible=detail?.parent===world.root;
    if(visible===Boolean(wanted))return;
    if(wanted)this.installBakedLayer(world,detail);
    else {
      detail?.removeFromParent();
      detail?.traverse(object=>object.geometry?.dispose());
      this.invalidateBakedVisibility();
    }
    if(world.model.assets?.replaceLeaves)base.traverse(object=>{
      if(object.userData.villageSurface==='leaf')object.visible=!wanted;
    });
  }

  clearMapDynamics() {
    // Weapon templates share geometries with soldier assets; unparent only.
    for(const pickup of this.poolWeaponModels?.values()??[])pickup.removeFromParent();
    this.poolWeaponModels?.clear();
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
      const footing=b.quarryFooting??0;
      const elevation = (b.baseY ?? 0)+footing;
      const parent = elevation ? new THREE.Group() : this.scene;
      if (elevation) { parent.position.y = elevation; this.scene.add(parent); }
      const h = (b.h ?? 3)-footing, w = b.w ?? 4, d = b.d ?? 4;
      if(footing)this.box(parent,b.x,-footing/2,b.z,w,footing,d,this.surfaces.concrete);
      if (b.kind === 'roof') {
        this.box(parent, b.x, h / 2, b.z, w, h, d, this.surfaces.metal);
        continue;
      }
      const specialProp = SPECIAL_PROP_KINDS.has(b.kind);
      const building = h > 5 && !['wall', 'pillar'].includes(b.kind) && !specialProp;
      const container = String(b.kind || '').includes('container');
      const surface = this.surfaces[b.quarrySurface] ?? (b.kind === 'crate' ? this.surfaces.wood : b.kind === 'tent' ? this.surfaces.cloth : container || b.kind === 'warehouse' || b.kind === 'truck' || b.kind === 'car' || b.kind === 'fueltank' || b.kind === 'generator' || b.kind === 'kiosk' ? this.surfaces.metal : b.kind === 'factory' || b.kind === 'wall' ? this.surfaces.brick : this.surfaces.concrete);
      const color = b.color || '#969b92', cacheKey = `${surface.uuid}:${color}`;
      if (!this.surfaceCache.has(cacheKey)) { this.surfaceCache.set(cacheKey, clonePairedMaterial(surface, color)); }
      const mat = b.kind === 'pillar' ? this.materials.steel : this.surfaceCache.get(cacheKey);
      if (buildSpecialProp.call(this, parent, b, mat)) continue;
      this.box(parent, b.x, h / 2, b.z, w, h, d, mat);
      // Structural bunker pieces already define the exact shooting openings and floor.
      if(b.kind==='bunker-concrete'||b.kind==='quarry-structure'||b.kind==='quarry-metal')continue;
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
    batchStaticWorld(this.scene,{excluded:new Set([...existing,...[...this.flags.values()].map(f=>f.group),this.camera]),sectorSize:this.staticSectorSize??96});
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

  updatePoolWeapons(state){
    this.poolWeaponModels ??= new Map();
    this.poolWeaponTemplates ??= new Map();
    const active=new Set();
    if(state?.gameMode==='tdm'&&this.map?.id==='fy_pool_day'){
      // Reuse the SAME procedural generator as the equipped gun and menu
      // weapon preview. No imported soldier/GLB asset required.
      this.poolWeaponRig ??= createWeaponRig({lowQuality:true});
      for(const item of state.weaponItems??[]){
        active.add(item.id);
        if(!Number.isFinite(item.x)||!Number.isFinite(item.y)||!Number.isFinite(item.z))continue;
        let pickup=this.poolWeaponModels.get(item.id);
        if(!pickup){
          let template=this.poolWeaponTemplates.get(item.weaponId);
          if(!template){
            const classId=getWeapon('assault',item.weaponId).classId??'assault';
            const source=this.poolWeaponRig.createPreviewModel(classId,item.weaponId);
            // Roll the procedural gun so its side rests on the tile.
            source.rotation.z+=Math.PI/2;
            const wrapper=new THREE.Group();
            wrapper.add(source);wrapper.updateMatrixWorld(true);
            // Only visible geometry belongs to the current gun; the procedural
            // viewmodel contains hidden variants with different extents.
            const bounds=new THREE.Box3();
            wrapper.traverseVisible(object=>{
              if(!object.isMesh)return;
              if(!object.geometry.boundingBox)object.geometry.computeBoundingBox();
              bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
            });
            if(bounds.isEmpty())continue;
            source.position.x-=bounds.getCenter(new THREE.Vector3()).x;
            source.position.y-=bounds.min.y;
            source.position.z-=bounds.getCenter(new THREE.Vector3()).z;
            // Procedural viewmodels share material instances whose finishes
            // mutate when switching AR/AK/SMG. Freeze each weapon's appearance
            // in its cached template rather than recolouring previous pickups.
            const materials=new Map();
            wrapper.traverse(object=>{
              if(!object.isMesh)return;
              const frozen=material=>{
                if(!materials.has(material))materials.set(material,material.clone());
                return materials.get(material);
              };
              if(Array.isArray(object.material))object.material=object.material.map(frozen);
              else if(object.material)object.material=frozen(object.material);
              object.castShadow=false;object.receiveShadow=false;
            });
            wrapper.userData.procedural=true;
            template=wrapper;
            this.poolWeaponTemplates.set(item.weaponId,template);
          }
          pickup=template.clone(true);pickup.name='pool-pickup-'+item.id;
          pickup.userData.weaponId=item.weaponId;
          pickup.userData.procedural=true;
          this.worldRoot.add(pickup);
          this.poolWeaponModels.set(item.id,pickup);
        }
        pickup.position.set(item.x,item.y,item.z);
        pickup.rotation.y=item.yaw??0;
        pickup.visible=true;
      }
    }
    for(const [id,pickup]of this.poolWeaponModels)if(!active.has(id)){
      pickup.removeFromParent();this.poolWeaponModels.delete(id);
    }
  }

  buildWeapon() {
    this.weaponRig = createWeaponRig(this);
    this.weapon = this.weaponRig.weapon;
    this.camera.add(this.weapon);
    prepareViewModel(this.weapon);
  }

  makeSoldier(player) {
    const weaponId = player.weaponId || defaultWeaponId(player.classId);
    this.infantry ??= new InfantryAssets(this.renderer);
    const asset = this.infantry.get(player.team, weaponId);
    if (!asset) return null;
    const rig = createInfantry(asset, { ...player, weaponId });
    if (!this.integratedGpu) rig.group.traverse(optimizeLighting);
    return rig;
  }

  removeSoldier(soldier) {
    disposeInfantry(soldier);
  }

  clearVehicles() {
    for (const rig of this.vehicleRigs.values()) disposeVehicleRig(rig);
    this.vehicleRigs.clear();
  }

  updateVehicles(state, player, dt, view) {
    const active = new Set();
    const blend = view.networkInterpolated ? 1 : 1 - Math.exp(-dt * 22);
    const vehicleView = state.campaign ? { ...view, hideTankMachineGun: true } : view;
    let mounted = null;
    for (const vehicle of state.vehicles ?? []) {
      if(vehicle.type==='tank'&&!tankAssetsReady())continue;
      const model=lightVehicleModels[vehicle.type];
      if(model&&!model.ready())model.load();
      active.add(vehicle.id);
      let rig = this.vehicleRigs.get(vehicle.id);
      const local = player?.vehicleId === vehicle.id && player.alive !== false;
      const distance = player ? Math.hypot(vehicle.x - player.x, vehicle.z - player.z) : 0;
      if ((vehicle.hp <= 0 && vehicle.wreckTime <= 0) || (!local && distance > (vehicle.type==='tank'?(state.campaign?.missionId==='m02'?1000:this.lowQuality?320:600):190))) {
        if (rig) {
          rig.group.visible = false;
          rig.initialized = false;
          rig.gunSeq = undefined;
        }
        continue;
      }
      if (!rig || (model?.ready() && !rig.assetReady)) {
        const previous = rig;
        rig = createVehicleRig(vehicle.type, material, TEAM_COLORS);
        if (previous) {
          rig.group.position.copy(previous.group.position);
          rig.group.rotation.copy(previous.group.rotation);
          rig.body.rotation.copy(previous.body.rotation);
          rig.controls.rotation.copy(previous.controls.rotation);
          if(rig.turret&&previous.turret)rig.turret.gun.rotation.copy(previous.turret.gun.rotation);
          rig.wheels.forEach(({ carrier, tire }, i) => {
            carrier.rotation.copy(previous.wheels[i].carrier.rotation);
            tire.rotation.copy(previous.wheels[i].tire.rotation);
          });
          rig.initialized = previous.initialized;
          rig.turretYaw = previous.turretYaw;
          rig.gunSeq = previous.gunSeq;
          rig.flashTime = previous.flashTime;
          rig.nextSmoke = previous.nextSmoke;
          disposeVehicleRig(previous);
        }
        rig.group.traverse(object => {
          optimizeLighting(object);
          if (object.material) object.material = this.getQualityMaterial(object.material);
        });
        this.vehicleRigs.set(vehicle.id, rig);
        this.worldRoot.add(rig.group);
      }
      rig.group.visible = true;
      updateVehicleRig(rig, vehicle, player, dt, blend, vehicleView, this.lowQuality, this.map.terrain);
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
    if(!this.surfacesReady)return;
    if (!this.infantry) {
      this.infantry = new InfantryAssets(this.renderer);
      this.infantry.warm();
    }
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
    const lodLimits = this.quality === 'high' ? [24, 53, 105] : this.quality === 'medium' ? [14, 32, 76] : [9, 22, 50];
    // Use projected size so magnification keeps distant targets detailed.
    const viewScale = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) /
      Math.tan(THREE.MathUtils.degToRad(85 / 2));
    for (const player of state.players) {
      const cinematicPlayer=state.campaign?.missionId==='m03'&&state.campaign.cutscene?.id==='finale';
      if (player.id === localId&&!cinematicPlayer&&!(this.tankThirdPerson&&player.vehicleSeat===0&&state.vehicles.find(v=>v.id===player.vehicleId)?.type==='tank')) continue;
      active.add(player.id);
      // Only the tank's enclosed driver and gunner are hidden under its armour.
      // Exposed tank riders and all light-vehicle crew must still be rendered.
      const seatedVehicle=player.vehicleId?state.vehicles.find(v=>v.id===player.vehicleId):null;
      if(isEnclosedTankCrew(seatedVehicle,player.vehicleSeat)){
        const hidden=this.soldiers.get(player.id);
        if(hidden){hidden.group.removeFromParent();hidden.initialized=false;hidden.seated=false;}
        continue;
      }
      const activeWeaponId = player.weaponId || defaultWeaponId(player.classId);
      let soldier = this.soldiers.get(player.id);
      const stowing = soldier && soldier.classId === player.classId && soldier.team === player.team &&
        weaponSwitchPose(player.equipTime).stowing;
      const weaponId = stowing ? soldier.weaponId : activeWeaponId;
      if (soldier && (soldier.classId !== player.classId || soldier.team !== player.team)) {
        this.removeSoldier(soldier);
        this.soldiers.delete(player.id);
        soldier = null;
      }
      if (!soldier) {
        soldier = this.makeSoldier({ ...player, weaponId });
        if (!soldier) continue;
        this.soldiers.set(player.id, soldier);
      } else if (soldier.weaponId !== weaponId) {
        const asset = this.infantry.get(player.team, weaponId);
        if (asset) setInfantryWeapon(soldier, asset.gun, weaponId);
      }
      const { group } = soldier;
      if(player.vehicleId&&player.alive!==false){
        const vehicle=seatedVehicle,rig=this.vehicleRigs.get(player.vehicleId);
        if(!vehicle||!rig?.group.visible){group.removeFromParent();soldier.initialized=false;continue;}
        const index=player.vehicleSeat,seat=VEHICLE_TYPES[vehicle.type].seats[index];
        if(group.parent!==rig.body)rig.body.add(group);
        group.userData.seatedActor=true;
        const seatYaw=rig.tank?(index===2?Math.PI/2:index===3?-Math.PI/2:Math.PI):
          seat.role==='gunner'?rig.turretYaw??0:0;
        group.position.set(seat.x,seat.height,seat.z);
        group.rotation.set(0,seatYaw,0);
        // Distant infantry may have switched off their detailed body before
        // entering. Restore it when seated so the whole crew cannot disappear.
        const position=getVehicleSeatPose(vehicle,index),distSq=this.camera.position.distanceToSquared(this.scratchPosition.set(position.x,position.y,position.z))*viewScale**2;
        setInfantryLod(soldier, distSq > lodLimits[2] ** 2 ? 3 : distSq > lodLimits[1] ** 2 ? 2 : distSq > lodLimits[0] ** 2 ? 1 : 0, !this.lowQuality && distSq < 48 ** 2);
        this.soldierBounds.center.set(position.x,position.y-.4,position.z);
        group.visible=this.viewFrustum.intersectsSphere(this.soldierBounds)||Boolean(shadowFrustum?.intersectsSphere(this.soldierBounds)&&distSq<48**2);
        const control=seat.role==='driver'?rig.controls:seat.role==='gunner'?rig.turret?.gun:null;
        const yawDelta=player.yaw-vehicle.yaw-seatYaw;
        infantrySeat(soldier,{vehicle,seat,index,control,relativeYaw:Math.atan2(Math.sin(yawDelta),Math.cos(yawDelta)),
          pitch:player.pitch,aim:player.aim,shotSeq:player.shotSeq,dt});
        // Keep the light-vehicle placeholder visible until the full soldier
        // rig is actually drawn; don't blank the seat if assets are still loading.
        if(rig.riders[index])rig.riders[index].visible=fallbackRiderVisible(vehicle,index,localId,group.parent===rig.body&&group.visible);
        soldier.seated=true;
        continue;
      }
      if(soldier.seated){
        group.userData.seatedActor=false;
        group.removeFromParent();this.worldRoot.add(group);group.rotation.set(0,player.yaw,0);soldier.initialized=false;soldier.seated=false;
      }
      const externalScene = Boolean(group.parent && group.parent !== this.worldRoot);
      const alive = player.alive !== false;
      const target = this.scratchPosition.set(player.x, player.y || 0, player.z);
      const reset = !soldier.initialized || group.position.distanceToSquared(target) > 25;
      if (alive) {
        if (!soldier.alive) {
          group.rotation.x = 0;
          group.rotation.z = 0;
          soldier.deathAge = 0;
        }
        const interpolation = reset || !soldier.alive ? 1 : blend;
        group.position.lerp(target, interpolation);
        const desiredYaw = player.sliding ? player.slideYaw ?? player.yaw : player.yaw;
        const yawDifference = (desiredYaw || 0) - group.rotation.y;
        const yawDelta = Math.atan2(Math.sin(yawDifference), Math.cos(yawDifference));
        if (reset || !soldier.alive) group.rotation.y = player.yaw || 0;
        else {
          const tolerance = infantryTurnTolerance(soldier, player.aim, player.sliding);
          const turnRate = 1 - Math.exp(-dt * 12);
          group.rotation.y += Math.sign(yawDelta) * Math.max(0, Math.abs(yawDelta) - tolerance) * turnRate;
        }
      } else {
        if (!soldier.initialized) group.position.copy(target);
        if (soldier.alive) {
          soldier.deathAge = 0;
        }
        soldier.deathAge += dt;
      }
      const respawned = alive && !soldier.alive;
      soldier.alive = alive;
      soldier.initialized = true;
      this.soldierBounds.center.copy(group.position);
      this.soldierBounds.center.y += .9;
      const distSq = local ? (player.x - local.x) ** 2 + (player.z - local.z) ** 2 : 0;
      const shadowVisible = (this.quality==='medium'?distSq<20**2:!this.lowQuality&&distSq<48**2) && shadowFrustum?.intersectsSphere(this.soldierBounds);
      const visible = externalScene || ((alive || soldier.deathAge < 4.1) &&
        (this.viewFrustum.intersectsSphere(this.soldierBounds) || shadowVisible));
      if (!visible) {
        if (!externalScene) group.removeFromParent();
        continue;
      }
      const returning = !group.parent;
      if (returning) this.worldRoot.add(group);
      group.visible = true;
      const projectedDistanceSq = this.camera.position.distanceToSquared(this.soldierBounds.center) * viewScale ** 2;
      let lod = soldier.lod;
      while (lod < 3 && projectedDistanceSq > (lodLimits[lod] * 1.07) ** 2) lod++;
      while (lod > 0 && projectedDistanceSq < (lodLimits[lod - 1] * .93) ** 2) lod--;
      setInfantryLod(soldier, lod, lod < 2 && (this.quality === 'medium' ? distSq < 20 ** 2 : !this.lowQuality && distSq < 48 ** 2));
      if (!alive) {
        infantryDeath(soldier, soldier.deathAge);
        continue;
      }
      const mustReset = reset || respawned || returning;
      soldier.marker.material.color.setHex(sameSquad(local, player) ? 0x91dc78 :
        player.team === localTeam ? 0x79c5d2 : TEAM_COLORS[player.team] ?? COLORS.friendly);
      soldier.marker.visible = player.team === localTeam;
      soldier.marker.position.y = player.downed || player.prone ? .6 :
        (player.crouching || player.crouch ? 1.48 : 1.94) + Math.sin(this.clock * 2) * .025;
      soldier.rifle.scale.setScalar(1);
      const interval = lod === 3 ? 1 / 12 : lod === 2 ? 1 / 24 : 0;
      soldier.animationDt = mustReset ? dt : (soldier.animationDt || 0) + dt;
      if (mustReset || externalScene || this.scoped || soldier.animationDt >= interval) {
        updateInfantry(soldier, player, soldier.animationDt, mustReset, this.map.terrain);
        if(state.gameMode==='tdm'&&!player.weaponId){
          if(soldier.weaponModel)soldier.weaponModel.visible=false;
          if(soldier.distantWeapon)soldier.distantWeapon.visible=false;
          if(soldier.flash)soldier.flash.visible=false;
        }
        soldier.animationDt = 0;
      }
    }
    for (const [id, soldier] of this.soldiers) if (!active.has(id)) { this.removeSoldier(soldier); this.soldiers.delete(id); }
  }

  processEvents(state, localId) {
    for (const event of state.events || []) {
      const key = event.id ?? `${event.type}:${event.playerId}:${event.time}:${event.x}:${event.z}`;
      if (this.seenEvents.has(key)) continue;
      this.seenEvents.add(key);
      if(event.confirmedCosmetic)continue;
      if (event.type === 'damage' && event.playerId !== localId) {
        infantryHit(this.soldiers.get(event.playerId));
        continue;
      }
      if (event.type === 'grenade') {
        if (event.playerId === localId) this.throwTimer = this.throwDuration;
        else infantryAction(this.soldiers.get(event.playerId));
        continue;
      }
      if (event.type === 'gadget') {
        if (event.playerId === localId) this.gadgetTimer = this.gadgetDuration;
        else if(event.kind==='ammo'||event.kind==='medkit'||event.kind==='beacon')infantryAction(this.soldiers.get(event.playerId), 'interact');
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
      if(event.type==='cannonShot'&&!event.confirmedCosmetic){this.smoke(event.x,event.y,event.z,.6,.4,0xc1bba5);for(let i=0;i<4;i++)this.spark(event.x,event.y,event.z,3);}
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
        if(flight){const model=this.rocketMeshes.get(event.rocketId);flight.impact={x,y,z,at:this.clock,event,rendered:true};flight.from.set(x,y,z);model.position.set(x,y,z);model.visible=false;flight.exhaust.visible=false;flight.halo.visible=false;}
        this.explosionVisual(event,state);
      }
    }
    while (this.seenEvents.size > 8192) {
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

  smoke(x, y, z, size, life, color, {opacity=.55, rise=.8, wind=0}={}) {
    if (this.effects.length > 140) return;
    const effect = this.effectPools.smoke.pop() ?? {
      mesh: new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTexture, transparent: true, depthWrite: false })),
      type: 'smoke',
    };
    const sprite = effect.mesh;
    sprite.material.color.setHex(color);
    sprite.material.rotation = this.random() * Math.PI;
    sprite.position.set(x, y, z); sprite.scale.setScalar(size);
    Object.assign(effect, { age: 0, life, size, opacity, rise, vx: wind + (this.random() - 0.5) * 0.6, vz: (this.random() - 0.5) * 0.6 });
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
        effect.mesh.position.x += effect.vx * dt; effect.mesh.position.z += effect.vz * dt; effect.mesh.position.y += dt * effect.rise;
        effect.mesh.scale.setScalar(effect.size * (1 + effect.age * 1.5)); effect.mesh.material.opacity = alpha * effect.opacity;
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
      if(this.webgpu){
        this._smokeQuat??=new THREE.Quaternion();this._smokeSpin??=new THREE.Quaternion();
        this._smokeMatrix??=new THREE.Matrix4();this._smokeAxis??=new THREE.Vector3(0,0,1);
        this._smokeQuat.copy(this.camera.quaternion).multiply(this._smokeSpin.setFromAxisAngle(this._smokeAxis,sprite.material.rotation));
        this._smokeMatrix.compose(sprite.position,this._smokeQuat,sprite.scale);
        smoke.setMatrixAt(index,this._smokeMatrix);
      }else{sprite.updateMatrix();smoke.setMatrixAt(index,sprite.matrix);}
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
    const model=createGadgetModel('grenade',this.equipmentPalette);
    model.traverse(object=>{
      if(!object.isMesh)return;
      object.material=this.getQualityMaterial(object.material);
      object.castShadow=!this.lowQuality;
    });
    return model;
  }

  createRocketVisual(item,time) {
    const model=createGadgetModel('rocket',this.equipmentPalette);
    model.traverse(object=>{if(object.material)object.material=this.getQualityMaterial(object.material);});
    model.position.set(item.x,item.y,item.z);model.rotation.order='YXZ';
    model.rotation.y=Math.atan2(-item.vx,-item.vz);model.rotation.x=Math.atan2(item.vy,Math.hypot(item.vx,item.vz));
    const exhaust=new THREE.Mesh(this.geo.sphere,this.rocketGlowMaterial);
    exhaust.name='rocket-exhaust';exhaust.position.z=.30;exhaust.scale.set(.105,.105,.48);model.add(exhaust);
    const halo=new THREE.Sprite(this.rocketFlareMaterial);halo.position.z=.38;halo.scale.setScalar(.65);model.add(halo);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(32*3),3).setUsage(THREE.DynamicDrawUsage));geometry.setDrawRange(0,0);
    const line=new THREE.Line(geometry,this.rocketTrailMaterial);line.frustumCulled=false;
    model.userData.flight={line,exhaust,halo,from:model.position.clone(),to:model.position.clone(),phase:0,interval:1/20,sampleTime:time,
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
      // Network sampling has already interpolated the projectile. A second
      // lerp here made it trail behind the authoritative impact and its sound.
      model.position.set(item.x,item.y,item.z);
      model.rotation.y=Math.atan2(-item.vx,-item.vz);model.rotation.x=Math.atan2(item.vy,Math.hypot(item.vx,item.vz));
      model.visible=true;flight.exhaust.visible=true;flight.halo.visible=true;flight.halo.scale.setScalar(clamp(this.camera.position.distanceTo(model.position)*.006,.5,1.2));
      if(item.kind===1){flight.exhaust.visible=flight.halo.visible=false;model.scale.setScalar(.5);}
      const flicker=1+Math.sin(this.clock*90)*.12;
      flight.exhaust.scale.set(.105*flicker,.105*flicker,.46*flicker);
      if(item.kind!==1&&flight.smokePosition.distanceToSquared(model.position)>1.7**2&&this.effects.length<120&&this.camera.position.distanceToSquared(model.position)<160**2){
        this.smoke(model.position.x,model.position.y,model.position.z,.36,.85,0xc9c5b9);flight.smokePosition.copy(model.position);
      }
    }
    for(const [id,model] of this.rocketMeshes){
      const flight=model.userData.flight;
      if(!active.has(id)){
        flight.impact??={x:model.position.x,y:model.position.y,z:model.position.z,at:this.clock};
        const impact=flight.impact,progress=clamp((this.clock-impact.at)/.05,0,1);
        model.position.set(lerp(flight.from.x,impact.x,progress),lerp(flight.from.y,impact.y,progress),lerp(flight.from.z,impact.z,progress));
        model.visible=progress<1&&!impact.rendered;flight.exhaust.visible=false;flight.halo.visible=false;
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
          model=createGadgetModel(kindOf(item),this.equipmentPalette,{deployed:true});
          if(item.kind==='beacon'&&!model.getObjectByName('equipment-status')){
            const led=new THREE.Mesh(this.geo.sphere,this.getQualityMaterial(item.team===1?this.gadgetAssets.team1:this.gadgetAssets.team0));
            led.name='equipment-status';led.position.set(.06,.34,-.14);led.scale.setScalar(.022);model.add(led);
          }
          model.traverse(object=>{if(object.material)object.material=this.getQualityMaterial(object.material);});
          cache.set(item.id,model);this.worldRoot.add(model);
        }
        model.visible=true;
        const led=model.getObjectByName('equipment-status');if(led){
          led.visible=Math.sin(this.clock*4.5)>-.2;
          led.material=this.getQualityMaterial(sameSquad(local,item)?this.gadgetAssets.green:item.team===local?.team?this.gadgetAssets.team0:this.gadgetAssets.team1);
        }
        model.position.set(item.x,item.y,item.z);
        model.rotation.order='YXZ';
        const yaw=item.yaw??Math.atan2(-item.vx,-item.vz);
        model.rotation.y=yaw+(item.kind==='ammo'?Math.PI:0);
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
      if(kind==='launcher'){
        if(model.parent!==soldier.rifle)soldier.rifle.add(model);
        model.position.fromArray(LAUNCHER_POSE.remoteModel);
        soldier.weaponModel.visible=soldier.distantWeapon.visible=soldier.flash.visible=false;
        continue;
      }
      if(model.parent!==soldier.group)soldier.group.add(model);
      model.position.set(.10,(player.crouch?.86:1.22)-(kind==='medkit'?.08:0),-.30);
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
    }
    for (const [id, mesh] of this.grenadeMeshes) if (!active.has(id)) { mesh.removeFromParent(); this.grenadeMeshes.delete(id); }
  }

  updatePixelRatio() {
    const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 1.5);
    // The display canvas must stay native-sized with FSR; only the scene
    // render target is reduced. Without FSR keep the previous DRS behavior.
    const ratio = this.gfx.fsr === 'on'
      ? (this.lowQuality ? 1 : dpr)
      : this.gfx.resolution !== 'auto'
        ? clamp(Number(this.gfx.resolution) || 1, 0.5, 2)
        : this.resolutionController.ratio(this.viewportWidth??innerWidth,this.lowQuality?1:dpr);
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
    const level = mode === 'auto' ? (this.quality==='medium'?'low':this.lowQuality?'off':this.integratedGpu?'medium':'high') : mode;
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
    this.hemiLight.intensity = this.map?.hemisphereLightIntensity ?? (low ? 2.35 : 2.0);
    this.ambientLight.intensity = this.map?.ambientLightIntensity ?? (low ? .38 : .2);
    const swap = object => {
      const m = object.material;
      if (!m || Array.isArray(m)) return;
      const next = low ? m._lowMaterial : m._highMaterial;
      if (next && next !== m) object.material = next;
    };
    this.scene.traverse(swap);
    for (const soldier of this.soldiers.values()) if (!soldier.group.parent) soldier.group.traverse(swap);
    this.updatePixelRatio();
    this.resize();
  }

  maxAnisotropy(){return this.renderer.capabilities?.getMaxAnisotropy?.()??this.renderer.getMaxAnisotropy?.()??1;}

  updateTextureFiltering(){
    if(!this.surfaces)return;
    this.textureAnisotropy=applyTextureFiltering([this.scene,...[...this.worlds.values()].map(world=>world.root)],Object.values(this.surfaces).filter(value=>value?.isMaterial),this.quality??'high',this.maxAnisotropy());
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    if(this.viewportWidth && (width!==this.viewportWidth||height!==this.viewportHeight)){
      this.frameGeneration?.reset(); // never reproject history from the old viewport
    }
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

  drawScene(menu = false, warming = false) {
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
    if(!menu&&!warming)this.interiorVisibility.apply(this);
    const timing=this.gpuTimer.begin();
    try{
      const generator=this.frameGeneration;
      try{
        // No simulated gameplay frames exist in menu. Keep the ordinary
        // WebGPU renderer there; enable temporal history only in a match.
        generator?.setMode(menu||warming?'off':this.gfx.frameGeneration??'off');
        this.postPass.setUpscaling(this.gfx.fsr==='on'?this.gfx.fsrQuality:'off',this.resolutionController.scale,this.gfx.fsrSharpness);
        this.postPass.begin(this.quality);
        try {
          generator?.beginWorld(this.scene);
          drawWorldAndViewModel(this.renderer,this.scene,this.camera,this.weapon,this.worldRoot);
        } finally {generator?.endWorld();}
        this.postPass.end(this.clock,this.quality);
      }catch(error){
        if(!generator?.enabled)throw error;
        // A bad pipeline/unsupported MRT disables only FG, not the whole WebGPU game.
        generator.error(error);
        this.postPass.begin(this.quality);
        drawWorldAndViewModel(this.renderer,this.scene,this.camera,this.weapon,this.worldRoot);
        this.postPass.end(this.clock,this.quality);
      }
    }
    finally{this.renderer.setRenderTarget(null);if(timing)this.gpuTimer.end();this.gpuTimer.poll?.();this.interiorVisibility.restore();}
  }

  placeVehicleCamera({ vehicle, rig }, seat, yaw, pitch, shake) {
    const humvee = vehicle.type === 'humvee';
    const index=VEHICLE_TYPES[vehicle.type].seats.indexOf(seat);
    const eye=getVehicleSeatPose({ ...vehicle,x:rig.group.position.x,y:rig.group.position.y,z:rig.group.position.z,yaw:rig.group.rotation.y,bodyPitch:rig.body.rotation.x,bodyRoll:rig.body.rotation.z },index);
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
    this.tankThirdPerson=view.vehicleThirdPerson!==false;
    this.setMap(state?.mapId ?? view.mapId);
    const rawDt = dt || 0.016;
    dt = Math.min(rawDt, 0.1); this.clock += dt;
    this.scoped = false;
    if (this.map.shoreX !== undefined && this.portWater) {
      this.portWater.offset.set((this.clock * .011) % 1, (this.clock * .017) % 1);
    }
    const previousQuality=this.quality;this.quality=view.quality??'high';this.shadowDynamicOnly=this.quality==='medium';
    this.groundShadows.uniforms.groundShadowStrength.value=this.quality==='high'?0:.32;
    const low = this.quality !== 'high';
    if(previousQuality!==this.quality){this.applyShadows();this.updateTextureFiltering();}
    if (this.lowQuality !== low) {
      this.applyQuality(low);
    }
    const gfx = view.gfx;
    const detail=(gfx?.detail??'auto')==='auto'?this.quality:gfx.detail;
    const detailLevel=detail==='high'?2:detail==='medium'?1:0;
    if(this.detailLevel!==detailLevel||previousQuality!==this.quality){
      this.detailLevel=detailLevel;
      for(const object of this.mapDetails??[])object.visible=object.userData.detailLevel<=detailLevel;
      const world=this.worlds.get(this.map.id);
      const highDetail=this.quality==='high'&&detailLevel===2;
      if(world?.model)this.updateBakedDetail(world,highDetail);
      if(world&&this.map.id==='quarry')this.updateQuarryDetail(world,this.map,highDetail);
    }
    if (gfx && (gfx.shadows !== this.gfx.shadows || gfx.resolution !== this.gfx.resolution || gfx.fsr !== this.gfx.fsr || gfx.fsrQuality !== this.gfx.fsrQuality || gfx.fsrSharpness !== this.gfx.fsrSharpness || gfx.frameGeneration !== this.gfx.frameGeneration)) {
      const shadowChanged=gfx.shadows!==this.gfx.shadows;
      this.gfx={shadows:gfx.shadows,resolution:gfx.resolution,fsr:gfx.fsr??'off',fsrQuality:gfx.fsrQuality??'quality',fsrSharpness:gfx.fsrSharpness??40,frameGeneration:this.api==='webgpu'?gfx.frameGeneration??'off':'off'};
      if(shadowChanged)this.applyShadows();
      this.updatePixelRatio();
    }
    const dynamicResolution=this.gfx.fsr==='on'?this.gfx.fsrQuality==='auto':this.gfx.resolution==='auto';
    if(state?.players&&!view.paused&&dynamicResolution&&this.resolutionController.update(rawDt,this.lastCpuMs??0,this.gpuTimer.summary()?.p95??null)){
      this.adaptiveScale=this.resolutionController.scale;
      if(this.gfx.fsr!=='on')this.updatePixelRatio();
    }
    const baseFov = clamp(Number(view.fov) || 85, 65, 105), shake = view.shake !== false;
    this.renderer.toneMappingExposure = 1.06 * clamp(Number(view.brightness) || 1, .6, 1.5);
    if (!state?.players) {
      this.cameraPlayerId = null;
      if (this.vehicleRigs.size) this.clearVehicles();
      const angle = this.clock * 0.012, radius = this.map.terrain ? this.map.size * .29 : 130;
      const menuView=this.map.menuView;
      if(menuView){
        this.camera.position.fromArray(menuView.eye);
        this.camera.lookAt(...menuView.target);
      }else if (this.map.shoreX !== undefined) {
        this.camera.position.set(-136 + Math.sin(angle - .6) * 86, 68 + Math.sin(this.clock * .025) * 7, 26 + Math.cos(angle - .6) * 122);
        this.camera.lookAt(-73, 4, 4);
      } else {
        this.camera.position.set(Math.sin(angle + .9) * radius, 94 + Math.sin(this.clock * .025) * 8, Math.cos(angle + .9) * radius);
        this.camera.lookAt(0, 3, -12);
      }
      this.weapon.visible = false;
      this.viewWeaponTarget = null;
      this.atmosphere.sky.position.copy(this.camera.position);
      const fov=menuView?.fov??70,near=menuView?.near??(menuView ? .12 : 2);
      if (this.camera.fov !== fov || this.camera.near !== near) {
        this.camera.fov = fov;
        this.camera.near = near;
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
    let gadgetKind=player?.heldGadget??player?.gadgetAction??null;
    this.gadgetDuration=gadgetKind==='launcher'?1.05:gadgetKind==='defibrillator'?.7:gadgetKind==='medkit'?.85:.75;
    this.gadgetTimer=player?.gadgetActionRemaining??0;
    const throwPhase = this.throwTimer > 0 ? 1 - this.throwTimer / this.throwDuration : 0;
    let gadgetPhase=(player?.heldGadget||gadgetKind==='repair') ? .5 : this.gadgetTimer>0?clamp(1-this.gadgetTimer/this.gadgetDuration,.001,.999):0;
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
      const vehicle=mounted.vehicle;
      const tank=vehicle.type==='tank',fieldTank=tank&&state.campaign?.missionId!=='m02';
      const machineGunner=fieldTank&&seat.role==='gunner';
      const optic=fieldTank&&(view.aim||machineGunner||view.vehicleThirdPerson===false);
      if(optic){
        const yaw=machineGunner?view.yaw??vehicle.gunAimYaw??vehicle.yaw:vehicle.aimYaw;
        const pitch=machineGunner?clamp(view.pitch??0,TANK_MG.minPitch,TANK_MG.maxPitch):vehicle.aimPitch;
        const mouth=machineGunner?tankMachineGunMuzzle({...vehicle,gunAimYaw:yaw,gunAimPitch:pitch}):tankMuzzle(vehicle);
        if(this.tankCamera)this.tankCamera.initialized=false;
        this.camera.position.set(mouth.x,mouth.y+.12,mouth.z);
        this.camera.rotation.set(pitch,yaw,0,'YXZ');
        this.cameraPlayerId=null;
        this.cameraAlive=true;
        this.updateSunShadow(vehicle.x,vehicle.z);
      }
      else if(tank&&seat.role==='driver'&&view.vehicleThirdPerson!==false)placeTankCamera(this,mounted,view,dt);
      else{if(this.tankCamera)this.tankCamera.initialized=false;this.placeVehicleCamera(mounted, seat, view.yaw ?? player.yaw, view.pitch ?? player.pitch, shake);}
      this.weapon.visible = false;
      this.viewWeaponTarget = null;
      this.wallStow = this.aimAmount = this.sprintBlend = 0;
      const mountedFov=fieldTank&&view.aim?THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(baseFov)/2)/2.5)):baseFov;
      if (Math.abs(this.camera.fov - mountedFov) > .03 || this.camera.near !== .045) {
        this.camera.fov = mountedFov;
        this.camera.near = .045;
        this.camera.updateProjectionMatrix();
      }
    } else if (player) {
      const activeWeaponId = player.weaponId || defaultWeaponId(player.classId);
      const equipmentKey=activeWeaponId+'/'+(player.heldGadget??'');
      if (this.viewWeaponTarget !== equipmentKey || this.viewWeaponPlayer !== player.id) {
        this.weaponSwitch = player.equipTime > 0 && this.viewWeaponPlayer === player.id && this.viewWeaponTarget
          ? { from: this.presentedWeaponId, fromGadget:this.presentedGadgetKind??null, left: .38 } : null;
        this.viewWeaponPlayer = player.id;
        this.viewWeaponTarget = equipmentKey;
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
      gadgetKind=stowing?swap.fromGadget:gadgetKind;this.presentedGadgetKind=gadgetKind;
      if(stowing)gadgetPhase=gadgetKind?.5:0;
      const pistol = getWeapon(player.classId, this.presentedWeaponId).sidearm;
      const yaw = view.yaw ?? player.yaw ?? 0, pitch = view.pitch ?? player.pitch ?? 0;
      const sliding = !passenger && Boolean(player.sliding);
      const crouching = !passenger && Boolean(sliding || player.crouch || player.crouching || view.crouch);
      const targetHeight = state.campaign&&(player.prone||player.downed)? .48:crouching ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
      this.eyeHeight=lerp(this.eyeHeight??targetHeight,targetHeight,1-Math.exp(-dt*20));
      this.slideBlend=lerp(this.slideBlend??0,sliding?1:0,1-Math.exp(-dt*16));
      const height=this.eyeHeight;
      const passengerCanFire = passenger && canFirePassengerWeapon(mounted.vehicle, player.vehicleSeat, yaw, pitch);
      const coverDistance = passenger ? 1.6 : distanceToCover(
        { x: player.x, y: (player.y || 0) + height, z: player.z },
        { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) }, this.campaignCoverColliders??getAssetColliders(this.map), 1.6,
      );
      const stow = passenger && !passengerCanFire ? .65 : clamp((1.45 - coverDistance) / 1.05, 0, 1);
      this.wallStow = lerp(this.wallStow, stow, 1 - Math.exp(-dt * 14));
      this.aimAmount = lerp(this.aimAmount, view.aim && isAlive && !this.weaponSwitch && !player.reloading && this.throwTimer <= 0 && (player.heldGadget||this.gadgetTimer<=0) && this.wallStow < .2 ? 1 : 0, 1 - Math.exp(-dt * 15));
      const weapon = getWeapon(player.classId, player.weaponId);
      const scopedWeapon = !gadgetKind && Boolean(SCOPE_ZOOMS[player.weaponId]) && !this.weaponSwitch;
      this.scoped = isAlive && scopedWeapon && this.aimAmount >= .92;
      this.reloadAmount = lerp(this.reloadAmount, player.reloading ? 1 : 0, 1 - Math.exp(-dt * 12));
      // Local visual time must not be restarted by every authoritative snapshot.
      // Correct small clock differences gradually, never jumping hands backward.
      this.reloadTimeline??=new ReloadTimeline();
      const reloadPhase=this.reloadTimeline.update({
        reloading:player.reloading,
        progress:player.reloadProgress,
        duration:weapon.reload,
        weaponKey:player.id+'/'+player.weaponId,
        dt,
      });
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
      // Large iron-sighted machine guns need more visible surroundings than
      // rifles with close optics; don't narrow their ADS FOV as aggressively.
      const supportIron=!pistol&&!gadgetKind&&player.classId==='support';
      const aimFov = scopedWeapon
        ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(baseFov) / 2) / scopeMagnification(player.weaponId,view.scopeZoom)))
        : baseFov - (gadgetKind==='launcher'?30:gadgetKind?10:pistol?13:supportIron?17:23);
      const fov = lerp(baseFov + this.sprintBlend * 6 + this.slideBlend*3, aimFov, this.aimAmount);
      if (Math.abs(this.camera.fov - fov) > 0.03 || this.camera.near !== .045) {
        this.camera.fov = fov;
        this.camera.near = .045;
        this.camera.updateProjectionMatrix();
      }
      this.swayX = lerp(this.swayX, clamp(Math.atan2(Math.sin(yaw - this.lastYaw), Math.cos(yaw - this.lastYaw)) * 1.3, -0.025, 0.025), 0.18);
      this.swayY = lerp(this.swayY, clamp((pitch - this.lastPitch) * 1.3, -0.02, 0.02), 0.18);
      this.lastYaw = yaw; this.lastPitch = pitch;
      // Hide the entire FPV rig, including both hands, until weapon pickup.
      this.weapon.visible = isAlive && !this.scoped && (state.gameMode!=='tdm'||Boolean(player.weaponId));
      this.weaponRig.update({
        classId: player.classId,
        team: player.team,
        weaponId: this.presentedWeaponId,
        unarmed: state.gameMode==='tdm'&&!player.weaponId,
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
      const actionTilt = Math.sin(Math.max(throwPhase, gadgetKind?0:gadgetPhase) * Math.PI);
      const closeOptic=!pistol&&!scopedWeapon&&this.weaponRig.sightType==='compact';
      const rifleSight=this.weaponRig.rifleSight;
      // A little extra eye relief makes the MG/PKP aperture less dominant
      // without moving the centred sight line or changing bullet trajectories.
      const adsZ=pistol?-.46:closeOptic?-.13:rifleSight?.depth??(scopedWeapon?-.32:supportIron?-.288:-.27);
      const adsY=-(pistol?this.weaponRig.pistolSightHeight:rifleSight?.height??.167);
      const rifleSprint=pistol?0:this.sprintBlend;
      const weaponBob=bob*(pistol?1-this.sprintBlend*.55:1);
      this.weapon.position.set(
        lerp(pistol ? .15 : .26, 0, this.aimAmount) + Math.sin(cycle) * .015 * weaponBob - this.swayX + rifleSprint * .035 + actionTilt * .055 + lowered * .06,
        lerp(pistol ? -.105 : -.23, adsY, this.aimAmount) + Math.cos(cycle * 2) * .01 * weaponBob - this.swayY - reloadMotion * .10 - rifleSprint * .07 - this.landDip * .75 - actionTilt * .065 - lowered * .42,
        lerp(pistol ? -.50 : -.42, adsZ, this.aimAmount) + kick * .056 + reloadMotion * .06 + actionTilt * .04 + lowered * .14,
      );
      this.weapon.rotation.set(
        kick * (pistol ? .089 : .062) - reloadMotion * .39 - rifleSprint * .25 + Math.cos(cycle) * weaponBob * .022 - actionTilt * .18 - lowered * .72,
        -reloadMotion * .22 + rifleSprint * .34 + this.strafeBlend * .028 * (1 - this.aimAmount) - actionTilt * .22,
        -reloadMotion * .47 + rifleSprint * .24 + Math.sin(cycle) * weaponBob * .018 - actionTilt * .36 + lowered * .24,
      );
      const pistolSprint=pistol&&!gadgetKind?applyPistolSprintPose(this.weapon,this.sprintBlend,this.aimAmount,this.reloadAmount,kick,cycle):0;
      if(gadgetKind){
        const launcher=gadgetKind==='launcher';
        const framing=launcher?LAUNCHER_POSE:gadgetKind==='defibrillator'?DEFIB_POSE:(gadgetKind==='ammo'||gadgetKind==='medkit')?SUPPLY_POSE:null;
        this.weapon.position.set(
          lerp(framing?.hip[0]??.08,framing?.ads[0]??.02,this.aimAmount)+Math.sin(cycle)*.007*bob-this.swayX,
          lerp(framing?.hip[1]??-.27,framing?.ads[1]??-.22,this.aimAmount)-this.landDip*.4-lowered*.42,
          lerp(framing?.hip[2]??-.43,framing?.ads[2]??-.39,this.aimAmount)+kick*.075+lowered*.14,
        );
        this.weapon.rotation.set(kick*.09+Math.cos(cycle)*bob*.009-lowered*.4,-this.swayX*.3,Math.sin(cycle)*bob*.008);
      }
      this.weapon.position.y -= this.wallStow * .28; this.weapon.position.z += this.wallStow * .18; this.weapon.rotation.x -= this.wallStow * .85;
      this.weaponRig.anchorPistolArm(pistolSprint);
    }
    view.campaignRender?.(this,state,dt,view);
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
    this.updateSoldiers(state, localId, dt, view.networkInterpolated); this.updatePoolWeapons(state); this.updateGrenades(state, localId); this.processEvents(state, localId); this.syncEquipment(state,localId,dt); this.updateEffects(dt);
    this.atmosphere.sky.position.copy(this.camera.position);
    if(view.warming){
      // Upload visible map layers even when the starting camera faces away.
      const meshes=[];
      this.staticRoot.traverseVisible(object=>{
        if(object.isMesh&&object.frustumCulled){meshes.push(object);object.frustumCulled=false;}
      });
      try{this.drawScene(false,true);}
      finally{for(const mesh of meshes)mesh.frustumCulled=true;}
    }else this.drawScene();
  }

  countVisibleObjects() {
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    this.viewProjection.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse);
    this.viewFrustum.setFromProjectionMatrix(this.viewProjection);
    let count=0;
    this.scene.traverseVisible(object=>{
      if(!(object.isMesh||object.isLine||object.isSprite||object.isPoints))return;
      if(!object.layers.test(this.camera.layers)&&!object.layers.isEnabled?.(0))return;
      if(!object.frustumCulled||this.viewFrustum.intersectsObject(object))count++;
    });
    return count;
  }

  shouldGenerateFrame(now,meta){return this.frameGeneration?.shouldGenerate(now,meta)??false;}
  presentGeneratedFrame(now,meta){
    if(!this.frameGeneration?.enabled)return false;
    try{return this.frameGeneration.generate(now,meta);}
    catch(error){this.frameGeneration.error(error);return false;}
  }
  noteRealFrame(now,meta,elapsedMs){this.frameGeneration?.noteReal(now,meta,elapsedMs);}

  getStats() {
    const r=this.renderer,post=this.postPass,isGPU=this.api==='webgpu';
    return {api:this.api,backend:isGPU?(r.backend?.isWebGPUBackend?'WebGPU':'WebGL fallback'):'WebGL 2',
      gpuRenderer:this.gpuName??(isGPU?null:r.getContext().getParameter(r.getContext().RENDERER)),
      postSamples:post.target.samples,fxaa:isGPU?Boolean(post.useFxaa.value):Boolean(post.material.uniforms.useFxaa.value),
      anisotropy:this.textureAnisotropy,shadowsEnabled:r.shadowMap.enabled,shadowMode:this.gfx.shadows,
      worldCalls:r.info.worldRender?.drawCalls??r.info.worldRender?.calls,
      worldTriangles:r.info.worldRender?.triangles,calls:isGPU?r.info.render.drawCalls:r.info.render.calls,
      triangles:r.info.render.triangles,effects:this.effects.length,geometries:r.info.memory.geometries,textures:r.info.memory.textures,
      visibleObjects:this.perfEnabled?this.countVisibleObjects():null,
      pixelRatio:this.currentPixelRatio,fsr:this.gfx.fsr==='on'?this.gfx.fsrQuality:'off',
      fsrScale:post.fsrScale,fsrSharpness:this.gfx.fsrSharpness,sceneWidth:post.target.width,sceneHeight:post.target.height,
      frameGeneration:this.frameGeneration?.stats()??null,
      integratedGpu:this.integratedGpu,gpuMs:this.gpuTimer.summary(),gpuTimerSupported:Boolean(this.gpuTimer.ext)
    };
  }

  project(x, y, z) {
    const position = this.scratchPosition.set(x, y, z).project(this.camera);
    const width = this.viewportWidth, height = this.viewportHeight;
    return { x: (position.x * 0.5 + 0.5) * width, y: (-position.y * 0.5 + 0.5) * height, visible: position.z > -1 && position.z < 1 && Math.abs(position.x) < 1.1 && Math.abs(position.y) < 1.1 };
  }

  dispose() {
    this.disposed=true;
    this.villageModel.dispose();
    this.alhadraModel.dispose();
    this.portModel.dispose();
    this.lagunaModel.dispose();
    this.estateModel.dispose();
    for(const world of this.worlds.values())disposeQuarryDetail(world.quarryDetail);
    for (const soldier of this.soldiers.values()) this.removeSoldier(soldier);
    this.soldiers.clear();
    this.infantry?.dispose();
    this.poolWeaponRig?.dispose();
    this.poolWeaponTemplates?.clear();
    this.poolWeaponModels?.clear();
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
    for (const pool of Object.values(this.effectPools)) for (const effect of pool) collect(effect.mesh);
    textures.add(this.smokeTexture);
    materials.add(this.reviveMaterial);
    materials.add(this.rocketFlareMaterial);textures.add(this.rocketFlareTexture);materials.add(this.rocketGlowMaterial);materials.add(this.rocketTrailMaterial);
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
    skeletons.forEach(skeleton => skeleton.dispose());
    this.weaponRig?.dispose?.();
    this.atmosphere.target.dispose();
    this.groundShadows.dispose();this.frameGeneration?.dispose();this.postPass.dispose();this.gpuTimer.dispose();this.renderer.dispose();
  }
}
