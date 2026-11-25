import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveGraphics } from '../src/adaptive-graphics.js';
import { baseGraphicsQuality, geometryQuality, graphicsEffects, validateCustomGraphics } from '../src/graphics-settings.js';
import { choosePbrSize, DETAIL_SIZE, PBR_SOURCES } from '../src/pbr-library.js';
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { vec4 } from 'three/tsl';
import { buildWeatherPixels, weatherParameters, makeWeatherMask, surfaceRepeat } from '../src/map-weathering.js';
import { setWebGlWeathering } from '../src/webgl-map-weathering.js';
import { setWebGpuWeathering, suspendWebGpuWeathering } from '../src/webgpu-map-weathering.js';
import { sourceCandidates } from '../scripts/polyhaven-source.mjs';

test('Ultra inherits the high-detail path and legacy presets opt out of additional passes',()=>{
  assert.equal(baseGraphicsQuality('ultra'),'high');
  assert.equal(geometryQuality('ultra'),'high');
  assert.equal(geometryQuality('low','high'),'high');
  for(const preset of ['low','medium','high']){
    const settings=graphicsEffects(preset);
    for(const setting of ['ao','contact','atmosphere','bloom','reflections']){
      assert.equal(settings[setting],'off');
    }
  }
});

test('custom graphics settings restore saved options and sanitize unsupported values',()=>{
  const settings=validateCustomGraphics({ao:'low',bloom:'broken',saturation:'0',contrast:'-1'},'ultra');
  assert.equal(settings.ao,'low');
  assert.equal(settings.bloom,graphicsEffects('ultra').bloom);
  assert.equal(settings.saturation,'0');
  assert.equal(settings.contrast,'100');
  assert.equal(geometryQuality('ultra','auto'),'high');
});

test('adaptive graphics waits before reducing effects and honors clarity limits',()=>{
  const quality=new AdaptiveGraphics();
  const settings=validateCustomGraphics({adaptiveTarget:'60',adaptiveFloor:'minimum',adaptiveClarity:'on'},'ultra');
  quality.configure(settings,'ultra');
  const timer={summary:()=>({p95:21})};
  for(let i=0;i<35;i++)quality.sample(.035,6,timer,true);
  assert.equal(quality.gpuStep,0);
  for(let i=0;i<80;i++)quality.sample(.035,6,timer,true);
  assert.equal(quality.effects.reflections,'medium');
  assert.equal(settings.reflections,'high');
  assert.equal(quality.scale,1);
  for(let i=0;i<2000;i++)quality.sample(.04,6,timer,true);
  assert.equal(quality.scale,1);
});

test('CPU load adapts geometry while preserving GPU effects',()=>{
  const quality=new AdaptiveGraphics();
  const settings=validateCustomGraphics({adaptiveTarget:'60'},'ultra');
  quality.configure(settings,'ultra');
  const timer={summary:()=>({p95:4})};
  for(let i=0;i<120;i++)quality.sample(.035,32,timer,true);
  assert.equal(quality.cpuStep,1);
  assert.equal(quality.effects,settings);
});

test('PBR tiers never exceed requested resolution or hardware limit',()=>{
  assert.equal(choosePbrSize([512,1024,2048,4096],4096,2048),2048);
  assert.equal(choosePbrSize([512,1024,2048],4096),2048);
  assert.equal(choosePbrSize([512,1024],256),0);
  assert.equal(choosePbrSize([512,1024],0),0);
  assert.equal(DETAIL_SIZE[graphicsEffects('ultra').surfaceDetail],4096);
  for(const preset of ['legacy','low','medium','high'])assert.equal(graphicsEffects(preset).surfaceDetail,'off');
  assert.ok(Object.keys(PBR_SOURCES).length>=10);
});

