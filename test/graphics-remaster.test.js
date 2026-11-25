import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveGraphics } from '../src/adaptive-graphics.js';
import { baseGraphicsQuality, geometryQuality, graphicsEffects, validateCustomGraphics } from '../src/graphics-settings.js';
import { choosePbrSize, DETAIL_SIZE, PBR_SOURCES } from '../src/pbr-library.js';
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { vec4 } from 'three/tsl';
import { buildWeatherPixels, weatherParameters, makeWeatherMask, surfaceRepeat, weatherArtProfile } from '../src/map-weathering.js';
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
  assert.ok(lights.lights.every(l=>!l.castShadow&&l.layers.isEnabled(0)&&!l.layers.isEnabled(1)));
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
  assert.deepEqual(a.data,b.data);assert.equal(a.data.length,a.nx*a.nz*32);
  const at=(x,z)=>((z*a.nx*4+x)*4);
  assert.ok(a.data[at(10,10)+3]<a.data[at(0,0)+3]);
  assert.ok(a.data[at(10,10)]>a.data[at(10,10)+2]);
  const tex=makeProbeTexture(a);assert.equal(tex.image.width,a.nx*4);assert.equal(tex.generateMipmaps,false);tex.dispose();
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

import {StaticMaterialVisitor,uploadPrefix,billboardRadius,withoutCasters} from '../src/render-work.js';
test('static material traversal caches a frozen map but visits new dynamic meshes',()=>{
  const scene=new THREE.Scene(),root=new THREE.Group(),a=new THREE.Group(),b=new THREE.Group();root.add(a);scene.add(root,b);
  const visitor=new StaticMaterialVisitor(),seen=[];const add=o=>seen.push(o);
  visitor.visit(scene,root,0,add);assert.ok(seen.includes(a));assert.ok(seen.includes(b));
  seen.length=0;visitor.visit(scene,root,0,add);assert.ok(!seen.includes(a));assert.ok(seen.includes(b));
  seen.length=0;visitor.visit(scene,root,1,add);assert.ok(seen.includes(a));
});
test('partial instance uploads are bounded and shadow restoration preserves disabled casters',()=>{
  const attr=new THREE.InstancedBufferAttribute(new Float32Array(160*16),16);
  uploadPrefix(attr,5);assert.deepEqual(attr.updateRanges,[{start:0,count:80}]);
  uploadPrefix(attr,200);assert.equal(attr.updateRanges[0].count,2560);
  assert.ok(billboardRadius({x:2,y:2})>Math.SQRT2);
  const a={castShadow:true},b={castShadow:false};
  assert.throws(()=>withoutCasters([a,b],()=>{assert.equal(a.castShadow,false);throw Error('test');}));
  assert.equal(a.castShadow,true);assert.equal(b.castShadow,false);
});
test('grass roots are below terrain while retaining the original scale',()=>{
  const map={id:'village',size:96,terrain:{heightAt:(x,z)=>1+x*.04},boxes:[]};
  const plants=grassTile(map,createPlacement(map),0,0,1);assert.ok(plants.length>0);
  for(const p of plants){const sink=map.terrain.heightAt(p.x,p.z)-p.y;assert.ok(sink>=.054&&sink<=.141);assert.ok(p.scale>0);}
});

import {compactGeometryGroup} from '../src/compact-geometry.js';
test('static material group compaction preserves triangle vertices, UVs and normalized colors',()=>{
  const source=new THREE.BoxGeometry(2,3,4),count=source.attributes.position.count;
  const colors=new Uint8Array(count*3);for(let i=0;i<colors.length;i++)colors[i]=i%255;
  source.setAttribute('color',new THREE.BufferAttribute(colors,3,true));
  for(const group of source.groups){
    const result=compactGeometryGroup(source,group);
    assert.equal(result.index.count,group.count);
    assert.ok(result.attributes.position.count<count);
    for(let i=0;i<group.count;i++){
      const oldIndex=source.index.getX(group.start+i),newIndex=result.index.getX(i);
      for(const name of ['position','normal','uv','color']){
        const a=source.attributes[name],b=result.attributes[name];
        for(let j=0;j<a.itemSize;j++)assert.equal(a.getComponent(oldIndex,j),b.getComponent(newIndex,j));
      }
    }
    result.dispose();
  }
  source.dispose();
});

