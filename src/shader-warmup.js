import * as THREE from 'three';
export const WARMUP_LIMITS=Object.freeze({off:{assets:0,upload:0,items:0},auto:{assets:3000,upload:900,items:160},full:{assets:9000,upload:2200,items:420}});
const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
export function collectWarmupTextures(owner){
  const textures=new Set(),materials=new Set();
  const add=t=>{if(t?.isTexture&&!t.isRenderTargetTexture&&!t.isDepthTexture&&!t.isVideoTexture&&(t.image||t.mipmaps?.length))textures.add(t);};
  owner.scene.traverseVisible(o=>{
    if(!o.material)return;
    for(const mat of Array.isArray(o.material)?o.material:[o.material]){
      if(!mat||materials.has(mat))continue;materials.add(mat);
      for(const value of Object.values(mat))add(value);
      for(const u of Object.values(mat.uniforms??{}))add(u?.value);
    }
  });
  for(const t of [owner.indirectLighting?.field?.texture,owner.enhancedSurfaces?.weatherMask,owner.activeSmokeTexture,owner.muzzleTexture,owner.fireballTexture])add(t);
  for(const x of owner.enhancedSurfaces?.textures?.values()??[])add(x.texture);
  for(const x of owner.vegetation?.assets?.values()??[])add(x.texture);
  return {textures:[...textures],materials:materials.size};
}
export function assetsPending(owner){
  const p=owner.enhancedSurfaces;
  return Boolean(p?.latest&&(p.manifestPending||p.loadedRefresh||[...p.textures.values()].some(x=>x.pending))||owner.indirectLighting?.pending);
}
export async function waitForWarmupAssets(owner,signal,ms,frame=nextFrame,now=()=>performance.now()){
  const deadline=now()+ms;
  while(assetsPending(owner)&&now()<deadline){signal.throwIfAborted();await frame();}
  signal.throwIfAborted();return !assetsPending(owner);
}
// Representative, temporary renderables, not simulation events. Reuse the
// actual effect pools, instanced batches and FPV muzzle mesh.
export function prepareWarmupSamples(owner){
  const cleanup=[],position=new THREE.Vector3(0,0,-5).applyMatrix4(owner.camera.matrixWorld);
  const dummy=new THREE.Object3D();dummy.position.copy(position);dummy.quaternion.copy(owner.camera.quaternion);dummy.updateMatrix();
  for(const [kind,batch] of Object.entries(owner.effectBatches)){
    if(batch.count)continue;
    const previous=new THREE.Matrix4();batch.getMatrixAt(0,previous);
    const count=batch.count,was=batch.visible;
    const color=batch.instanceColor?new THREE.Color():null;if(color)batch.getColorAt(0,color);
    const alpha=batch.geometry.attributes.instanceAlpha,rotation=batch.geometry.attributes.instanceRotation;
    const a=alpha?.getX(0),r=rotation?.getX(0);
    batch.setMatrixAt(0,dummy.matrix);batch.instanceMatrix.needsUpdate=true;
    if(color){batch.setColorAt(0,new THREE.Color(0xb5aa96));batch.instanceColor.needsUpdate=true;}
    if(alpha){alpha.setX(0,.25);alpha.needsUpdate=true;}
    if(rotation){rotation.setX(0,0);rotation.needsUpdate=true;}
    batch.count=1;batch.visible=true;
    cleanup.push(()=>{batch.count=count;batch.visible=was;batch.setMatrixAt(0,previous);batch.instanceMatrix.needsUpdate=true;
      if(color){batch.setColorAt(0,color);batch.instanceColor.needsUpdate=true;}
      if(alpha){alpha.setX(0,a);alpha.needsUpdate=true;}
      if(rotation){rotation.setX(0,r);rotation.needsUpdate=true;}});
  }
  for(const kind of ['muzzle','flash','flame']){
    const material=owner.getHotParticleMaterial(kind);
    if(!material)continue;
    const pool=owner.effectPools[kind]??(owner.effectPools[kind]=[]);
    if(!pool.length)pool.push({type:kind,mesh:new THREE.Sprite(material.clone())});
    const mesh=pool[0].mesh,previous=mesh.position.clone(),size=mesh.scale.clone(),culled=mesh.frustumCulled;
    if(mesh.parent)continue;
    mesh.position.copy(position);mesh.scale.setScalar(.35);mesh.frustumCulled=false;owner.worldRoot.add(mesh);
    cleanup.push(()=>{mesh.removeFromParent();mesh.position.copy(previous);mesh.scale.copy(size);mesh.frustumCulled=culled;});
  }
  const flash=owner.weaponRig?.muzzleFlash;
  if(flash&&owner.weapon.visible){const visible=flash.visible;flash.visible=true;cleanup.push(()=>{flash.visible=visible;});}
  const tracer=owner.effectPools.tracer?.[0]?.mesh;
  if(tracer&&!tracer.parent){const old=tracer.frustumCulled;tracer.frustumCulled=false;owner.worldRoot.add(tracer);cleanup.push(()=>{tracer.removeFromParent();tracer.frustumCulled=old;});}
  const foliageCleanup=owner.vegetation?.warmupSamples?.(owner,position);if(foliageCleanup)cleanup.push(foliageCleanup);
  return ()=>{for(const restore of cleanup.reverse())restore();};
}
export class ShaderWarmup{
  constructor(owner){this.owner=owner;this.uploaded=new WeakMap();this.busy=false;this.stats=null;}
  async idle(){await this.task?.catch(()=>{});}
  run(state,localId,view,signal,progress=()=>{}){
    if(this.busy)throw Error('Graphics warmup already running');
    this.busy=true;
    const task=this.execute(state,localId,view,signal,progress);
    const settled=task.finally(()=>{this.busy=false;if(this.task===settled)this.task=null;});
    this.task=settled;return settled;
  }
  async execute(state,localId,view,signal,progress){
    const owner=this.owner,r=owner.renderer,start=performance.now(),local=state.players.find(p=>p.id===localId);
    let warmedSamples=false;
    const stats=this.stats={api:owner.api,map:state.mapId,mode:'auto',assetsReady:false,textures:0,materials:0,compileMs:0,drawMs:0,totalMs:0,complete:false};
    const stage=async(p,label)=>{signal.throwIfAborted();progress(p,label);await nextFrame();signal.throwIfAborted();};
    const frame=()=>owner.render({...state,events:[]},localId,1/60,{...view,yaw:local?.yaw??0,pitch:local?.pitch??0,vehicleCameraYaw:local?.yaw??0,paused:true,warming:true});
    try{
      await stage(0,'Подготовка сцены');
      frame();
      const mode=stats.mode=owner.graphicsEffects?.shaderWarmup??'auto',limits=WARMUP_LIMITS[mode]??WARMUP_LIMITS.auto;
      if(mode==='off'){await this.compile(signal);await this.fence(signal);stats.complete=true;return;}
      await stage(.18,'Загрузка PBR и световых проб');
      stats.assetsReady=await waitForWarmupAssets(owner,signal,limits.assets);
      // Flush deferred material refresh before taking the texture/variant set.
      owner.indirectLighting.update(owner);
      owner.vegetation.prewarmAssets?.(owner);
      await stage(.44,'Загрузка текстур на GPU');
      const all=collectWarmupTextures(owner);stats.materials=all.materials;
      const deadline=performance.now()+limits.upload;
      for(const texture of all.textures){
        signal.throwIfAborted();
        if(stats.textures>=limits.items||performance.now()>=deadline)break;
        if(this.uploaded.get(texture)===texture.version)continue;
        if(!texture.image&&!texture.mipmaps?.length)continue;
        try{if(typeof r.initTexture!=='function')break;await r.initTexture(texture);this.uploaded.set(texture,texture.version);stats.textures++;}
        catch(error){console.warn('Texture warmup deferred',texture.name,error);}
        if(stats.textures%4===0)await nextFrame();
      }
      await stage(.65,'Компиляция шейдеров');
      const restore=prepareWarmupSamples(owner);warmedSamples=true;
      try{
        const begin=performance.now();await this.compile(signal);stats.compileMs=performance.now()-begin;
        await stage(.85,'Подготовка графических проходов');
        // Render actual world/FPV/post targets (incl. depth, shadows and
        // soft particles) rather than relying on compileAsync for all passes.
        const t=performance.now();owner.drawWarmupScene();stats.drawMs=performance.now()-t;
        await this.fence(signal);
      }finally{restore();}
      // Clear sample-only heat, smoke and output; normal gameplay never
      // consumes the synthetic effect or a temporal history from it.
      await stage(1,'Графика готова');
      stats.complete=true;
    }finally{
      if(warmedSamples){owner.postPass.worldEffects.heat.count=0;owner.postPass.worldEffects.state.heatStrength.set(0,0,0,0);owner.frameGeneration?.reset();}
      stats.totalMs=Math.round(performance.now()-start);
    }
  }
  async compile(signal){
    const {renderer:r,scene,camera,weapon,worldRoot,postPass}=this.owner;
    if(!r.compileAsync)return;
    const previous=r.getRenderTarget(),mask=camera.layers.mask,visible=worldRoot.visible,background=scene.background;
    try{
      r.setRenderTarget(postPass.worldEffects.world??postPass.target);camera.layers.set(0);
      await r.compileAsync(scene,camera);signal.throwIfAborted();
      if(weapon.visible){
        worldRoot.visible=false;scene.background=null;camera.layers.set(1);r.setRenderTarget(postPass.target);
        await r.compileAsync(scene,camera);signal.throwIfAborted();
      }
    }finally{r.setRenderTarget(previous);camera.layers.mask=mask;worldRoot.visible=visible;scene.background=background;}
  }
  async fence(signal){
    signal.throwIfAborted();
    const {renderer:r,api}=this.owner;
    if(api==='webgpu'){
      await r.backend.device.queue.onSubmittedWorkDone();signal.throwIfAborted();return;
    }
    const gl=r.getContext(),fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
    if(!fence)return;gl.flush();
    const deadline=performance.now()+750;
    try{while(performance.now()<deadline&&gl.clientWaitSync(fence,0,0)===gl.TIMEOUT_EXPIRED){signal.throwIfAborted();await nextFrame();}}
    finally{gl.deleteSync(fence);}
    signal.throwIfAborted();
  }
}