test('map profiles are opt-in and preserve relief UV scale',()=>{
  for(const p of ['legacy','low','medium','high'])assert.equal(graphicsEffects(p).mapWeathering,'off');
  assert.equal(graphicsEffects('ultra').mapWeathering,'high');
  assert.equal(validateCustomGraphics({mapWeathering:'low'},'ultra').mapWeathering,'low');
  assert.equal(weatherParameters('quarry','rock','off'),null);
  assert.ok(weatherParameters('quarry','concrete','high')[1]>weatherParameters('fy_pool_day','concrete','high')[1]);
  assert.equal(weatherParameters('quarry','sand','high')[2],0);
  assert.equal(weatherParameters('quarry','concrete','low')[2],0);
  assert.equal(surfaceRepeat('rock'),1);assert.equal(surfaceRepeat('concrete'),1);
});
test('deterministic mask with sparse cracks',()=>{
  const a=buildWeatherPixels(64),b=buildWeatherPixels(64);
  assert.deepEqual(a,b);assert.equal(a.length,64*64*4);
  const cracks=a.filter((x,i)=>i%4===2&&x>0).length;
  assert.ok(cracks>0&&cracks<64*64*.4);assert.ok(new Set(a.filter((x,i)=>i%4===0)).size>50);
});
test('WebGL patches compose and restore original shader hook',()=>{
  const m=new THREE.MeshStandardMaterial(),mask=makeWeatherMask(),original=s=>{s.fragmentShader+='\n// original';};
  m.onBeforeCompile=original;setWebGlWeathering(m,mask,weatherParameters('port','metal','high'));
  const s={uniforms:{},vertexShader:'#include <project_vertex>',fragmentShader:'#include <color_fragment>'};
  m.onBeforeCompile(s);assert.ok(s.vertexShader.includes('s09WeatherPosition'));
  assert.ok(s.fragmentShader.includes('s09WeatherFactor'));assert.ok(s.fragmentShader.includes('// original'));
  assert.ok(m.customProgramCacheKey().includes('weathering'));setWebGlWeathering(m,null);
  assert.equal(m.onBeforeCompile,original);mask.dispose();m.dispose();
});
test('WebGPU wrapper preserves original color node while relief changes',()=>{
  const m=new MeshStandardNodeMaterial(),mask=makeWeatherMask(),base=vec4(1);
  m.colorNode=base;const original=m.customProgramCacheKey;
  setWebGpuWeathering(m,mask,weatherParameters('port','metal','high'));const first=m.colorNode;assert.notEqual(first,base);
  suspendWebGpuWeathering(m);assert.equal(m.colorNode,base);
  setWebGpuWeathering(m,mask,weatherParameters('village','metal','high'));assert.equal(m.colorNode,first);
  suspendWebGpuWeathering(m);m.colorNode=vec4(.5);const replacement=m.colorNode;
  setWebGpuWeathering(m,mask,weatherParameters('village','metal','low'));assert.notEqual(m.colorNode,first);
  setWebGpuWeathering(m,null);assert.equal(m.colorNode,replacement);assert.equal(m.customProgramCacheKey,original);
  mask.dispose();m.dispose();
});

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

// Water settings, shoreline depth and reversible material lifecycle.
import {getMap} from '../shared/world.js';
import {WaterAppearance,waterDepth,waterSurfaceColor,makeWaterMaterial,makeWaveNormal} from '../src/water-appearance.js';
import {ReflectionReceivers,makeGlReflectionReceiver,WATER_RECEIVER} from '../src/reflection-receivers.js';
import {reflectionSteps} from '../src/world-post.js';