test('map art distinguishes salt, oxidation, dust and clean interiors',()=>{
  const port=weatherArtProfile('port','metal','high'),desert=weatherArtProfile('alhadra-desert','metal','high'),pool=weatherArtProfile('fy_pool_day','metal','high');
  assert.notDeepEqual(port,desert);assert.ok(port[2]>pool[2]);assert.equal(weatherArtProfile('port','concrete','high')[2],0);
  assert.ok(weatherArtProfile('alhadra-desert','sand','high')[3]>weatherArtProfile('fy_pool_day','sand','high')[3]);
  assert.equal(weatherArtProfile('port','metal','off'),null);
  const mask=buildWeatherPixels(64);assert.ok(new Set(mask.filter((x,i)=>i%4===3)).size>30);
});


import {LocalReflections} from '../src/local-reflections.js';
import {WorldPost,canFuseBloom,stableEffectHistory} from '../src/world-post.js';
test('local probes are only generated on explicit warmup, never during gameplay',async()=>{
  const map={id:'fy_pool_day'},owner={map,worlds:new Map([[map.id,{}]]),camera:{position:{x:4,y:2,z:0}},graphicsEffects:{localReflections:'high'}};
  const probes=new LocalReflections(),texture={};let captures=0;
  probes.capture=()=>{captures++;return {texture,dispose(){}};};
  assert.equal(probes.prepare(owner,false,false),null);assert.equal(captures,0);
  await probes.prewarm(owner,new AbortController().signal,async()=>{});
  assert.equal(probes.prepare(owner,false,false),texture);assert.equal(captures,1);
  probes.invalidate();assert.equal(probes.prepare(owner,false,false),texture);assert.equal(captures,1);
  probes.dispose();
});
test('post targets remain stable when aiming and when heat sources first appear',()=>{
  const post=new WorldPost({},THREE.WebGLRenderTarget,()=>({dispose(){}}));
  const settings={ao:'gtao',lensFlare:'high',chromatic:'low',heatDistortion:'high',bloom:'high'};
  post.configure(settings,128,72,0);const world=post.world,stages=post.stages,key=post.key;
  post.aiming=true;post.configure(settings,128,72,0);
  assert.equal(post.world,world);assert.equal(post.stages,stages);assert.equal(post.key,key);assert.equal(post.state.cameraEffects.z,0);assert.equal(post.state.chromaticGain,0);
  post.heat.count=1;post.configure(settings,128,72,0);assert.equal(post.world,world);
  post.dispose();
});


