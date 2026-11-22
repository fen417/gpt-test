// A regular triangulated height field with the same diagonal as PlaneGeometry.
export function terrainHeightfield({x,z,columns,rows,stepX,stepZ,heights}){
  const stride=columns+1;
  let top=-Infinity;
  for(const height of heights)top=Math.max(top,height);
  const sample=(gx,gz)=>{
    const col=Math.min(columns-1,Math.floor(gx)),row=Math.min(rows-1,Math.floor(gz));
    const u=gx-col,v=gz-row,i=row*stride+col;
    const a=heights[i],b=heights[i+1],c=heights[i+stride],d=heights[i+stride+1];
    return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
  };
  function heightAt(worldX,worldZ){
    const gx=(worldX-x)/stepX,gz=(worldZ-z)/stepZ;
    if(gx<0||gz<0||gx>columns||gz>rows)return -Infinity;
    return sample(gx,gz);
  }
  const confined=(n,max)=>Math.max(0,Math.min(max,n));
  const cellAt=(p,d,max)=>confined(d<0?Math.ceil(p-1e-9)-1:Math.floor(p+1e-9),max-1);
  function raycast(origin,direction,length){
    if(Math.min(origin.y,origin.y+direction.y*length)>top)return Infinity;
    const gx=(origin.x-x)/stepX,gz=(origin.z-z)/stepZ,dx=direction.x/stepX,dz=direction.z/stepZ;
    let start=0,end=length;
    for(const [p,d,max] of [[gx,dx,columns],[gz,dz,rows]]){
      if(Math.abs(d)<1e-12){
        if(p<0||p>max)return Infinity;
        continue;
      }
      const a=-p/d,b=(max-p)/d;
      start=Math.max(start,Math.min(a,b));end=Math.min(end,Math.max(a,b));
      if(start>end)return Infinity;
    }
    const difference=t=>origin.y+direction.y*t-sample(confined(gx+dx*t,columns),confined(gz+dz*t,rows));
    let at=start,previous=difference(at);
    if(previous<-.001)return at;
    // Each grid cell contains two planes. Check both linear segments, even
    // when the ray enters and leaves a narrow peak between its endpoints.
    while(at<end-1e-8){
      const col=cellAt(gx+dx*at,dx,columns),row=cellAt(gz+dz*at,dz,rows);
      const edgeX=Math.abs(dx)<1e-12?Infinity:((dx>0?col+1:col)-gx)/dx;
      const edgeZ=Math.abs(dz)<1e-12?Infinity:((dz>0?row+1:row)-gz)/dz;
      const edge=Math.min(end,edgeX,edgeZ);
      if(edge<=at)break;
      const diagonal=(col+row+1-gx-gz)/(dx+dz);
      const split=diagonal>at+1e-8&&diagonal<edge-1e-8;
      if(split){
        const after=difference(diagonal);
        if(after<=0)return previous<=0?at:at+(diagonal-at)*previous/(previous-after);
        at=diagonal;previous=after;
      }
      const after=difference(edge);
      if(after<=0)return previous<=0?at:at+(edge-at)*previous/(previous-after);
      at=edge;previous=after;
    }
    return Infinity;
  }
  return {heightAt,raycast};
}
