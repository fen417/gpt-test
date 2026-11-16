import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPAIGN_PROGRESS_KEY,readCampaignProgress,saveCampaignProgress,
  markCampaignComplete,campaignMissionStatus,canStartCampaignMission,
  campaignStorageWarning,resetCampaignProgress,recordCampaignCheckpoint
} from '../src/campaign/progress.js';

function withStore(){
  const values=new Map();
  globalThis.localStorage={
    getItem:key=>values.get(key)??null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key)
  };
  return values;
}
test('mission 2 unlocks only after mission 1; future missions remain planned',()=>{
  const values=withStore(),initial=readCampaignProgress();
  assert.equal(campaignMissionStatus('m01',initial),'available');
  assert.equal(campaignMissionStatus('m02',initial),'locked');
  assert.equal(canStartCampaignMission('m02',initial),false);
  assert.equal(campaignMissionStatus('m02',initial,true),'available');
  assert.equal(canStartCampaignMission('m02',initial,true),true);
  assert.equal(campaignMissionStatus('m08',initial,true),'planned');
  assert.equal(canStartCampaignMission('m08',initial,true),false);
  recordCampaignCheckpoint('m01',{mission:{checkpoint:2}},1234);
  assert.equal(campaignMissionStatus('m01'),'progress');
  markCampaignComplete('m01',{elapsedSeconds:300,losses:2},{bruno_alive:true,kane_alive:false});
  const p=readCampaignProgress();
  assert.equal(campaignMissionStatus('m01',p),'complete');
  assert.equal(campaignMissionStatus('m02',p),'available');
  assert.equal(p.best.m01.elapsedSeconds,300);
  assert.equal(p.checkpoints.m01,undefined);
  assert.equal(p.carry.bruno_alive,true);
  assert.equal(p.carry.kane_alive,false);
  assert.ok(values.has(CAMPAIGN_PROGRESS_KEY));
  markCampaignComplete('m01',{elapsedSeconds:390,losses:0});
  assert.equal(readCampaignProgress().best.m01.elapsedSeconds,300);
  markCampaignComplete('m02',{elapsedSeconds:800,losses:3},{tanks_alive:7,enemy_order:true});
  const next=readCampaignProgress();
  assert.equal(campaignMissionStatus('m03',next),'available');
  assert.equal(canStartCampaignMission('m03',next),true);
  assert.equal(next.carry.tanks_alive,7);
  assert.equal(campaignMissionStatus('m04',next),'locked');
  markCampaignComplete('m03',{elapsedSeconds:1800},{m3_documents:true,harranti_alive:false});
  assert.equal(campaignMissionStatus('m04'),'available');
  recordCampaignCheckpoint('m04',{mission:{checkpoint:4}},5678);
  assert.equal(campaignMissionStatus('m04'),'progress');
  markCampaignComplete('m04',{elapsedSeconds:1600},{m4_done:true,m4_radio_code:true,sappers_alive:2,m4_tanks_killed:8});
  const bridge=readCampaignProgress();
  assert.equal(bridge.checkpoints.m04,undefined);
  assert.equal(bridge.carry.sappers_alive,2);
  assert.equal(bridge.carry.m4_radio_code,true);
  assert.equal(campaignMissionStatus('m05',bridge),'planned');
  resetCampaignProgress();
  assert.equal(campaignMissionStatus('m02'),'locked');
  assert.equal(readCampaignProgress().completed.length,0);
});
test('old mission 1 progress migrates without resetting existing achievements',()=>{
  const store=withStore();
  store.set('sector09-campaign-progress-v1',JSON.stringify({m01:true,documents:true,courier:true}));
  const p=readCampaignProgress();
  assert.ok(p.completed.includes('m01'));
  assert.equal(p.carry.documents,true);
  assert.equal(campaignMissionStatus('m02',p),'available');
  resetCampaignProgress();
  assert.equal(campaignMissionStatus('m02'),'locked');
});
test('storage access denied keeps in-memory progress with a clear warning',()=>{
  withStore();
  globalThis.localStorage={
    getItem(){throw Error('SecurityError');},
    setItem(){throw Error('SecurityError');},
    removeItem(){throw Error('SecurityError');}
  };
  const p=readCampaignProgress();
  assert.equal(p.completed.length,0);
  assert.equal(campaignStorageWarning(),true);
  assert.equal(saveCampaignProgress({...p,completed:['m01']}),false);
  assert.equal(readCampaignProgress().completed[0],'m01');
});
