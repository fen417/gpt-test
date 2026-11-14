import * as THREE from 'three';

function rand(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; }; }
function texture(draw, repeat = 1, size = 256) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d'); draw(ctx, size, rand(1729));
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(repeat, repeat);
  return map;
}

// Fast pixel-buffer grain avoids tens of thousands of 2D canvas fillRect calls at startup.
function grain(ctx, size, random, count, alpha = 0.15) {
  const image = ctx.getImageData(0, 0, size, size), data = image.data, mask = size - 1;
  const blend = Math.min(1, alpha * 1.15), inv = 1 - blend;
  const samples = Math.min(count, size * size);
  for (let i = 0; i < samples; i++) {
    const x = (random() * size) & mask, y = (random() * size) & mask;
    const shade = 50 + ((random() * 170) | 0);
    const idx = (y * size + x) * 4;
    data[idx] = data[idx] * inv + shade * blend;
    data[idx + 1] = data[idx + 1] * inv + shade * blend;
    data[idx + 2] = data[idx + 2] * inv + shade * blend;
    if ((i & 1) === 0) {
      const idx2 = (y * size + ((x + 1) & mask)) * 4;
      data[idx2] = data[idx2] * inv + shade * blend;
      data[idx2 + 1] = data[idx2 + 1] * inv + shade * blend;
      data[idx2 + 2] = data[idx2 + 2] * inv + shade * blend;
    }
  }
  ctx.putImageData(image, 0, 0);
}

