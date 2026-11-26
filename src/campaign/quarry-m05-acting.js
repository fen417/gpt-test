import {MathUtils, Object3D, Vector3} from 'three';
import {M05_SITES as sites,quarryPoint} from '../../shared/campaign/quarry-m05.js';

const {clamp,lerp,smoothstep}=MathUtils;
const left=-1,right=1;
const handContact=new Vector3(),worldContact=new Vector3(),transferPoint=new Vector3();
const stageFrame=new Object3D();
const at=(frame,x,y,z)=>frame.localToWorld(worldContact.set(x,y,z));
const envelope=(t,start,end,fade=.3)=>smoothstep(t,start,start+fade)*(1-smoothstep(t,end-fade,end));

function moveAlong(rig,path,t){
  const segment=Math.min(path.length-2,Math.floor(t*(path.length-1)));
  const a=path[segment],b=path[segment+1],u=smoothstep(t*(path.length-1)-segment,0,1);
  rig.group.position.copy(transferPoint.set(lerp(a.x,b.x,u),lerp(a.y,b.y,u),lerp(a.z,b.z,u)));
  rig.group.updateWorldMatrix(true,true);
}

function holdProp(prop,rig,side,weight,cup=false){
  if(!rig?.group.visible||weight<=0)return;
  const hand=rig.bones[side===right?'RightHand':'LeftHand'];
  hand.getWorldPosition(prop.position);hand.getWorldQuaternion(prop.quaternion);
  prop.translateY(.038);prop.rotateZ(side===right?.35:-.35);
  if(cup){prop.quaternion.identity();prop.position.x-=.047;prop.position.y-=.028;}
  prop.visible=true;
}

export class QuarryActing{
  constructor(group){
    const node=name=>group.getObjectByName(name);
    this.prop={tool:node('repair_tool'),bandage:node('field_dressing'),radio:node('radio_handset')};
    this.cups=[node('coffee_cup'),node('coffee_cup').clone(true)];
    group.add(this.cups[1]);
    this.panel=node('drive_panel');this.lid=node('drive_panel_lid');this.lever=node('drive_panel_lever');
    this.gatePanel=this.panel.clone(true);this.fuelPanel=this.panel.clone(true);
    group.add(this.gatePanel,this.fuelPanel);
    const place=(o,x,z)=>{const p=quarryPoint(x,z);o.position.set(p.x,p.y,p.z);};
    place(this.panel,sites.panel.x,sites.panel.z+.62);
    place(this.gatePanel,sites.gatePanel.x,sites.gatePanel.z+.62);
    place(this.fuelPanel,sites.fuelRelease.x,sites.fuelRelease.z+.62);
    this.panel.add(this.lid,this.lever);
    this.lid.position.set(0,1.285,-.13);this.lever.position.set(.19,1.0,-.13);
    const map=node('briefing_map');place(map,-221,-217);map.position.y+=.957;this.map=map;
    for(const o of [...Object.values(this.prop),...this.cups])o.visible=false;
  }

