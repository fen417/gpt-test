import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveResolution } from '../src/adaptive-resolution.js';
import { CachedShadows } from '../src/cached-shadows.js';
import {GroundShadows} from '../src/ground-shadows.js';
import {optimizeLighting} from '../src/renderer.js';
import * as THREE from 'three';
import {batchStaticWorld} from '../src/static-batching.js';
import {partitionTerrain} from '../src/terrain-chunks.js';

test('adaptive resolution has hysteresis, CPU protection and a physical width floor',()=>{
  const gpu=new AdaptiveResolution();for(let i=0;i<40;i++)gpu.update(.03,4,25);
  assert.equal(gpu.scale,.9);
  assert(gpu.ratio(1366,1)*1366>=1024);
  for(let i=0;i<360;i++)gpu.update(1/60,5,6);
  assert.equal(gpu.scale,1,'60 Hz vsync must allow resolution recovery');
  const cpu=new AdaptiveResolution();for(let i=0;i<120;i++)cpu.update(.03,25,4);
  assert.equal(cpu.scale,1,'reducing pixels cannot solve a CPU bottleneck');
});

test('cached shadow installation is idempotent and disposal restores native rendering',()=>{
  const cache=new CachedShadows(),native=()=>{},owner={renderer:{shadowMap:{render:native}}};
  cache.install(owner);const installed=owner.renderer.shadowMap.render;
  cache.install(owner);assert.equal(owner.renderer.shadowMap.render,installed);
  cache.dispose();assert.equal(owner.renderer.shadowMap.render,native);
});

test('bounded point-light optimization retains the baked ground-shadow shader hook',()=>{
  const material=new THREE.MeshLambertMaterial(),shadows=new GroundShadows();
  shadows.apply(material);optimizeLighting({material});const hook=material.onBeforeCompile;
  optimizeLighting({material});assert.equal(material.onBeforeCompile,hook);
  const shader={uniforms:{},vertexShader:'#include <project_vertex>',fragmentShader:'#include <color_fragment>\n#include <lights_pars_begin>\n#include <lights_fragment_begin>'};
  hook(shader,{});
  assert.equal(shader.uniforms.groundShadow,shadows.uniforms.groundShadow);
  assert.ok(shader.fragmentShader.includes('groundShadowStrength'));
  assert.ok(shader.fragmentShader.includes('light.visible = false'));
  shadows.dispose();material.dispose();
});

test('static colour batching preserves transformed triangles and material groups',()=>{
  const root=new THREE.Group(),materials=['#e6dfbd','#b9a380'].map(color=>new THREE.MeshStandardMaterial({color}));
  for(let i=0;i<3;i++){
    const geometry=new THREE.BoxGeometry();geometry.clearGroups();geometry.addGroup(0,12,0);geometry.addGroup(12,24,1);
    const mesh=new THREE.Mesh(geometry,materials);mesh.position.set(i*2,1,-3);mesh.rotation.y=i*.2;root.add(mesh);
  }
  root.updateMatrixWorld(true);
  function triangles(){
    const result=[];root.traverse(mesh=>{if(!mesh.isMesh)return;const geometry=mesh.geometry,position=geometry.attributes.position,color=geometry.attributes.color;
      const groups=Array.isArray(mesh.material)?geometry.groups:[{start:0,count:geometry.index.count,materialIndex:0}];
      for(const group of groups){const material=Array.isArray(mesh.material)?mesh.material[group.materialIndex]:mesh.material;
        for(let index=group.start;index<group.start+group.count;index+=3){const triangle=[];
          for(let j=0;j<3;j++){const vertex=geometry.index.getX(index+j),p=new THREE.Vector3().fromBufferAttribute(position,vertex).applyMatrix4(mesh.matrixWorld),c=material.color.clone();if(material.vertexColors)c.multiply(new THREE.Color(color.getX(vertex),color.getY(vertex),color.getZ(vertex)));triangle.push([...p.toArray(),...c.toArray()].map(v=>Math.round(v*1e5)).join(','));}
          result.push(triangle.join('/'));
        }
      }
    });return result.sort();
  }
  const before=triangles();batchStaticWorld(root);root.updateMatrixWorld(true);
  assert.equal(root.children.length,1);assert.deepEqual(triangles(),before);
});

test('terrain simplification preserves chunk boundaries, road UVs and a 5 mm bound',()=>{
  const root=new THREE.Group(),geometry=new THREE.PlaneGeometry(48,48,24,24);
  geometry.setAttribute('roadUv',geometry.attributes.uv.clone());root.add(new THREE.Mesh(geometry,new THREE.MeshLambertMaterial()));
  partitionTerrain(root,geometry);
  const chunk=root.children[0].geometry,position=chunk.attributes.position,referenced=new Set(chunk.index.array);
  assert.ok(chunk.index.count<24*24*6/2);assert.ok(chunk.userData.terrainError<=.00501);
  for(let i=0;i<position.count;i++)if(Math.abs(position.getX(i))===24||Math.abs(position.getY(i))===24)assert.ok(referenced.has(i),'every border vertex remains');
  assert.equal(chunk.attributes.roadUv.count,position.count);
});
