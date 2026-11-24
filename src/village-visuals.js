import * as THREE from 'three';
import { buildVillageProp, villagePalmTrunkGeometry } from '../shared/village-props.js';
import { clonePairedMaterial, pairMaterials } from './visuals.js';
import { createPortModelBuilder } from './port-visuals.js';
import { terrainRoads } from './terrain-roads.js';
import { desertMountain, desertRockMaterial } from './desert-mountains.js';
import { partitionTerrain } from './terrain-chunks.js';

const palettes = new WeakMap();


function palette(owner) {
  if (palettes.has(owner)) return palettes.get(owner);
  const make = (map, color, tile, normalMap) => {
    const high = new THREE.MeshStandardMaterial({map,color,roughness:.98,normalMap,normalScale:new THREE.Vector2(.2,.2),bumpMap:normalMap?null:map,bumpScale:.025});
    const low = new THREE.MeshLambertMaterial({ map, color });
    high.userData.tileSize = low.userData.tileSize = tile;
    return pairMaterials(high, low);
  };
  const sand=owner.surfaces.maps['village-sand'],stucco=owner.surfaces.maps['village-stucco'];
  const result = {
    sand: make(sand,0xd6bd90,7,owner.surfaces.villageNormals?.sand),
    stucco: make(stucco,0xd0b88f,3.4,owner.surfaces.villageNormals?.stucco),
    stone: clonePairedMaterial(owner.surfaces.concrete, '#b9a380'),
    roof: clonePairedMaterial(owner.surfaces.concrete, '#b09b7b'),
    wood: clonePairedMaterial(owner.surfaces.wood, '#806249'),
    cloth: clonePairedMaterial(owner.surfaces.cloth, '#b29870'),
    linen: clonePairedMaterial(owner.surfaces.cloth, '#d1c5a4'),
    rug: clonePairedMaterial(owner.surfaces.cloth, '#825346'),
    clay: new THREE.MeshStandardMaterial({ color: '#b37c53', roughness: .95 }),
    leaves: new THREE.MeshLambertMaterial({ color: '#72774c', side: THREE.DoubleSide }),
    shadow: new THREE.MeshBasicMaterial({ color: '#302c26' }),
    rock: desertRockMaterial(),
    paints: new Map(),
    signMaterials: new Map(),
  };
  palettes.set(owner, result);
  return result;
}

function painted(palette, source, color) {
  const key = source.uuid + color;
  if (!palette.paints.has(key)) palette.paints.set(key, clonePairedMaterial(source, color));
  return palette.paints.get(key);
}

export function villageRoadMaterial(owner) {
  const m = palette(owner);
  return painted(m, m.sand, '#bda17a');
}

function palm(owner, m, box) {
  const { x, z, h, baseY = 0 } = box;
  const trunk = new THREE.Mesh(villagePalmTrunkGeometry.clone(),m.wood);
  trunk.position.set(x, baseY + h / 2, z);
  trunk.scale.y=h;
  trunk.castShadow = true;
  owner.scene.add(trunk);
  for (let y = .6; y < h; y += .45) owner.cylinder(owner.scene, x, baseY + y, z, .235, .065, m.wood);
  for (let leaf = 0; leaf < 9; leaf++) {
    const angle = leaf / 9 * Math.PI * 2, length = 3.4 + Math.sin(leaf * 2) * .5;
    const vertices = [], indices = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6, halfWidth = Math.sin(t * Math.PI) * .46;
      for (const side of [-1, 1]) vertices.push(
        x + Math.cos(angle) * length * t - Math.sin(angle) * halfWidth * side,
        baseY + h + Math.sin(t * Math.PI) * .7 - t * t * 1.7,
        z + Math.sin(angle) * length * t + Math.cos(angle) * halfWidth * side,
      );
      if (i < 6) {
        const n = i * 2;
        indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
      }
    }
    const frond = new THREE.BufferGeometry();
    frond.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    frond.setIndex(indices);
    frond.computeVertexNormals();
    const mesh = new THREE.Mesh(frond, m.leaves);
    mesh.castShadow = true;
    owner.scene.add(mesh);
  }
}

