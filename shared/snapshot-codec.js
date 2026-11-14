import { Reader, Writer } from './binary.js';
import { getWeapon } from './world.js';

export const MESSAGE=Object.freeze({SNAPSHOT:1,EVENTS:2,INPUT:3,ACK:4,PING:5,PONG:6,RESYNC:7});
export const CONTROL=Object.freeze(Object.fromEntries(['hello','rooms','list','create','join','resume','welcome','lobby','settings','loadout','start','init','respawn','leave','left','error','stats','squad'].map((name,i)=>[name,16+i])));
const CONTROL_NAMES=Object.fromEntries(Object.entries(CONTROL).map(([name,id])=>[id,name]));
export function encodeControl(message){const type=CONTROL[message.type];if(type===undefined)throw Error('Unknown control message');return JSON.stringify({...message,type});}
export function decodeControl(value){const data=JSON.parse(value);if(!data||typeof data!=='object'||!Object.hasOwn(CONTROL_NAMES,data.type))throw Error('Некорректное сообщение. Обновите игру.');return {...data,type:CONTROL_NAMES[data.type]};}
export const INPUT_STEP=16667/1e6;
export const INPUT_FLAGS=['sprint','crouch','jump','fire','aim','reload','gadget','secondaryGadget','grenade','interact','switchSeat','horn','order'];
const BOOLS=['alive','reloading','crouch','sliding','sprint','aim','grounded','bot','protected','spotted'];
const PRIVATE=new Set(['vy','slideVx','slideVz','slideAt','slideCooldownAt','controlFlags','velocityX','velocityZ','moveSpeed','jumpFatigue','jumpCooldownAt','bloom','shotReadyAt','lastShotAt']);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),finite=v=>Number.isFinite(Number(v))?Number(v):0;
const specs=rows=>rows.trim().split(/\s+/).map(row=>{const [key,type]=row.split(':');return {key,type};});
export const SCHEMAS={
  players:specs(`name:r team:u8 squadId:u8 squadLeader:u8 orderKind:r orderPointId:r reviveSeq:u16 classId:r weaponId:r primaryWeaponId:r sidearmId:r weaponSlot:u8 equipAt:f32
    x:x y:y z:z yaw:a pitch:a motionAt:f32 hp:u8 ammo:u8 reserve:u16 kills:u16 deaths:u16 assists:u16 score:u32 respawnAt:f32
    reloadAt:f32 shotSeq:u16 spread:s slideYaw:a gadgetAt:f32 secondaryAt:f32 rockets:u8 heldGadget:r gadgetAction:r
    gadgetTargetId:r actionAt:f32 grenades:u8 vehicleId:r vehicleSeat:seat flags:u16 vy:v slideVx:v slideVz:v slideAt:f32 slideCooldownAt:f32 controlFlags:u8 velocityX:v velocityZ:v moveSpeed:v jumpFatigue:s jumpCooldownAt:f32 bloom:s shotReadyAt:f32 lastShotAt:f32`),
  vehicles:specs(`type:r team:u8 x:x y:y z:z yaw:a motionAt:f32 bodyPitch:a bodyRoll:a scaleX:scale scaleY:scale scaleZ:scale
    rotationX:a rotationZ:a hp:u16 maxHp:u16 speed:v steer:signed heat:s overheated:u8 aimYaw:a aimPitch:a
    gunSeq:u16 glassBroken:u8 seats:refs respawnAt:f32 wreckAt:f32`),
  deployables:specs('kind:r ownerId:r team:u8 squadId:u8 x:x y:y z:z yaw:a hp:u8 expires:f32'),
  grenades:specs('team:u8 ownerId:r x:f32 y:f32 z:f32 fuseAt:f32 yaw:a'),
  rockets:specs('ownerId:r team:u8 x:f32 y:f32 z:f32 vx:v vy:v vz:v lifeAt:f32'),
  points:specs('name:r x:x z:z owner:i8 progress:signed contested:u8 spawnBlocked:u8'),
};
const COLLECTIONS=Object.keys(SCHEMAS),MOVE=new Set(['x','y','z','yaw','pitch','bodyPitch','bodyRoll','speed','steer','aimYaw','aimPitch','vy','slideVx','slideVz','motionAt']);
const INDEX=Object.fromEntries(COLLECTIONS.map(kind=>[kind,Object.fromEntries(SCHEMAS[kind].map((field,index)=>[field.key,index]))]));
const publicPlayers=new WeakMap();
const equal=(a,b)=>Array.isArray(a)?Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>v===b[i]):a===b;
const clock=(t,left)=>left>0?Math.round((t+left)*100)/100:0;
function quant(type,value,size){
  if(type==='r')return value===undefined||value===null||value===''?null:String(value);
  if(type==='refs')return (value??[]).map(v=>v===null?null:String(v));
  if(type==='seat')return value===null||value===undefined?255:value;
  if(type==='x'||type==='z')return clamp(Math.round((finite(value)+size/2+32)/(size+64)*65535),0,65535);
  if(type==='y')return clamp(Math.round(finite(value)*128),-32768,32767);
  if(type==='a')return Math.round(Math.atan2(Math.sin(finite(value)),Math.cos(finite(value)))/Math.PI*32767);
  if(type==='v')return clamp(Math.round(finite(value)*16),-32768,32767);
  if(type==='s')return clamp(Math.round(finite(value)*10000),0,65535);
  if(type==='signed')return clamp(Math.round(finite(value)*32767),-32767,32767);
  if(type==='scale')return clamp(Math.round((value??1)*1000),0,65535);
  if(type==='f32')return Math.fround(finite(value));
  if(type==='u8')return clamp(Math.ceil(finite(value)),0,255);
  return Math.round(finite(value));
}
function dequant(type,value,size){
  if(type==='x'||type==='z')return value/65535*(size+64)-size/2-32;
  if(type==='y')return value/128;if(type==='a')return value/32767*Math.PI;if(type==='v')return value/16;
  if(type==='s')return value/10000;if(type==='signed')return value/32767;if(type==='scale')return value/1000;
  if(type==='seat')return value===255?null:value;return value;
}
function writeValue(w,type,value,dict){
  if(type==='r'){w.u16(dict.ref(value));return;}
  if(type==='refs'){w.u8(value.length);for(const v of value)w.u16(dict.ref(v));return;}
  if(['x','z','s','scale','u16'].includes(type))w.u16(value);
  else if(['y','a','v','signed','i16'].includes(type))w.i16(value);
  else if(type==='f32')w.f32(value);else if(type==='u32')w.u32(value);else if(type==='i8')w.i8(value);else w.u8(value);
}
function readValue(r,type,dict){
  if(type==='r')return dict.get(r.u16());
  if(type==='refs'){const n=r.u8();if(n>8)throw Error('Invalid seats');return Array.from({length:n},()=>dict.get(r.u16()));}
  if(['x','z','s','scale','u16'].includes(type))return r.u16();if(['y','a','v','signed','i16'].includes(type))return r.i16();
  if(type==='f32')return r.f32();if(type==='u32')return r.u32();if(type==='i8')return r.i8();return r.u8();
}
class Dictionary{
  strings=[null];ids=new Map();ack=0;
  ref(value){if(value===null||value===undefined||value==='')return 0;const key=String(value);if(this.ids.has(key))return this.ids.get(key);const id=this.strings.length;if(id>=65535)throw Error('Dictionary exhausted');this.strings.push(key);this.ids.set(key,id);return id;}
  get(id){if(id===0)return null;if(!this.strings[id])throw Error('Missing string baseline');return this.strings[id];}
  write(w){w.u16(this.strings.length-1-this.ack);for(let i=this.ack+1;i<this.strings.length;i++){w.u16(i);w.text(this.strings[i]);}}
  read(r){const n=r.u16();if(n>8192)throw Error('Dictionary overflow');for(let i=0;i<n;i++){const id=r.u16(),text=r.text();if(!id)throw Error('Invalid string id');this.strings[id]=text;}}
}
export function prepareSnapshot(state,size,previous){
  const result={time:state.time,tickets:state.tickets,winner:state.winner,maxTickets:state.maxTickets,roundDuration:state.roundDuration,moving:new Set(),active:new Set((state.players??[]).filter(p=>p.networkActive).map(p=>p.id)),rows:{}};
  for(const kind of COLLECTIONS){const map=new Map();result.rows[kind]=map;
    for(const source of state[kind]??[]){let item=source;
      if(kind==='players')item={...source,motionAt:Math.fround(state.time),flags:BOOLS.reduce((bits,key,i)=>bits|(source[key]?1<<i:0),0),
        shotReadyAt:clock(state.time,source.cooldown),equipAt:clock(state.time,source.equipTime),respawnAt:clock(state.time,source.respawnIn),
        reloadAt:source.reloading?clock(state.time,(1-source.reloadProgress)*getWeapon(source.classId,source.weaponId).reload):0,
        gadgetAt:clock(state.time,source.gadgetCooldown),secondaryAt:clock(state.time,source.secondaryCooldown),actionAt:clock(state.time,source.gadgetActionRemaining),
        slideAt:clock(state.time,source.slideTime),slideCooldownAt:clock(state.time,source.slideCooldown),jumpCooldownAt:clock(state.time,source.jumpCooldown)};
      else if(kind==='vehicles')item={...source,motionAt:Math.fround(state.time),scaleX:source.modelScale?.x??1,scaleY:source.modelScale?.y??1,scaleZ:source.modelScale?.z??1,
        rotationX:source.modelRotation?.x??0,rotationZ:source.modelRotation?.z??0,respawnAt:clock(state.time,source.respawnIn),wreckAt:clock(state.time,source.wreckTime)};
      else if(kind==='grenades')item={...source,fuseAt:clock(state.time,source.fuse)};else if(kind==='rockets')item={...source,lifeAt:clock(state.time,source.life)};
      const id=String(source.id),schema=SCHEMAS[kind],row=schema.map(({key,type})=>quant(type,item[key],size)),old=previous?.rows[kind]?.get(id);
      if(['players','vehicles'].includes(kind)&&old){
        const changed=schema.some((f,i)=>f.key!=='motionAt'&&MOVE.has(f.key)&&!equal(row[i],old[i])),key=kind+'/'+id;
        if(changed)result.moving.add(key);
        if(!changed&&!previous.moving.has(key)){const i=schema.findIndex(f=>f.key==='motionAt');row[i]=old[i];}
      }
      map.set(id,row);
    }
  }return result;
}
export function materializeSnapshot(frame,context,time=frame.time){
  const out={...context,time,tickets:frame.tickets,winner:frame.winner,maxTickets:frame.maxTickets,roundDuration:frame.roundDuration,events:[]};
  for(const kind of COLLECTIONS){out[kind]=[];for(const [id,row] of frame.rows[kind]){
    const p={id};SCHEMAS[kind].forEach(({key,type},i)=>p[key]=dequant(type,row[i],context.size));
    if(kind==='players'){
      BOOLS.forEach((key,i)=>p[key]=Boolean(p.flags&(1<<i)));
      p.equipTime=Math.max(0,p.equipAt-time);p.respawnIn=Math.max(0,p.respawnAt-time);p.gadgetCooldown=Math.max(0,p.gadgetAt-time);p.secondaryCooldown=Math.max(0,p.secondaryAt-time);p.gadgetActionRemaining=Math.max(0,p.actionAt-time);
      p.reloadProgress=p.reloading?clamp(1-(p.reloadAt-time)/getWeapon(p.classId,p.weaponId).reload,0,1):0;p.slideTime=Math.max(0,p.slideAt-time);p.slideCooldown=Math.max(0,p.slideCooldownAt-time);p.jumpCooldown=Math.max(0,p.jumpCooldownAt-time);p.cooldown=Math.max(0,p.shotReadyAt-time);
      p.jumpHeld=Boolean(p.controlFlags&1);p.crouchHeld=Boolean(p.controlFlags&2);p.wasSprinting=Boolean(p.controlFlags&4);p.crouching=p.crouch;p.fireHeld=Boolean(p.controlFlags&8);
    }else if(kind==='vehicles'){
      p.modelScale={x:p.scaleX,y:p.scaleY,z:p.scaleZ};p.modelRotation={x:p.rotationX,y:0,z:p.rotationZ};p.respawnIn=Math.max(0,p.respawnAt-time);p.wreckTime=Math.max(0,p.wreckAt-time);
    }else if(kind==='grenades')p.fuse=Math.max(0,p.fuseAt-time);else if(kind==='rockets')p.life=Math.max(0,p.lifeAt-time);
    out[kind].push(p);
  }}return out;
}
export class SnapshotEncoder{
  constructor(size){this.size=size;this.dict=new Dictionary();this.history=new Map();this.sequence=0;this.ack=0;this.lastFull=-Infinity;}
  confirm(sequence,dictAck){if(sequence>=this.ack&&this.history.has(sequence))this.ack=sequence;this.dict.ack=Math.max(this.dict.ack,Math.min(dictAck,this.dict.strings.length-1));}
  encode(current,{localId,inputAck=0,tick=0,full=false,focus={}}={}){
    const base=this.history.get(this.ack);full||=!base||current.time-this.lastFull>=5;
    const next={...current,rows:{}},payload=new Writer(),origin=current.rows.players.get(localId);
    const own=origin?{x:dequant('x',origin[INDEX.players.x],this.size),z:dequant('z',origin[INDEX.players.z],this.size)}:null;
    for(const kind of COLLECTIONS){const schema=SCHEMAS[kind],prior=full?new Map():base.rows[kind],map=new Map(),updates=[];
      for(const [id,original] of current.rows[kind]){let row=original,old=prior.get(id);
        if((kind==='grenades'||kind==='rockets')&&own){
          const indices=INDEX[kind],dx=dequant(schema[indices.x].type,original[indices.x],this.size)-own.x,dz=dequant(schema[indices.z].type,original[indices.z],this.size)-own.z;
          const range=focus.aim&&focus.classId==='recon'?320:kind==='grenades'?65:200;
          if(dx*dx+dz*dz>range*range&&original[indices.ownerId]!==localId)continue;
        }
        // The server already schedules snapshots. A second floating-point
        // deadline here could discard every other movement update.
        if(kind==='players'&&id!==localId){
          let publicRow=publicPlayers.get(original);if(!publicRow){publicRow=original.map((v,i)=>PRIVATE.has(schema[i].key)?0:v);publicPlayers.set(original,publicRow);}row=publicRow;
        }
        map.set(id,row);const changed=[];for(let i=0;i<schema.length;i++)if(!old||!equal(row[i],old[i]))changed.push(i);
        if(changed.length)updates.push({id,row,changed});
      }
      for(const id of prior.keys())if(!map.has(id))updates.push({id});next.rows[kind]=map;payload.u16(updates.length);
      for(const update of updates){payload.u16(this.dict.ref(update.id));payload.u8(update.row?1:0);if(!update.row)continue;
        const mask=new Uint8Array(Math.ceil(schema.length/8));for(const i of update.changed)mask[i>>3]|=1<<(i&7);payload.raw(mask);for(const i of update.changed)writeValue(payload,schema[i].type,update.row[i],this.dict);
      }
    }
    const sequence=++this.sequence,w=new Writer();w.u8(MESSAGE.SNAPSHOT);w.u8(full?1:0);w.u32(sequence);w.u32(full?0:this.ack);w.f32(current.time);w.u32(inputAck);w.u32(tick);
    w.u16(current.tickets[0]);w.u16(current.tickets[1]);w.i8(current.winner??-1);w.u16(current.maxTickets??600);w.u16(current.roundDuration??960);this.dict.write(w);w.raw(payload.finish());
    this.history.set(sequence,next);while(this.history.size>96)this.history.delete(this.history.keys().next().value);if(full)this.lastFull=current.time;return {bytes:w.finish(),sequence};
  }
}
export class SnapshotDecoder{
  constructor(context){this.context=context;this.dict=new Dictionary();this.history=new Map();this.sequence=0;}
  decode(value){
    const r=new Reader(value);if(r.u8()!==MESSAGE.SNAPSHOT)throw Error('Not a snapshot');const full=Boolean(r.u8()),sequence=r.u32(),baseId=r.u32(),time=r.f32(),inputAck=r.u32(),tick=r.u32();
    const frame={time,inputAck,tick,tickets:[r.u16(),r.u16()],winner:r.i8(),maxTickets:r.u16(),roundDuration:r.u16(),rows:{}};if(frame.winner<0)frame.winner=null;
    this.dict.read(r);const base=this.history.get(baseId);if(!full&&!base)return {missingBase:true};
    for(const kind of COLLECTIONS){const schema=SCHEMAS[kind],map=new Map(full?[]:base.rows[kind]);frame.rows[kind]=map;const count=r.u16();if(count>512)throw Error('Entity limit');
      for(let n=0;n<count;n++){const id=this.dict.get(r.u16()),op=r.u8();if(!op){map.delete(id);continue;}if(op!==1)throw Error('Invalid delta operation');
        const mask=[];for(let i=0;i<Math.ceil(schema.length/8);i++)mask.push(r.u8());const old=map.get(id),row=old?[...old]:schema.map(f=>quant(f.type,undefined,this.context.size));
        for(let i=0;i<schema.length;i++)if(mask[i>>3]&(1<<(i&7)))row[i]=readValue(r,schema[i].type,this.dict);map.set(id,row);
      }
    }r.done();this.sequence=sequence;this.history.set(sequence,frame);while(this.history.size>96)this.history.delete(this.history.keys().next().value);
    return {frame,state:materializeSnapshot(frame,this.context),inputAck,tick,sequence};
  }
}
const EVENT_TYPES=['shot','bulletImpact','damage','score','kill','reload','equip','grenade','gadget','revive','rocketLaunch','explosion','spawn','vehicleEnter','vehicleExit','vehicleDestroyed','equipmentDestroyed','capture','roundEnd','horn','glassBreak','squadOrder','dryFire'];
const EVENT_SPEC=Object.fromEntries(specs(`playerId:r attackerId:r victimId:r killerId:r medicId:r team:u8 classId:r weaponId:r weapon:r kind:r reason:r points:u16 total:u32 shotSeq:u16
  x:f32 y:f32 z:f32 tx:f32 ty:f32 tz:f32 vx:v vy:v vz:v life:f32 duration:f32 yaw:a pitch:a amount:f32 headshot:u8 hit:u8 vehicleHit:u8 equipmentHit:u8 mounted:u8 empty:u8
  vehicleId:r vehicleType:r equipmentId:r rocketId:r impact:r impactBoxId:r impactVehicleId:r dx:signed dy:signed dz:signed targetId:r pointId:r killer:r victim:r seat:u8 pane:u8 winner:u8 shotId:u32 flight:f32`).map(f=>[f.key,f]));
