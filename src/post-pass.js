import * as THREE from 'three';
import {compactColorEligible,supportsCompactWebGL,selectSceneColor,displayVariant} from './compact-color-target.js';
import { WorldPost,canFuseBloom } from './world-post.js';
import { renderTimed } from './gpu-pass-timing.js';
import { webGlWorldStages } from './webgl-world-stages.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { FSR1_VERTEX, FSR1_EASU_FRAGMENT, FSR1_RCAS_FRAGMENT, fsr1RenderScale } from './fsr1.js';

export class PostPass {
  constructor(renderer,{antialias='auto'}={}){
    this.antialias=antialias;
    this.renderer=renderer;this.target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:true});
    this.nativeTarget=this.target;this.compactActive=false;this.compactSupported=supportsCompactWebGL(renderer);
    this.worldEffects=new WorldPost(renderer,THREE.WebGLRenderTarget,webGlWorldStages);
    this.maxSamples=Math.min(4,renderer.capabilities?.maxSamples??0);
    const gl=renderer.getContext?.();
    this.supportedSamples=[];
    if(gl?.getInternalformatParameter){
      const supported=gl.getInternalformatParameter(gl.RENDERBUFFER,gl.RGBA16F,gl.SAMPLES);
      this.supportedSamples=Array.from(supported??[]).filter(value=>value<=this.maxSamples);
      this.maxSamples=Math.max(0,...this.supportedSamples);
    }
    // FXAA must compare tone-mapped display luminance, not linear HDR values.
    const fragment=('#include <tonemapping_pars_fragment>\nuniform float useFxaa;uniform float sharpen;uniform float grain;uniform float time;uniform vec3 gradeTint;uniform vec2 grading;uniform float vignetteGain;\n#if S09_BLOOM_LEVELS > 0\nuniform float bloomGain;uniform sampler2D bloom0,bloom1,bloom2,bloom3;\n#endif\n'+FXAAShader.fragmentShader)
      .replace('return texture( tex2D, uv );','vec4 texel=texture(tex2D,uv);vec3 hdr=texel.rgb; \n#if S09_BLOOM_LEVELS > 0\n hdr+=texture2D(bloom0,uv).rgb*bloomGain*.62;\n#endif\n#if S09_BLOOM_LEVELS > 1\n hdr+=texture2D(bloom1,uv).rgb*bloomGain*.23;\n#endif\n#if S09_BLOOM_LEVELS > 2\n hdr+=texture2D(bloom2,uv).rgb*bloomGain*.10;\n#endif\n#if S09_BLOOM_LEVELS > 3\n hdr+=texture2D(bloom3,uv).rgb*bloomGain*.05;\n#endif\n vec3 color=ACESFilmicToneMapping(hdr); \n#ifdef S09_GRADE\n color=(color-.32)*grading.x+.32; color=max(mix(vec3(dot(color,vec3(.2126,.7152,.0722))),color,grading.y)*gradeTint,vec3(0.));\n#endif\n return linearToOutputTexel(vec4(color,texel.a));')
      .replace('gl_FragColor = ApplyFXAA( tDiffuse, resolution.xy, vUv );',`
      #ifdef S09_FXAA
      vec3 colour=ApplyFXAA(tDiffuse,resolution.xy,vUv).rgb;
      #else
      vec3 colour=Sample(tDiffuse,vUv).rgb;
      #endif
      #ifdef S09_SHARPEN
      {
        vec3 a=Sample(tDiffuse,vUv+vec2(resolution.x,0.0)).rgb,b=Sample(tDiffuse,vUv-vec2(resolution.x,0.0)).rgb;
        vec3 c=Sample(tDiffuse,vUv+vec2(0.0,resolution.y)).rgb,d=Sample(tDiffuse,vUv-vec2(0.0,resolution.y)).rgb;
        vec3 low=min(colour,min(min(a,b),min(c,d))),high=max(colour,max(max(a,b),max(c,d)));
        colour=clamp(colour+(colour-(a+b+c+d)*0.25)*sharpen,low,high);
      }
      #endif
      #ifdef S09_VIGNETTE
      float vignette=1.0-smoothstep(0.1,0.8,distance(vUv,vec2(0.5)));
      colour*=1.-vignetteGain*(1.-vignette);
      #endif
      #ifdef S09_GRAIN
      colour+=(fract(sin(dot(gl_FragCoord.xy+time,vec2(12.9898,78.233)))*43758.5453)-0.5)*grain;
      #endif
      gl_FragColor=vec4(colour,1.0);
      `);
    this.material=new THREE.ShaderMaterial({vertexShader:FXAAShader.vertexShader,fragmentShader:fragment,toneMapped:false,depthTest:false,depthWrite:false,uniforms:{tDiffuse:{value:this.target.texture},resolution:{value:new THREE.Vector2()},useFxaa:{value:1},sharpen:{value:.12},grain:{value:.0015},time:{value:0},toneMappingExposure:{value:1.06},gradeTint:{value:new THREE.Vector3(1,1,1)},grading:{value:new THREE.Vector2(1,1)},vignetteGain:{value:.08},bloomGain:{value:0},bloom0:{value:null},bloom1:{value:null},bloom2:{value:null},bloom3:{value:null}}});
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,2,0,0,2],2));
    this.scene=new THREE.Scene();this.scene.add(new THREE.Mesh(geometry,this.material));this.camera=new THREE.Camera();
    this.size=new THREE.Vector2();
    this.fsrQuality='off';this.fsrScale=1;
    // Lazily sized; RGBA8 suffices after the existing display-referred tone map.
    this.ldrTarget=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false});
    this.upscaledTarget=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false});
    this.easuMaterial=new THREE.ShaderMaterial({
      glslVersion:THREE.GLSL3,vertexShader:FSR1_VERTEX,fragmentShader:FSR1_EASU_FRAGMENT,
      toneMapped:false,depthTest:false,depthWrite:false,
      uniforms:{tInput:{value:this.ldrTarget.texture},inputSize:{value:new THREE.Vector2(1,1)},outputSize:{value:new THREE.Vector2(1,1)}},
    });
    this.rcasMaterial=new THREE.ShaderMaterial({
      glslVersion:THREE.GLSL3,vertexShader:FSR1_VERTEX,fragmentShader:FSR1_RCAS_FRAGMENT,
      toneMapped:false,depthTest:false,depthWrite:false,
      uniforms:{tInput:{value:this.upscaledTarget.texture},outputSize:{value:new THREE.Vector2(1,1)},sharpness:{value:0.4}},
    });
    this.easuScene=new THREE.Scene();this.easuScene.add(new THREE.Mesh(geometry,this.easuMaterial));
    this.rcasScene=new THREE.Scene();this.rcasScene.add(new THREE.Mesh(geometry,this.rcasMaterial));
  }
  setUpscaling(quality='off',adaptive=1,sharpness=40) {
    this.fsrQuality=quality;
    this.fsrScale=quality==='off'?1:fsr1RenderScale(quality,adaptive);
    // RCAS is the only sharpener in FSR mode; no extra post-sharpen pass.
    this.rcasMaterial.uniforms.sharpness.value=Math.max(0,Math.min(1,Number(sharpness)/100||0));
  }
  setImage(effects,grade){
    this.effects=effects;
    const u=this.material.uniforms;
    u.gradeTint.value.fromArray(grade.tint);
    u.grading.value.set(grade.contrast,grade.saturation);
    u.vignetteGain.value=grade.vignette;
    this.grainSetting=grade.grain;
  }
  begin(quality='high'){
    const mode=this.antialias;
    const samples=mode==='msaa2'?(this.supportedSamples.includes(2)?2:0)
      : mode==='msaa4'||quality==='high'&&(mode==='auto'||mode==='on')?this.maxSamples:0;
    const fsr=this.fsrQuality!=='off'&&this.fsrScale<0.995;
    this.material.uniforms.useFxaa.value=this.antialias==='off'?0:samples>0?0:1;
    this.material.uniforms.sharpen.value=fsr?0:quality==='high'?0:.12;
    const r=this.renderer;r.getDrawingBufferSize(this.size);
    const w=Math.max(1,Math.round(this.size.x*(fsr?this.fsrScale:1)));
    const h=Math.max(1,Math.round(this.size.y*(fsr?this.fsrScale:1)));
    this.material.uniforms.resolution.value.set(1/w,1/h);
    if(mode==='smaa'){
      if(!this.smaaClass){
        this.smaaLoad??=import('./webgl-smaa.js')
          .then(({WebGlSmaa})=>{this.smaaClass=WebGlSmaa;})
          .catch(error=>console.warn('SMAA resources unavailable',error));
      }else{
        this.smaa??=new this.smaaClass();
        this.smaa.resize({x:w,y:h});
      }
    }else if(this.smaa){
      this.smaa.dispose();
      this.smaa=null;
    }
    this.smaaActive=Boolean(this.smaa?.ready);
    if(fsr){
      if(this.ldrTarget.width!==w||this.ldrTarget.height!==h)this.ldrTarget.setSize(w,h);
      if(this.upscaledTarget.width!==this.size.x||this.upscaledTarget.height!==this.size.y)this.upscaledTarget.setSize(this.size.x,this.size.y);
      this.easuMaterial.uniforms.inputSize.value.set(w,h);
      this.easuMaterial.uniforms.outputSize.value.copy(this.size);
      this.rcasMaterial.uniforms.outputSize.value.copy(this.size);
    }
    let effects;
    try{effects=this.worldEffects.configure(this.effects,w,h,samples);}
    catch(error){throw Object.assign(new Error('World post configuration failed',{cause:error}),{s09PostFault:'depth'});}
    selectSceneColor(this,this.compactSupported&&compactColorEligible(quality,effects,samples),w,h,THREE.WebGLRenderTarget);
    if(this.target.samples!==samples){this.target.dispose();this.target.samples=samples;}
    this.material.uniforms.tDiffuse.value=this.target.texture;
    if(this.smaaActive)this.material.uniforms.useFxaa.value=0;
    else if(effects&&this.worldEffects.world.depthTexture&&mode!=='off')this.material.uniforms.useFxaa.value=1;
    const worldSamples=effects&&!this.worldEffects.directWorld?this.worldEffects.world.samples:samples;
    this.activeAA=this.smaaActive?'SMAA':this.material.uniforms.useFxaa.value>.5?'FXAA':worldSamples?'MSAA '+worldSamples+'×':'Выкл.';
    this.aaFallback=mode==='smaa'&&!this.smaaActive?'SMAA ещё недоступно':mode.startsWith('msaa')&&worldSamples!==Number(mode.slice(4))?'MSAA несовместимо с активными эффектами или GPU':null;
    r.setRenderTarget(effects&&!this.worldEffects.directWorld?this.worldEffects.world:this.target);
  }
  end(time,quality,profiler){
    const r=this.renderer;r.setRenderTarget(null);const reset=r.info.autoReset;r.info.autoReset=false;
    this.material.uniforms.time.value=time;this.material.uniforms.grain.value=this.grainSetting??(quality==='low'?0:.0015);
    this.material.uniforms.toneMappingExposure.value=r.toneMappingExposure;
    const u=this.material.uniforms,g=u.gradeTint.value;
    const variant=displayVariant({fxaa:u.useFxaa.value>.5,sharpen:u.sharpen.value>0,grade:u.grading.value.x!==1||u.grading.value.y!==1||g.x!==1||g.y!==1||g.z!==1,vignette:u.vignetteGain.value!==0,grain:u.grain.value!==0});
    const bloom=this.worldEffects.bloom??[],levels=canFuseBloom(bloom.length,u.useFxaa.value>.5,u.sharpen.value>0)?bloom.length:0;
    const key=variant+':'+levels;
    if(this.displayVariant!==key){
      this.displayVariant=key;this.material.defines={S09_BLOOM_LEVELS:levels};
      ['S09_FXAA','S09_SHARPEN','S09_GRADE','S09_VIGNETTE','S09_GRAIN'].forEach((name,i)=>{if(variant[i]==='1')this.material.defines[name]=1;});
      this.material.needsUpdate=true;
    }
    try{
      this.material.uniforms.tDiffuse.value=this.worldEffects.finishBloom(this.target,profiler,levels>0);
      if(levels){u.bloomGain.value=this.worldEffects.state.bloomGain;for(let i=0;i<levels;i++)u['bloom'+i].value=bloom[i].texture;}
      const output=this.smaaActive?this.smaa.input:null;
      if(this.fsrQuality!=='off'&&this.fsrScale<0.995){
        // Display-referred low-resolution image -> EASU at native resolution
        // -> RCAS sharpening at native resolution. Keep the HTML HUD native.
        r.setRenderTarget(this.smaaActive?this.smaa.input:this.ldrTarget);renderTimed(r,this.scene,this.camera,profiler,'display');
        if(this.smaaActive){const timing=profiler?.beginPass('smaa');try{this.smaa.render(r,this.ldrTarget);}finally{if(timing)profiler.endPass();}}
        const timing=profiler?.beginPass('fsr');
        try{
          r.setRenderTarget(this.upscaledTarget);r.render(this.easuScene,this.camera);
          r.setRenderTarget(null);r.render(this.rcasScene,this.camera);
        }finally{if(timing)profiler.endPass();}
      }else{
        r.setRenderTarget(output);renderTimed(r,this.scene,this.camera,profiler,'display');
      }
      if(this.smaaActive&&!(this.fsrQuality!=='off'&&this.fsrScale<.995)){
        const timing=profiler?.beginPass('smaa');
        try{this.smaa.render(r);}
        finally{if(timing)profiler.endPass();}
      }
    }finally{this.material.uniforms.tDiffuse.value=this.target.texture;r.setRenderTarget(null);r.info.autoReset=reset;}
  }
  dispose(){
    this.worldEffects.receivers.dispose();
    this.worldEffects.dispose();
    this.smaa?.dispose();
    this.nativeTarget.dispose();this.compactTarget?.dispose();this.ldrTarget.dispose();this.upscaledTarget.dispose();
    this.scene.children[0].geometry.dispose();
    this.material.dispose();this.easuMaterial.dispose();this.rcasMaterial.dispose();
  }
}
