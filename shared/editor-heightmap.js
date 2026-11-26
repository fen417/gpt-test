
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export function heightmapRegion(grid,size){
 if(size===undefined)return {start:0,end:grid.count};
 return {start:Math.max(0,Math.ceil((-size/2-grid.min)/grid.cell)),end:Math.min(grid.count,Math.floor((size/2-grid.min)/grid.cell))};
}
export function encodeHeightmap(grid,base,edits,{start=0,end=grid.count,min=-80,max=180}={}){
 if(!(max>min))throw Error('Верхняя высота должна быть больше нижней');
 const n=end-start+1,header=new TextEncoder().encode('P5\n'+n+' '+n+'\n65535\n'),bytes=new Uint8Array(header.length+n*n*2);bytes.set(header);
 const view=new DataView(bytes.buffer);let p=header.length;
 for(let z=start;z<=end;z++)for(let x=start;x<=end;x++){const i=z*(grid.count+1)+x,h=edits[i]??base[i];view.setUint16(p,Math.round(clamp((h-min)/(max-min),0,1)*65535));p+=2;}
 return bytes;
}
export function decodePGM(bytes){
 const isSpace=c=>[9,10,13,32].includes(c);let i=0;
 const token=()=>{while(i<bytes.length){if(isSpace(bytes[i]))i++;else if(bytes[i]===35){while(i<bytes.length&&bytes[i]!==10)i++;}else break;}const a=i;while(i<bytes.length&&!isSpace(bytes[i])&&bytes[i]!==35)i++;return new TextDecoder().decode(bytes.subarray(a,i));};
 const magic=token(),width=Number(token()),height=Number(token()),max=Number(token());
 if(magic!=='P5'||!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||width*height>16777216||!Number.isInteger(max)||max<1||max>65535||!isSpace(bytes[i]))throw Error('Требуется бинарный PGM P5, 8 или 16 бит');
 if(bytes[i++]===13&&bytes[i]===10)i++;
 const bpp=max>255?2:1;if(bytes.length-i!==width*height*bpp)throw Error('Размер PGM не соответствует заголовку');
 const values=new Float32Array(width*height);
 for(let p=0;p<values.length;p++){const v=bpp===2?bytes[i++]*256+bytes[i++]:bytes[i++];if(v>max)throw Error('Некорректное значение PGM');values[p]=v/max;}
 return {width,height,values};
}
export function importHeightmap(grid,base,edits,image,{start=0,end=grid.count,min=-80,max=180}={}){
 if(!Number.isFinite(min)||!Number.isFinite(max)||min< -80||max>180||min>=max||end<=start)throw Error('Допустимый диапазон высот: −80…180 м');
 const {width,height,values}=image;if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||values.length!==width*height)throw Error('Некорректная карта высот');
 const result={...edits},stride=grid.count+1,span=end-start;
 for(let row=start;row<=end;row++)for(let col=start;col<=end;col++){
  const u=(col-start)/span*(width-1),v=(row-start)/span*(height-1),x=Math.floor(u),z=Math.floor(v),tx=u-x,tz=v-z,x1=Math.min(x+1,width-1),z1=Math.min(z+1,height-1);
  const a=values[z*width+x]*(1-tx)+values[z*width+x1]*tx,b=values[z1*width+x]*(1-tx)+values[z1*width+x1]*tx;
  const h=Math.round(clamp(min+(a*(1-tz)+b*tz)*(max-min),min,max)*1000)/1000,i=row*stride+col;
  if(!Number.isFinite(h))throw Error('Некорректная высота');
  if(Math.abs(h-base[i])<.005)delete result[i];else result[i]=h;
 }
 return result;
}
