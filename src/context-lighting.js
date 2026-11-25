import * as THREE from 'three';
import {distanceToCover} from './viewmodel.js';
import {BLACK_HAWK} from '../shared/vehicles.js';

const clamp=(n,min=0,max=1)=>Math.min(max,Math.max(min,n));
const mix=(a,b,t)=>a+(b-a)*t;
const skyY=Math.sqrt(1-.48*.48);
const SKY_DIRECTIONS=[
  {x:0,y:1,z:0},{x:.48,y:skyY,z:0},{x:-.48,y:skyY,z:0},
  {x:0,y:skyY,z:.48},{x:0,y:skyY,z:-.48},
];
export function enclosedCabin(type,seat){
  return Number.isInteger(seat)&&seat>=0&&seat<5&&
    (type===BLACK_HAWK||type==='humvee'&&seat!==1);
}
// Approximate local shadowing without another shadow map or shader variant.
export function viewLightTargets(sunOpen,skyOpen,cabin,shadows=true){
  const sun=clamp(sunOpen),sky=clamp(skyOpen);
  const covered=cabin?Math.min(sun,.25):sun;
  const openSky=cabin?Math.min(sky,cabin===BLACK_HAWK?.68:.52):sky;
  return {direct:mix(shadows?.22:.58,1,covered),
    ambient:cabin?mix(.98,1.12,openSky):mix(.72,1,openSky),
    environment:cabin?mix(.85,1,openSky):mix(.72,1,openSky)};
}

