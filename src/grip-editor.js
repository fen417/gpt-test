import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createWeaponRig} from './weapons.js';
import {loadFPSHands} from './fps-hands.js';
import {loadWeaponModels} from './weapon-models.js';
import {loadEquipmentModels} from './gadget-models.js';
import {WEAPONS} from '../shared/world.js';

const $=id=>document.getElementById(id), names=['index','middle','ring','pinky','thumb','position','rotation'];
const blank=()=>Object.fromEntries(names.map(name=>[name,[0,0,0]]));
const clone=p=>JSON.parse(JSON.stringify(p??blank()));
const pistol=id=>id==='p19'||id==='m50';
const status=(text,error=false)=>{$('status').textContent=text;$('status').style.color=error?'#ff9b91':'#c7dce6';};
const root='./__grip-editor/';
async function api(action,data){
  const response=await fetch(root+action,data===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result=await response.json();
  if(!response.ok)throw Error(result.error??response.status);
  return result;
}
const owner={detailLevel:1,lowQuality:false,gripProfiles:{}};
let rig,renderer,controls,scene,camera,grid,axes,resizeObserver,raf=0,saved={},draft=blank(),entry=null;
let revision=0,previewTimer=0,locked=false,dirty=false;
const selected=()=>({weapon:$('weapon').value,side:$('side').value});
const same=(sel)=>sel.weapon===$('weapon').value&&sel.side===$('side').value;
function setProfile(sel,value){
  (owner.gripProfiles[sel.weapon]??={})[sel.side]=value;
}
function savedEntry(sel){return saved[sel.weapon]?.[sel.side]??null;}
function getHandMeshes(){
  const id=$('weapon').value;
  const right=rig.weapon.getObjectByName(pistol(id)?'imported-fps-hand-pistolTrigger':'imported-fps-hand-trigger');
  const left=rig.weapon.getObjectByName(pistol(id)?'imported-fps-hand-pistolSupport':'imported-fps-hand-support');
  return {left,right};
}
function draw(){
  if(!rig)return;
  const {weapon,side}=selected(),pose=$('pose').value;
  const reload=pose==='reload'||(pistol(weapon)&&side==='left');
  const phase=reload?Number($('phase').value):1;
  rig.update({weaponId:weapon,classId:WEAPONS[weapon]?.classId??'assault',aim:pose==='ads'?1:0,kick:pose==='fire'?.5:0,reloadPhase:phase,reloadEmpty:false});
  const {left,right}=getHandMeshes();
  if($('isolate').checked){
    if(left)left.visible=side==='left'&&(!pistol(weapon)||reload);
    if(right)right.visible=side==='right';
    rig.leftArm.visible=false;
    const arm=rig.weapon.getObjectByName('right-articulated-forearm');if(arm)arm.visible=false;
  }else{
    if(left)left.visible=true;if(right)right.visible=true;
  }
  rig.muzzleFlash.visible=false;rig.flashLight.intensity=0;
  grid.visible=axes.visible=$('grid').checked;
  rig.weapon.updateMatrixWorld(true);
  invalidate();
}
function invalidate(){
  if(!raf&&renderer)raf=requestAnimationFrame(()=>{raf=0;renderer.render(scene,camera);});
}
function focus(hand=false,sideView=false){
  if(!rig)return;
  rig.weapon.updateMatrixWorld(true);
  const mesh=getHandMeshes()[$('side').value];
  const bounds=new T.Box3();
  if(hand&&mesh)bounds.setFromObject(mesh,true);
  else rig.weapon.traverseVisible(obj=>{
    if(!obj.isMesh||obj===rig.muzzleFlash||obj.name.startsWith('imported-fps-sleeve'))return;
    if(!obj.geometry.boundingBox)obj.geometry.computeBoundingBox();
    bounds.union(obj.geometry.boundingBox.clone().applyMatrix4(obj.matrixWorld));
  });
  if(bounds.isEmpty())return;
  const center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3());
  const radius=Math.max(size.x,size.y,size.z,.06);
  const distance=radius/(2*Math.tan(T.MathUtils.degToRad(camera.fov/2)))*1.55*Math.max(1,1/camera.aspect);
  const direction=sideView?new T.Vector3(1,.06,0):camera.position.clone().sub(controls.target).normalize();
  if(!direction.lengthSq())direction.set(1,.35,.45).normalize();
  controls.target.copy(center);camera.position.copy(center).addScaledVector(direction.normalize(),distance);controls.update();invalidate();
}
function sync(){
  const part=$('part').value,rotation=part==='rotation',scale=rotation?1:1000,limit=rotation?60:60,step=rotation?1:.5;
  $('axisHelp').textContent=rotation?'X/Y/Z: вращение вокруг запястья, градусы.':'X: вправо (+), Y: вверх (+), Z: назад (+). Оси локальные относительно руки.';
  $('axes').replaceChildren();
  for(let i=0;i<3;i++){
    const row=document.createElement('div');row.className='axis';
    const label=document.createElement('b');label.textContent='XYZ'[i];label.style.color=['#ef8a84','#8dd69d','#88b8fc'][i];
    const range=document.createElement('input'),number=document.createElement('input');
    for(const [input,type] of [[range,'range'],[number,'number']]){
      input.type=type;input.min=-limit;input.max=limit;input.step=step;input.value=Number((draft[part][i]*scale).toFixed(3));input.disabled=locked;
      input.setAttribute('aria-label','XYZ'[i]+' '+part);
    }
    const edit=source=>{
      if(locked||source.value===''||!Number.isFinite(Number(source.value)))return;
      const val=T.MathUtils.clamp(Number(source.value),-limit,limit);
      draft[part][i]=val/scale;range.value=val;
      if(source!==number)number.value=val;
      changed();
    };
    range.addEventListener('input',()=>edit(range));number.addEventListener('input',()=>edit(number));number.addEventListener('change',()=>{number.value=draft[part][i]*scale;});
    row.append(label,range,number);$('axes').append(row);
  }
}
function lock(value){
  locked=value;for(const id of ['weapon','side','part','save','reset','zero','undo'])$(id).disabled=value;sync();
}
function changed(){
  dirty=true;clearTimeout(previewTimer);const token=++revision,sel=selected(),params=clone(draft);
  // Rigid wrist edits render instantly even while a finger preview is pending.
  setProfile(sel,{params,geometry:entry?.geometry??null});draw();
  if(names.slice(0,5).every(k=>JSON.stringify(params[k])===JSON.stringify(entry?.params?.[k]??[0,0,0]))){
    entry={params,geometry:entry?.geometry??null};status('Изменено — не сохранено');return;
  }
  status('Пересчёт суставов…');
  previewTimer=setTimeout(async()=>{
    try{
      const next=(await api('preview',{...sel,params})).entry;
      if(token!==revision||!same(sel))return;
      entry=next;setProfile(sel,entry);draw();status('Изменено — не сохранено');
    }catch(error){if(token===revision)status('Ошибка предпросмотра: '+error.message,true);}
  },90);
}
let lastSelection;
function select(force=false){
  if(!force&&dirty&&!confirm('Перейти к другой руке или оружию без сохранения?')){
    $('weapon').value=lastSelection.weapon;$('side').value=lastSelection.side;return;
  }
  clearTimeout(previewTimer);revision++;
  if(lastSelection)setProfile(lastSelection,savedEntry(lastSelection));
  const sel=selected();lastSelection=sel;entry=savedEntry(sel);draft=clone(entry?.params);setProfile(sel,entry);dirty=false;sync();draw();focus(true);
  status(entry?'Загружен сохранённый хват':'Исходный хват');
}
async function save(reset=false){
  if(locked)return;
  if(reset&&!confirm('Удалить все изменения этой руки для выбранного оружия?'))return;
  clearTimeout(previewTimer);revision++;const sel=selected();lock(true);
  try{
    status(reset?'Восстановление исходной позы…':'Сохранение…');
    entry=(await api(reset?'reset':'save',{...sel,params:clone(draft)})).entry;
    (saved[sel.weapon]??={})[sel.side]=entry;
    draft=clone(entry?.params);setProfile(sel,entry);dirty=false;draw();
    status(reset?'Исходная поза восстановлена':'Сохранено в src/assets/grip-overrides.json');
  }catch(error){status('Не удалось сохранить: '+error.message,true);}
  finally{lock(false);}
}
async function init(){
  if(!import.meta.env.DEV)throw Error('Редактор доступен только при npm run dev');
  saved=await api('profiles');owner.gripProfiles=clone(saved);
  await Promise.all([loadFPSHands(),loadWeaponModels(),loadEquipmentModels()]);
  scene=new T.Scene();scene.background=new T.Color(0x20282e);
  camera=new T.PerspectiveCamera(36,1,.005,50);camera.position.set(1,.35,.55);
  renderer=new T.WebGLRenderer({canvas:$('canvas'),antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.minDistance=.035;controls.maxDistance=8;controls.addEventListener('change',invalidate);
  scene.add(new T.HemisphereLight(0xe9f2ff,0x677064,2.5));
  for(const [pos,color,intensity] of [[[1,2,3],0xffebce,3],[[-2,1,-1],0xc4e5ff,2]]){const l=new T.DirectionalLight(color,intensity);l.position.set(...pos);scene.add(l);}
  grid=new T.GridHelper(2,40,0x62727d,0x3d4951);grid.position.y=-.55;scene.add(grid);axes=new T.AxesHelper(.16);scene.add(axes);
  rig=createWeaponRig(owner);rig.weapon.position.set(0,0,0);scene.add(rig.weapon);
  for(const [id,def] of Object.entries(WEAPONS))$('weapon').add(new Option(def.name,id));$('weapon').value='p19';
  const resize=()=>{const w=$('view').clientWidth,h=$('view').clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();invalidate();};
  resizeObserver=new ResizeObserver(resize);resizeObserver.observe($('view'));resize();
  $('weapon').onchange=$('side').onchange=()=>select();
  $('part').onchange=sync;$('zero').onclick=()=>{draft[$('part').value]=[0,0,0];sync();changed();};
  $('undo').onclick=()=>select(true);$('save').onclick=()=>save();$('reset').onclick=()=>save(true);
  for(const id of ['pose','phase','isolate','grid'])$(id).addEventListener('input',draw);
  $('focus').onclick=()=>focus(true);$('fit').onclick=()=>focus();$('front').onclick=()=>focus(true,true);
  select(true);await rig.ready();invalidate();
}
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
window.addEventListener('pagehide',()=>{clearTimeout(previewTimer);cancelAnimationFrame(raf);resizeObserver?.disconnect();controls?.dispose();rig?.dispose();renderer?.dispose();});
init().catch(error=>{console.error(error);status('Редактор не запущен: '+error.message,true);});
