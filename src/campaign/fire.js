import * as THREE from 'three';
import {makeParticleTexture} from '../effect-art.js';

// The flame silhouette is a real curved, closed-in-cross-section 3D mesh,
// not a camera-facing plane. Only smoke retains conventional billboards.
const SIDES=12,RINGS=12,TAU=Math.PI*2;
export function createFlameGeometry(){
  const geometry=new THREE.BufferGeometry();
  const positions=new Float32Array((SIDES+1)*(RINGS+1)*3),uv=new Float32Array((SIDES+1)*(RINGS+1)*2),indices=[];
  for(let j=0;j<=RINGS;j++)for(let i=0;i<=SIDES;i++){
    const n=j*(SIDES+1)+i;uv[n*2]=i/SIDES;uv[n*2+1]=j/RINGS;
    if(j<RINGS&&i<SIDES){const a=n,b=n+SIDES+1;indices.push(a,b,a+1,a+1,b,b+1);}
  }
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.setIndex(indices);
  geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,.5,0),1.05);
  animateFlameGeometry(geometry,0,0);
  return geometry;
}
export function animateFlameGeometry(geometry,time,seed){
  const pos=geometry.attributes.position,t=time*.8;
  for(let j=0;j<=RINGS;j++){
    const y=j/RINGS,tip=Math.pow(y,1.65);
    const cx=tip*(.19*Math.sin(t*1.7+y*4.2+seed)+.09*Math.sin(y*8.2-t*2.3+seed));
    const cz=tip*(.17*Math.cos(t*1.3+y*3.8+seed)+.08*Math.sin(y*7.6-t*1.9+seed*1.3));
    const radius=(.025+.33*Math.pow(Math.max(0,1-y),.78))*(.82+.18*Math.sin(y*7.1-t*2.2+seed));
    for(let i=0;i<=SIDES;i++){
      const angle=i/SIDES*TAU,warp=1+.17*Math.sin(angle*3+y*5.2-t*2+seed)+.10*Math.sin(angle*2-y*8+t*1.7);
      pos.setXYZ(j*(SIDES+1)+i,cx+Math.cos(angle)*radius*warp,y,cz+Math.sin(angle)*radius*warp*.78);
    }
  }
  pos.needsUpdate=true;geometry.computeVertexNormals();
  // Weld the UV seam normals, retaining wrapped UVs for the shader.
  const normal=geometry.attributes.normal;
  for(let j=0;j<=RINGS;j++){
    const a=j*(SIDES+1),b=a+SIDES,x=normal.getX(a)+normal.getX(b),y=normal.getY(a)+normal.getY(b),z=normal.getZ(a)+normal.getZ(b),l=Math.hypot(x,y,z)||1;
    normal.setXYZ(a,x/l,y/l,z/l);normal.setXYZ(b,x/l,y/l,z/l);
  }
  normal.needsUpdate=true;
}

