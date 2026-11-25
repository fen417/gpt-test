import * as THREE from 'three';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
function hash(x,y,seed){
  let h=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(seed,1274126177);
  h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;
}
function noise(x,y,seed){
  const i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j,s=u*u*(3-2*u),t=v*v*(3-2*v);
  const mix=(a,b,t)=>a+(b-a)*t;
  return mix(mix(hash(i,j,seed),hash(i+1,j,seed),s),mix(hash(i,j+1,seed),hash(i+1,j+1,seed),s),t);
}
function field(x,y,seed){return .52*noise(x,y,seed)+.27*noise(x*2.1,y*2.1,seed+17)+.14*noise(x*4.2,y*4.2,seed+29)+.07*noise(x*8.3,y*8.3,seed+43);}
const byte=v=>Math.round(clamp(v)*255);
export function particlePixels(kind,size=128){
  const data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1,r=Math.hypot(u,v),angle=Math.atan2(v,u);
    const n=field(u*3.5+12,v*3.5+7,19),fine=field(u*8+9,v*8+15,41);
    let rgb,alpha;
    if(kind==='smoke'){
      // Irregular, overlapping billows with fine density variation and fully transparent borders.
      const edge=.70+(n-.5)*.36+Math.sin(angle*7+.8)*.055;
      const mass=(1-smooth(.18,edge,r))*(.40+.85*n);
      alpha=mass*(.64+.36*fine)*(1-smooth(.83,.98,r));
      const shade=.58+.39*n+.09*fine;
      rgb=[shade,shade,shade];
    }else if(kind==='muzzle'){
      const lobe=Math.pow(Math.max(0,Math.cos(angle*5+.8)),7);
      const shape=(.22+.59*lobe)*(.83+.24*n);
      const core=1-smooth(.035,.24,r);
      alpha=Math.max(core,1-smooth(shape*.17,shape,r))*(1-smooth(.82,.98,r));
      rgb=[1,.68+.32*core,.26+.69*core];
    }else{
      // Fractal fireball: bright dense interior, ragged edges, distinct orange tongues.
      const shape=.71+(n-.5)*.42+Math.sin(angle*5+1.3)*.07;
      const mass=(1-smooth(.10,shape,r))*(.65+.35*fine);
      const hot=clamp((1-r)*.9+(fine-.5)*.9);
      alpha=mass*(1-smooth(.84,.98,r));
      rgb=[1,.23+.74*hot,.035+.76*hot*hot];
    }
    data.set([byte(rgb[0]),byte(rgb[1]),byte(rgb[2]),byte(alpha)],(y*size+x)*4);
  }
  return data;
}
export function makeParticleTexture(kind){
  const size=kind==='muzzle'?96:128;
  const t=new THREE.DataTexture(particlePixels(kind,size),size,size,THREE.RGBAFormat);
  t.name='S09 '+kind+' particle';t.colorSpace=THREE.SRGBColorSpace;t.generateMipmaps=true;
  t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.needsUpdate=true;
  return t;
}
export const particleQuality=Object.freeze({legacy:0,medium:1,high:2});
export function plumeEnvelope(age,life,kind,out={}){
  const t=clamp(age/Math.max(.001,life));
  const fadeIn=smooth(0,kind==='dust'?.12:.08,t);
  const fadeOut=1-smooth(kind==='dust'?.20:.32,1,t);
  out.opacity=fadeIn*fadeOut;out.growth=1+(kind==='dust'?2.0:1.65)*Math.sqrt(t);return out;
}
export function dustProfile(map){
  if(!map||['fy_pool_day','linden_estate','nahar'].includes(map.id))return null;
  if(map.id==='port')return {color:0x8b877b,opacity:.16};
  return {color:map.id==='quarry'?0xa09983:0xb6a080,opacity:.42};
}
