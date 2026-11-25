import {Vector3} from 'three';
import { directionalPenumbraScale,applyCascadeShadowBias } from './directional-penumbra.js';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import {cascadePolicy,cascadeDue} from './cascade-schedule.js';

class SizedCsm extends CSMShadowNode {
  records=[];
  direction=new Vector3();
  previousDirection=new Vector3();
  lastEpoch=-1;
  invalidated=true;
  counters={rendered:0,reused:0,frames:0,lastMask:0};

  _init(builder) {
    super._init({renderer:builder.renderer,camera:this.owner.camera});
    for(let i=0;i<this.lights.length;i++){
      const shadow=this.lights[i].shadow;
      shadow.mapSize.setScalar(this.sizes[i]);
      shadow.autoUpdate=false;
      shadow.needsUpdate=true;
      shadow.filterNode=this.light.shadow.filterNode;
    }
    this.updateFrustums();
  }
  updateFrustums(){
    super.updateFrustums();
    for(let i=0;i<this.lights.length;i++){
      const shadow=this.lights[i].shadow,camera=shadow.camera;
      if(!this.sizes)continue;
      const texel=(camera.right-camera.left)/this.sizes[i];
      // A small guard band preserves coverage while a distant cascade reuses
      // a prior transform. It is applied to a fresh stock frustum each time.
      const guard=cascadePolicy(i,texel).guard;
      camera.left-=guard;camera.right+=guard;camera.top+=guard;camera.bottom-=guard;
      camera.updateProjectionMatrix();
      applyCascadeShadowBias(shadow,Boolean(this.light.shadow.filterNode));
      if(shadow.filterNode)shadow.radius=directionalPenumbraScale(shadow);
    }
    this.invalidated=true;
  }
  updateBefore(frame){
    if(!this.camera||!this.lights.length)return;
    // Reflection/auxiliary renders can use other cameras. Never relocate a
    // main-world shadow atlas for them or schedule a second refresh.
    if(frame?.camera&&frame.camera!==this.camera)return;
    const epoch=this.owner.frameCount;
    if(this.lastEpoch===epoch&&!this.invalidated)return;
    this.lastEpoch=epoch;
    this.direction.subVectors(this.light.target.position,this.light.position).normalize();
    const sunChanged=this.previousDirection.distanceToSquared(this.direction)>1e-8;
    // Stock CSM computes candidate light positions and texel snaps.
    super.updateBefore(frame);
    let mask=0;
    for(let i=0;i<this.lights.length;i++){
      const caster=this.lights[i],shadow=caster.shadow,c=shadow.camera;
      const texel=(c.right-c.left)/shadow.mapSize.x;
      let record=this.records[i];
      const displacement=record?record.position.distanceTo(caster.position):Infinity;
      const idle=this.owner.shadowMenuIdle&&!this.invalidated&&!sunChanged&&record&&displacement<1e-6;
      const due=!idle&&cascadeDue({index:i,frame:epoch,lastFrame:record?.frame,displacement,texel,invalidated:this.invalidated,sunChanged});
      if(due){
        record??={position:new Vector3(),target:new Vector3()};
        record.position.copy(caster.position);record.target.copy(caster.target.position);record.frame=epoch;
        this.records[i]=record;
        shadow.needsUpdate=true;mask|=1<<i;this.counters.rendered++;
      }else{
        caster.position.copy(record.position);caster.target.position.copy(record.target);
        // A still-pending refresh (for example after compilation) must not
        // be cancelled. The transform remains the last committed transform.
        this.counters.reused++;
      }
      caster.updateMatrixWorld(true);caster.target.updateMatrixWorld(true);
    }
    this.counters.frames++;this.counters.lastMask=mask;
    this.previousDirection.copy(this.direction);this.invalidated=false;
  }
}

export class WebGpuCascades {
  constructor(owner, options) {
    this.owner=owner;
    const sun=owner.sun;
    const light=this.light=sun.clone();
    light.shadow.autoUpdate=false;
    light.shadow.filterNode=sun.shadow.filterNode;
    light.shadow.camera.near=1;
    light.shadow.camera.far=295;
    light.shadow.camera.updateProjectionMatrix();
    light.shadow.bias=-.00018;
    this.csm=light.shadow.shadowNode=new SizedCsm(light,options.data);
    this.csm.owner=owner;this.csm.fade=true;this.csm.sizes=options.sizes;
    sun.removeFromParent();
    owner.scene.add(light,light.target);
    this.projection=owner.camera.projectionMatrix.clone().multiplyScalar(0);
  }
  update() {
    const {owner,csm,light}=this,{sun,camera}=owner;
    camera.updateMatrixWorld();
    light.color.copy(sun.color);light.intensity=sun.intensity;
    light.position.copy(sun.position);light.target.position.copy(sun.target.position);
    if(csm.camera&&!this.projection.equals(camera.projectionMatrix)){
      this.projection.copy(camera.projectionMatrix);csm.updateFrustums();
    }
    // Commit transforms before any child shadow node renders, regardless of
    // node traversal order. Lazy first initialization still uses updateBefore.
    if(csm.camera)csm.updateBefore({camera:csm.camera});
  }
  invalidate(){this.csm.invalidated=true;}
  stats(){return {...this.csm.counters,cascades:this.csm.cascades};}
  dispose() {
    for(const node of this.csm._shadowNodes)node.dispose();
    for(const caster of this.csm.lights){
      caster.removeFromParent();caster.target.removeFromParent();
    }
    this.csm.lights.length=0;
    this.csm.dispose();
    this.light.removeFromParent();this.light.target.removeFromParent();
    this.light.dispose();
    this.owner.scene.add(this.owner.sun);
  }
}