function stains(ctx, s, random, color = '45,40,30') {
  for (let i = 0; i < 24; i++) {
    const x = random() * s, y = random() * s, r = random() * s * 0.23 + 6;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${color},${0.04 + random() * 0.11})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

export function pairMaterials(highMat, lowMat) {
  highMat._lowMaterial = lowMat;
  lowMat._highMaterial = highMat;
  return highMat;
}

export function clonePairedMaterial(source, color, emissive = null, emissiveIntensity = 0) {
  const highSource = source._highMaterial || source;
  const lowSource = source._lowMaterial;
  const highClone = highSource.clone();
  highClone.color.set(color);
  if (emissive !== null) {
    highClone.emissive = new THREE.Color(emissive);
    highClone.emissiveIntensity = emissiveIntensity;
  }
  if (lowSource) {
    const lowClone = lowSource.clone();
    lowClone.color.set(color);
    if (emissive !== null) {
      lowClone.emissive = new THREE.Color(emissive);
      lowClone.emissiveIntensity = emissiveIntensity;
    }
    pairMaterials(highClone, lowClone);
  }
  return highClone;
}

export function createSurfaceMaterials(renderer, { useBump = true, anisotropy:anisotropyLimit=4 } = {}) {
  const concrete = texture((ctx, s, random) => {
    ctx.fillStyle = '#b7b6ab'; ctx.fillRect(0, 0, s, s); grain(ctx, s, random, 18000, 0.12); stains(ctx, s, random);
    ctx.strokeStyle = 'rgba(50,55,48,.25)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(1, 1, s - 2, s - 2);
    for (let i = 0; i < 9; i++) { const x = random() * s, y = random() * s; ctx.fillStyle = 'rgba(40,44,39,.3)'; ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill(); }
    for (let i = 0; i < 4; i++) { let x = random() * s, y = random() * s; ctx.lineWidth = .6; ctx.beginPath(); ctx.moveTo(x, y); for (let j = 0; j < 10; j++) { x += random() * 12 - 6; y += random() * 14; ctx.lineTo(x, y); } ctx.stroke(); }
  });
  const brick = texture((ctx, s, random) => {
    ctx.fillStyle = '#7f8176'; ctx.fillRect(0, 0, s, s);
    const row = s / 16, col = s / 4;
    for (let y = 0; y < 17; y++) for (let x = -1; x < 5; x++) {
      const shade = 135 + Math.floor(random() * 45); ctx.fillStyle = `rgb(${shade + 7},${shade - 9},${shade - 24})`;
      const bx = x * col + (y % 2) * col / 2; ctx.fillRect(bx + 1, y * row + 1, col - 2, row - 2);
      ctx.fillStyle = 'rgba(230,222,194,.14)'; ctx.fillRect(bx + 2, y * row + 2, col - 4, 1.5);
      ctx.fillStyle = 'rgba(30,24,18,.15)'; ctx.fillRect(bx + 2, (y + 1) * row - 3, col - 4, 1.5);
    }
    grain(ctx, s, random, 16000, .14); stains(ctx, s, random);
  });
  const metal = texture((ctx, s, random) => {
    ctx.fillStyle = '#b0b6ad'; ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x++) {
      const value = Math.sin(x / s * Math.PI * 32);
      ctx.fillStyle = `rgba(${value > 0 ? '255,255,255' : '20,30,28'},${Math.abs(value) * .17})`; ctx.fillRect(x, 0, 1, s);
    }
    for (let i = 0; i < 36; i++) { const x = random() * s; ctx.fillStyle = `rgba(108,62,31,${random() * .2})`; ctx.fillRect(x, random() * s, random() * 2 + 1, random() * s * .55); }
    for (let y = 8; y < s; y += s - 16) for (let x = 6; x < s; x += 24) { ctx.fillStyle = '#4f5e58'; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill(); }
    grain(ctx, s, random, 9000, .08); stains(ctx, s, random, '98,62,30');
  });
  const asphalt = texture((ctx, s, random) => {
    ctx.fillStyle = '#616b6d'; ctx.fillRect(0, 0, s, s); grain(ctx, s, random, 28000, .32); stains(ctx, s, random, '10,17,21');
    ctx.strokeStyle = 'rgba(21,27,29,.8)';
    for (let i = 0; i < 6; i++) { let x = random() * s, y = random() * s; ctx.lineWidth = random() * 1.1 + .4; ctx.beginPath(); ctx.moveTo(x, y); for (let j = 0; j < 12; j++) { x += random() * 20 - 10; y += random() * 20 - 10; ctx.lineTo(x, y); } ctx.stroke(); }
    ctx.strokeStyle = 'rgba(24,29,31,.16)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(s * .28, 0); ctx.lineTo(s * .32, s); ctx.moveTo(s * .68, 0); ctx.lineTo(s * .72, s); ctx.stroke();
  });
  const ground = texture((ctx, s, random) => {
    ctx.fillStyle = '#8f9381'; ctx.fillRect(0, 0, s, s); grain(ctx, s, random, 28000, .3); stains(ctx, s, random, '26,31,23');
    for (let i = 0; i < 650; i++) {
      const x = random() * s, y = random() * s;
      ctx.fillStyle = random() > .5 ? 'rgba(171,164,136,.35)' : 'rgba(50,59,45,.28)';
      ctx.fillRect(x, y, random() * 2.2 + .8, random() * 1.6 + .6);
    }
  });
  const cloth = texture((ctx, s, random) => {
    ctx.fillStyle = '#b5b39a'; ctx.fillRect(0, 0, s, s);
    // Rounded, overlapping camouflage islands keep the fabric readable on
    // curved limbs; a separate fine weave avoids jagged shards.
    const colors = ['#92947e', '#a3a48c', '#737e69', '#c5bfa0', '#858b74', '#666f5c'];
    for (let layer = 0; layer < 3; layer++) for (let i = 0; i < 55; i++) {
      const x = random() * s, y = random() * s, rx = 5 + random() * (layer === 0 ? 34 : 18), ry = 3 + random() * 14;
      ctx.fillStyle = colors[Math.floor(random() * colors.length)]; ctx.beginPath();
      for (let n = 0; n < 8; n++) {
        const a = n * Math.PI / 4, r = .7 + random() * .45, px = x + Math.cos(a) * rx * r, py = y + Math.sin(a) * ry * r;
        if (n === 0) ctx.moveTo(px, py); else {
          const prev = (n - .5) * Math.PI / 4;
          ctx.quadraticCurveTo(x + Math.cos(prev) * rx * 1.15, y + Math.sin(prev) * ry * 1.15, px, py);
        }
      }
      ctx.closePath(); ctx.fill();
    }
    grain(ctx, s, random, 16000, .075);
  });
  const wood = texture((ctx, s, random) => {
    ctx.fillStyle = '#ad956d'; ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 32) { ctx.fillStyle = 'rgba(38,30,18,.45)'; ctx.fillRect(x, 0, 2, s); ctx.fillStyle = 'rgba(231,206,152,.2)'; ctx.fillRect(x + 2, 0, 1.5, s); }
    for (let i = 0; i < 450; i++) { const x = random() * s, y = random() * s; ctx.strokeStyle = `rgba(62,40,18,${random() * .17})`; ctx.lineWidth = .4 + random() * .8; ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x - 3, y + 10, x + 3, y + 24, x, y + 36 + random() * 50); ctx.stroke(); }
    grain(ctx, s, random, 9000, .09); stains(ctx, s, random);
  });
  const anisotropy = Math.min(anisotropyLimit, renderer.capabilities.getMaxAnisotropy());
  for (const map of [concrete, brick, metal, asphalt, ground, cloth, wood]) map.anisotropy = anisotropy;
  const make = (map, color, tile, roughness = .9, metalness = 0, bump = .05) => {
    const highMat = new THREE.MeshStandardMaterial({
      map, color, roughness, metalness,
      bumpMap: useBump ? map : null,
      bumpScale: useBump ? bump : 0,
    });
    const lowMat = new THREE.MeshLambertMaterial({ map, color });
    highMat.userData.tileSize = tile;
    lowMat.userData.tileSize = tile;
    return pairMaterials(highMat, lowMat);
  };
  return {
    concrete: make(concrete, 0x969b92, 4, .96, 0, .07), brick: make(brick, 0xc3bca8, 3, .96, 0, .08),
    metal: make(metal, 0x657977, 2.4, .56, .6, .045), asphalt: make(asphalt, 0x747f85, 8, .78, .08, .025),
    ground: make(ground, 0x9da58d, 9, .98, 0, .045), cloth: make(cloth, 0x7c8979, .65, .98, 0, .012), wood: make(wood, 0xc9b594, 2, .95, 0, .04),
    maps: { concrete, brick, metal, asphalt, ground, cloth, wood },
  };
}

