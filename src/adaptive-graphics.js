const gpuSteps = [
  ['reflections',{high:'medium',medium:'low',low:'off'}],
  ['waterRefraction',{high:'off'}],
  ['water',{high:'medium',medium:'low',low:'legacy'}],
  ['localReflections',{high:'medium',medium:'off'}],
  ['gi',{high:'low',low:'off'}],
  ['atmosphere',{ultra:'high',high:'medium',medium:'low',low:'off'}],
  ['clouds',{high:'medium',medium:'low',low:'off'}],
  ['heightFog',{high:'low',low:'off'}],
  ['relief',{high:'low',low:'basic',basic:'off'}],
  ['mapWeathering',{high:'low',low:'off'}],
  ['ao',{gtao:'high',high:'low'}],
  ['contact',{high:'medium',medium:'low',low:'off'}],
  ['shadows',{ultra:'very-high','very-high':'high',high:'medium'}],
  ['muzzleLights',{high:'low',low:'off'}],
  ['fireLighting',{high:'off'}],
  ['dust',{high:'medium',medium:'off'}],
  ['explosions',{high:'medium',medium:'legacy'}],
  ['smoke',{high:'medium',medium:'legacy'}],
  ['fireEffects',{high:'legacy'}],
  ['muzzleEffects',{high:'legacy'}],
  ['softParticles',{high:'off'}],
  ['bloom',{ultra:'high',high:'medium',medium:'low',low:'off'}],
  ['ao',{low:'off'}],
];

export class AdaptiveGraphics {
  scale=1;
  elapsed=0;
  frames=[];
  misses=0;
  headroom=0;
  cpuStep=0;
  gpuStep=0;
  reason=null;
  p95=null;
  p99=null;

  configure(settings, requestedShadows) {
    if(this.settings===settings&&this.requestedShadows===requestedShadows)return;
    this.settings=settings;
    this.requestedShadows=requestedShadows;
    this.target=Number(settings.adaptiveTarget)||0;
    this.elapsed=0;this.frames.length=0;
    this.misses=this.headroom=this.cpuStep=this.gpuStep=0;
    this.scale=1;this.reason=null;
    let next={...settings,shadows:requestedShadows};
    this.tiers=[next];
    for(const [key,levels] of gpuSteps){
      for(let lower=levels[next[key]];lower;lower=levels[lower]){
        if(settings.adaptiveFloor==='balanced'&&lower==='off')break;
        next={...next,[key]:lower};
        this.tiers.push(next);
      }
    }
    this.effects=settings;
    this.shadowOverride=null;
  }

  sample(dt,cpuMs,gpuTimer,canScale) {
    if(!this.target||dt<=0)return;
    this.frames.push(dt*1000);
    this.elapsed+=dt;
    if(this.elapsed<1.2)return;
    this.frames.sort((a,b)=>a-b);
    this.p95=this.frames[Math.ceil(this.frames.length*.95)-1];
    this.p99=this.frames[Math.ceil(this.frames.length*.99)-1];
    this.frames.length=0;this.elapsed=0;
    const budget=1000/this.target;
    const gpuMs=gpuTimer.summary()?.p95;
    const cpuBound=cpuMs>budget*.72&&(gpuMs==null||cpuMs>gpuMs);
    const gpuBound=gpuMs!=null?gpuMs>budget*.76:!cpuBound;
    const overloaded=this.p95>budget*1.17&&this.p99>budget*1.2;
    const hasHeadroom=this.p95<=budget*1.07 && cpuMs<budget*.69 && (gpuMs==null||gpuMs<budget*.71);
    this.misses=overloaded?this.misses+1:0;
    this.headroom=hasHeadroom?this.headroom+1:0;
    if(this.misses>=3){
      this.misses=0;
      if(cpuBound){
        const max=this.settings.adaptiveFloor==='balanced'?1:2;
        if(this.cpuStep<max){this.cpuStep++;this.reason='CPU · детализация';}
      }else if(gpuBound){
        if(this.gpuStep<this.tiers.length-1){
          this.gpuStep++;
          this.reason='GPU · '+gpuEffectName(this.tiers[this.gpuStep-1],this.tiers[this.gpuStep]);
          this.applyTier();
        }else if(canScale&&this.settings.adaptiveClarity!=='on'){
          this.scale=Math.max(Number(this.settings.adaptiveMinScale)/100,Math.round((this.scale-.05)*20)/20);
          this.reason='GPU · масштаб';
        }
      }
    }else if(this.headroom>=7){
      this.headroom=0;
      if(this.scale<1)this.scale=Math.min(1,Math.round((this.scale+.05)*20)/20);
      else if(this.gpuStep>0){this.gpuStep--;this.applyTier();}
      else if(this.cpuStep>0)this.cpuStep--;
      if(this.scale===1&&this.cpuStep===0&&this.gpuStep===0)this.reason=null;
    }
  }

  applyTier() {
    const tier=this.tiers[this.gpuStep];
    this.effects=this.gpuStep?tier:this.settings;
    this.shadowOverride=tier.shadows===this.requestedShadows?null:tier.shadows;
  }
}

function gpuEffectName(previous,next) {
  const names={reflections:'отражения',waterRefraction:'преломление воды',water:'вода',localReflections:'локальные отражения',gi:'непрямое освещение',atmosphere:'атмосфера',clouds:'облака',heightFog:'высотный туман',relief:'параллакс-рельеф',mapWeathering:'износ поверхностей',ao:'AO',contact:'контактные тени',shadows:'каскады',explosions:'взрывы',smoke:'дым',muzzleLights:'свет выстрелов',fireLighting:'свет огня',dust:'пыль',fireEffects:'огонь',muzzleEffects:'дульная вспышка',softParticles:'мягкие частицы',bloom:'свечение'};
  return Object.keys(names).map(key=>previous[key]!==next[key]?names[key]:null).find(Boolean)??'эффекты';
}
