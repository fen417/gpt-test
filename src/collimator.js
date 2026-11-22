import {CircleGeometry,Mesh,MeshBasicMaterial,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';

export const COLLIMATOR_ZOOM=1.5;
const fits={
  ar416:{mount:[0,.095,-.087],sights:['Sights'],guard:true},
  ak12:{mount:[0,.076,-.070],sights:['Sights'],guard:true},
  mcx9:{mount:[0,.091,-.083],sights:['IronSights'],guard:true},
  vk45:{mount:[0,.069,-.092],sights:['IronSights'],guard:true},
  mg36:{mount:[0,.060,-.094],sights:['CarrySight'],guard:true},
  pkp:{mount:[0,.102,-.104],sights:['FrontSight','RearSight'],parent:'FeedCover',parentRest:[0,.055,-.255],scale:.93},
  p19:{mount:[0,.044,.082],sights:['FrontSight','RearSight'],parent:'Slide',scale:.63},
  m50:{mount:[0,.044,.079],sights:['FrontSight','RearSight'],parent:'Slide',scale:.69},
};
export const supportsCollimator=id=>Object.hasOwn(fits,id);

const sessionKey='sector09-collimator-test';
let session;
try{session=JSON.parse(sessionStorage.getItem(sessionKey));}catch{}
const selected=new Set(Array.isArray(session)?session.filter(supportsCollimator):[]);
let template,pending;

export function collimatorTestEnabled(){return Boolean(template);}
export function hasCollimator(id){return collimatorTestEnabled()&&selected.has(id);}
export function equipCollimator(id,equip){
  if(!collimatorTestEnabled()||!supportsCollimator(id))return;
  if(equip)selected.add(id);else selected.delete(id);
  saveSession();
}

function saveSession(){
  try{sessionStorage.setItem(sessionKey,JSON.stringify([...selected]));}catch{}
}

export function enableCollimatorTest(){
  if(template)return Promise.resolve();
  if(!pending)pending=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(new URL('./assets/infantry/collimator.glb',import.meta.url).href)
    .then(({scene})=>{
      if(!scene.getObjectByName('Collimator')||!scene.getObjectByName('SightEye'))
        throw Error('Incomplete collimator model');
      template=scene;
      saveSession();
    }).catch(error=>{pending=null;throw error;});
  return pending;
}

export function restoreCollimatorTest(){
  if(Array.isArray(session))return enableCollimatorTest();
  return Promise.resolve();
}

let dotGeometry,dotMaterial;

export function mountCollimator(weaponId,root,pistolMatrix){
  const fit=fits[weaponId];
  if(!template||!fit||!root)return null;
  const parent=fit.parent?root.getObjectByName(fit.parent):root;
  if(!parent)return null;
  const optic=template.getObjectByName('Collimator').clone(true);
  const guard=fit.guard?template.getObjectByName('Guard_'+weaponId)?.clone(true):null;
  const stockGuard=fit.guard?root.getObjectByName('Handguard'):null;
  const stock=fit.sights.map(name=>root.getObjectByName(name)).filter(Boolean);
  if(stockGuard&&guard){stock.push(stockGuard);root.add(guard);}
  const scale=fit.scale??1;
  const position=new Vector3(...fit.mount);
  optic.position.copy(position);
  if(fit.parentRest)optic.position.sub(new Vector3(...fit.parentRest));
  optic.scale.setScalar(scale);
  parent.add(optic);
  const eye=template.getObjectByName('SightEye').position;
  const sightPoint=position.addScaledVector(eye,scale);
  if(pistolMatrix)sightPoint.applyMatrix4(pistolMatrix);
  dotGeometry??=new CircleGeometry(.0007,16);
  dotMaterial??=new MeshBasicMaterial({color:0xff4029,toneMapped:false,depthWrite:false});
  const dot=new Mesh(dotGeometry,dotMaterial);
  dot.position.set(eye.x,eye.y,-.034);
  dot.visible=false;
  optic.add(dot);
  // Cloned geometry shares GPU resources with the session's template.
  const setLayer=part=>{part.layers.mask=root.layers.mask;};
  optic.traverse(setLayer);
  guard?.traverse(setLayer);
  return {
    height:sightPoint.y,depth:-(pistolMatrix ? .30 : .235)-sightPoint.z,
    show(visible){
      optic.visible=visible;
      if(guard)guard.visible=visible;
      for(const part of stock)part.visible=!visible;
    },
    aim(value){dot.visible=value;},
  };
}
