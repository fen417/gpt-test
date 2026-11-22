import {randomBytes} from 'node:crypto';
import {applicationDefault,cert,deleteApp,initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getDatabase} from 'firebase-admin/database';
import {createNetworkWeaponProgress} from './weapon-progress.js';

const WRITER_UID='sector09-pvp-writer';
const RECEIPT_AGE=7*24*60*60*1000;
function changes(since){
  return {since,kills:0,deaths:0,maps:{},classes:{}};
}
function addCounts(previous,delta){
  const result={...previous};
  for(const [key,value] of Object.entries(delta))result[key]=(result[key]??0)+value;
  return result;
}

export function createProfileStats(env){
  if(!env.FIREBASE_DATABASE_URL||!(env.FIREBASE_SERVICE_ACCOUNT_JSON||env.GOOGLE_APPLICATION_CREDENTIALS))return null;
  const writer=randomBytes(10).toString('hex');
  let app,db,auth;
  try{
    const service=env.FIREBASE_SERVICE_ACCOUNT_JSON?JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON):null;
    app=initializeApp({
      credential:service?cert(service):applicationDefault(),
      projectId:env.FIREBASE_PROJECT_ID||service?.project_id,
      databaseURL:env.FIREBASE_DATABASE_URL,
      databaseAuthVariableOverride:{uid:WRITER_UID},
    },'sector09-'+writer);
    db=getDatabase(app);auth=getAuth(app);
  }catch{
    if(app)void deleteApp(app).catch(()=>{});
    console.error('Player profiles are disabled: check the Firebase server configuration.');
    return null;
  }

  const pending=new Map(),retry=new Map(),resets=new Map();
  const weapons=createNetworkWeaponProgress(db,writer);
  let sequence=0,saving;
  const statsRef=uid=>db.ref('profiles').child(uid).child('pvp');
  function forPlayer(uid){
    if(!pending.has(uid))pending.set(uid,changes(Math.max(Date.now(),resets.get(uid)??0)));
    return pending.get(uid);
  }
  async function write(uid,batch){
    const {delta,id}=batch,now=Date.now();
    await statsRef(uid).transaction(current=>{
      const previous=current??{},receipts=previous.receipts??{};
      const resetAt=previous.resetAt??0;
      if(delta.since<resetAt)return;
      if((receipts[writer]?.sequence??0)>=id)return;
      const retained=Object.fromEntries(Object.entries(receipts).filter(([,receipt])=>receipt.at>now-RECEIPT_AGE));
      return {
        resetAt,kills:(previous.kills??0)+delta.kills,deaths:(previous.deaths??0)+delta.deaths,
        maps:addCounts(previous.maps,delta.maps),classes:addCounts(previous.classes,delta.classes),
        receipts:{...retained,[writer]:{sequence:id,at:now}},
      };
    });
  }
  function flush(){
    if(saving)return saving;
    for(const [uid,delta] of pending){
      if(retry.has(uid)||resets.has(uid))continue;
      retry.set(uid,{delta,id:++sequence});
      pending.delete(uid);
    }
    const ready=[...retry].filter(([uid])=>!resets.has(uid));
    if(!ready.length)return Promise.resolve();
    saving=Promise.allSettled(ready.map(async ([uid,batch])=>{
      await write(uid,batch);retry.delete(uid);
    })).then(results=>{
      if(results.some(result=>result.status==='rejected'))console.warn('Could not save player stats. Will retry.');
    }).finally(()=>{saving=null;});
    return saving;
  }
  return {
    weapons,
    async identify(token){
      const {uid}=await auth.verifyIdToken(token);
      if(uid===WRITER_UID)throw Error('Invalid player identity');
      return uid;
    },
    async reset(uid){
      if(resets.has(uid))throw Error('Сброс статистики уже выполняется.');
      const cutoff=Date.now()+1,before=pending.get(uid);
      resets.set(uid,cutoff);
      pending.delete(uid);
      try{
        await statsRef(uid).transaction(current=>(current?.resetAt??0)>=cutoff?undefined:{resetAt:cutoff,kills:0,deaths:0});
      }catch(error){
        if(before){
          const after=pending.get(uid)??changes(cutoff);
          pending.set(uid,{
            since:before.since,kills:before.kills+after.kills,deaths:before.deaths+after.deaths,
            maps:addCounts(before.maps,after.maps),classes:addCounts(before.classes,after.classes),
          });
        }
        throw error;
      }finally{resets.delete(uid);}
    },
    kill(event,players,sessions){
      if(event.type!=='kill'||event.killerId===event.victimId)return;
      const attacker=players.get(event.killerId),victim=players.get(event.victimId);
      if(!attacker||!victim||attacker.bot||victim.bot||attacker.team===victim.team)return;
      const killer=sessions.get(attacker.id)?.profileUid,dead=sessions.get(victim.id)?.profileUid;
      if(killer&&killer===dead)return;
      if(killer)forPlayer(killer).kills++;
      if(dead)forPlayer(dead).deaths++;
    },
    play(uid,mapId,classId){
      const stats=forPlayer(uid);
      stats.maps[mapId]=(stats.maps[mapId]??0)+1;
      stats.classes[classId]=(stats.classes[classId]??0)+1;
    },
    flush,
    async close(){
      let deadline;
      try{
        await Promise.race([
          (async()=>{
            await Promise.all([flush(),weapons.flush()]);
            await Promise.all([flush(),weapons.flush()]);
          })(),
          new Promise(resolve=>{deadline=setTimeout(resolve,2000);}),
        ]);
      }finally{
        clearTimeout(deadline);
        await deleteApp(app);
      }
    },
  };
}
