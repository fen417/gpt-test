import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CubeRenderTarget,MeshStandardNodeMaterial} from 'three/webgpu';
import {readFileSync} from 'node:fs';
import {CachedShadows} from '../src/cached-shadows.js';
import {WebGlPenumbra} from '../src/webgl-penumbra.js';
import {localProbeSize,preserveSkyIrradiance} from '../src/local-reflections.js';
import {volumeSunGLSL} from '../src/volume-sun.js';
import {setWebGpuRelief} from '../src/webgpu-surface-relief.js';

test('pinned Three revision and matching lock',()=>{
  assert.equal(THREE.REVISION,'187');
  const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  const lock=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url),'utf8'));
  assert.equal(pkg.dependencies.three,'0.187.0');
  assert.equal(lock.packages['node_modules/three'].version,pkg.dependencies.three);
});
test('cached shadows merge native depth instead of packed RGBA',()=>{
  const cache=new CachedShadows();
  assert.equal(cache.material.depthWrite,true);
  assert.equal(cache.material.depthFunc,THREE.AlwaysDepth);
  assert.match(cache.material.fragmentShader,/gl_FragDepth=min\(a,b\)/);
  assert.doesNotMatch(cache.material.fragmentShader,/unpackRGBAToDepth/);
  assert.doesNotMatch(volumeSunGLSL(3),/unpackRGBAToDepth/);
  cache.dispose();
});
test('custom PCF and PCSS patches use raw depth and restore originals',()=>{
  const filter=new WebGlPenumbra(),material=new THREE.MeshStandardMaterial(),original=material.onBeforeCompile;
  for(const mode of ['pcf','pcss']){
    filter.setMode(mode);filter.bind(material);
    const shader={fragmentShader:'#include <shadowmap_pars_fragment>\n#include <lights_fragment_begin>',uniforms:{}};
    material.onBeforeCompile(shader);
    assert.match(shader.fragmentShader,/float s09DirectionalShadow\(sampler2D/);
    assert.match(shader.fragmentShader,/s09DirectionalShadow\( directionalShadowMap/);
    assert.match(shader.fragmentShader,/texelFetch/);
    assert.doesNotMatch(shader.fragmentShader,/unpackRGBAToDepth/);
  }
  filter.setMode('off');assert.equal(material.onBeforeCompile,original);material.dispose();
});
test('PMREM diffuse copy addresses all six cube layers and the roughest mip',()=>{
  const sky={texture:{isPMREMTexture:true,mipmaps:[{width:256},{width:8}]}};
  const local={texture:{isPMREMTexture:true,mipmaps:[{width:128},{width:16},{width:8}]}};
  assert.equal(localProbeSize(sky.texture,'high'),256);
  assert.equal(localProbeSize(sky.texture,'high',true),128);
  let args;preserveSkyIrradiance({isWebGPURenderer:true,copyTextureToTexture(...a){args=a;}},sky,local);
  assert.equal(args[2].max.z,6);assert.equal(args[2].max.x,8);assert.equal(args[4],1);assert.equal(args[5],2);
  const cube=new CubeRenderTarget(16);assert.equal(cube.isCubeRenderTarget,true);cube.dispose();
});
test('WebGPU relief binds and restores r187 TSL nodes',()=>{
  const texture=new THREE.DataTexture(new Uint8Array(16),2,2);
  const material=new MeshStandardNodeMaterial({map:texture});
  const original=material.colorNode;
  setWebGpuRelief(material,texture,24,.03,52);
  assert.notEqual(material.colorNode,original);
  setWebGpuRelief(material,null);assert.equal(material.colorNode,original);
  material.dispose();texture.dispose();
});
