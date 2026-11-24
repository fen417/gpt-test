import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';

// Download inputs from the links in sources.md, or generate ceramic-ao.png
// with bake-ceramic-ao.py. Pass the directory containing those source images.
const input=process.argv[2]??'.perf-local/remaster-source';
const selection=process.argv[3];
const output='src/assets/remaster';
await mkdir(output,{recursive:true});

const sizes=[256,512,1024];
// Match the existing map palette while keeping the local variations of the scans.
const palette={
  concrete:{source:[85,85,83],target:[161,161,150],contrast:.88},
  asphalt:{source:[89,89,83],target:[100,105,106],contrast:.96},
  sand:{source:[145,109,75],target:[195,174,134],contrast:.93},
  earth:{source:[145,109,75],target:[137,139,119],contrast:.74},
};
for(const surface of ['concrete','rock','sand','earth','asphalt','ceramic']){
  if(selection&&selection!==surface)continue;
  const channels=surface==='ceramic'?['arm']:surface==='earth'?['diff']:['diff','nor_gl','arm'];
  if(surface==='concrete'||surface==='rock')channels.push('disp');
  for(const channel of channels){
    const image=await loadImage(input+'/'+(surface==='ceramic'?'ceramic-ao.png':(surface==='earth'?'sand':surface)+'-'+channel+'.jpg'));
    for(const size of sizes){
      if(size===256&&channel!=='arm'||surface==='ceramic'&&size===512)continue;
      const canvas=createCanvas(size,size), ctx=canvas.getContext('2d');
      ctx.imageSmoothingQuality='high';
      ctx.drawImage(image,0,0,size,size);
      const colors=channel==='diff'?palette[surface]:null;
      if(colors||surface==='sand'&&channel==='arm'){
        const pixels=ctx.getImageData(0,0,size,size);
        if(colors){
          for(let i=0;i<pixels.data.length;i+=4)for(let c=0;c<3;c++){
            pixels.data[i+c]=colors.target[c]+(pixels.data[i+c]-colors.source[c])*colors.contrast;
          }
        }else{
          // Dry sand keeps its grain in the color and normal maps. Raise
          // roughness so the dawn sky doesn't flicker in a narrow highlight.
          for(let i=1;i<pixels.data.length;i+=4)pixels.data[i]+=(255-pixels.data[i])*.52;
        }
        ctx.putImageData(pixels,0,0);
      }
      await writeFile(output+'/'+surface+'-'+channel+'-'+size+'.webp',
        canvas.toBuffer('image/webp',channel==='diff'?90:96));
    }
  }
}
