import * as THREE from "three";
import { HEAD_DATA } from "./soldier-head-data.js";

// Adapted and reduced from Lee Perry-Smith's Infinite head scan (CC BY 3.0).
// Geometry is synchronous and cached; colour/normal images are local Vite assets.
const geometries = new Map();
function unpack(encoded, Type) {
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  return new Type(bytes.buffer);
}
export function soldierHeadGeometry(distant = false) {
  const key = distant ? "distant" : "detail";
  if (geometries.has(key)) return geometries.get(key);
  const data = HEAD_DATA[key],
    geo = new THREE.BufferGeometry();
  const positions = Float32Array.from(
    unpack(data.position, Int16Array),
    (x) => x / 100000,
  );
  const normals = Float32Array.from(
    unpack(data.normal, Int8Array),
    (x) => x / 127,
  );
  const uv = Float32Array.from(unpack(data.uv, Uint16Array), (x) => x / 65535);
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(unpack(data.index, Uint16Array), 1));
  geo.userData.anatomy = "head";
  geometries.set(key, geo);
  return geo;
}

let texturesReady;
function image(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Soldier head texture: ${url}`));
    img.src = url;
  });
}
export function applySoldierHeadAtlas(
  ctx,
  map,
  normalMap,
  origin,
  width,
  height,
) {
  texturesReady ??= Promise.all([
    image(new URL("./assets/soldier-head/color.jpg", import.meta.url).href),
    image(new URL("./assets/soldier-head/normal.jpg", import.meta.url).href),
  ]);
  return texturesReady.then(([color, normal]) => {
    const x = origin + width * 0.04,
      w = width * 0.92,
      y = height * 0.03,
      h = height * 0.94;
    ctx.drawImage(color, x, y, w, h);
    map.needsUpdate = true;
    const canvas = document.createElement("canvas");
    canvas.width = normalMap.image.width;
    canvas.height = height;
    const n = canvas.getContext("2d");
    n.putImageData(
      new ImageData(
        new Uint8ClampedArray(normalMap.image.data),
        canvas.width,
        height,
      ),
      0,
      0,
    );
    n.drawImage(normal, x, y, w, h);
    normalMap.image.data.set(n.getImageData(0, 0, canvas.width, height).data);
    normalMap.flipY = true;
    normalMap.needsUpdate = true;
  });
}
