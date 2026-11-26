
import * as THREE from 'three';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {MTLLoader} from 'three/addons/loaders/MTLLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {loadFPSHands} from '../../src/fps-hands.js';
import {loadWeaponModels} from '../../src/weapon-models.js';
import {loadEquipmentModels} from '../../src/gadget-models.js';
import {GameRenderer} from '../../src/renderer.js';
import {graphicsEffects,baseGraphicsQuality,geometryQuality,gradeParameters} from '../../src/graphics-settings.js';
import {buildQuarryMissionScene} from '../../src/campaign/quarry-m05-scene.js';
import {loadQuarryDressing} from '../../src/campaign/mission5-presentation.js';
import {applyDressingNodeEdit} from '../../src/campaign/m05-dressing-edits.js';
import {heightmapRegion,encodeHeightmap,decodePGM,importHeightmap} from '../../shared/editor-heightmap.js';
import {validateGameplay} from '../../shared/editor-gameplay.js';
import {EDITOR_GRID,FLAT_HEIGHTS,createEditorSandbox,sandboxBase} from '../../shared/editor-maps.js';
import {registerLocalMap} from '../../shared/world.js';
import {QUARRY_M05,M05_EDITOR_BASE,M05_BASE_HEIGHTS,M05_GRID} from '../../shared/campaign/quarry-m05.js';
import {applySculpt,terrainWithEdits,editableBox,applyBoxEdit,validateM05Edits,modelColliders,editableMapBoxes,dressingBatchPivot,scatterPositions,inspectM05Edits,sampleRoad,gradeRoad} from '../../shared/campaign/m05-editor.js';
import {materialSlots,applyEditorMaterials,releaseEditorMaterials} from '../../src/campaign/m05-editor-materials.js';
import {prepareTerrainLayers,applyTerrainLayers} from '../../src/campaign/m05-terrain-layers.js';
import './editor.css';

