import {canSeeReconMark,RECON_MARK_LIFETIME} from '../shared/recon-optics.js';

export function mountReconMarks(container){
  const marks=new Map();
  const lifetime=mark=>mark.time+RECON_MARK_LIFETIME;
  const visible=(mark,player,time)=>canSeeReconMark(player,mark)&&time<lifetime(mark);
  return {
    receive(mark,player,time){
      if(!visible(mark,player,time))return;
      const key=`${mark.team}/${mark.squadId}/${mark.kind}/${mark.targetId}`;
      const previous=marks.get(key);
      if(previous?.mark.time>mark.time)return;
      if(previous){previous.mark=mark;return;}
      const node=document.createElement('div');
      node.className='recon-mark';
      node.dataset.target=mark.kind;
      const icon=document.createElement('i'),label=document.createElement('span');
      label.textContent=mark.kind==='vehicle'?'ТЕХНИКА':'ПЕХОТА';
      node.append(icon,label);
      container.append(node);
      marks.set(key,{mark,node});
    },
    render(renderer,player,time){
      for(const [key,{mark,node}] of marks){
        if(!visible(mark,player,time)){node.remove();marks.delete(key);continue;}
        const screen=renderer.project(mark.x,mark.y,mark.z);
        node.hidden=!screen.visible;
        if(!screen.visible)continue;
        node.style.transform=`translate3d(${screen.x}px,${screen.y}px,0) translate(-50%,-50%)`;
        node.style.opacity=Math.min(1,(lifetime(mark)-time)/1.3);
      }
    },
    drawMap(ctx,player,time,half,scale,radius=4){
      ctx.save();
      ctx.strokeStyle='#f2bf70';ctx.lineWidth=1.2;
      for(const {mark} of marks.values()){
        if(!visible(mark,player,time))continue;
        const x=(mark.x+half)*scale,y=(mark.z+half)*scale;
        ctx.globalAlpha=Math.min(1,(lifetime(mark)-time)/1.3);
        ctx.beginPath();
        if(mark.kind==='vehicle')ctx.rect(x-radius,y-radius,radius*2,radius*2);
        else{ctx.moveTo(x,y-radius);ctx.lineTo(x+radius,y);ctx.lineTo(x,y+radius);ctx.lineTo(x-radius,y);ctx.closePath();}
        ctx.stroke();
      }
      ctx.restore();
    },
    clear(){
      marks.clear();
      container.replaceChildren();
    },
  };
}