// Local sectors keep a large quarry's props from sharing one map-wide bound.
export function mapSector(matrix, size=96) {
  const position = matrix.elements;
  return `${Math.floor(position[12] / size)},${Math.floor(position[14] / size)}`;
}

export function addSectorInstances(scene, geometry, material, matrices, castShadow = false) {
  if (!matrices.length) return;
  if (matrices.length <= 64) {
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    mesh.castShadow = castShadow;
    matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.computeBoundingSphere();
    scene.add(mesh);
    return;
  }
  const sectors = new Map();
  for (const matrix of matrices) {
    const sector = mapSector(matrix);
    if (!sectors.has(sector)) sectors.set(sector, []);
    sectors.get(sector).push(matrix);
  }
  for (const instances of sectors.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
    mesh.castShadow = castShadow;
    instances.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }
}

export function makeSky(scene, renderer) {
  const uniforms = { sunDirection: { value: new THREE.Vector3(-.65, .42, .5).normalize() } };
  const proceduralShader = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms,
    vertexShader: 'varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position.z=gl_Position.w;}',
    fragmentShader: `
      varying vec3 direction;uniform vec3 sunDirection;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float fbm(vec2 p){float n=0.;float a=.5;for(int i=0;i<5;i++){n+=a*noise(p);p=p*2.03+vec2(4.2,7.8);a*=.5;}return n;}
      void main(){vec3 d=normalize(direction);float up=max(d.y,0.);vec3 sky=mix(vec3(.65,.70,.70),vec3(.20,.32,.43),pow(up,.5));
        vec2 uv=d.xz/max(d.y+.14,.12)*1.5;float cloud=fbm(uv*.7);float mask=smoothstep(.40,.68,cloud)*smoothstep(-.02,.2,d.y);
        float light=pow(max(dot(d,sunDirection),0.),5.);vec3 cloudColor=mix(vec3(.37,.43,.46),vec3(.91,.85,.70),light*.65+cloud*.25);
        sky=mix(sky,cloudColor,mask*.85);float sun=pow(max(dot(d,sunDirection),0.),850.);float halo=pow(max(dot(d,sunDirection),0.),16.);
        sky+=vec3(1.,.77,.46)*(sun*2.+halo*.14);sky=mix(vec3(.60,.65,.65),sky,smoothstep(-.12,.02,d.y));gl_FragColor=vec4(sky,1.);}
    `,
  });
  // Bake the procedural sky once into a cubemap so runtime sky pixels cost one lookup instead of 5-octave FBM.
  const environmentScene = new THREE.Scene();
  const envMesh = new THREE.Mesh(new THREE.SphereGeometry(100, 24, 12), proceduralShader);
  environmentScene.add(envMesh);
  const cubeTarget = new THREE.WebGLCubeRenderTarget(256);
  cubeTarget.texture.colorSpace = THREE.SRGBColorSpace;
  new THREE.CubeCamera(0.1, 200, cubeTarget).update(renderer, environmentScene);
  const generator = new THREE.PMREMGenerator(renderer);
  const pmremTarget = generator.fromCubemap(cubeTarget.texture);
  scene.environment = pmremTarget.texture;
  scene.environmentIntensity = .45;
  generator.dispose();
  envMesh.geometry.dispose();
  proceduralShader.dispose();

  const bakedShader = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { skyMap: { value: cubeTarget.texture }, hazeAmount: { value: 0 } },
    vertexShader: 'varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position.z=gl_Position.w;}',
    fragmentShader: 'varying vec3 direction; uniform samplerCube skyMap; uniform float hazeAmount; void main(){vec4 sky=textureCube(skyMap,direction);float haze=hazeAmount*(1.-max(normalize(direction).y,0.));sky.rgb=mix(sky.rgb,vec3(.79,.68,.51),haze);gl_FragColor=sky;}',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(700, 20, 12), bakedShader);
  sky.renderOrder = 1000; sky.frustumCulled = false; sky.userData.noBatch = true; scene.add(sky);
  const target = {
    texture: pmremTarget.texture,
    dispose() { pmremTarget.dispose(); cubeTarget.dispose(); },
  };
  return { sky, target, envTexture: pmremTarget.texture };
}