const $=id=>document.getElementById(id), clone=v=>structuredClone(v), rad=Math.PI/180, deg=180/Math.PI;
const app=$('app');
app.innerHTML=`<header><strong>SECTOR 09 / WORLD EDITOR</strong><select id="mapPicker" title="Выбор карты"><option value="quarry-m05">M05 Карьер</option></select><button id="newMap">+ Карта</button><button id="save">Сохранить</button><button id="draft">Черновик JSON</button><button id="undo">↶</button><button id="redo">↷</button><button id="move">W · Перемещение</button><button id="rotate">E · Вращение</button><button id="scale">R · Масштаб</button><button id="space">Мир</button><button id="snap">Сетка: выкл.</button><select id="quality"><option value="low">Low</option><option value="medium">Medium</option><option value="high" selected>High</option><option value="ultra">Ultra</option></select><button id="validate">Проверить карту</button><button id="play">Играть ↗</button></header>
<main><aside><h3 id="mapTitle">Карта · M05 Карьер</h3><input id="search" placeholder="Поиск объектов" style="width:100%"><select id="filter" style="width:100%;margin:6px 0"><option value="all">Все редактируемые</option><option value="model">Модели</option><option value="box">Препятствия</option><option value="site">Сюжетные точки</option><option value="route">Маршруты</option><option value="road">Дороги</option><option value="dressing">Группы декораций M05</option><option value="gamepoint">Игровые точки</option><option value="reference">Защищённые объекты</option></select><div class="tools"><button id="selectAll">Все модели</button><button id="group">Группа</button><button id="ungroup">Разгруппировать</button></div><p class="hint">Ctrl + клик — добавить к выделению. Shift + клик — выбрать группу.</p><div id="tree" class="tree"></div><div class="section"><h3>Ресурсы</h3><button id="import">+ Импорт GLB / GLTF / FBX / OBJ</button><input id="files" type="file" multiple hidden accept=".glb,.gltf,.bin,.fbx,.obj,.mtl,.png,.jpg,.jpeg,.webp,.tga"><input id="assetSearch" placeholder="Поиск ресурсов" style="width:100%;margin-top:6px"><div id="assets"></div><p class="hint">Можно выбрать модель и сопутствующие текстуры одним действием либо перетащить файлы в сцену. Исходный файл не изменяется.</p></div></aside>
<div class="view" id="view"><canvas id="canvas" tabindex="0"></canvas><div class="overlay" id="overlay">Загрузка карты…</div><div id="fatal" class="hidden"></div></div>
<aside><h3>Инспектор</h3><div id="inspector"><p class="hint">Выберите объект в сцене или иерархии.</p></div><div class="section"><h3>Ландшафт</h3><div class="tools"><button id="selectMode">Выбор</button><button id="brushMode">Кисть</button><button id="paintMode">Цвет</button><button id="layerMode">Материал</button><button id="roadMode">Дорога</button><button id="scatterMode">Расстановка</button><button id="eraseMode">Ластик</button></div><label>Операция <select id="brush"><option value="raise">Поднять</option><option value="lower">Опустить</option><option value="smooth">Сгладить</option><option value="flatten">Высота</option><option value="restore">Восстановить</option></select></label><div class="field">Радиус, м<input id="radius" type="number" min="4" max="150" value="16"></div><div class="field">Сила<input id="strength" type="number" min=".01" max="5" step=".1" value="1"></div><div class="field">Жёсткость<input id="hardness" type="range" min="0" max="1" step=".05" value=".5"></div><div class="field">Высота, м<input id="target" type="number" value="12"></div><div class="section"><h3>Heightmap</h3><div class="field">Нижняя высота<input id="heightMin" type="number" value="-80"></div><div class="field">Верхняя высота<input id="heightMax" type="number" value="180"></div><div class="tools"><button id="heightImport">Импорт</button><button id="heightExport">PGM 16 бит</button><input id="heightFile" type="file" accept=".pgm,.png,.jpg,.jpeg" hidden></div><p class="hint">PGM 8/16 бит или PNG/JPEG (8 бит). Север соответствует началу строк Z. Белый — верхняя высота, чёрный — нижняя.</p></div><div class="field">Цвет грунта<input id="paintColor" type="color" value="#a99b81"></div><button id="clearPaint">Убрать цвет</button><div class="section"><h3>Материалы грунта</h3><select id="terrainLayer" style="width:100%"><option value="ground">Земля / щебень</option><option value="concrete">Бетон</option><option value="asphalt">Асфальт</option><option value="sand">Песок</option><option value="erase">Стереть материал</option></select><div class="field">Непрозрачность<input id="layerStrength" type="range" min="0" max="1" step=".05" value=".8"></div><button id="clearLayers">Очистить слои</button></div><div class="section"><h3>Дороги</h3><div class="field">Ширина, м<input id="roadWidth" type="number" min="1" max="80" value="7"></div><select id="roadSurface"><option value="asphalt">Асфальт</option><option value="ground">Грунт</option><option value="concrete">Бетон</option><option value="sand">Песок</option></select><div class="tools"><button id="finishRoad">Готово</button><button id="cancelRoad">Отмена</button></div><p class="hint">Выберите «Дорога», кликайте по земле, затем «Готово». Управляющие точки доступны в иерархии. Выравнивание рельефа — отдельно в инспекторе.</p></div><div class="section"><h3>Кисть декораций</h3><select id="scatterAsset" style="width:100%"><option value="">Выберите ресурс</option></select><div class="field">Объектов / штамп<input id="scatterCount" type="number" min="1" max="60" value="8"></div><div class="field">Масштаб от<input id="scatterMin" type="number" min=".05" max="20" step=".1" value=".7"></div><div class="field">Масштаб до<input id="scatterMax" type="number" min=".05" max="20" step=".1" value="1.3"></div><div class="field">Расстояние, м<input id="scatterSpacing" type="number" min=".1" value="2"></div><div class="field">Уклон, °<input id="scatterSlope" type="number" min="0" max="89" value="30"></div><div class="field">Seed<input id="scatterSeed" type="number" value="42"></div><div class="field">Детали<select id="scatterDetail"><option value="low">Все</option><option value="medium" selected>Medium+</option><option value="high">High</option></select></div><label><input type="checkbox" id="scatterShadow"> Тени</label><p class="hint">Кисть создаёт лёгкие декорации без физики. Ластик удаляет только объекты кисти выбранного ресурса.</p></div><p class="hint warn">Сетка M05: 4 м. Запечённые сооружения не следуют за рельефом автоматически.</p></div><div class="section" id="gameplayPanel"><h3>Игровой режим</h3><select id="gameMode"><option value="tdm">Командный дезматч</option><option value="conquest">Захват</option></select><div class="tools"><button id="addSpawn">+ Спавн</button><button id="addVehicle">+ Техника</button><button id="addCapture">+ Захват</button></div><p class="hint">Нажмите кнопку, затем кликните по грунту. Команда и направление — в инспекторе.</p></div><div class="section"><h3>Отображение</h3><label><input type="checkbox" id="collisions" checked> Коллизии</label><label><input type="checkbox" id="markers" checked> Точки и маршруты</label><label><input type="checkbox" id="wire"> Каркас</label><div class="section"><h3>Навигация пехоты</h3><button id="navBuild">Пересчитать сетку</button><label><input type="checkbox" id="navVisible" checked> Показать узлы</label><div class="tools"><button id="navPath">Проверить путь A → B</button><button id="navClear">Очистить</button></div><p id="navStatus" class="hint">Зелёный — стоя, жёлтый — пригнувшись, красный — препятствие. Сетка отражает выборочные проверки на высоте грунта.</p></div><div class="section"><h3>Освещение</h3><div id="lighting"></div></div><div class="section"><h3>Проверка карты</h3><div id="issues" class="hint">Нажмите «Проверить карту».</div></div></aside></main>
<div class="status"><span id="status">Инициализация…</span><span id="stats"></span></div>`;
const status=s=>$('status').textContent=s;
const api=async(path,options)=>{const r=await fetch('/__world-editor/'+path,options),j=await r.json();if(!r.ok)throw Error(j.error??r.statusText);return j;};
const safe=fn=>async(...a)=>{try{await fn(...a);}catch(e){status('Ошибка: '+e.message);console.error(e);}};
let data,revision,game,root,reference,models,helpers,terrainMeshes=[],boxMeshes=new Map(),selected=null,entries=new Map(),history=[],redo=[],dirty=false,mode='select',snap=false,dragStart=null,brushBefore=null,brushDown=false,lastStroke=0,activeQuality='high',previewAssets=new Map(),assetNames=new Map(),keys=new Set(),saving=false,brushSeed=0,brushLast=null,scatterTemplate=null,scatterLoading=false,roadDraft=[],draftLine=null,pointKind='spawn';
const canvas=$('canvas'),ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),v=new THREE.Vector3(),loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
let orbit,gizmo,brushRing,selectionBox,groupPivot,groupStart=null,clipboard=[],navWorker,navGroup,navPathGroup,navVersion=0,navReady=false,navStart=null;const multi=new Set();
const mapId=new URLSearchParams(location.search).get('map')??'quarry-m05',isM05=mapId==='quarry-m05',mapEndpoint=isM05?'map':'map/'+mapId;
let base=M05_EDITOR_BASE,grid=M05_GRID,baseHeights=M05_BASE_HEIGHTS,activeMap=QUARRY_M05,mapConfig=null;
const protectedNames=new Set(['gun_base','gun_top','fuel_truck','fuel_cab_door','fuel_axle_0','fuel_axle_1','fuel_axle_2','fuel_running_lights','repair_tool','coffee_cup','briefing_map','radio_handset','field_dressing','drive_panel','drive_panel_lid','drive_panel_lever']);
const routeColor={infantry:0x76d5fb,armor:0xf6ad63,exit:0x8be3a2,assault:0xeb7979,A:0xf6d96a,B:0xf6d96a,C:0xf6d96a};
const baseBox=id=>base.boxes.find(b=>b.id===id);
const modelBy=id=>data.models.find(m=>m.id===id);
const currentSite=id=>{const p=data.sites[id]??[base.sites[id].x,base.sites[id].y,base.sites[id].z];return isM05?p:[p[0],liveTerrain.heightAt(p[0],p[2]),p[2]];};
const terrain=()=>terrainWithEdits(grid,baseHeights,data.terrain);
let liveTerrain;
function changed(before){if(JSON.stringify(before)===JSON.stringify(data))return;history.push(before);if(history.length>60)history.shift();redo=[];dirty=true;invalidateNav();buttons();}
function buttons(){$('undo').disabled=!history.length;$('redo').disabled=!redo.length;$('save').textContent=dirty?'Сохранить *':'Сохранить';}
function edit(fn){const before=clone(data);fn();changed(before);}
function setTRS(node,m){node.position.fromArray(m.position);node.rotation.set(...m.rotation,'XYZ');node.scale.fromArray(m.scale);node.updateMatrixWorld(true);}
function clearGroup(group,dispose=false){for(const child of [...group.children]){child.removeFromParent();if(dispose)child.traverse(o=>{o.geometry?.dispose();if(o.material?.userData.editorOwned)o.material.dispose();});}}
function markerMaterial(color){const m=new THREE.MeshBasicMaterial({color,depthTest:false,transparent:true,opacity:.85});m.userData.editorOwned=true;return m;}
function marker(position,color){const mesh=new THREE.Mesh(new THREE.OctahedronGeometry(.8),markerMaterial(color));mesh.position.fromArray(position);mesh.renderOrder=50;return mesh;}
function wireBox(shape,color=0x76ea91){
 const g=new THREE.BoxGeometry(...shape.half.map(x=>2*x)),edges=new THREE.EdgesGeometry(g);g.dispose();
 const mat=new THREE.LineBasicMaterial({color,depthTest:false,transparent:true,opacity:.7});mat.userData.editorOwned=true;
 const o=new THREE.LineSegments(edges,mat),m=shape.matrix;
 o.matrix.set(m[0],m[1],m[2],shape.center.x,m[3],m[4],m[5],shape.center.y,m[6],m[7],m[8],shape.center.z,0,0,0,1);o.matrixAutoUpdate=false;o.renderOrder=60;return o;
}
function colliderShape(b){return b.obb??{center:{x:b.x,y:b.baseY+b.h/2,z:b.z},half:[b.w/2,b.h/2,b.d/2],matrix:[1,0,0,0,1,0,0,0,1]};}
function redrawHelpers(){
 clearGroup(helpers,true);
 for(const [key,entry] of [...entries])if(['site','route','road','gamepoint'].includes(entry.kind))entries.delete(key);
 const col=new THREE.Group(),pts=new THREE.Group();helpers.add(col,pts);
 col.visible=$('collisions').checked;pts.visible=$('markers').checked;
 for(const b of editableMapBoxes(base,data))if(!b.noCollision)col.add(wireBox(colliderShape(b),b.visualModel?0x738977:0x79d690));
 for(const id of Object.keys(base.sites)){const o=marker(currentSite(id),0xffd074);pts.add(o);entries.set('site:'+id,{kind:'site',id,name:id,node:o});}
 for(const [type,source] of [['routes',base.routes],['fuelRoutes',base.fuelRoutes]])for(const id of Object.keys(source)){
  const route=data[type][id]??source[id],positions=route.map(p=>type==='routes'?[p[0],p[2],p[1]]:[p[0],liveTerrain.heightAt(p[0],p[1]),p[1]]);
  const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(positions.map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color:routeColor[id]??0xffffff}));line.material.userData.editorOwned=true;pts.add(line);
  positions.forEach((p,i)=>{const o=marker(p,routeColor[id]??0xffffff);pts.add(o);entries.set(type+':'+id+':'+i,{kind:'route',id,index:i,type,name:id+' / '+(i+1),node:o});});
 }
 for(const r of data.roads??[]){const positions=sampleRoad(r.points).map(([x,z])=>new THREE.Vector3(x,liveTerrain.heightAt(x,z)+.15,z));const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(positions),new THREE.LineBasicMaterial({color:0x83c6ff,depthTest:false}));line.material.userData.editorOwned=true;pts.add(line);r.points.forEach(([x,z],i)=>{const o=marker([x,liveTerrain.heightAt(x,z)+.15,z],0x83c6ff);pts.add(o);entries.set('road:'+r.id+':'+i,{kind:'road',id:r.id,index:i,name:'Дорога '+r.id.slice(0,6)+' / '+(i+1),node:o});});}
 for(const p of data.gameplay?.items??[]){const color=p.kind==='capture'?0xffcf4b:p.team===0?0x66aaff:0xf07878;const o=marker([p.x,liveTerrain.heightAt(p.x,p.z)+.6,p.z],color);const direction=new THREE.Vector3(Math.sin(p.yaw),0,-Math.cos(p.yaw)),end=direction.multiplyScalar(p.kind==='vehicle'?4:2),mat=new THREE.LineBasicMaterial({color,depthTest:false});mat.userData.editorOwned=true;o.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),end]),mat));o.userData.gamepoint=true;pts.add(o);entries.set('gamepoint:'+p.id,{kind:'gamepoint',id:p.id,name:p.kind==='capture'?p.name:(p.kind==='spawn'?'Спавн':'Техника '+p.type)+' · '+(p.team+1),node:o});}
 if(selected&&!entries.has(selected))selected=null;
}
function list(){const query=$('search').value.toLowerCase(),filter=$('filter').value,t=$('tree');t.replaceChildren();
 for(const [key,e] of entries){if(filter==='all'&&e.kind==='reference'||filter!=='all'&&e.kind!==filter||!e.name.toLowerCase().includes(query))continue;
 const b=document.createElement('button');b.className='item'+(selected===key||multi.has(key)?' selected':'')+(e.locked?' locked':'');b.textContent=({model:'◆ ',box:'▣ ',site:'⚑ ',route:'• ',reference:'🔒 '}[e.kind]??'')+e.name+(e.kind==='model'&&modelBy(e.id)?.group?' ['+modelBy(e.id).group+']':'');b.onclick=ev=>select(key,ev.ctrlKey||ev.metaKey?'ctrl':ev.shiftKey?'shift':null);b.ondblclick=focus;t.append(b);}
}
function selectedModels(){return [...multi].filter(k=>entries.get(k)?.kind==='model');}
function select(key,modifier=null){
 const e=entries.get(key);
 if(modifier==='ctrl'&&e?.kind==='model'){if(multi.has(key))multi.delete(key);else multi.add(key);selected=[...multi].at(-1)??null;}
 else if(modifier==='shift'&&e?.kind==='model'&&modelBy(e.id).group){multi.clear();for(const m of data.models)if(m.group===modelBy(e.id).group)multi.add('model:'+m.id);selected=key;}
 else if(modifier==='keep'){for(const k of [...multi])if(!entries.has(k))multi.delete(k);selected=entries.has(key)?key:[...multi].at(-1)??null;}
 else{multi.clear();selected=key;if(e?.kind==='model')multi.add(key);}
 showSelection();
}
function showSelection(){
 gizmo.detach();selectionBox.visible=false;const chosen=selectedModels(),e=entries.get(selected);
 if(chosen.length>1){
  const center=new THREE.Vector3();for(const k of chosen)center.add(entries.get(k).node.position);
  groupPivot.position.copy(center.divideScalar(chosen.length));groupPivot.rotation.set(0,0,0);groupPivot.scale.setScalar(1);groupPivot.updateMatrixWorld(true);
  if(gizmo.mode==='scale')gizmo.setMode('translate');
  if(mode==='select')gizmo.attach(groupPivot);
  list();inspect();return;
 }
 if(e){
 if(!e.locked&&!e.node.userData.dressingRemoved&&mode==='select'){if(e.kind==='dressing'&&gizmo.mode==='scale')gizmo.setMode('translate');if(e.kind==='site'||e.kind==='route'||e.kind==='road'||e.kind==='gamepoint')gizmo.setMode('translate');gizmo.attach(e.node);}
 if(e.kind==='model'||e.kind==='box'||e.kind==='reference'||e.kind==='dressing'){selectionBox.setFromObject(e.node);selectionBox.visible=true;}
 }list();inspect();}
