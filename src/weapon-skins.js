import {Box3,BufferAttribute,Matrix4,SRGBColorSpace,TextureLoader,Vector3} from 'three';
import {caseReward} from '../shared/cases.js';

const paintUrls=import.meta.glob('./assets/weapon-skins/*.webp',{eager:true,query:'?url',import:'default'});
export const weaponSkinUrl=id=>paintUrls[`./assets/weapon-skins/${id}.webp`];
const paintNames=/^(Receiver|Lower|Upper|Handguard|ForeEnd|Stock|Frame|Slide|Shroud|FeedCover)(?:_\d+)?$/;
const textureCache=new Map(),projections=new WeakMap(),instances=new WeakMap();
const originalMaterials=new WeakMap();
export const unpaintedMaterial=material=>originalMaterials.get(material)??material;
const finishes={
  common:{roughness:.74,metalness:.05},
  uncommon:{roughness:.64,metalness:.16},
  rare:{roughness:.45,metalness:.24},
  legendary:{roughness:.32,metalness:.42},
  ultra:{roughness:.30,metalness:.22},
};
const illustrationParts={'legendary-1':'Receiver','ultra-1':'Receiver',
  'polar-legendary-1':'Receiver','polar-ultra-1':'Lower'};
const nautilusFinish='polar-legendary-1';
const nautilusPanelWidth=.48;
const continuousFinish='polar-legendary-2';

async function loadPaint(id){
  if(!textureCache.has(id)){
    const pending=new TextureLoader().loadAsync(weaponSkinUrl(id)).then(texture=>{
      texture.colorSpace=SRGBColorSpace;
      texture.channel=id===continuousFinish?2:1;
      if(id===nautilusFinish)texture.repeat.x=nautilusPanelWidth;
      texture.anisotropy=4;
      return texture;
    }).catch(error=>{textureCache.delete(id);throw error;});
    textureCache.set(id,pending);
  }
  return textureCache.get(id);
}

export function prepareSkinProjection(root,weaponId){
  root.updateWorldMatrix(true,true);
  const rootInverse=new Matrix4().copy(root.matrixWorld).invert();
  const point=new Vector3();
  const sharedBounds=new Box3(),panels=[];
  root.traverse(mesh=>{
    if(!mesh.isMesh||!paintNames.test(mesh.name)||!mesh.geometry.attributes.normal)return;
    const source=mesh.geometry;
    if(projections.has(source))return;
    const pos=source.attributes.position;
    const bounds=new Box3();
    const world=new Matrix4().multiplyMatrices(rootInverse,mesh.matrixWorld);
    for(let i=0;i<pos.count;i++)bounds.expandByPoint(point.fromBufferAttribute(pos,i).applyMatrix4(world));
    if(weaponId==='m50'||weaponId==='mg36'&&mesh.name!=='Stock')sharedBounds.union(bounds);
    panels.push({source,world,bounds,name:mesh.name});
  });
  for(const {source,world,bounds,name} of panels){
    projectPaint(source,world,weaponId==='m50'?sharedBounds:bounds);
    // Aurora crosses the receiver and handguard at one scale.
    if(weaponId==='mg36'){
      if(name==='Stock')source.setAttribute('uv2',source.getAttribute('uv1'));
      else projectPaint(source,world,sharedBounds,'uv2');
    }
  }
}

function projectPaint(geometry,transform,bounds,attribute='uv1'){
  const {position,normal:normals}=geometry.attributes;
  const {min,max}=bounds;
  const depth=Math.max(.001,max.z-min.z),height=Math.max(.001,max.y-min.y);
  const point=new Vector3(),normal=new Vector3();
  const values=new Float32Array(position.count*2);
  for(let i=0;i<position.count;i++){
    point.fromBufferAttribute(position,i).applyMatrix4(transform);
    normal.fromBufferAttribute(normals,i).transformDirection(transform);
    values[i*2]=.025+.95*(point.z-min.z)/depth;
    // Broaden the projection over top rails and bevels as it wraps around.
    values[i*2+1]=.025+.95*(point.y-min.y)/height+.09*(point.x/(max.x-min.x||1))*Math.abs(normal.y);
  }
  // Every clone of a given stock module shares the same paint UVs.
  geometry.setAttribute(attribute,new BufferAttribute(values,2));
  if(attribute==='uv1')projections.set(geometry,bounds);
}

