import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {fetchBinary} from '../src/binary-assets.js';
import {applyTextureFiltering} from '../src/texture-quality.js';
import {GroundShadows} from '../src/ground-shadows.js';

test('temporary Pages 503 is retried and ignores cached error responses',async()=>{
  const previous=globalThis.fetch;
  const requests=[];
  try{
    globalThis.fetch=async(url,options)=>{
      requests.push({url:String(url),cache:options?.cache});
      return requests.length<3?new Response('unavailable',{status:503}):
        new Response(new Uint8Array([11,22,33]));
    };
    const data=new Uint8Array(await fetchBinary('/soldier.bin.gz',{retryDelayMs:0}));
    assert.deepEqual([...data],[11,22,33]);
    assert.deepEqual(requests.map(x=>x.cache),[undefined,'reload','reload']);
  }finally{globalThis.fetch=previous;}
});

test('permanent asset failures do not generate unbounded retries',async()=>{
  const previous=globalThis.fetch;
  let calls=0;
  try{
    globalThis.fetch=async()=>{calls++;return new Response('missing',{status:404});};
    await assert.rejects(fetchBinary('/missing.bin.gz',{retryDelayMs:0}),/404/);
    assert.equal(calls,1);
  }finally{globalThis.fetch=previous;}
});

test('failed connection is retried before giving up the soldier download',async()=>{
  const previous=globalThis.fetch;
  let calls=0;
  try{
    globalThis.fetch=async()=>{if(++calls===1)throw Error('connection reset');return new Response(new Uint8Array([42]));};
    assert.deepEqual([...new Uint8Array(await fetchBinary('/recover.bin.gz',{retryDelayMs:0}))],[42]);
    assert.equal(calls,2);
  }finally{globalThis.fetch=previous;}
});

test('graphics filtering waits for actual image data before requesting GPU upload',()=>{
  const map=new THREE.Texture(),material=new THREE.MeshLambertMaterial({map}),root=new THREE.Mesh(new THREE.PlaneGeometry(),material);
  applyTextureFiltering([root],[],'high',16);
  assert.equal(map.version,0,'unloaded texture must not be uploaded');
  assert.equal(map.anisotropy,16);
  map.image={width:1,height:1};
  applyTextureFiltering([root],[],'medium',16);
  assert.ok(map.version>0,'loaded texture can be updated');
  material.dispose();root.geometry.dispose();map.dispose();
});

test('ground shadows do not force an update before TextureLoader resolves',()=>{
  const previous=THREE.TextureLoader.prototype.load;
  const textures=[];
  THREE.TextureLoader.prototype.load=function(){const result=new THREE.Texture();textures.push(result);return result;};
  try{
    const shadows=new GroundShadows();
    shadows.setMap({id:'village',size:384});
    assert.equal(textures.length,1);
    assert.equal(textures[0].version,0);
    shadows.dispose();
  }finally{THREE.TextureLoader.prototype.load=previous;}
});