function focus(){const e=entries.get(selected);if(!e)return;const pos=e.node.getWorldPosition(new THREE.Vector3());const size=new THREE.Box3().setFromObject(e.node).getSize(new THREE.Vector3()).length();orbit.target.copy(pos);game.camera.position.copy(pos).add(new THREE.Vector3(1,.75,1).normalize().multiplyScalar(Math.max(5,size*1.6)));orbit.update();}
function storeTransform(e){
 const o=e.node,p=o.position.toArray(),r=[o.rotation.x,o.rotation.y,o.rotation.z];
 if(e.kind==='model'){const m=modelBy(e.id);m.position=p;m.rotation=r;m.scale=o.scale.toArray();}
 if(e.kind==='dressing'){const scale=THREE.MathUtils.clamp(o.scale.x,.05,20);(data.dressingBatches??={})[e.id]={position:p,rotation:r,scale,removed:false};applyDressingNodeEdit(o,data.dressingBatches[e.id]);}
 if(e.kind==='box'){const b=baseBox(e.id);data.boxes[e.id]={position:p,rotation:r,size:[b.w*Math.max(.001,o.scale.x),b.h*Math.max(.001,o.scale.y),b.d*Math.max(.001,o.scale.z)]};}
 if(e.kind==='gamepoint'){const q=data.gameplay.items.find(q=>q.id===e.id),limit=activeMap.size/2-2;q.x=THREE.MathUtils.clamp(p[0],-limit,limit);q.z=THREE.MathUtils.clamp(p[2],-limit,limit);}
 if(e.kind==='site'){if(!isM05){p[0]=THREE.MathUtils.clamp(p[0],-activeMap.size/2+2,activeMap.size/2-2);p[2]=THREE.MathUtils.clamp(p[2],-activeMap.size/2+2,activeMap.size/2-2);p[1]=liveTerrain.heightAt(p[0],p[2]);}data.sites[e.id]=p;}
 if(e.kind==='road'){const road=data.roads.find(r=>r.id===e.id);road.points[e.index]=[p[0],p[2]];refreshLayers();}
 if(e.kind==='route'){const route=clone(data[e.type][e.id]??base[e.type][e.id]);route[e.index]=e.type==='routes'?[p[0],p[2],p[1]]:[p[0],p[2]];data[e.type][e.id]=route;}
}
function field(parent,label,value,change,type='number',step='.1'){
 const row=document.createElement('div');row.className='field';const l=document.createElement('span');l.textContent=label;row.append(l);
 const input=document.createElement('input');input.type=type;input.step=step;if(type==='checkbox')input.checked=value;else input.value=value;
 input.onchange=safe(async()=>{const val=type==='checkbox'?input.checked:type==='number'?Number(input.value):input.value;if(type==='number'&&!Number.isFinite(val))throw Error('Некорректное число');await change(val);});row.append(input);parent.append(row);return input;
}
function groupFields(parent,label,values,change){const h=document.createElement('label');h.textContent=label;parent.append(h);const row=document.createElement('div');row.className='triplet';values.forEach((n,i)=>{const input=document.createElement('input');input.type='number';input.step='.1';input.value=Number(n.toFixed(4));input.title=['X','Y','Z'][i];input.onchange=safe(()=>{const value=Number(input.value);if(!Number.isFinite(value))throw Error('Некорректное число');change(i,value);});row.append(input);});parent.append(row);}
function action(parent,label,fn){const b=document.createElement('button');b.textContent=label;b.onclick=safe(fn);parent.append(b);return b;}
function inspect(){const panel=$('inspector');panel.replaceChildren();if(selectedModels().length>1){inspectGroup(panel);return;}const e=entries.get(selected);if(!e){panel.textContent='Выберите объект.';return;}
 const title=document.createElement('strong');title.textContent=e.name;panel.append(title);
 if(e.locked){const p=document.createElement('p');p.className='hint warn';p.textContent='Защищённый исходный объект. В этой версии его нельзя редактировать без рассогласования с оригинальной геометрией или сценарием.';panel.append(p);action(panel,'Фокус (F)',focus);return;}
 const o=e.node,apply=(property,i,value)=>{if(property==='scale'&&value<=0)throw Error('Масштаб должен быть положительным');const before=clone(data);o[property].setComponent?o[property].setComponent(i,value):o[property][['x','y','z'][i]]=value;storeTransform(e);changed(before);redrawHelpers();select(selected);};
 groupFields(panel,'Положение · X / Y / Z, м',o.position.toArray(),(i,n)=>apply('position',i,n));
 if(['box','model','dressing'].includes(e.kind)){
 groupFields(panel,'Поворот · X / Y / Z, °',[o.rotation.x*deg,o.rotation.y*deg,o.rotation.z*deg],(i,n)=>apply('rotation',i,n*rad));
 if(e.kind==='dressing')field(panel,'Масштаб ×',o.scale.x,n=>{if(n<.05||n>20)throw Error('Масштаб .05–20');edit(()=>{o.scale.setScalar(n);storeTransform(e);});redrawHelpers();select(selected);});else groupFields(panel,'Масштаб · X / Y / Z',o.scale.toArray(),(i,n)=>apply('scale',i,n));
 }
 const tools=document.createElement('div');tools.className='tools';panel.append(tools);
 action(tools,'Фокус',focus);
 action(tools,'На землю',()=>{const before=clone(data);let y=liveTerrain.heightAt(o.position.x,o.position.z);if(e.kind==='model'||e.kind==='box'){const bounds=new THREE.Box3().setFromObject(o);y+=o.position.y-bounds.min.y;}o.position.y=y;storeTransform(e);changed(before);redrawHelpers();select(selected);});
 if(e.kind==='model'||e.kind==='box')action(tools,'Удалить',removeSelected);
 if(e.kind==='dressing'){const p=document.createElement('p');p.className='hint warn';p.textContent='Запечённая группа 48 м. Перемещение, вращение и равномерный масштаб меняют всю группу и её коллизии. Отдельные меши пока не разделены.';panel.append(p);action(tools,o.userData.dressingRemoved?'Восстановить группу':'Скрыть и убрать коллизии',()=>{edit(()=>{const old=data.dressingBatches?.[e.id]??{position:dressingBatchPivot(e.id),rotation:[0,0,0],scale:1};(data.dressingBatches??={})[e.id]={...old,removed:!o.userData.dressingRemoved};});syncDressing();redrawHelpers();select(selected);});action(tools,'Сбросить изменения',()=>{edit(()=>{if(data.dressingBatches)delete data.dressingBatches[e.id];});syncDressing();redrawHelpers();select(selected);});return;}
 if(e.kind==='model'){
 const m=modelBy(e.id);
 action(tools,'Дублировать',duplicate);
 field(panel,'Имя',m.name,val=>{edit(()=>m.name=val);e.name=val;list();},'text');
 field(panel,'Тени',m.shadow,val=>{edit(()=>m.shadow=val);o.traverse(n=>{if(n.isMesh)n.castShadow=val;});},'checkbox');
 const l=document.createElement('label');l.textContent='Минимальный уровень деталей';const sel=document.createElement('select');for(const value of ['low','medium','high'])sel.add(new Option(value,value));sel.value=m.detail;sel.onchange=()=>{if(m.colliders.length&&sel.value!=='low'){sel.value=m.detail;status('Объект с коллизией должен отображаться на Low.');return;}edit(()=>m.detail=sel.value);};l.append(sel);panel.append(l);
 const h=document.createElement('h3');h.textContent='Коллизии (локальные XYZ)';panel.append(h);
 m.colliders.forEach((c,i)=>{const label=document.createElement('small');label.textContent='Box '+(i+1);panel.append(label);
 groupFields(panel,'Центр',c.center,(axis,val)=>{edit(()=>c.center[axis]=val);redrawHelpers();});
 groupFields(panel,'Размер',c.size,(axis,val)=>{if(val<=0)throw Error('Размер должен быть положительным');edit(()=>c.size[axis]=val);redrawHelpers();});
 groupFields(panel,'Поворот °',(c.rotation??[0,0,0]).map(n=>n*deg),(axis,val)=>{edit(()=>{c.rotation??=[0,0,0];c.rotation[axis]=val*rad;});redrawHelpers();});
 action(panel,'Удалить Box '+(i+1),()=>{edit(()=>m.colliders.splice(i,1));redrawHelpers();inspect();});});
 action(panel,'+ Box по габаритам',()=>{const child=o.children[0];child.updateMatrixWorld(true);const inv=o.matrixWorld.clone().invert(),bounds=new THREE.Box3();child.traverse(n=>{if(!n.isMesh)return;n.geometry.computeBoundingBox();const b=n.geometry.boundingBox,mat=inv.clone().multiply(n.matrixWorld);for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])bounds.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(mat));});if(bounds.isEmpty())throw Error('Пустая геометрия');edit(()=>{m.detail='low';m.colliders.push({center:bounds.getCenter(new THREE.Vector3()).toArray(),size:bounds.getSize(new THREE.Vector3()).toArray().map(n=>Math.max(.02,n))});});redrawHelpers();inspect();});
 action(panel,'+ Пустой Box',()=>{edit(()=>{m.detail='low';m.colliders.push({center:[0,.5,0],size:[1,1,1],rotation:[0,0,0]});});redrawHelpers();inspect();});
 materialInspector(panel,m,o);
 }
 if(e.kind==='gamepoint'){const q=data.gameplay.items.find(q=>q.id===e.id),refresh=()=>{redrawHelpers();select(selected);};if(q.kind!=='capture'){const sel=document.createElement('select');sel.add(new Option('Команда 1','0'));sel.add(new Option('Команда 2','1'));sel.value=q.team;sel.onchange=()=>{edit(()=>q.team=Number(sel.value));refresh();};panel.append(sel);field(panel,'Направление °',q.yaw*deg,val=>{edit(()=>q.yaw=val*rad);refresh();});}if(q.kind==='vehicle'){const sel=document.createElement('select');for(const [v,n] of [['tank','Танк'],['humvee','Хамви'],['atv','Квадроцикл']])sel.add(new Option(n,v));sel.value=q.type;sel.onchange=()=>{edit(()=>q.type=sel.value);refresh();};panel.append(sel);}if(q.kind==='capture')field(panel,'Название',q.name,val=>{edit(()=>q.name=val.slice(0,60));refresh();},'text');action(panel,'Удалить точку',()=>{edit(()=>data.gameplay.items=data.gameplay.items.filter(p=>p.id!==q.id));redrawHelpers();select(null);});return;}
 if(e.kind==='road'){const road=data.roads.find(r=>r.id===e.id);field(panel,'Ширина, м',road.width,val=>{if(val<1||val>80)throw Error('Ширина от 1 до 80 м');edit(()=>road.width=val);refreshLayers();});const chooser=document.createElement('select');for(const layer of ['asphalt','ground','concrete','sand'])chooser.add(new Option(layer,layer));chooser.value=road.layer;chooser.onchange=()=>{edit(()=>road.layer=chooser.value);refreshLayers();};panel.append(chooser);action(panel,'Выровнять грунт под дорогой',()=>{edit(()=>data.terrain=gradeRoad(grid,baseHeights,data.terrain,road));refreshTerrain();redrawHelpers();select(selected);});action(panel,'+ Точка после',()=>{const a=road.points[e.index],b=road.points[e.index+1]??road.points[e.index-1],p=a.map((v,i)=>e.index===road.points.length-1?v+(v-b[i])*.5:(v+b[i])*.5);edit(()=>road.points.splice(e.index+1,0,p));refreshLayers();redrawHelpers();select('road:'+road.id+':'+(e.index+1));});action(panel,'Удалить точку',()=>{if(road.points.length<=2)throw Error('Минимум 2 точки');edit(()=>road.points.splice(e.index,1));refreshLayers();redrawHelpers();select('road:'+road.id+':'+Math.min(e.index,road.points.length-1));});action(panel,'Удалить дорогу',()=>{edit(()=>data.roads=data.roads.filter(r=>r.id!==road.id));selected=null;refreshLayers();redrawHelpers();select(null);});}
 if(e.kind==='route'){action(tools,'+ Точка после',()=>{const r=clone(data[e.type][e.id]??base[e.type][e.id]),a=r[e.index],b=r[e.index+1]??r[e.index-1];const next=a.map((v,i)=>e.index===r.length-1?v+(v-b[i])*.5:(v+b[i])*.5);edit(()=>{r.splice(e.index+1,0,next);data[e.type][e.id]=r;});redrawHelpers();select(e.type+':'+e.id+':'+(e.index+1));});action(tools,'Удалить точку',()=>{const r=clone(data[e.type][e.id]??base[e.type][e.id]);if(r.length<=2)throw Error('Минимум две точки');edit(()=>{r.splice(e.index,1);data[e.type][e.id]=r;});redrawHelpers();select(e.type+':'+e.id+':'+Math.min(e.index,r.length-1));});}
 if(e.kind==='site'||e.kind==='route'){const p=document.createElement('p');p.className='hint warn';p.textContent='Связанные сценарные анимации и запечённые объекты могут требовать ручной проверки. Маршрут не перестраивает дорогу.';panel.append(p);}
}
function inspectGroup(panel){const chosen=selectedModels(),title=document.createElement('strong');title.textContent='Выбрано моделей: '+chosen.length;panel.append(title);const p=document.createElement('p');p.className='hint';p.textContent='W/E перемещают и вращают группу вокруг её центра. Для масштаба используйте числовой коэффициент ниже.';panel.append(p);const tools=document.createElement('div');tools.className='tools';panel.append(tools);action(tools,'Дублировать',duplicate);action(tools,'Удалить',removeSelected);action(tools,'Группа',assignGroup);action(tools,'Разгруппировать',clearGroupName);action(tools,'На землю',()=>{edit(()=>{for(const k of chosen){const e=entries.get(k),o=e.node,b=new THREE.Box3().setFromObject(o);o.position.y+=liveTerrain.heightAt(o.position.x,o.position.z)-b.min.y;storeTransform(e);}});redrawHelpers();select(selected,'keep');});field(panel,'Масштаб ×',1,factor=>{if(factor<=0||factor>100)throw Error('Масштаб должен быть положительным');const center=groupPivot.position.clone();if(chosen.some(k=>entries.get(k).node.scale.toArray().some(n=>n*factor<.001||n*factor>100)))throw Error('Масштаб выходит за допустимый диапазон');edit(()=>{for(const k of chosen){const e=entries.get(k);e.node.position.sub(center).multiplyScalar(factor).add(center);e.node.scale.multiplyScalar(factor);storeTransform(e);}});redrawHelpers();select(selected,'keep');});}
function assignGroup(){const chosen=selectedModels();if(!chosen.length)return;const name=prompt('Название группы','Группа');if(!name?.trim())return;edit(()=>{for(const k of chosen)modelBy(entries.get(k).id).group=name.trim().slice(0,100);});select(selected,'keep');}
function clearGroupName(){edit(()=>{for(const k of selectedModels())delete modelBy(entries.get(k).id).group;});select(selected,'keep');}
async function source(asset){if(!previewAssets.has(asset))previewAssets.set(asset,loader.loadAsync('/world-editor-assets/'+asset).then(g=>g.scene).catch(e=>{previewAssets.delete(asset);throw e;}));return previewAssets.get(asset);}

