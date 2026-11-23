import {createCanvas,loadImage} from '@napi-rs/canvas';
import ffmpeg from 'ffmpeg-static';
import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const output=fileURLToPath(new URL('../../src/assets/weapon-skins/',import.meta.url));
mkdirSync(output,{recursive:true});

function rng(seed){
  return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
}

const camos=[
  ['common-1','blotch',['#404445','#616764','#303636','#828782']],
  ['common-2','dune',['#99836a','#c0a881','#756450','#a79069']],
  ['common-3','blotch',['#45543d','#667658','#303b2c','#8e8d61']],
  ['uncommon-1','pixel',['#78868d','#bac5c7','#4b5d62','#95a6a9']],
  ['uncommon-2','reed',['#606657','#897f56','#414b43','#af9a6a']],
  ['uncommon-3','pixel',['#505e65','#38454c','#73847f','#9b694a']],
];

function camouflage(canvas,style,colors,seed){
  const {width,height}=canvas,ctx=canvas.getContext('2d'),random=rng(seed);
  ctx.fillStyle=colors[0];ctx.fillRect(0,0,width,height);
  if(style==='pixel'){
    for(let i=0;i<120;i++){
      const cell=14, x=Math.floor(random()*width/cell)*cell, y=Math.floor(random()*height/cell)*cell;
      const w=2+Math.floor(random()*9),h=1+Math.floor(random()*4);
      ctx.fillStyle=colors[1+i%3];
      ctx.fillRect(x,y,w*cell,h*cell);
      ctx.fillRect(x+cell,y-cell,(w-1)*cell,cell);
      ctx.fillRect(x-cell,y+cell,Math.max(1,w-2)*cell,cell);
    }
  }else if(style==='dune'||style==='reed'){
    for(let i=0;i<35;i++){
      const x=random()*width-90,y=random()*height;
      const length=90+random()*300,thickness=6+random()*(style==='dune'?34:18);
      const tilt=style==='reed'?-length*.32:length*.13;
      ctx.fillStyle=colors[1+i%3];
      ctx.beginPath();ctx.moveTo(x,y);
      ctx.bezierCurveTo(x+length*.27,y-thickness*2,x+length*.64,y+tilt*.9,x+length,y+tilt);
      ctx.bezierCurveTo(x+length*.65,y+tilt+thickness,x+length*.3,y+thickness*.25,x,y);
      ctx.fill();
    }
  }else{
    for(let i=0;i<38;i++){
      const x=random()*width,y=random()*height,a=24+random()*94,b=13+random()*45;
      const wave=random()*Math.PI*2;
      ctx.fillStyle=colors[1+i%3];
      ctx.beginPath();
      const points=Array.from({length:12},(_,k)=>{
        const angle=k*Math.PI/6, r=1+.27*Math.sin(k*1.4+wave);
        return [x+Math.cos(angle)*a*r,y+Math.sin(angle)*b*r];
      });
      const last=points.at(-1),first=points[0];
      ctx.moveTo((last[0]+first[0])/2,(last[1]+first[1])/2);
      points.forEach(([px,py],k)=>{
        const next=points[(k+1)%points.length];
        ctx.quadraticCurveTo(px,py,(px+next[0])/2,(py+next[1])/2);
      });
      ctx.fill();
    }
  }
  for(let i=0;i<8500;i++){
    ctx.fillStyle=random()<.5?'#efebd918':'#141a2027';
    ctx.fillRect(random()*width,random()*height,1+random()*3,1);
  }
}

function tile(source,column,row){
  const section=createCanvas(512,512);
  section.getContext('2d').drawImage(source,column*512+2,row*512+2,508,508,0,0,512,512);
  return section;
}

