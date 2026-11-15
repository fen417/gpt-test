import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';

test('all infantry and mounted machine guns use the new single-shot MG sample family',async()=>{
  const code=await readFile(new URL('../src/audio.js',import.meta.url),'utf8');
  for(const weapon of ['mg36','pkp','turret'])
    assert.match(code,new RegExp(`\\b${weapon}:\\s*\\{\\s*sample:\\s*'lmg'`));
  for(const weapon of ['ar416','ak12','mcx9','vk45','dmr12','sv98'])
    assert.doesNotMatch(code,new RegExp(`\\b${weapon}:\\s*\\{\\s*sample:\\s*'lmg'`));
  assert.match(code,/'lmg':\\s*\\[[\\s\\S]*?machinegun-shot-1\\.ogg/);
  assert.match(code,/'lmg':\\s*\\[[\\s\\S]*?machinegun-shot-2\\.ogg/);
});

test('two trimmed MG reports are committed for both Ogg and AAC fallback',async()=>{
  for(const variant of [1,2]){
    for(const ext of ['ogg','m4a']){
      const path=new URL(`../src/assets/audio/gunshots/machinegun-shot-${variant}.${ext}`,import.meta.url);
      const buffer=await readFile(path),info=await stat(path);
      assert.ok(info.size>1000&&info.size<50000,'each shot must be short and nonempty');
      if(ext==='ogg')assert.equal(buffer.toString('ascii',0,4),'OggS');
      else assert.equal(buffer.toString('ascii',4,8),'ftyp');
    }
  }
});