const materialSelections=new Map();
function materialInspector(panel,m,o){
 const slots=materialSlots(o);if(!slots.length)return;
 const h=document.createElement('h3');h.textContent='PBR-материалы';panel.append(h);
 const chooser=document.createElement('select');chooser.style.width='100%';for(const s of slots)chooser.add(new Option((s.node.name||'Mesh')+' · '+(s.material.name||'Material')+' ['+s.key+']',s.key));
 chooser.value=slots.some(s=>s.key===materialSelections.get(m.id))?materialSelections.get(m.id):slots[0].key;
 chooser.onchange=()=>{materialSelections.set(m.id,chooser.value);inspect();};panel.append(chooser);
 const slot=slots.find(s=>s.key===chooser.value),mat=slot.material,values=m.materials?.[slot.key]??{};
 const patch=async(k,value)=>{edit(()=>{m.materials??={};(m.materials[slot.key]??={})[k]=value;});await rebuildModel(m);select('model:'+m.id);};
 for(const [k,label,type,defaultValue,step] of [
 ['color','Цвет','color',mat.color?'#'+mat.color.getHexString():'#ffffff'],
 ['roughness','Шероховатость','number',mat.roughness??1,'.05'],['metalness','Металл','number',mat.metalness??0,'.05'],
 ['emissive','Свечение','color',mat.emissive?'#'+mat.emissive.getHexString():'#000000'],
 ['emissiveIntensity','Сила свечения','number',mat.emissiveIntensity??1,'.1'],
 ['normalStrength','Normal','number',mat.normalScale?.x??1,'.1'],['aoMapIntensity','AO','number',mat.aoMapIntensity??1,'.1'],
 ['opacity','Прозрачность','number',mat.opacity??1,'.05'],['alphaTest','Alpha test','number',mat.alphaTest??0,'.05'],
 ['doubleSide','Две стороны','checkbox',mat.side===THREE.DoubleSide]
 ]){if(k==='normalStrength'&&!mat.normalScale||k!=='normalStrength'&&k!=='doubleSide'&&!(k in mat))continue;field(panel,label,values[k]??defaultValue,val=>patch(k,val),type,step);}
 action(panel,'Сбросить материал',async()=>{edit(()=>{if(m.materials)delete m.materials[slot.key];});await rebuildModel(m);select('model:'+m.id);});
 const p=document.createElement('p');p.className='hint';p.textContent='Настройки применяются к выбранному экземпляру, исходный GLB и другие экземпляры не меняются.';panel.append(p);
}
async function rebuildModel(m){const old=entries.get('model:'+m.id)?.node;if(old){gizmo.detach();releaseEditorMaterials(old);old.removeFromParent();}await addModelNode(m);}