function artwork(base,portrait,width,height,scale=1,shift=0){
  const result=createCanvas(width,height),ctx=result.getContext('2d');
  ctx.drawImage(base,0,0,width,height);
  const layer=createCanvas(width,height),paint=layer.getContext('2d');
  const pictureHeight=height*scale,pictureWidth=pictureHeight*portrait.width/portrait.height;
  const left=(width-pictureWidth)/2,top=(height-pictureHeight)/2+shift;
  paint.drawImage(portrait,left,top,pictureWidth,pictureHeight);
  paint.globalCompositeOperation='destination-in';
  const edge=paint.createLinearGradient(left,0,left+pictureWidth,0);
  for(const [position,opacity] of [[0,0],[.12,1],[.87,1],[1,0]])edge.addColorStop(position,`rgba(0,0,0,${opacity})`);
  paint.fillStyle=edge;
  paint.fillRect(0,0,width,height);
  ctx.drawImage(layer,0,0);
  return result;
}

function eclipseFinish(emblem){
  // M-50 side silhouette, .413 × .287 m. One print spans all three panels.
  const width=768,height=534;
  const canvas=createCanvas(width,height),ctx=canvas.getContext('2d');
  const base=ctx.createLinearGradient(0,0,width,height);
  base.addColorStop(0,'#111825');
  base.addColorStop(.53,'#362544');
  base.addColorStop(1,'#171525');
  ctx.fillStyle=base;
  ctx.fillRect(0,0,width,height);

  const random=rng(719);
  for(let i=0;i<4300;i++){
    ctx.fillStyle=i%2?'#a5a4bd14':'#07051138';
    ctx.fillRect(random()*width,random()*height,1+random()*7,1);
  }
  for(let i=0;i<13;i++){
    const inset=i*9;
    ctx.beginPath();
    ctx.ellipse(490,93,130+inset,73+inset,-.2,.36,Math.PI*1.86);
    ctx.strokeStyle=i%3===0?'#b483bb8a':'#71638c4b';
    ctx.lineWidth=i%3===0?2:1;
    ctx.stroke();
  }
  for(const [x,y] of [[85,58],[169,112],[248,193],[681,226],[658,367],[608,449]]){
    ctx.strokeStyle='#a58dae';
    ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(x-8,y);ctx.lineTo(x+8,y);ctx.moveTo(x,y-8);ctx.lineTo(x,y+8);ctx.stroke();
    ctx.beginPath();ctx.arc(x,y,12,0,Math.PI*2);ctx.stroke();
  }
  const seal=createCanvas(172,172),paint=seal.getContext('2d');
  paint.drawImage(emblem,0,0,172,172);
  paint.globalCompositeOperation='destination-in';
  const fade=paint.createRadialGradient(86,86,56,86,86,86);
  fade.addColorStop(0,'#000');
  fade.addColorStop(1,'#0000');
  paint.fillStyle=fade;paint.fillRect(0,0,172,172);
  ctx.drawImage(seal,442,-12);
  return canvas;
}

function save(id,canvas){
  const result=spawnSync(ffmpeg,['-y','-hide_banner','-loglevel','error','-f','image2pipe','-vcodec','png','-i','-',
    '-c:v','libwebp','-quality','88',join(output,id+'.webp')],{input:canvas.toBuffer('image/png')});
  if(result.status!==0)throw Error(result.stderr?.toString()||'WebP export failed for '+id);
}

for(const [i,[id,style,colors]] of camos.entries()){
  const canvas=createCanvas(512,256);
  camouflage(canvas,style,colors,1447+i*205);
  save(id,canvas);
}

const sourcePath=name=>fileURLToPath(new URL(name,import.meta.url));
const [sheetPath=sourcePath('paint-source.webp'),portraitPath=sourcePath('nagant-source.webp')]=process.argv.slice(2);
const sheet=await loadImage(sheetPath),portrait=await loadImage(portraitPath);
for(let i=0;i<3;i++)save(`rare-${i+1}`,tile(sheet,i,0));
const hawk=tile(sheet,0,1),eclipse=tile(sheet,1,1),ribbons=tile(sheet,2,1),steel=tile(sheet,2,0);
save('legendary-1',artwork(steel,hawk,768,384,1.20));
save('legendary-2',eclipseFinish(eclipse));
save('ultra-1',artwork(ribbons,portrait,704,512,.55,-122));
