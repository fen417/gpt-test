import * as THREE from 'three';

export function makeWaveNormal(detail=false) {
  const size=128, tau=2*Math.PI;
  const height=new Float32Array(size*size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x*tau/size, v=y*tau/size;
    height[y*size+x]=detail
      ? .48*Math.sin(5*u-7*v+.8*Math.sin(3*u+v))+.2*Math.cos(11*u+6*v)+.08*Math.sin(16*u-13*v)
      : .52*Math.sin(2*u+4*v+1.15*Math.sin(2*u-v))+.37*Math.sin(4*u-3*v+.85*Math.cos(u+2*v))+.09*Math.sin(7*u+9*v);
  }
  const bytes=new Uint8Array(size*size*4);
  const sample=(x,y)=>height[(y&(size-1))*size+(x&(size-1))];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const dx=sample(x-1,y)-sample(x+1,y), dy=sample(x,y-1)-sample(x,y+1);
    const length=Math.hypot(dx,dy,1);
    const i=(y*size+x)*4;
    bytes[i]=128+127*dx/length;bytes[i+1]=128+127*dy/length;bytes[i+2]=128+127/length;bytes[i+3]=255;
  }
  const texture=new THREE.DataTexture(bytes,size,size);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=4;texture.needsUpdate=true;
  return texture;
}

// CPU-generated linear geometry-independent surface inputs. No external textures.
export const WATER_QUALITY=Object.freeze({legacy:0,low:1,medium:2,high:3});
export function waterDepth(map,x,z){
  if(map.id==='port')return Math.max(0,Math.min(12,(map.shoreX-x)*.32));
  if(map.id==='fy_pool_day'){
    const p=map.pools.find(p=>Math.abs(x-p.x)<p.w/2&&Math.abs(z-p.z)<p.d/2);
    return p?Math.max(0,p.waterY-map.terrain.heightAt(x,z)):0;
  }
  return 0;
}
const clamp=THREE.MathUtils.clamp, smooth=THREE.MathUtils.smoothstep;
export function waterSurfaceColor(map,x,z,foam=true){
  const depth=waterDepth(map,x,z),port=map.id==='port';
  const mix=smooth(depth,0,port?7:1.1);
  const shallow=port?[71,113,108]:[153,206,198],deep=port?[31,67,77]:[48,129,143];
  const wave=.5+.5*Math.sin(z*(port?.21:1.73)+.7*Math.sin(x*2.3+z*(port?.08:.4)));
  const detail=.5+.5*Math.sin(x*8.1+z*(port?.53:4.7)+2*Math.sin(z*(port?.16:1.31)));
  const shore=port?Math.max(0,map.shoreX-x):depth;
  const foamBand=foam&&depth>0? (1-smooth(shore,port?.4:.06,port?2.3:.22))*smooth(wave*.66+detail*.34,.51,.94)*(port?.78:.34):0;
  return shallow.map((c,i)=>Math.round(clamp(THREE.MathUtils.lerp(THREE.MathUtils.lerp(c,deep[i],mix),[211,230,221][i],foamBand),0,255)));
}
export function makeWaterColor(map,foam){
  const port=map.id==='port',width=port?512:256,height=port?1024:256;
  const bytes=new Uint8Array(width*height*4),span=map.size;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const u=(x+.5)/width,v=(y+.5)/height;
    const wx=port?map.shoreX+(u<.5?-1200+2320*u:-80*(1-u)):(u-.5)*span;
    const wz=port?(.5-v)*1600:(v-.5)*span;
    bytes.set([...waterSurfaceColor(map,wx,wz,foam),255],(y*width+x)*4);
  }
  const t=new THREE.DataTexture(bytes,width,height,THREE.RGBAFormat);
  t.name='S09 shallow/deep water colour';t.colorSpace=THREE.SRGBColorSpace;
  t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;
  t.needsUpdate=true;return t;
}
function portGeometry(){
  // Concentrate half of the color texture into the first 40m of water.
  // Normal maps retain an independent, uniformly scaled UV channel.
  const geometry=new THREE.PlaneGeometry(1200,1600,2,1),p=geometry.attributes.position,uv=geometry.attributes.uv;
  const metric=uv.clone();
  for(let i=0;i<p.count;i++)if(Math.abs(p.getX(i))<.01){p.setX(i,560);metric.setX(i,1160/1200);}
  geometry.setAttribute('uv1',metric);return geometry;
}
function poolGeometry(mesh,map){
  // World-aligned UVs on a private geometry: imported and procedural fallback
  // meshes share the same depth palette and metric wave scale.
  const geometry=mesh.geometry.clone(),position=geometry.attributes.position;
  const uv=new THREE.Float32BufferAttribute(position.count*2,2),p=new THREE.Vector3();
  for(let i=0;i<position.count;i++){
    p.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
    uv.setXY(i,p.x/map.size+.5,p.z/map.size+.5);
  }
  geometry.setAttribute('uv',uv);return geometry;
}
export function makeWaterMaterial(kind,quality,large,small,colorMap,refraction=false){
  const level=WATER_QUALITY[quality]??0,pool=kind==='pool',deep=level>=2;
  const transparent=pool&&!(refraction&&level===3);
  const material=new THREE.MeshPhysicalMaterial({
    color:colorMap?0xffffff:pool?0x78b8be:0x335965,
    map:colorMap??null,roughness:pool?.14:.23,metalness:0,
    ior:1.333,envMapIntensity:pool?1.08:.95,
    normalMap:large,normalScale:new THREE.Vector2(pool?.27:.62,pool?.23:.49),
    transparent,opacity:transparent?.42:1,depthWrite:!transparent,
    clearcoat:deep?.58:0,clearcoatRoughness:pool?.12:.18,
    clearcoatNormalMap:deep?small:null,clearcoatNormalScale:new THREE.Vector2(.24,.19),
    transmission:pool&&refraction&&level===3?.82:0,
    thickness:pool&&refraction&&level===3?.65:0,
    attenuationColor:0x83c5c5,attenuationDistance:2.3,
  });
  return material;
}