function restorePaint(state,mesh){
  const material=state.materials.get(mesh);
  if(!material)return;
  mesh.material=material.original;
  material.painted.dispose();
  state.materials.delete(mesh);
}

function paintParts(state,root){
  const reward=caseReward(state.id);
  const hero=illustrationParts[state.id];
  root.traverse(mesh=>{
    if(!mesh.isMesh||!projections.has(mesh.geometry)||!mesh.material.isMeshStandardMaterial||state.materials.has(mesh))return;
    const original=mesh.material,painted=original.clone();
    painted.map=hero&&mesh.name!==hero?companionPaint(state.texture,state.id):state.texture;
    painted.color.set(0xffffff);
    painted.vertexColors=false;
    painted.roughnessMap=null;
    painted.metalnessMap=null;
    Object.assign(painted,finishes[reward.rarity]);
    originalMaterials.set(painted,original);
    mesh.material=painted;
    state.materials.set(mesh,{original,painted});
  });
}

export function updateStockSkin(root,previous,part){
  if(part){
    const original=root.getObjectByName('Stock');
    const replacement=part.getObjectByName(part.name+'_Frame');
    const bounds=projections.get(original?.geometry);
    if(bounds&&replacement?.isMesh&&replacement.geometry.attributes.normal&&!projections.has(replacement.geometry)){
      root.updateWorldMatrix(true,false);
      replacement.updateWorldMatrix(true,false);
      const transform=new Matrix4().copy(root.matrixWorld).invert().multiply(replacement.matrixWorld);
      projectPaint(replacement.geometry,transform,bounds);
    }
    if(original?.geometry.hasAttribute('uv2')&&replacement?.geometry.hasAttribute('uv1'))
      replacement.geometry.setAttribute('uv2',replacement.geometry.getAttribute('uv1'));
  }
  const state=instances.get(root);
  if(!state?.texture)return;
  previous?.traverse(mesh=>restorePaint(state,mesh));
  if(part)paintParts(state,part);
}

export function setWeaponSkin(root,weaponId,rewardId){
  if(!root)return Promise.resolve();
  const reward=caseReward(rewardId);
  const id=reward?.weaponId===weaponId&&weaponSkinUrl(rewardId)?rewardId:null;
  let state=instances.get(root);
  if(!state){
    if(!id)return Promise.resolve();
    state={id:null,materials:new Map(),pending:null,texture:null};
    instances.set(root,state);
  }
  if(state.id===id)return state.pending??Promise.resolve();
  state.id=id;
  state.texture=null;
  for(const mesh of state.materials.keys())restorePaint(state,mesh);
  if(!id){state.pending=null;return Promise.resolve();}
  const pending=loadPaint(id).then(texture=>{
    if(state.pending!==pending)return;
    state.texture=texture;
    paintParts(state,root);
  }).catch(error=>{
    if(state.pending===pending){state.id=null;state.pending=null;}
    throw error;
  });
  state.pending=pending;
  return pending;
}

const companions=new WeakMap();
function companionPaint(texture,id){
  if(!companions.has(texture)){
    const companion=texture.clone();
    // Portrait and engraved emblems are reserved for their main panel.
    // The outer band of the print colours the remaining panels.
    if(id===nautilusFinish){
      companion.repeat.set(1-nautilusPanelWidth,1);
      companion.offset.set(nautilusPanelWidth,0);
    }else{
      companion.repeat.set(.28,.78);
      companion.offset.set(id==='polar-ultra-1'?.70:.02,.11);
    }
    companion.needsUpdate=true;
    companions.set(texture,companion);
  }
  return companions.get(texture);
}
