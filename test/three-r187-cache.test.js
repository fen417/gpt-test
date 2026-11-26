import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {patchWebGLRenderer} from '../scripts/patch-three-r187.mjs';
import {MeshStandardMaterial} from 'three';
import {setWebGlShaderPatch} from '../src/webgl-shader-patches.js';
test('r187 compatibility patch is installed in both ESM entry points and idempotent',()=>{
  for(const file of ['build/three.module.js','src/renderers/WebGLRenderer.js']){
    const source=readFileSync(new URL('../node_modules/three/'+file,import.meta.url),'utf8');
    assert.match(source,/S09_R187_PROGRAM_UNIFORMS/);
    assert.match(source,/materialProperties.uniforms = materialProperties.programUniforms.get\( program \).uniforms/);
    assert.equal(patchWebGLRenderer(source),source);
  }
});
test('different shadow filter shader variants get different program keys',()=>{
  const m=new MeshStandardMaterial(),patch=()=>{};
  setWebGlShaderPatch(m,'penumbra',patch,'pcf');
  const key=m.customProgramCacheKey();
  setWebGlShaderPatch(m,'penumbra',patch,'pcss');
  assert.notEqual(m.customProgramCacheKey(),key);
  m.dispose();
});