export class WaterAppearance {
  entries=[];
  dirty=true;
  invalidate(){this.dirty=true;}
  update(clock,root,map,quality,refraction,foam,env){
    const level=WATER_QUALITY[quality]??0;
    const supported=map?.id==='port'||map?.id==='fy_pool_day';
    if(!level||!supported||!root){this.restore();return;}
    const key=[map.id,quality,refraction,foam].join('/');
    if(this.dirty||this.root!==root||this.key!==key){
      this.restore();this.dirty=false;this.root=root;this.key=key;
      const pool=map.id==='fy_pool_day';
      root.traverse(mesh=>{
        if(!mesh.isMesh||!(mesh.name==='Port water'||mesh.userData.architecturalSurface==='water'||mesh.userData.waterSurface===true))return;
        this.entries.push({mesh,material:mesh.material,geometry:mesh.geometry});
      });
      if(!this.entries.length)return;
      this.large=makeWaveNormal();this.large.repeat.set(pool?13:34,pool?13:46);
      if(level>=2){this.small=makeWaveNormal(true);this.small.repeat.set(pool?35:95,pool?35:111);}
      if(level>=2){
        this.color=makeWaterColor(map,level===3&&foam==='high');
        if(!pool){this.large.channel=1;if(this.small)this.small.channel=1;}
      }
      this.material=makeWaterMaterial(pool?'pool':'port',quality,this.large,this.small,this.color,refraction==='high');
      for(const e of this.entries){
        if(pool)e.mesh.geometry=poolGeometry(e.mesh,map);
        else if(this.color)e.mesh.geometry=portGeometry();
        e.mesh.material=this.material;
        e.mesh.userData.waterReflection=pool;
      }
    }
    if(!this.material)return;
    this.material.envMap=env??null; // explicit sky fallback; never use an interior probe on open water.
    this.large.offset.set((clock*.017)%1,(clock*.011)%1);
    this.small?.offset.set((-clock*.029)%1,(clock*.037)%1);
  }
  get active(){return this.entries.length>0;}
  restore(){
    for(const {mesh,material,geometry} of this.entries){
      if(mesh.geometry!==geometry)mesh.geometry.dispose();
      mesh.geometry=geometry;mesh.material=material;delete mesh.userData.waterReflection;
    }
    this.entries.length=0;this.material?.dispose();this.large?.dispose();this.small?.dispose();this.color?.dispose();
    this.material=this.large=this.small=this.color=null;this.root=this.key=null;
  }
  dispose(){this.restore();}
}