const EVENT_KEYS={shot:'playerId classId weaponId team shotSeq x y z vx vy vz life vehicleId mounted',
  bulletImpact:'shotId playerId team weaponId x y z tx ty tz flight headshot hit impact vehicleHit equipmentHit impactBoxId impactVehicleId dx dy dz',
  damage:'playerId attackerId amount x z',score:'playerId points total reason kind victimId victim pointId',kill:'killer victim killerId victimId weapon team headshot',
  reload:'playerId classId weaponId duration empty x z',equip:'playerId kind weaponId x z',grenade:'playerId x y z yaw',gadget:'playerId classId kind team x y z yaw duration targetId',
  revive:'playerId medicId x y z',rocketLaunch:'playerId team rocketId x y z vx vy vz yaw pitch',explosion:'x y z kind playerId rocketId vehicleId',spawn:'playerId x y z team',
  vehicleEnter:'playerId vehicleId seat',vehicleExit:'playerId vehicleId seat',vehicleDestroyed:'vehicleId vehicleType attackerId x y z',equipmentDestroyed:'equipmentId kind x y z',
  capture:'pointId team',roundEnd:'winner reason',horn:'playerId vehicleId x y z',glassBreak:'vehicleId pane x y z',squadOrder:'playerId kind pointId',dryFire:'playerId classId x z'};
