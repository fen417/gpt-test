import { PerformanceSamples } from '../shared/performance-samples.js';

export const gpuPassLabels = {
  world:'Мир', shadows:'Карты теней', viewModel:'Оружие',
  depthEffects:'AO / контактные тени / атмосфера', reflectionMask:'Поверхности для SSR', reflections:'SSR', bloom:'Bloom', bloomComposite:'HDR Bloom · композиция',
  worldComposite:'Композиция мира', softParticles:'Мягкие частицы', display:'Цвет / FXAA',
  fsr:'FSR', smaa:'SMAA', realPresent:'Вывод при FG', frameGeneration:'Frame Generation',
};

export class GpuPassSamples {
  byPass = new Map();

  add(pass, milliseconds) {
    if(!Number.isFinite(milliseconds)||milliseconds<0)return;
    if(!this.byPass.has(pass))this.byPass.set(pass,new PerformanceSamples(120));
    this.byPass.get(pass).add(milliseconds);
  }

  summary() {
    return Object.fromEntries([...this.byPass].map(([pass,samples])=>[pass,samples.summary()]));
  }

  reset() { this.byPass.clear(); }
}

export function renderTimed(renderer,scene,camera,timer,pass) {
  const start=timer?.recordCpuPass?performance.now():0;
  const timing=timer?.beginPass(pass);
  try{renderer.render(scene,camera);}
  finally{
    if(timing)timer.endPass();
    if(start)timer.recordCpuPass(pass,performance.now()-start);
  }
}
