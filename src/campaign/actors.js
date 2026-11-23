import {CircleGeometry,Mesh,MeshBasicMaterial,Vector3} from 'three';
import {getAssetColliders,rayCollider} from '../../shared/asset-colliders.js';
import {rayVehicleArmor} from '../../shared/vehicle-combat.js';
import {BLACK_HAWK,VEHICLE_TYPES,vehiclePartPose} from '../../shared/vehicles.js';
import {campaignCharacter} from './outcome.js';

function convoyCallsign(index){
  const number=index===3?7:index>=4&&index<=6?index:index+1;
  return `СОКОЛ-${number}`;
}

export class CampaignActors {
  constructor(){
    this.label=document.createElement('span');
    this.label.className='campaign-ally-label';
    this.label.hidden=true;
    document.body.append(this.label);
    this.direction=new Vector3();
    this.relative=new Vector3();
    this.headPosition=new Vector3();
    this.mouth=new Mesh(new CircleGeometry(1,12),new MeshBasicMaterial({color:0x291b1a}));
    this.mouth.rotation.y=Math.PI;
    this.mouth.position.set(0,-.046,-.109);
    this.mouth.visible=false;
  }
  animate(renderer,state,presentation,paused){
    const mission=state?.campaign;
    const key=mission?.radio?.key??mission?.subtitle?.key;
    const speaker=key&&presentation?.locale?.lines[key]?.speaker;
    const audio=presentation?.voice??presentation?.voiceAudio??presentation?.audio;
    const volume=speaker&&!paused?audio?.mouthOpening()??0:0;
    this.mouth.visible=volume>.04;
    if(!this.mouth.visible){this.mouth.removeFromParent();return;}
    const id=audio?.speakingActorId??(mission.missionId==='m02'?`m02-${speaker}`:({ray:'timo',kim:'rafa'})[speaker]??speaker);
    const rig=renderer.soldiers.get(id);
    if(!rig?.group.parent||!rig.group.visible||rig.head.userData.faceCovered||
      rig.head.getWorldPosition(this.headPosition).distanceToSquared(renderer.camera.position)>20**2){
      this.mouth.removeFromParent();return;
    }
    if(this.mouth.parent!==rig.head)rig.head.add(this.mouth);
    this.mouth.scale.set(.021,.002+volume*.010,1);
  }
  aim(renderer,state,self,paused){
    this.label.hidden=true;
    const mission=state?.campaign;
    if(!mission||!self?.alive||paused||mission.cutscene||mission.transfer!=null||mission.disembark||mission.failed||mission.complete)return;
    const origin=renderer.camera.position,direction=renderer.camera.getWorldDirection(this.direction);
    let best=mission.missionId==='m04'?360:mission.missionId==='m03'?150:55,head=null,name=null;
    for(const p of state.players){
      if(p.id===self.id||p.team!==self.team||!p.alive)continue;
      const rig=renderer.soldiers.get(p.id);
      if(!rig?.group.parent||!rig.group.visible)continue;
      const position=rig.head.getWorldPosition(this.headPosition);
      const torso=rig.seated?.3:p.prone?.12:p.crouching?.42:.52;
      const relative=this.relative.copy(position).sub(origin);
      relative.y-=torso*.75;
      const distance=relative.dot(direction);
      if(distance<=.4||distance>=Math.min(55,best)||relative.lengthSq()-distance**2>(torso+.20)**2)continue;
      best=distance;head={x:position.x,y:position.y+.28,z:position.z};name=campaignCharacter(p);
    }
    if(mission.missionId==='m03')for(const tank of state.vehicles){
      if(tank.type!=='tank'||tank.id===self.vehicleId||tank.hp<=0&&!(tank.wreckTime>0))continue;
      const hit=rayVehicleArmor(origin,direction,tank,best);
      if(hit>=best)continue;
      best=hit;
      name=tank.team===self.team&&tank.hp>0&&tank.convoyIndex!==undefined?convoyCallsign(tank.convoyIndex):null;
      head={x:tank.x,y:tank.y+VEHICLE_TYPES.tank.height+.38,z:tank.z};
    }
    if(mission.missionId==='m04')for(const aircraft of state.vehicles){
      if(aircraft.type!==BLACK_HAWK||aircraft.id===self.vehicleId||aircraft.team!==self.team||aircraft.hp<=0||!aircraft.callsign)continue;
      const hit=rayVehicleArmor(origin,direction,aircraft,best);
      if(hit>=best)continue;
      best=hit;name=aircraft.callsign;head=vehiclePartPose(aircraft,0,4.65,0);
    }
    if(!name)return;
    const reach=best-.18;
    const colliders=renderer.campaignCoverColliders??getAssetColliders(renderer.map);
    if((renderer.map.terrain?.raycast(origin,direction,reach)??Infinity)<reach||
      colliders.some(box=>rayCollider(origin,direction,box,reach)<reach))return;
    const projected=renderer.project(head.x,head.y,head.z);
    if(!projected.visible)return;
    this.label.textContent=name;
    this.label.style.left=`${projected.x}px`;this.label.style.top=`${projected.y}px`;
    this.label.hidden=false;
  }
}