test('water quality is opt-in and true pool transmission can be disabled independently',()=>{
  assert.equal(graphicsEffects('low').water,'legacy');
  assert.equal(graphicsEffects('ultra').waterRefraction,'high');
  assert.equal(validateCustomGraphics({water:'medium',waterRefraction:'off'},'ultra').water,'medium');
  const normal=makeWaveNormal(),detail=makeWaveNormal(true);
  const pool=makeWaterMaterial('pool','high',normal,detail,null,true),port=makeWaterMaterial('port','high',normal,detail,null,true),cheap=makeWaterMaterial('pool','low',normal,null,null,true);
  assert.ok(pool.transmission>0&&pool.ior===1.333);assert.equal(port.transmission,0);assert.equal(cheap.transmission,0);
  assert.equal(cheap.clearcoat,0);assert.equal(reflectionSteps.high,32);
  for(const m of [pool,port,cheap])m.dispose();normal.dispose();detail.dispose();
});
test('water has map-specific depth and restores original mesh on quality change',()=>{
  const map=getMap('fy_pool_day'),p=map.pools[0],shore=p.z-p.d/2+.1;
  assert.ok(waterDepth(map,p.x,p.z)>waterDepth(map,p.x,shore));
  assert.notDeepEqual(waterSurfaceColor(map,p.x,p.z,false),waterSurfaceColor(map,p.x,shore,false));
  const root=new THREE.Group(),geometry=new THREE.PlaneGeometry(3,3),material=new THREE.MeshLambertMaterial(),mesh=new THREE.Mesh(geometry,material);
  mesh.userData.waterSurface=true;mesh.rotation.x=-Math.PI/2;root.add(mesh);root.updateMatrixWorld(true);
  const water=new WaterAppearance();water.update(0,root,map,'medium','off','off',null);
  assert.equal(water.entries.length,1);assert.notEqual(mesh.geometry,geometry);assert.ok(mesh.userData.waterReflection);
  water.update(1,root,map,'legacy','off','off',null);assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,material);assert.equal(water.active,false);
  geometry.dispose();material.dispose();
});
test('SSR collects only enabled water surfaces and accepts the campaign canal separately',()=>{
  const root=new THREE.Group(),geometry=new THREE.PlaneGeometry(4,4),material=new THREE.MeshStandardMaterial(),mesh=new THREE.Mesh(geometry,material);
  root.add(mesh);mesh.userData.waterReflection=true;root.updateMatrixWorld(true);
  const camera=new THREE.PerspectiveCamera(60,1,.1,100);camera.position.z=10;camera.updateMatrixWorld();
  const receivers=new ReflectionReceivers(makeGlReflectionReceiver);
  assert.equal(receivers.update('fy_pool_day',root,camera,true),true);assert.equal(receivers.entries[0].roughness,WATER_RECEIVER);
  receivers.invalidate();assert.equal(receivers.update('nahar',new THREE.Group(),camera,true,mesh),true);
  assert.equal(receivers.update('nahar',root,camera,false,mesh),false);assert.equal(receivers.entries.length,0);
  receivers.dispose();geometry.dispose();material.dispose();
});

import {EffectLights,lightCapacity,flashEnvelope} from '../src/effect-lights.js';
import {particlePixels,makeParticleTexture,plumeEnvelope,dustProfile} from '../src/effect-art.js';

