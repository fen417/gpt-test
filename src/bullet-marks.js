import * as THREE from 'three';

const markLifetime = 30;
const maxMarks = 64;
const forward = new THREE.Vector3(0, 0, 1);

function markTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const dust = ctx.createRadialGradient(64, 64, 12, 64, 64, 59);
  dust.addColorStop(0, '#b8a68cbb');
  dust.addColorStop(.48, '#b8a68c77');
  dust.addColorStop(1, '#b8a68c00');
  ctx.fillStyle = dust;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#22231ff0';
  ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const angle = i / 24 * Math.PI * 2;
    const radius = 17 + Math.sin(i * 2.7) * 5 + Math.cos(i * 1.4) * 3;
    const x = 64 + Math.cos(angle) * radius, y = 64 + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#1c211e99';
  ctx.lineWidth = 1.7;
  for (let i = 0; i < 7; i++) {
    const angle = i / 7 * Math.PI * 2 + .2;
    ctx.beginPath();
    ctx.moveTo(64 + Math.cos(angle) * 14, 64 + Math.sin(angle) * 14);
    ctx.lineTo(64 + Math.cos(angle + .08) * 35, 64 + Math.sin(angle + .08) * 35);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function boxNormal(box, point) {
  let nearest = Infinity;
  const normal = new THREE.Vector3(0, 1, 0);
  const bounds = [
    ['x', box.x - box.w / 2, box.x + box.w / 2],
    ['y', box.baseY ?? 0, (box.baseY ?? 0) + box.h],
    ['z', box.z - box.d / 2, box.z + box.d / 2],
  ];
  for (const [axis, min, max] of bounds) for (const [edge, sign] of [[min, -1], [max, 1]]) {
    const distance = Math.abs(point[axis] - edge);
    if (distance < nearest) {
      nearest = distance;
      normal.set(0, 0, 0);
      normal[axis] = sign;
    }
  }
  return normal;
}

export class BulletMarks {
  constructor() {
    this.marks = [];
    this.raycaster = new THREE.Raycaster();
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.texture = null;
  }

  add(event, map, staticRoot, worldRoot, vehicleRig) {
    if (event.weaponId !== 'sv98' || !['ground', 'concrete', 'metal', 'wood'].includes(event.impact)) return;
    if (![event.tx, event.ty, event.tz, event.dx, event.dy, event.dz].every(Number.isFinite)) return;
    if (event.impactVehicleId && !vehicleRig) return;
    const point = new THREE.Vector3(event.tx, event.ty, event.tz);
    const direction = new THREE.Vector3(event.dx, event.dy, event.dz).normalize();
    if (direction.lengthSq() === 0) return;
    const box = map.boxes.find(box => box.id === event.impactBoxId);
    const normal = box ? boxNormal(box, point) : direction.clone().negate();
    if (event.impact === 'ground') normal.set(0, 1, 0);
    const surface = vehicleRig?.body ?? staticRoot;
    if (surface) {
      surface.updateWorldMatrix(true, true);
      if (event.impact === 'ground') {
        this.raycaster.set(point.clone().add(new THREE.Vector3(0, .25, 0)), new THREE.Vector3(0, -1, 0));
        this.raycaster.far = .5;
      } else {
        this.raycaster.set(point.clone().addScaledVector(direction, -.15), direction);
        this.raycaster.far = 2.5;
      }
      const hit = this.raycaster.intersectObject(surface, true).find(hit => hit.face);
      if (hit) {
        point.copy(hit.point);
        const transform = hit.object.matrixWorld.clone();
        if (hit.object.isInstancedMesh) {
          const instance = new THREE.Matrix4();
          hit.object.getMatrixAt(hit.instanceId, instance);
          transform.multiply(instance);
        }
        normal.copy(hit.face.normal).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(transform));
      } else if (vehicleRig) {
        // A vehicle collider can enclose open space around the actual body.
        return;
      }
    }
    if (normal.dot(direction) > 0) normal.negate();
    this.texture ??= markTexture();
    const material = new THREE.MeshBasicMaterial({
      map: this.texture, transparent: true, opacity: .95, alphaTest: .025,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      toneMapped: false,
    });
    const size = event.impact === 'ground' ? .38 : .28;
    const mesh = new THREE.Mesh(this.geometry, material);
    mesh.position.copy(point).addScaledVector(normal, .006);
    mesh.quaternion.setFromUnitVectors(forward, normal);
    mesh.rotateZ((event.shotId ?? 0) * 2.4);
    mesh.scale.setScalar(size);
    if (event.impact === 'ground' && map.terrain) {
      mesh.geometry = new THREE.PlaneGeometry(size, size, 2, 2);
      mesh.geometry.rotateX(-Math.PI / 2);
      mesh.position.copy(point);
      mesh.quaternion.identity();
      mesh.scale.setScalar(1);
      const vertices = mesh.geometry.attributes.position;
      for (let i = 0; i < vertices.count; i++) {
        // Quarry road overlays sit .045 m above the terrain mesh.
        vertices.setY(i, map.terrain.heightAt(point.x + vertices.getX(i), point.z + vertices.getZ(i)) - point.y + .06);
      }
      mesh.geometry.computeBoundingSphere();
    }
    const attachment = vehicleRig?.body;
    const localPoint = attachment?.worldToLocal(mesh.position.clone());
    const localRotation = attachment && attachment.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(mesh.quaternion);
    worldRoot.add(mesh);
    this.marks.push({ mesh, attachment, localPoint, localRotation, age: 0 });
    if (this.marks.length > maxMarks) this.remove(0);
  }

  remove(index) {
    const [{ mesh }] = this.marks.splice(index, 1);
    mesh.removeFromParent();
    mesh.material.dispose();
    if (mesh.geometry !== this.geometry) mesh.geometry.dispose();
  }

  update(dt) {
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const mark = this.marks[i];
      mark.age += dt;
      if (mark.age >= markLifetime || (mark.attachment && !mark.attachment.parent?.parent)) {
        this.remove(i);
        continue;
      }
      if (mark.attachment) {
        mark.mesh.visible = mark.attachment.parent.visible;
        mark.attachment.updateWorldMatrix(true, false);
        mark.mesh.position.copy(mark.localPoint).applyMatrix4(mark.attachment.matrixWorld);
        mark.attachment.getWorldQuaternion(mark.mesh.quaternion).multiply(mark.localRotation);
      }
      mark.mesh.material.opacity = .95 * Math.min(1, (markLifetime - mark.age) / 3);
    }
  }

  clear() {
    while (this.marks.length) this.remove(this.marks.length - 1);
  }

  dispose() {
    this.clear();
    this.geometry.dispose();
    this.texture?.dispose();
  }
}
