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
// Material response: streaks, abrasion/chips, oxidation, deposited dust,
// roughness response. These are authored per surface, not generic grey noise.
const responses={
  concrete:[.36,.72,0,.30,.16],brick:[.22,.35,0,.29,.12],stucco:[.28,.78,0,.32,.14],
  rock:[.22,.35,0,.28,.12],sand:[0,0,0,1,.08],earth:[0,0,0,.82,.08],
  asphalt:[.08,.82,0,.68,.18],wood:[.42,.38,0,.31,.13],metal:[.88,.66,1,.35,.36],
  cloth:[.18,.12,0,.34,.07],grass:[0,0,0,.18,.03],ceramic:[.34,.22,0,.12,.15],
};
// Per-map artist palette: mineral dust, exposed substrate, oxide hue, strength.
// Linear-space multipliers are intentionally modest to preserve map readability.
const art={
  village:[[1.06,1.02,.94],[1.08,1.05,.98],[1.15,.61,.30],.62],
  quarry:[[1.15,1.04,.83],[1.13,1.05,.94],[1.26,.56,.24],1],
  port:[[.83,.95,.98],[.97,1.04,1.07],[1.25,.51,.24],1],
  fy_pool_day:[[.92,1.02,1.09],[1.05,1.06,1.04],[1.15,.66,.36],.32],
  linden_estate:[[.98,1.04,.90],[1.08,1.04,.97],[1.17,.61,.33],.48],
  alhadra:[[1.07,1.02,.93],[1.08,1.04,.98],[1.24,.58,.26],.58],
  'alhadra-desert':[[1.09,1.03,.91],[1.09,1.05,.97],[1.25,.56,.23],.66],
  'tel-mazin':[[1.06,1.02,.95],[1.07,1.04,.98],[1.20,.58,.26],.60],
  nahar:[[1.07,1.02,.88],[1.05,1.02,.93],[1.19,.55,.28],.73],
  safra:[[1.08,1.03,.92],[1.08,1.04,.98],[1.23,.58,.25],.62],
};
export function weatherArtProfile(mapId,surface,quality){
  const a=art[mapId]??art.village,r=responses[surface];
  if(!r||surface==='grass'||!['low','high'].includes(quality))return null;
  const strength=a[3]*(quality==='high'?1:.55);
  return [...r.map(v=>v*strength),...a[0],...a[1],...a[2]];
}
// Authored UVs stay intact. Concrete/rock remain at 1 for existing POM.
export const surfaceRepeat=surface=>({brick:1.5,wood:1.2,metal:1.3,cloth:1.2,grass:1.4}[surface]??1);
export function weatherParameters(mapId,surface,quality){
  const w=surfaces[surface];
  const authored=weatherArtProfile(mapId,surface,quality);
  if(!w||!authored)return null;
  const p=profiles[mapId]??[.18,.2,.09,.02],high=quality==='high',level=high?1:.58;
  const masonry=['concrete','brick','stucco'].includes(surface),ground=['sand','earth'].includes(surface);
  return [p[0]*w[0]*level*(masonry?.83:1),p[1]*w[1]*level*(masonry?.47:ground?.68:1),high?p[2]*w[2]*(masonry?.60:1):0,p[3]*(masonry?.28:ground?.45:1),Number(high),...authored];
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
// Periodic RGBA mask: mineral variation, grime, sparse branched cracks,
// elongated runoff and fine paint flaking. No new texture fetch in Low.
export function buildWeatherPixels(size=256){
  const data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size,i=(y*size+x)*4;
    data[i]=byte(.65*noise(u*5,v*5,5,17)+.35*noise(u*13,v*13,13,37));
    data[i+1]=byte(.6*noise(u*11,v*11,11,97)+.3*noise(u*23,v*23,23,45)+.1*noise(u*47,v*47,47,61));data[i+3]=byte(Math.pow(noise(u*43,v*43,43,183),3)*.78+.22*noise(u*83,v*83,83,211));
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