import {batchInfantryBody,batchRigidPickup} from '../src/model-batching.js';
test('floor pickup batching preserves material, transformed bounds and excludes transparent geometry',()=>{
  const root=new THREE.Group(),material=new THREE.MeshStandardMaterial(),glass=new THREE.MeshStandardMaterial({transparent:true});
  const a=new THREE.Mesh(new THREE.BoxGeometry(1,2,3),material),b=new THREE.Mesh(new THREE.BoxGeometry(2,1,1),material),c=new THREE.Mesh(new THREE.BoxGeometry(),glass);
  a.position.set(1,2,3);b.position.set(-2,1,0);b.rotation.y=.5;root.add(a,b,c);
  const before=new THREE.Box3().setFromObject(root,true);
  const {saved,owned}=batchRigidPickup(root);
  assert.equal(saved,1);assert.equal(root.children.length,2);assert.equal(c.parent,root);
  const after=new THREE.Box3().setFromObject(root,true);
  assert.ok(before.min.distanceTo(after.min)<1e-5&&before.max.distanceTo(after.max)<1e-5);
  assert.ok(root.children.some(m=>m.material===material));
  for(const g of owned)g.dispose();for(const m of [a,b,c])m.geometry.dispose();material.dispose();glass.dispose();
});
test('skinned batch preserves skin attributes and all LOD triangle counts; optional pouch stays separate',()=>{
  const root=new THREE.Group(),bone=new THREE.Bone(),skeleton=new THREE.Skeleton([bone]),material=new THREE.MeshStandardMaterial();
  root.add(bone);const levels=new Map(),owned=new Set();
  const makeGeo=()=>{const g=new THREE.BoxGeometry();const count=g.attributes.position.count;
    g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(count*4),4));
    const w=new Float32Array(count*4);for(let i=0;i<count;i++)w[i*4]=1;
    g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(w,4));owned.add(g);return g;};
  for(let i=0;i<3;i++){
    const mesh=new THREE.SkinnedMesh(makeGeo(),material);mesh.name='body-'+i;if(i===2)mesh.userData.optionalPouch=true;
    root.add(mesh);mesh.bind(skeleton,new THREE.Matrix4());levels.set(mesh.name,[null,[makeGeo()],[makeGeo()],[makeGeo()]]);
  }
  root.updateMatrixWorld(true);
  const result=batchInfantryBody(root,levels);assert.equal(result.saved,1);
  const merged=result.mergedLods.get('body-0/0');assert.equal(merged.length,4);
  for(const g of merged){assert.equal(g.index.count,72);assert.equal(g.attributes.skinIndex.count,48);assert.equal(g.attributes.skinWeight.getX(24),1);g.dispose();}
  assert.equal(root.getObjectByName('body-1').visible,false);assert.equal(root.getObjectByName('body-2').visible,true);
  for(const g of owned)g.dispose();material.dispose();skeleton.dispose();
});
test('bloom fusion skips one pass only without adjacent-pixel filters; bloom-only world bypasses copy',()=>{
  assert.equal(canFuseBloom(3,false,false),true);assert.equal(canFuseBloom(3,true,false),false);assert.equal(canFuseBloom(3,false,true),false);assert.equal(canFuseBloom(0,false,false),false);
  let composite=null;
  const post=new WorldPost({},THREE.WebGLRenderTarget,()=>({dispose(){},renderBloom(input,profiler,combine){composite=combine;return input.texture;}}));
  const input=new THREE.WebGLRenderTarget(128,72);
  assert.equal(post.configure({bloom:'high'},128,72,4),true);assert.equal(post.directWorld,true);
  const passes=post.passes;
  assert.equal(post.finishBloom(input,null,true),input.texture);assert.equal(post.bloomFused,true);assert.equal(composite,false);assert.equal(post.passes,passes-1);
  post.configure({ao:'gtao',bloom:'high'},128,72,4);assert.equal(post.directWorld,false);post.finishBloom(input,null,false);assert.equal(composite,true);
  post.dispose();input.dispose();
});


