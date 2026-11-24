import * as THREE from 'three';

const urls=import.meta.glob('./assets/remaster/*.webp',{eager:true,query:'?url',import:'default'});

export class EnhancedSurfaces {
  loader=new THREE.TextureLoader();
  originals=new Map();
  textures=new Map();
  loadedRefresh=false;

  scheduleRefresh() {
    if(this.loadedRefresh)return;
    this.loadedRefresh=true;
    requestAnimationFrame(()=>{
      this.loadedRefresh=false;
      if(this.latest)this.update(...this.latest);
    });
  }

  load(surface,channel,size) {
    const asset=surface==='earth'&&channel!=='diff'?'sand':surface;
    const key=asset+'-'+channel+'-'+size;
    if(!this.textures.has(key)){
      const url=urls['./assets/remaster/'+key+'.webp'];
      const texture=this.loader.load(url,()=>this.scheduleRefresh(),undefined,()=>console.warn("Surface texture unavailable",url));
      texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
      if(channel==='diff')texture.colorSpace=THREE.SRGBColorSpace;
      this.textures.set(key,texture);
    }
    return [key,this.textures.get(key)];
  }

  update(root, settings, anisotropy) {
    if(!root)return;
    const size={medium:512,high:1024}[settings.surfaceDetail]??0;
    const aoSize={low:256,high:1024}[settings.bakedAO]??0;
    if(!size&&!aoSize){
      this.dispose();
      return;
    }
    this.latest=[root,settings,anisotropy];
    const active=new Set();
    const updated=new Set();
    const get=(surface,channel,resolution)=>{
      const [key,tex]=this.load(surface,channel,resolution);
      active.add(key);
      if(tex.anisotropy!==anisotropy){
        tex.anisotropy=anisotropy;
        if(tex.image)tex.needsUpdate=true;
      }
      return tex.image?tex:null;
    };
    const updateMaterial=material=>{
      const surface=material?.userData.remasterSurface;
      if(!surface||!(material.isMeshStandardMaterial||material.isMeshLambertMaterial)||updated.has(material))return;
      updated.add(material);
      if(!this.originals.has(material)){
        this.originals.set(material,{map:material.map,aoMap:material.aoMap,aoMapIntensity:material.aoMapIntensity,
          ...(material.isMeshStandardMaterial?{normalMap:material.normalMap,roughnessMap:material.roughnessMap,
            roughness:material.roughness,normalScale:material.normalScale.clone()}:{}),
        });
      }
      const base=this.originals.get(material);
      const detail=size&&surface!=='ceramic'&&material.isMeshStandardMaterial;
      const pack=(aoSize||detail)?get(surface,'arm',Math.max(aoSize,detail?size:0)):null;
      const color=detail?get(surface,'diff',size):null;
      const normal=detail?get(surface,'nor_gl',size):null;
      const ready=Boolean(color&&normal&&pack);
      const maps={map:ready?color:base.map,aoMap:aoSize&&pack?pack:base.aoMap};
      if(material.isMeshStandardMaterial){
        maps.normalMap=ready?normal:base.normalMap;
        maps.roughnessMap=ready?pack:base.roughnessMap;
        material.normalScale.copy(base.normalScale);
        if(ready)material.normalScale.multiplyScalar(surface==='rock'?2.6:1.75);
        material.roughness=ready?1:base.roughness;
      }
      if(Object.entries(maps).some(([key,value])=>material[key]!==value)){
        Object.assign(material,maps);
        material.needsUpdate=true;
      }
      material.aoMapIntensity=aoSize&&pack?(settings.ao==='off'?.8:.5):base.aoMapIntensity;
    };
    root.traverse(object=>{
      if(!object.isMesh||!object.geometry.hasAttribute('uv'))return;
      if(Array.isArray(object.material))object.material.forEach(updateMaterial);
      else updateMaterial(object.material);
    });
    for(const [material,base] of this.originals){
      if(updated.has(material))continue;
      Object.assign(material,base);material.needsUpdate=true;
      this.originals.delete(material);
    }
    for(const [key,tex] of this.textures){
      if(active.has(key))continue;
      tex.dispose();this.textures.delete(key);
    }
  }

  estimatedBytes() {
    let bytes=0;
    for(const tex of this.textures.values()){
      if(tex.image)bytes+=tex.image.width*tex.image.height*4*4/3;
    }
    return Math.round(bytes);
  }

  dispose() {
    this.latest=null;
    for(const [material,base] of this.originals){Object.assign(material,base);material.needsUpdate=true;}
    for(const tex of this.textures.values())tex.dispose();
    this.originals.clear();this.textures.clear();
  }
}