function pottery(owner, m, box) {
  const { x, z, h, baseY = 0 } = box;
  const heightScale = (h - .015) / .91;
  const profile = [[.24, 0], [.43, .12], [.48, .4], [.36, .7], [.23, .84], [.26, .91]];
  for (const [dx, dz, scale] of [[-.4, -.1, 1], [.43, .25, .74], [.4, -.43, .54]]) {
    const geometry = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r * scale, y * scale * heightScale)), 16);
    const pot = new THREE.Mesh(geometry, m.clay);
    pot.position.set(x + dx, baseY + .015, z + dz);
    pot.castShadow = true;
    owner.scene.add(pot);
    owner.cylinder(owner.scene, x + dx, baseY + .015 + .85 * scale * heightScale, z + dz, .21 * scale, .015, m.shadow, 16);
  }
}

function marketGoods(owner, m, box) {
  const {x,z,w,d,h,baseY=0}=box;
  const scene=owner.scene;
  if(box.kind==='village-woven-baskets'){
    for(const [side,ratio] of [[-1,1],[1,.72]]){
      const radius=w*.23*ratio, height=h*.86*ratio, px=x+side*w*.24;
      const profile=[[0,0],[radius*.68,0],[radius,height*.9],[radius,height],
        [radius*.9,height],[radius*.88,height*.9],[radius*.6,height*.12],[0,height*.12]];
      const mesh=new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),18),painted(m,m.wood,box.color));
      mesh.position.set(px,baseY,z+side*d*.12);
      mesh.castShadow=mesh.receiveShadow=true;
      mesh.geometry.userData.owned=true;
      scene.add(mesh);
      for(let row=1;row<=5;row++){
        const t=row/6, ring=new THREE.Mesh(new THREE.TorusGeometry(radius*(.68+t*.32),.014,5,18),m.roof);
        ring.rotation.x=-Math.PI/2;
        ring.position.set(px,baseY+height*t*.9,z+side*d*.12);
        ring.geometry.userData.owned=true;
        scene.add(ring);
      }
    }
    return;
  }
  const wood=painted(m,m.wood,box.color);
  owner.box(scene,x,baseY+.07,z,w,.14,d,wood);
  for(const side of [-1,1]){
    owner.box(scene,x+side*(w/2-.055),baseY+h*.45,z,.11,h*.72,d-.05,wood);
    owner.box(scene,x,baseY+h*.45,z+side*(d/2-.06),w-.23,h*.72,.12,wood);
  }
  const colors=['#a17b39','#77784a','#986146'];
  for(let row=0;row<3;row++)for(let col=0;col<4;col++){
    const item=new THREE.Mesh(owner.geo.sphere,painted(m,m.clay,colors[(row+col)%colors.length]));
    item.position.set(x+(col-1.5)*w*.19,baseY+h*(.63+.04*Math.sin(col+row)),z+(row-1)*d*.25);
    item.scale.set(w*.094,h*.26,d*.11);
    item.castShadow=item.receiveShadow=true;
    scene.add(item);
  }
}