import {chooseHalfSmoke} from '../src/soft-smoke.js';
test('automatic half-resolution smoke is restricted to dense distant plumes',()=>{
  assert.equal(chooseHalfSmoke('auto',12,false,.8),true);
  assert.equal(chooseHalfSmoke('auto',11,false,1.2),false);
  assert.equal(chooseHalfSmoke('auto',50,true,2),false);
  assert.equal(chooseHalfSmoke('auto',50,false,.1),false);
  assert.equal(chooseHalfSmoke('full',50,false,2),false);
  assert.equal(chooseHalfSmoke('half',1,true,0),true);
});
test('depth hierarchy uses conservative ceil sizes and can be disabled independently',()=>{
  const post=new WorldPost({},THREE.WebGLRenderTarget,()=>({dispose(){}}));
  post.reflector=new THREE.Vector2(0,0);
  post.configure({reflections:'high'},101,73,0);
  assert.deepEqual(post.depthHierarchy.map(t=>[t.width,t.height]),[[26,19],[7,5]]);
  post.configure({reflections:'high',reflectionTraversal:'off'},101,73,0);
  assert.equal(post.depthHierarchy,null);
  post.configure({reflections:'medium'},101,73,0);assert.equal(post.depthHierarchy,null);
  post.dispose();
});
test('temporal masks ping-pong only on stable frames and reset on camera, quality or resize',()=>{
  const post=new WorldPost({},THREE.WebGLRenderTarget,()=>({dispose(){}}));
  const camera=new THREE.PerspectiveCamera(),sun=new THREE.Vector3(1,1,0);
  post.configure({ao:'gtao'},100,80,0);
  post.prepareTemporal(camera,sun,1);assert.equal(post.state.historyReuse,0);
  const initial=post.maskWrite;post.finishTemporal();
  post.prepareTemporal(camera,sun,1.016);assert.equal(post.state.historyReuse,1);assert.notEqual(post.maskWrite,initial);assert.equal(post.maskRead,initial);post.finishTemporal();
  camera.position.x+=.1;post.prepareTemporal(camera,sun,1.032);assert.equal(post.state.historyReuse,0);post.finishTemporal();
  post.configure({ao:'gtao'},104,80,0);post.prepareTemporal(camera,sun,1.048);assert.equal(post.state.historyReuse,0);
  post.configure({ao:'gtao',temporalEffects:'off'},104,80,0);assert.equal(post.maskHistory,null);post.dispose();
});
test('streamed grass reuses compatible instance buffers with exact live count',()=>{
  const veg=new Vegetation(),geometry=new THREE.PlaneGeometry(),material=new THREE.MeshBasicMaterial();
  veg.asset=()=>({geometry,material});
  const plants=Array.from({length:11},(_,i)=>({x:i,y:0,z:0,yaw:0,scale:1,color:0xffffff,shade:1}));
  const first=veg.batch(plants,'grass',1);assert.equal(first.mesh.instanceMatrix.count,16);assert.equal(first.mesh.count,11);
  veg.remove(first,true);assert.equal(veg.grassPool.length,1);
  const next=veg.batch(plants.slice(0,9),'grass',2);assert.equal(next.mesh,first.mesh);assert.equal(next.mesh.count,9);assert.equal(veg.poolHits,1);
  veg.remove(next,true);veg.clear();assert.equal(veg.grassPool.length,0);geometry.dispose();material.dispose();
});


import {tankFireAnchor,adsFlashFactor,scriptedTankFire,tankFlameCenter} from '../src/combat-visuals.js';
test('tank wreck fire uses the rear deck in the interpolated hull pose, not turret or ground',()=>{
  const group=new THREE.Group(),body=new THREE.Group(),hull=new THREE.BoxGeometry(3.6,1.4,7);hull.translate(0,.8,0);group.add(body);group.position.set(10,2,20);group.rotation.y=Math.PI/2;
  const vehicle={type:'tank',x:0,y:0,z:0,yaw:0},out=new THREE.Vector3(),rig={body,levels:[{hull:{geometry:hull}}]};
  tankFireAnchor(vehicle,rig,out);assert.ok(Math.abs(out.y-3.51)<1e-6&&Math.abs(out.x-12.12)<1e-6&&Math.abs(out.z-20)<1e-6);
  body.rotation.x=.2;const expected=body.localToWorld(new THREE.Vector3(0,1.51,2.12));tankFireAnchor(vehicle,rig,out);assert.ok(expected.distanceTo(out)<1e-6);
  tankFireAnchor(vehicle,null,out);assert.ok(out.y>1.5&&out.z>1.8);hull.dispose();
  assert.equal(scriptedTankFire({...vehicle,convoyIndex:0,scriptedLoss:true},'m03'),true);assert.equal(scriptedTankFire({...vehicle,convoyIndex:0,scriptedLoss:true},'m02'),false);
});
test('ADS flash strength smoothly decreases without extinguishing the native flash',()=>{
  assert.equal(adsFlashFactor(0),1);assert.ok(adsFlashFactor(1)>.17&&adsFlashFactor(1)<.19);assert.ok(adsFlashFactor(.5)>adsFlashFactor(1));assert.equal(adsFlashFactor(-1),1);assert.equal(adsFlashFactor(2),adsFlashFactor(1));
});

test('tank flame base stays inside the engine deck as flame height changes',()=>{for(const height of [1,2.6,3])assert.ok(Math.abs(tankFlameCenter(height)-height*.5+.18)<1e-9);});
