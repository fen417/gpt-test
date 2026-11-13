import * as THREE from 'three';

// Reuse one small tube mesh while its two attachments move independently.
export function createEquipmentCable(material) {
  const segments=20,sides=6,radius=.0045;
  const curve=new THREE.CubicBezierCurve3(new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3());
  const geometry=new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(),new THREE.Vector3(0,0,1)),segments,radius,sides,false);
  geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);geometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;
  const point=new THREE.Vector3(),tangent=new THREE.Vector3(),normal=new THREE.Vector3(),binormal=new THREE.Vector3(),offset=new THREE.Vector3();
  const up=new THREE.Vector3(0,1,0),side=new THREE.Vector3(1,0,0);
  return {mesh,geometry,update(start,end){
    curve.v0.copy(start);curve.v3.copy(end);
    curve.v1.copy(start).add(offset.set(0,-.18,.08));
    curve.v2.copy(end).add(offset.set(0,-.12,-.07));
    const positions=geometry.attributes.position,normals=geometry.attributes.normal;
    for(let i=0;i<=segments;i++){
      curve.getPoint(i/segments,point);curve.getTangent(i/segments,tangent);
      normal.crossVectors(tangent,Math.abs(tangent.y)>.95?side:up).normalize();binormal.crossVectors(tangent,normal);
      for(let j=0;j<=sides;j++){
        const angle=j/sides*Math.PI*2,index=i*(sides+1)+j;
        offset.copy(normal).multiplyScalar(-Math.cos(angle)).addScaledVector(binormal,Math.sin(angle));
        normals.setXYZ(index,offset.x,offset.y,offset.z);
        positions.setXYZ(index,point.x+offset.x*radius,point.y+offset.y*radius,point.z+offset.z*radius);
      }
    }
    positions.needsUpdate=normals.needsUpdate=true;
  }};
}
