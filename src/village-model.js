import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { pairMaterials } from './visuals.js';
import { villageLayoutKey } from './village-layout-key.js';
import {MapTextures} from './map-textures.js';
import dryWindManifest from './assets/village/manifest.json' with {type:'json'};
import alhadraManifest from './assets/alhadra/manifest.json' with {type:'json'};

export const dryWindAssets={
  id:'village',name:'Dry Wind',manifest:dryWindManifest,replaceLeaves:true,
  base:new URL('./assets/village/base.glb',import.meta.url).href,
  detail:new URL('./assets/village/detail.glb',import.meta.url).href,
  roads:new URL('./assets/village/roads.webp',import.meta.url).href,
  rock:new URL('./assets/village/rock.webp',import.meta.url).href,
};
export const alhadraAssets={
  id:'alhadra',name:'Al-Hadra',manifest:alhadraManifest,replaceLeaves:true,
  base:new URL('./assets/alhadra/base.glb',import.meta.url).href,
  detail:new URL('./assets/alhadra/detail.glb',import.meta.url).href,
  roads:new URL('./assets/alhadra/roads.webp',import.meta.url).href,
  rock:new URL('./assets/alhadra/rock.webp',import.meta.url).href,
  labels:new URL('./assets/alhadra/labels.webp',import.meta.url).href,
  fabric:new URL('./assets/estate/weave.webp',import.meta.url).href,
  paint:new URL('./assets/port/paint.webp',import.meta.url).href,
};
const sandTint = new THREE.Color(0xd6bd90), roadTint = new THREE.Color(0xbda17a);
const roadMultiplier = [roadTint.r/sandTint.r,roadTint.g/sandTint.g,roadTint.b/sandTint.b];

function roadSurface(material, mask, span) {
  material.roadMask = mask;
  material.userData.villageRoadSpan = span;
  material.userData.roadMultiplier = roadMultiplier;
  material.onBeforeCompile = shader => {
    shader.uniforms.villageRoadMask = {value:mask};
    shader.uniforms.villageRoadSpan = {value:span};
    shader.uniforms.villageRoadTint = {value:roadMultiplier};
    shader.vertexShader = 'uniform float villageRoadSpan;varying vec2 villageRoadUv;\n'+
      shader.vertexShader.replace('#include <project_vertex>',
        'villageRoadUv=(modelMatrix*vec4(transformed,1.)).xz*vec2(1.,-1.)/villageRoadSpan+.5;\n#include <project_vertex>');
    shader.fragmentShader = 'uniform sampler2D villageRoadMask;uniform vec3 villageRoadTint;varying vec2 villageRoadUv;\n'+
      shader.fragmentShader.replace('#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb*=mix(vec3(1.),villageRoadTint,texture2D(villageRoadMask,villageRoadUv).g);');
  };
  material.customProgramCacheKey = () => 'village-road-'+material.type;
}

export class VillageModel {
  constructor(owner,assets) {
    this.owner = owner;
    this.assets = assets;
    this.loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    this.materials = new Map();
    this.textures = new Set();
    this.textureLoader = new MapTextures();
  }

  matches(map){
    return map.id===this.assets.id&&villageLayoutKey(map)===this.assets.manifest.layout;
  }

  loadBase() {
    if(!this.baseLoad) this.baseLoad = this.load(this.assets.base,true).then(scene=>this.base=scene);
    return this.baseLoad;
  }

  loadDetail() {
    if(!this.detailLoad) this.detailLoad = this.load(this.assets.detail,false).then(scene=>this.detail=scene);
    return this.detailLoad;
  }

