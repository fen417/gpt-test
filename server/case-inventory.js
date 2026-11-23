import {createHash, randomInt, randomUUID} from 'node:crypto';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {CASE_RARITIES, CASE_TYPES, FIELD_RESERVE, POLAR_CIRCUIT, getCaseType,
  caseReward, campaignCaseReward} from '../shared/cases.js';

const guestPattern=/^[a-f0-9]{64}$/;
const welcomeCaseId='welcome-035';
const releaseCaseGrants=[
  ['release-036','release'],
  ['release-037-1','release',POLAR_CIRCUIT],
  ['release-037-2','release',POLAR_CIRCUIT],
];
const casePattern=/^(?:[A-Za-z0-9_-]{32}|m0[1-4]-(?:polar-)?[12]|welcome-035|release-036|release-037-[12])$/;
// Existing records predate case types and always represent the Field Reserve.
const typeOf=item=>item.caseType??FIELD_RESERVE;
const permissionDenied=error=>String(error?.code).toUpperCase().replaceAll('-','_')==='PERMISSION_DENIED';

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
  // Keep the existing paths so older grants, opened rewards and equipped
  // skins continue to work when the database starts enforcing the schema.
  const ref=owner=>db.ref('profiles').child(owner).child('weaponNetworkProgress').child('caseInventory');
  return {
    async get(owner){return (await ref(owner).get()).val();},
    async change(owner,mutate){
      const inventory=ref(owner);
      const known=(await inventory.get()).val();
      const result=await inventory.transaction(current=>{
        const next=mutate(current??known);
        if(next==null)return;
        // RTDB rules can check individual records by key. Give equipped skins
        // a reference to the corresponding opened case in the same transaction.
        const skinCases={};
        for(const [caseId,item] of Object.entries(next.cases??{}))
          if(caseReward(item.rewardId))skinCases[item.rewardId]??=caseId;
        return {...next,skinCases};
      },undefined,false);
      return result.committed?result.snapshot.val():result.snapshot.val()??known;
    },
  };
}

function view(inventory){
  const cases=Object.entries(inventory?.cases??{});
  const waiting=cases.filter(([,item])=>!item.rewardId).sort((a,b)=>a[1].createdAt-b[1].createdAt);
  const recent=cases.filter(([,item])=>item.rewardId).sort((a,b)=>b[1].openedAt-a[1].openedAt).slice(0,18)
    .map(([caseId,item])=>({caseId,rewardId:item.rewardId,openedAt:item.openedAt}));
  const availableByType=Object.fromEntries(CASE_TYPES.map(({id})=>[id,{available:0,nextCaseId:null}]));
  for(const [caseId,item] of waiting){
    const bucket=availableByType[typeOf(item)];
    bucket.available++;
    bucket.nextCaseId??=caseId;
  }
  const owned={};
  for(const [,item] of cases)if(caseReward(item.rewardId))owned[item.rewardId]=(owned[item.rewardId]??0)+1;
  return {available:waiting.length,nextCaseId:availableByType[FIELD_RESERVE].nextCaseId,availableByType,recent,
    owned,equipped:inventory?.equipped??{},campaign:inventory?.campaign??{},polarCampaign:inventory?.polarCampaign??{},
    revision:inventory?.revision??0};
}

function rollReward(caseType){
  let roll=randomInt(100);
  for(const rarity of CASE_RARITIES){
    if(roll<rarity.chance){
      const rewards=getCaseType(caseType).rewards.filter(reward=>reward.rarity===rarity.id);
      return rewards[randomInt(rewards.length)].id;
    }
    roll-=rarity.chance;
  }
  throw Error('Invalid case odds');
}

