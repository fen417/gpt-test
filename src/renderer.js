import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAP, CAPTURE_RADIUS } from '../shared/world.js';

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
    this.random = seeded();
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
    } catch (error) {
      onError?.(error);
      throw error;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x89959c);
    this.scene.fog = new THREE.FogExp2(0x89959c, 0.0085);
    this.camera = new THREE.PerspectiveCamera(78, 1, 0.06, 350);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight(0xc0d4e4, 0x555047, 2.5));
    this.scene.add(new THREE.AmbientLight(0x99a7b2, 0.35));
    this.sun = new THREE.DirectionalLight(0xffe1b3, 3.0);
    this.sun.position.set(-55, 90, 35);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -62, right: 62, top: 62, bottom: -62, near: 1, far: 200 });
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.geo = {
      box: new THREE.BoxGeometry(1, 1, 1),
      cylinder: new THREE.CylinderGeometry(1, 1, 1, 10),
      sphere: new THREE.SphereGeometry(1, 10, 8),
    };
    this.materials = {
      concrete: material(0x6f716e), darkConcrete: material(0x414948), edge: material(0x929087),
      asphalt: material(0x353c3e), steel: material(0x323c3e, 0.55, 0.65), rust: material(0x735344, 0.8, 0.4),
      roof: material(0x4e5655), window: material(0x23363e, 0.25, 0.4), marking: material(0xb5b1a0),
      sand: material(0x8d8067), foliage: material(0x4c5b4c), pole: material(0x788185, 0.4, 0.75),
      glow: new THREE.MeshBasicMaterial({ color: 0xffd8a1 }),
    };
    this.buildWorld();
    this.mergeStaticWorld();
    this.buildWeapon();
    this.smokeTexture = canvasTexture(64, (ctx, size) => {
      const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      gradient.addColorStop(0, 'rgba(255,255,255,.65)'); gradient.addColorStop(0.4, 'rgba(255,255,255,.45)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, size, size);
    });
    this.resize();
  }

  box(parent, x, y, z, w, h, d, mat, shadow = true) {
    const mesh = new THREE.Mesh(this.geo.box, mat);
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
    mesh.castShadow = shadow; mesh.receiveShadow = shadow;
    parent.add(mesh); return mesh;
  }

  cylinder(parent, x, y, z, radius, height, mat, segments = 10) {
    const mesh = new THREE.Mesh(segments === 10 ? this.geo.cylinder : new THREE.CylinderGeometry(1, 1, 1, segments), mat);
    mesh.position.set(x, y, z); mesh.scale.set(radius, height, radius); mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }

  buildWorld() {
    const random = this.random;
    const size = MAP.size || 200;
    const groundTexture = canvasTexture(256, (ctx, s) => {
      ctx.fillStyle = '#64665f'; ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 9000; i++) {
        const shade = Math.floor(65 + random() * 85);
        ctx.fillStyle = `rgba(${shade},${shade},${shade - 5},.23)`;
        ctx.fillRect(random() * s, random() * s, random() * 3 + 1, 1);
      }
      ctx.strokeStyle = 'rgba(30,35,33,.2)'; ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, s, s);
      for (let i = 0; i < 5; i++) {
        let x = random() * s, y = random() * s; ctx.beginPath(); ctx.moveTo(x, y);
        for (let j = 0; j < 8; j++) { x += random() * 20 - 10; y += random() * 20 - 10; ctx.lineTo(x, y); }
        ctx.stroke();
      }
    });
    groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(38, 38); groundTexture.anisotropy = Math.min(this.renderer.capabilities.getMaxAnisotropy(), 8);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size + 200, size + 200), material(0x999b90, 1, 0, { map: groundTexture }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.scene.add(ground);
    // Painted service roads are flat: no invisible curb collision.
    this.box(this.scene, 0, 0.012, 0, 15, 0.02, size + 10, this.materials.asphalt, false);
    this.box(this.scene, 0, 0.015, 0, size + 10, 0.02, 13, this.materials.asphalt, false);
    for (let i = -size / 2 + 8; i < size / 2; i += 10) {
      if (Math.abs(i) > 10) {
        this.box(this.scene, 0, 0.032, i, 0.13, 0.015, 4.8, this.materials.marking, false);
        this.box(this.scene, i, 0.033, 0, 4.8, 0.015, 0.13, this.materials.marking, false);
      }
    }
    const windowMatrices = [], litMatrices = [];
    const dummy = new THREE.Object3D();
    for (const b of MAP.boxes || []) {
      const h = b.h ?? 3, w = b.w ?? 4, d = b.d ?? 4;
      const building = h > 5;
      const container = String(b.kind || '').includes('container') || (!building && w > 7 && h > 2);
      const mat = b.color ? material(b.color) : container ? material([0x536e70, 0x716555, 0x73584c, 0x4c615b][Math.floor(random() * 4)], 0.7, 0.4) : building ? material([0x777b76, 0x69716e, 0x838075, 0x6c6b65][Math.floor(random() * 4)]) : this.materials.concrete;
      this.box(this.scene, b.x, h / 2, b.z, w, h, d, mat);
      if (building) {
        this.box(this.scene, b.x, h + 0.13, b.z, w + 0.3, 0.26, d + 0.3, this.materials.edge);
        this.box(this.scene, b.x, 0.45, b.z, w + 0.12, 0.9, d + 0.12, this.materials.darkConcrete);
        for (let y = 2.8; y < h - 0.9; y += 3.1) {
          for (const face of [-1, 1]) {
            for (let x = -w / 2 + 1.5; x < w / 2 - 0.7; x += 2.7) {
              dummy.position.set(b.x + x, y, b.z + face * (d / 2 + 0.021)); dummy.rotation.set(0, 0, 0); dummy.scale.set(1.3, 1.55, 0.035); dummy.updateMatrix();
              (random() > 0.88 ? litMatrices : windowMatrices).push(dummy.matrix.clone());
            }
            for (let z = -d / 2 + 1.5; z < d / 2 - 0.7; z += 2.7) {
              dummy.position.set(b.x + face * (w / 2 + 0.021), y, b.z + z); dummy.rotation.set(0, 0, 0); dummy.scale.set(0.035, 1.55, 1.3); dummy.updateMatrix();
              (random() > 0.9 ? litMatrices : windowMatrices).push(dummy.matrix.clone());
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
        if (w > 8) {
          this.box(this.scene, b.x, 1.45, b.z + d / 2 + 0.035, Math.min(4.1, w * 0.4), 2.9, 0.06, this.materials.steel);
          for (let y = 0.3; y < 2.8; y += 0.27) this.box(this.scene, b.x, y, b.z + d / 2 + 0.075, Math.min(4.1, w * 0.4), 0.035, 0.03, this.materials.edge, false);
        }
      } else if (container) {
        for (let x = -w / 2 + 0.25; x < w / 2; x += 0.6) {
          for (const side of [-1, 1]) this.box(this.scene, b.x + x, h / 2, b.z + side * (d / 2 + 0.02), 0.065, h * 0.92, 0.05, mat, false);
        }
        this.box(this.scene, b.x, h + 0.025, b.z, w + 0.05, 0.05, d + 0.05, this.materials.steel, false);
      } else {
        this.box(this.scene, b.x, h - 0.08, b.z, w + 0.08, 0.16, d + 0.08, this.materials.edge);
        if (h < 2) {
          const stripe = material(0x9b8a55);
          this.box(this.scene, b.x, h * 0.65, b.z + d / 2 + 0.015, w * 0.85, Math.min(0.14, h * 0.15), 0.02, stripe, false);
        }
      }
    }
    for (const [matrices, mat] of [[windowMatrices, this.materials.window], [litMatrices, material(0xb5a27c, 0.6, 0.2, { emissive: 0x7c633c, emissiveIntensity: 0.45 })]]) {
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
      if (!object.isMesh || object.isInstancedMesh || Array.isArray(object.material)) return;
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
      meshes.forEach(mesh => mesh.removeFromParent()); this.scene.add(combined);
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
    const sleeve = material(0x62665a, 0.95, 0);
    const skin = material(0x9b876d, 0.95, 0);
    const g = this.weapon;
    this.box(g, 0, 0, -0.08, 0.12, 0.14, 0.39, black);
    this.box(g, 0, 0.015, -0.37, 0.096, 0.105, 0.34, grip);
    this.box(g, 0.065, 0.012, -0.02, 0.015, 0.05, 0.13, metal);
    this.box(g, 0.076, 0.016, 0.055, 0.045, 0.018, 0.025, metal);
    this.box(g, 0, 0.088, -0.15, 0.075, 0.025, 0.44, metal);
    for (let z = -0.39; z < 0.05; z += 0.034) this.box(g, 0, 0.109, z, 0.082, 0.015, 0.012, black);
    for (let z = -0.49; z < -0.22; z += 0.045) {
      this.box(g, 0.051, 0, z, 0.012, 0.032, 0.018, black);
      this.box(g, -0.051, 0, z, 0.012, 0.032, 0.018, black);
    }
    const barrel = this.cylinder(g, 0, 0.015, -0.63, 0.017, 0.22, metal); barrel.rotation.x = Math.PI / 2;
    const muzzle = this.cylinder(g, 0, 0.015, -0.76, 0.025, 0.07, black); muzzle.rotation.x = Math.PI / 2;
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
    const mag = this.box(this.magazine, 0, -0.19, -0.08, 0.083, 0.25, 0.12, grip); mag.rotation.x = -0.12;
    for (let y = -0.26; y < -0.08; y += 0.045) this.box(this.magazine, 0.043, y, -0.08, 0.006, 0.012, 0.095, black);
    const pistolGrip = this.box(g, 0, -0.15, 0.105, 0.075, 0.17, 0.08, grip); pistolGrip.rotation.x = -0.28;
    this.box(g, 0, -0.015, 0.28, 0.09, 0.105, 0.28, grip);
    this.box(g, 0, -0.035, 0.44, 0.12, 0.2, 0.065, black);
    // Procedural gloved hands, sleeve cuffs and forearms.
    const rightHand = this.box(g, 0.025, -0.15, 0.1, 0.105, 0.13, 0.1, glove); rightHand.rotation.z = -0.15;
    this.box(g, 0.087, -0.105, 0.035, 0.024, 0.035, 0.11, glove);
    const rightArm = this.box(g, 0.1, -0.29, 0.24, 0.15, 0.26, 0.32, sleeve); rightArm.rotation.x = -0.55; rightArm.rotation.z = -0.2;
    const leftHand = this.box(g, -0.018, -0.075, -0.36, 0.13, 0.09, 0.15, glove); leftHand.rotation.z = 0.1;
    for (let i = 0; i < 4; i++) this.box(g, -0.06 + i * 0.025, -0.035, -0.39, 0.02, 0.042, 0.06, glove);
    const leftArm = this.box(g, -0.17, -0.17, -0.15, 0.14, 0.15, 0.46, sleeve); leftArm.rotation.y = -0.65; leftArm.rotation.z = -0.2;
    this.box(g, -0.1, -0.13, -0.31, 0.13, 0.025, 0.08, skin);
    this.flashMaterial = new THREE.MeshBasicMaterial({ color: 0xffd584, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide });
    this.muzzleFlash = new THREE.Group(); this.muzzleFlash.position.set(0, 0.015, -0.81); g.add(this.muzzleFlash);
    const flash = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.22, 5), this.flashMaterial); flash.rotation.x = -Math.PI / 2; flash.position.z = -0.08;
    this.muzzleFlash.add(flash); this.muzzleFlash.visible = false;
    this.flashLight = new THREE.PointLight(0xffc36e, 0, 4, 2); this.flashLight.position.set(0, 0, -0.9); g.add(this.flashLight);
    // First-person meshes render last and are unaffected by world wall clipping.
    g.traverse(object => { if (object.isMesh) { object.castShadow = false; object.receiveShadow = false; object.renderOrder = 10; object.material = object.material.clone(); object.material.depthTest = false; } });
  }

  makeSoldier(player) {
    const group = new THREE.Group();
    const uniform = material(player.team === 0 ? 0x596c67 : 0x756b55);
    const vest = material(0x363e37), skin = material(0x9a846b), boots = material(0x303635), gun = material(0x293134, 0.55, 0.5);
    const pelvis = this.box(group, 0, 0.84, 0, 0.39, 0.24, 0.25, uniform);
    this.box(group, 0, 1.18, 0, 0.43, 0.48, 0.29, uniform);
    this.box(group, 0, 1.19, -0.055, 0.45, 0.36, 0.25, vest);
    for (let x = -0.13; x < 0.17; x += 0.13) this.box(group, x, 1.08, -0.21, 0.105, 0.16, 0.075, vest);
    this.box(group, 0, 1.17, 0.2, 0.32, 0.37, 0.15, vest);
    const head = new THREE.Group(); head.position.y = 1.58; group.add(head);
    const face = new THREE.Mesh(this.geo.sphere, skin); face.scale.set(0.115, 0.145, 0.115); head.add(face);
    const helmet = new THREE.Mesh(this.geo.sphere, uniform); helmet.scale.set(0.145, 0.11, 0.15); helmet.position.set(0, 0.08, 0.012); head.add(helmet); helmet.castShadow = true;
    this.box(head, 0, 0.02, -0.112, 0.17, 0.045, 0.035, gun);
    this.box(head, 0, -0.075, -0.08, 0.19, 0.08, 0.12, vest);
    const legs = [], arms = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(side * 0.115, 0.79, 0); group.add(leg);
      this.box(leg, 0, -0.2, 0, 0.17, 0.4, 0.19, uniform);
      this.box(leg, 0, -0.52, 0.015, 0.145, 0.31, 0.17, uniform);
      this.box(leg, 0, -0.71, -0.04, 0.17, 0.14, 0.27, boots);
      this.box(leg, 0, -0.37, -0.09, 0.16, 0.15, 0.06, vest);
      legs.push(leg);
      const arm = new THREE.Group(); arm.position.set(side * 0.28, 1.38, 0); group.add(arm);
      this.box(arm, 0, -0.15, -0.035, 0.15, 0.3, 0.17, uniform);
      const forearm = this.box(arm, side * -0.03, -0.25, -0.19, 0.13, 0.13, 0.28, uniform); forearm.rotation.x = 0.12;
      this.box(arm, side * -0.04, -0.24, -0.35, 0.11, 0.11, 0.13, boots); arms.push(arm);
    }
    const rifle = new THREE.Group(); rifle.position.set(0.13, 1.12, -0.35); group.add(rifle);
    this.box(rifle, 0, 0, -0.1, 0.07, 0.11, 0.48, gun);
    this.box(rifle, 0, -0.09, -0.02, 0.055, 0.15, 0.08, gun);
    this.box(rifle, 0, 0.01, -0.41, 0.025, 0.025, 0.2, gun);
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), new THREE.MeshBasicMaterial({ color: COLORS.friendly })); marker.position.y = 1.95; group.add(marker);
    this.scene.add(group);
    return { group, head, legs, arms, rifle, marker, uniform, lastX: player.x, lastZ: player.z, walk: 0, initialized: false, pelvis };
  }

  updateSoldiers(state, localId, dt) {
    const active = new Set();
    const localTeam = state.players.find(p => p.id === localId)?.team ?? 0;
    for (const player of state.players) {
      if (player.id === localId) continue;
      active.add(player.id);
      let soldier = this.soldiers.get(player.id);
      if (!soldier) { soldier = this.makeSoldier(player); this.soldiers.set(player.id, soldier); }
      soldier.group.visible = player.alive !== false;
      if (!soldier.group.visible) continue;
      const blend = soldier.initialized ? 1 - Math.exp(-dt * 18) : 1;
      const distance = Math.hypot(player.x - soldier.lastX, player.z - soldier.lastZ);
      soldier.walk += Math.min(distance, 2) * 2.5;
      const move = distance > 0.004;
      soldier.group.position.lerp(this.scratchPosition.set(player.x, player.y || 0, player.z), blend);
      const yawDifference = Math.atan2(Math.sin((player.yaw || 0) - soldier.group.rotation.y), Math.cos((player.yaw || 0) - soldier.group.rotation.y));
      soldier.group.rotation.y += yawDifference * blend;
      soldier.head.rotation.x = (player.pitch || 0) * 0.5;
      soldier.rifle.rotation.x = (player.pitch || 0) * 0.7;
      soldier.legs[0].rotation.x = move ? Math.sin(soldier.walk) * 0.5 : lerp(soldier.legs[0].rotation.x, 0, blend);
      soldier.legs[1].rotation.x = -soldier.legs[0].rotation.x;
      const crouched = player.crouching || player.crouch;
      soldier.group.scale.y = crouched ? 0.73 : 1;
      soldier.marker.material.color.setHex(player.team === localTeam ? COLORS.friendly : COLORS.enemy);
      soldier.marker.visible = player.team === localTeam;
      soldier.lastX = player.x; soldier.lastZ = player.z; soldier.initialized = true;
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
        this.scene.add(line); this.effects.push({ mesh: line, age: 0, life: 0.09, type: 'tracer' });
        if (event.playerId === localId) this.kick = Math.max(this.kick, 1);
        if (this.effects.length < 90 && this.random() > 0.5) this.smoke(tx, ty, tz, 0.25, 0.7, 0xaba99d);
      }
      if (event.type === 'explosion') {
        const x = event.x || 0, y = event.y ?? 0.6, z = event.z || 0;
        for (let i = 0; i < 13; i++) this.smoke(x + (this.random() - 0.5) * 2, y + this.random() * 2, z + (this.random() - 0.5) * 2, 1.1 + this.random() * 1.4, 2.5 + this.random() * 2, i < 3 ? 0xffb668 : 0x535953);
        const light = new THREE.PointLight(0xffaa55, 18, 15, 2); light.position.set(x, y + 1, z); this.scene.add(light); this.effects.push({ mesh: light, age: 0, life: 0.22, type: 'light' });
      }
    }
    if (this.seenEvents.size > 1400) this.seenEvents = new Set([...this.seenEvents].slice(-700));
  }

  smoke(x, y, z, size, life, color) {
    if (this.effects.length > 180) return;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTexture, color, transparent: true, opacity: 0.6, depthWrite: false, rotation: this.random() * Math.PI }));
    sprite.position.set(x, y, z); sprite.scale.setScalar(size); this.scene.add(sprite);
    this.effects.push({ mesh: sprite, age: 0, life, size, type: 'smoke', vx: (this.random() - 0.5) * 0.6, vz: (this.random() - 0.5) * 0.6 });
  }

  updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i]; effect.age += dt;
      if (effect.age >= effect.life) {
        this.scene.remove(effect.mesh); effect.mesh.geometry?.dispose(); effect.mesh.material?.dispose(); this.effects.splice(i, 1); continue;
      }
      const alpha = 1 - effect.age / effect.life;
      if (effect.type === 'smoke') {
        effect.mesh.position.x += effect.vx * dt; effect.mesh.position.z += effect.vz * dt; effect.mesh.position.y += dt * 0.8;
        effect.mesh.scale.setScalar(effect.size * (1 + effect.age * 1.5)); effect.mesh.material.opacity = alpha * 0.55;
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

  render(state, localId, dt, view = {}) {
    dt = Math.min(dt || 0.016, 0.1); this.clock += dt;
    const low = view.quality === 'low';
    if (this.lowQuality !== low) {
      this.lowQuality = low; this.renderer.shadowMap.enabled = !low; this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1 : 1.6)); this.resize();
    }
    if (!state?.players) {
      this.cameraPlayerId = null;
      const angle = this.clock * 0.018;
      this.camera.position.set(Math.sin(angle + 0.8) * 66, 45, Math.cos(angle + 0.8) * 66);
      this.camera.lookAt(0, 0, 0); this.weapon.visible = false;
      if (this.camera.fov !== 78) { this.camera.fov = 78; this.camera.updateProjectionMatrix(); }
      this.sun.position.set(-55, 90, 35); this.sun.target.position.set(0, 0, 0);
      for (const soldier of this.soldiers.values()) soldier.group.visible = false;
      for (const grenade of this.grenadeMeshes.values()) grenade.visible = false;
      this.updateEffects(dt);
      this.renderer.render(this.scene, this.camera); return;
    }
    const player = state.players.find(p => p.id === localId);
    const isAlive = player?.alive !== false;
    if (player) {
      const yaw = view.yaw ?? player.yaw ?? 0, pitch = view.pitch ?? player.pitch ?? 0;
      const crouching = view.crouch ?? player.crouching ?? player.crouch;
      const height = isAlive ? (crouching ? 1.05 : 1.65) : 0.5;
      this.aimAmount = lerp(this.aimAmount, view.aim && isAlive ? 1 : 0, 1 - Math.exp(-dt * 15));
      this.reloadAmount = lerp(this.reloadAmount, player.reloading ? 1 : 0, 1 - Math.exp(-dt * 8));
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
      this.camera.position.set(this.cameraAnchor.x, this.cameraAnchor.y + height + Math.sin(cycle * 2) * 0.018 * bob, this.cameraAnchor.z);
      this.kick = Math.max(view.recoil || 0, this.kick * Math.exp(-dt * 16));
      if (player.shotSeq !== undefined && player.shotSeq !== this.lastShot) {
        if (this.lastShot !== -1) this.kick = 1;
        this.lastShot = player.shotSeq;
      }
      this.camera.rotation.set(pitch + this.kick * 0.008, yaw, moving ? Math.sin(cycle) * 0.0018 : 0, 'YXZ');
      const fov = lerp(sprint ? 84 : 78, 55, this.aimAmount);
      if (Math.abs(this.camera.fov - fov) > 0.03) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
      this.swayX = lerp(this.swayX, clamp(Math.atan2(Math.sin(yaw - this.lastYaw), Math.cos(yaw - this.lastYaw)) * 1.3, -0.025, 0.025), 0.18);
      this.swayY = lerp(this.swayY, clamp((pitch - this.lastPitch) * 1.3, -0.02, 0.02), 0.18);
      this.lastYaw = yaw; this.lastPitch = pitch;
      this.weapon.visible = isAlive;
      this.scope.visible = player.classId === 'recon' && this.aimAmount < 0.9;
      this.magazine.scale.set(player.classId === 'support' ? 1.55 : 1, player.classId === 'medic' ? 1.15 : player.classId === 'recon' ? 0.65 : 1, player.classId === 'support' ? 1.55 : 1);
      this.weapon.position.set(
        lerp(0.26, 0, this.aimAmount) + Math.sin(cycle) * 0.012 * bob - this.swayX,
        lerp(-0.23, -0.167, this.aimAmount) + Math.abs(Math.cos(cycle)) * 0.012 * bob - this.swayY - this.reloadAmount * 0.16,
        lerp(-0.42, -0.32, this.aimAmount) + this.kick * 0.045 + this.reloadAmount * 0.08,
      );
      this.weapon.rotation.set(this.kick * 0.045 - this.reloadAmount * 0.45, this.reloadAmount * -0.18 + (sprint ? 0.2 : 0), this.reloadAmount * -0.5 + (sprint ? 0.14 : 0));
      this.magazine.position.y = player.reloading ? -Math.sin(this.clock * 5) * 0.12 : 0;
      this.muzzleFlash.visible = this.kick > 0.65; this.muzzleFlash.rotation.z = this.clock * 41;
      this.flashLight.intensity = this.kick > 0.65 ? 2 : 0;
      this.sun.position.set(player.x - 55, 90, player.z + 35); this.sun.target.position.set(player.x, 0, player.z);
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
    this.renderer.render(this.scene, this.camera);
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
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); this.renderer.dispose();
  }
}
