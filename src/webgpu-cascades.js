import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';

class SizedCsm extends CSMShadowNode {
  _init(builder) {
    super._init(builder);
    for(let i=0;i<this.lights.length;i++){
      this.lights[i].shadow.mapSize.setScalar(this.sizes[i]);
      this.lights[i].shadow.needsUpdate=true;
      this.lights[i].shadow.normalBias=.025+.025*i;
    }
  }
}

export class WebGpuCascades {
  constructor(owner, options) {
    this.owner=owner;
    const sun=owner.sun;
    const light=this.light=sun.clone();
    light.shadow.autoUpdate=false;
    light.shadow.camera.near=1;
    light.shadow.camera.far=295;
    light.shadow.camera.updateProjectionMatrix();
    light.shadow.bias=-.00018;
    this.csm=light.shadow.shadowNode=new SizedCsm(light,options.data);
    this.csm.fade=true;
    this.csm.sizes=options.sizes;
    sun.removeFromParent();
    owner.scene.add(light,light.target);
    this.projection=owner.camera.projectionMatrix.clone().multiplyScalar(0);
    this.previousWorld=owner.camera.matrixWorld.clone().multiplyScalar(0);
    this.previousSun=sun.position.clone().setScalar(Infinity);
    this.invalidated=true;
  }

  update() {
    const {owner,csm,light}=this, {sun,camera}=owner;
    camera.updateMatrixWorld();
    light.color.copy(sun.color);light.intensity=sun.intensity;
    light.position.copy(sun.position);light.target.position.copy(sun.target.position);
    const moved=!this.previousWorld.equals(camera.matrixWorld)||!this.previousSun.equals(sun.position);
    this.previousWorld.copy(camera.matrixWorld);this.previousSun.copy(sun.position);
    if(csm.camera&&!this.projection.equals(camera.projectionMatrix)){
      this.projection.copy(camera.projectionMatrix);
      csm.updateFrustums();
      this.invalidated=true;
    }
    for(let i=0;i<csm.lights.length;i++){
      const shadow=csm.lights[i].shadow;
      shadow.needsUpdate=this.invalidated||moved||i===0||owner.frameCount%(i===1?2:4)===0;
    }
    this.invalidated=false;
  }

  invalidate() { this.invalidated=true; }

  dispose() {
    // The stock node only detaches the light placeholders, leaving the
    // per-cascade shadow textures to the individual internal nodes.
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
