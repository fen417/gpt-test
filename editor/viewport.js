import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createSurfaceMaterials } from '../src/visuals.js';
import { CAPTURE_RADIUS } from '../shared/world.js';

export function surfaceFor(kind) {
  if (kind === 'crate' || kind === 'port-rack') return 'wood';
  if (kind === 'tent' || kind === 'sandbags') return 'cloth';
  if (kind === 'wall' || kind === 'factory') return 'brick';
  if (/container|warehouse|roof|port-|truck|car|generator|fueltank|kiosk/.test(kind)) return 'metal';
  return 'concrete';
}

const square = new THREE.BoxGeometry(1, 1, 1);
const circle = new THREE.CylinderGeometry(1, 1, 1, 32);
const routeKey = index => 'segment:' + index;
const colors = { objective: '#c8da76', route: '#6cdab5', spawn: '#87bdfa', vehicle: '#e9bd7a', landmark: '#dad9b9', sign: '#d6c8a4' };

export class MapViewport {
  constructor(element, labels) {
    this.element = element;
    this.labels = labels;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.canvas = this.renderer.domElement;
    element.prepend(this.canvas);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#172422');
    this.scene.add(new THREE.HemisphereLight(0xf6f4df, 0x54636b, 2.2));
    const sun = new THREE.DirectionalLight(0xffe3ad, 1.5);
    sun.position.set(-50, 120, -20);
    this.scene.add(sun);
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 5000);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
    this.controls.maxPolarAngle = Math.PI * .46;
    this.controls.minZoom = .45;
    this.controls.maxZoom = 36;
    this.controls.addEventListener('change', () => this.render());
    this.surfaces = createSurfaceMaterials(this.renderer, { useBump: false }).maps;
    this.swatches = Object.fromEntries(Object.entries(this.surfaces).map(([name, map]) => [name, map.image.toDataURL()]));
    this.materials = new Map();
    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.markerMeshes = [];
    this.angle = false;
    new ResizeObserver(() => this.resize()).observe(element);
  }

  material(color, texture) {
    const key = color + '/' + texture;
    if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshLambertMaterial({
      color, map: this.surfaces[texture] ?? null,
    }));
    return this.materials.get(key);
  }

  resize() {
    if (!this.map) return;
    const width = Math.max(1, this.element.clientWidth), height = Math.max(1, this.element.clientHeight);
    this.renderer.setSize(width, height, false);
    const size = this.map.size * .57;
    const aspect = width / height;
    this.camera.left = -size * Math.max(aspect, 1);
    this.camera.right = -this.camera.left;
    this.camera.bottom = -size / Math.min(aspect, 1);
    this.camera.top = -this.camera.bottom;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  view(angle, frame = false) {
    this.angle = angle;
    this.controls.enableRotate = angle;
    const size = this.map.size;
    if (frame) {
      this.controls.target.set(0, 0, 0);
      this.camera.zoom = 1;
      this.camera.updateProjectionMatrix();
    }
    const offset = angle ? new THREE.Vector3(size * .54, size * .88, size * .69) : new THREE.Vector3(0, size, size * .00001);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
    this.render();
  }

  mesh(value, dimensions, material, geometry = square, item) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(value.x, dimensions.y, value.z);
    object.scale.set(dimensions.w, dimensions.h, dimensions.d);
    object.rotation.y = value.yaw ?? 0;
    object.userData.item = item;
    this.world.add(object);
    if (item) this.pickables.push(object);
    return object;
  }

  groundPlane() {
    const { map } = this;
    const geometry = new THREE.PlaneGeometry(map.size, map.size, map.terrain ? map.size / map.terrain.cell : 1,
      map.terrain ? map.size / map.terrain.cell : 1);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    for (let i = 0; i < positions.count; i++) {
      positions.setY(i, this.heightAt(positions.getX(i), positions.getZ(i)));
      uv.setXY(i, uv.getX(i) * map.size / 15, uv.getY(i) * map.size / 15);
    }
    geometry.computeVertexNormals();
    const ground = new THREE.Mesh(geometry, this.material(map.terrain ? '#a69f79' : '#a3aaa1', map.terrain ? 'ground' : 'concrete'));
    this.world.add(ground);
    if (map.shoreX !== undefined) this.mesh({ x: (map.shoreX - map.size / 2) / 2, z: 0 },
      { w: map.shoreX + map.size / 2, d: map.size, h: .2, y: .03 }, this.material('#396878'));
  }

  road(value, item) {
    const segments = Math.max(1, Math.ceil(value.d / 8));
    const geometry = new THREE.PlaneGeometry(value.w, value.d, Math.max(1, Math.ceil(value.w / 8)), segments);
    geometry.rotateX(-Math.PI / 2);
    geometry.rotateY(value.yaw ?? 0);
    geometry.translate(value.x, 0, value.z);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) position.setY(i, this.heightAt(position.getX(i), position.getZ(i)) + .22);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, this.material('#8a8b78', 'asphalt'));
    mesh.userData.item = item;
    this.pickables.push(mesh);
    this.world.add(mesh);
  }

  heightAt(x, z) { return this.map.terrain?.heightAt(x, z) ?? 0; }

  display(map, items) {
    const first = this.map?.id !== map.id;
    this.map = map;
    this.clearSelection();
    for (const object of [...this.world.children]) {
      if (object.geometry !== square && object.geometry !== circle) object.geometry.dispose();
      object.removeFromParent();
    }
    this.labels.replaceChildren();
    this.markerMeshes = [];
    this.pickables = [];
    this.segments = [];
    this.groundPlane();
    const byKey = new Map(items.map(item => [item.key, item]));
    for (const box of map.boxes) {
      const item = byKey.get(box.editorKey ?? 'box:' + box.id) ?? byKey.get(box.editorParent);
      const mesh = this.mesh(box, { w: box.w, d: box.d, h: box.h, y: (box.baseY ?? 0) + box.h / 2 },
        this.material(box.color ?? '#a6a69c', surfaceFor(box.kind)), square, item);
      mesh.userData.parent = box.editorParent;
    }
    if (map.vehicleRoutes) {
      const { edges } = map.vehicleRoutes;
      const vehicles = new Set(map.vehicleSpawns.map(vehicle => vehicle.id));
      map.roads.forEach((road, index) => {
        const [a, b] = edges[index];
        const segment = { key: routeKey(index), kind: 'segment', value: road, name: a + ' → ' + b,
          endpoints: [a, b].map(id => byKey.get((vehicles.has(id) ? 'vehicle:' : 'route:') + id)) };
        this.segments.push(segment);
        this.road(road, segment);
      });
    }
    for (const item of items) {
      const { kind, value } = item;
      const y = this.heightAt(value.x, value.z);
      if (kind === 'box') continue;
      if (kind === 'road') { this.road(value, item); continue; }
      if (kind === 'structure') {
        this.mesh(value, { w: value.w, d: value.d, h: .35, y: (value.baseY ?? 0) + value.h },
          this.material(value.color ?? '#a9a391', 'metal'), square, item);
        continue;
      }
      if (kind === 'crane' || kind === 'ship' || kind === 'rail') {
        const shape = kind === 'crane' ? { w: 20, d: 16, h: 1.6, y: value.height } :
          kind === 'ship' ? { w: value.w, d: value.d, h: 6, y: 3 } :
          { w: 2.4, d: value.quayTrack ? 355 : 445, h: .15, y: .26 };
        this.mesh(value, shape, this.material(value.color ?? '#76999b', 'metal'), square, item);
        continue;
      }
      const radius = kind === 'objective' ? CAPTURE_RADIUS : kind === 'spawn' ? 7 : kind === 'landform' ? 5 : 2.6;
      const point = this.mesh(value, { w: radius, d: radius, h: .55, y: y + .42 },
        this.material(colors[kind] ?? '#b99a73'), circle, item);
      if (kind === 'objective' || kind === 'spawn' || kind === 'vehicle' || kind === 'landmark') {
        const label = document.createElement('span');
        label.className = 'marker';
        label.textContent = kind === 'spawn' ? 'База ' + (Number(item.key.split(':')[1]) + 1) :
          kind === 'vehicle' ? value.type.toUpperCase() : kind === 'objective' ? value.id : value.name;
        this.labels.append(label);
        this.markerMeshes.push({ label, point, kind });
      }
    }
    this.resize();
    if (first) this.view(this.angle, true);
    this.render();
  }

  clearSelection() {
    for (const { mesh, position } of this.previewMeshes ?? []) mesh.position.copy(position);
    this.previewMeshes = [];
    this.outline?.removeFromParent();
    this.outline?.geometry.dispose();
    this.outline?.material.dispose();
    this.outline = null;
  }

  select(item) {
    this.clearSelection();
    if (!item) { this.render(); return; }
    const { value, kind } = item;
    this.previewMeshes = this.pickables.filter(mesh => mesh.userData.item?.key === item.key ||
      mesh.userData.parent === item.key).map(mesh => ({ mesh, position: mesh.position.clone() }));
    const w = kind === 'landform' ? value.rx * 2 : value.w ?? (kind === 'objective' ? CAPTURE_RADIUS * 2 : 9);
    const d = kind === 'landform' ? value.rz * 2 : value.d ?? (kind === 'rail' ? 355 : w);
    const h = value.h ?? 1.5;
    const shape = new THREE.BoxGeometry(w + .7, h + .5, d + .7);
    const geometry = new THREE.EdgesGeometry(shape);
    shape.dispose();
    const outline = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xf6f5a1, depthTest: false }));
    outline.position.set(value.x, (value.baseY ?? this.heightAt(value.x, value.z)) + h / 2, value.z);
    outline.rotation.y = value.yaw ?? 0;
    outline.renderOrder = 20;
    this.scene.add(outline);
    this.outline = outline;
    this.render();
  }

  render() {
    if (!this.map) return;
    this.camera.updateMatrixWorld();
    this.renderer.render(this.scene, this.camera);
    const width = this.element.clientWidth, height = this.element.clientHeight;
    const projected = new THREE.Vector3();
    for (const { label, point, kind } of this.markerMeshes) {
      projected.copy(point.position).add(new THREE.Vector3(0, 2, 0)).project(this.camera);
      label.hidden = Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1 ||
        (kind === 'landmark' && this.camera.zoom < 1.6) || (kind === 'vehicle' && this.camera.zoom < 1.4);
      label.style.left = (projected.x + 1) * width / 2 + 'px';
      label.style.top = (1 - projected.y) * height / 2 + 'px';
    }
  }

  ray(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1,
      1 - (event.clientY - rect.top) / rect.height * 2), this.camera);
    return this.raycaster.ray;
  }

  worldPoint(event) {
    const ray = this.ray(event);
    const hit = this.map.terrain?.raycast(ray.origin, ray.direction, this.map.size * 4);
    return Number.isFinite(hit) ? ray.at(hit, new THREE.Vector3()) : ray.intersectPlane(this.plane, new THREE.Vector3());
  }

  pick(event, kinds) {
    this.ray(event);
    return this.raycaster.intersectObjects(this.pickables.filter(mesh =>
      kinds.includes(mesh.userData.item.kind)), false)[0]?.object.userData.item;
  }

  preview(item, x, z) {
    if (!this.outline) return;
    const dx = x - item.value.x, dz = z - item.value.z;
    const rise = this.heightAt(x, z) - this.heightAt(item.value.x, item.value.z);
    this.outline.position.x = x;
    this.outline.position.z = z;
    this.outline.position.y = (item.value.baseY ?? this.heightAt(item.value.x, item.value.z)) +
      (item.value.h ?? 1.5) / 2 + rise;
    for (const { mesh, position } of this.previewMeshes) {
      mesh.position.set(position.x + dx, position.y + rise, position.z + dz);
    }
    this.render();
  }
}
