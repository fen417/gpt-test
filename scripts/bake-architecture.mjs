import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {ARCH_LIGHT_VERSION,ARCH_LIGHT_MAPS,architectureReceiver,geometryKey,proceduralReceiver,meshGeometryKey} from '../src/architecture-lightmap-format.js';

const out='public/architecture-v1',loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
globalThis.self??=globalThis;
const hash=b=>createHash('sha256').update(b).digest('hex');
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const V=THREE.Vector3;
const sky=new V(-.36,.85,.38).normalize();
const directions=Array.from({length:12},(_,i)=>{
  const r=Math.sqrt((i+.5)/12),angle=i*2.399963229728653;
  return new V(Math.cos(angle)*r,Math.sin(angle)*r,Math.sqrt(1-r*r));
});
const temp=new V(),edge1=new V(),edge2=new V(),cross=new V(),delta=new V(),q=new V();
function hitTriangle(o,d,t,max){
  edge1.subVectors(t.b,t.a);edge2.subVectors(t.c,t.a);cross.crossVectors(d,edge2);
  const det=edge1.dot(cross);if(Math.abs(det)<1e-8)return max;
  const inv=1/det;delta.subVectors(o,t.a);const u=delta.dot(cross)*inv;if(u<0||u>1)return max;
  q.crossVectors(delta,edge1);const v=d.dot(q)*inv;if(v<0||u+v>1)return max;
  const distance=edge2.dot(q)*inv;return distance>.009&&distance<max?distance:max;
}
function bounds(list){
  const box=new THREE.Box3();for(const t of list){box.expandByPoint(t.a);box.expandByPoint(t.b);box.expandByPoint(t.c);}
  return box;
}
function bvh(list){
  const box=bounds(list);if(list.length<=10)return {box,list};
  const span=box.getSize(new V()),axis=span.x>=span.y&&span.x>=span.z?'x':span.y>=span.z?'y':'z';
  list.sort((a,b)=>a.center[axis]-b.center[axis]);const m=list.length>>1;
  return {box,left:bvh(list.slice(0,m)),right:bvh(list.slice(m))};
}
function hitBox(o,d,b,max){
  let lo=0,hi=max;
  for(const k of ['x','y','z']){
    if(Math.abs(d[k])<1e-10){if(o[k]<b.min[k]||o[k]>b.max[k])return false;continue;}
    let a=(b.min[k]-o[k])/d[k],z=(b.max[k]-o[k])/d[k];if(a>z)[a,z]=[z,a];
    lo=Math.max(lo,a);hi=Math.min(hi,z);if(lo>hi)return false;
  }
  return true;
}
function trace(node,o,d,max,skip){
  if(!hitBox(o,d,node.box,max))return {distance:max,hit:null};
  if(node.list){let hit=null;for(const t of node.list){if(t===skip)continue;const distance=hitTriangle(o,d,t,max);if(distance<max){max=distance;hit=t;}}return {distance:max,hit};}
  const a=trace(node.left,o,d,max,skip),b=trace(node.right,o,d,a.distance,skip);return b.hit?b:a;
}
function shade(tree,t,u,v){
  const n=t.n,origin=t.a.clone().addScaledVector(t.b.clone().sub(t.a),u).addScaledVector(t.c.clone().sub(t.a),v).addScaledVector(n,.028);
  const tangent=new V().crossVectors(Math.abs(n.y)>.9?new V(1,0,0):new V(0,1,0),n).normalize(),bitangent=new V().crossVectors(n,tangent);
  let ao=0,r=0,g=0,b=0;
  for(const local of directions){
    const d=new V().addScaledVector(tangent,local.x).addScaledVector(bitangent,local.y).addScaledVector(n,local.z);
    const {hit,distance}=trace(tree,origin,d,18,t);
    ao+=hit?clamp(distance/2.2,0,1):1;
    if(!hit){
      const y=Math.max(0,d.y),k=.08+.13*y;
      r+=k*.82;g+=k*.91;b+=k;
    }else{
      const at=origin.clone().addScaledVector(d,distance).addScaledVector(hit.n,.035);
      const lit=trace(tree,at,sky,28,hit).hit?.25:1;
      const k=.17*lit/(1+distance*.10);
      r+=hit.color[0]*k;g+=hit.color[1]*k;b+=hit.color[2]*k;
    }
  }
  return [r/12,g/12,b/12,ao/12];
}
function triangles(scene,procedural=false){
  const list=[],meshes=[];scene.updateMatrixWorld(true);let ordinal=0;
  scene.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const id=ordinal++;if(!(procedural?proceduralReceiver(mesh):architectureReceiver(mesh)))return;
    const g=mesh.geometry,p=g.getAttribute('position'),index=g.index,color=g.getAttribute('color'),count=index?.count??p.count;
    if(count%3)return;
    const entry={id,name:mesh.name,key:procedural?meshGeometryKey(mesh,g):geometryKey(g),count,triangles:[]};
    meshes.push(entry);
    for(let i=0;i<count;i+=3){
      const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j);
      const [a,b,c]=ids.map(j=>new V().fromBufferAttribute(p,j).applyMatrix4(mesh.matrixWorld));
      const n=new V().crossVectors(b.clone().sub(a),c.clone().sub(a)),area=n.length()*.5;
      if(area<1e-8){entry.triangles.push(null);continue;}
      n.normalize();const tint=color?[0,1,2].map(k=>ids.reduce((sum,j)=>sum+[color.getX(j),color.getY(j),color.getZ(j)][k],0)/3):[.55,.55,.55];
      const t={a,b,c,n,area,color:tint,center:a.clone().add(b).add(c).multiplyScalar(1/3)};
      entry.triangles.push(t);list.push(t);
    }
  });
  return {list,meshes};
}
async function load(file){
  const bytes=await readFile(file);
  const {scene}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  return {scene,sha:hash(bytes)};
}
function pack(meshes,size,scale,minArea,allowPartial=false){
  const charts=[];
  for(const mesh of meshes)for(let i=0;i<mesh.triangles.length;i++){
    const t=mesh.triangles[i];if(!t||t.area<minArea)continue;
    const span=Math.max(t.a.distanceTo(t.b),t.b.distanceTo(t.c),t.c.distanceTo(t.a));
    charts.push({mesh,i,t,s:clamp(Math.ceil(span*scale)+3,4,28)});
  }
  charts.sort((a,b)=>b.s-a.s||b.t.area-a.t.area);let x=2,y=2,row=0;
  const placed=[];
  for(const chart of charts){
    if(x+chart.s>size){x=2;y+=row;row=0;}
    if(y+chart.s>size){if(!allowPartial)return null;break;}
    chart.x=x;chart.y=y;x+=chart.s;row=Math.max(row,chart.s);placed.push(chart);
  }
  return placed;
}
function paint(pixels,size,chart,tree){
  const {x,y,s,t}=chart,inner=s-3;
  // Trace a bounded grid in barycentric space then bilinearly interpolate
  // within this chart. Clamp the outer texels to the triangle for padding.
  const n=clamp(Math.ceil(inner/3),2,7),samples=[];
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    let u=i/(n-1),v=j/(n-1);if(u+v>1){const sum=u+v;u/=sum;v/=sum;}
    // Pull samples slightly away from hard boundaries to avoid self hits.
    samples.push(shade(tree,t,u*.97+.01,v*.97+.01));
  }
  for(let j=0;j<s;j++)for(let i=0;i<s;i++){
    let u=clamp((i-1)/inner,0,1),v=clamp((j-1)/inner,0,1);if(u+v>1){const sum=u+v;u/=sum;v/=sum;}
    const a=u*(n-1),b=v*(n-1),ax=Math.floor(a),by=Math.floor(b),fx=a-ax,fy=b-by;
    const c00=samples[by*n+ax],c10=samples[by*n+Math.min(n-1,ax+1)],c01=samples[Math.min(n-1,by+1)*n+ax],c11=samples[Math.min(n-1,by+1)*n+Math.min(n-1,ax+1)];
    const offset=((y+j)*size+x+i)*4;
    for(let k=0;k<4;k++)pixels[offset+k]=Math.round(clamp((c00[k]*(1-fx)+c10[k]*fx)*(1-fy)+(c01[k]*(1-fx)+c11[k]*fx)*fy,0,1)*255);
  }
}
await mkdir(out,{recursive:true});
let previous={maps:{}};try{previous=JSON.parse(await readFile(out+'/manifest.json','utf8'));}catch{}
const manifest={version:ARCH_LIGHT_VERSION,maps:{}};
const saveManifest=()=>writeFile(out+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');
for(const [mapId,folder] of Object.entries(ARCH_LIGHT_MAPS)){
  const procedural=mapId==='safra';
  const path='src/assets/'+folder+'/base.glb';
  let scene,sha;
  if(procedural){
    const {createCanvas}=await import('@napi-rs/canvas');
    globalThis.document??={createElement:()=>createCanvas(512,512)};
    const [{SAFRA},{createMapModelBuilder},{createSurfaceMaterials},{buildMapScene}]=await Promise.all([
      import('../shared/campaign/safra.js'),import('../src/renderer.js'),import('../src/visuals.js'),import('../src/map-scene.js')]);
    const surfaces=createSurfaceMaterials({capabilities:{getMaxAnisotropy:()=>2}},{bake:true});
    const owner=createMapModelBuilder(surfaces);scene=owner.scene=new THREE.Group();owner.map=SAFRA;
    buildMapScene(owner,SAFRA);owner.mergeStaticWorld(new Set());scene.updateMatrixWorld(true);
    const keys=[];scene.traverse(m=>{if(proceduralReceiver(m))keys.push(meshGeometryKey(m));});
    sha=hash(keys.join('|'));
  }else sha=hash(await readFile(path));
  const old=previous.maps?.[mapId];
  if(previous.version===ARCH_LIGHT_VERSION&&old?.source===sha){
    try{for(const name of [old.atlas,old.charts])await readFile(out+'/'+name);manifest.maps[mapId]=old;await saveManifest();console.log('Architecture cached',mapId);continue;}catch{}
  }
  if(!scene)({scene}=await load(path));
  const {list,meshes}=triangles(scene,procedural);
  if(!list.length)throw Error('No architecture in '+mapId);
  const size=['laguna','estate'].includes(folder)?1024:2048;
  let charts,minArea=.015,scale=2;
  // A fixed atlas budget. Preserve meaningful wall/floor triangles first,
  // skip sub-pixel bevels and small decorative polygons if the map is dense.
  for(let attempt=0;attempt<9&&!charts?.length;attempt++){
    charts=pack(meshes,size,scale,minArea);
    if(!charts?.length){scale=Math.max(.45,scale*.8);minArea*=1.3;}
  }
  if(!charts?.length){
    // Dense terrain can exhaust a fixed atlas; keep the most substantial
    // charts and reserve a neutral texel for the remaining triangles.
    minArea=.015;scale=.55;charts=pack(meshes,size,scale,minArea,true);
  }
  if(!charts?.length)charts=pack(meshes,size,.45,0,true);
  if(!charts?.length)throw Error('No non-degenerate architecture charts '+mapId);
  const tree=bvh([...list]),pixels=new Uint8Array(size*size*4);
  for(let i=3;i<pixels.length;i+=4)pixels[i]=255;
  const table=new Uint16Array(meshes.reduce((n,m)=>n+m.count,0));let offset=0;
  const entries=meshes.map(m=>{m.offset=offset;offset+=m.count;return {id:m.id,name:m.name,key:m.key,count:m.count,offset:m.offset};});
  for(const chart of charts){
    table.set([chart.x,chart.y,chart.s],chart.mesh.offset+chart.i*3);paint(pixels,size,chart,tree);
  }
  const chartBytes=Buffer.alloc(table.length*2);for(let i=0;i<table.length;i++)chartBytes.writeUInt16LE(table[i],i*2);
  const atlas=folder+'.rgba.gz',chartName=folder+'.uv.gz';
  await writeFile(out+'/'+atlas,gzipSync(pixels,{level:6}));await writeFile(out+'/'+chartName,gzipSync(chartBytes,{level:6}));
  manifest.maps[mapId]={source:sha,procedural,size,atlas,charts:chartName,entries,triangles:list.length,baked:charts.length,minArea,scale};
  await saveManifest();
  console.log('Architecture',mapId,charts.length+'/'+list.length,'triangles',size+'²');
}
await writeFile(out+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');