function makeModelNode(m,original){const node=new THREE.Group();node.name=m.id;node.add(original.clone(true));applyEditorMaterials(node,m.materials);setTRS(node,m);node.traverse(o=>{if(o.isMesh){o.castShadow=m.shadow;o.receiveShadow=true;}});models.add(node);entries.set('model:'+m.id,{kind:'model',id:m.id,name:m.name,node});return node;}
async function addModelNode(m){return makeModelNode(m,await source(m.asset));}
async function syncModels(){for(const [key,e] of entries)if(e.kind==='model')entries.delete(key);releaseEditorMaterials(models);clearGroup(models);await Promise.all(data.models.map(addModelNode));assetList();}
function syncBoxes(){
 for(const b of base.boxes){const mesh=boxMeshes.get(b.id);if(!mesh)continue;const e=editableBox(b)?data.boxes[b.id]:null;mesh.visible=!e?.removed;mesh.position.set(b.x,b.baseY+b.h/2,b.z);mesh.rotation.set(0,0,0);mesh.scale.set(1,1,1);
 if(e&&!e.removed){mesh.position.fromArray(e.position);mesh.rotation.set(...e.rotation,'XYZ');mesh.scale.set(e.size[0]/b.w,e.size[1]/b.h,e.size[2]/b.d);}
 if(editableBox(b)){if(e?.removed)entries.delete('box:'+b.id);else entries.set('box:'+b.id,{kind:'box',id:b.id,name:b.id,node:mesh});} }
}
function refreshLayers(region=null){const prepared=prepareTerrainLayers(data.layers,data.roads);for(const tile of terrainMeshes){if(region&&(Math.abs(tile.position.x-region.x)>64+region.radius+12||Math.abs(tile.position.z-region.z)>64+region.radius+12))continue;applyTerrainLayers(game,tile,prepared);}game.staticMaterialRevision++;}
function refreshTerrain(region=null){
 liveTerrain=terrain();const paints=data.paint;
 const sand=new THREE.Color('#f0dfc3'),stone=new THREE.Color('#a9957e'),roadColor=new THREE.Color('#b2a794'),color=new THREE.Color(),patches=[...activeMap.surfacePatches.slice(0,activeMap.surfacePatches.length-(initialPaintCount||0)),...paints].map(([x,z,w,d,yaw,tint])=>({x,z,w,d,c:Math.cos(yaw),s:Math.sin(yaw),color:new THREE.Color(tint),radius:Math.max(w,d)}));
 for(const mesh of terrainMeshes){const geo=mesh.geometry,p=geo.attributes.position,n=geo.attributes.normal,c=geo.attributes.color,tx=mesh.position.x,tz=mesh.position.z,coarse=p.count===289;
 if(region&&(Math.abs(tx-region.x)>64+region.radius+12||Math.abs(tz-region.z)>64+region.radius+12))continue;
 const near=activeMap.roads.filter(r=>Math.hypot(r.x-tx,r.z-tz)<r.d/2+96),local=patches.filter(p=>Math.hypot(p.x-tx,p.z-tz)<p.radius*1.15+96);
 for(let i=0;i<p.count;i++){const x=tx+p.getX(i),z=tz+p.getZ(i);let y=liveTerrain.heightAt(x,z);if(!coarse&&Math.abs(x)===384&&z%8!==0)y=(liveTerrain.heightAt(x,z-4)+liveTerrain.heightAt(x,z+4))*.5;if(!coarse&&Math.abs(z)===384&&x%8!==0)y=(liveTerrain.heightAt(x-4,z)+liveTerrain.heightAt(x+4,z))*.5;p.setY(i,y);
 const dx=liveTerrain.heightAt(x+1,z)-liveTerrain.heightAt(x-1,z),dz=liveTerrain.heightAt(x,z+1)-liveTerrain.heightAt(x,z-1),nl=Math.hypot(dx,2,dz);n.setXYZ(i,-dx/nl,2/nl,-dz/nl);
 const cliff=Math.min(1,Math.hypot(dx,dz)*.55);color.copy(sand).lerp(stone,cliff*.72);
 for(const a of local){const xx=x-a.x,zz=z-a.z,dist=Math.hypot((xx*a.c-zz*a.s)/a.w,(xx*a.s+zz*a.c)/a.d),edge=Math.max(0,Math.min(1,(1.07-dist+Math.sin(x*.8+z*.65)*.07)*2.6));if(edge>0)color.lerp(a.color,edge*.52);}
 for(const r of near){const xx=x-r.x,zz=z-r.z,cs=Math.cos(r.yaw),sn=Math.sin(r.yaw),across=Math.abs(xx*cs-zz*sn),along=Math.abs(xx*sn+zz*cs);if(along<r.d/2+2&&across<r.w/2+2)color.lerp(roadColor,Math.min(.53,(r.w/2+2-across)*.19));}
 color.multiplyScalar(1+Math.sin(x*1.43+z*.704)*Math.cos(z*.93)*.047+Math.sin(y*2.35+Math.sin(z*.083)+x*.023)*.065*cliff+.028*Math.sin(x*.14+z*.057));c.setXYZ(i,color.r,color.g,color.b);
 }p.needsUpdate=n.needsUpdate=c.needsUpdate=true;geo.computeBoundingBox();geo.computeBoundingSphere();}
 refreshLayers(region);game.cachedShadows.invalidate(true);
}
let initialPaintCount=0;
function lighting(){const d=data.lighting;game.scene.fog.color.set(d.fogColor??activeMap.fogColor);game.scene.fog.density=d.fogDensity??activeMap.fogDensity;game.sun.color.set(d.sunColor??activeMap.sunColor);game.sun.intensity=d.sunIntensity??activeMap.sunIntensity??3.5;game.hemiLight.intensity=d.hemisphereLightIntensity??activeMap.hemisphereLightIntensity??2;game.ambientLight.intensity=d.ambientLightIntensity??activeMap.ambientLightIntensity??.2;game.renderer.toneMappingExposure=d.toneMappingExposure??activeMap.toneMappingExposure??1.06;}
function lightingFields(){const p=$('lighting');p.replaceChildren();for(const [id,label,type,def,step] of [['sunColor','Солнце','color','#ffe0a9'],['sunIntensity','Интенсивность','number',3.5,'.1'],['fogColor','Туман','color','#c3a483'],['fogDensity','Плотность','number',.00132,'.0001'],['hemisphereLightIntensity','Небо','number',2,'.1'],['ambientLightIntensity','Ambient','number',.2,'.05'],['toneMappingExposure','Экспозиция','number',1.06,'.05']])field(p,label,data.lighting[id]??activeMap[id]??def,val=>{edit(()=>data.lighting[id]=val);lighting();},type,step);}
function syncDressing(){for(const e of entries.values())if(e.kind==='dressing')applyDressingNodeEdit(e.node,data.dressingBatches?.[e.id]);}
async function syncAll(){gizmo.detach();syncDressing();$('gameMode').value=data.gameplay?.mode??'tdm';refreshTerrain();syncBoxes();await syncModels();redrawHelpers();lighting();lightingFields();select(entries.has(selected)?selected:null,'keep');buttons();}
async function undo(){invalidateNav();if(!history.length)return;redo.push(clone(data));data=history.pop();dirty=true;await syncAll();}
async function redoEdit(){invalidateNav();if(!redo.length)return;history.push(clone(data));data=redo.pop();dirty=true;await syncAll();}
async function removeSelected(){const e=entries.get(selected),ids=new Set(selectedModels().map(k=>entries.get(k).id));if(!e||e.locked||!['model','box'].includes(e.kind))return;edit(()=>{if(e.kind==='model')data.models=data.models.filter(m=>!ids.has(m.id));else data.boxes[e.id]={removed:true};});multi.clear();selected=null;await syncAll();}
function copyModels(){clipboard=selectedModels().map(k=>clone(modelBy(entries.get(k).id)));status('Скопировано моделей: '+clipboard.length);}
async function pasteModels(){if(!clipboard.length)return;if(data.models.length+clipboard.length>4000)throw Error('Лимит 4000 объектов');const copies=clipboard.map(m=>({...clone(m),id:crypto.randomUUID(),name:(m.name+' (копия)').slice(0,200),position:[m.position[0]+2,m.position[1],m.position[2]]}));edit(()=>data.models.push(...copies));await Promise.all(copies.map(addModelNode));multi.clear();for(const m of copies)multi.add('model:'+m.id);redrawHelpers();select('model:'+copies.at(-1).id,'keep');}
async function duplicate(){copyModels();await pasteModels();}
function groundHit(event){const rect=canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,game.camera);return ray.intersectObjects(terrainMeshes,false)[0]?.point;}
async function placeAsset(asset,name,position){const original=await source(asset);const b=new THREE.Box3().setFromObject(original),p=position??orbit.target.clone();const ground=liveTerrain.heightAt(p.x,p.z);if(!Number.isFinite(ground)||b.isEmpty())throw Error('Модель пустая или вне карты');p.y=ground-b.min.y;const m={id:crypto.randomUUID(),name,asset,position:p.toArray(),rotation:[0,0,0],scale:[1,1,1],colliders:[],detail:'low',shadow:true};edit(()=>data.models.push(m));await addModelNode(m);redrawHelpers();select('model:'+m.id);}