test('new particle and muzzle settings leave all old presets unchanged',()=>{
  for(const p of ['legacy','low','medium','high']){
    const e=graphicsEffects(p);assert.equal(e.muzzleLights,'off');assert.equal(e.muzzleEffects,'legacy');assert.equal(e.fireLighting,'off');assert.equal(e.dust,'off');
  }
  assert.equal(graphicsEffects('ultra').muzzleLights,'high');
  assert.equal(validateCustomGraphics({muzzleLights:'low',dust:'medium'},'ultra').muzzleLights,'low');
  assert.equal(lightCapacity('off','off'),0);assert.equal(lightCapacity('low','off'),1);assert.equal(lightCapacity('high','high'),3);
});
test('real muzzle point lights are bounded, prioritize the local shooter and expire',()=>{
  const scene=new THREE.Scene(),lights=new EffectLights(scene),p=new THREE.Vector3(0,1,0),camera=new THREE.Vector3();
  lights.configure('off','off');assert.equal(scene.children.length,0);
  lights.configure('low','off');assert.equal(scene.children.length,1);assert.ok(scene.children[0].isPointLight);
  lights.pulse(p,0,{own:false});lights.update(0,camera);assert.equal(lights.active,0);
  lights.pulse(p,0,{own:true});lights.update(0,camera);assert.equal(lights.active,1);assert.ok(lights.lights[0].intensity>0);
  const original=lights.lights[0];lights.update(.03,camera);assert.ok(original.intensity>0&&original.intensity<34);
  lights.update(.1,camera);assert.equal(original.intensity,0);
  lights.configure('high','high');const count=scene.children.length;assert.equal(count,3);
  for(let i=0;i<20;i++)lights.pulse(new THREE.Vector3(i*.2,1,0),1,{own:false});
  lights.pulse(p,1,{own:true,energy:42});lights.update(1,camera,[{x:1,y:0,z:1,height:2,width:2}]);
  assert.equal(lights.active,3);assert.equal(lights.lights[0].intensity,42);assert.equal(scene.children.length,count);
  assert.ok(lights.lights.every(l=>!l.castShadow&&l.layers.isEnabled(0)&&l.layers.isEnabled(1)));
  lights.configure('off','off');assert.equal(scene.children.length,0);assert.equal(lights.active,0);lights.dispose();
});
test('particle maps have transparent edges, deterministic detail and fading plumes',()=>{
  for(const kind of ['smoke','muzzle','fire']){
    const data=particlePixels(kind,64);assert.deepEqual(data,particlePixels(kind,64));assert.equal(data[3],0);
    const alpha=data.filter((v,i)=>i%4===3);assert.ok(Math.max(...alpha)>120);assert.ok(new Set(alpha).size>35);
    const texture=makeParticleTexture(kind);assert.ok(texture.generateMipmaps);texture.dispose();
  }
  assert.equal(flashEnvelope(0,.06),1);assert.equal(flashEnvelope(.06,.06),0);
  assert.equal(plumeEnvelope(0,1,'dust').opacity,0);assert.equal(plumeEnvelope(1,1,'smoke').opacity,0);
  assert.ok(plumeEnvelope(.3,1,'smoke').growth>1);assert.equal(dustProfile({id:'fy_pool_day'}),null);
});

import {atmosphereProfile,buildCloudPixels,makeCloudTexture,ensureCloudTexture,fogLayerParameters,heightFogOpacity,CLOUD_LEVEL} from '../src/atmosphere-profile.js';

test('atmosphere improvements preserve old presets and independently selectable levels',()=>{
  for(const preset of ['legacy','low','medium','high']){
    const e=graphicsEffects(preset);assert.equal(e.clouds,'off');assert.equal(e.heightFog,'off');assert.equal(e.sky,'legacy');
  }
  assert.equal(graphicsEffects('ultra').clouds,'high');assert.equal(graphicsEffects('ultra').heightFog,'high');
  const e=validateCustomGraphics({sky:'high',clouds:'medium',heightFog:'off',atmosphere:'low'},'ultra');
  assert.equal(e.clouds,'medium');assert.equal(e.heightFog,'off');assert.equal(e.atmosphere,'low');assert.equal(CLOUD_LEVEL.high,3);
  assert.notDeepEqual(atmosphereProfile({id:'port'}),atmosphereProfile({id:'quarry'}));
  assert.ok(atmosphereProfile({id:'port'})[0]<atmosphereProfile({id:'alhadra-desert'})[0]);
});
test('cloud field is deterministic, varied and allocated only on enhanced sky',()=>{
  const p=buildCloudPixels(64);assert.deepEqual(p,buildCloudPixels(64));assert.equal(p.length,64*64*4);
  for(let k=0;k<3;k++)assert.ok(new Set(p.filter((_,i)=>i%4===k)).size>60);
  const t=makeCloudTexture();assert.equal(t.image.width,1);ensureCloudTexture(t);assert.equal(t.image.width,256);
  const data=t.image.data;ensureCloudTexture(t);assert.equal(t.image.data,data);assert.ok(t.generateMipmaps);t.dispose();
});
test('height fog is finite, fades near camera and at altitude, and respects dense campaign fog',()=>{
  const p=atmosphereProfile({id:'quarry'}),high=fogLayerParameters(p,'high'),low=fogLayerParameters(p,'low');
  assert.equal(heightFogOpacity(100,2,2,fogLayerParameters(p,'off')),0);
  assert.equal(heightFogOpacity(2,2,2,high),0);
  assert.ok(heightFogOpacity(100,2,2,high)>heightFogOpacity(25,2,2,high));
  assert.ok(heightFogOpacity(100,2,2,high)>heightFogOpacity(100,100,100,high));
  assert.ok(heightFogOpacity(100,2,2,high)>heightFogOpacity(100,2,2,low));
  assert.ok(heightFogOpacity(100,2,2,high)>heightFogOpacity(100,2,2,fogLayerParameters(p,'high',.02)));
  assert.equal(heightFogOpacity(10000,-10,-5,high),high[3]);
  assert.ok(Number.isFinite(heightFogOpacity(60,2,2.000001,high)));
});

