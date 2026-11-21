// Transfer the authoritative village layout into Blender in world coordinates.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import { getMap } from '../shared/world.js';
import { mapItems } from '../shared/map-edits.js';
import { buildMapScene } from '../src/map-scene.js';
import { createMapModelBuilder } from '../src/renderer.js';
import { createSurfaceMaterials } from '../src/visuals.js';
import { villageLayoutKey } from '../src/village-layout-key.js';
import { villageTerrainSpan } from '../src/village-visuals.js';

globalThis.document = { createElement: () => createCanvas(512, 512) };
const output = resolve(process.argv[2] ?? '.perf-local/village-bake');
const mapId = process.argv[3] ?? 'village';
if(mapId==='alhadra')await import('../shared/campaign/alhadra.js');
if(!['village','alhadra'].includes(mapId))throw new Error('Expected village or alhadra');
await Promise.all([mkdir(output, {recursive:true}), MeshoptSimplifier.ready]);

const surfaces = createSurfaceMaterials({capabilities:{getMaxAnisotropy:()=>2}},{bake:true});
const owner = createMapModelBuilder(surfaces);
const map = getMap(mapId);
owner.scene = new THREE.Group();
const {root,groups} = buildMapScene(owner, map);
if(mapId==='alhadra'){
  const authoredProps=new Set(['truck','car','generator','fueltank']);
  for(const {key,kind,value} of mapItems(map))
    if((kind==='structure'&&value.kind==='village-house')||
       (kind==='box'&&(value.kind==='village-awning'||authoredProps.has(value.kind))))
      groups.get(key)?.removeFromParent();
}
root.updateMatrixWorld(true);
const surfaceByMap = new Map(Object.entries(surfaces.maps).map(([name, texture]) => [texture, name]));
const objectives = new Set([...owner.flags.values()].map(flag=>flag.group));
const assetsByKey=new Map(mapItems(map).map(({key,value})=>[key,value]));
const batches = new Map(), stats = {originalTriangles:0, groundTriangles:0};
let roadMask, rockTexture, terrainIndex = 0;
const labels = mapId==='alhadra'?createCanvas(1024,1024):null;
const labelSlots = new Map();

function alhadraPaint(c,point,ground,rock,asset){
  const {x,y,z}=point;
  if(asset?.kind==='sandbags'){
    const grey=.91+.09*Math.sin(x*7.15)*Math.cos(z*7.25);
    return [.433*grey,.35*grey,.23*grey];
  }
  if(ground){
    const center=-140+(x+200)*.91+Math.sin((x+172)*.045)*6;
    const wadi=(1-THREE.MathUtils.smoothstep(x,-119,-77))*Math.exp(-((z-center)**2)/175);
    const soil=Math.sin(x*.030+z*.041)*Math.cos(z*.072)*.068+Math.sin(x*.119-z*.209)*.032;
    return [c[0]*(1+soil-.13*wadi),c[1]*(1+soil-.21*wadi),c[2]*(1+soil-.24*wadi)];
  }
  if(rock){
    const stripe=Math.sin(y*(asset?.w>30?.63:3.5)+x*.04+z*.06)*.090;
    return c.map((value,i)=>value*(.97+stripe*(1+i*.15)));
  }
  return c;
}

