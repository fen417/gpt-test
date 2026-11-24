import {Vector3} from 'three';

export class HeatSources {
  constructor(state,webgpu){
    this.camera=null;
    this.source=new Vector3();
    this.state=state;
    this.webgpu=webgpu;
    this.count=0;
  }

  begin(camera,time){
    this.count=0;
    this.state.heatStrength.set(0,0,0,0);
    this.state.heatTime=time;
    this.camera=camera;
    camera.updateMatrixWorld();
  }

  add(x,y,z,radius,strength){
    if(this.count===4)return;
    const camera=this.camera, p=camera.projectionMatrix.elements;
    const view=this.source.set(x,y,z).applyMatrix4(camera.matrixWorldInverse);
    const depth=-view.z;
    if(depth<.5||depth>75)return;
    const size=Math.min(.3,radius*p[5]*.5/depth);
    if(size<.006)return;
    const screenX=.5+view.x*p[0]*.5/depth;
    const screenY=.5+view.y*p[5]*(this.webgpu?-.5:.5)/depth;
    if(screenX< -size||screenX>1+size||screenY< -size||screenY>1+size)return;
    const data=this.state.heatSources.elements, index=this.count*4;
    data[index]=screenX;data[index+1]=screenY;data[index+2]=size;data[index+3]=depth;
    this.state.heatStrength.setComponent(this.count,strength*(1-Math.min(1,Math.max(0,(depth-50)/25))));
    this.count++;
  }
}