function assetList(){
 for(const [asset,meta] of Object.entries(data.assets??{}))assetNames.set(asset,meta.name);
 for(const m of data.models)if(!assetNames.has(m.asset))assetNames.set(m.asset,m.name);
 const div=$('assets'),sel=$('scatterAsset'),prev=sel.value,q=$('assetSearch').value.toLowerCase();div.replaceChildren();sel.replaceChildren(new Option('Выберите ресурс',''));
 for(const [asset,name] of assetNames){
   sel.add(new Option(name,asset));if(!name.toLowerCase().includes(q))continue;
   const row=document.createElement('div');row.className='asset';action(row,name,()=>placeAsset(asset,name));action(row,'Кисть',async()=>{sel.value=asset;await prepareScatter();setMode('scatter');});div.append(row);
 }
 if(assetNames.has(prev))sel.value=prev;
}
async function prepareScatter(){const asset=$('scatterAsset').value;scatterTemplate=null;scatterLoading=true;try{if(asset){const original=await source(asset);if($('scatterAsset').value===asset){const bounds=new THREE.Box3().setFromObject(original);if(bounds.isEmpty())throw Error('Пустая модель');scatterTemplate={asset,original,bounds};}}}finally{scatterLoading=false;}}
function stampScatter(p,radius){
 const asset=$('scatterAsset').value;if(!asset||scatterLoading||!scatterTemplate||scatterTemplate.asset!==asset){status('Выберите ресурс для кисти');return;}
 if(brushLast&&brushLast.distanceTo(p)<Math.max(1,radius*.35))return;brushLast=p.clone();
 const read=(id,def,lo,hi)=>Math.max(lo,Math.min(hi,$(id).value.trim()===''||!Number.isFinite(Number($(id).value))?def:Number($(id).value)));
 const minScale=read('scatterMin',.7,.05,20),maxScale=Math.max(minScale,read('scatterMax',1.3,.05,20));
 const out=scatterPositions({x:p.x,z:p.z,radius,count:Math.min(4000-data.models.length,Math.round(read('scatterCount',8,1,60))),seed:(Number($('scatterSeed').value)||0)+brushSeed++,minScale,maxScale,minSpacing:read('scatterSpacing',2,.1,100),maxSlope:read('scatterSlope',30,0,89)*rad,existing:data.models.map(m=>m.position),heightAt:liveTerrain.heightAt});
 for(const q of out){const m={id:crypto.randomUUID(),name:assetNames.get(asset)??'Декорация',asset,position:[q.position[0],q.position[1]-scatterTemplate.bounds.min.y*q.scale,q.position[2]],rotation:[0,q.yaw,0],scale:[q.scale,q.scale,q.scale],colliders:[],detail:$('scatterDetail').value,shadow:$('scatterShadow').checked,scatter:true};data.models.push(m);makeModelNode(m,scatterTemplate.original);}
 status('Кисть: '+out.length+' объектов');
}
function eraseScatter(p,radius){const asset=$('scatterAsset').value;if(!asset)return;const gone=new Set(data.models.filter(m=>m.scatter&&m.asset===asset&&Math.hypot(m.position[0]-p.x,m.position[2]-p.z)<=radius).map(m=>m.id));
 if(!gone.size)return;data.models=data.models.filter(m=>!gone.has(m.id));for(const id of gone){const key='model:'+id,o=entries.get(key)?.node;if(o){releaseEditorMaterials(o);o.removeFromParent();}entries.delete(key);if(selected===key)selected=null;}
}
function allIssues(){const issues=inspectM05Edits(base,grid,baseHeights,data);if(!isM05)issues.push(...validateGameplay(data.gameplay,activeMap.size).map(message=>({level:'error',message})));return issues;}
function showIssues(){const issues=allIssues(),p=$('issues');p.replaceChildren();if(!issues.length){p.textContent='Ошибок и предупреждений не найдено.';return;}
 const heading=document.createElement('p');heading.textContent=issues.filter(i=>i.level==='error').length+' ошибок / '+issues.filter(i=>i.level==='warning').length+' предупреждений';p.append(heading);
 for(const i of issues){const b=document.createElement('button');b.className='item '+(i.level==='warning'?'warn':'error');b.title=i.message;b.textContent=i.message;b.disabled=!i.key||!entries.has(i.key);b.onclick=()=>{select(i.key);focus();};p.append(b);}
 status('Проверка карты завершена: '+issues.length+' замечаний');
}

async function importFiles(files,position){
 const all=[...files],model=all.find(f=>/\.(glb|gltf|fbx|obj)$/i.test(f.name));if(!model)throw Error('Выберите модель');status('Импорт: '+model.name);
 let blob;
 if(/\.glb$/i.test(model.name)){blob=model;}
 else{
 const manager=new THREE.LoadingManager(),urls=new Map(all.map(f=>[f.name.toLowerCase(),URL.createObjectURL(f)]));let scene;
 try{
 manager.setURLModifier(url=>{if(url.startsWith('data:')||url.startsWith('blob:'))return url;const name=decodeURIComponent(url.split(/[\\/]/).pop()).toLowerCase();if(!urls.has(name))throw Error('Не найден связанный ресурс: '+name);return urls.get(name);});
 if(/\.gltf$/i.test(model.name)){const gltf=new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);scene=(await gltf.parseAsync(await model.text(),'')).scene;}
 else if(/\.fbx$/i.test(model.name))scene=new FBXLoader(manager).parse(await model.arrayBuffer(),'');
 else {const obj=new OBJLoader(manager),mtl=all.find(f=>/\.mtl$/i.test(f.name));if(mtl){const mats=new MTLLoader(manager).parse(await mtl.text(),'');mats.preload();obj.setMaterials(mats);}scene=obj.parse(await model.text());}
 await Promise.all([...new Set((()=>{const images=[];scene.traverse(n=>{if(n.isMesh)for(const m of [n.material].flat())for(const value of Object.values(m))if(value?.isTexture&&value.image instanceof HTMLImageElement)images.push(value.image);});return images;})())].map(img=>img.decode()));
 const out=await new GLTFExporter().parseAsync(scene,{binary:true,onlyVisible:false});blob=new Blob([out],{type:'application/octet-stream'});
 }finally{for(const u of urls.values())URL.revokeObjectURL(u);}
 }
 const result=await api('asset',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:blob});assetNames.set(result.asset,model.name);edit(()=>{data.assets??={};data.assets[result.asset]={name:model.name};});assetList();await placeAsset(result.asset,model.name,position);status('Импортировано: '+model.name+' · '+Math.round(result.bytes/1024)+' КБ');
}
async function save(){if(saving)return;const issues=allIssues(),errors=issues.filter(i=>i.level==='error');if(errors.length){showIssues();throw Error(errors.slice(0,6).map(i=>i.message).join('; '));}saving=true;try{const snapshot=clone(data),r=await api(mapEndpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:snapshot,revision})});revision=r.revision;dirty=JSON.stringify(snapshot)!==JSON.stringify(data);buttons();status('Сохранено в проект. Резервная копия создана.');}finally{saving=false;}}
function download(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download=mapId+'-editor-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function updateRoadDraft(){if(draftLine){draftLine.removeFromParent();draftLine.geometry.dispose();draftLine.material.dispose();draftLine=null;}if(roadDraft.length){const points=roadDraft.length>1?sampleRoad(roadDraft):roadDraft;draftLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(([x,z])=>new THREE.Vector3(x,liveTerrain.heightAt(x,z)+.5,z))),new THREE.LineBasicMaterial({color:0xffda67,depthTest:false}));game.scene.add(draftLine);}status('Дорога: '+roadDraft.length+' точек');}
function finishRoad(){if(roadDraft.length<2)throw Error('Нужно хотя бы две точки');const width=Number($('roadWidth').value);if(!Number.isFinite(width)||width<1||width>80)throw Error('Ширина от 1 до 80 м');const road={id:crypto.randomUUID(),width,layer:$('roadSurface').value,points:clone(roadDraft)};edit(()=>{(data.roads??=[]).push(road);});roadDraft=[];updateRoadDraft();refreshLayers();redrawHelpers();setMode('select');select('road:'+road.id+':0');}
function heightOptions(){const min=Number($('heightMin').value),max=Number($('heightMax').value);if(!Number.isFinite(min)||!Number.isFinite(max)||min< -80||max>180||min>=max)throw Error('Высоты: от −80 до 180 м, минимум ниже максимума');return {...heightmapRegion(grid,isM05?undefined:activeMap.size),min,max};}
async function readHeightmap(file){if(!file)return;const options=heightOptions();let image;if(/\.pgm$/i.test(file.name))image=decodePGM(new Uint8Array(await file.arrayBuffer()));else{const bitmap=await createImageBitmap(file);try{const width=Math.min(2048,bitmap.width),height=Math.min(2048,bitmap.height),c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,width,height);const rgba=ctx.getImageData(0,0,width,height).data,values=new Float32Array(width*height);for(let i=0;i<values.length;i++)values[i]=(.2126*rgba[i*4]+.7152*rgba[i*4+1]+.0722*rgba[i*4+2])/255;image={width,height,values};}finally{bitmap.close();}}if(!confirm('Заменить рельеф выбранной области? Действие можно отменить Ctrl+Z.'))return;const next=importHeightmap(grid,baseHeights,data.terrain,image,options);edit(()=>data.terrain=next);refreshTerrain();redrawHelpers();select(selected,'keep');status('Heightmap импортирована');}
function exportHeightmap(){const bytes=encodeHeightmap(grid,baseHeights,data.terrain,heightOptions()),url=URL.createObjectURL(new Blob([bytes],{type:'image/x-portable-graymap'})),a=document.createElement('a');a.href=url;a.download=mapId+'-heightmap.pgm';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function gameplay(){return data.gameplay??={mode:'tdm',items:[]};}
function addGameplayPoint(p){const limit=activeMap.size/2-2;if(Math.abs(p.x)>limit||Math.abs(p.z)>limit){status('Точка вне игровой зоны');return;}const q={id:'ep-'+crypto.randomUUID().replaceAll('-','').slice(0,16),kind:pointKind,x:p.x,z:p.z,yaw:0,team:p.x<0?0:1};if(pointKind==='vehicle')q.type='humvee';if(pointKind==='capture')q.name='Точка '+(gameplay().items.filter(q=>q.kind==='capture').length+1);edit(()=>gameplay().items.push(q));redrawHelpers();setMode('select');select('gamepoint:'+q.id);}
function clearNavigation(){navVersion++;navReady=false;navStart=null;if(navWorker){navWorker.terminate();navWorker=null;}if(navGroup)clearGroup(navGroup,true);if(navPathGroup)clearGroup(navPathGroup,true);$('navStatus').textContent='Навигация не рассчитана.';}
function invalidateNav(){if(!navReady&&!navWorker)return;clearNavigation();$('navStatus').textContent='Карта изменена. Пересчитайте навигацию.';}
function buildNavigation(){clearNavigation();const id=navVersion;navWorker=new Worker(new URL('./navigation-worker.js',import.meta.url),{type:'module'});$('navStatus').textContent='Расчёт на основе игровой физики…';navWorker.onerror=ev=>{if(id!==navVersion)return;clearNavigation();$('navStatus').textContent='Ошибка расчёта: '+ev.message;};navWorker.onmessage=({data:r})=>{if(r.id!==navVersion)return;if(r.error){$('navStatus').textContent='Ошибка: '+r.error;return;}if(r.type==='grid'){clearGroup(navGroup,true);for(const [i,p] of r.positions.entries()){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));const m=new THREE.PointsMaterial({color:[0x52dc83,0xffc34e,0xf05d5d][i],size:Math.min(1.3,r.cell*.35),transparent:true,opacity:.72,depthWrite:false});m.userData.editorOwned=true;navGroup.add(new THREE.Points(g,m));}navGroup.visible=$('navVisible').checked;navReady=true;$('navStatus').textContent='Стоя '+r.counts[0]+' · присев '+r.counts[1]+' · закрыто '+r.counts[2];}else if(r.type==='path'){clearGroup(navPathGroup,true);const points=r.path.map(p=>new THREE.Vector3(...p)),mat=new THREE.LineBasicMaterial({color:r.reached?0x58ff9a:0xff9e4f,depthTest:false});mat.userData.editorOwned=true;const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),mat);line.renderOrder=70;navPathGroup.add(line,marker(r.path[0],0x62b9ff),marker(r.path.at(-1),r.reached?0x58ff9a:0xff9e4f));$('navStatus').textContent=r.reached?'Путь до цели найден.':'Путь неполный или недоступен в пределах лимита поиска.';}};navWorker.postMessage({id,type:'grid',edits:clone(data),config:mapConfig});}
function pathClick(p){if(!navReady)return;if(!navStart){navStart=p.toArray();clearGroup(navPathGroup,true);navPathGroup.add(marker(navStart,0x62b9ff));$('navStatus').textContent='Укажите конечную точку B.';return;}const start=navStart;navStart=null;navWorker.postMessage({id:navVersion,type:'path',start,goal:p.toArray()});$('navStatus').textContent='Поиск пути…';setMode('select');}
function setMode(next){mode=next;for(const [id,m] of [['selectMode','select'],['brushMode','brush'],['paintMode','paint'],['layerMode','layer'],['roadMode','road'],['scatterMode','scatter'],['eraseMode','erase']])$(id).classList.toggle('active',m===mode);gizmo.detach();if(mode==='select'&&selected)select(selected,'keep');brushRing.visible=false;}
function sculptAt(p){const radius=Math.max(4,Math.min(150,Number($('radius').value)||16)),strength=Math.max(.01,Math.min(5,Number($('strength').value)||1));if(mode==='scatter'){stampScatter(p,radius);return;}if(mode==='erase'){eraseScatter(p,radius);return;}if(mode==='layer'){(data.layers??=[]).push({layer:$('terrainLayer').value,x:p.x,z:p.z,radius,strength:Number($('layerStrength').value),hardness:Number($('hardness').value)});refreshLayers({x:p.x,z:p.z,radius});return;}if(mode==='paint'){data.paint.push([p.x,p.z,radius,radius,0,$('paintColor').value]);}else data.terrain=applySculpt(grid,baseHeights,data.terrain,{x:p.x,z:p.z,radius,strength,mode:$('brush').value,target:Number($('target').value)||0,hardness:Number($('hardness').value)});refreshTerrain({x:p.x,z:p.z,radius:radius*(mode==='paint'?1.2:1)});}
function pick(e){const rect=canvas.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,game.camera);
 const visible= [...entries.entries()].filter(([,e])=>e.node.visible&&((e.kind!=='site'&&e.kind!=='route'&&e.kind!=='road'&&e.kind!=='gamepoint')||$('markers').checked));const nodes=visible.map(([,e])=>e.node),hits=ray.intersectObjects(nodes,true);for(const hit of hits){let n=hit.object;while(n){const entry=visible.find(([,e])=>e.node===n);if(entry){select(entry[0],e.ctrlKey||e.metaKey?'ctrl':e.shiftKey?'shift':null);return;}n=n.parent;}}select(null);}
