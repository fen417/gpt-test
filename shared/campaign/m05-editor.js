
import {affineBox,rotationMatrix,transformVector} from '../geometry.js';
import {terrainHeightfield} from '../terrain-heightfield.js';

export const emptyM05Edits=()=>({version:1,models:[],boxes:{},terrain:{},sites:{},routes:{},fuelRoutes:{},lighting:{},paint:[]});
const finite=(n,lo=-2000,hi=2000)=>typeof n==='number'&&Number.isFinite(n)&&n>=lo&&n<=hi;
const vec=(v,lo=-2000,hi=2000)=>Array.isArray(v)&&v.length===3&&v.every(n=>finite(n,lo,hi));
const keyOk=k=>typeof k==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(k)&&!['constructor','prototype','__proto__'].includes(k);
const record=v=>v&&typeof v==='object'&&!Array.isArray(v);
const color=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
export const editableBox=b=>!b.visualModel&&!b.missionDynamic&&/^(barrier-|ridge-parapet|middle-cover|armor-infantry-cover|hall-cover)/.test(b.id);
export const modelAssetOk=s=>typeof s==='string'&&/^[a-f0-9]{64}\.glb$/.test(s);
export function validateM05Edits(d){
  const e=[];
  if(!record(d)||d.version!==1)return ['Неподдерживаемый формат карты'];
  const bad=(name)=>e.push(name);
  for(const k of ['boxes','terrain','sites','routes','fuelRoutes','lighting'])if(!record(d[k]))bad(k);
  if(!Array.isArray(d.models)||d.models.length>4000)bad('models');
  if(!Array.isArray(d.paint)||d.paint.length>10000)bad('paint');
  if(e.length)return e;
  const ids=new Set();
  for(const m of d.models){
    if(!record(m)||!keyOk(m.id)||ids.has(m.id)||!modelAssetOk(m.asset)||typeof m.name!=='string'||m.name.length>200||
      !vec(m.position)||!vec(m.rotation,-100,100)||!vec(m.scale,.001,100)||!Array.isArray(m.colliders)||m.colliders.length>64||
      !['low','medium','high'].includes(m.detail)||typeof m.shadow!=='boolean'){bad('Модель '+m?.id);continue;}
    ids.add(m.id);
    for(const c of m.colliders)if(!record(c)||!vec(c.center)||!vec(c.size,.001,1000))bad('Коллизия '+m.id);
  }
  for(const [id,b] of Object.entries(d.boxes))if(!keyOk(id)||!record(b)||(!b.removed&&(!vec(b.position)||!vec(b.rotation,-100,100)||!vec(b.size,.02,200))))bad('Объект '+id);
  for(const [i,v] of Object.entries(d.terrain))if(!/^\d+$/.test(i)||Number(i)>=409**2||!finite(v,-80,180))bad('Высота '+i);
  for(const [id,p] of Object.entries(d.sites))if(!keyOk(id)||!vec(p))bad('Точка '+id);
  for(const [id,r] of Object.entries(d.routes))if(!keyOk(id)||!Array.isArray(r)||r.length<2||r.length>500||!r.every(p=>vec(p)))bad('Маршрут '+id);
  for(const [id,r] of Object.entries(d.fuelRoutes))if(!keyOk(id)||!Array.isArray(r)||r.length<2||r.length>500||!r.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>finite(n))))bad('Конвой '+id);
  for(const [id,v] of Object.entries(d.lighting)){
    if(['fogColor','sunColor'].includes(id)?!color(v):!['fogDensity','sunIntensity','hemisphereLightIntensity','ambientLightIntensity','toneMappingExposure'].includes(id)||!finite(v,0,id==='fogDensity'?.1:20))bad('Свет '+id);
  }
  for(const p of d.paint)if(!Array.isArray(p)||p.length!==6||!p.slice(0,5).every(n=>finite(n))||p[2]<=0||p[3]<=0||!color(p[5]))bad('Покраска');
  return e;
}
export function terrainWithEdits(grid,base,edits){
  const heights=base.slice();
  for(const [i,y] of Object.entries(edits))heights[Number(i)]=y;
  const {min,cell,count}=grid;
  return {cell,...terrainHeightfield({x:min,z:min,columns:count,rows:count,stepX:cell,stepZ:cell,heights})};
}
export function applyBoxEdit(b,e){
  if(!e||!editableBox(b))return b;
  if(e.removed)return null;
  const [x,y,z]=e.position,[w,h,d]=e.size,[rx,ry,rz]=e.rotation;
  return {...b,x,z,baseY:y-h/2,w,h,d,editorRotation:e.rotation,
    obb:affineBox({x,y,z},[w/2,h/2,d/2],rotationMatrix({x:rx,y:ry,z:rz}))};
}
export function modelColliders(m){
  const [x,y,z]=m.position,[rx,ry,rz]=m.rotation,[sx,sy,sz]=m.scale;
  const rotation=rotationMatrix({x:rx,y:ry,z:rz});
  return m.colliders.map((c,i)=>{
    const [cx,cy,cz]=c.center,[w,h,d]=c.size;
    const delta=transformVector(rotation,{x:cx*sx,y:cy*sy,z:cz*sz});
    const center={x:x+delta.x,y:y+delta.y,z:z+delta.z},half=[w*sx/2,h*sy/2,d*sz/2];
    return {id:'world-editor-'+m.id+'-'+i,kind:'quarry-m05-part',visualModel:true,overhead:true,x:center.x,z:center.z,baseY:center.y-half[1],w:half[0]*2,h:half[1]*2,d:half[2]*2,obb:affineBox(center,half,rotation)};
  });
}
export function applySculpt(grid,base,edits,{x,z,radius,strength,mode,target=0,hardness=.5}){
  const {min,cell,count}=grid,stride=count+1;
  const result={...edits},old=i=>edits[i]??base[i];
  for(let row=Math.max(0,Math.floor((z-radius-min)/cell));row<=Math.min(count,Math.ceil((z+radius-min)/cell));row++)
    for(let col=Math.max(0,Math.floor((x-radius-min)/cell));col<=Math.min(count,Math.ceil((x+radius-min)/cell));col++){
      const distance=Math.hypot(min+col*cell-x,min+row*cell-z)/radius;
      if(distance>=1)continue;
      const weight=Math.min(1,(1-distance)/Math.max(.01,1-hardness)),i=row*stride+col,v=old(i);
      let next=v;
      if(mode==='raise'||mode==='lower')next=v+(mode==='raise'?1:-1)*strength*weight;
      else {
        const neighbors=[i, col>0?i-1:i,col<count?i+1:i,row>0?i-stride:i,row<count?i+stride:i];
        const goal=mode==='smooth'?neighbors.reduce((s,n)=>s+old(n),0)/neighbors.length:mode==='restore'?base[i]:target;
        next=v+(goal-v)*Math.min(1,strength*weight);
      }
      next=Math.max(-80,Math.min(180,next));
      if(Math.abs(next-base[i])<.0001)delete result[i];else result[i]=Math.round(next*1000)/1000;
    }
  return result;
}
