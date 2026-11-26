import {BoxGeometry,Color,Mesh,MeshLambertMaterial,MeshStandardMaterial,PlaneGeometry,Vector2} from 'three';
import {clonePairedMaterial,pairMaterials} from '../visuals.js';

const sand=new Color('#f0dfc3'),stone=new Color('#a9957e'),roadColor=new Color('#b2a794');
const size=128,seam=size*3;
const tiles=[32,16].map(segments=>new PlaneGeometry(size,size,segments,segments).rotateX(-Math.PI/2));

export function buildQuarryMissionScene(owner,map,root){
  const mapTexture=owner.surfaces.maps['village-sand'],textureTile=7;
  const ground=pairMaterials(
    new MeshStandardMaterial({map:mapTexture,vertexColors:true,roughness:.98,
      normalMap:owner.surfaces.villageNormals.sand,normalScale:new Vector2(.34,.34)}),
    new MeshLambertMaterial({map:mapTexture,vertexColors:true}),
  );
  ground.userData.remasterSurface=ground._lowMaterial.userData.remasterSurface='sand';
  const patches=map.surfacePatches.map(([x,z,w,d,yaw,tint])=>({
    x,z,w,d,c:Math.cos(yaw),s:Math.sin(yaw),color:new Color(tint),radius:Math.max(w,d),
  }));
  const roads=map.roads.map(r=>({...r,sin:Math.sin(r.yaw),cos:Math.cos(r.yaw)}));
  const color=new Color();
  for(let tz=-6;tz<6;tz++)for(let tx=-6;tx<6;tx++){
    const tileX=(tx+.5)*size,tileZ=(tz+.5)*size;
    const coarse=Math.max(Math.abs(tileX),Math.abs(tileZ))>5*size/2;
    const geometry=tiles[Number(coarse)].clone();
    const {position:positions,uv,normal}=geometry.attributes;
    const colors=new Float32Array(positions.count*3);
    const near=roads.filter(r=>Math.hypot(r.x-tileX,r.z-tileZ)<r.d/2+size*.75);
    const localPatches=patches.filter(p=>Math.hypot(p.x-tileX,p.z-tileZ)<p.radius*1.15+size*.75);
    for(let i=0;i<positions.count;i++){
      const x=tileX+positions.getX(i),z=tileZ+positions.getZ(i);
      let y=map.terrain.heightAt(x,z);
      // Stitch the finer border onto the same straight edges sampled by the distant tiles.
      if(!coarse&&Math.abs(x)===seam&&z%8!==0)y=(map.terrain.heightAt(x,z-4)+map.terrain.heightAt(x,z+4))*.5;
      if(!coarse&&Math.abs(z)===seam&&x%8!==0)y=(map.terrain.heightAt(x-4,z)+map.terrain.heightAt(x+4,z))*.5;
      positions.setY(i,y);
      uv.setXY(i,x/textureTile,-z/textureTile);
      const dx=map.terrain.heightAt(x+1,z)-map.terrain.heightAt(x-1,z);
      const dz=map.terrain.heightAt(x,z+1)-map.terrain.heightAt(x,z-1);
      const normalLength=Math.hypot(dx,2,dz);
      normal.setXYZ(i,-dx/normalLength,2/normalLength,-dz/normalLength);
      const cliff=Math.min(1,Math.hypot(dx,dz)*.55);
      color.copy(sand).lerp(stone,cliff*.72);
      for(const p of localPatches){
        const dx=x-p.x,dz=z-p.z;
        const distance=Math.hypot((dx*p.c-dz*p.s)/p.w,(dx*p.s+dz*p.c)/p.d);
        const edge=Math.max(0,Math.min(1,(1.07-distance+Math.sin(x*.8+z*.65)*.07)*2.6));
        if(edge>0)color.lerp(p.color,edge*.52);
      }
      for(const r of near){
        const x0=x-r.x,z0=z-r.z,across=Math.abs(x0*r.cos-z0*r.sin),along=Math.abs(x0*r.sin+z0*r.cos);
        if(along<r.d/2+2&&across<r.w/2+2)color.lerp(roadColor,Math.min(.53,(r.w/2+2-across)*.19));
      }
      const bands=Math.sin(y*2.35+Math.sin(z*.083)+x*.023)*.065;
      const gravel=Math.sin(x*1.43+z*.704)*Math.cos(z*.93)*.047;
      color.multiplyScalar(1+gravel+bands*cliff+.028*Math.sin(x*.14+z*.057));
      color.toArray(colors,i*3);
    }
    geometry.setAttribute('color',positions.clone().set(colors));
    const tile=new Mesh(geometry,ground);
    tile.position.set(tileX,0,tileZ);tile.receiveShadow=true;root.add(tile);
  }
  const materials=new Map();
  for(const b of map.boxes){
    if(b.missionDynamic||b.visualModel)continue;
    const raw=b.color==='#526068'?owner.surfaces.metal:b.color==='#786044'?owner.surfaces.wood:owner.surfaces.concrete;
    const key=raw.uuid+b.color;
    if(!materials.has(key))materials.set(key,clonePairedMaterial(raw,b.color));
    const geometry=new BoxGeometry(b.w,b.h,b.d),{position,normal,uv}=geometry.attributes;
    for(let i=0;i<uv.count;i++){
      const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
      uv.setXY(i,(Math.abs(normal.getX(i))>.5?z:x)*.42,(Math.abs(normal.getY(i))>.5?z:y)*.42);
    }
    const mesh=new Mesh(geometry,materials.get(key));
    mesh.name=b.id;mesh.position.set(b.x,b.baseY+b.h/2,b.z);
    mesh.castShadow=!b.noCollision&&b.w*b.d<100;mesh.receiveShadow=true;
    root.add(mesh);
  }
}