  update(renderer,state,gun){
    const {campaign:m,time}=state,scene=m.cutscene;
    for(const o of [...Object.values(this.prop),...this.cups])o.visible=false;
    const cast=new Map(state.players.map(p=>[p.actorId,p]));
    const rigOf=id=>renderer.soldiers.get(cast.get(id)?.id);
    const rafa=cast.get('rafa')?.alive?'rafa':'rafa-reserve',vos=rigOf('vos'),marten=rigOf('marten'),server=rigOf(rafa);
    const worker=cast.get('worker')?.campaignAction;
    const panelAge=worker?.key==='work-panel'?time-worker.at:0;
    this.lid.rotation.x=1.52*(m.power?1:smoothstep(panelAge,.28,1.03));
    this.lever.rotation.x=.68*(m.power?1:smoothstep(panelAge,1.42,1.92));
    const coffee=scene?.id==='C4'?scene.elapsed:-1;
    const handoff=(receiver,side)=>{
      if(!receiver?.group.visible||!server?.group.visible)return null;
      const from=at(server.group,side*.23,1.19,-.32);
      const to=receiver.group.localToWorld(new Vector3(.17,1.2,-.30));
      return to.lerp(from,.45);
    };
    const cupPoints=coffee>23&&coffee<31?[handoff(marten,right),handoff(vos,left)]:[];
    const hatch=renderer.vehicleRigs.get('sokol-7');
    const climbing=state.players.some(p=>p.campaignAction?.vehicle==='sokol-7'&&p.campaignAction.index===0);
    for(const level of [...(hatch?.levels??[]),hatch?.detail?.level]){
      if(!level?.hatch?.parent)continue;
      const cover=level.hatch;
      if(!cover.userData.hinge){
        cover.geometry.computeBoundingBox();const bounds=cover.geometry.boundingBox;
        cover.userData.hinge=new Vector3(bounds.min.x,bounds.min.y,(bounds.min.z+bounds.max.z)/2);
        cover.userData.closed=cover.position.clone();
      }
      cover.rotation.z=climbing?-.92:0;
      cover.position.copy(cover.userData.closed).add(cover.userData.hinge)
        .sub(handContact.copy(cover.userData.hinge).applyEuler(cover.rotation));
    }
    for(const p of state.players){
      const action=p.campaignAction,rig=renderer.soldiers.get(p.id);
      if(!rig?.group.visible||!p.alive||p.downed||p.vehicleId)continue;
      const key=action?.key,age=time-(action?.at??time),t=clamp(age/(action?.duration??1),0,1);
      if(action?.path)moveAlong(rig,action.path,t);
      const {group,bones}=rig;
      const grip=(side,frame,x,y,z,w=1)=>rig.poseContact(side,frame,handContact.set(x,y,z),w);
      const reach=(side,target,w)=>{
        if(!target||w<=0)return;
        stageFrame.position.copy(target);stageFrame.quaternion.copy(group.quaternion);stageFrame.updateMatrixWorld();
        grip(side,stageFrame,0,0,0,w);
      };
      const look=(pitch,yaw=0,roll=0)=>rig.poseJoint(bones.Head,pitch,yaw,roll);
      const lean=(pitch,roll=0)=>rig.poseJoint(bones.Spine1,pitch,0,roll);
      const w=action?envelope(t,0,1,.14):0;
      if(p.id==='local'&&m.mounted||key==='gun-release'){
        const weight=key==='gun-release'?1-smoothstep(t,0,.65):key==='gun-grab'?smoothstep(t,0,1):1;
        if(m.mounted){
          group.position.x=p.x+Math.sin(p.yaw)*.44*weight;
          group.position.z=p.z+Math.cos(p.yaw)*.44*weight;
        }
        group.updateWorldMatrix(true,true);
        gun.updateWorldMatrix(true,false);
        for(const side of [left,right])grip(side,gun,side*.115,-.04,.17,weight);
        if(m.mounted&&p.id==='local')rig.poseJoint(bones.Head,-.22,0,0);
        rig.rifle.visible=false;
      }else if(key==='tank-exit'||key==='tank-board'||key==='truck-board'){
        const vehicle=renderer.vehicleRigs.get(action.vehicle),frame=key==='truck-board'?null:vehicle?.body;
        lean(-.23*w);look(.22*w);
        for(const side of [left,right]){
          if(frame&&t<.66)grip(side,frame,(action.index===1?-.65:.65)+side*.2,2.29,-.36,.9);
          else grip(side,group,side*.30,1.27,-.26,w*.86);
        }
        rig.rifle.visible=false;
      }else if(key==='repair-wheel'){
        lean(-.28*w);look(.45*w);rig.rifle.visible=false;
        grip(right,group,.16,.54+.065*Math.sin(age*8),-.43,w);grip(left,group,-.28,.75,-.23,w);
        holdProp(this.prop.tool,rig,right,w);
      }else if(key==='bandage-patient'){
        grip(left,group,-.29,1.14,-.31,w);look(.24*w,-.24*w);rig.rifle.visible=false;
      }else if(key==='bandage-medic'){
        const patient=rigOf(action.target);
        const arm=patient?.bones.LeftForeArm;
        if(arm){
          arm.getWorldPosition(worldContact);
          worldContact.y+=.035*Math.cos(age*5);reach(right,worldContact,w);
          grip(left,group,-.17,1.04,-.34,w*.85);
        }
        look(.20*w);rig.rifle.visible=false;holdProp(this.prop.bandage,rig,right,w);
      }else if(key==='brief-map'){
        const slide=.22*Math.sin(age*.9);
        lean(-.4*w);look(.37*w);rig.rifle.visible=false;
        grip(right,this.map,slide,.035,-.16,w);grip(left,this.map,-.33,.04,-.21,w);
      }else if(key==='brief-listen'){
        look(.33*w,Math.sin(age*.83)*.43*w);rig.rifle.visible=false;
      }else if(key==='worker-surrender'){
        grip(left,group,-.4,1.68,-.22,w);grip(right,group,.4,1.68,-.22,w);
        look(-.07*w);
      }else if(key==='work-panel'||key==='gate-panel'||key==='fuel-panel'){
        const panel=key==='work-panel'?this.panel:key==='gate-panel'?this.gatePanel:this.fuelPanel;
        if(key==='work-panel'&&age<1.07)grip(right,this.lid,.22,-.31,-.07,w);
        else if(key==='work-panel')grip(right,this.lever,0,.14,-.125,w);
        else grip(right,panel,.15,1.12,-.19,w);
        lean(-.18*w);look(.29*w);rig.rifle.visible=false;
      }else if(key==='blast-brace'){
        lean(-.33*w);look(.37*w,.24*w);
        grip(left,group,.03,1.53,-.30,w);rig.rifle.visible=false;
      }else if(key==='rest-armor'){
        lean(-.10,-.12);look(.08,.24);rig.rifle.visible=false;
        grip(left,group,-.32,1.05,.03,.75);
      }else if(key==='radio'){
        grip(right,group,.105,1.51,-.27,.96);look(.12,-.21);rig.rifle.visible=false;
        holdProp(this.prop.radio,rig,right,1);
      }else if(key==='adjust-strap'){
        look(.12,.2);grip(right,group,-.09,1.37,-.18,.83);rig.rifle.visible=false;
      }else if(key==='look-storm'){
        look(-.14*w,.6*w);rig.rifle.visible=false;
      }else if(key==='coffee-hold'||key==='coffee-serve'){
        rig.rifle.visible=false;
      }
    }
    if(coffee>=18&&coffee<33){
      for(const [i,receiver] of [marten,vos].entries()){
        const side=i===0?right:left,handoffAt=26+i*2,point=cupPoints[i],received=coffee>=handoffAt;
        const hand=received?right:side,holder=received?receiver:server;
        if(point){
          stageFrame.position.copy(point);stageFrame.quaternion.identity();stageFrame.updateMatrixWorld();
          const weight=envelope(coffee,handoffAt-1.5,handoffAt+1,.55);
          server?.poseContact(side,stageFrame,handContact.set(0,0,0),weight);
          receiver?.poseContact(right,stageFrame,handContact.set(0,0,0),weight);
        }
        if(holder?.group.visible){
          holder.poseContact(hand,holder.group,handContact.set(hand*.22,1.22,-.29),point ? .26 : .9);
          holdProp(this.cups[i],holder,hand,1,true);
        }
      }
    }
  }
}
