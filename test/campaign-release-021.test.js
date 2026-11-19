import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CombatAudio, MENU_MUSIC_TITLE} from '../src/audio.js';
import catalog from '../shared/campaign/catalog.json' with {type:'json'};
import {GAME_VERSION,PATCH_NOTES} from '../shared/releases.js';

test('battle mode never schedules the removed procedural song',async()=>{
  const source=await readFile(new URL('../src/audio.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/AFTER THE RAIN|_musicTick|HARMONY|MELODY|_nextMusic/);
  const audio=new CombatAudio();
  audio.ctx={state:'running',currentTime:30};
  audio._reapVoices=()=>{};
  let generated=0;
  audio._tone=()=>generated++;
  audio._noise=()=>generated++;
  audio._mode='battle';
  audio._schedule();
  assert.equal(generated,0,'the effects scheduler must not synthesize battle background music');
  assert.equal(audio.getStats().score,null);
  assert.equal(audio.getStats().musicPlaying,false);
  assert.equal(MENU_MUSIC_TITLE,'Quiet Resolve');
});

test('the campaign shows requested development percentages for the first four missions',()=>{
  assert.deepEqual(catalog.missions.slice(0,4).map(m=>[m.id,m.completionPercent]),[
    ['m01',80],['m02',70],['m03',45],['m04',15],
  ]);
  assert.ok(catalog.missions.slice(0,4).every(m=>m.implemented));
  assert.ok(catalog.missions.slice(4).every(m=>!m.implemented));
});

test('current patch notes include music removal, campaign unlock and mission readiness',()=>{
  assert.equal(GAME_VERSION,'0.21');
  const note=PATCH_NOTES[0];
  assert.equal(note.version,GAME_VERSION);
  const text=[...note.added,...note.changed,...note.fixed].join(' ');
  for(const marker of ['AFTER THE RAIN','DEBUG','80%','70%','45%','15%'])assert.ok(text.includes(marker),marker);
});
