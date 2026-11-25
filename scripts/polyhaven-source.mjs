// Poly Haven returns a nested file tree. Discover records by their actual
// filenames, not the shape/capitalization of the surrounding API keys.
const aliases={diff:['diff','diffuse','albedo','basecolor'],nor_gl:['nor_gl','normal_gl'],arm:['arm','orm'],disp:['disp','displacement','height']};
export function sourceCandidates(metadata,asset,channel,size,preferred=[]){
  const names=[...new Set([...preferred,...(aliases[channel]??[channel])])],res=size/1024+'k';
  const output=[],seen=new Set();
  const append=(url,md5,rank=names.length)=>{
    if(typeof url!=='string'||seen.has(url))return;
    let parsed;
    try{parsed=new URL(url);}catch{return;}
    if(parsed.protocol!=='https:'||!/(^|\.)polyhaven\.(org|com)$/.test(parsed.hostname))return;
    const extension=parsed.pathname.toLowerCase().match(/\.(jpe?g|png|webp)$/)?.[0];
    if(!extension)return;
    seen.add(url);output.push({url,md5,extension,rank});
  };
  function visit(node,path=[]){
    if(!node||typeof node!=='object')return;
    if(typeof node.url==='string'){
      let filename='';
      try{filename=decodeURIComponent(new URL(node.url).pathname.split('/').pop()).toLowerCase();}catch{}
      const keys=path.map(key=>String(key).toLowerCase());
      const rank=names.findIndex(name=>['jpg','jpeg','png','webp'].some(ext=>filename===asset.toLowerCase()+'_'+name+'_'+res+'.'+ext)||(keys.includes(name)&&keys.includes(res)));
      if(rank>=0)append(node.url,node.md5,rank);
    }
    for(const [key,value] of Object.entries(node))if(value&&typeof value==='object')visit(value,[...path,key]);
  }
  visit(metadata);
  output.sort((a,b)=>a.rank-b.rank||Number(b.extension==='.jpg')-Number(a.extension==='.jpg'));
  // CDN naming follows the published Poly Haven texture file convention.
  // HTTP success, image decoding and native resolution are checked by caller.
  for(const name of names.slice(0,Math.max(2,preferred.length)))for(const extension of ['jpg','png']){
    append('https://dl.polyhaven.org/file/ph-assets/Textures/'+extension+'/'+res+'/'+asset+'/'+asset+'_'+name+'_'+res+'.'+extension);
  }
  return output;
}
