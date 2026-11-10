import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MAP, CLASSES, CAPTURE_RADIUS } from '../shared/world.js';
import { createSurfaceMaterials, makeSky, addDistrictDetails, makeSign } from './visuals.js';
import {prepareViewModel,distanceToCover,drawWorldAndViewModel} from './viewmodel.js';

const COLORS = { friendly: 0x5bd9e8, enemy: 0xf0a15d, neutral: 0xc8c5ae };
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

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
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}

export class GameRenderer {
  constructor(canvas, { onError } = {}) {
    this.canvas = canvas;
    this.clock = 0;
    this.soldiers = new Map();
    this.flags = new Map();
    this.grenadeMeshes = new Map();
    this.effects = [];
    this.seenEvents = new Set();
    this.lastShot = -1;
    this.kick = 0;
    this.aimAmount = 0;
    this.reloadAmount = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.lastYaw = 0;
    this.lastPitch = 0;
    this.cameraAnchor = new THREE.Vector3();
    this.cameraPlayerId = null;
    this.cameraAlive = null;
    this.scratchPosition = new THREE.Vector3();
    this.surfaceCache = new Map();
    this.soldierMaterials = new Map();
    this.random = seeded();
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
    } catch (error) {
      onError?.(error);
      throw error;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9aa7a7);
    this.scene.fog = new THREE.FogExp2(0x9aa7a7, 0.0034);
    this.camera = new THREE.PerspectiveCamera(85, 1, 0.045, 950);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight(0xc3d9e9, 0x777060, 2.0));
    this.scene.add(new THREE.AmbientLight(0x8e9eaa, 0.2));
    this.sun = new THREE.DirectionalLight(0xffd7a4, 3.5);
    this.sun.position.set(-90, 75, 65);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 1, far: 250 });
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.geo = {
      box: new THREE.BoxGeometry(1, 1, 1),
      cylinder: new THREE.CylinderGeometry(1, 1, 1, 10),
      sphere: new THREE.SphereGeometry(1, 10, 8),
      rounded: new RoundedBoxGeometry(1, 1, 1, 1, 0.12),
      shell: new THREE.CylinderGeometry(.009, .009, .043, 6),
    };
    this.surfaces = createSurfaceMaterials(this.renderer);
    this.atmosphere = makeSky(this.scene, this.renderer);
    this.materials = {
      concrete: this.surfaces.concrete, darkConcrete: material(0x414948), edge: material(0x929087),
      asphalt: this.surfaces.asphalt, steel: material(0x323c3e, 0.55, 0.65), rust: material(0x735344, 0.8, 0.4),
      roof: material(0x4e5655), window: material(0x23363e, 0.25, 0.4), marking: material(0xb5b1a0),
      sand: material(0x8d8067), foliage: material(0x4c5b4c), pole: material(0x788185, 0.4, 0.75),
      glow: new THREE.MeshBasicMaterial({ color: 0xffd8a1 }),
    };
    this.buildWorld();
    this.mergeStaticWorld();
    this.buildWeapon();
    this.scene.traverse(object=>{if(object.isLight)object.layers.enable(1);});
    this.wallStow=0;
    this.smokeTexture = canvasTexture(64, (ctx, size) => {
      const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      gradient.addColorStop(0, 'rgba(255,255,255,.65)'); gradient.addColorStop(0.4, 'rgba(255,255,255,.45)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, size, size);
      ctx.globalCompositeOperation = 'source-atop';
      for(let i=0;i<25;i++){
        const x=this.random()*size,y=this.random()*size,r=4+this.random()*12;
        const cloud=ctx.createRadialGradient(x,y,0,x,y,r);cloud.addColorStop(0,'rgba(120,120,120,.22)');cloud.addColorStop(1,'rgba(120,120,120,0)');ctx.fillStyle=cloud;ctx.fillRect(x-r,y-r,r*2,r*2);
      }
      ctx.globalCompositeOperation='source-over';
    });
    this.shellMaterial = material(0xb9954c, .32, .82);
    this.sparkMaterial = new THREE.MeshBasicMaterial({color:0xffc475});
    this.resize();
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
    this.box(this.scene, 0, 0.012, 0, 24, 0.02, size + 10, this.materials.asphalt, false);
    const crossStreets = size > 250 ? [-110, -40, 0, 40, 110] : [0];
    for (const z of crossStreets) this.box(this.scene, 0, 0.015, z, size + 10, 0.02, 15, this.materials.asphalt, false);
    for (let i = -size / 2 + 8; i < size / 2; i += 10) {
      if (crossStreets.every(z => Math.abs(i - z) > 9)) {
        this.box(this.scene, 0, 0.032, i, 0.13, 0.015, 4.8, this.materials.marking, false);
      }
      for (const z of crossStreets) if (Math.abs(i) > 15) this.box(this.scene, i, 0.033, z, 4.8, 0.015, 0.13, this.materials.marking, false);
    }
    const windowMatrices = [], litMatrices = [], frameMatrices = [];
    const dummy = new THREE.Object3D();
    for (const b of MAP.boxes || []) {
      const h = b.h ?? 3, w = b.w ?? 4, d = b.d ?? 4;
      const building = h > 5 && !['wall', 'pillar'].includes(b.kind);
      const container = String(b.kind || '').includes('container');
      const surface = b.kind==='crate'?this.surfaces.wood:container || b.kind === 'warehouse' ? this.surfaces.metal : b.kind === 'factory' || b.kind === 'wall' ? this.surfaces.brick : this.surfaces.concrete;
      const color = b.color || '#969b92', cacheKey = `${surface.uuid}:${color}`;
      if (!this.surfaceCache.has(cacheKey)) { const clone = surface.clone(); clone.color.set(color); this.surfaceCache.set(cacheKey, clone); }
      const mat = b.kind === 'pillar' ? this.materials.steel : this.surfaceCache.get(cacheKey);
      this.box(this.scene, b.x, h / 2, b.z, w, h, d, mat);
      if (b.kind === 'wall') {
        this.box(this.scene, b.x, h + 0.05, b.z, w + .08, .16, d + .08, this.materials.edge);
      } else if (b.kind === 'pillar') {
        this.box(this.scene, b.x, .12, b.z, w + .25, .24, d + .25, this.materials.rust);
      } else if (building) {
        this.box(this.scene, b.x, h + 0.13, b.z, w + 0.3, 0.26, d + 0.3, this.materials.edge);
        this.box(this.scene, b.x, 0.45, b.z, w + 0.12, 0.9, d + 0.12, this.materials.darkConcrete);
        if(b.kind==='warehouse'){
          const rise=Math.min(2.6,w*.1),half=w/2,slope=Math.atan2(rise,half);
          for(const side of [-1,1]){const roof=this.box(this.scene,b.x+side*w/4,h+rise/2+.12,b.z,Math.hypot(half,rise)+.3,.14,d+.6,this.surfaces.metal);roof.rotation.z=-side*slope;}
        }else if(b.kind==='factory'){
          this.cylinder(this.scene,b.x+w*.28,h+4,b.z-d*.25,.48,8,this.surfaces.brick,14);
          this.cylinder(this.scene,b.x+w*.28,h+8.05,b.z-d*.25,.58,.25,this.materials.steel,14);
          const tank=this.cylinder(this.scene,b.x-w*.22,h+1.8,b.z+d*.2,1.2,3.3,this.materials.edge,16);
          this.cylinder(this.scene,tank.position.x,h+3.5,tank.position.z,1.28,.16,this.materials.steel,16);
        }
        for (let y = 2.8; y < h - 0.9; y += 3.1) {
          for (const face of [-1, 1]) {
            for (let x = -w / 2 + 1.5; x < w / 2 - 0.7; x += 2.7) {
              dummy.position.set(b.x + x, y, b.z + face * (d / 2 + 0.021)); dummy.rotation.set(0, 0, 0); dummy.scale.set(1.3, 1.55, 0.035); dummy.updateMatrix();
              (random() > 0.88 ? litMatrices : windowMatrices).push(dummy.matrix.clone());
              dummy.scale.set(1.5, 1.75, .025); dummy.updateMatrix(); frameMatrices.push(dummy.matrix.clone());
            }
            for (let z = -d / 2 + 1.5; z < d / 2 - 0.7; z += 2.7) {
              dummy.position.set(b.x + face * (w / 2 + 0.021), y, b.z + z); dummy.rotation.set(0, 0, 0); dummy.scale.set(0.035, 1.55, 1.3); dummy.updateMatrix();
              (random() > 0.9 ? litMatrices : windowMatrices).push(dummy.matrix.clone());
              dummy.scale.set(.025, 1.75, 1.5); dummy.updateMatrix(); frameMatrices.push(dummy.matrix.clone());
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
          const sign = makeSign(b.kind === 'factory' ? 'SECTOR' : 'DEPOT', `${String(b.id || '').replace('obj-', '').padStart(2,'0')}  /  RESTRICTED`, Math.min(4.5, w * .22));
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
        for(const side of [-1,1]){
          if(w>d)this.cylinder(this.scene,b.x+w/2+.035,h/2,b.z+side*d*.22,.035,h*.88,this.materials.pole);
          else this.cylinder(this.scene,b.x+side*w*.22,h/2,b.z+d/2+.035,.035,h*.88,this.materials.pole);
        }
      } else if(b.kind==='crate'){
        for(const side of [-1,1]){
          this.box(this.scene,b.x+side*w*.33,h/2,b.z,.09,h+.025,d+.035,this.materials.steel);
          this.box(this.scene,b.x,h*.2,b.z+side*d/2,w+.03,.12,.045,this.materials.rust);
        }
      } else {
        this.box(this.scene, b.x, h - 0.08, b.z, w + 0.08, 0.16, d + 0.08, this.materials.edge);
        if (h < 2) {
          const stripe = material(0x9b8a55);
          this.box(this.scene, b.x, h * 0.65, b.z + d / 2 + 0.015, w * 0.85, Math.min(0.14, h * 0.15), 0.02, stripe, false);
        }
      }
    }
    for (const [matrices, mat] of [[frameMatrices, this.materials.edge], [windowMatrices, this.materials.window], [litMatrices, material(0xb5a27c, 0.6, 0.2, { emissive: 0x7c633c, emissiveIntensity: 0.45 })]]) {
      if (!matrices.length) continue;
      const mesh = new THREE.InstancedMesh(this.geo.box, mat, matrices.length);
      matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix)); this.scene.add(mesh);
    }
    // The non-playable port skyline encloses the battlefield.
    const limit = size / 2;
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2;
      const x = Math.sin(angle) * (limit + 35 + random() * 30), z = Math.cos(angle) * (limit + 35 + random() * 30);
      const height = 12 + random() * 28;
      this.box(this.scene, x, height / 2 - 0.3, z, 12 + random() * 15, height, 10 + random() * 20, material(0x697476), false);
    }
    for (let i = 0; i < 3; i++) this.crane(-limit - 20 + i * 45, -limit - 28, i * 0.5);
    for (const point of MAP.points || []) this.makeFlag(point);
    addDistrictDetails(this, MAP);
    // Boundary fence posts and wire are outside playable ground.
    const fenceMat = material(0x697674, 0.7, 0.45);
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
    const mat = material(0x776f57, 0.8, 0.4);
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
      const key = `${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(object);
    });
    for (const meshes of batches.values()) {
      if (meshes.length < 2) continue;
      const sources = meshes.map(mesh => mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
      const geometry = mergeGeometries(sources, false);
      sources.forEach(source => source.dispose());
      if (!geometry) continue;
      const combined = new THREE.Mesh(geometry, meshes[0].material);
      combined.castShadow = meshes[0].castShadow; combined.receiveShadow = meshes[0].receiveShadow;
      meshes.forEach(mesh => { mesh.removeFromParent(); if (mesh.geometry.userData.owned) mesh.geometry.dispose(); }); this.scene.add(combined);
    }
  }

  makeFlag(point) {
    const group = new THREE.Group(); group.position.set(point.x, 0, point.z); this.scene.add(group);
    this.cylinder(group, 0, 2.4, 0, 0.045, 4.8, this.materials.pole);
    const flagMaterial = new THREE.MeshStandardMaterial({ color: COLORS.neutral, side: THREE.DoubleSide, roughness: 0.95 });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 0.85, 8, 1), flagMaterial);
    flag.position.set(0.8, 4.05, 0); group.add(flag);
    const ring = new THREE.Mesh(new THREE.RingGeometry(CAPTURE_RADIUS - 0.13, CAPTURE_RADIUS, 64), new THREE.MeshBasicMaterial({ color: COLORS.neutral, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
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
    this.weapon = new THREE.Group(); this.camera.add(this.weapon);
    this.weapon.position.set(0.26, -0.23, -0.42);
    const black = material(0x20272a, 0.5, 0.65);
    const metal = material(0x4b5456, 0.4, 0.8);
    const grip = material(0x343d39, 0.9, 0.1);
    const glove = material(0x4f5144, 0.95, 0.05);
    const sleeve = this.surfaces.cloth.clone(); sleeve.color.set(0x899681);
    const skin = material(0x9b876d, 0.95, 0);
    const g = this.weapon;
    this.rounded(g, 0, 0, -0.08, 0.12, 0.14, 0.39, black);
    this.handguard = this.rounded(g, 0, 0.015, -0.37, 0.096, 0.105, 0.34, grip);
    this.bolt=this.box(g, 0.065, 0.012, -0.02, 0.015, 0.05, 0.13, metal);
    this.box(g, 0.076, 0.016, 0.055, 0.045, 0.018, 0.025, metal);
    const stampTexture=canvasTexture(256,(ctx)=>{ctx.clearRect(0,0,256,256);ctx.fillStyle='#929b97';ctx.font='24px monospace';ctx.textAlign='center';ctx.fillText('S09 / 5.56 NATO',128,125);ctx.font='15px monospace';ctx.fillText('SELECT FIRE  ·  0416',128,155);});
    const stamp=new THREE.Mesh(new THREE.PlaneGeometry(.17,.17),new THREE.MeshStandardMaterial({map:stampTexture,transparent:true,roughness:.8,depthWrite:false}));stamp.position.set(-.061,0,-.055);stamp.rotation.y=-Math.PI/2;g.add(stamp);
    this.box(g, 0, 0.088, -0.15, 0.075, 0.025, 0.44, metal);
    for (let z = -0.39; z < 0.05; z += 0.034) this.box(g, 0, 0.109, z, 0.082, 0.015, 0.012, black);
    for (let z = -0.49; z < -0.22; z += 0.045) {
      this.box(g, 0.051, 0, z, 0.012, 0.032, 0.018, black);
      this.box(g, -0.051, 0, z, 0.012, 0.032, 0.018, black);
    }
    this.barrel = this.cylinder(g, 0, 0.015, -0.63, 0.017, 0.22, metal); this.barrel.rotation.x = Math.PI / 2;
    this.barrelSleeve = this.cylinder(g, 0, 0.015, -0.56, 0.027, 0.08, black); this.barrelSleeve.rotation.x = Math.PI / 2;
    this.muzzle = this.cylinder(g, 0, 0.015, -0.76, 0.025, 0.07, black); this.muzzle.rotation.x = Math.PI / 2;
    this.suppressor = this.cylinder(g,0,.015,-.83,.036,.24,black);this.suppressor.rotation.x=Math.PI/2;this.suppressor.visible=false;
    for(const side of [-1,1])for(let z=-.22;z<.06;z+=.075){const screw=this.cylinder(g,side*.063,.015,z,.008,.007,metal);screw.rotation.z=Math.PI/2;}
    this.supportAttachment=new THREE.Group();g.add(this.supportAttachment);
    for(const side of [-1,1]){const bipod=this.cylinder(this.supportAttachment,side*.04,-.115,-.42,.012,.22,metal);bipod.rotation.z=side*.23;}
    this.supportAttachment.visible=false;
    // Open iron sights leave a clear center when aiming down sights.
    this.box(g, 0, 0.137, -0.43, 0.012, 0.065, 0.018, black);
    for (const side of [-1, 1]) this.box(g, side * 0.027, 0.148, -0.43, 0.008, 0.05, 0.014, black);
    this.box(g, 0, 0.126, 0.015, 0.07, 0.025, 0.025, black);
    for (const side of [-1, 1]) this.box(g, side * 0.024, 0.15, 0.015, 0.012, 0.04, 0.025, black);
    this.scope = new THREE.Group(); g.add(this.scope);
    const scopeTube = this.cylinder(this.scope, 0, 0.18, -0.15, 0.047, 0.23, black); scopeTube.rotation.x = Math.PI / 2;
    this.box(this.scope, 0, 0.13, -0.15, 0.035, 0.1, 0.09, metal);
    const scopeLens = this.cylinder(this.scope, 0, 0.18, -0.025, 0.043, 0.004, material(0x32666c, 0.1, 0.5)); scopeLens.rotation.x = Math.PI / 2;
    this.scope.visible = false;
    this.magazine = new THREE.Group(); g.add(this.magazine);
    const mag = this.rounded(this.magazine, 0, -0.19, -0.08, 0.083, 0.25, 0.12, grip); mag.rotation.x = -0.12;
    for (let y = -0.26; y < -0.08; y += 0.045) this.box(this.magazine, 0.043, y, -0.08, 0.006, 0.012, 0.095, black);
    const pistolGrip = this.rounded(g, 0, -0.15, 0.105, 0.075, 0.17, 0.08, grip); pistolGrip.rotation.x = -0.28;
    this.rounded(g, 0, -0.015, 0.28, 0.09, 0.105, 0.28, grip);
    this.rounded(g, 0, -0.035, 0.44, 0.12, 0.2, 0.065, black);
    // Procedural gloved hands, sleeve cuffs and forearms.
    const rightHand = this.rounded(g, 0.025, -0.15, 0.1, 0.105, 0.13, 0.1, glove); rightHand.rotation.z = -0.15;
    this.box(g, 0.087, -0.105, 0.035, 0.024, 0.035, 0.11, glove);
    const rightArm = this.rounded(g, 0.1, -0.29, 0.24, 0.15, 0.26, 0.32, sleeve); rightArm.rotation.x = -0.55; rightArm.rotation.z = -0.2;
    const leftHand = this.rounded(g, -0.018, -0.075, -0.36, 0.13, 0.09, 0.15, glove); leftHand.rotation.z = 0.1;this.leftHand=leftHand;
    for (let i = 0; i < 4; i++) this.box(g, -0.06 + i * 0.025, -0.035, -0.39, 0.02, 0.042, 0.06, glove);
    const leftArm = this.rounded(g, -0.17, -0.17, -0.15, 0.14, 0.15, 0.46, sleeve); leftArm.rotation.y = -0.65; leftArm.rotation.z = -0.2;this.leftArm=leftArm;
    for(let i=0;i<4;i++)this.rounded(g,-.058+i*.025,-.025,-.375,.022,.018,.055,black);
    this.box(g, -0.1, -0.13, -0.31, 0.13, 0.025, 0.08, skin);
    this.flashMaterial = new THREE.MeshBasicMaterial({ color: 0xffd584, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide });
    this.muzzleFlash = new THREE.Group(); this.muzzleFlash.position.set(0, 0.015, -0.81); g.add(this.muzzleFlash);
    const flash = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.22, 5), this.flashMaterial); flash.rotation.x = -Math.PI / 2; flash.position.z = -0.08;
    this.muzzleFlash.add(flash); this.muzzleFlash.visible = false;
    const flashCore=new THREE.Mesh(new THREE.SphereGeometry(.033,8,6),new THREE.MeshBasicMaterial({color:0xfff3cb}));this.muzzleFlash.add(flashCore);
    this.flashLight = new THREE.PointLight(0xffc36e, 0, 4, 2); this.flashLight.position.set(0, 0, -0.9); g.add(this.flashLight);
    prepareViewModel(g);
  }

  makeSoldier(player) {
    const group = new THREE.Group();
    if (!this.soldierMaterials.has(player.team)) {
      const uniform = this.surfaces.cloth.clone(); uniform.color.setHex(player.team === 0 ? 0x849b8b : 0xb6a584);
      this.soldierMaterials.set(player.team, { uniform, vest: material(player.team === 0 ? 0x424d43 : 0x5b5949), skin: material(0x9a846b), boots: material(0x303635), gun: material(0x293134, 0.5, 0.65) });
    }
    const { uniform, vest, skin, boots, gun } = this.soldierMaterials.get(player.team);
    const pose = new THREE.Group(); group.add(pose);
    this.rounded(pose, 0, .88, 0, .35, .22, .24, uniform);
    this.rounded(pose, 0, 1.2, 0, .39, .43, .25, uniform);
    this.rounded(pose, 0, 1.2, -.035, .42, .35, .29, vest);
    for (let x = -.12; x < .17; x += .12) this.rounded(pose, x, 1.08, -.205, .1, .15, .07, vest);
    this.rounded(pose, 0, 1.2, .2, .3, .34, .15, vest);
    for (const side of [-1, 1]) {
      const strap = this.box(pose, side * .12, 1.34, .015, .055, .13, .31, boots); strap.rotation.z = side * .1;
    }
    const head = new THREE.Group(); head.position.y = 1.57; pose.add(head);
    const face = new THREE.Mesh(this.geo.sphere, skin); face.scale.set(0.115, 0.145, 0.115); head.add(face);
    const helmet = new THREE.Mesh(this.geo.sphere, uniform); helmet.scale.set(.145,.11,.15); helmet.position.set(0,.08,.012); head.add(helmet); helmet.castShadow = true;
    this.rounded(head,0,.02,-.112,.17,.045,.035,gun);
    this.rounded(head,0,-.075,-.08,.19,.08,.12,vest);
    this.box(head,.145,.02,.01,.035,.08,.09,boots);
    this.box(head,-.145,.02,.01,.035,.08,.09,boots);
    const legs = [], arms = [], knees = [], elbows = [];
    for (const side of [-1, 1]) {
      const leg=new THREE.Group();leg.position.set(side*.105,.9,0);pose.add(leg);
      this.rounded(leg,0,-.19,0,.17,.38,.19,uniform);
      this.rounded(leg,side*.07,-.14,.015,.08,.19,.15,vest);
      const knee=new THREE.Group();knee.position.y=-.39;leg.add(knee);
      this.rounded(knee,0,-.18,.015,.14,.37,.16,uniform);
      this.rounded(knee,0,-.015,-.085,.15,.14,.065,vest);
      this.rounded(knee,0,-.415,-.045,.17,.14,.27,boots);legs.push(leg);knees.push(knee);
      const arm=new THREE.Group();arm.position.set(side*.255,1.4,.01);pose.add(arm);
      this.rounded(arm,0,-.13,0,.15,.29,.17,uniform);
      const elbow=new THREE.Group();elbow.position.y=-.28;elbow.rotation.x=1.25;arm.add(elbow);
      this.rounded(elbow,0,-.13,0,.125,.27,.145,uniform);
      this.rounded(elbow,0,-.285,-.005,.11,.12,.12,boots);
      this.rounded(elbow,0,-.04,.065,.13,.12,.055,vest);arms.push(arm);elbows.push(elbow);
    }
    const rifle=new THREE.Group();rifle.position.set(.1,1.12,-.34);pose.add(rifle);
    this.rounded(rifle,0,0,-.1,.07,.1,.47,gun);this.rounded(rifle,0,-.09,-.02,.055,.15,.08,gun);this.box(rifle,0,.01,-.41,.025,.025,.2,gun);
    const flash=new THREE.Mesh(new THREE.ConeGeometry(.075,.22,5),new THREE.MeshBasicMaterial({color:0xffd38b,transparent:true,opacity:.9}));flash.rotation.x=-Math.PI/2;flash.position.set(0,.01,-.58);flash.visible=false;flash.userData.animated=true;rifle.add(flash);
    const marker=new THREE.Mesh(new THREE.OctahedronGeometry(.065),new THREE.MeshBasicMaterial({color:COLORS.friendly}));marker.position.y=1.94;marker.userData.animated=true;group.add(marker);
    this.batchActor(pose);
    // At long range, render a baked silhouette instead of every moving joint.
    const distant=new THREE.Group();group.add(distant);
    this.rounded(distant,0,1.14,0,.44,.56,.3,uniform);
    const distantHead=new THREE.Mesh(this.geo.sphere,uniform);distantHead.position.set(0,1.61,0);distantHead.scale.set(.14,.17,.15);distant.add(distantHead);
    for(const side of [-1,1])this.rounded(distant,side*.105,.46,0,.16,.83,.18,uniform);
    this.box(distant,.1,1.12,-.34,.07,.08,.65,gun);this.batchActor(distant);distant.visible=false;
    this.scene.add(group);
    return {group,pose,distant,head,legs,arms,knees,elbows,rifle,marker,uniform,flash,lastX:player.x,lastZ:player.z,lastTime:0,targetSpeed:0,speed:0,walk:0,initialized:false,deathAge:0,alive:true,recoil:0,lastShot:player.shotSeq};
  }

  updateSoldiers(state, localId, dt) {
    const active = new Set();
    const local = state.players.find(p => p.id === localId), localTeam = local?.team ?? 0;
    for (const player of state.players) {
      if (player.id === localId) continue;
      active.add(player.id);
      let soldier = this.soldiers.get(player.id);
      if (!soldier) { soldier = this.makeSoldier(player); this.soldiers.set(player.id, soldier); }
      if(player.alive===false){
        soldier.deathAge+=dt;soldier.group.visible=soldier.deathAge<3.6;soldier.marker.visible=false;soldier.flash.visible=false;
        soldier.group.rotation.x=lerp(soldier.group.rotation.x,-1.45,1-Math.exp(-dt*6));
        soldier.group.position.y=lerp(soldier.group.position.y,(player.y||0)+.23,1-Math.exp(-dt*6));
        soldier.legs[0].rotation.x=.3;soldier.legs[1].rotation.x=-.2;soldier.alive=false;continue;
      }
      soldier.group.visible=true;
      if(!soldier.alive){soldier.initialized=false;soldier.group.rotation.x=0;soldier.deathAge=0;soldier.alive=true;}
      const blend = soldier.initialized ? 1 - Math.exp(-dt * 18) : 1;
      const distance = Math.hypot(player.x - soldier.lastX, player.z - soldier.lastZ);
      if(state.time!==soldier.lastTime){
        const elapsed=state.time-soldier.lastTime;
        soldier.targetSpeed=elapsed>0&&elapsed<.5?Math.min(12,distance/elapsed):0;
        soldier.lastTime=state.time;soldier.lastX=player.x;soldier.lastZ=player.z;
      }
      soldier.speed=lerp(soldier.speed,soldier.targetSpeed,1-Math.exp(-dt*10));soldier.walk+=soldier.speed*dt*2.6;
      const move=clamp(soldier.speed/4,0,1),run=player.sprint?1:0;
      soldier.group.position.lerp(this.scratchPosition.set(player.x, player.y || 0, player.z), blend);
      const yawDifference = Math.atan2(Math.sin((player.yaw || 0) - soldier.group.rotation.y), Math.cos((player.yaw || 0) - soldier.group.rotation.y));
      soldier.group.rotation.y += yawDifference * blend;
      const crouched = player.crouching || player.crouch;
      soldier.pose.position.y=lerp(soldier.pose.position.y,crouched?-.34:0,blend);
      soldier.head.rotation.x=(player.pitch||0)*.7;
      if(player.shotSeq!==soldier.lastShot){soldier.recoil=1;soldier.lastShot=player.shotSeq;}
      soldier.recoil*=Math.exp(-dt*18);soldier.rifle.rotation.x=(player.pitch||0)*.7+soldier.recoil*.08;
      soldier.rifle.position.z=-.34+soldier.recoil*.025;soldier.flash.visible=soldier.recoil>.5;
      for(let i=0;i<2;i++){
        const phase=soldier.walk+i*Math.PI,swing=Math.sin(phase)*move*(run?.85:.55);
        soldier.legs[i].rotation.x=swing+(crouched?-.65:0);
        soldier.knees[i].rotation.x=Math.max(0,-Math.sin(phase))*.65*move+(crouched?1.1:0);
        soldier.arms[i].rotation.x=(run?Math.sin(phase)*.22*move:.05)-(player.pitch||0)*.35;
        soldier.elbows[i].rotation.x=1.15+(run?Math.sin(phase)*.12:0)+soldier.recoil*.08;
      }
      soldier.pose.rotation.z=Math.sin(soldier.walk)*.025*move;
      const distant=local&&Math.hypot(player.x-local.x,player.z-local.z)>(this.lowQuality?55:95);
      soldier.pose.visible=!distant;soldier.distant.visible=!!distant;
      soldier.marker.material.color.setHex(player.team === localTeam ? COLORS.friendly : COLORS.enemy);
      soldier.marker.visible = player.team === localTeam;
      soldier.marker.position.y=(crouched?1.55:1.94)+Math.sin(this.clock*2)*.025;
      soldier.initialized = true;
    }
    for (const [id, soldier] of this.soldiers) if (!active.has(id)) { this.scene.remove(soldier.group); this.soldiers.delete(id); }
  }

  processEvents(state, localId) {
    for (const event of state.events || []) {
      const key = event.id ?? `${event.type}:${event.playerId}:${event.time}:${event.x}:${event.z}`;
      if (this.seenEvents.has(key)) continue;
      this.seenEvents.add(key);
      if (event.type === 'shot') {
        const player = state.players.find(p => p.id === event.playerId);
        const x = event.x ?? player?.x ?? 0, y = event.y ?? ((player?.y || 0) + 1.35), z = event.z ?? player?.z ?? 0;
        const tx = event.tx ?? x - Math.sin(player?.yaw || 0) * 60;
        const ty = event.ty ?? y + Math.sin(player?.pitch || 0) * 60;
        const tz = event.tz ?? z - Math.cos(player?.yaw || 0) * 60;
        const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, y, z), new THREE.Vector3(tx, ty, tz)]);
        const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffd99b, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
        this.scene.add(line); this.effects.push({ mesh: line, age: 0, life: 0.065, type: 'tracer', ownedGeometry:true, ownedMaterial:true });
        if (event.playerId === localId) {
          this.kick = Math.max(this.kick, 1);
          const yaw=player?.yaw||0,shell=new THREE.Mesh(this.geo.shell,this.shellMaterial);
          shell.position.set(x+Math.cos(yaw)*.25,y-.1,z-Math.sin(yaw)*.25);shell.rotation.z=Math.PI/2;this.scene.add(shell);
          this.effects.push({mesh:shell,age:0,life:1.25,type:'shell',vx:Math.cos(yaw)*2.4,vy:1.2+this.random(),vz:-Math.sin(yaw)*2.4,spin:8+this.random()*8});
        }
        const length=Math.hypot(tx-x,ty-y,tz-z),range=CLASSES[player?.classId]?.range||200;
        if(this.effects.length<120&&length<range-1){
          this.smoke(tx,ty,tz,event.hit?.2:.35,event.hit?.35:.8,event.hit?0x7d665b:0xaca998);
          if(!event.hit&&!this.lowQuality)for(let i=0;i<2;i++)this.spark(tx,ty,tz);
        }
      }
      if (event.type === 'explosion') {
        const x = event.x || 0, y = event.y ?? 0.6, z = event.z || 0;
        for (let i = 0; i < 13; i++) this.smoke(x + (this.random() - 0.5) * 2, y + this.random() * 2, z + (this.random() - 0.5) * 2, 1.1 + this.random() * 1.4, 2.5 + this.random() * 2, i < 3 ? 0xffb668 : 0x535953);
        const light = new THREE.PointLight(0xffaa55, 18, 15, 2); light.position.set(x, y + 1, z); this.scene.add(light); this.effects.push({ mesh: light, age: 0, life: 0.22, type: 'light' });
        for(let i=0;i<(this.lowQuality?6:16);i++)this.spark(x,y+.3,z,3);
      }
    }
    if (this.seenEvents.size > 1400) this.seenEvents = new Set([...this.seenEvents].slice(-700));
  }

  smoke(x, y, z, size, life, color) {
    if (this.effects.length > 180) return;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTexture, color, transparent: true, opacity: 0.6, depthWrite: false, rotation: this.random() * Math.PI }));
    sprite.position.set(x, y, z); sprite.scale.setScalar(size); this.scene.add(sprite);
    this.effects.push({ mesh: sprite, age: 0, life, size, type: 'smoke', vx: (this.random() - 0.5) * 0.6, vz: (this.random() - 0.5) * 0.6,ownedMaterial:true });
  }

  spark(x,y,z,force=1){
    if(this.effects.length>180)return;
    const mesh=new THREE.Mesh(this.geo.sphere,this.sparkMaterial);mesh.scale.setScalar(.014*force);mesh.position.set(x,y,z);this.scene.add(mesh);
    this.effects.push({mesh,age:0,life:.2+this.random()*.2,type:'spark',vx:(this.random()-.5)*4*force,vy:(1+this.random()*2)*force,vz:(this.random()-.5)*4*force});
  }

  updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i]; effect.age += dt;
      if (effect.age >= effect.life) {
        this.scene.remove(effect.mesh); if(effect.ownedGeometry)effect.mesh.geometry?.dispose();if(effect.ownedMaterial)effect.mesh.material?.dispose(); this.effects.splice(i, 1); continue;
      }
      const alpha = 1 - effect.age / effect.life;
      if (effect.type === 'smoke') {
        effect.mesh.position.x += effect.vx * dt; effect.mesh.position.z += effect.vz * dt; effect.mesh.position.y += dt * 0.8;
        effect.mesh.scale.setScalar(effect.size * (1 + effect.age * 1.5)); effect.mesh.material.opacity = alpha * 0.55;
      } else if(effect.type==='spark'||effect.type==='shell'){
        effect.vy-=dt*9.8;effect.mesh.position.x+=effect.vx*dt;effect.mesh.position.y+=effect.vy*dt;effect.mesh.position.z+=effect.vz*dt;
        effect.mesh.rotation.x+=dt*(effect.spin||9);effect.mesh.rotation.z+=dt*(effect.spin||6);
        if(effect.mesh.position.y<.03){effect.mesh.position.y=.03;effect.vy=Math.abs(effect.vy)*.25;effect.vx*=.72;effect.vz*=.72;}
        if(effect.type==='spark')effect.mesh.scale.setScalar(.025*alpha);
      } else if (effect.type === 'light') effect.mesh.intensity = alpha * 18;
      else effect.mesh.material.opacity = alpha;
    }
  }

  updateGrenades(state) {
    const active = new Set();
    for (const grenade of state.grenades || []) {
      active.add(grenade.id);
      let mesh = this.grenadeMeshes.get(grenade.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.geo.sphere, material(0x485545, 0.7, 0.4, { emissive: 0xa96220, emissiveIntensity: 0.2 }));
        mesh.scale.set(0.11, 0.15, 0.11); mesh.castShadow = true; this.scene.add(mesh); this.grenadeMeshes.set(grenade.id, mesh);
      }
      mesh.visible = true; mesh.position.set(grenade.x, grenade.y, grenade.z); mesh.rotation.x = this.clock * 4;
      mesh.material.emissiveIntensity = 0.1 + (Math.sin(this.clock * 12) + 1) * 0.6;
    }
    for (const [id, mesh] of this.grenadeMeshes) if (!active.has(id)) { mesh.removeFromParent(); mesh.material.dispose(); this.grenadeMeshes.delete(id); }
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
  }

  drawScene(){drawWorldAndViewModel(this.renderer,this.scene,this.camera,this.weapon);}

  render(state, localId, dt, view = {}) {
    dt = Math.min(dt || 0.016, 0.1); this.clock += dt;
    const baseFov=clamp(Number(view.fov)||85,65,105),shake=view.shake!==false;
    this.renderer.toneMappingExposure=1.06*clamp(Number(view.brightness)||1,.6,1.5);
    const low = view.quality === 'low';
    if (this.lowQuality !== low) {
      this.lowQuality = low; this.renderer.shadowMap.enabled = !low; this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1 : 1.75)); this.resize();
    }
    if (!state?.players) {
      this.cameraPlayerId = null;
      const angle = this.clock * 0.012,radius=Math.min(MAP.size*.36,130);
      this.camera.position.set(Math.sin(angle + 0.9) * radius, 58+Math.sin(this.clock*.025)*8, Math.cos(angle + 0.9) * radius);
      this.camera.lookAt(0, 3, -12); this.weapon.visible = false;
      this.atmosphere.sky.position.copy(this.camera.position);
      if (this.camera.fov !== 70) { this.camera.fov = 70; this.camera.updateProjectionMatrix(); }
      this.sun.position.set(-90,75,65); this.sun.target.position.set(0, 0, 0);
      for (const soldier of this.soldiers.values()) soldier.group.visible = false;
      for (const grenade of this.grenadeMeshes.values()) grenade.visible = false;
      this.updateEffects(dt);
      this.drawScene(); return;
    }
    const player = state.players.find(p => p.id === localId);
    const isAlive = player?.alive !== false;
    if (player) {
      const yaw = view.yaw ?? player.yaw ?? 0, pitch = view.pitch ?? player.pitch ?? 0;
      const crouching = view.crouch ?? player.crouching ?? player.crouch;
      const height = isAlive ? (crouching ? 1.05 : 1.65) : 0.5;
      const coverDistance=distanceToCover({x:player.x,y:(player.y||0)+height,z:player.z},{x:-Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(yaw)*Math.cos(pitch)},MAP.boxes,1.6);
      this.wallStow=lerp(this.wallStow,clamp((1.45-coverDistance)/1.05,0,1),1-Math.exp(-dt*14));
      this.aimAmount = lerp(this.aimAmount, view.aim && isAlive && this.wallStow<.2 ? 1 : 0, 1 - Math.exp(-dt * 15));
      this.reloadAmount = lerp(this.reloadAmount, player.reloading ? 1 : 0, 1 - Math.exp(-dt * 8));
      if(player.reloading&&!this.wasReloading)this.reloadStarted=this.clock;
      this.wasReloading=!!player.reloading;
      const reloadPhase=player.reloading?clamp((this.clock-(this.reloadStarted||this.clock))/(player.classId==='support'?3.1:2),0,1):1;
      const reloadMotion=Math.sin(reloadPhase*Math.PI)*this.reloadAmount;
      const moving = view.move ? 1 : 0;
      const sprint = view.sprint && !view.aim;
      const bob = moving * (1 - this.aimAmount * 0.8);
      const cycle = this.clock * (sprint ? 13 : 9);
      const target = this.scratchPosition.set(player.x, player.y || 0, player.z);
      // Smooth authoritative 20 Hz movement without delaying mouse look. A
      // respawn/teleport must never drag the camera across the entire map.
      if (this.cameraPlayerId !== localId || this.cameraAlive !== isAlive || this.cameraAnchor.distanceToSquared(target) > 64) {
        this.cameraAnchor.copy(target);
        this.lastYaw = yaw; this.lastPitch = pitch;
      } else this.cameraAnchor.lerp(target, 1 - Math.exp(-dt * 28));
      this.cameraPlayerId = localId; this.cameraAlive = isAlive;
      this.camera.position.set(this.cameraAnchor.x, this.cameraAnchor.y + height + (shake?Math.sin(cycle * 2) * 0.018 * bob:0), this.cameraAnchor.z);
      this.kick = Math.max(view.recoil || 0, this.kick * Math.exp(-dt * 16));
      if (player.shotSeq !== undefined && player.shotSeq !== this.lastShot) {
        if (this.lastShot !== -1) this.kick = 1;
        this.lastShot = player.shotSeq;
      }
      this.camera.rotation.set(pitch + (shake?this.kick * 0.008:0), yaw, moving&&shake ? Math.sin(cycle) * 0.0018 : 0, 'YXZ');
      const fov = lerp(sprint ? baseFov+6 : baseFov, baseFov-(player.classId==='recon'?38:23), this.aimAmount);
      if (Math.abs(this.camera.fov - fov) > 0.03) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
      this.swayX = lerp(this.swayX, clamp(Math.atan2(Math.sin(yaw - this.lastYaw), Math.cos(yaw - this.lastYaw)) * 1.3, -0.025, 0.025), 0.18);
      this.swayY = lerp(this.swayY, clamp((pitch - this.lastPitch) * 1.3, -0.02, 0.02), 0.18);
      this.lastYaw = yaw; this.lastPitch = pitch;
      this.weapon.visible = isAlive;
      this.scope.visible = player.classId === 'recon' && this.aimAmount < 0.9;
      this.supportAttachment.visible=player.classId==='support';this.suppressor.visible=player.classId==='recon';
      this.handguard.scale.z=player.classId==='medic'?.25:.34;
      this.barrel.scale.y=player.classId==='medic'?.14:player.classId==='recon'?.32:.22;
      this.barrel.position.z=player.classId==='medic'?-.59:player.classId==='recon'?-.69:-.63;
      this.muzzle.position.z=player.classId==='medic'?-.68:player.classId==='recon'?-.85:-.76;
      this.muzzleFlash.position.z=player.classId==='recon'?-.97:player.classId==='medic'?-.73:-.81;
      this.magazine.scale.set(player.classId === 'support' ? 1.55 : 1, player.classId === 'medic' ? 1.15 : player.classId === 'recon' ? 0.65 : 1, player.classId === 'support' ? 1.55 : 1);
      this.weapon.position.set(
        lerp(0.26, 0, this.aimAmount) + Math.sin(cycle) * 0.012 * bob - this.swayX,
        lerp(-0.23, -0.167, this.aimAmount) + Math.abs(Math.cos(cycle)) * 0.012 * bob - this.swayY - reloadMotion * 0.12,
        lerp(-0.42, -0.32, this.aimAmount) + this.kick * 0.045 + reloadMotion * 0.08,
      );
      this.weapon.rotation.set(this.kick * 0.045 - reloadMotion * 0.45, reloadMotion * -0.18 + (sprint ? 0.2 : 0), reloadMotion * -0.5 + (sprint ? 0.14 : 0));
      this.weapon.position.y-=this.wallStow*.28;this.weapon.position.z+=this.wallStow*.18;this.weapon.rotation.x-=this.wallStow*.85;
      this.magazine.position.set(-reloadMotion*.07,-reloadMotion*.22,0);this.magazine.rotation.z=-reloadMotion*.15;
      this.leftHand.position.set(-.018-reloadMotion*.03,-.075-reloadMotion*.17,-.36+reloadMotion*.22);
      this.leftArm.rotation.y=-.65+reloadMotion*.2;this.leftArm.position.y=-.17-reloadMotion*.08;
      this.bolt.position.z=-.02+this.kick*.055;
      this.muzzleFlash.visible = this.kick > 0.65; this.muzzleFlash.rotation.z = this.clock * 41;
      this.flashLight.intensity = this.kick > 0.65 ? 2 : 0;
      this.sun.position.set(this.cameraAnchor.x-90,75,this.cameraAnchor.z+65);this.sun.target.position.set(this.cameraAnchor.x,0,this.cameraAnchor.z);
    }
    const localTeam = player?.team ?? 0;
    for (const point of state.points || []) {
      const flag = this.flags.get(point.id); if (!flag) continue;
      const color = point.owner === -1 || point.owner == null ? COLORS.neutral : point.owner === localTeam ? COLORS.friendly : COLORS.enemy;
      flag.flag.material.color.setHex(color); flag.ring.material.color.setHex(color); flag.label.material.color.setHex(color);
      flag.ring.material.opacity = point.contested ? 0.22 + Math.sin(this.clock * 8) * 0.12 : 0.19;
      const positions = flag.flag.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) { const x = positions.getX(i) + 0.775; positions.setZ(i, Math.sin(this.clock * 3.5 + x * 4) * 0.09 * x); }
      positions.needsUpdate = true;
    }
    this.updateSoldiers(state, localId, dt); this.updateGrenades(state); this.processEvents(state, localId); this.updateEffects(dt);
    this.atmosphere.sky.position.copy(this.camera.position);
    this.drawScene();
  }

  getStats() { return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, effects: this.effects.length, geometries: this.renderer.info.memory.geometries }; }

  project(x, y, z) {
    const position = new THREE.Vector3(x, y, z).project(this.camera);
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    return { x: (position.x * 0.5 + 0.5) * width, y: (-position.y * 0.5 + 0.5) * height, visible: position.z > -1 && position.z < 1 && Math.abs(position.x) < 1.1 && Math.abs(position.y) < 1.1 };
  }

  dispose() {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    this.scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      for (const mat of object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []) {
        materials.add(mat); for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
      }
    });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); this.atmosphere.target.dispose();this.renderer.dispose();
  }
}