function shutters(owner, m, structure) {
  const { x, z, w, d, h, baseY = 0, doorWidth = 5.6, doorHeight = 2.65 } = structure;
  const ruined = structure.kind === 'village-ruin';
  if(structure.interactiveShutters){
    // Fit the trim to the actual facade and keep the jamb clear of the aperture's wall plane.
    const frame=structure.wallThickness
      ?{offset:structure.wallThickness/2+.05,jamb:.08,jambDepth:.14,lintel:.08}
      :{offset:.16,jamb:.055,jambDepth:.13,lintel:.063};
    for(const side of [-1,1]){
      const face=z+side*(d/2+frame.offset),windowSide=x+side*(w/2+.16);
      for(const edge of [-1,1])owner.box(owner.scene,x+edge*(doorWidth/2+frame.jamb),baseY+doorHeight/2,face,
        .11,doorHeight,frame.jambDepth,m.wood,false);
      owner.box(owner.scene,x,baseY+doorHeight+frame.lintel,face,doorWidth+2*frame.jamb+.11,.16,.14,m.wood,false);
      for(let floor=0;floor<structure.floors;floor++){
        owner.box(owner.scene,windowSide,baseY+floor*3+.955,z,.16,.11,2.39,m.roof,false);
        for(const edge of [-1,1])owner.box(owner.scene,windowSide,baseY+floor*3+1.575,z+edge*1.15,
          .085,1.16,.095,m.wood,false);
      }
    }
    const floor=owner.box(owner.scene,x,baseY+.015,z,w-.6,.025,d-.6,m.roof,false);
    floor.receiveShadow=true;
    return;
  }
  const doorCenter=structure.doorHeight===undefined?1.32:doorHeight/2;
  const shutterLevels=structure.floors??1;
  for (let level = 0; level < shutterLevels; level++) for (const side of ruined ? [-1] : [-1, 1]) for (const end of [-1, 1]) {
    const px = x + side * (w / 2 + .32), pz = z + end * d * .24;
    for (const edge of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(px, baseY + level * 3.1 + 1.7, pz + edge * 1.3);
      hinge.rotation.y = edge * side * .28;
      owner.scene.add(hinge);
      owner.box(hinge, 0, 0, edge * .62, .08, 1.18, 1.24, m.wood);
      for (let y = -.45; y <= .46; y += .18) owner.box(hinge, side * .05, y, edge * .62, .025, .045, 1.16, m.roof, false);
      for (const y of [-.38, .38]) owner.cylinder(hinge, 0, y, 0, .025, .16, m.shadow, 8);
    }
  }
  // Timber ends, door surrounds and a weathered plinth keep facades readable up close.
  for (const side of [-1, 1]) {
    if (ruined) continue;
    for (const edge of [-1, 1]) owner.box(owner.scene, x + edge * (doorWidth/2+.1), baseY + doorCenter, z + side * (d / 2 + .31),
      .18, doorHeight, .22, m.wood);
    owner.box(owner.scene, x, baseY + doorHeight+.07, z + side * (d / 2 + .31), doorWidth+.5, .22, .18, m.wood);
    for (let dx = -w / 2 + 1; dx < w / 2; dx += 2.6) owner.box(owner.scene, x + dx, baseY + h - .15,
      z + side * (d / 2 + .14), .16, .17, .6, m.wood, false);
    for (const edge of [-1, 1]) owner.box(owner.scene, x + edge * (w + doorWidth) / 4, baseY + .16, z + side * (d / 2 + .31),
      (w - doorWidth) / 2 - .1, .3, .06, m.roof, false);
  }
  const floor = owner.box(owner.scene, x, baseY + .015, z, w - .6, .025, d - .6, m.roof, false);
  floor.receiveShadow = true;
  for (let level = 1; level < shutterLevels; level++) for (const side of [-1, 1]) for (const end of [-1, 1]) {
    owner.box(owner.scene, x + side * w * .29, baseY + level * 3.1 + 1.55, z + end * (d / 2 + .34), 1.35, 1.35, .1, m.wood);
    owner.box(owner.scene, x + side * w * .29, baseY + level * 3.1 + .84, z + end * (d / 2 + .4), 1.65, .14, .25, m.roof);
  }
}

function houseDetails(owner, m, structure) {
  const scene = owner.scene, root = new THREE.Group();
  root.position.set(structure.x, structure.baseY ?? 0, structure.z);
  const rotated = structure.doorAxis === 'x';
  if (rotated) root.rotation.y = Math.PI / 2;
  scene.add(root);
  owner.scene = root;
  try {
    shutters(owner, m, { ...structure, x: 0, z: 0, baseY: 0,
      w: rotated ? structure.d : structure.w, d: rotated ? structure.w : structure.d });
  } finally { owner.scene = scene; }
}

