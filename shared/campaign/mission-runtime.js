// JSON conditions/actions are evaluated exclusively using authoritative sim ticks.
// No eval(), timers, DOM, network, or wall-clock time in mission rules.
export class MissionRuntime {
  constructor(definition,host){
    this.definition=definition;this.host=host;this.state={stage:0,stageAt:0,flags:{},objectives:{},fired:[],timers:{}};
  }
  condition(c){
    const {host:h,state:s}=this;
    if(c.all&&!c.all.every(x=>this.condition(x)))return false;
    if(c.any&&!c.any.some(x=>this.condition(x)))return false;
    if(c.not&&this.condition(c.not))return false;
    if(c.stage!==undefined&&s.stage!==c.stage)return false;
    if(c.enterZone&&!h.inZone(c.enterZone))return false;
    if(c.allDead&&!h.allDead(c.allDead))return false;
    if(c.objectiveDone&&!s.objectives[c.objectiveDone]?.done)return false;
    if(c.flag&&!s.flags[c.flag])return false;
    if(c.timer!==undefined){const timer=typeof c.timer==='number'?{seconds:c.timer}:c.timer;if(h.time-(s.timers[timer.id]??s.stageAt)<timer.seconds)return false;}
    if(c.alertLevel!==undefined&&h.alertLevel<c.alertLevel)return false;
    return true;
  }
  tick(){
    for(const objective of this.definition.objectives??[]){const current=this.state.objectives[objective.id];if(current&&!current.done&&objective.done&&this.condition(objective.done)){current.done=true;this.host.action({radio:objective.radio??'m01.duran.objective'});}}
    for(const [i,trigger] of (this.definition.triggers??[]).entries()){
      const id=trigger.id??String(i);if(this.state.fired.includes(id)||!this.condition(trigger.when))continue;
      this.state.fired.push(id);for(const action of trigger.do)this.apply(action);
      if(this.host.cutscene)break;
    }
  }
  apply(action){
    const s=this.state;
    if(action.stage!==undefined){s.stage=action.stage;s.stageAt=this.host.time;}
    if(action.flag)s.flags[action.flag]=action.value??true;
    if(action.timer)s.timers[action.timer]=this.host.time;
    if(action.objective){const id=action.objective;s.objectives[id]??={done:false};s.activeObjective=id;}
    if(action.complete&&s.objectives[action.complete])s.objectives[action.complete].done=true;
    this.host.action(action);
  }
  restore(state){this.state=structuredClone(state);}
}