function configureQuality(){activeQuality=$('quality').value;game.quality=baseGraphicsQuality(activeQuality);game.graphicsEffects=graphicsEffects(activeQuality);game.geometryQuality=geometryQuality(activeQuality);game.configureEffects();game.applyQuality(game.quality!=='high');game.postPass.setImage(game.graphicsEffects,gradeParameters(game.graphicsEffects,game.map));game.refreshSurfaceEnhancements();lighting();}
function tick(t){requestAnimationFrame(tick);if(!game||!root)return;const dt=Math.min(.05,(t-(tick.last??t))/1000);tick.last=t;game.clock+=dt;
 if(keys.has('rightMouse')){const speed=(keys.has('ShiftLeft')?55:15)*dt,dir=new THREE.Vector3();game.camera.getWorldDirection(dir);const side=new THREE.Vector3().crossVectors(dir,game.camera.up).normalize(),step=new THREE.Vector3();if(keys.has('KeyW'))step.add(dir);if(keys.has('KeyS'))step.sub(dir);if(keys.has('KeyA'))step.sub(side);if(keys.has('KeyD'))step.add(side);if(keys.has('Space'))step.y++;if(keys.has('ControlLeft'))step.y--;if(step.lengthSq()){step.normalize().multiplyScalar(speed);game.camera.position.add(step);orbit.target.add(step);}}
 orbit.update();game.updateSunShadow(game.camera.position.x,game.camera.position.z);
 for(const m of data.models){const o=entries.get('model:'+m.id)?.node;if(o)o.visible=m.detail==='low'||m.detail==='medium'&&game.geometryQuality!=='low'||m.detail==='high'&&game.geometryQuality==='high';}
 reference.getObjectByName('quarry-set-dressing')?.children.forEach(o=>{if(o.name.startsWith('m05_detail_'))o.visible=!o.userData.dressingRemoved&&game.geometryQuality!=='low'&&o.position.distanceToSquared(game.camera.position)<(game.geometryQuality==='high'?192:112)**2;});
 if(selectionBox.visible&&entries.has(selected))selectionBox.setFromObject(entries.get(selected).node);
 try{game.drawScene();}catch(e){$('fatal').classList.remove('hidden');$('fatal').textContent='Ошибка рендера: '+e.stack;root=null;return;}
 if(t-(tick.stats??0)>400){tick.stats=t;const info=game.renderer.info.render;$('stats').textContent='Draw calls: '+info.calls+' | Треугольники: '+info.triangles+' | Текстуры: '+game.renderer.info.memory.textures;$('overlay').textContent=activeMap.name+' · '+activeQuality.toUpperCase()+' · WebGL2\nX '+game.camera.position.x.toFixed(1)+'  Y '+game.camera.position.y.toFixed(1)+'  Z '+game.camera.position.z.toFixed(1)+'\nПКМ + WASD · колесо · F';}}
