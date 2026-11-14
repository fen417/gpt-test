import * as THREE from 'three';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

export class PostPass {
  constructor(renderer){
    this.renderer=renderer;this.target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:true});
    const fragment=FXAAShader.fragmentShader.replace('void main() {',`uniform float sharpen;uniform float grain;uniform float time;
      #include <tonemapping_pars_fragment>
      void main() {`).replace('gl_FragColor = ApplyFXAA( tDiffuse, resolution.xy, vUv );',`
      vec3 colour=ApplyFXAA(tDiffuse,resolution.xy,vUv).rgb;
      vec3 a=texture2D(tDiffuse,vUv+vec2(resolution.x,0.0)).rgb,b=texture2D(tDiffuse,vUv-vec2(resolution.x,0.0)).rgb;
      vec3 c=texture2D(tDiffuse,vUv+vec2(0.0,resolution.y)).rgb,d=texture2D(tDiffuse,vUv-vec2(0.0,resolution.y)).rgb;
      vec3 low=min(colour,min(min(a,b),min(c,d))),high=max(colour,max(max(a,b),max(c,d)));
      colour=clamp(colour+(colour-(a+b+c+d)*0.25)*sharpen,low,high);
      colour=ACESFilmicToneMapping(colour);
      float vignette=smoothstep(0.8,0.1,distance(vUv,vec2(0.5)));
      colour*=mix(0.92,1.0,vignette);
      colour+=(fract(sin(dot(gl_FragCoord.xy+time,vec2(12.9898,78.233)))*43758.5453)-0.5)*grain;
      gl_FragColor=vec4(colour,1.0);
      #include <colorspace_fragment>
      `);
    this.material=new THREE.ShaderMaterial({vertexShader:FXAAShader.vertexShader,fragmentShader:fragment,toneMapped:false,depthTest:false,depthWrite:false,uniforms:{tDiffuse:{value:this.target.texture},resolution:{value:new THREE.Vector2()},sharpen:{value:.12},grain:{value:.0015},time:{value:0},toneMappingExposure:{value:1.06}}});
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,2,0,0,2],2));
    this.scene=new THREE.Scene();this.scene.add(new THREE.Mesh(geometry,this.material));this.camera=new THREE.Camera();
    this.size=new THREE.Vector2();
  }
  begin(){
    const r=this.renderer;r.getDrawingBufferSize(this.size);
    if(this.target.width!==this.size.x||this.target.height!==this.size.y)this.target.setSize(this.size.x,this.size.y);
    this.material.uniforms.resolution.value.set(1/this.size.x,1/this.size.y);
    r.setRenderTarget(this.target);
  }
  end(time,quality){
    const r=this.renderer;r.setRenderTarget(null);const reset=r.info.autoReset;r.info.autoReset=false;
    this.material.uniforms.time.value=time;this.material.uniforms.grain.value=quality==='low'?0:.0015;
    this.material.uniforms.toneMappingExposure.value=r.toneMappingExposure;
    try{r.render(this.scene,this.camera);}finally{r.info.autoReset=reset;}
  }
  dispose(){this.target.dispose();this.scene.children[0].geometry.dispose();this.material.dispose();}
}
