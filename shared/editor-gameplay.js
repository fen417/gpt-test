
export const EDITOR_VEHICLES=['tank','humvee','atv'];
export function validateGameplay(g,size){
 if(g===undefined)return [];
 if(!g||!['tdm','conquest'].includes(g.mode)||!Array.isArray(g.items)||g.items.length>200)return ['Неверные игровые точки'];
 const errors=[],ids=new Set(),limit=size/2-2;
 for(const p of g.items){
  if(!p||typeof p.id!=='string'||!/^ep-[a-f0-9]{16}$/.test(p.id)||ids.has(p.id)||!['spawn','vehicle','capture'].includes(p.kind)||![p.x,p.z,p.yaw].every(Number.isFinite)||Math.abs(p.x)>limit||Math.abs(p.z)>limit||Math.abs(p.yaw)>100){errors.push('Некорректная игровая точка: '+p?.id);continue;}
  ids.add(p.id);
  if(p.kind!=='capture'&&![0,1].includes(p.team))errors.push('Команда '+p.id);
  if(p.kind==='vehicle'&&!EDITOR_VEHICLES.includes(p.type))errors.push('Тип техники '+p.id);
  if(p.kind==='capture'&&(typeof p.name!=='string'||!p.name.trim()||p.name.length>60))errors.push('Название точки '+p.id);
 }
 if(g.items.filter(p=>p.kind==='capture').length>26)errors.push('Не более 26 точек захвата');
 if(g.mode==='conquest'&&!g.items.some(p=>p.kind==='capture'))errors.push('Для захвата нужна хотя бы одна точка');
 return errors;
}
export function gameplayMap(data,baseSpawns,terrain){
 const g=data.gameplay??{mode:'tdm',items:[]},items=g.items;
 const position=p=>({x:p.x,y:terrain.heightAt(p.x,p.z),z:p.z,yaw:p.yaw});
 const spawnPoints=baseSpawns.map((p,team)=>[p,...items.filter(q=>q.kind==='spawn'&&q.team===team).map(position)]);
 const points=g.mode==='conquest'?items.filter(p=>p.kind==='capture').map((p,i)=>({...position(p),id:String.fromCharCode(65+i),name:p.name})):[];
 const vehicleSpawns=items.filter(p=>p.kind==='vehicle').map(p=>({...position(p),id:p.id,type:p.type,team:p.team}));
 return {tdmLoadout:g.mode==='tdm'?'class':undefined,spawnPoints,points,vehicleSpawns};
}
