import * as THREE from 'three';
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const TAU=Math.PI*2;
export function foliageRandom(seed){
  let n=seed>>>0;return ()=>{n=(n+0x6D2B79F5)>>>0;let t=Math.imul(n^(n>>>15),1|n);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};
}
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
function blade(u,v,b,px){
  const t=(v-b.y)/b.h;if(t<0||t>1)return 0;
  const x=b.x+b.lean*t*t, width=b.w*Math.pow(1-t,.68)*(.65+.35*Math.sin(t*Math.PI));
  return 1-smooth(width-px,width+px,Math.abs(u-x));
}
function leaflet(u,v,b,px){
  const x=u-b.x,y=v-b.y,c=b.c,s=b.s,a=(x*c+y*s)/b.w,k=(-x*s+y*c)/b.h;
  if(Math.abs(x)>b.w+b.h||Math.abs(y)>b.w+b.h)return 0;
  return 1-smooth(1-px*4,1+px*4,Math.hypot(a,k));
}
export function foliagePixels(kind,size=256){
  const random=foliageRandom(971+kind.length*73),data=new Uint8Array(size*size*4),shapes=[],px=1/size;
  if(kind==='grass'){
    for(let i=0;i<29;i++)shapes.push({x:.15+random()*.70,y:.025+random()*.095,h:.30+random()*.63,w:.013+random()*.020,lean:(random()-.5)*.52,t:random()});
  }else if(kind==='scrub'||kind==='broadleaf'){
    for(let i=0;i<(kind==='broadleaf'?108:78);i++){
      const a=random()*TAU,rad=Math.sqrt(random())*.42, y=kind==='scrub'?.28+Math.sin(a)*rad*.65:.5+Math.sin(a)*rad;
      const x=.5+Math.cos(a)*rad;
      shapes.push({x,y:Math.max(.09,y),w:.018+random()*.044,h:.035+random()*.06,a:random()*TAU,t:random()});
    }
  }else if(kind==='palm-impostor'){
    for(let i=0;i<12;i++){const a=TAU*i/12;shapes.push({x:.5+Math.cos(a)*.21,y:.53+Math.sin(a)*.18,w:.28,h:.063,a,t:random()});}
  }
  for(const b of shapes)if(b.a!=null){b.c=Math.cos(b.a);b.s=Math.sin(b.a);}
  const palette=kind==='grass'?[[127,139,69],[192,163,96]]:kind==='scrub'?[[113,133,69],[177,159,100]]:kind==='broadleaf'?[[75,116,49],[151,165,74]]:[[93,132,62],[169,150,77]];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=(x+.5)/size,v=(y+.5)/size;
    let alpha=0,tone=.5,vein=0;
    if(kind==='palm'){
      // Long narrow pinnae follow a tapered frond, with individual rachis/veins.
      const side=Math.abs(u-.5)*2, taper=Math.pow(Math.sin(Math.PI*clamp(v)),.69),reach=Math.max(.014,taper);
      const along=v-side*.115, band=Math.abs((along*23)%1-.5),width=.38*(1-side*.53);
      alpha=(1-smooth(reach-.015,reach+.015,side))*(1-smooth(width-.055,width+.035,band));
      const rachis=(1-smooth(.012,.033,side))*(1-smooth(.98,1,v));alpha=Math.max(alpha,rachis);
      vein=rachis*.23+Math.max(0,1-band*18)*.09;tone=.35+.27*Math.sin(v*32+side*9)+.14*side;
    }else{
      for(const b of shapes){
        const a=kind==='grass'?blade(u,v,b,px):leaflet(u,v,b,px);
        if(a>alpha){alpha=a;tone=b.t;vein=kind==='grass'?.09*(1-clamp(v)):Math.max(0,1-Math.abs(u-b.x)*45)*.08;}
      }
      if(kind==='scrub'){
        for(let i=0;i<5;i++){
          const stem={x:.5,y:.015,h:.55+i*.065,w:.009,lean:(i-2)*.09};
          const a=blade(u,v,stem,px);if(a>alpha){alpha=a;tone=.94;}
        }
      }
    }
    alpha*=smooth(.005,.04,u)*smooth(.005,.04,1-u)*smooth(.003,.025,v)*smooth(.003,.025,1-v);
    const shade=.91+.12*Math.sin(u*159+v*113)+.05*Math.sin(v*397)+vein;
    const i=(y*size+x)*4;
    for(let j=0;j<3;j++)data[i+j]=Math.round(clamp((palette[0][j]+(palette[1][j]-palette[0][j])*clamp(tone))*shade,0,255));
    data[i+3]=Math.round(clamp(alpha)*255);
  }
  return data;
}
export function makeFoliageTexture(kind){
  const size=kind==='palm'?256:128,t=new THREE.DataTexture(foliagePixels(kind,size),size,size,THREE.RGBAFormat);
  t.name='S09 foliage '+kind;t.colorSpace=THREE.SRGBColorSpace;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.anisotropy=2;t.needsUpdate=true;return t;
}
function builder(){
  const pos=[],uv=[],weight=[],indices=[];
  const vertex=(x,y,z,u,v,w)=>{pos.push(x,y,z);uv.push(u,v);weight.push(w);return pos.length/3-1;};
  const quad=(a,b,c,d)=>indices.push(a,b,c,a,c,d);
  const finish=()=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('s09Wind',new THREE.Float32BufferAttribute(weight,1));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();g.boundingSphere.radius+=.35;return g;};
  return {vertex,quad,finish};
}
export function foliageGeometry(kind,lod){
  const b=builder();
  if(kind==='palm'&&lod<2){
    const count=lod===0?15:9,segments=lod===0?10:5,cols=lod===0?3:2;
    for(let j=0;j<count;j++){
      const angle=TAU*j/count+.13*Math.sin(j*3.1),c=Math.cos(angle),s=Math.sin(angle);
      const length=2.8+.9*(.5+.5*Math.sin(j*2.73)),sag=.92+1.2*(.5+.5*Math.cos(j*1.89)),rise=j%3===0?1.0:.56;
      const grid=[];
      for(let i=0;i<=segments;i++){
        const t=i/segments,width=.78*Math.pow(Math.sin(Math.PI*t),.72)+.012;
        for(let k=0;k<cols;k++){
          const u=k/(cols-1),across=(u-.5)*2*width;
          grid.push(b.vertex(c*length*t-s*across,Math.sin(t*Math.PI)*rise-sag*t*t-Math.abs(across)*.23,s*length*t+c*across,u,t,t*t));
        }
      }
      for(let i=0;i<segments;i++)for(let k=0;k<cols-1;k++){const a=i*cols+k;b.quad(grid[a],grid[a+1],grid[a+cols+1],grid[a+cols]);}
    }
  }else{
    const palm=kind==='palm',grass=kind==='grass',count=lod===0?(grass?3:5):lod===1?2:2;
    for(let j=0;j<count;j++){
      const a=j*Math.PI/count,dx=Math.cos(a),dz=Math.sin(a),half=palm?3.75:grass?.55:kind==='broadleaf'?.9:.60;
      const bottom=palm?-2.0:0,top=palm?1.6:grass?.77:kind==='broadleaf'?1.65:.96;
      const ids=[],rows=lod===2?1:2;
      for(let row=0;row<=rows;row++){
        const t=row/rows,y=bottom+(top-bottom)*t,curve=lod===0?.08*t*t:0;
        for(const side of [-1,1])ids.push(b.vertex(dx*half*side+dz*curve,y,dz*half*side-dx*curve,(side+1)*.5,t,t*t));
      }
      b.quad(ids[0],ids[1],ids[3],ids[2]);if(rows===2)b.quad(ids[2],ids[3],ids[5],ids[4]);
    }
  }
  return b.finish();
}
