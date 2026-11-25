import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {POOL_DAY_MAP} from '../shared/pool-day.js';
import {LINDEN_ESTATE_MAP} from '../shared/linden-estate.js';
import {pairMaterials} from './visuals.js';
import {MapTextures} from './map-textures.js';
import {splitEstateGarden} from './estate-garden.js';

const tileUrl=new URL('./assets/laguna/ceramic.webp',import.meta.url).href;
const rippleUrl=new URL('./assets/laguna/ripples.webp',import.meta.url).href;
const weaveUrl=new URL('./assets/estate/weave.webp',import.meta.url).href;
const architectureTextures={ceramic:tileUrl,water:rippleUrl,fabric:weaveUrl};

export const lagunaAssets={
  map:POOL_DAY_MAP,key:'laguna',
  base:new URL('./assets/laguna/base.glb',import.meta.url).href,
  detail:new URL('./assets/laguna/detail.glb',import.meta.url).href,
};
export const estateAssets={
  map:LINDEN_ESTATE_MAP,key:'estate',
  base:new URL('./assets/estate/base.glb',import.meta.url).href,
  detail:new URL('./assets/estate/detail.glb',import.meta.url).href,
};

const texturedSurfaces={ceramic:'concrete',stone:'concrete',garden:'ground',roof:'metal'};

export class ArchitecturalMapModel {
  constructor(owner,assets){
    this.owner=owner;
    this.assets=assets;
    this.loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    this.materials=new Map();
    this.textures=[];
    this.textureLoader=new MapTextures();
  }

  loadBase(){
    return this.baseLoad??=this.load(this.assets.base,this.assets.key+'-base').then(scene=>this.base=scene);
  }

  loadDetail(){
    return this.detailLoad??=this.load(this.assets.detail,this.assets.key+'-detail').then(scene=>this.detail=scene);
  }

  async load(url,name){
    try{
      const {scene}=await this.loader.loadAsync(url);
      const originals=new Set();
      scene.traverse(mesh=>{
        if(!mesh.isMesh)return;
        originals.add(mesh.material);
        if(this.disposed){
          mesh.geometry.dispose();
          return;
        }
        const uv=mesh.geometry.attributes.uv;
        for(let i=0;i<uv.count;i++)uv.setY(i,1-uv.getY(i));
        const surface=mesh.userData[this.assets.key+'Surface'];
        mesh.userData.architecturalSurface=surface;
        mesh.material=this.surface(surface);
        mesh.castShadow=mesh.userData[this.assets.key+'Caster']===true;
        mesh.receiveShadow=!['water','lamp','skylight','glass'].includes(surface);
        if(surface==='water')mesh.renderOrder=1;
      });
      originals.forEach(material=>material.dispose());
      if(this.disposed)return null;
      if(this.assets.key==='estate')splitEstateGarden(scene,this.assets.map,this.surface('foliage'));
      scene.name=name;
      return scene;
    }catch(error){
      console.warn(name,error);
      return null;
    }
  }

  surface(name){
    if(this.materials.has(name))return this.materials.get(name);
    const estate=this.assets.key==='estate',plaster=estate&&name==='concrete',foliage=name==='foliage';
    const source=foliage||plaster?null:this.owner.surfaces[texturedSurfaces[name]??name];
    let map=source?.map??null;
    if(plaster){
      const data=new Uint8Array(64*64*4);
      for(let i=0;i<64*64;i++){const n=242+((Math.imul(i+17,2654435761)>>>25)%13);data.set([n,n,n,255],i*4);}
      map=new THREE.DataTexture(data,64,64,THREE.RGBAFormat);map.colorSpace=THREE.SRGBColorSpace;
      map.wrapS=map.wrapT=THREE.RepeatWrapping;map.generateMipmaps=true;map.minFilter=THREE.LinearMipmapLinearFilter;map.magFilter=THREE.LinearFilter;map.needsUpdate=true;this.textures.push(map);
    }
    const url=architectureTextures[name];
    if(url){
      map=this.textureLoader.load(url);
      this.textures.push(map);
      map.colorSpace=THREE.SRGBColorSpace;
      map.wrapS=map.wrapT=THREE.RepeatWrapping;
    }
    const water=name==='water',lamp=name==='lamp',glazing=name==='skylight'||name==='glass';
    const options={
      vertexColors:true,map,
      ...(water||glazing?{transparent:true,depthWrite:false,opacity:water?.48:name==='glass'?.52:.34,side:glazing?THREE.DoubleSide:THREE.FrontSide}:{}),
      ...(lamp?{emissive:0xffe6bc,emissiveIntensity:estate?.85:.16}:{}),
    };
    const high=new THREE.MeshStandardMaterial({
      ...options,normalMap:source?.normalMap??null,normalScale:new THREE.Vector2(estate?.13:.28,estate?.13:.28),
      roughness:water?.21:name==='metal'?.68:name==='ceramic'?.79:.9,metalness:name==='metal'?.23:0,
    });
    const enhanced={ceramic:'ceramic',stone:'rock',concrete:'concrete',garden:'grass',roof:'metal',metal:'metal',brick:'brick',wood:'wood',cloth:'cloth',asphalt:'asphalt',ground:'earth',plaster:'stucco'}[name];
    const low=new THREE.MeshLambertMaterial(options);
    if(enhanced&&!plaster&&!foliage)high.userData.remasterSurface=low.userData.remasterSurface=estate&&name==='stone'?'concrete':enhanced;
    if(estate){for(const m of [high,low]){
      m.userData.estateFinish=true;
      if(plaster)m.userData.weatherSurface='stucco';
      if(name==='brick'){m.color.lerp(new THREE.Color(0xe9e0d0),.18);m.userData.disableRelief=true;}
      if(['wood','stone','concrete','ceramic','brick'].includes(name)){m.userData.preserveAlbedo=true;m.userData.disableRelief=true;}
      if(foliage)m.userData.noGI=true;
    }}
    if(name==='fabric')high.userData.weatherSurface=low.userData.weatherSurface='cloth';
    this.materials.set(name,pairMaterials(high,low));
    return high;
  }

  dispose(){
    this.disposed=true;
    for(const scene of [this.base,this.detail]){
      scene?.removeFromParent();
      scene?.traverse(mesh=>mesh.geometry?.dispose());
    }
    for(const material of this.materials.values()){
      material._lowMaterial.dispose();
      material.dispose();
    }
    this.textures.forEach(texture=>texture.dispose());
  }
}
