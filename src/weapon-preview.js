import * as THREE from 'three';
import {WEAPONS} from '../shared/world.js';

function visibleBounds(root){
  root.updateMatrixWorld(true);const bounds=new THREE.Box3();
  root.traverseVisible(object=>{
    if(!object.isMesh)return;object.geometry.computeBoundingBox();
    bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
  });return bounds;
}

export function mountWeaponPreview({getRig,getLoadout,panelId='single-player-panel',prefix='weapon-preview'}){
  const canvas=document.getElementById(prefix),panel=document.getElementById(panelId);
  const title=document.getElementById(prefix+'-name'),hint=document.getElementById(prefix+'-hint');
  const isOpen=()=>panel.tagName==='DIALOG'?panel.open:!panel.classList.contains('hidden');
  const slots=()=>panel.querySelectorAll('[data-preview-slot]');
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(30,1,.01,20),pivot=new THREE.Group();scene.add(pivot);
  scene.add(new THREE.HemisphereLight(0xf4f6df,0x37483b,3));
  for(const [color,power,position] of [[0xffedca,3.5,[1,2,3]],[0xa9ced1,2,[-2,1,-1]]]){const light=new THREE.DirectionalLight(color,power);light.position.set(...position);scene.add(light);}
  let renderer,model,key='',sidearm=false,raf=0,drag=null,size=new THREE.Vector3(),distance=1,loadingUntil=0;
  const reset=()=>{pivot.rotation.set(-.10,Math.PI/2-.22,-.05);fit();invalidate();};
  function fit(){
    if(!model)return;size.copy(visibleBounds(pivot).getSize(new THREE.Vector3()));
    const fov=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
    distance=Math.max(size.y/(2*fov),size.x/(2*fov*camera.aspect))*1.25+size.z*.5;
    camera.position.set(0,0,Math.max(.3,distance));camera.lookAt(0,0,0);
  }
  function resize(){
    if(!renderer||!isOpen())return;
    const width=canvas.clientWidth,height=canvas.clientHeight;if(!width||!height)return;
    renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();fit();invalidate();
  }
  function draw(){
    raf=0;if(!isOpen()||document.hidden||!renderer)return;
    renderer.render(scene,camera);
    // Texture images may still be decoding on first open. Settle briefly,
    // then draw only after a selection, drag or resize instead of idling.
    if(performance.now()<loadingUntil)raf=requestAnimationFrame(draw);
  }
  function invalidate(){if(!raf&&isOpen()&&!document.hidden)raf=requestAnimationFrame(draw);}
  function update(slot){
    if(slot==='primary'||slot==='sidearm'){
      sidearm=slot==='sidearm';for(const button of slots())button.setAttribute('aria-pressed',String(button.dataset.previewSlot===slot));
    }
    if(!isOpen())return;const rig=getRig();if(!rig)return;
    const loadout=getLoadout(),id=sidearm?loadout.sidearmId:loadout.weaponId;
    if(key===id){invalidate();return;}key=id;
    try{
      if(!renderer){renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.25));renderer.setClearColor(0,0);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;}
      model?.removeFromParent();pivot.rotation.set(0,0,0);model=rig.createPreviewModel(loadout.classId,id);pivot.add(model);
      const center=visibleBounds(model).getCenter(new THREE.Vector3());model.position.sub(center);
      title.textContent=WEAPONS[id]?.name??id;hint.textContent='Потяни, чтобы повернуть';
      canvas.setAttribute('aria-label','3D-модель '+title.textContent);loadingUntil=performance.now()+800;reset();resize();
    }catch(error){key='';hint.textContent='3D-просмотр недоступен';console.warn('Weapon preview unavailable',error);}
  }
  for(const button of slots())button.addEventListener('click',()=>{
    sidearm=button.dataset.previewSlot==='sidearm';
    for(const item of slots())item.setAttribute('aria-pressed',String(item===button));
    update();
  });
  canvas.addEventListener('pointerdown',event=>{if(event.button!==0)return;drag={x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener('pointermove',event=>{if(!drag)return;pivot.rotation.y+=(event.clientX-drag.x)*.008;pivot.rotation.x=THREE.MathUtils.clamp(pivot.rotation.x+(event.clientY-drag.y)*.006,-.7,.7);drag={x:event.clientX,y:event.clientY};invalidate();});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>{drag=null;});
  canvas.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(event.key))return;event.preventDefault();if(event.key==='Home'){reset();return;}pivot.rotation.y+=event.key==='ArrowLeft'?-.12:event.key==='ArrowRight'?.12:0;pivot.rotation.x=THREE.MathUtils.clamp(pivot.rotation.x+(event.key==='ArrowUp'?-.08:event.key==='ArrowDown'?.08:0),-.7,.7);invalidate();});
  document.getElementById(prefix+'-reset').addEventListener('click',reset);
  new ResizeObserver(resize).observe(canvas);
  new MutationObserver(()=>{if(isOpen()){update();resize();}else{cancelAnimationFrame(raf);raf=0;drag=null;}}).observe(panel,{attributes:true,attributeFilter:['open','class']});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)invalidate();});
  window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);renderer?.dispose();});
  return {update};
}