export function createCaseInventory(db,env){
  const store=db?cloudStore(db):fileStore(env.CASE_INVENTORY_FILE??'data/case-inventory.json');
  const pending=new Map();
  let flushing;
  async function grantLoginCases(owner,grants){
    const createdAt=Date.now();
    return store.change(owner,current=>{
      const missing=grants.filter(([id])=>!current?.cases?.[id]);
      if(!missing.length)return;
      const cases={...current?.cases};
      for(const [id,source,type] of missing)cases[id]=type?{createdAt,source,caseType:type}:{createdAt,source};
      return {...current,cases,revision:(current?.revision??0)+1};
    });
  }
  function awardRound(roundId,owners,chance,round,notify){
    const createdAt=Date.now();
    for(const owner of owners){
      const key=owner+'/'+roundId;
      if(pending.has(key)||randomInt(100)>=chance)continue;
      const caseType=CASE_TYPES[randomInt(CASE_TYPES.length)].id;
      pending.set(key,{owner,roundId,createdAt,round,notify,caseType});
    }
  }
  function flush(){
    if(flushing)return flushing;
    if(!pending.size)return Promise.resolve();
    flushing=Promise.allSettled([...pending].map(async([key,{owner,roundId,createdAt,round,notify,caseType}])=>{
      const grant=type=>store.change(owner,current=>{
        if(current?.cases?.[roundId])return;
        const item={createdAt,source:'match',round};
        if(type===POLAR_CIRCUIT)item.caseType=type;
        return {...current,revision:(current?.revision??0)+1,
          cases:{...current?.cases,[roundId]:item}};
      });
      const saved=await grant(caseType).catch(error=>{
        // Old RTDB rules still accept the original case during rollout.
        if(caseType!==POLAR_CIRCUIT||!permissionDenied(error))throw error;
        return grant(FIELD_RESERVE);
      });
      if(!saved?.cases?.[roundId])throw Error('Case grant did not commit');
      pending.delete(key);
      notify(owner,view(saved),roundId,typeOf(saved.cases[roundId]));
    })).then(results=>{
      if(results.some(r=>r.status==='rejected'))console.warn('Could not save match cases. Will retry.');
    }).finally(()=>{flushing=null;});
    return flushing;
  }
  return {
    awardRound,flush,
    async list(owner,{welcome=false,release=false}={}){
      const current=await store.get(owner);
      const welcomeDue=welcome&&!current?.cases?.[welcomeCaseId];
      const releaseDue=release&&releaseCaseGrants.some(([id])=>!current?.cases?.[id]);
      if(!welcomeDue&&!releaseDue)return view(current);
      const grants=welcomeDue?[[welcomeCaseId,'welcome']]:[];
      try{
        return view(await grantLoginCases(owner,releaseDue?[...grants,...releaseCaseGrants]:grants));
      }catch(error){
        if(!releaseDue||!permissionDenied(error))throw error;
        // An older RTDB ruleset can reject the new patch gift. Keep the
        // original welcome case and inventory available during deployment.
        return view(welcomeDue?await grantLoginCases(owner,grants):await store.get(owner));
      }
    },
    async equip(owner,weaponId,rewardId){
      const reward=caseReward(rewardId);
      if(rewardId!==null&&reward?.weaponId!==weaponId)throw Error('Скин недоступен для этого оружия.');
      const saved=await store.change(owner,current=>{
        if(!current)return null;
        const equipped={...current.equipped};
        if(rewardId&&!Object.values(current.cases??{}).some(item=>item.rewardId===rewardId))return;
        if((equipped[weaponId]??null)===rewardId)return;
        if(rewardId)equipped[weaponId]=rewardId;
        else delete equipped[weaponId];
        return {...current,equipped,revision:(current.revision??0)+1};
      });
      if((saved?.equipped?.[weaponId]??null)!==rewardId)throw Error('Скин ещё не получен.');
      return view(saved);
    },
    async open(owner,caseId){
      if(typeof caseId!=='string'||!casePattern.test(caseId))throw Error('Кейс не найден.');
      const openedAt=Date.now();
      let rolledReward;
      const saved=await store.change(owner,current=>{
        const item=current?.cases?.[caseId];
        if(!item||item.rewardId)return;
        const rewardId=rolledReward??=rollReward(typeOf(item));
        return {...current,revision:(current.revision??0)+1,
          cases:{...current.cases,[caseId]:{...item,rewardId,openedAt:Math.max(openedAt,item.createdAt)}}};
      });
      const result=saved?.cases?.[caseId]?.rewardId;
      if(!caseReward(result))throw Error('Кейс не найден.');
      return {inventory:view(saved),rewardId:result};
    },
    async claimCampaign(owner,missionId,difficulty){
      const reward=campaignCaseReward(missionId,difficulty);
      if(!reward)throw Error('За это прохождение кейс не предусмотрен.');
      const createdAt=Date.now();
      const claim=includePolar=>store.change(owner,current=>{
        // An earlier completion can have paid only the Field Reserve.
        const fieldTier=current?.campaign?.[missionId]??0;
        const polarTier=current?.polarCampaign?.[missionId]??0;
        if(fieldTier>=reward&&(!includePolar||polarTier>=reward))return;
        const cases={...current?.cases};
        for(let i=1;i<=reward;i++){
          cases[missionId+'-'+i]??={createdAt,source:'campaign'};
          if(includePolar)cases[missionId+'-polar-'+i]??={createdAt,source:'campaign',caseType:POLAR_CIRCUIT};
        }
        const next={...current,cases,revision:(current?.revision??0)+1,
          campaign:{...current?.campaign,[missionId]:Math.max(fieldTier,reward)}};
        if(includePolar)next.polarCampaign={...current?.polarCampaign,[missionId]:Math.max(polarTier,reward)};
        return next;
      });
      const saved=await claim(true).catch(error=>{
        if(!permissionDenied(error))throw error;
        return claim(false);
      });
      return view(saved);
    },
  };
}
