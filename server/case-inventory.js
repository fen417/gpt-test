import {createHash, randomInt, randomUUID} from 'node:crypto';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {CASE_RARITIES, CASE_REWARDS, campaignCaseReward} from '../shared/cases.js';

const guestPattern=/^[a-f0-9]{64}$/;
const casePattern=/^(?:[A-Za-z0-9_-]{32}|m0[1-3]-[12])$/;

export function caseOwner(uid,guestKey){
  if(!uid&&(typeof guestKey!=='string'||!guestPattern.test(guestKey)))return null;
  const hash=createHash('sha256').update(uid??guestKey).digest('hex');
  return (uid?'case-account-':'case-guest-')+hash;
}

function fileStore(path){
  const file=resolve(path);
  let loaded, writes=Promise.resolve();
  function read(){
    return loaded??=readFile(file,'utf8').then(JSON.parse).catch(error=>{
      if(error.code==='ENOENT')return {};
      loaded=null;
      throw error;
    });
  }
  return {
    async get(owner){
      await writes;
      return (await read())[owner];
    },
    change(owner,mutate){
      const job=writes.then(async()=>{
        const current=await read();
        const next=mutate(current[owner]);
        if(next==null)return current[owner];
        const all={...current,[owner]:next};
        await mkdir(dirname(file),{recursive:true});
        const temp=file+'.'+randomUUID()+'.tmp';
        await writeFile(temp,JSON.stringify(all),{mode:0o600});
        await rename(temp,file);
        loaded=Promise.resolve(all);
        return next;
      });
      writes=job.catch(()=>{});
      return job;
    },
  };
}

function cloudStore(db){
  // The dedicated server already has a writer-only grant on this branch.
  // Inventory identities are in a separate namespace from player XP.
  const ref=owner=>db.ref('profiles').child(owner).child('weaponNetworkProgress').child('caseInventory');
  return {
    async get(owner){return (await ref(owner).get()).val();},
    async change(owner,mutate){return (await ref(owner).transaction(mutate,undefined,false)).snapshot.val();},
  };
}

function view(inventory){
  const cases=Object.entries(inventory?.cases??{});
  const waiting=cases.filter(([,item])=>!item.rewardId).sort((a,b)=>a[1].createdAt-b[1].createdAt);
  const recent=cases.filter(([,item])=>item.rewardId).sort((a,b)=>b[1].openedAt-a[1].openedAt).slice(0,18)
    .map(([caseId,item])=>({caseId,rewardId:item.rewardId,openedAt:item.openedAt}));
  return {available:waiting.length,nextCaseId:waiting[0]?.[0]??null,recent,
    campaign:inventory?.campaign??{},revision:inventory?.revision??0};
}

function rollReward(){
  let roll=randomInt(100);
  for(const rarity of CASE_RARITIES){
    if(roll<rarity.chance)return rarity.id+'-'+(randomInt(rarity.count)+1);
    roll-=rarity.chance;
  }
  throw Error('Invalid case odds');
}

export function createCaseInventory(db,env){
  const store=db?cloudStore(db):fileStore(env.CASE_INVENTORY_FILE??'data/case-inventory.json');
  const pending=new Map();
  let flushing;
  function awardRound(roundId,owners,chance,notify){
    const createdAt=Date.now();
    for(const owner of owners){
      if(randomInt(100)>=chance)continue;
      pending.set(owner+'/'+roundId,{owner,roundId,createdAt,notify});
    }
  }
  function flush(){
    if(flushing)return flushing;
    if(!pending.size)return Promise.resolve();
    flushing=Promise.allSettled([...pending].map(async([key,{owner,roundId,createdAt,notify}])=>{
      const saved=await store.change(owner,current=>{
        if(current?.cases?.[roundId])return;
        return {...current,revision:(current?.revision??0)+1,
          cases:{...current?.cases,[roundId]:{createdAt,source:'match'}}};
      });
      if(!saved?.cases?.[roundId])throw Error('Case grant did not commit');
      pending.delete(key);
      notify(owner,view(saved),roundId);
    })).then(results=>{
      if(results.some(r=>r.status==='rejected'))console.warn('Could not save match cases. Will retry.');
    }).finally(()=>{flushing=null;});
    return flushing;
  }
  return {
    awardRound,flush,
    async list(owner){return view(await store.get(owner));},
    async open(owner,caseId){
      if(typeof caseId!=='string'||!casePattern.test(caseId))throw Error('Кейс не найден.');
      const rewardId=rollReward(),openedAt=Date.now();
      const saved=await store.change(owner,current=>{
        const item=current?.cases?.[caseId];
        // A Firebase transaction can start with a cold local snapshot.
        // Send the comparison to the database before rejecting a missing ID.
        if(!item)return current??null;
        if(item.rewardId)return;
        return {...current,revision:(current.revision??0)+1,
          cases:{...current.cases,[caseId]:{...item,rewardId,openedAt}}};
      });
      const result=saved?.cases?.[caseId]?.rewardId;
      if(!CASE_REWARDS.some(reward=>reward.id===result))throw Error('Кейс не найден.');
      return {inventory:view(saved),rewardId:result};
    },
    async claimCampaign(owner,missionId,difficulty){
      const reward=campaignCaseReward(missionId,difficulty);
      if(!reward)throw Error('За это прохождение кейс не предусмотрен.');
      const createdAt=Date.now();
      const saved=await store.change(owner,current=>{
        if((current?.campaign?.[missionId]??0)>=reward)return;
        const cases={...current?.cases};
        for(let i=1;i<=reward;i++)cases[missionId+'-'+i]??={createdAt,source:'campaign'};
        return {...current,cases,revision:(current?.revision??0)+1,
          campaign:{...current?.campaign,[missionId]:reward}};
      });
      return view(saved);
    },
  };
}
