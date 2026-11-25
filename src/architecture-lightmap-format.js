// Shared sidecar format. The original render geometry and collision data are never edited.
export const ARCH_LIGHT_VERSION=1;
export const ARCH_LIGHT_MAPS=Object.freeze({fy_pool_day:'laguna',linden_estate:'estate',port:'port',village:'village',alhadra:'alhadra','alhadra-desert':'alhadra-desert','tel-mazin':'tel-mazin',nahar:'nahar'});
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
