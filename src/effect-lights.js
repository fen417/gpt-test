import * as THREE from 'three';
export const lightCapacity=(muzzle,fire)=>Math.max(muzzle==='high'?3:muzzle==='low'?1:0,fire==='high'?2:0);
export function flashEnvelope(age,life){
  if(age<0||age>=life)return 0;
  return Math.pow(1-age/life,1.55);
}
// Lights remain attached at a fixed count while the option is enabled. No
// per-shot allocations of lights, no shadow maps, and no extra world render.
export class EffectLights{
  constructor(scene){this.scene=scene;this.lights=[];this.pulses=[];this.active=0;}
  configure(muzzle,fire){
    this.muzzle=muzzle;this.fire=fire;
    const count=lightCapacity(muzzle,fire);
    if(this.lights.length===count)return;
    this.clear();
    while(this.lights.length>count){const light=this.lights.pop();light.removeFromParent();light.dispose?.();}
    while(this.lights.length<count){
      const light=new THREE.PointLight(0xffcc94,0,8,2);
      // World lighting must not illuminate the separate camera-space weapon pass.
      // Layer 0 keeps the shader light count fixed in each pass, avoiding recompilation per shot.
      light.name='S09 transient effect light';light.layers.set(0);light.castShadow=false;
      this.scene.add(light);this.lights.push(light);
    }
  }
  pulse(position,clock,{own=false,energy=34,range=7,life=.065,color=0xffc994}={}){
    if(!this.lights.length||this.muzzle==='off'||!this.muzzle)return;
    if(![position.x,position.y,position.z,clock].every(Number.isFinite))return;
    if(this.muzzle==='low'&&!own)return;
    if(this.pulses.length>=24)this.pulses.shift();
    this.pulses.push({position:position.clone(),at:clock,own,energy,range,life,color});
  }
  update(clock,camera,fires=[]){
    this.active=0;
    if(!this.lights.length)return;
    const candidates=[];
    for(let i=this.pulses.length-1;i>=0;i--){
      const p=this.pulses[i],a=flashEnvelope(clock-p.at,p.life);
      if(a<=0){this.pulses.splice(i,1);continue;}
      if(this.muzzle==='off'||!this.muzzle||(this.muzzle==='low'&&!p.own))continue;
      const d=camera.distanceToSquared(p.position);
      if(d>(p.own?20:48)**2)continue;
      candidates.push({...p,intensity:p.energy*a,score:(p.own?1000:0)+p.energy*a/(1+d*.06)});
    }
    if(this.fire==='high')for(const e of fires){
      const x=e.x,y=e.y+e.height*.55,z=e.z,d=(camera.x-x)**2+(camera.y-y)**2+(camera.z-z)**2;
      if(d>42**2)continue;
      const intensity=Math.min(35,9+e.width*5)*(1+.18*Math.sin(clock*13+x*.4)+.10*Math.sin(clock*21+z));
      candidates.push({position:new THREE.Vector3(x,y,z),intensity,range:Math.min(13,e.width*2+5),color:0xff8b38,score:intensity/(1+d*.07)});
    }
    candidates.sort((a,b)=>b.score-a.score);
    for(let i=0;i<this.lights.length;i++){
      const l=this.lights[i],p=candidates[i];
      if(!p){l.intensity=0;continue;}
      l.position.copy(p.position);l.color.setHex(p.color);l.distance=p.range;l.intensity=p.intensity;this.active++;
    }
  }
  clear(){this.pulses.length=0;this.active=0;for(const l of this.lights)l.intensity=0;}
  dispose(){this.clear();for(const l of this.lights){l.removeFromParent();l.dispose?.();}this.lights.length=0;}
}
