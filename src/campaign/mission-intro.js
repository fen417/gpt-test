import catalog from '../../shared/campaign/catalog.json';
import './mission-intro.css';

const DURATION=7200, FADE_IN=650, FADE_OUT=1000;
const clamp01=n=>Math.max(0,Math.min(1,n));

// Cosmetic, local campaign overlay: never pauses the simulation or intercepts input.
export function mountMissionIntro(root,missionId,{resumed=false}={}){
  const mission=catalog.missions.find(item=>item.id===missionId&&item.implemented);
  if(resumed||!mission?.intro)return null;
  const {name,rank,callsign,unit,formation}=mission.intro;
  const card=document.createElement('aside');
  card.className='campaign-mission-intro';
  card.hidden=true;
  card.setAttribute('aria-label','Сведения о миссии');
  const add=(tag,cls,value)=>{
    const el=document.createElement(tag);
    el.className=cls;el.textContent=value;card.append(el);
  };
  add('small','campaign-intro-kicker',`МИССИЯ ${String(mission.number).padStart(2,'0')}`);
  add('h2','campaign-intro-title',mission.title);
  add('strong','campaign-intro-character',`${rank} ${name}`);
  add('span','campaign-intro-callsign',`Позывной: «${callsign}»`);
  add('span','campaign-intro-unit',unit);
  if(formation)add('span','campaign-intro-formation',formation);
  root.append(card);
  let elapsed=0,lastAt=null,done=false;
  const finish=()=>{done=true;card.remove();};
  return {
    update(m,paused,now,hasControl){
      if(done)return;
      if(!root.isConnected||m?.failed||m?.complete){finish();return;}
      // Wait until the opening cutscene is over and controls have actually been returned.
      // A later cutscene, pause, or loss of control must not consume the remaining title time.
      if(!m||paused||!hasControl||m.cutscene||m.awaitingLoadout||m.transfer!=null||m.disembark){
        card.hidden=true;lastAt=null;return;
      }
      if(lastAt!==null)elapsed+=Math.max(0,Math.min(250,now-lastAt));
      lastAt=now;
      if(elapsed>=DURATION){finish();return;}
      const opacity=Math.min(clamp01(elapsed/FADE_IN),clamp01((DURATION-elapsed)/FADE_OUT));
      card.hidden=false;
      card.style.opacity=String(opacity);
    }
  };
}