export function createVillageModelBuilder(owner) {
  const m = palette(owner);
  return (boxes = [], structures = [], roads = [], terrain = null) => {
    for (const road of roads) {
      const geometry = new THREE.PlaneGeometry(road.w, road.d, Math.max(1, Math.ceil(road.w / 2)), Math.max(1, Math.ceil(road.d / 2)));
      geometry.rotateX(-Math.PI / 2);
      geometry.rotateY(road.yaw ?? 0);
      geometry.translate(road.x, 0, road.z);
      const vertices = geometry.attributes.position;
      for (let i = 0; i < vertices.count; i++) vertices.setY(i, (terrain?.heightAt(vertices.getX(i), vertices.getZ(i)) ?? 0) + .035);
      geometry.computeVertexNormals();
      const lane = new THREE.Mesh(geometry, painted(m, m.sand, '#c1a57b'));
      owner.scene.add(lane);
      lane.receiveShadow = true;
    }
    for (const box of boxes) {
      const { kind, x, z, w, d, h, baseY = 0, color = '#c3ad89' } = box;
      if (!kind.startsWith('village-')) continue;
      if (kind === 'village-lettered-sign') {
        const key=JSON.stringify([box.text,color]);
        let material=m.signMaterials.get(key);
        if(!material){
          const canvas=document.createElement('canvas');canvas.width=320;canvas.height=72;
          const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,320,72);
          ctx.strokeStyle='#ead8ae';ctx.lineWidth=2;ctx.strokeRect(5,5,310,62);
          ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#f7e6bc';
          ctx.font='bold 31px sans-serif';ctx.fillText(box.text,160,37,290);
          const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
          material=new THREE.MeshLambertMaterial({map:texture});
          m.signMaterials.set(key,material);
        }
        owner.box(owner.scene,x,baseY+h/2,z,w,h,d,m.wood,false);
        for(const sign of [-1,1]){
          const face=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);
          face.geometry.userData.owned=true;face.position.set(x,baseY+h/2,z+sign*(d/2+.01));
          if(sign<0)face.rotation.y=Math.PI;
          owner.scene.add(face);
        }
        continue;
      }
      if (buildVillageProp(owner, { ...m, wall: painted(m, kind==='village-street-crate'?m.wood:m.stucco, color) }, box)) continue;
      if (kind === 'village-palm') { palm(owner, m, box); continue; }
      if (kind === 'village-rock') { desertMountain(owner, m.rock, box, terrain); continue; }
      if (kind === 'village-pottery') { pottery(owner, m, box); continue; }
      if (kind === 'village-scrub') {
        for(let i=0;i<6;i++){
          const angle=i*2.4;
          const blade=owner.box(owner.scene,x+Math.cos(angle)*w*.19,baseY+h*.39,z+Math.sin(angle)*d*.2,
            w*.08,h*(.65+i%3*.14),d*.08,painted(m,m.wood,color),false);
          blade.rotation.set(Math.sin(angle)*.52,angle,Math.cos(angle)*.56);
        }
        continue;
      }
      if (kind === 'village-woven-baskets' || kind === 'village-produce-crates') { marketGoods(owner, m, box); continue; }
      if (kind === 'village-barrels') {
        for (const side of [-1, 1]) {
          const px = x + side * .48;
          owner.cylinder(owner.scene, px, baseY + h / 2, z, .4, h - .04, painted(m, owner.surfaces.metal, color), 16);
          for (const y of [.06, .3, .72, .94]) owner.cylinder(owner.scene, px, baseY + y * h, z, .42, .055, m.wood, 16);
          owner.cylinder(owner.scene, px, baseY + h - .02, z, .39, .04, m.roof, 16);
        }
        continue;
      }
      if (kind === 'village-rubble') {
        owner.box(owner.scene, x, baseY + .15, z, w, .3, d, m.stone);
        for (let row = 0; row < 2; row++) for (let i = 0; i < 4; i++) {
          const brick = owner.box(owner.scene, x - w * .36 + i * w * .24, baseY + .42 + row * .24,
            z + (row ? -.28 : .3), w * .22, .26, d * .37, m.stone);
          brick.rotation.y = Math.sin(i * 3 + row) * .1;
        }
        continue;
      }
      const source = kind === 'village-wood' || kind === 'village-stair' ? m.wood : kind === 'village-roof' || kind === 'village-floor' ? m.roof :
        kind === 'village-awning' ? m.cloth : kind === 'village-stone' ? m.stone : m.stucco;
      owner.box(owner.scene, x, baseY + h / 2, z, w, h, d, painted(m, source, color));
      if (kind === 'village-awning') {
        for (let stripe = -w / 2 + .15; stripe < w / 2; stripe += .65) {
          owner.box(owner.scene, x + stripe, baseY + h + .003, z, .18, .009, d, m.roof, false);
        }
        owner.box(owner.scene, x, baseY - .12, z + d / 2, w, .25, .035, painted(m, m.cloth, color), false);
      }
      if (kind === 'village-barricade') {
        owner.box(owner.scene, x, baseY + h + .03, z, w + .08, .12, d + .08, m.stone);
      }
    }
    for (const structure of structures) {
      if (['village-house', 'village-house-tall', 'village-house-three', 'village-ruin'].includes(structure.kind)) houseDetails(owner, m, structure);
      if (structure.kind === 'village-stall') {
        for (let i = 0; i < 5; i++) {
          owner.box(owner.scene, structure.x - 2 + i, (structure.baseY ?? 0) + 1.05, structure.z + .7,
            .72, .28, .8, i % 2 ? m.clay : m.wood);
        }
      }
      if (structure.kind === 'village-well') {
        const { x, z, baseY = 0 } = structure;
        owner.box(owner.scene, x, baseY + .03, z, 2.1, .02, 2.1, m.shadow, false);
        const axle = owner.cylinder(owner.scene, x, baseY + 2.3, z, .12, 3.4, m.wood, 12);
        axle.rotation.z = Math.PI / 2;
        owner.cylinder(owner.scene, x, baseY + 1.65, z, .025, 1.35, m.wood);
        owner.cylinder(owner.scene, x, baseY + 1.03, z, .28, .35, owner.materials.steel, 12);
      }
    }
  };
}

