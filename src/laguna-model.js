import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {POOL_DAY_MAP} from '../shared/pool-day.js';
import {pairMaterials} from './visuals.js';

const baseUrl=new URL('./assets/laguna/base.glb',import.meta.url).href;
const detailUrl=new URL('./assets/laguna/detail.glb',import.meta.url).href;
const tileUrl=new URL('./assets/laguna/ceramic.webp',import.meta.url).href;
const rippleUrl=new URL('./assets/laguna/ripples.webp',import.meta.url).href;

export const hasLagunaAsset=map=>map===POOL_DAY_MAP;

export class LagunaModel {
  constructor(owner){
    this.owner=owner;
    this.loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    this.materials=new Map();
  }

  loadBase(){
    return this.baseLoad??=this.load(baseUrl,'laguna-base').then(scene=>this.base=scene);
  }

  loadDetail(){
    return this.detailLoad??=this.load(detailUrl,'laguna-detail').then(scene=>this.detail=scene);
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
        const surface=mesh.userData.lagunaSurface;
        mesh.material=this.surface(surface);
        mesh.castShadow=mesh.userData.lagunaCaster===true;
        mesh.receiveShadow=surface!=='water'&&surface!=='lamp'&&surface!=='skylight';
        if(surface==='water')mesh.renderOrder=1;
      });
      originals.forEach(material=>material.dispose());
      if(this.disposed)return null;
      scene.name=name;
      return scene;
    }catch(error){
      console.warn('Laguna geometry',error);
      return null;
    }
  }

  surface(name){
    if(this.materials.has(name))return this.materials.get(name);
    const source=this.owner.surfaces[name==='ceramic'?'concrete':name];
    let map=source?.map??null;
    if(name==='ceramic'||name==='water'){
      const url=name==='ceramic'?tileUrl:rippleUrl;
      map=new THREE.TextureLoader().load(url);
      if(name==='ceramic')this.tile=map;
      else this.ripples=map;
      map.colorSpace=THREE.SRGBColorSpace;
      map.wrapS=map.wrapT=THREE.RepeatWrapping;
    }
    const water=name==='water',lamp=name==='lamp',skylight=name==='skylight';
    const options={
      vertexColors:true,map,
      ...(water||skylight?{transparent:true,depthWrite:false,opacity:water?.48:.34,side:skylight?THREE.DoubleSide:THREE.FrontSide}:{}),
      ...(lamp?{emissive:0xc49d6e,emissiveIntensity:.16}:{}),
    };
    const high=new THREE.MeshStandardMaterial({
      ...options,normalMap:source?.normalMap??null,normalScale:new THREE.Vector2(.28,.28),
      roughness:water?.21:name==='metal'?.68:name==='ceramic'?.79:.9,metalness:name==='metal'?.23:0,
    });
    const low=new THREE.MeshLambertMaterial(options);
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
    this.tile?.dispose();
    this.ripples?.dispose();
  }
}
