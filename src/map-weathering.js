import * as THREE from 'three';
const profiles={
  village:[.23,.27,.12,.045],quarry:[.29,.31,.15,.035],port:[.22,.33,.21,-.025],
  fy_pool_day:[.085,.09,.045,-.012],linden_estate:[.12,.14,.07,.012],
  alhadra:[.24,.27,.12,.05],'alhadra-desert':[.29,.24,.10,.06],
  'tel-mazin':[.23,.25,.13,.042],nahar:[.19,.26,.12,.023],safra:[.26,.24,.10,.05],
};
const surfaces={
  concrete:[1,1,1],brick:[.85,.85,.30],stucco:[1,.95,.70],rock:[1.05,.65,.23],
  sand:[1.1,.75,0],earth:[1.05,.85,0],asphalt:[.8,1.1,1.1],
  wood:[.7,.55,.12],metal:[.8,1.1,0],cloth:[.45,.45,0],grass:[.8,.45,0],ceramic:[.45,.65,.15],
};
// Authored UVs stay intact. Concrete/rock remain at 1 for existing POM.
export const surfaceRepeat=surface=>({brick:1.5,wood:1.2,metal:1.3,cloth:1.2,grass:1.4}[surface]??1);
export function weatherParameters(mapId,surface,quality){
  const w=surfaces[surface];
  if(!w||!['low','high'].includes(quality))return null;
  const p=profiles[mapId]??[.18,.2,.09,.02],high=quality==='high',level=high?1:.58;
  return [p[0]*w[0]*level,p[1]*w[1]*level,high?p[2]*w[2]:0,p[3],Number(high)];
}
function hash(x,y,seed){
  let h=Math.imul(x+1,374761393)^Math.imul(y+1,668265263)^Math.imul(seed,1274126177);
  h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;
}
function noise(x,y,c,seed){
  const a=Math.floor(x),b=Math.floor(y),u=x-a,v=y-b,s=u*u*(3-2*u),t=v*v*(3-2*v);
  const at=(i,j)=>hash(((i%c)+c)%c,((j%c)+c)%c,seed),m=(x,y,z)=>x+(y-x)*z;
  return m(m(at(a,b),at(a+1,b),s),m(at(a,b+1),at(a+1,b+1),s),t);
}
const byte=x=>Math.round(Math.max(0,Math.min(1,x))*255);
// Periodic RGBA mask: coarse variation, grime, sparse branched cracks.
export function buildWeatherPixels(size=256){
  const data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size,i=(y*size+x)*4;
    data[i]=byte(.65*noise(u*5,v*5,5,17)+.35*noise(u*13,v*13,13,37));
    data[i+1]=byte(.6*noise(u*11,v*11,11,97)+.3*noise(u*23,v*23,23,45)+.1*noise(u*47,v*47,47,61));data[i+3]=255;
  }
  const mark=(x,y,k)=>{
    const a=((Math.round(x)%size)+size)%size,b=((Math.round(y)%size)+size)%size,i=(b*size+a)*4+2;
    data[i]=Math.max(data[i],byte(k));
  };
  for(let n=0;n<22;n++){
    let x=hash(n,0,101)*size,y=hash(n,1,101)*size,angle=hash(n,2,101)*Math.PI*2;
    const length=5+Math.floor(hash(n,3,101)*15);
    for(let j=0;j<length;j++){
      angle+=(hash(n,j,103)-.5)*.85;x+=Math.cos(angle)*1.2;y+=Math.sin(angle)*1.2;
      mark(x,y,.5+.5*hash(n,j,107));mark(x+.5,y,.35);
      if(j===Math.floor(length/2))for(let k=1;k<6;k++)mark(x+Math.cos(angle+1)*k,y+Math.sin(angle+1)*k,.55*(1-k/7));
    }
  }
  return data;
}
export function makeWeatherMask(){
  const size=256,t=new THREE.DataTexture(buildWeatherPixels(size),size,size,THREE.RGBAFormat);
  t.name='S09 map weather mask';t.colorSpace=THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.needsUpdate=true;return t;
}
