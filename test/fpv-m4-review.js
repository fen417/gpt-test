import * as THREE from 'three';
import {createWeaponRig} from '../src/weapons.js';
import {loadFPSHands} from '../src/fps-hands.js';
import {InfantryAssets,prepareWeapon} from '../src/infantry-assets.js';
import {prepareViewModel} from '../src/viewmodel.js';

const query=new URLSearchParams(location.search);
const pose=query.get('pose')||'hip';
document.querySelector('#pose').textContent={
  hip:'HIP FIRE / FIRST PERSON',ads:'AIM DOWN SIGHTS / FIRST PERSON',
  reload:'MAGAZINE RELOAD / FIRST PERSON'
}[pose]||pose.toUpperCase();
const scene=new THREE.Scene();
scene.background=new THREE.Color('#525c59');
const camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.045,100);
camera.layers.enable(1);
scene.add(camera);
const key=new THREE.HemisphereLight(0xe7f1ed,0x676d6a,3.0);
key.layers.enable(1);scene.add(key);
const fill=new THREE.DirectionalLight(0xfff1d9,3);
fill.position.set(-3,5,3);fill.layers.enable(1);scene.add(fill);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.05;
document.body.prepend(renderer.domElement);
await loadFPSHands();
const rig=createWeaponRig();
camera.add(rig.weapon);
prepareViewModel(rig.weapon);
const assets=new InfantryAssets(renderer);
try{
  const model=await assets.request('m4a1',prepareWeapon);
  rig.attachM4A1(model);
  prepareViewModel(rig.weapon);
  const reload=pose==='reload',aim=pose==='ads';
  const reloadPhase=reload?.52:1;
  rig.update({classId:'assault',weaponId:'ar416',aim:aim?1:0,reloadPhase,reloadEmpty:reload});
  if(!rig.isImportedM4)throw Error('M4A1 did not replace fallback');
  const reloadMotion=reload?1:0;
  rig.weapon.position.set(aim?0:.26,aim?-rig.sightHeight:-.23,aim?-.13:-.42);
  rig.weapon.position.y-=reloadMotion*.10;
  rig.weapon.position.z+=reloadMotion*.06;
  rig.weapon.rotation.set(-reloadMotion*.39,-reloadMotion*.22,-reloadMotion*.47);
  camera.updateProjectionMatrix();
  renderer.render(scene,camera);
  window.__previewReady=true;
}catch(error){
  window.__previewError=String(error?.stack||error);
  console.error(error);
}
window.addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);renderer.render(scene,camera);
});
