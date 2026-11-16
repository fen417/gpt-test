import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import mission from '../public/campaign/m02/mission.json' with {type:'json'};
import {campaignMusicWindow} from '../src/campaign/music-loop.js';

const duration=187.5735;
const music=mission.music;

test('campaign 2 plays the uploaded audio with musical loop points before fading ending',async()=>{
  assert.equal(music.intro,'music/m02-dawn.ogg');
  assert.equal(music.introSeconds,duration);
  assert.equal(music.loopStart,100.193);
  assert.equal(music.loopEnd,179.643);
  const path=new URL('../public/campaign/m02/music/m02-dawn.ogg',import.meta.url);
  const bytes=await readFile(path);
  assert.equal(bytes.subarray(0,4).toString('ascii'),'OggS');
  assert.ok((await stat(path)).size>2_000_000,'uploaded track exists in the built public folder');
  const loop=campaignMusicWindow(music,duration,0);
  assert.equal(loop.loop,true);
  assert.ok(loop.loopEnd<duration-7,'keep the original fading ending out of the loop');
});
test('the intro plays once, then long battles repeat the configured musical phrase',()=>{
  const length=music.loopEnd-music.loopStart;
  for(const seconds of [0,5,100.193,130,179.642]){
    const p=campaignMusicWindow(music,duration,seconds);
    assert.equal(p.offset,seconds,'play intro and lead-up without skipping');
  }
  assert.ok(Math.abs(campaignMusicWindow(music,duration,music.loopEnd).offset-music.loopStart)<1e-8);
  assert.ok(Math.abs(campaignMusicWindow(music,duration,music.loopEnd+length).offset-music.loopStart)<1e-8);
  assert.ok(Math.abs(campaignMusicWindow(music,duration,music.loopEnd+length*4+8).offset-(music.loopStart+8))<1e-8);
  assert.equal(campaignMusicWindow({loopStart:148,loopEnd:188},duration,190).loop,false,
    'older out-of-bounds config must not be silently treated as valid');
});
test('resuming the mission after a pause seeks into the correct part of the same loop',()=>{
  const t=270;
  const p=campaignMusicWindow(music,duration,t);
  const expected=music.loopStart+(t-music.loopEnd)%(music.loopEnd-music.loopStart);
  assert.ok(Math.abs(p.offset-expected)<1e-7);
  assert.ok(p.offset>=music.loopStart&&p.offset<music.loopEnd);
});
test('campaign is initially hidden and accepts both keyboard codes',async()=>{
  const s=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(s,/campaignButton\.className='home-play hidden';/);
  assert.match(s,/debugWord\.endsWith\('debug'\)\|\|debugWord==='unlock'/);
  assert.match(s,/if\(debugWord==='unlock'\)unlockCampaignMissions=true/);
  assert.match(s,/openCampaignMenu\(startCampaign,\{unlockAll:unlockCampaignMissions\}\)/);
});
