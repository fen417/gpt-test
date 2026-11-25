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
  setWebGpuWeathering(m,mask,weatherParameters('village','metal','high'));const village=m.colorNode;
  assert.notEqual(village,base);
  suspendWebGpuWeathering(m);setWebGpuWeathering(m,mask,weatherParameters('port','metal','high'));assert.equal(m.colorNode,first);
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
  setWebGlGI(gl,field);const shader={uniforms:{},vertexShader:'#include <project_vertex>',fragmentShader:'#define STANDARD\n#include <aomap_fragment>'};gl.onBeforeCompile(shader);assert.ok(shader.fragmentShader.includes('}\n#define STANDARD'));
  assert.ok(shader.fragmentShader.includes('reflectedLight.indirectDiffuse'));setWebGlGI(gl,null);assert.equal(gl.onBeforeCompile,hook);
  const gpu=new MeshStandardNodeMaterial(),ao=gpu.aoNode,emissive=gpu.emissiveNode;
  setWebGpuGI(gpu,field);assert.notEqual(gpu.aoNode,ao);assert.notEqual(gpu.emissiveNode,emissive);
  setWebGpuGI(gpu,null);assert.equal(gpu.aoNode,ao);assert.equal(gpu.emissiveNode,emissive);tex.dispose();gl.dispose();gpu.dispose();
});

import {foliagePixels,makeFoliageTexture,foliageGeometry} from '../src/vegetation-art.js';
import {createPlacement,grassTile,authoredPlants,foliageLOD,FOLIAGE_LEVEL} from '../src/vegetation-placement.js';
import {Vegetation} from '../src/vegetation.js';

test('vegetation is opt-in and the legacy maps remain the default',()=>{
  for(const p of ['legacy','low','medium','high']){const e=graphicsEffects(p);assert.equal(e.vegetation,'legacy');assert.equal(e.grassDensity,'off');}
  const e=graphicsEffects('ultra');assert.equal(e.vegetation,'ultra');assert.equal(e.grassDensity,'100');assert.equal(validateCustomGraphics({grassDistance:'45',vegetation:'medium'},'ultra').grassDistance,'45');
  assert.equal(FOLIAGE_LEVEL.legacy,0);assert.equal(foliageLOD(4,'high'),0);assert.equal(foliageLOD(220,'high'),2);
});
test('vegetation art has alpha-cutout silhouettes, deterministic textures and decreasing LOD triangle counts',()=>{
  for(const kind of ['grass','scrub','broadleaf','palm','palm-impostor']){
    const pixels=foliagePixels(kind,64);assert.deepEqual(pixels,foliagePixels(kind,64));assert.equal(pixels[3],0);assert.ok(pixels.some((x,i)=>i%4===3&&x>180));
    const t=makeFoliageTexture(kind);assert.ok(t.generateMipmaps);t.dispose();
  }
  const meshes=[0,1,2].map(i=>foliageGeometry('palm',i));assert.ok(meshes[0].index.count>meshes[1].index.count&&meshes[1].index.count>meshes[2].index.count);
  for(const g of meshes){assert.equal(g.attributes.s09Wind.count,g.attributes.position.count);g.dispose();}
});
test('grass placement excludes roads, walls, water and objectives; density is deterministic',()=>{
  const map={id:'village',size:96,terrain:{heightAt:()=>0},boxes:[{x:10,z:10,w:8,d:8,h:3}],roads:[{x:0,z:0,w:6,d:40,yaw:0}],points:[{x:-12,z:12}]};
  const placement=createPlacement(map);assert.equal(placement.allowed(0,0),false);assert.equal(placement.allowed(10,10),false);assert.equal(placement.allowed(-12,12),false);assert.equal(placement.allowed(18,18),true);
  const a=grassTile(map,placement,0,0,1),b=grassTile(map,placement,0,0,.25);assert.deepEqual(a,grassTile(map,placement,0,0,1));assert.ok(a.length>=b.length);assert.ok(a.every(p=>placement.allowed(p.x,p.z)));
  assert.equal(createPlacement({...map,id:'fy_pool_day'}).allowed(18,18),false);
  assert.equal(authoredPlants({...map,boxes:[{kind:'village-palm',x:3,z:4,h:7.6,baseY:2}]} )[0].y,9.6);
});
test('vegetation switching preserves legacy leaf layers and releases instance batches',()=>{
  const map={id:'village',size:64,terrain:{heightAt:()=>0},boxes:[{kind:'village-palm',x:3,z:4,h:7.6,baseY:0}]};
  const root=new THREE.Group(),world=new THREE.Group();world.add(root);const leaf=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshBasicMaterial());leaf.userData.legacyPalmLeaf=true;root.add(leaf);
  const camera=new THREE.PerspectiveCamera();camera.updateMatrixWorld();const owner={map,staticRoot:root,worldRoot:world,camera,clock:1,sun:{intensity:3},sunOffset:new THREE.Vector3(1,2,1),graphicsEffects:{vegetation:'high',grassDensity:'off',grassDistance:'20',vegetationWind:'high',vegetationShadows:'low'}};
  const veg=new Vegetation();veg.update(owner);assert.equal(leaf.layers.mask,0);assert.equal(veg.stats().authored,1);
  owner.graphicsEffects={vegetation:'legacy'};veg.update(owner);assert.equal(leaf.layers.mask,1);assert.equal(veg.stats().authored,0);veg.dispose();leaf.geometry.dispose();leaf.material.dispose();
});

