import * as THREE from 'three';
import {distanceToCover} from './viewmodel.js';
const fixtures=[[-8.5,-4.8,3.02],[-8.4,4.5,3.02],[0,1.6,3.03],[5.7,4.8,3.01],[10.3,-4.2,3.03],[-8.8,-4.3,6.25],[6.2,-.8,6.25],[-8.5,4.3,6.25]].map(([x,z,y])=>new THREE.Vector3(x,y-.20,z));
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
export function estateInterior(x,y,z){return Math.abs(x)<13.85&&Math.abs(z)<6.85&&y>=.10&&y<6.51;}
export function lampContribution(distance,cosine){
  return distance<5.6?(.055+.24*Math.max(0,cosine))/(1+.34*distance*distance)*Math.pow(1-distance/5.6,2):0;
}
// Relight the existing charts once during map preparation, preserving AO alpha.
export function relightEstateAtlas(texture,charts,candidates,map){
  const data=texture.image.data,size=texture.image.width;
  const walls=map.boxes.filter(b=>b.kind==='wall'||b.kind==='village-floor');
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),center=new THREE.Vector3(),normal=new THREE.Vector3(),edge=new THREE.Vector3(),ray=new THREE.Vector3(),sample=new THREE.Vector3();
  const visible=[];let patched=0;
  for(const {mesh,entry} of candidates){
    const g=mesh.geometry,p=g.attributes.position,index=g.index;
    for(let i=0;i<entry.count;i+=3){
      const k=entry.offset+i,x=charts[k],y=charts[k+1],s=charts[k+2];
      if(s<4||x+s>size||y+s>size)continue;
      a.fromBufferAttribute(p,index?index.getX(i):i).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(p,index?index.getX(i+1):i+1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(p,index?index.getX(i+2):i+2).applyMatrix4(mesh.matrixWorld);
      center.copy(a).add(b).add(c).multiplyScalar(1/3);
      if(!estateInterior(center.x,center.y,center.z))continue;
      normal.subVectors(b,a).cross(edge.subVectors(c,a)).normalize();
      visible.length=0;
      for(const lamp of fixtures){
        if((center.y<3.18)!==(lamp.y<3.18))continue;
        ray.subVectors(lamp,center);const d=ray.length();if(d>=5.6||d<.10)continue;
        ray.multiplyScalar(1/d);sample.copy(center).addScaledVector(ray,.055);
        if(distanceToCover(sample,ray,walls,d-.09)>=d-.10)visible.push(lamp);
      }
      for(let j=0;j<s;j++)for(let i0=0;i0<s;i0++){
        let u=clamp((i0-1)/(s-3)),v=clamp((j-1)/(s-3));if(u+v>1){const sum=u+v;u/=sum;v/=sum;}
        sample.copy(a).multiplyScalar(1-u-v).addScaledVector(b,u).addScaledVector(c,v);
        if(!estateInterior(sample.x,sample.y,sample.z))continue;
        let warm=0;
        for(const lamp of visible){ray.subVectors(lamp,sample);const d=ray.length();if(d>.001)warm+=lampContribution(d,normal.dot(ray)/d);}
        const off=((y+j)*size+x+i0)*4,bounce=.064+.035*(data[off+3]/255);
        data[off]=Math.min(255,Math.round(data[off]+255*(bounce+warm)));
        data[off+1]=Math.min(255,Math.round(data[off+1]+255*(bounce+warm*.88)));
        data[off+2]=Math.min(255,Math.round(data[off+2]+255*(bounce+warm*.72)));
      }
      patched++;
    }
  }
  if(patched)texture.needsUpdate=true;
  return patched;
}
