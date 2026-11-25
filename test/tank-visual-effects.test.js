import test from 'node:test';
import assert from 'node:assert/strict';
import {emitTrackDust,emitTankTrackDust} from '../src/campaign/track-dust.js';
const tank={type:'tank',hp:100,x:0,y:0,z:0,yaw:0,speed:6};
const profile={size:1.3,life:2,opacity:.43,color:0xcbb08d,rise:.38,wind:1};
function fixture(){
  const calls=[];
  const renderer={effects:[],map:{terrain:{heightAt:()=>0}},smoke(...args){calls.push(args);this.effects.push({});}};
  return {renderer,calls};
}
test('tank dust follows both tracks behind forward and reversing tanks',()=>{
  const {renderer,calls}=fixture();
  emitTankTrackDust(renderer,tank,profile);
  assert.equal(calls.length,2);
  assert.ok(calls.every(c=>c[2]>0&&c[6].kind==='dust'&&c[6].enhanced));
  assert.deepEqual(calls.map(c=>c[0]),[-1.4,1.4]);
  emitTankTrackDust(renderer,{...tank,speed:-6},profile);
  assert.ok(calls.slice(2).every(c=>c[2]<0));
});
test('mission dust includes nearby allied and opposing tanks with a bounded particle budget',()=>{
  const {renderer,calls}=fixture();
  emitTrackDust(renderer,[{...tank,team:0},{...tank,x:10,team:1},{...tank,hp:0}],tank);
  assert.equal(calls.length,4);
  renderer.effects=Array(94).fill({});
  emitTrackDust(renderer,[tank],tank);
  assert.equal(calls.length,4);
});
