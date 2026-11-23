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

const sourcePath=name=>fileURLToPath(new URL(name,import.meta.url));

async function bakeFieldReserve(args){
  for(const [i,[id,style,colors]] of camos.entries()){
    const canvas=createCanvas(512,256);
    camouflage(canvas,style,colors,1447+i*205);
    save(id,canvas);
  }
  const [sheetPath=sourcePath('paint-source.webp'),portraitPath=sourcePath('nagant-source.webp')]=args;
  const sheet=await loadImage(sheetPath),portrait=await loadImage(portraitPath);
  for(let i=0;i<3;i++)save(`rare-${i+1}`,tile(sheet,i,0));
  const hawk=tile(sheet,0,1),eclipse=tile(sheet,1,1),ribbons=tile(sheet,2,1),steel=tile(sheet,2,0);
  save('legendary-1',artwork(steel,hawk,768,384,1.20));
  save('legendary-2',eclipseFinish(eclipse));
  save('ultra-1',artwork(ribbons,portrait,704,512,.55,-122));
}

function finishCanvas(width,height,base){
  const canvas=createCanvas(width,height);
  const ctx=canvas.getContext('2d');
  ctx.fillStyle=base;
  ctx.fillRect(0,0,width,height);
  return {canvas,ctx};
}

function grain(ctx,width,height,seed){
  const random=rng(seed);
  for(let i=0;i<9000;i++){
    ctx.fillStyle=i%2?'#dcfff81e':'#1711222c';
    ctx.fillRect(random()*width,random()*height,1+random()*2,1);
  }
}

function cinnabarFinish(){
  // One print for the M-50 slide, shroud and frame.
  const {canvas,ctx}=finishCanvas(768,534,'#4b1622');
  ctx.translate(380,210);
  ctx.rotate(-.24);
  const enamels=['#762334','#a63237','#c04e45','#92302e','#331b2c'];
  for(let row=-4;row<7;row++){
    for(let col=-7;col<8;col++){
      const x=col*68+(row%2)*34,y=row*56;
      ctx.beginPath();
      ctx.moveTo(x-35,y);
      ctx.quadraticCurveTo(x-34,y+35,x,y+58);
      ctx.quadraticCurveTo(x+34,y+35,x+35,y);
      ctx.quadraticCurveTo(x,y+13,x-35,y);
      ctx.fillStyle=enamels[(row+col*2+30)%enamels.length];
      ctx.fill();
      ctx.strokeStyle='#f0ad75';
      ctx.lineWidth=1.7;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x-24,y+14);
      ctx.quadraticCurveTo(x-15,y+35,x,y+42);
      ctx.strokeStyle='#fae0a281';
      ctx.stroke();
    }
  }
  ctx.resetTransform();
  grain(ctx,768,534,211);
  return canvas;
}

function sonarFinish(){
  const {canvas,ctx}=finishCanvas(768,440,'#16162a');
  for(let y=21;y<440;y+=26)for(let x=20;x<768;x+=26){
    ctx.fillStyle=(x+y)%3?'#d0aac36b':'#c2b2e8a3';
    ctx.fillRect(x,y,2,2);
  }
  for(const [x,y,r,rotation] of [[412,165,174,-.4],[75,382,124,.65],[770,306,133,-1.25]]){
    for(let i=1;i<=5;i++){
      ctx.beginPath();
      ctx.arc(x,y,r*i/5,rotation,rotation+Math.PI*1.78);
      ctx.strokeStyle=i%2?'#e5a0ef':'#816cbc';
      ctx.lineWidth=i%2?3:1.3;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x-r,y);
    ctx.lineTo(x+r,y);
    ctx.strokeStyle='#bda8eb91';
    ctx.stroke();
    ctx.fillStyle='#ffc487';
    ctx.fillRect(x-4,y-4,8,8);
  }
  const wave=[0,0,13,-21,33,-44,49,-22,11,-7,0,0,0];
  ctx.beginPath();
  wave.forEach((y,i)=>ctx.lineTo(204+i*32,285+y));
  ctx.lineWidth=3;
  ctx.strokeStyle='#ffbb7e';
  ctx.stroke();
  grain(ctx,768,440,352);
  return canvas;
}

function crystalFinish(){
  const {canvas,ctx}=finishCanvas(768,534,'#203044');
  const random=rng(9376);
  for(let i=0;i<58;i++){
    const x=random()*870-68,y=random()*584-39,len=44+random()*200,w=9+random()*54;
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(-.71+(random()-.5)*.88);
    const facets=[[[0,-w/2],[len*.80,-w/3],[len,0],[len*.18,0]],
      [[0,-w/2],[len*.18,0],[len*.1,w*.42],[-len*.08,0]],
      [[len*.18,0],[len,0],[len*.73,w*.29],[len*.1,w*.42]]];
    const colors=i%5===0?['#ccb9e7','#607b9b','#765687']:['#bfecf0','#76b5c9','#3986aa'];
    for(const [facet,points] of facets.entries()){
      ctx.beginPath();
      for(const [px,py] of points)ctx.lineTo(px,py);
      ctx.closePath();
      ctx.fillStyle=colors[facet]+(i%3?'bf':'e8');
      ctx.fill();
    }
    ctx.restore();
  }
  grain(ctx,768,534,771);
  return canvas;
}

