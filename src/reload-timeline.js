const clamp=(value,lower,upper)=>Math.max(lower,Math.min(upper,value));

// Camera/viewmodel-only clock; ammunition and reload eligibility remain server
// authoritative. Server samples are guidance, not animation frame timestamps.
export class ReloadTimeline{
  constructor(){this.reset();}
  reset(){this.active=false;this.weaponKey=null;this.phase=1;}
  update({reloading,progress,duration,weaponKey,dt}){
    if(!reloading){this.reset();return this.phase;}
    const observed=Number.isFinite(progress)?clamp(progress,0,1):null;
    if(!this.active||this.weaponKey!==weaponKey){
      this.active=true;this.weaponKey=weaponKey;this.phase=observed??0;
      return this.phase;
    }
    const step=clamp(dt??0,0,.1)/Math.max(.1,duration);
    const next=clamp(this.phase+step,0,1);
    // Snapshots can be 50-100+ ms late or delivered unevenly. Correct their
    // phase error by at most 25% of elapsed local time and never go backwards.
    const correction=observed===null?0:clamp(observed-next,-step*.25,step*.25);
    this.phase=clamp(Math.max(this.phase,next+correction),0,1);
    return this.phase;
  }
}
