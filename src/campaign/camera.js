import * as THREE from 'three';
import {getAssetColliders,expandCollider,rayCollider,overlapsCollider} from '../../shared/asset-colliders.js';
import {uprightBox} from '../../shared/geometry.js';

const radius=.32,worldCache=new WeakMap(),curveCache=new WeakMap();
function world(map){let value=worldCache.get(map);if(!value){const colliders=getAssetColliders(map);value={colliders,expanded:colliders.map(b=>expandCollider(b,radius))};worldCache.set(map,value);}return value;}
export function cameraHasClearance(map,position){
  if(position.y<(map.terrain?.heightAt(position.x,position.z)??0)+.65)return false;
  const shape=uprightBox(position.x,position.y-radius,position.z,radius,radius*2);
  return !world(map).colliders.some(b=>overlapsCollider(shape,b));
}
export function cameraSegmentClear(map,from,to){
  const direction=new THREE.Vector3().subVectors(to,from),length=direction.length();if(length<.001)return true;direction.multiplyScalar(1/length);
  for(const b of world(map).expanded)if(rayCollider(from,direction,b,length)<length-.01)return false;
  for(let t=0;t<=length;t+=.4){const x=from.x+direction.x*t,z=from.z+direction.z*t;if(from.y+direction.y*t<(map.terrain?.heightAt(x,z)??0)+.6)return false;}
  return true;
}
export function cinematicCameraPose(map,definition,elapsed,previous=null){
  let curve=curveCache.get(definition);
  if(!curve){curve=new THREE.CatmullRomCurve3(definition.camera.map(([x,y,z])=>new THREE.Vector3(x,y+(definition.heightAboveGround?(map.terrain?.heightAt(x,z)??0):0),z)));curveCache.set(definition,curve);}
  const position=curve.getPoint(THREE.MathUtils.clamp(elapsed/definition.duration,0,1));
  position.y=Math.max(position.y,(map.terrain?.heightAt(position.x,position.z)??0)+.75);
  for(let lift=0;!cameraHasClearance(map,position)&&lift<24;lift++)position.y+=.35;
  if(previous&&!cameraSegmentClear(map,previous,position)){
    const raised=previous.clone();raised.y=Math.max(previous.y+.35,position.y+.35);
    if(cameraHasClearance(map,raised)&&cameraSegmentClear(map,previous,raised))position.copy(raised);
    else position.copy(previous);
  }
  const [x,y,z]=definition.lookAt,lookAt=new THREE.Vector3(x,y+(definition.lookHeightAboveGround?(map.terrain?.heightAt(x,z)??0):0),z);
  return {position,lookAt};
}
