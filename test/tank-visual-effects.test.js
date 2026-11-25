import test from 'node:test';
import assert from 'node:assert/strict';
import {emitTrackDust,emitTankTrackDust,trackDustSlot} from '../src/campaign/track-dust.js';
const tank={id:'player',type:'tank',hp:100,x:0,y:0,z:0,yaw:0,speed:6};
const profile={size:1.3,life:2,opacity:.43,color:0xcbb08d,rise:.38,wind:1};
function fixture(reduced=false){
  const calls=[];
  const renderer={clock:0,lowQuality:reduced,effects:[],map:{terrain:{heightAt:()=>0}},smoke(...args){
    calls.push({time:this.clock,args});
    const owner=args[6].trackOwner;
    const reuse=trackDustSlot(this.effects,owner,reduced);
    if(!reuse&&this.effects.length>140)return;
    const effect=reuse??{};
    Object.assign(effect,{type:'smoke',trackOwner:owner,age:0,life:args[4]});
    if(!reuse)this.effects.push(effect);
  }};
  return {renderer,calls};
}
test('tank dust follows both tracks behind forward and reversing tanks',()=>{
  const {renderer,calls}=fixture();
  emitTankTrackDust(renderer,tank,profile);
  assert.equal(calls.length,2);
  assert.ok(calls.every(({args:c})=>c[2]>0&&c[6].kind==='dust'&&c[6].enhanced));
  assert.deepEqual(calls.map(({args:c})=>c[0]),[-1.4,1.4]);
  emitTankTrackDust(renderer,{...tank,speed:-6},profile);
  assert.ok(calls.slice(2).every(({args:c})=>c[2]<0));
});
test('continuous tank dust under particle pressure for both quality tiers',()=>{
  for(const reduced of [false,true]){
    const {renderer,calls}=fixture(reduced);
    const others=Array.from({length:10},(_,i)=>({...tank,id:'tank'+i,x:5+i*4,team:i%2}));
    const protectedSmoke=Array.from({length:65},()=>({type:'smoke',trackOwner:null,age:.1,life:30}));
    renderer.effects.push(...protectedSmoke);
    for(let frame=0;frame<900;frame++){
      renderer.clock=frame/60;
      for(const e of renderer.effects)e.age+=1/60;
      renderer.effects=renderer.effects.filter(e=>e.age<e.life);
      emitTrackDust(renderer,[tank,...others],tank,profile);
      assert.ok(renderer.effects.length<=141);
      assert.ok(renderer.effects.filter(e=>e.trackOwner!=null).length<=(reduced?56:80));
    }
    const ownTimes=[...new Set(calls.filter(c=>c.args[6].trackOwner===tank.id).map(c=>c.time))];
    assert.ok(ownTimes.length>55);
    for(let i=1;i<ownTimes.length;i++)assert.ok(ownTimes[i]-ownTimes[i-1]<(reduced?.28:.19));
    assert.ok(others.every(other=>calls.some(c=>c.args[6].trackOwner===other.id)));
    assert.ok(protectedSmoke.every(e=>renderer.effects.includes(e)&&e.trackOwner===null));
  }
});
test('track slot only reuses track dust, including when the global budget is saturated',()=>{
  const protectedSmoke={type:'smoke',age:9,life:10,trackOwner:null};
  const faded={type:'smoke',trackOwner:'other',age:1.8,life:2};
  const young={type:'smoke',trackOwner:'player',age:.2,life:2};
  const effects=[protectedSmoke,faded,young,...Array.from({length:127},()=>({type:'spark'}))];
  assert.equal(trackDustSlot(effects,'player'),faded);
});