import {bakeProbeField,makeProbeTexture,probeUniforms,giStrength} from '../src/gi-probes.js';
import {setWebGlGI} from '../src/webgl-gi.js';
import {setWebGpuGI} from '../src/webgpu-gi.js';

test('GI is independently selectable, off on old presets and on in Ultra',()=>{
  for(const p of ['legacy','low','medium','high'])assert.equal(graphicsEffects(p).gi,'off');
  assert.equal(graphicsEffects('ultra').gi,'high');assert.equal(validateCustomGraphics({gi:'low'},'ultra').gi,'low');
  assert.ok(giStrength({intensity:3.5},'high')>giStrength({intensity:3.5},'low'));
  assert.equal(giStrength({intensity:3.5},'off'),0);
});
test('static GI bake is deterministic and roofs block sky access',()=>{
  const map={id:'gi-test',size:20,terrain:{heightAt:()=>0},boxes:[{x:0,z:0,w:10,d:10,baseY:3.5,h:.4,color:'#ca5030',kind:'roof'}]};
  const a=bakeProbeField(map,{spacing:1,maxCells:20}),b=bakeProbeField(map,{spacing:1,maxCells:20});
  assert.deepEqual(a.data,b.data);assert.equal(a.data.length,a.nx*a.nz*16);
  const at=(x,z)=>((z*a.nx*2+x)*4);
  assert.ok(a.data[at(10,10)+3]<a.data[at(0,0)+3]);
  assert.ok(a.data[at(10,10)]>a.data[at(10,10)+2]);
  const tex=makeProbeTexture(a);assert.equal(tex.image.width,a.nx*2);assert.equal(tex.generateMipmaps,false);tex.dispose();
});
test('GI material patch restores shader and TSL material nodes',()=>{
  const data=bakeProbeField({id:'gi',size:8,terrain:{heightAt:()=>0},boxes:[]}),tex=makeProbeTexture(data),field=probeUniforms(data,tex);
  const gl=new THREE.MeshStandardMaterial(),hook=gl.onBeforeCompile;
  setWebGlGI(gl,field);const shader={uniforms:{},vertexShader:'#include <project_vertex>',fragmentShader:'#include <aomap_fragment>'};gl.onBeforeCompile(shader);
  assert.ok(shader.fragmentShader.includes('reflectedLight.indirectDiffuse'));setWebGlGI(gl,null);assert.equal(gl.onBeforeCompile,hook);
  const gpu=new MeshStandardNodeMaterial(),ao=gpu.aoNode,emissive=gpu.emissiveNode;
  setWebGpuGI(gpu,field);assert.notEqual(gpu.aoNode,ao);assert.notEqual(gpu.emissiveNode,emissive);
  setWebGpuGI(gpu,null);assert.equal(gpu.aoNode,ao);assert.equal(gpu.emissiveNode,emissive);tex.dispose();gl.dispose();gpu.dispose();
});