  async load(url, base) {
    let scene;
    try {
      if(base){
        const tex = this.textureLoader;
        this.roadMask=tex.load(this.assets.roads);
        this.rockMap=tex.load(this.assets.rock);
        this.rockMap.wrapS=this.rockMap.wrapT=THREE.RepeatWrapping;
        this.rockMap.colorSpace=THREE.SRGBColorSpace;
        this.textures.add(this.roadMask).add(this.rockMap);
        if(this.assets.labels){
          this.signMap=tex.load(this.assets.labels);
          this.signMap.colorSpace=THREE.SRGBColorSpace;
          this.textures.add(this.signMap);
        }
        if(this.assets.fabric){
          this.canvasMap=tex.load(this.assets.fabric);
          this.canvasMap.wrapS=this.canvasMap.wrapT=THREE.RepeatWrapping;
          this.canvasMap.colorSpace=THREE.SRGBColorSpace;
          this.textures.add(this.canvasMap);
        }
        if(this.assets.paint){
          this.paintMap=tex.load(this.assets.paint);
          this.paintMap.wrapS=this.paintMap.wrapT=THREE.RepeatWrapping;
          this.paintMap.colorSpace=THREE.SRGBColorSpace;
          this.textures.add(this.paintMap);
        }
      }
      ({scene} = await this.loader.loadAsync(url));
      if(this.disposed){
        this.disposeRaw(scene);
        return null;
      }
      const originals = new Set();
      scene.traverse(mesh=>{
        if(!mesh.isMesh)return;
        originals.add(mesh.material);
        // Blender's glTF exporter flips V for glTF textures. These meshes use
        // the game's shared textures and their existing UV orientation.
        const uv=mesh.geometry.attributes.uv;
        for(let i=0;i<uv.count;i++)uv.setY(i,1-uv.getY(i));
        mesh.material=this.surface(mesh.userData.villageSurface);
        mesh.castShadow=mesh.userData.villageCaster===true;
        mesh.receiveShadow=true;
        mesh.geometry.computeBoundingSphere();
      });
      originals.forEach(material=>material.dispose());
      scene.name=this.assets.id+(base?'-base':'-detail');
      return scene;
    }catch(error){
      if(scene)this.disposeRaw(scene);
      console.warn(this.assets.name+' geometry',error);
      return null;
    }
  }

  surface(name) {
    if(this.materials.has(name))return this.materials.get(name);
    const owner=this.owner, surfaces=owner.surfaces;
    const sourceName=name==='road-sand'?'village-sand':name;
    const source=surfaces[sourceName];
    const maps={rock:this.rockMap,sign:this.signMap,canvas:this.canvasMap,'vehicle-paint':this.paintMap};
    const map=maps[name]??surfaces.maps[sourceName]??null;
    const side=name==='leaf'||name==='canvas'?THREE.DoubleSide:THREE.FrontSide;
    const options={map,side,vertexColors:true};
    let high,low;
    if(name==='unlit'){
      high=low=new THREE.MeshBasicMaterial(options);
    }else{
      const normalMap=source?.normalMap??(sourceName==='village-sand'?surfaces.villageNormals.sand:
        sourceName==='village-stucco'?surfaces.villageNormals.stucco:null);
      high=new THREE.MeshStandardMaterial({...options,normalMap,normalScale:new THREE.Vector2(.26,.26),
        roughness:name==='vehicle-glass'?.32:name==='vehicle-paint'?.68:source?.roughness??.95,
        metalness:name.startsWith('vehicle-')?.16:source?.metalness??0});
      low=new THREE.MeshLambertMaterial(options);
    }
    if(name==='road-sand'){
      const span=this.assets.manifest.span;
      roadSurface(high,this.roadMask,span);roadSurface(low,this.roadMask,span);
      high=owner.groundShadows.apply(high)??high;low=owner.groundShadows.apply(low)??low;
    }
    if(high!==low)pairMaterials(high,low);
    this.materials.set(name,high);
    return high;
  }

  disposeRaw(scene) {
    scene.traverse(mesh=>{
      if(!mesh.isMesh)return;
      mesh.geometry.dispose();
      if(!mesh.material._lowMaterial)mesh.material.dispose();
    });
  }

  dispose() {
    this.disposed=true;
    for(const scene of [this.base,this.detail])if(scene){
      scene.removeFromParent();
      scene.traverse(mesh=>mesh.geometry?.dispose());
    }
    for(const material of this.materials.values()){
      material._lowMaterial?.dispose();
      material.dispose();
    }
    for(const texture of this.textures)texture.dispose();
  }
}
