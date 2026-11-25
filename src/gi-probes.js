import * as THREE from 'three';
import {boxBounds,rayAffineBox} from '../shared/geometry.js';
import {SpatialIndex} from '../shared/spatial-index.js';

export const GI_VERSION=1;
export const GI_HEIGHTS=[.65,3.2,8.5];
export const GI_LEVELS={off:0,low:1,high:2};
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const byte=n=>Math.round(clamp(n)*255);
const directions=Array.from({length:12},(_,i)=>{
  const y=i<6?.69:i<10?.20:-.46,a=i*2.3999632297,r=Math.sqrt(1-y*y);
  return {x:Math.cos(a)*r,y,z:Math.sin(a)*r};
});
const skyDir={x:.32,y:.89,z:.32};
function hitBox(o,d,b,limit){
  if(b.obb)return rayAffineBox(o,d,b.obb,limit);
  let near=0,far=limit;
  for(const [axis,lo,hi] of [['x',b.minX,b.maxX],['y',b.minY,b.h],['z',b.minZ,b.maxZ]]){
    if(Math.abs(d[axis])<1e-8){if(o[axis]<lo||o[axis]>hi)return Infinity;continue;}
    const a=(lo-o[axis])/d[axis],c=(hi-o[axis])/d[axis];
    near=Math.max(near,Math.min(a,c));far=Math.min(far,Math.max(a,c));if(near>far)return Infinity;
  }
  return near;
}
function nearest(o,d,boxes,max,skip=null){
  let best=max,hit=null;
  for(const b of boxes){
    if(b===skip)continue;
    const t=hitBox(o,d,b,best);
    if(t>.075&&t<best){best=t;hit=b;}
  }
  return {hit,distance:best};
}
function colorOf(value,fallback){
  const c=new THREE.Color();
  try{c.set(value??fallback);}catch{c.set(fallback);}
  return [c.r,c.g,c.b];
}
export function bakeProbeField(map,{maxCells=192,spacing}={}){
  const width=map.width??map.size,depth=map.depth??map.size;
  const step=spacing??(map.size<=96?1.15:map.size<=500?2.5:4.5);
  const nx=Math.max(4,Math.min(maxCells,Math.ceil(width/step))),nz=Math.max(4,Math.min(maxCells,Math.ceil(depth/step)));
  const minX=-width/2,minZ=-depth/2;
  const boxes=(map.boxes??[]).filter(b=>!b.noCollision&&b.h>.16&&b.w>.12&&b.d>.12&&!/palm|scrub|grass|leaf|water|sign|trigger/i.test(b.kind??'')).map(b=>{
    const bounded=boxBounds(b);bounded.giColor=colorOf(b.color,'#8a8174');return bounded;
  });
  const index=new SpatialIndex(boxes,16,b=>b),near=[],terrain=map.terrain;
  const ground=colorOf(map.theme==='desert-village'?'#b4a080':map.id==='port'?'#898c8c':map.id==='fy_pool_day'?'#9cb4af':'#9d9686','#9d9686');
  const heights=new Float32Array(nx*nz);let low=Infinity,high=-Infinity;
  const data=new Uint8Array(nx*2*nz*2*4);
  const offset=(layer,x,z)=>((z+Math.floor(layer/2)*nz)*nx*2+x+(layer%2)*nx)*4;
  for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
    const wx=minX+(x+.5)*width/nx,wz=minZ+(z+.5)*depth/nz;
    const y=terrain?.heightAt(wx,wz)??0,h=Number.isFinite(y)?y:0;
    heights[z*nx+x]=h;low=Math.min(low,h);high=Math.max(high,h);
    index.query(wx-19,wz-19,wx+19,wz+19,near);
    for(let layer=0;layer<3;layer++){
      const o={x:wx,y:h+GI_HEIGHTS[layer],z:wz};
      let open=0,weight=0,rr=0,gg=0,bb=0;
      for(let i=0;i<directions.length;i++){
        const d=directions[i],cast=nearest(o,d,near,17);
        if(d.y>0){weight++;if(!cast.hit)open++;}
        let albedo,illumination=1,attenuation;
        if(cast.hit){
          albedo=cast.hit.giColor;
          const p={x:o.x+d.x*Math.max(0,cast.distance-.10),y:o.y+d.y*Math.max(0,cast.distance-.10),z:o.z+d.z*Math.max(0,cast.distance-.10)};
          illumination=nearest(p,skyDir,near,13,cast.hit).hit?.28:1;
          attenuation=1/(1+cast.distance*.075);
        }else if(d.y<0){albedo=ground;attenuation=.72;}
        else continue;
        const k=illumination*attenuation/directions.length;
        rr+=albedo[0]*k;gg+=albedo[1]*k;bb+=albedo[2]*k;
      }
      const sky=weight?open/weight:1;
      // Linear RGB one-bounce approximation. A is sky visibility, not
      // material AO; the receiver combines it with the existing AO.
      const floorBounce=.045+.035*sky,scale=.92;
      const i=offset(layer,x,z);
      data.set([byte(rr*scale+ground[0]*floorBounce),byte(gg*scale+ground[1]*floorBounce),byte(bb*scale+ground[2]*floorBounce),byte(sky)],i);
    }
  }
  const range=Math.max(1,high-low);
  for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
    const h=Math.round(clamp((heights[z*nx+x]-low)/range)*65535),i=offset(3,x,z);
    data.set([h>>8,h&255,0,255],i);
  }
  return {version:GI_VERSION,mapId:map.id,layout:map.layoutVersion??0,nx,nz,minX,minZ,width,depth,groundMin:low,groundRange:range,data};
}
export function makeProbeTexture(field){
  if(field.version!==GI_VERSION||field.data.length!==field.nx*field.nz*16)throw Error('Invalid GI field');
  const t=new THREE.DataTexture(field.data,field.nx*2,field.nz*2,THREE.RGBAFormat);
  t.name='S09 baked irradiance '+field.mapId;t.colorSpace=THREE.NoColorSpace;
  t.minFilter=t.magFilter=THREE.LinearFilter;t.generateMipmaps=false;t.needsUpdate=true;
  return t;
}
export function probeUniforms(field,texture){
  return {texture,bounds:new THREE.Vector4(field.minX,field.minZ,field.width,field.depth),grid:new THREE.Vector4(field.nx,field.nz,field.groundMin,field.groundRange),strength:{value:0},quality:{value:1},sunTint:new THREE.Color(1,1,1)};
}
export function giStrength(sun,quality){
  return (quality==='high'?1:quality==='low'?.62:0)*clamp((sun?.intensity??3.5)/3.5,.12,1.2);
}