export class ContextLighting {
  constructor(scene){
    this.scene=scene;this.sunDirection=new THREE.Vector3();
    this.cabinPosition=new THREE.Vector3();this.previousPosition=new THREE.Vector3();
    this.light=new THREE.PointLight(0xc8d3dd,0,3.4,1.5);
    this.light.name='S09 cabin diffuse bounce';this.light.castShadow=false;this.light.layers.enable(1);
    this.frontLight=new THREE.PointLight(0xffdfb8,0,4.1,1.25);
    this.frontLight.name='S09 cabin cockpit bounce';this.frontLight.castShadow=false;this.frontLight.layers.enable(1);
    this.records=[];this.resetView();
  }
  resetView(){
    this.direct=this.ambient=this.environment=1;
    this.target={direct:1,ambient:1,environment:1};
    this.nextSample=-Infinity;this.cabinType=null;
    this.previousPosition.set(Infinity,Infinity,Infinity);
  }
  update(owner,state,player,mounted,dt,boxes){
    const map=owner.map,vehicles=state.vehicles??[];
    if(this.map!==map){
      this.map=map;this.light.removeFromParent();this.frontLight.removeFromParent();this.light.intensity=this.frontLight.intensity=0;
      this.cabinId=null;this.resetView();
    }
    // Keep the number of lights stable through seat changes. Non-vehicle
    // maps don't pay for the additional point light at all.
    if(!this.light.parent&&(vehicles.some(v=>v.type===BLACK_HAWK||v.type==='humvee')||
       (map?.vehicleSpawns??[]).some(v=>v.type===BLACK_HAWK||v.type==='humvee')))this.scene.add(this.light,this.frontLight);
    const pos=owner.camera.position;
    const cabin=mounted&&enclosedCabin(mounted.vehicle.type,player?.vehicleSeat)?mounted.vehicle.type:null;
    if(owner.campaignNightVision){
      this.direct=this.ambient=this.environment=1;this.nextSample=-Infinity;
      this.cabinType=null;this.light.intensity=this.frontLight.intensity=0;this.cabinId=null;return;
    }
    if(this.light.parent){
      let selected=null,best=18*18;
      if(cabin&&mounted.vehicle.hp>0)selected=mounted;
      else for(const vehicle of vehicles){
        if(vehicle.hp<=0||(vehicle.type!==BLACK_HAWK&&vehicle.type!=='humvee'))continue;
        const rig=owner.vehicleRigs.get(vehicle.id);if(!rig?.group.visible)continue;
        const d=pos.distanceToSquared(rig.group.position);
        if(d<best){best=d;selected={vehicle,rig};}
      }
      if(selected){
        const heli=selected.vehicle.type===BLACK_HAWK;
        this.cabinPosition.set(0,heli?2.08:1.32,heli?-.72:0);
        selected.rig.body.localToWorld(this.cabinPosition);
        this.light.position.copy(this.cabinPosition);this.light.updateMatrixWorld(true);
        this.light.distance=heli?4.5:2.4;this.light.decay=1.35;
        this.light.color.copy(owner.hemiLight.color).lerp(owner.hemiLight.groundColor,.20);
        const daylight=clamp((owner.hemiLight.intensity+owner.sun.intensity*.22)/2.25,0,1.2);
        this.light.intensity=(heli?7.0:3.0)*daylight;
        this.frontLight.intensity=heli?5.7*daylight:0;
        if(heli){
          this.cabinPosition.set(0,2.15,-2.15);
          selected.rig.body.localToWorld(this.cabinPosition);
          this.frontLight.position.copy(this.cabinPosition);this.frontLight.updateMatrixWorld(true);
          this.frontLight.color.copy(owner.hemiLight.color).lerp(owner.sun.color,.42);
        }
        this.cabinId=selected.vehicle.id;
      }else{this.light.intensity=this.frontLight.intensity=0;this.cabinId=null;}
    }
    if(!owner.weapon?.visible){this.nextSample=-Infinity;return;}
    const now=owner.clock,cabinChanged=this.cabinType!==cabin;
    if(cabinChanged||now>=this.nextSample||pos.distanceToSquared(this.previousPosition)>1.44){
      const initial=this.nextSample===-Infinity;
      this.nextSample=now+.13;this.previousPosition.copy(pos);this.cabinType=cabin;
      this.sunDirection.copy(owner.sunOffset).normalize();
      let sky=0,sun=1;
      if(boxes?.length){
        sun=distanceToCover(pos,this.sunDirection,boxes,48)<47.98?0:1;
        for(const dir of SKY_DIRECTIONS)sky+=distanceToCover(pos,dir,boxes,12)>=11.98?1:0;
        sky/=SKY_DIRECTIONS.length;
      }else sky=1;
      this.target=viewLightTargets(sun,sky,cabin,owner.renderer.shadowMap.enabled);
      if(initial){this.direct=this.target.direct;this.ambient=this.target.ambient;this.environment=this.target.environment;}
    }
    const blend=1-Math.exp(-Math.max(0,dt)*8);
    this.direct=mix(this.direct,this.target.direct,blend);
    this.ambient=mix(this.ambient,this.target.ambient,blend);
    this.environment=mix(this.environment,this.target.environment,blend);
  }
  // Change light uniforms only for the independent viewmodel pass.
  // Restored immediately, including when the renderer throws.
  beginViewPass(scene){
    this.records.length=0;this.savedEnvironment=scene.environmentIntensity;
    for(const light of scene.children){
      if(!light.isLight||!light.layers.isEnabled(1))continue;
      const scale=light.isDirectionalLight?this.direct:(light.isHemisphereLight||light.isAmbientLight)?this.ambient:1;
      if(scale===1)continue;
      this.records.push(light,light.intensity);light.intensity*=scale;
    }
    if(Number.isFinite(this.savedEnvironment))scene.environmentIntensity=this.savedEnvironment*this.environment;
  }
  endViewPass(scene){
    for(let i=0;i<this.records.length;i+=2)this.records[i].intensity=this.records[i+1];
    this.records.length=0;
    if(Number.isFinite(this.savedEnvironment))scene.environmentIntensity=this.savedEnvironment;
  }
  stats(){return {direct:this.direct,ambient:this.ambient,environment:this.environment,cabin:this.cabinType,cabinLight:this.light.intensity,cockpitLight:this.frontLight.intensity,cabinId:this.cabinId??null};}
  dispose(){this.light.removeFromParent();this.frontLight.removeFromParent();this.light.dispose?.();this.frontLight.dispose?.();this.records.length=0;}
}