export function encodeEvents(events,through,dict){
  const body=new Writer();body.u32(through);body.u16(events.length);
  for(const event of events){const type=EVENT_TYPES.indexOf(event.type);if(type<0)throw Error('Unknown event '+event.type);body.u32(event.id);body.u8(type);body.f32(event.time);
    const schema=EVENT_KEYS[event.type].split(' ').map(key=>EVENT_SPEC[key]),mask=new Uint8Array(Math.ceil(schema.length/8));schema.forEach((f,i)=>{if(event[f.key]!==undefined&&event[f.key]!==null)mask[i>>3]|=1<<(i&7);});body.raw(mask);
    schema.forEach((f,i)=>{if(mask[i>>3]&(1<<(i&7)))writeValue(body,f.type,quant(f.type,event[f.key],1),dict);});
  }const w=new Writer();w.u8(MESSAGE.EVENTS);dict.write(w);w.raw(body.finish());return w.finish();
}
export function decodeEvents(value,dict){
  const r=new Reader(value);if(r.u8()!==MESSAGE.EVENTS)throw Error('Not events');dict.read(r);const through=r.u32(),count=r.u16();if(count>1024)throw Error('Event limit');const events=[];
  for(let n=0;n<count;n++){const id=r.u32(),type=EVENT_TYPES[r.u8()],time=r.f32();if(!type)throw Error('Unknown event');const schema=EVENT_KEYS[type].split(' ').map(k=>EVENT_SPEC[k]),mask=[];for(let i=0;i<Math.ceil(schema.length/8);i++)mask.push(r.u8());const event={id,type,time};schema.forEach((f,i)=>{if(mask[i>>3]&(1<<(i&7)))event[f.key]=dequant(f.type,readValue(r,f.type,dict),1);});events.push(event);
  }r.done();return {through,events};
}
// Same values decodeInput produces, without allocating a packet just to read it
// back during every local prediction step. Callers pass sanitized input.
export function quantizedInput(sequence,input,dt=INPUT_STEP){
  const command={forward:Math.round(clamp(input.forward??0,-1,1)*127)/127,strafe:Math.round(clamp(input.strafe??0,-1,1)*127)/127,
    yaw:dequant('a',quant('a',input.yaw,1),1),pitch:dequant('a',quant('a',input.pitch,1),1),weaponSlot:input.weaponSlot??0,toolSlot:input.toolSlot??0};
  for(const key of INPUT_FLAGS)command[key]=Boolean(input[key]);
  return {sequence,dt:clamp(Math.round(dt*1e6),1000,50000)/1e6,input:command};
}
export function encodeInput(frames,{snapshotAck=0,eventAck=0,dictAck=0,epoch=0,viewTime=0,interpolationMs=60}={}){
  const w=new Writer(512);w.u8(MESSAGE.INPUT);w.u32(epoch);w.u32(snapshotAck);w.u32(eventAck);w.u16(dictAck);w.f32(viewTime);w.u8(clamp(Math.round(interpolationMs),0,200));w.u8(frames.length);
  for(const {sequence,dt,input} of frames){w.u32(sequence);w.u16(clamp(Math.round(dt*1e6),1000,50000));w.i8(Math.round(clamp(input.forward??0,-1,1)*127));w.i8(Math.round(clamp(input.strafe??0,-1,1)*127));
    w.i16(quant('a',input.yaw,1));w.i16(quant('a',input.pitch,1));w.u16(INPUT_FLAGS.reduce((bits,key,i)=>bits|(input[key]?1<<i:0),0));w.u8((input.weaponSlot??0)|((input.toolSlot??0)<<4));
  }return w.finish();
}
export function decodeInput(value){
  const r=new Reader(value);if(r.u8()!==MESSAGE.INPUT)throw Error('Not input');const epoch=r.u32(),snapshotAck=r.u32(),eventAck=r.u32(),dictAck=r.u16(),viewTime=r.f32(),interpolationMs=r.u8(),count=r.u8();if(count>8)throw Error('Input frame limit');const frames=[];
  for(let i=0;i<count;i++){const sequence=r.u32(),dt=r.u16()/1e6,forward=r.i8()/127,strafe=r.i8()/127,yaw=r.i16()/32767*Math.PI,pitch=r.i16()/32767*Math.PI,flags=r.u16(),slots=r.u8(),input={forward,strafe,yaw,pitch,weaponSlot:slots&15,toolSlot:slots>>4};INPUT_FLAGS.forEach((key,n)=>input[key]=Boolean(flags&(1<<n)));frames.push({sequence,dt,input});}
  r.done();return {epoch,snapshotAck,eventAck,dictAck,viewTime,interpolationMs,frames};
}
export function encodeAck(snapshotAck,eventAck,dictAck,epoch=0){const w=new Writer(16);w.u8(MESSAGE.ACK);w.u32(epoch);w.u32(snapshotAck);w.u32(eventAck);w.u16(dictAck);return w.finish();}
