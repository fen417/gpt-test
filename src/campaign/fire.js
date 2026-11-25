import {tankFlameCenter} from '../combat-visuals.js';
import * as THREE from 'three';
import {makeParticleTexture} from '../effect-art.js';

const flameFragment=`
  varying vec2 uvFire;uniform float time;uniform float seed;uniform float detail;uniform float vehicleFire;
  float noise(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  void main(){
    vec2 p=uvFire;float y=p.y;
    float wobble=sin(y*11.-time*5.+seed)*.07+sin(y*24.-time*9.+seed*2.)*.035;
    float width=(1.-y)*.46+.035;float x=abs(p.x-.5+wobble);
    float edge=1.-smoothstep(width*.45,width,x);
    float tongues=.72+.18*sin(p.x*28.+time*7.+seed)+.10*sin(p.x*47.-time*4.);
    float alpha=edge*(1.-smoothstep(tongues-.18,tongues+.12,y))*smoothstep(0.,.07,y);
    alpha*=.75+.18*sin(y*31.-time*12.+seed);
    vec3 color=mix(vec3(1.,.92,.42),vec3(1.,.28,.025),smoothstep(.1,.8,y));
    if(detail>.5){
      float t=y*23.-time*7.+seed;
      float cells=.5+.5*sin(p.x*39.+sin(t)*2.8+t*.6)*sin(p.x*17.-t*1.2);
      float hot=smoothstep(.30,.86,cells)*(1.-smoothstep(.3,.9,y));
      alpha*=.62+.38*cells;color=mix(color,vec3(1.,.98,.70),hot*.72)*1.45;
    }
    if(alpha<.025)discard;
    if(vehicleFire>.5){
      // Normal alpha blending retains orange flames against bright sky.
      vec3 orange=mix(vec3(1.,.48,.055),vec3(.88,.085,.008),smoothstep(.10,.85,y));
      color=mix(orange,orange*color,.28);
      gl_FragColor=vec4(color*.95,alpha*.92);
    }else gl_FragColor=vec4(color*1.5,alpha*.85);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const uniforms=material=>material.userData.fireUniforms??material.uniforms;

export class CampaignFire {
  constructor(renderer,parent,emitters){
    this.renderer=renderer;this.root=new THREE.Group();parent.add(this.root);this.emitters=[];
    this.plane=new THREE.PlaneGeometry(1,1);this.materials=[];this.dummy=new THREE.Object3D();
    const smokeCanvas=document.createElement('canvas');smokeCanvas.width=smokeCanvas.height=96;
    const ctx=smokeCanvas.getContext('2d'),pixels=ctx.createImageData(96,96);
    for(let y=0;y<96;y++)for(let x=0;x<96;x++){
      const r=Math.hypot((x-48)/48,(y-48)/48),grain=.76+.12*Math.sin(x*.23+y*.13)+.12*Math.cos(x*.35-y*.21),i=(y*96+x)*4;
      pixels.data.set([255,255,255,Math.round(Math.max(0,1-r*r)*Math.max(0,1-r)*grain*190)],i);
    }
    ctx.putImageData(pixels,0,0);this.smokeTexture=new THREE.CanvasTexture(smokeCanvas);
    const gpu=renderer.webgpu;
    const smokeMaterial=gpu?.webGpuCampaignSmoke(this.smokeTexture)??new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{map:{value:this.smokeTexture},tint:{value:new THREE.Color('#62605a')}},vertexShader:'attribute float smokeOpacity;varying float opacitySmoke;varying vec2 uvSmoke;void main(){uvSmoke=uv;opacitySmoke=smokeOpacity;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',fragmentShader:'uniform sampler2D map;uniform vec3 tint;varying float opacitySmoke;varying vec2 uvSmoke;void main(){float a=texture2D(map,uvSmoke).a*opacitySmoke;if(a<.01)discard;gl_FragColor=vec4(tint,a);}'});
    this.smokeMaterial=smokeMaterial;this.materials.push(smokeMaterial);this.smokeGeometry=this.plane.clone();
    this.opacities=new THREE.InstancedBufferAttribute(new Float32Array(48),1);this.smokeGeometry.setAttribute('smokeOpacity',this.opacities);
    this.smoke=new THREE.InstancedMesh(this.smokeGeometry,smokeMaterial,48);this.smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.smoke.frustumCulled=false;this.smoke.count=0;this.root.add(this.smoke);
    const add=(id,x,z,width,height,vehicle=false)=>{
      const y=renderer.map.terrain.heightAt(x,z),group=new THREE.Group();group.position.set(x,y,z);this.root.add(group);
      const planes=[];for(let i=0;i<2;i++){
        const seed=this.emitters.length*3+i*4.2;
        const material=gpu?.webGpuCampaignFlame(seed,vehicle)??new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:vehicle?THREE.NormalBlending:THREE.AdditiveBlending,uniforms:{time:{value:0},seed:{value:seed},detail:{value:0},vehicleFire:{value:Number(vehicle)}},vertexShader:'varying vec2 uvFire;void main(){uvFire=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:flameFragment});
        this.materials.push(material);const mesh=new THREE.Mesh(this.plane,material);mesh.scale.set(width,height,1);mesh.position.y=vehicle?tankFlameCenter(height):height*.48;group.add(mesh);planes.push(mesh);
      }
      const glowMaterial=gpu?.webGpuCampaignGlow()??new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{strength:{value:.2}},vertexShader:'varying vec2 uvGlow;void main(){uvGlow=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 uvGlow;uniform float strength;void main(){float a=pow(max(0.,1.-length(uvGlow-.5)*2.),2.)*strength;gl_FragColor=vec4(1.,.28,.025,a);}'});
      this.materials.push(glowMaterial);const glow=new THREE.Mesh(this.plane,glowMaterial);glow.rotation.x=-Math.PI/2;glow.position.y=.05;glow.scale.setScalar(width*4.2);group.add(glow);glow.visible=!vehicle;
      this.emitters.push({id,x,y,z,width,height,group,planes,glow,vehicle});
    };
    if(emitters)for(const {id,x,z,width,height,vehicle} of emitters)add(id,x,z,width,height,vehicle);
    else{
      add('fuel-west',11,35,2.8,3.7);add('fuel-east',19,35,2.6,3.4);
      for(const [i,x] of [0,21,42].entries())add('truck-'+i,x,24,3.5,4.7);
    }
  }
  update(mission,time,camera,activeIds,anchorFor){
    let count=0;
    const high=this.renderer.graphicsEffects?.fireEffects==='high';
    const detailed=this.renderer.graphicsEffects?.smoke==='high'||this.renderer.graphicsEffects?.smoke==='medium';
    // Use the shared irregular puff texture only in enhanced mode; preserve the original campaign smoke otherwise.
    if(detailed!==this.detailed){
      this.detailed=detailed;
      const tex=detailed?(this.detailedSmoke??=makeParticleTexture('smoke')):this.smokeTexture;
      const old=this.smokeMaterial;
      if(this.renderer.webgpu){const mat=this.renderer.webgpu.webGpuCampaignSmoke(tex);this.smoke.material=this.smokeMaterial=mat;this.materials[this.materials.indexOf(old)]=mat;old.dispose();}
      else old.uniforms.map.value=tex;
    }
    for(const [index,e] of this.emitters.entries()){
      const active=activeIds?activeIds.has(e.id):e.id.startsWith('fuel')?mission.fuel.some(f=>f.destroyed&&Math.hypot(f.x-e.x,f.z-e.z)<8):mission.trucks.some(t=>t.id===e.id&&t.destroyed);
      const anchor=e.vehicle?anchorFor?.(e.id):null;
      e.group.visible=active&&(!e.vehicle||Boolean(anchor));if(!e.group.visible)continue;
      if(anchor){e.x=anchor.x;e.y=anchor.y;e.z=anchor.z;e.group.position.copy(anchor);}
      if(this.renderer.graphicsEffects?.heatDistortion==='high')this.renderer.activeHeatFires.push(e);
      if(this.renderer.graphicsEffects?.fireLighting==='high')this.renderer.activeFireLights.push(e);
      e.planes.forEach((mesh,i)=>{const u=uniforms(mesh.material);u.time.value=time;u.detail.value=Number(high);mesh.rotation.y=Math.atan2(camera.position.x-e.x,camera.position.z-e.z)+i*.9;mesh.scale.y=e.height*(1+Math.sin(time*4+index+i)*(high?.12:.07));if(e.vehicle)mesh.position.y=tankFlameCenter(mesh.scale.y);});
      uniforms(e.glow.material).strength.value=.16+Math.sin(time*5+index)*.025;
      for(let n=0;n<8&&count<this.smoke.instanceMatrix.count;n++){
        const phase=((time*.12+n/8+index*.117)%1),age=phase*8,spread=e.width*(.45+phase*.7);
        this.dummy.position.set(e.x+Math.sin(index*11+n*3.1)*spread+age*.32,e.y+e.height*(e.vehicle?.32:.7)+age*1.45,e.z+Math.cos(index*7+n*2.3)*spread+age*.12);
        this.dummy.quaternion.copy(camera.quaternion);this.dummy.rotateZ(Math.sin(n*9+index)*.6);this.dummy.scale.setScalar(e.width*(.65+phase*2.1));this.dummy.updateMatrix();this.smoke.setMatrixAt(count,this.dummy.matrix);
        this.opacities.setX(count,Math.sin(phase*Math.PI)*.68);count++;
      }
    }
    this.smoke.count=count;this.smoke.instanceMatrix.needsUpdate=true;this.opacities.needsUpdate=true;
    uniforms(this.smokeMaterial).tint.value.set(mission.light==='dawn'?'#514b41':'#77716a');
  }
  dispose(){this.root.removeFromParent();this.plane.dispose();this.smokeGeometry.dispose();this.smokeTexture.dispose();this.detailedSmoke?.dispose();for(const m of this.materials)m.dispose();this.smoke.dispose();}
}