export function addWarehouseDetails(owner, structures = []) {
  const { scene, materials: m, surfaces } = owner;
  const warehouseRoofMat = clonePairedMaterial(surfaces.metal, 0x65787b);
  const warehouseFloorMat = clonePairedMaterial(surfaces.concrete, 0xa59f90, 0xffd9a2, 0.06);
  for (const mat of [warehouseFloorMat, warehouseFloorMat._lowMaterial]) {
    if (mat) { mat.polygonOffset = true; mat.polygonOffsetFactor = -1; mat.polygonOffsetUnits = -1; }
  }
  for (const structure of structures) {
    const { x, z, w, d, h, baseY = 0 } = structure;
    const parent = baseY ? new THREE.Group() : scene;
    if (baseY) { parent.position.y = baseY; scene.add(parent); }
    if (structure.roof !== false) {
      owner.box(parent, x, h + .15, z, w + .8, .26, d + .8, warehouseRoofMat);
      owner.box(parent, x, h - 1, z, .25, 1.3, d + .4, m.steel);
      for (let rz = -d / 2; rz <= d / 2; rz += 6) {
        owner.box(parent, x, h - .8, z + rz, w, .2, .2, m.steel);
        for (const side of [-1, 1]) { const beam = owner.box(parent, x + side * w / 4, h - 1.2, z + rz, w / 2, .12, .12, m.rust); beam.rotation.z = side * .1; }
      }
      const floor = owner.box(parent, x, .045, z, w, .08, d, warehouseFloorMat, false); floor.receiveShadow = true;
      for (const side of [-1, 1]) {
        owner.box(parent, x + side * w * .26, h - 1.5, z, .13, .08, Math.max(1, d - 3), m.glow, false);
      }
    }
  }
}

const signCache = new Map();
const signAspect = .48;
const signBacking = pairMaterials(
  new THREE.MeshStandardMaterial({ color: 0x384445, roughness: .78, metalness: .18 }),
  new THREE.MeshLambertMaterial({ color: 0x384445 }),
);

function signTexture(title, subtitle) {
  const canvas = document.createElement('canvas');
  const width = canvas.width = 600;
  const height = canvas.height = width * signAspect;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#273538';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#a1a69b';
  ctx.lineWidth = 5;
  ctx.strokeRect(10, 10, width - 20, height - 20);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#d9d8b8';
  function drawLine(text, weight, size, y) {
    ctx.font = `${weight} ${size}px Arial, sans-serif`;
    const measured = ctx.measureText(text).width;
    if (measured > width - 80) {
      size = Math.floor(size * (width - 80) / measured);
      ctx.font = `${weight} ${size}px Arial, sans-serif`;
    }
    ctx.fillText(text, width / 2, y);
  }
  drawLine(title, 'bold', 90, height * (subtitle ? .39 : .47));
  if (subtitle) drawLine(subtitle, 'normal', 36, height * .65);

  ctx.fillStyle = '#c8a35b';
  for (let x = 24; x + 28 <= width - 24; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, height - 40);
    ctx.lineTo(x + 12, height - 40);
    ctx.lineTo(x + 28, height - 21);
    ctx.lineTo(x + 16, height - 21);
    ctx.closePath();
    ctx.fill();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

export function makeSign(text, subtext = '', width = 3.2) {
  const key = JSON.stringify([text, subtext]);
  let mat = signCache.get(key);
  if (!mat) {
    const map = signTexture(text, subtext);
    mat = pairMaterials(
      new THREE.MeshStandardMaterial({ map, roughness: .8, metalness: .1 }),
      new THREE.MeshLambertMaterial({ map }),
    );
    signCache.set(key, mat);
  }
  const height = width * signAspect;
  const thickness = width * .012;
  const backing = new THREE.Mesh(new THREE.BoxGeometry(width, height, thickness), signBacking);
  backing.position.z = -thickness * .6;
  const sign = new THREE.Group();
  sign.add(backing, new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat));
  return sign;
}