function include(mesh, matrix) {
  let detail=0,asset;
  for (let node = mesh; node; node = node.parent) {
    if (objectives.has(node) || !node.visible) return;
    detail = Math.max(detail, node.userData.detailLevel ?? 0);
    if(node.userData.editorKey)asset=assetsByKey.get(node.userData.editorKey);
  }
  const geo = mesh.geometry, { position, normal, uv, color } = geo.attributes;
  const indexed = geo.index?.array ?? Uint32Array.from({length:position.count},(_,i)=>i);
  const groups = Array.isArray(mesh.material) ? geo.groups : [{start:0,count:indexed.length,materialIndex:0}];
  const point = new THREE.Vector3(), n = new THREE.Vector3(), origin = new THREE.Vector3().setFromMatrixPosition(matrix);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
  const mirrored = matrix.determinant() < 0;
  if(Math.abs(origin.x)+Math.abs(origin.z)<.01 && !mesh.userData.noBatch) {
    geo.computeBoundingSphere();
    origin.copy(geo.boundingSphere.center).applyMatrix4(matrix);
  }
  for (const group of groups) {
    const mat = Array.isArray(mesh.material) ? mesh.material[group.materialIndex] : mesh.material;
    const ground = Boolean(mat.roadMask);
    const rock = mat.vertexColors && mat.map && !surfaceByMap.has(mat.map);
    const layer=mesh.parent?.userData.editorKey;
    let label;
    if(labels&&mat.map&&layer?.includes('-sign')&&!surfaceByMap.has(mat.map)){
      label=labelSlots.get(mat.map);
      if(!label){
        const index=labelSlots.size;
        if(index>=8)throw new Error('Al-Hadra sign atlas is full');
        label={x:index%2*512+4,y:Math.floor(index/2)*256+4};
        labels.getContext('2d').drawImage(mat.map.image,label.x,label.y,504,248);
        labelSlots.set(mat.map,label);
      }
    }
    if (ground) roadMask = mat.roadMask.image;
    if (rock) rockTexture = mat.map.image;
    const surface = ground ? 'road-sand' : label ? 'sign' : rock ? 'rock' : surfaceByMap.get(mat.map)
      ?? (mat.side===THREE.DoubleSide ? 'leaf' : mat.isMeshBasicMaterial ? 'unlit' : 'plain');
    if(mat.map && !ground && !rock && !label && !surfaceByMap.has(mat.map)){
      throw new Error(`Unmapped village texture on ${layer??mesh.geometry.type}`);
    }
    const terrain = geo.userData.terrainError !== undefined;
    const spatialKey = terrain || mesh.userData.noBatch ? `tile-${terrainIndex++}`
      : `${Math.floor(origin.x/80)}_${Math.floor(origin.z/80)}`;
    const key = `${spatialKey}-${surface}-${Number(mesh.castShadow)}-${detail}`;
    if(!batches.has(key)) batches.set(key,{name:key,surface,detail,cast:mesh.castShadow,terrain,p:[],n:[],uv:[],c:[],indices:[]});
    const batch = batches.get(key);
    let triangles = Uint32Array.from(indexed.subarray(group.start, group.start+group.count));
    stats.originalTriangles += triangles.length/3;
    if ((terrain || rock) && triangles.length > 600) {
      const span = MeshoptSimplifier.getScale(position.array,3);
      const backdrop=mapId==='alhadra'&&asset?.kind==='village-rock'&&asset.w>30;
      const error=terrain?(mapId==='alhadra'?.008:.032):backdrop?.55:.060;
      const fraction=backdrop?.15:.38;
      [triangles] = MeshoptSimplifier.simplify(triangles,position.array,3,Math.floor(triangles.length*fraction/3)*3,
        error/Math.max(span,1),['LockBorder']);
    } else if (triangles.length > 360 && mesh.material === mat && normal && uv && !color) {
      const attributes = new Float32Array(position.count*5);
      for(let i=0;i<position.count;i++) attributes.set([normal.getX(i),normal.getY(i),normal.getZ(i),uv.getX(i),uv.getY(i)],i*5);
      const error = .012 / Math.max(matrix.getMaxScaleOnAxis(),1);
      [triangles] = MeshoptSimplifier.simplifyWithAttributes(triangles,position.array,3,attributes,5,
        [.24,.24,.24,.15,.15],null,Math.floor(triangles.length*.60/3)*3,error,['ErrorAbsolute','LockBorder']);
    }
    const vertices = new Map();
    for(const index of triangles) if(!vertices.has(index)){
      vertices.set(index,batch.p.length/3);
      point.fromBufferAttribute(position,index).applyMatrix4(matrix);
      batch.p.push(point.x,point.y,point.z);
      batch.n.push(...(normal?n.fromBufferAttribute(normal,index).applyNormalMatrix(normalMatrix):n.set(0,1,0)).toArray());
      const u=uv?.getX(index)??0,v=uv?.getY(index)??0;
      batch.uv.push(...(label?[(label.x+u*504)/1024,1-(label.y+(1-v)*248)/1024]:[u,v]));
      const vertexColor=mat.vertexColors&&color;
      const c=[mat.color.r*(vertexColor?color.getX(index):1),mat.color.g*(vertexColor?color.getY(index):1),
        mat.color.b*(vertexColor?color.getZ(index):1)];
      batch.c.push(...(mapId==='alhadra'?alhadraPaint(c,point,ground,rock,asset):c));
    }
    for(let i=0;i<triangles.length;i+=3) batch.indices.push(vertices.get(triangles[i]),
      vertices.get(triangles[i+(mirrored?2:1)]),vertices.get(triangles[i+(mirrored?1:2)]));
    if(terrain)stats.groundTriangles+=triangles.length/3;
  }
}

