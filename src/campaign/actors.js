import {CircleGeometry,Mesh,MeshBasicMaterial,Vector3} from 'three';
import {getAssetColliders,rayCollider} from '../../shared/asset-colliders.js';
import {campaignCharacter} from './outcome.js';

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
    const id=mission.missionId==='m02'?`m02-${speaker}`:({ray:'timo',kim:'rafa'})[speaker]??speaker;
    const rig=renderer.soldiers.get(id);
    if(!rig?.group.parent||!rig.group.visible||
      rig.head.getWorldPosition(this.headPosition).distanceToSquared(renderer.camera.position)>20**2){
      this.mouth.removeFromParent();return;
    }
    if(this.mouth.parent!==rig.head)rig.head.add(this.mouth);
    this.mouth.scale.set(.021,.002+volume*.010,1);
  }
  aim(renderer,state,self,paused){
    this.label.hidden=true;
    const mission=state?.campaign;
    if(!mission||!self?.alive||paused||mission.cutscene||mission.failed||mission.complete)return;
    const origin=renderer.camera.position,direction=renderer.camera.getWorldDirection(this.direction);
    let best=55,head=null,ally=null;
    for(const p of state.players){
      if(p.id===self.id||p.team!==self.team||!p.alive)continue;
      const rig=renderer.soldiers.get(p.id);
      if(!rig?.group.parent||!rig.group.visible)continue;
      const position=rig.head.getWorldPosition(this.headPosition);
      const torso=rig.seated?.3:p.prone?.12:p.crouching?.42:.52;
      const relative=this.relative.copy(position).sub(origin);
      relative.y-=torso*.75;
      const distance=relative.dot(direction);
      if(distance<=.4||distance>=best||relative.lengthSq()-distance**2>(torso+.20)**2)continue;
      best=distance;head={x:position.x,y:position.y+.28,z:position.z};ally=p;
    }
    if(!ally)return;
    const reach=best-.18;
    const colliders=renderer.campaignCoverColliders??getAssetColliders(renderer.map);
    if((renderer.map.terrain?.raycast(origin,direction,reach)??Infinity)<reach||
      colliders.some(box=>rayCollider(origin,direction,box,reach)<reach))return;
    const projected=renderer.project(head.x,head.y,head.z);
    if(!projected.visible)return;
    this.label.textContent=campaignCharacter(ally);
    this.label.style.left=`${projected.x}px`;this.label.style.top=`${projected.y}px`;
    this.label.hidden=false;
  }
}
