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
const illustrationParts={'legendary-1':'Receiver','ultra-1':'Receiver'};

async function loadPaint(id){
  if(!textureCache.has(id)){
    const pending=new TextureLoader().loadAsync(weaponSkinUrl(id)).then(texture=>{
      texture.colorSpace=SRGBColorSpace;
      texture.channel=1;
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
  const point=new Vector3(),normal=new Vector3();
  const sharedBounds=new Box3(),panels=[];
  root.traverse(mesh=>{
    if(!mesh.isMesh||!paintNames.test(mesh.name)||!mesh.geometry.attributes.normal)return;
    const source=mesh.geometry;
    if(projections.has(source))return;
    const pos=source.attributes.position;
    const bounds=new Box3();
    const world=new Matrix4().multiplyMatrices(rootInverse,mesh.matrixWorld);
    for(let i=0;i<pos.count;i++)bounds.expandByPoint(point.fromBufferAttribute(pos,i).applyMatrix4(world));
    sharedBounds.union(bounds);
    panels.push({source,world,bounds});
  });
  for(const {source,world,bounds} of panels){
    const {position:pos,normal:normals}=source.attributes;
    // The M-50 atlas is laid out over the entire side. Preserve the same
    // texel scale on the slide, shroud and grip instead of filling each part.
    const {min,max}=weaponId==='m50'?sharedBounds:bounds;
    const depth=Math.max(.001,max.z-min.z),height=Math.max(.001,max.y-min.y);
    const values=new Float32Array(pos.count*2);
    for(let i=0;i<pos.count;i++){
      point.fromBufferAttribute(pos,i).applyMatrix4(world);
      normal.fromBufferAttribute(normals,i).transformDirection(world);
      values[i*2]=.025+.95*(point.z-min.z)/depth;
      // Broaden the projection over top rails and bevels as it wraps around.
      values[i*2+1]=.025+.95*(point.y-min.y)/height+.09*(point.x/(max.x-min.x||1))*Math.abs(normal.y);
    }
    // Share the original geometry and GPU buffers across both stock and
    // painted instances. Only the extra UV attribute is new.
    source.setAttribute('uv1',new BufferAttribute(values,2));
    projections.set(source,true);
  }
}

export function setWeaponSkin(root,weaponId,rewardId){
  if(!root)return Promise.resolve();
  const reward=caseReward(rewardId);
  const id=reward?.weaponId===weaponId&&weaponSkinUrl(rewardId)?rewardId:null;
  let state=instances.get(root);
  if(!state){
    if(!id)return Promise.resolve();
    state={id:null,materials:[],pending:null};
    instances.set(root,state);
  }
  if(state.id===id)return state.pending??Promise.resolve();
  state.id=id;
  for(const [mesh,original,painted] of state.materials){
    mesh.material=original;
    painted.dispose();
  }
  state.materials.length=0;
  if(!id){state.pending=null;return Promise.resolve();}
  const pending=loadPaint(id).then(texture=>{
    if(state.pending!==pending)return;
    const hero=illustrationParts[id];
    root.traverse(mesh=>{
      if(!mesh.isMesh||!projections.has(mesh.geometry)||!mesh.material.isMeshStandardMaterial)return;
      const original=mesh.material,painted=original.clone();
      painted.map=hero&&mesh.name!==hero?companionPaint(texture):texture;
      painted.color.set(0xffffff);
      painted.vertexColors=false;
      painted.roughnessMap=null;
      painted.metalnessMap=null;
      Object.assign(painted,finishes[reward.rarity]);
      originalMaterials.set(painted,original);
      mesh.material=painted;
      state.materials.push([mesh,original,painted]);
    });
  }).catch(error=>{
    if(state.pending===pending){state.id=null;state.pending=null;}
    throw error;
  });
  state.pending=pending;
  return pending;
}

const companions=new WeakMap();
function companionPaint(texture){
  if(!companions.has(texture)){
    const companion=texture.clone();
    // Portrait and engraved emblems are reserved for their main panel.
    // The outer band of the print colours the remaining panels.
    companion.repeat.set(.28,.78);
    companion.offset.set(.02,.11);
    companion.needsUpdate=true;
    companions.set(texture,companion);
  }
  return companions.get(texture);
}
