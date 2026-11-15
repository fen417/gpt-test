// Keep objective and casualty markers away from the central engagement area.
// Return viewport pixels so the world marker system can render small indicators.
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function placeCampaignMarker(screen,width,height){
  if(!screen?.visible||!Number.isFinite(screen.x)||!Number.isFinite(screen.y)
    ||!(width>0)||!(height>0))return null;
  const cx=width*.5,cy=height*.5;
  const safeX=Math.min(200,width*.235),safeY=Math.min(138,height*.20);
  let x=clamp(screen.x,22,Math.max(22,width-22));
  let y=clamp(screen.y,70,Math.max(70,height-95));
  // Shift markers off the entire crosshair/sight region, not just the dot.
  // Display position can differ from its world projection; the indicator is
  // navigational and must never hide the enemy the player is aiming at.
  const dx=x-cx,dy=y-cy;
  if(Math.abs(dx)<safeX&&Math.abs(dy)<safeY){
    const horizontal=Math.abs(dx)/safeX,vertical=Math.abs(dy)/safeY;
    if(horizontal>vertical)
      x=cx+(dx<0?-safeX:safeX);
    else
      y=cy+(dy<=0?-safeY:safeY);
  }
  return {x:clamp(x,22,width-22),y:clamp(y,70,height-95)};
}
