// Shared sidecar format. The original render geometry and collision data are never edited.
export const ARCH_LIGHT_VERSION=2;
export const ARCH_LIGHT_MAPS=Object.freeze({fy_pool_day:'laguna',linden_estate:'estate',port:'port',village:'village',alhadra:'alhadra','alhadra-desert':'alhadra-desert','tel-mazin':'tel-mazin',nahar:'nahar',safra:'safra'});
export function geometryKey(g){
  const p=g.getAttribute('position'),index=g.index;let hash=2166136261;
  const add=n=>{hash=Math.imul(hash^(n|0),16777619);};
  add(p.count);add(index?.count??0);
  for(let i=0;i<p.count;i++){add(Math.round(p.getX(i)*4096));add(Math.round(p.getY(i)*4096));add(Math.round(p.getZ(i)*4096));}
  if(index)for(let i=0;i<index.count;i++)add(index.getX(i));
  return (hash>>>0).toString(16);
}
export function architectureSurface(mesh){
  const d=mesh.userData;
  return d.architecturalSurface??d.estateSurface??d.lagunaSurface??d.portSurface??d.villageSurface??'';
}
export function architectureReceiver(mesh){
  return mesh.isMesh&&!mesh.isInstancedMesh&&Boolean(architectureSurface(mesh))&&!/water|glass|glaz|skylight|lamp|leaf|foliage|sign|label|fabric|cloth|garden|grass/i.test(architectureSurface(mesh));
}
// Procedural maps use the actual static batches, never collision boxes. Only
// map-owned batched materials are eligible: no actor/shared global material.
export function proceduralReceiver(mesh){
  const m=mesh.material;
  return mesh.isMesh&&!mesh.isInstancedMesh&&mesh.userData.architectureStaticBatch===true&&
    !mesh.userData.legacyPalmLeaf&&!mesh.userData.detailLevel&&mesh.receiveShadow&&
    !Array.isArray(m)&&Boolean(m?.vertexColors)&&!m.transparent&&
    Boolean(m.isMeshStandardMaterial||m.isMeshLambertMaterial);
}
export function meshGeometryKey(mesh,geometry=mesh.geometry){
  return geometryKey(geometry)+'/'+mesh.matrixWorld.elements.map(v=>Math.round(v*4096)).join(',');
}
export function architectureAOAmount(quality,{estate=false,screenAO=false,gi=false}={}){
  const base=quality==='high'?.78:quality==='low'?.43:0;
  return base*(estate?.56:1)*(screenAO?.80:1)*(gi?.90:1);
}
export function architectureIntensity(quality,{campaign=false,nightVision=false,sun=3.5,hemi=2,estate=false}={}){
  const base=quality==='high'?(estate?1.85:.85):quality==='low'?(estate?1.05:.45):0;
  if(nightVision)return 0;
  return base*(campaign?Math.max(0,Math.min(1.15,(sun*.65+hemi*.35)/2.975)):1);
}
// Three coordinates per triangle chart. A zero-size chart samples a reserved
// neutral texel: zero indirect light and AO=1. UVs reference texel centers.
export function decodeChartUV(charts,size){
  const result=new Float32Array(charts.length*2);
  for(let i=0,j=0;i<charts.length;i+=3,j+=6){
    const x=charts[i],y=charts[i+1],s=charts[i+2];
    const loX=(x+(s?1.5:.5))/size,loY=(y+(s?1.5:.5))/size;
    const hiX=s?(x+s-1.5)/size:loX,hiY=s?(y+s-1.5)/size:loY;
    result.set([loX,loY,hiX,loY,loX,hiY],j);
  }
  return result;
}
