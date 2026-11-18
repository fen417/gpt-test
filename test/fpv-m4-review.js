import * as THREE from 'three';
import {createWeaponRig} from '../src/weapons.js';
import {loadFPSHands} from '../src/fps-hands.js';
import {InfantryAssets,prepareWeapon} from '../src/infantry-assets.js';
import {prepareViewModel} from '../src/viewmodel.js';

const query=new URLSearchParams(location.search);
const pose=query.get('pose')||'hip';
document.querySelector('#pose').textContent={
  hip:'HIP FIRE / FIRST PERSON',ads:'AIM DOWN SIGHTS / FIRST PERSON',
  reload:'MAGAZINE RELOAD / FIRST PERSON',grip:'VERTICAL FOREGRIP / SUPPORT HAND',
  parts:'DIAGNOSTIC / M4 MESH PARTS',profile:'DIAGNOSTIC / SIDE VIEW',side:'M4 / SIDE VIEW WITHOUT IRON SIGHTS',
  gripDetail:'LEFT HAND / CLOSE GRIP',gripOpposite:'FINGERS / OPPOSITE SIDE',gripSide:'FOREGRIP / SIDE VIEW'
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
// The test page is under /test/, unlike the game index at /. KTX2 worker files
// are served at /basis/, not /test/basis/.
assets.ktx.setTranscoderPath('/basis/');
try{
  const model=await assets.request('m4a1',prepareWeapon);
  rig.attachM4A1(model);
  prepareViewModel(rig.weapon);
  const reload=pose==='reload',aim=pose==='ads',grip=pose==='grip';
  const diagnostic=pose==='parts'||pose==='profile';
  const side=pose==='side';
  const inspecting=['gripDetail','gripOpposite','gripSide'].includes(pose);
  const reloadPhase=reload?.52:1;
  rig.update({classId:'assault',weaponId:'ar416',aim:aim?1:0,reloadPhase,reloadEmpty:reload});
  if(!rig.isImportedM4)throw Error('M4A1 did not replace fallback');
  const reloadMotion=reload?1:0;
  rig.weapon.position.set(aim?0:grip?.20:.15,aim?-rig.sightHeight:grip?-.10:-.23,aim?-.13:grip?-.38:-.60);
  rig.weapon.position.y-=reloadMotion*.012;
  rig.weapon.position.z+=reloadMotion*.06;
  rig.weapon.rotation.set(-reloadMotion*.13,pose==='profile'||side?.67:grip?-.24:-reloadMotion*.08,-reloadMotion*.17);
  if(side){rig.leftHand.visible=false;rig.leftArm.visible=false;}
  if(diagnostic){
    const colorByName={ChargingHandleGeometryMesh:0xff9038,SuppressorGeometryMesh:0x18f6ff,
      ForegripGeometryMesh:0x72ff23,MagazineGeometryMesh:0xff29b2,OpticMountGeometryMesh:0x9f64ff};
    const imported=rig.weapon.getObjectByName('fpv-m4a1-textured-model');
    imported?.traverse(node=>{
      if(!node.isMesh)return;
      const material=new THREE.MeshBasicMaterial({color:colorByName[node.name]??0xffffff});
      node.material=material;
    });
    rig.leftHand.visible=false;rig.leftArm.visible=false;
    const label=document.querySelector('footer');
    if(label)label.textContent='ORANGE RECEIVER / CYAN SUPPRESSOR / LIME FOREGRIP / PINK MAGAZINE';
  }
  // Verify the fitted palm actually lands on the imported foregrip rather than
  // merely looking close from the camera's perspective.
  rig.weapon.updateWorldMatrix(true,true);
  const palm=rig.leftHand.localToWorld(new THREE.Vector3(-.017,.032,-.063));
  const contact=rig.weapon.localToWorld(rig.m4SupportContact);
  const aimPoint=rig.m4Reflex.localToWorld(new THREE.Vector3(0,.166,-.103))
    .project(camera);
  const gripBox=rig.m4GripMesh?new THREE.Box3().setFromObject(rig.m4GripMesh):null;
  const supportMesh=rig.m4VerticalHand;
  const handBox=rig.m4VerticalHand?new THREE.Box3().setFromObject(rig.m4VerticalHand):null;
  const toArray=box=>box?{min:box.min.toArray(),max:box.max.toArray(),size:box.getSize(new THREE.Vector3()).toArray()}:null;
  window.__m4Diagnostics={
    palmToGrip:palm.distanceTo(contact),
    verticalHandActive:rig.m4VerticalHand?.visible,
    genericSupportHidden:!rig.leftHand.getObjectByName('imported-fps-hand-support')?.visible,
    foregripBounds:toArray(gripBox),handBounds:toArray(handBox),
    gripContact:rig.m4SupportContact.toArray(),
    palmWorld:palm.toArray(),
    sightNDC:[aimPoint.x,aimPoint.y],
    sightType:rig.sightType,
    collimatorVisible:rig.m4Reflex.visible,
    sourceOpticVisible:rig.m4GripMesh?.parent?.getObjectByName('OpticMountGeometryMesh')?.visible,
    suppressorVisible:rig.weapon.getObjectByName('fpv-m4a1-textured-model')?.getObjectByName('SuppressorGeometryMesh')?.visible,
  };
  if(!reload&&window.__m4Diagnostics.palmToGrip>.025)
    throw Error('Support palm missed M4 foregrip by '+window.__m4Diagnostics.palmToGrip.toFixed(3)+' m');
  if(!reload&&!diagnostic&&!side&&!window.__m4Diagnostics.verticalHandActive)
    throw Error('M4 must use dedicated vertical grip hand, not underhand generic mesh');
  if(window.__m4Diagnostics.suppressorVisible)throw Error('3P suppressor silhouette still protrudes into FPV');
  if(rig.sightType!=='reflex'||!rig.m4Reflex.visible)
    throw Error('Original AR-416 collimator did not replace M4 optics');
  if(aim&&Math.abs(aimPoint.x)>.08||aim&&Math.abs(aimPoint.y)>.08)
    throw Error('Reflex sight is not aligned with the centre of the ADS camera: '+JSON.stringify(window.__m4Diagnostics));
  camera.updateProjectionMatrix();
  if(inspecting){
    const closeCamera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.016,20);
    const center=gripBox.getCenter(new THREE.Vector3());
    const offset=pose==='gripDetail'?new THREE.Vector3(-.19,.03,.14)
      :pose==='gripOpposite'?new THREE.Vector3(.20,.018,-.16)
      :new THREE.Vector3(.23,.035,.055);
    closeCamera.position.copy(center).add(offset);
    closeCamera.lookAt(center);
    closeCamera.layers.enable(1);
    scene.add(closeCamera);
    renderer.render(scene,closeCamera);
  }else renderer.render(scene,camera);
  window.__previewReady=true;
}catch(error){
  window.__previewError=String(error?.stack||error);
  console.error(error);
}
window.addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);renderer.render(scene,camera);
});