test('empty grass tiles release safely and all foliage LODs simplify',()=>{
  const veg=new Vegetation();veg.tiles.set('empty',{empty:true});assert.doesNotThrow(()=>veg.dispose());
  for(const kind of ['grass','scrub','broadleaf']){const g=[0,1,2].map(i=>foliageGeometry(kind,i));assert.ok(g[0].index.count>g[1].index.count&&g[1].index.count>g[2].index.count);g.forEach(x=>x.dispose());}
});

import {collectWarmupTextures,assetsPending,waitForWarmupAssets,WARMUP_LIMITS} from '../src/shader-warmup.js';
test('warmup waits for selected assets with a deadline and observes cancellation',async()=>{
  const owner={enhancedSurfaces:{latest:[],manifestPending:true,textures:new Map()},indirectLighting:{pending:false}};
  let now=0;const signal=new AbortController().signal;
  assert.equal(assetsPending(owner),true);
  assert.equal(await waitForWarmupAssets(owner,signal,10,async()=>{now+=5},()=>now),false);
  assert.equal(await waitForWarmupAssets(owner,signal,10,async()=>{owner.enhancedSurfaces.manifestPending=false;now+=1},()=>now),true);
  const abort=new AbortController();abort.abort();await assert.rejects(waitForWarmupAssets(owner,abort.signal,10,async()=>{},()=>now),{name:'AbortError'});
  assert.ok(WARMUP_LIMITS.full.assets>WARMUP_LIMITS.auto.assets);assert.equal(graphicsEffects('ultra').shaderWarmup,'full');
});
test('warmup texture collection deduplicates inputs and excludes render targets',()=>{
  const scene=new THREE.Scene(),texture=new THREE.DataTexture(new Uint8Array(4),1,1),target=new THREE.WebGLRenderTarget(1,1),material=new THREE.MeshStandardMaterial({map:texture,normalMap:texture});
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(),material);scene.add(mesh);
  material.envMap=target.texture;
  const result=collectWarmupTextures({scene,activeSmokeTexture:texture});assert.deepEqual(result.textures,[texture]);assert.equal(result.materials,1);
  mesh.geometry.dispose();material.dispose();texture.dispose();target.dispose();
});

test('WebGPU variants reuse identical node graphs without sharing differing weather profiles or GI quality',()=>{
  const a=new MeshStandardNodeMaterial(),b=new MeshStandardNodeMaterial(),c=new MeshStandardNodeMaterial(),mask=makeWeatherMask();
  const weather=weatherParameters('port','metal','high');setWebGpuWeathering(a,mask,weather);setWebGpuWeathering(b,mask,weather);
  assert.equal(a.colorNode,b.colorNode);assert.equal(a.customProgramCacheKey(),b.customProgramCacheKey());
  setWebGpuWeathering(c,mask,[weather[0]+.1,...weather.slice(1)]);assert.notEqual(a.colorNode,c.colorNode);
  for(const m of [a,b,c])setWebGpuWeathering(m,null);
  const data=bakeProbeField({id:'gi-cache',size:8,terrain:{heightAt:()=>0},boxes:[]}),tex=makeProbeTexture(data),field=probeUniforms(data,tex);
  field.quality.value=1;setWebGpuGI(a,field);setWebGpuGI(b,field);
  assert.equal(a.emissiveNode,b.emissiveNode);const before=a.emissiveNode;
  setWebGpuGI(a,null);setWebGpuGI(a,field);assert.equal(a.emissiveNode,before);
  field.quality.value=2;setWebGpuGI(c,field);assert.notEqual(c.emissiveNode,before);
  for(const m of [a,b,c]){setWebGpuGI(m,null);m.dispose();}mask.dispose();tex.dispose();
});

import {prepareWarmupSamples} from '../src/shader-warmup.js';
test('shader warmup samples never change live effect counts or instance data after cleanup',()=>{
  const root=new THREE.Group(),geometry=new THREE.PlaneGeometry(),material=new THREE.MeshBasicMaterial();
  geometry.setAttribute('instanceAlpha',new THREE.InstancedBufferAttribute(new Float32Array([.42]),1));
  const batch=new THREE.InstancedMesh(geometry,material,1);batch.count=0;batch.visible=false;
  const camera=new THREE.PerspectiveCamera();camera.updateMatrixWorld();root.add(batch);
  const owner={camera,worldRoot:root,effectBatches:{smoke:batch},effectPools:{},getHotParticleMaterial:()=>null};
  const old=new THREE.Matrix4();batch.getMatrixAt(0,old);const restore=prepareWarmupSamples(owner);
  assert.equal(batch.count,1);assert.equal(batch.visible,true);restore();
  const after=new THREE.Matrix4();batch.getMatrixAt(0,after);assert.ok(after.equals(old));assert.equal(batch.count,0);assert.equal(batch.visible,false);
  assert.ok(Math.abs(geometry.attributes.instanceAlpha.getX(0)-.42)<1e-6);batch.dispose();geometry.dispose();material.dispose();
});
