import * as THREE from 'three';
// coverage threshold, wind x/z, haze tint mix, near-ground density,
// scale height (m), max additional opacity, forward scatter, ray strength.
const climates={
  village:[.46,.006,.0018,.31,.0026,29,.25,.62,.86],
  quarry:[.51,.004,.002,.35,.0035,23,.30,.68,.90],
  port:[.39,.007,.0028,.48,.0032,38,.27,.72,.82],
  fy_pool_day:[.59,.003,.001,.20,.0015,17,.12,.55,.64],
  linden_estate:[.43,.0035,.0015,.27,.0018,22,.15,.60,.70],
  alhadra:[.59,.008,.0025,.47,.0038,26,.27,.73,.89],
  'alhadra-desert':[.63,.009,.003,.55,.0045,32,.31,.79,.94],
  'tel-mazin':[.55,.006,.002,.44,.0031,28,.23,.69,.85],
  nahar:[.46,.008,.003,.49,.0036,36,.27,.75,.86],
  safra:[.60,.008,.003,.48,.0039,30,.28,.76,.91],
};
const fallback=[.48,.005,.002,.30,.0025,30,.22,.65,.84];
const desert=climates['alhadra-desert'];
export const CLOUD_LEVEL=Object.freeze({off:0,low:1,medium:2,high:3});
export const FOG_LEVEL=Object.freeze({off:0,low:1,high:2});
export function atmosphereProfile(map){
  return climates[map?.id]??(map?.theme==='desert-village'?desert:fallback);
}
export function fogLayerParameters(profile,quality,stockDensity=0){
  const level=FOG_LEVEL[quality]??0;
  if(!level)return [0,profile[5],0,0];
  // Existing FogExp2 remains intact. Restrict additional extinction in
  // already dense campaign weather to avoid hiding playable silhouettes.
  const scale=(level===1?.48:1)/(1+Math.max(0,stockDensity-.003)*110);
  return [profile[4]*scale,profile[5],0,profile[6]*scale];
}
export function heightFogOpacity(distance,eyeY,endY,params){
  if(distance<=0||params[0]<=0)return 0;
  const h0=Math.max(0,eyeY-params[2])/params[1],h1=Math.max(0,endY-params[2])/params[1];
  const dh=Math.abs(h1-h0),mean=Math.exp(-Math.min(h0,h1))*(dh<.001?1:(1-Math.exp(-dh))/dh);
  return Math.min(params[3],1-Math.exp(-params[0]*Math.min(distance,500)*mean))*THREE.MathUtils.smoothstep(distance,3,18);
}
function hash(x,y,seed){
  let h=Math.imul(x+1,374761393)^Math.imul(y+1,668265263)^Math.imul(seed,1274126177);
  h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;
}
function periodic(x,y,c,seed){
  const i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j,s=u*u*(3-2*u),t=v*v*(3-2*v);
  const wrap=n=>((n%c)+c)%c,at=(a,b)=>hash(wrap(a),wrap(b),seed),mix=(a,b,k)=>a+(b-a)*k;
  return mix(mix(at(i,j),at(i+1,j),s),mix(at(i,j+1),at(i+1,j+1),s),t);
}
export function buildCloudPixels(size=256){
  const bytes=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size,i=(y*size+x)*4;
    const n=(c,seed)=>periodic(u*c,v*c,c,seed);
    const base=.57*n(5,71)+.27*n(11,37)+.11*n(23,19)+.05*n(47,53);
    const cirrus=.56*n(7,83)+.29*n(17,41)+.15*n(37,11);
    bytes[i]=Math.round(255*base);bytes[i+1]=Math.round(255*cirrus);
    bytes[i+2]=Math.round(255*(.6*n(23,67)+.4*n(53,29)));bytes[i+3]=255;
  }
  return bytes;
}
export function makeCloudTexture(){
  // Placeholder avoids generating or uploading a full cloud field on legacy.
  const t=new THREE.DataTexture(new Uint8Array([128,128,128,255]),1,1,THREE.RGBAFormat);
  t.name='S09 cloud density';t.colorSpace=THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.minFilter=THREE.LinearFilter;t.magFilter=THREE.LinearFilter;t.needsUpdate=true;return t;
}
export function ensureCloudTexture(t){
  if(t.image.width>1)return;
  // Retain texture identity so existing TSL nodes/uniforms remain valid.
  t.image={data:buildCloudPixels(),width:256,height:256};
  t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.needsUpdate=true;
}
