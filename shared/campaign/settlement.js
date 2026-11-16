// Solid parts use the same dimensions for rendering and collision.
export function settlement(part){
  const timber='#806347',plaster='#b9a17d';
  function detail(id,kind,x,z,w,d,h,color,extra={},level=1){
    return part(id,kind,x,z,w,d,h,color,{...extra,noCollision:true,detailLevel:level});
  }
  function wall(id,x,z,length,{axis='x',gap=0,offset=0,height=1.7,thickness=.36,color=plaster,baseY}={}){
    const draw=(name,at,span)=>{
      if(span<=0)return;
      const alongX=axis==='x';
      part(name,'village-stone',x+(alongX?at:0),z+(alongX?0:at),
        alongX?span:thickness,alongX?thickness:span,height,color,baseY===undefined?{}:{baseY,overhead:baseY>0});
    };
    if(gap<=0){draw(id,0,length);return;}
    const left=length/2+offset-gap/2,right=length-left-gap;
    draw(id+'-left',(left-length)/2,left);
    draw(id+'-right',(length-right)/2,right);
  }
  function canopy(id,x,z,w,d,{baseY=0,height=2.55,color='#a48965',wood=false}={}){
    for(const side of [-1,1])for(const end of [-1,1])
      part(`${id}-post-${side}-${end}`,'village-wood',x+side*(w/2-.17),z+end*(d/2-.17),
        .17,.17,height,timber,{baseY});
    part(id+'-roof',wood?'village-wood':'village-awning',x,z,w+.28,d+.2,.1,color,
      {baseY:baseY+height,overhead:true,noCollision:!wood});
    for(const dx of [-.31,0,.31])detail(id+'-batten-'+dx,'village-wood',x+dx*w,z,.08,d,.08,timber,
      {baseY:baseY+height+.08},2);
  }
  function stall(id,x,z,w,{roof=true,color='#a78363',baseY=0,goods='village-produce-crates'}={}){
    const d=1.35,h=.94;
    part(id+'-counter','village-wood',x,z,w,d,.13,'#a78960',{baseY:baseY+h-.13,overhead:true});
    for(const side of [-1,1])for(const end of [-1,1])
      part(`${id}-leg-${side}-${end}`,'village-wood',x+side*(w/2-.13),z+end*(d/2-.14),.14,.14,h-.13,timber,{baseY});
    if(roof){
      for(const side of [-1,1])part(id+'-post-'+side,'village-wood',x+side*(w/2-.12),z-d*.59,.13,.13,2.46,timber,{baseY});
      part(id+'-awning','village-awning',x,z,w+.32,2.64,.085,color,{baseY:baseY+2.46,noCollision:true});
    }
    detail(id+'-goods',goods,x+w*.17,z,1.22,.77,goods==='village-pottery'?.48:.27,'#aa865d',{baseY:baseY+h});
  }
  function sign(id,x,z,text,{baseY=2.55,width=2.8,yaw=0,color='#4e5b51'}={}){
    part(id,'village-lettered-sign',x,z,width,.10,.54,color,{baseY,text,modelRotation:{y:yaw},noCollision:true});
  }
  function wear(id,x,z,w,{baseY=0,side=-1}={}){
    const front=z+side*.015,chip=x-w*.31;
    detail(id+'-plinth','village-stone',chip,front,w*.24,.042,.24,'#94826a',{baseY:baseY+.03});
    for(const [i,[dx,y,width]] of [[0,.31,.74],[.15,.46,.58],[-.12,.6,.39],[.09,1.25,.3]].entries())
      detail(id+'-chip-'+i,'village-stone',chip+dx,front,width,.05,.13,['#8e745b','#9e8467','#aa9171','#967e62'][i],
        {baseY:baseY+y},2);
  }
  return {wall,canopy,stall,detail,sign,wear};
}
