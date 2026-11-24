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

export class WaterAppearance {
  constructor() {
    this.large=makeWaveNormal();
    this.small=makeWaveNormal(true);
    this.material=new THREE.MeshPhysicalMaterial({
      color:0x254d56,roughness:.21,metalness:0,
      ior:1.333,envMapIntensity:.85,
      normalMap:this.large,normalScale:new THREE.Vector2(.75,.62),
      clearcoat:.6,clearcoatRoughness:.16,clearcoatNormalMap:this.small,
      clearcoatNormalScale:new THREE.Vector2(.27,.19),
    });
    this.large.repeat.set(34,46);this.small.repeat.set(95,111);
  }

  update(clock,mesh) {
    if(this.mesh!==mesh){
      this.restore();
      this.mesh=mesh;
      this.original=mesh.material;
    }
    mesh.material=this.material;
    this.large.offset.set((clock*.017)%1,(clock*.011)%1);
    this.small.offset.set((-clock*.029)%1,(clock*.037)%1);
  }

  restore() {
    if(this.mesh)this.mesh.material=this.original;
    this.mesh=this.original=null;
  }

  dispose() {
    this.restore();
    this.material.dispose();this.large.dispose();this.small.dispose();
  }
}
