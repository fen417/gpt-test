import {CircleGeometry,Mesh,MeshBasicMaterial} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {setWeaponModule,weaponModuleMount} from './weapon-models.js';
import {getWeaponModule,WEAPON_MODULES} from '../shared/weapon-modules.js';

const collimatorId='collimator-15';
export const COLLIMATOR_ZOOM=WEAPON_MODULES[collimatorId].zoom;
const scales={pkp:.93,p19:.63,m50:.69};
const supportsCollimator=id=>Boolean(getWeaponModule(id,'optic',collimatorId));

const sessionKey='sector09-collimator-test';
let session;
try{session=JSON.parse(sessionStorage.getItem(sessionKey));}catch{}
const selected=new Set(Array.isArray(session)?session.filter(supportsCollimator):[]);
let template,pending,testEnabled=false;

export function collimatorTestEnabled(){return testEnabled;}
export function hasCollimator(id){return collimatorTestEnabled()&&selected.has(id);}
export function equipCollimator(id,equip){
  if(!collimatorTestEnabled()||!supportsCollimator(id))return;
  if(equip)selected.add(id);else selected.delete(id);
  saveSession();
}

function saveSession(){
  try{sessionStorage.setItem(sessionKey,JSON.stringify([...selected]));}catch{}
}

export function loadCollimatorModel(){
  if(template)return Promise.resolve();
  if(!pending)pending=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(new URL('./assets/infantry/collimator.glb',import.meta.url).href)
    .then(({scene})=>{
      if(!scene.getObjectByName('Collimator')||!scene.getObjectByName('SightEye'))
        throw Error('Incomplete collimator model');
      template=scene;
    }).catch(error=>{pending=null;throw error;});
  return pending;
}

export async function enableCollimatorTest(){
  await loadCollimatorModel();
  testEnabled=true;
  saveSession();
}

export function restoreCollimatorTest(){
  if(Array.isArray(session))return enableCollimatorTest();
  return Promise.resolve();
}

let dotGeometry,dotMaterial;

export function mountCollimator(weaponId,root,pistolMatrix){
  const socket=weaponModuleMount(root,'optic');
  if(!template||!supportsCollimator(weaponId)||!socket)return null;
  const optic=template.getObjectByName('Collimator').clone(true);
  const scale=scales[weaponId]??1;
  optic.scale.setScalar(scale);
  const eye=template.getObjectByName('SightEye').position;
  const sightPoint=root.worldToLocal(socket.localToWorld(eye.clone().multiplyScalar(scale)));
  if(pistolMatrix)sightPoint.applyMatrix4(pistolMatrix);
  dotGeometry??=new CircleGeometry(.0007,16);
  dotMaterial??=new MeshBasicMaterial({color:0xff4029,toneMapped:false,depthWrite:false});
  const dot=new Mesh(dotGeometry,dotMaterial);
  dot.position.set(eye.x,eye.y,-.034);
  dot.visible=false;
  optic.add(dot);
  let installed=false;
  return {
    height:sightPoint.y,depth:-(pistolMatrix ? .30 : .235)-sightPoint.z,
    show(visible){
      if(visible===installed)return false;
      installed=visible;
      return setWeaponModule(root,'optic',visible?optic:null);
    },
    aim(value){dot.visible=value;},
  };
}