const flameFragment=`
  varying vec2 uvFire;varying vec3 fireNormal;varying vec3 fireView;
  uniform float time;uniform float seed;uniform float detail;uniform float vehicleFire;
  void main(){
    float y=uvFire.y,a=uvFire.x*6.2831853,t=time*.62;
    float flow=y*10.-t*3.5+seed;
    float bands=.5+.5*sin(a*3.+sin(flow)*1.4-flow*.72);
    float eddies=.5+.5*sin(a*5.-flow*1.1+sin(a*2.+flow)*1.2);
    float density=smoothstep(.16,.78,bands*.68+eddies*.32);
    if(detail>.5){
      float fine=.5+.5*sin(a*8.+flow*1.7+sin(a*4.-flow));
      density*=.78+.22*fine;
    }
    float rim=smoothstep(.04,.72,abs(dot(normalize(fireNormal),normalize(fireView))));
    float tip=.78+.12*sin(a*2.+flow*.65)+.07*sin(a*3.-flow);
    float alpha=(.24+.76*density)*rim*smoothstep(0.,.10,y)*(1.-smoothstep(tip-.18,tip+.11,y));
    vec3 color=mix(vec3(1.,.60,.10),vec3(.83,.075,.006),smoothstep(.14,.92,y));
    float hot=smoothstep(.52,.88,bands)*(1.-smoothstep(.2,.72,y));
    color=mix(color,vec3(1.,.88,.37),hot*.72);
    alpha*=vehicleFire>.5?.56:.63;
    if(alpha<.008)discard;
    gl_FragColor=vec4(color,alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const uniforms=material=>material.userData.fireUniforms??material.uniforms;

function flameMaterial(renderer,seed,vehicle){
  return renderer.webgpu?.webGpuCampaignFlame(seed,vehicle)??new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.FrontSide,blending:THREE.NormalBlending,toneMapped:false,
    uniforms:{time:{value:0},seed:{value:seed},detail:{value:0},vehicleFire:{value:Number(vehicle)}},
    vertexShader:'varying vec2 uvFire;varying vec3 fireNormal;varying vec3 fireView;void main(){uvFire=uv;vec4 p=modelViewMatrix*vec4(position,1.);fireNormal=normalMatrix*normal;fireView=-p.xyz;gl_Position=projectionMatrix*p;}',
    fragmentShader:flameFragment,
  });
}
const tongueOffsets=[[0,0,1,.90],[-.28,.13,.73,.72],[.26,-.18,.84,.68],[.08,.31,.55,.60]];
function setTongues(planes,e,time,reduced=false,distance=0){
  const phase=(e.x*.037+e.z*.029),yaw=e.yaw??phase;
  const layers=reduced||distance>55**2?2:4;
  for(const [i,mesh] of planes.entries()){
    mesh.visible=i<layers;if(!mesh.visible)continue;
    const [x,z,h,w]=tongueOffsets[i];
    const height=e.height*h*(1+.12*Math.sin(time*1.45+phase+i*2.1)+.045*Math.sin(time*2.8+phase+i));
    mesh.position.set(x*e.width,e.vehicle?-.12:-.035,z*e.width);
    mesh.rotation.y=yaw+i*1.83;
    mesh.scale.set(e.width*w,height,e.width*w);
  }
}

export class WreckFire {
  constructor(renderer,parent){
    this.renderer=renderer;this.root=new THREE.Group();parent.add(this.root);
    this.geometries=Array.from({length:4},()=>createFlameGeometry());this.slots=[];this.sources=[];
    this.materials=Array.from({length:4},(_,i)=>flameMaterial(renderer,i*3.71,true));
  }
  begin(){this.sources.length=0;}
  add(source){this.sources.push(source);}
  slot(index){
    if(this.slots[index])return this.slots[index];
    const group=new THREE.Group();this.root.add(group);
    const planes=this.geometries.map((geometry,i)=>{
      const mesh=new THREE.Mesh(geometry,this.materials[i]);group.add(mesh);return mesh;
    });
    return this.slots[index]={group,planes};
  }
  update(camera,time,reduced=false){
    const distance=e=>(e.x-camera.position.x)**2+(e.y-camera.position.y)**2+(e.z-camera.position.z)**2;
    this.sources.sort((a,b)=>distance(a)-distance(b));
    const count=Math.min(this.sources.length,reduced?5:9);
    if(count)for(const [i,material] of this.materials.entries()){
      const u=uniforms(material);u.time.value=time+i*.37;u.detail.value=Number(!reduced);
      animateFlameGeometry(this.geometries[i],time,i*3.71);
    }
    for(let i=0;i<count;i++){
      const e=this.sources[i],slot=this.slot(i);
      slot.group.visible=true;slot.group.position.set(e.x,e.y,e.z);
      setTongues(slot.planes,e,time,reduced,distance(e));
    }
    for(let i=count;i<this.slots.length;i++)this.slots[i].group.visible=false;
  }
  clear(){this.sources.length=0;for(const slot of this.slots)slot.group.visible=false;}
  dispose(){this.root.removeFromParent();for(const geometry of this.geometries)geometry.dispose();for(const material of this.materials)material.dispose();}
}

export class CampaignFire {
  constructor(renderer,parent,emitters){
    this.renderer=renderer;this.root=new THREE.Group();parent.add(this.root);this.emitters=[];
    this.plane=new THREE.PlaneGeometry(1,1);this.flameGeometries=Array.from({length:4},()=>createFlameGeometry());this.materials=[];this.dummy=new THREE.Object3D();
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
      const planes=[];for(let i=0;i<4;i++){
        const seed=this.emitters.length*3+i*4.2;
        const material=flameMaterial(renderer,seed,vehicle);
        this.materials.push(material);const mesh=new THREE.Mesh(this.flameGeometries[i],material);group.add(mesh);planes.push(mesh);
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
    for(const [i,geometry] of this.flameGeometries.entries())animateFlameGeometry(geometry,time,i*3.71);
    for(const [index,e] of this.emitters.entries()){
      const active=activeIds?activeIds.has(e.id):e.id.startsWith('fuel')?mission.fuel.some(f=>f.destroyed&&Math.hypot(f.x-e.x,f.z-e.z)<8):mission.trucks.some(t=>t.id===e.id&&t.destroyed);
      const anchor=e.vehicle?anchorFor?.(e.id):null;
      e.group.visible=active&&(!e.vehicle||Boolean(anchor));if(!e.group.visible)continue;
      if(anchor){e.x=anchor.x;e.y=anchor.y;e.z=anchor.z;e.group.position.copy(anchor);}
      if(this.renderer.graphicsEffects?.heatDistortion==='high')this.renderer.activeHeatFires.push(e);
      if(this.renderer.graphicsEffects?.fireLighting==='high')this.renderer.activeFireLights.push(e);
      e.planes.forEach(mesh=>{const u=uniforms(mesh.material);u.time.value=time;u.detail.value=Number(high);});
      setTongues(e.planes,e,time,!high,(camera.position.x-e.x)**2+(camera.position.z-e.z)**2);
      uniforms(e.glow.material).strength.value=.16+Math.sin(time*1.7+index)*.025;
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
  dispose(){this.root.removeFromParent();this.plane.dispose();for(const geometry of this.flameGeometries)geometry.dispose();this.smokeGeometry.dispose();this.smokeTexture.dispose();this.detailedSmoke?.dispose();for(const m of this.materials)m.dispose();this.smoke.dispose();}
}