async function nautilusFinish(){
  const image=await loadImage(sourcePath('nautilus-source.webp'));
  const waves=await loadImage(sourcePath('nautilus-enamel-source.webp'));
  // Two regions share the atlas. The 768 px receiver panel gets the shell,
  // while the 832 px furniture panel can carry full-width waves.
  const {canvas,ctx}=finishCanvas(1600,442,'#15273d');
  ctx.globalAlpha=.70;
  ctx.drawImage(waves,0,0,768,442);
  ctx.globalAlpha=.93;
  ctx.drawImage(waves,768,0,832,442);
  ctx.globalAlpha=1;
  const halo=ctx.createRadialGradient(288,181,70,288,181,215);
  halo.addColorStop(0,'#102038dd');
  halo.addColorStop(.5,'#10203890');
  halo.addColorStop(1,'#10203800');
  ctx.fillStyle=halo;
  ctx.fillRect(0,0,768,442);
  const seal=finishCanvas(270,238,'#162942');
  seal.ctx.drawImage(image,206,45,1080,952,0,0,270,238);
  seal.ctx.globalCompositeOperation='destination-in';
  const fade=seal.ctx.createRadialGradient(135,119,91,135,119,132);
  fade.addColorStop(0,'#000');
  fade.addColorStop(1,'#0000');
  seal.ctx.fillStyle=fade;
  seal.ctx.fillRect(0,0,270,238);
  ctx.drawImage(seal.canvas,153,62);
  return canvas;
}

async function auroraFinish(){
  const image=await loadImage(sourcePath('aurora-source.webp'));
  // Receiver and handguard occupy .839 × .308 m in the shared projection.
  const {canvas,ctx}=finishCanvas(1000,367,'#23263a');
  const cropHeight=image.width*canvas.height/canvas.width;
  ctx.drawImage(image,0,116,image.width,cropHeight,0,0,canvas.width,canvas.height);
  return canvas;
}

async function sunstrikeFinish(){
  const image=await loadImage(sourcePath('sunstrike-source.webp'));
  // VK-45 lower housing has the uninterrupted broad side below its upper rail.
  const {canvas,ctx}=finishCanvas(828,468,'#521823');
  const random=rng(945);
  for(let i=0;i<44;i++){
    const y=random()*468,x=590+random()*274,length=45+random()*165;
    ctx.beginPath();
    ctx.moveTo(x,y);
    ctx.lineTo(x+length,y-18-length*.18);
    ctx.lineTo(x+length*.55,y-1);
    ctx.fillStyle=['#ffb420','#ce432b','#ab2b2a','#361b27'][i%4];
    ctx.fill();
  }
  for(let i=0;i<31;i++){
    const angle=random()*Math.PI*2;
    const near=.66+random()*.30,far=near+.22+random()*.28;
    const x=Math.cos(angle)*205,y=Math.sin(angle)*118;
    ctx.beginPath();
    ctx.moveTo(324+x*near,242+y*near);
    ctx.lineTo(324+x*far,242+y*far);
    ctx.lineTo(324+x*near-y*.035,242+y*near+x*.035);
    ctx.fillStyle=['#9d2e32','#77303a','#b14837','#441923'][i%4];
    ctx.fill();
  }
  const portrait=finishCanvas(418,276,'#521823');
  portrait.ctx.drawImage(image,20,10,384,256);
  const mask=createCanvas(418,276),softEdge=mask.getContext('2d');
  // Feather the impact art into the coating while keeping the glove, face
  // and cape opaque inside their own contours.
  for(const [x,y,rx,ry,core] of [[127,137,133,118,.71],[277,88,111,100,.64],[260,172,144,98,.51]]){
    softEdge.save();
    softEdge.translate(x,y);
    softEdge.scale(rx,ry);
    const fade=softEdge.createRadialGradient(0,0,0,0,0,1);
    fade.addColorStop(core,'#000');
    fade.addColorStop(.90,'#0004');
    fade.addColorStop(1,'#0000');
    softEdge.fillStyle=fade;
    softEdge.fillRect(-1,-1,2,2);
    softEdge.restore();
  }
  portrait.ctx.globalCompositeOperation='destination-in';
  portrait.ctx.drawImage(mask,0,0);
  ctx.drawImage(portrait.canvas,125,106);
  grain(ctx,828,468,204);
  return canvas;
}

async function bakePolarCircuit(){
  const polarCamos=[
    ['polar-common-1','blotch',['#303333','#645e58','#4b5254','#928b7a']],
    ['polar-common-2','dune',['#8e9aa3','#c0cad0','#687881','#a7ada7']],
    ['polar-common-3','reed',['#454c41','#807d5a','#343637','#646f5a']],
    ['polar-uncommon-1','pixel',['#455679','#74889f','#232d43','#506680']],
    ['polar-uncommon-2','blotch',['#3b302b','#694439','#202323','#a2604a']],
    ['polar-uncommon-3','dune',['#c7d2ca','#e2e9df','#809496','#a8c2be']],
  ];
  for(const [i,[id,style,colors]] of polarCamos.entries()){
    const canvas=createCanvas(640,320);
    camouflage(canvas,style,colors,10322+i*251);
    save(id,canvas);
  }
  save('polar-rare-1',cinnabarFinish());
  save('polar-rare-2',sonarFinish());
  save('polar-rare-3',crystalFinish());
  save('polar-legendary-1',await nautilusFinish());
  save('polar-legendary-2',await auroraFinish());
  save('polar-ultra-1',await sunstrikeFinish());
}

const args=process.argv.slice(2);
if(!args.includes('--polar'))await bakeFieldReserve(args);
if(!args.length||args.includes('--polar'))await bakePolarCircuit();