async function init(){
 const loaded=await api(mapEndpoint);data=loaded.data;revision=loaded.revision;initialPaintCount=data.paint.length;
 if(!isM05){mapConfig=loaded.config;base=sandboxBase(loaded.config);grid=EDITOR_GRID;baseHeights=FLAT_HEIGHTS;activeMap=createEditorSandbox(mapId,loaded.config,data);activeMap.buildScene=buildQuarryMissionScene;registerLocalMap(activeMap);}
 liveTerrain=terrain();$('gameplayPanel').classList.toggle('hidden',isM05);$('gameMode').value=data.gameplay?.mode??'tdm';const choices=await api('maps');$('mapPicker').replaceChildren(...choices.maps.map(m=>new Option(m.name,m.id)));$('mapPicker').value=mapId;$('mapTitle').textContent='Карта · '+activeMap.name;
 await Promise.all([loadFPSHands(),loadWeaponModels(),loadEquipmentModels()]);
 game=new GameRenderer(canvas,{onError:e=>status(String(e))});game.presentingCampaign=isM05;game.setMap(activeMap.id);
 await game.surfaces.ready;
 // The game builder is used directly, without the irreversible runtime static merge.
 game.staticRoot.removeFromParent();root=new THREE.Group();root.name='M05 editable world';game.worldRoot.add(root);
 const rawMap={...activeMap,terrain:liveTerrain,boxes:base.boxes,surfacePatches:activeMap.surfacePatches,editorLayers:[],editorRoads:[]};buildQuarryMissionScene(game,rawMap,root);
 game.staticRoot=root;game.mapDetails=[];game.weapon.visible=false;
 root.traverse(o=>{if(o.name.startsWith('m05-terrain-'))terrainMeshes.push(o);else if(o.isMesh&&!o.userData.m05Layer){boxMeshes.set(o.name,o);if(!editableBox(baseBox(o.name)??{id:''}))entries.set('reference:box:'+o.name,{kind:'reference',id:o.name,name:o.name,node:o,locked:true});}});
 reference=isM05?await loadQuarryDressing():new THREE.Group();reference.getObjectByName('world-editor-models')?.removeFromParent();root.add(reference);
 for(const id of protectedNames){const o=reference.getObjectByName(id);if(o)o.visible=false;}
 for(const id of ['gun_base','gun_top']){const o=reference.getObjectByName(id);if(o){const p=currentSite('mount');o.position.set(p[0],p[1]+(id==='gun_top'?1.54:0),p[2]);o.visible=true;}}
 for(const o of reference.children)if(o.name!=='quarry-set-dressing'&&o.visible)entries.set('reference:glb:'+o.uuid,{kind:'reference',name:o.name||'Industrial mesh',node:o,locked:true});
 for(const o of reference.getObjectByName('quarry-set-dressing')?.children??[]){if(o.userData.dressingBatch)entries.set('dressing:'+o.name,{kind:'dressing',id:o.name,name:o.name,node:o});else entries.set('reference:glb:'+o.uuid,{kind:'reference',name:o.name,node:o,locked:true});}
 models=new THREE.Group();root.add(models);helpers=new THREE.Group();game.scene.add(helpers);selectionBox=new THREE.BoxHelper(new THREE.Object3D(),0xffd16a);selectionBox.visible=false;game.scene.add(selectionBox);groupPivot=new THREE.Object3D();game.scene.add(groupPivot);navGroup=new THREE.Group();navPathGroup=new THREE.Group();game.scene.add(navGroup,navPathGroup);
 brushRing=new THREE.Mesh(new THREE.RingGeometry(.96,1,64),new THREE.MeshBasicMaterial({color:0x9cf3bb,side:THREE.DoubleSide,depthTest:false}));brushRing.rotation.x=-Math.PI/2;brushRing.visible=false;game.scene.add(brushRing);
 orbit=new OrbitControls(game.camera,canvas);orbit.enableDamping=true;orbit.mouseButtons={LEFT:null,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.ROTATE};if(isM05){orbit.target.set(-238,32,-221);game.camera.position.set(-265,57,-257);}else{orbit.target.set(0,0,0);game.camera.position.set(-35,40,-45);}orbit.update();
 gizmo=new TransformControls(game.camera,canvas);gizmo.setSize(.8);game.scene.add(gizmo.getHelper());gizmo.addEventListener('dragging-changed',ev=>{
 orbit.enabled=!ev.value;
 if(ev.value){dragStart=clone(data);groupStart=null;
  if(selectedModels().length>1){groupPivot.updateMatrix();groupStart={inverse:groupPivot.matrix.clone().invert(),items:selectedModels().map(k=>{const o=entries.get(k).node;o.updateMatrix();return {key:k,matrix:o.matrix.clone()};})};}
 }else if(dragStart){
  if(groupStart){for(const {key} of groupStart.items)storeTransform(entries.get(key));}else{const entry=entries.get(selected);if(entry)storeTransform(entry);}
  changed(dragStart);dragStart=null;groupStart=null;redrawHelpers();select(selected,'keep');
 }
});
gizmo.addEventListener('objectChange',()=>{if(!groupStart)return;groupPivot.updateMatrix();const delta=groupPivot.matrix.clone().multiply(groupStart.inverse);for(const {key,matrix} of groupStart.items){const o=entries.get(key).node;delta.clone().multiply(matrix).decompose(o.position,o.quaternion,o.scale);o.updateMatrixWorld(true);}});
 await syncAll();configureQuality();
 $('mapPicker').onchange=()=>{location.href='/world-editor.html?map='+encodeURIComponent($('mapPicker').value);};$('newMap').onclick=safe(async()=>{if(dirty)throw Error('Сначала сохраните текущую карту');const name=prompt('Название новой карты','Новая карта');if(!name)return;const size=Number(prompt('Размер стороны карты в метрах (128–1024, кратно 32)','256'));if(!size)return;const result=await api('create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,size})});location.href='/world-editor.html?map='+encodeURIComponent(result.id);});
 $('navBuild').onclick=safe(buildNavigation);$('navVisible').onchange=()=>navGroup.visible=$('navVisible').checked;$('navClear').onclick=clearNavigation;$('navPath').onclick=()=>{if(!navReady){status('Сначала пересчитайте навигацию');return;}navStart=null;setMode('navpath');$('navStatus').textContent='Укажите начальную точку A.';};
 $('heightImport').onclick=()=>$('heightFile').click();$('heightFile').onchange=safe(async()=>{try{await readHeightmap($('heightFile').files[0]);}finally{$('heightFile').value='';}});$('heightExport').onclick=safe(exportHeightmap);
 $('gameMode').onchange=()=>{edit(()=>gameplay().mode=$('gameMode').value);};for(const [id,kind] of [['addSpawn','spawn'],['addVehicle','vehicle'],['addCapture','capture']])$(id).onclick=()=>{pointKind=kind;setMode('gamepoint');status('Укажите точку на земле');};
 $('save').onclick=safe(save);$('draft').onclick=download;$('undo').onclick=safe(undo);$('redo').onclick=safe(redoEdit);
 for(const [id,m] of [['move','translate'],['rotate','rotate'],['scale','scale']])$(id).onclick=()=>{if(m==='scale'&&(selectedModels().length>1||entries.get(selected)?.kind==='dressing')){status('Для группы используйте равномерный масштаб в инспекторе');return;}gizmo.setMode(m);setMode('select');};
 $('space').onclick=()=>{const local=gizmo.space!=='local';gizmo.setSpace(local?'local':'world');$('space').textContent=local?'Локально':'Мир';};
 $('snap').onclick=()=>{snap=!snap;gizmo.setTranslationSnap(snap?1:null);gizmo.setRotationSnap(snap?15*rad:null);gizmo.setScaleSnap(snap?.1:null);$('snap').textContent='Сетка: '+(snap?'вкл.':'выкл.');};
 $('selectAll').onclick=()=>{multi.clear();for(const [k,e] of entries)if(e.kind==='model')multi.add(k);select([...multi].at(-1)??null,'keep');};$('group').onclick=assignGroup;$('ungroup').onclick=clearGroupName;$('search').oninput=list;$('filter').onchange=list;$('quality').onchange=configureQuality;
 $('selectMode').onclick=()=>setMode('select');$('brushMode').onclick=()=>setMode('brush');$('paintMode').onclick=()=>setMode('paint');$('scatterMode').onclick=safe(async()=>{await prepareScatter();setMode('scatter');});$('eraseMode').onclick=()=>setMode('erase');$('scatterAsset').onchange=safe(prepareScatter);$('assetSearch').oninput=assetList;$('validate').onclick=safe(showIssues);
 $('clearPaint').onclick=()=>{edit(()=>data.paint=[]);refreshTerrain();};$('layerMode').onclick=()=>setMode('layer');$('roadMode').onclick=()=>setMode('road');$('clearLayers').onclick=()=>{edit(()=>data.layers=[]);refreshLayers();};$('finishRoad').onclick=safe(finishRoad);$('cancelRoad').onclick=()=>{roadDraft=[];updateRoadDraft();setMode('select');};$('collisions').onchange=$('markers').onchange=()=>{redrawHelpers();select(selected);};
 $('wire').onchange=()=>root.traverse(o=>{if(o.isMesh)for(const m of [o.material].flat())m.wireframe=$('wire').checked;});
 $('import').onclick=()=>$('files').click();$('files').onchange=safe(async()=>{await importFiles($('files').files);$('files').value='';});
 $('view').ondragover=e=>e.preventDefault();$('view').ondrop=safe(async e=>{e.preventDefault();await importFiles(e.dataTransfer.files,groundHit(e));});
 $('play').onclick=()=>{if(dirty){status('Сначала сохраните изменения.');return;}window.open(isM05?'/?unlockAll':'/?editorMap='+encodeURIComponent(mapId),'_blank');};
 canvas.oncontextmenu=e=>e.preventDefault();canvas.addEventListener('pointerdown',e=>{if(e.button===2){keys.add('rightMouse');return;}if(e.button!==0||gizmo.dragging||gizmo.axis)return;if(mode==='select'){pick(e);return;}const p=groundHit(e);if(mode==='navpath'){if(p)pathClick(p);return;}if(mode==='gamepoint'){if(p)addGameplayPoint(p);return;}if(mode==='road'){if(p){roadDraft.push([p.x,p.z]);updateRoadDraft();}return;}if(p){brushBefore=clone(data);brushDown=true;brushLast=null;lastStroke=performance.now();sculptAt(p);}});
 canvas.addEventListener('pointermove',e=>{if(mode==='select'||mode==='road'||mode==='gamepoint'||mode==='navpath')return;const p=groundHit(e);brushRing.visible=!!p;if(p){brushRing.position.copy(p);brushRing.position.y+=.1;brushRing.scale.setScalar(Number($('radius').value)||16);if(brushDown&&performance.now()-lastStroke>140){lastStroke=performance.now();sculptAt(p);}}});
 window.addEventListener('pointerup',e=>{if(e.button===2)keys.delete('rightMouse');if(brushDown){brushDown=false;changed(brushBefore);brushBefore=null;redrawHelpers();select(selected);}});
 window.addEventListener('blur',()=>{keys.clear();if(brushDown){brushDown=false;changed(brushBefore);brushBefore=null;redrawHelpers();select(selected);}});
 window.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;keys.add(e.code);if(e.ctrlKey){if(e.code==='KeyS'){e.preventDefault();safe(save)();}if(e.code==='KeyZ'){e.preventDefault();safe(undo)();}if(e.code==='KeyY'){e.preventDefault();safe(redoEdit)();}if(e.code==='KeyD'){e.preventDefault();safe(duplicate)();}if(e.code==='KeyC'){e.preventDefault();copyModels();}if(e.code==='KeyV'){e.preventDefault();safe(pasteModels)();}return;}if(keys.has('rightMouse'))return;if(e.code==='KeyF')focus();if(e.code==='Delete')safe(removeSelected)();if(e.code==='KeyW')$('move').click();if(e.code==='KeyE')$('rotate').click();if(e.code==='KeyR')$('scale').click();if(e.code==='KeyQ')setMode('select');});
 window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
 new ResizeObserver(()=>game.resize()).observe($('view'));setMode('select');status('Карта загружена · защищённые объекты доступны для просмотра');requestAnimationFrame(tick);
}
init().catch(e=>{$('fatal').classList.remove('hidden');$('fatal').textContent=e.stack??e.message;status('Ошибка загрузки');console.error(e);});