function addDesertHorizon(parent, material, span, apron) {
  const half = span / 2, center = half + apron / 2;
  for (const [x, z, width, depth] of [
    [-center, 0, apron, span], [center, 0, apron, span],
    [0, -center, span, apron], [0, center, span, apron],
    [-center, -center, apron, apron], [center, -center, apron, apron],
    [-center, center, apron, apron], [center, center, apron, apron],
  ]) {
    const geometry = new THREE.PlaneGeometry(width, depth, Math.ceil(width / 24), Math.ceil(depth / 24));
    geometry.rotateX(-Math.PI / 2).translate(x, 0, z);
    const vertices = geometry.attributes.position, uv = geometry.attributes.uv;
    for (let i = 0; i < vertices.count; i++) {
      const px = vertices.getX(i), pz = vertices.getZ(i);
      const edge = Math.max(Math.abs(px), Math.abs(pz)) - half;
      const dunes = 6 + 4 * Math.sin(px * .021 + pz * .009) + 2 * Math.cos(pz * .035 - px * .014);
      vertices.setY(i, dunes * THREE.MathUtils.smoothstep(edge, 0, 180));
      uv.setXY(i, (px + half) / 7, (half - pz) / 7);
    }
    geometry.computeVertexNormals();
    geometry.userData.owned = true;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.noBatch = true;
    parent.add(mesh);
  }
}

export function villageTerrainSpan(map){
  const margin=map.terrainMargin??(map.id==='alhadra'?Math.ceil(110/map.terrain.cell)*map.terrain.cell:110);
  return map.size+2*margin;
}

export function addVillageGround(owner, map, assets = true) {
  const m = palette(owner), span = villageTerrainSpan(map), terrain = map.terrain.baseSurface ?? map.terrain;
  const sand=map.campaign?clonePairedMaterial(m.sand,m.sand.color):m.sand;
  if(map.campaign)sand.userData.remasterSurface=sand._lowMaterial.userData.remasterSurface='sand';
  const segments=Math.ceil(span/map.terrain.cell);
  const geometry = new THREE.PlaneGeometry(span, span, segments, segments);
  const vertices = geometry.attributes.position;
  for (let i = 0; i < vertices.count; i++) vertices.setZ(i, terrain.heightAt(vertices.getX(i), -vertices.getY(i)));
  geometry.computeVertexNormals();
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * span / 7, uv.getY(i) * span / 7);
  const ground = new THREE.Mesh(geometry, sand);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  owner.scene.add(ground);
  const roads = terrainRoads(owner, ground, span, map.roads, sand, '#bda17a');
  partitionTerrain(owner.scene, geometry);
  if (map.terrainApron) addDesertHorizon(owner.scene, sand, span, map.terrainApron);
  if (assets) {
    createVillageModelBuilder(owner)(map.boxes, map.structures, [], terrain);
    if (map.ship) createPortModelBuilder(owner)({ ship: map.ship });
  }
  return roads;
}
