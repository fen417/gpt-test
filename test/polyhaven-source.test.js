import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceCandidates} from '../scripts/polyhaven-source.mjs';
test('Poly Haven lookup handles nested and differently named maps',()=>{
  const url='https://dl.polyhaven.org/file/ph-assets/Textures/png/4k/concrete_floor_worn_001/concrete_floor_worn_001_diff_4k.png';
  const data={files:{Diffuse:{'4K':{PNG:{url,md5:'abc'}}}}};
  const result=sourceCandidates(data,'concrete_floor_worn_001','diff',4096);
  assert.equal(result[0].url,url);
  assert.equal(result[0].md5,'abc');
  assert.equal(result[0].extension,'.png');
});
test('Missing metadata falls back to exact-resolution CDN paths',()=>{
  const result=sourceCandidates({},'concrete_floor_worn_001','diff',4096);
  assert.ok(result.length);
  assert.ok(result.every(r=>r.url.includes('/4k/')));
  assert.ok(result[0].url.endsWith('concrete_floor_worn_001_diff_4k.jpg'));
});
test('Normal GL candidates never include DX or another resolution',()=>{
  const result=sourceCandidates({nor_dx:{'2k':{jpg:{url:'https://dl.polyhaven.org/x_nor_dx_2k.jpg'}}}},'x','nor_gl',4096);
  assert.ok(result.every(r=>!r.url.includes('nor_dx')&&r.url.includes('/4k/')));
});

test('Fabric colour variants are accepted and preferred deterministically',()=>{
  const url=name=>'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/fabric_pattern_07/fabric_pattern_07_'+name+'_2k.jpg';
  const metadata={col_2:{'2k':{jpg:{url:url('col_2')}}},col_1:{'2k':{jpg:{url:url('col_1'),md5:'cloth'}}}};
  const candidates=sourceCandidates(metadata,'fabric_pattern_07','diff',2048,['col_1','col_2','col_03']);
  assert.equal(candidates[0].url,url('col_1'));
  assert.equal(candidates[0].md5,'cloth');
  assert.equal(candidates[1].url,url('col_2'));
});