const instance = new THREE.Matrix4(), world = new THREE.Matrix4();
root.traverse(mesh=>{
  if(!mesh.isMesh) return;
  if (!mesh.isInstancedMesh) include(mesh,mesh.matrixWorld);
  else for(let i=0;i<mesh.count;i++){
    mesh.getMatrixAt(i,instance);
    include(mesh,world.multiplyMatrices(mesh.matrixWorld,instance));
  }
});
const packed = [...batches.values()];
if(!roadMask || !rockTexture) throw new Error('Missing terrain textures');
// This mask only tints metre-wide paths, while the shared sand texture
// supplies the close detail. Keep the uploaded mask at a quarter of the old area.
const compactRoadMask=createCanvas(2048,2048);
compactRoadMask.getContext('2d').drawImage(roadMask,0,0,2048,2048);
const groundDetails=[];
let seed=652311;
const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
for(let i=0;mapId==='village'&&i<390;i++){
  const side=random()>.5?1:-1, x=side*(69+random()*62), z=(random()-.5)*326;
  if(map.structures.some(s=>Math.abs(x-s.x)<s.w/2+1.4&&Math.abs(z-s.z)<s.d/2+1.4))continue;
  if(map.ship&&Math.abs(x-map.ship.x)<map.ship.w/2+1&&Math.abs(z-map.ship.z)<map.ship.d/2+2)continue;
  groundDetails.push({x,z,baseY:map.terrain.heightAt(x,z),scale:.17+random()*.45,turn:random()*Math.PI*2});
}
const metadata = {
  layout:villageLayoutKey(map), span:villageTerrainSpan(map), stats,
  structures:map.structures, boxes:map.boxes.filter(b=>!b.editorPart||
    ['village-bed','village-cabinet','village-table','village-shelf'].includes(b.kind)),
  ship:map.ship, groundDetails,
};
if(mapId==='alhadra'){
  const spacing=2;
  const {minX,minZ,maxX,maxZ}=map.playArea;
  const elevations=[];
  for(let z=minZ;z<=maxZ;z+=spacing)
    for(let x=minX;x<=maxX;x+=spacing)elevations.push(map.terrain.heightAt(x,z));
  metadata.ground={minX,minZ,spacing,columns:1+(maxX-minX)/spacing,elevations};
  metadata.depotProps=metadata.boxes.filter(box=>box.campaignDestructible);
  metadata.boxes=metadata.boxes.filter(box=>!box.campaignDestructible&&!box.missionDynamic);
}
for(const b of packed) for(const key of ['p','n','uv','c'])
  b[key] = Buffer.from(Float32Array.from(b[key]).buffer).toString('base64');
for(const b of packed) b.indices = Buffer.from(Uint32Array.from(b.indices).buffer).toString('base64');
await Promise.all([
  writeFile(resolve(output,'village.json'),JSON.stringify({...metadata,meshes:packed})),
  writeFile(resolve(output,'roads.webp'),compactRoadMask.toBuffer('image/webp',95)),
  writeFile(resolve(output,'rock.webp'),rockTexture.toBuffer('image/webp',94)),
  ...(labels?[writeFile(resolve(output,'labels.webp'),labels.toBuffer('image/webp',96))]:[]),
]);
console.log(JSON.stringify({...stats,batches:packed.length}));
