import { GAME_VERSION } from '../shared/releases.js';
import { PROTOCOL_VERSION } from '../shared/world.js';
import './perf-panel.css';

export function mountPerfPanel({reset}={}){
  if(!new URLSearchParams(location.search).has('perf'))return {enabled:false,update(){}};
  const panel=document.createElement('aside');panel.className='perf-panel';panel.setAttribute('aria-label','Производительность');
  const title=document.createElement('strong');title.textContent='SECTOR 09 · PERF';
  const values=document.createElement('pre'),note=document.createElement('small');note.textContent='Esc — освободить курсор. Начни запись после загрузки карты.';
  const record=document.createElement('button'),download=document.createElement('button');record.textContent='Начать запись';download.textContent='Скачать JSON';
  let recording=false,startedAt=null,stoppedAt=null,samples=[],latest=null,context=null;
  record.onclick=()=>{
    if(recording){recording=false;stoppedAt=new Date().toISOString();record.textContent='Новая запись';}
    else{reset?.();samples=[];context=null;startedAt=new Date().toISOString();stoppedAt=null;recording=true;record.textContent='Остановить запись';}
  };
  const report=()=>({schema:1,version:GAME_VERSION,protocol:PROTOCOL_VERSION,startedAt,stoppedAt,environment:{userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,deviceMemoryGB:navigator.deviceMemory??null,screen:{width:screen.width,height:screen.height,devicePixelRatio}},context,samples,latest});
  download.onclick=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(report(),null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=`sector09-perf-${latest?.mapId??'menu'}-${latest?.quality??'unknown'}-${Date.now()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  panel.append(title,values,record,download,note);document.body.append(panel);
  panel.addEventListener('mousedown',event=>event.stopPropagation());
  const ms=value=>value==null?'н/д':Number(value).toFixed(2);
  return {enabled:true,update(data){
    latest={timestamp:new Date().toISOString(),...data};
    const nextContext=JSON.stringify([data.mapId,data.quality,data.mode]);
    if(recording&&data.active){
      if(context&&context!==nextContext){recording=false;stoppedAt=latest.timestamp;record.textContent='Новая запись';}
      else{context=nextContext;samples.push(latest);if(samples.length>=3600){recording=false;stoppedAt=latest.timestamp;record.textContent='Новая запись';}}
    }
    values.textContent=[`${data.mapId} · ${data.quality} · ${data.mode}${recording?' · REC':''} · ${samples.length} сэмпл.`,
      `Кадр avg/p95/p99: ${ms(data.frameMs.avg)} / ${ms(data.frameMs.p95)} / ${ms(data.frameMs.p99)} мс`,
      `CPU p95: ${ms(data.cpuMs.p95)} · GPU p95: ${ms(data.gpuMs?.p95)} мс`,
      `Draw calls: ${data.calls} · Треугольники: ${data.triangles}`,
      `Геометрии: ${data.geometries} · Текстуры: ${data.textures} · Масштаб: ${ms(data.pixelRatio)}`,
      `JS heap: ${data.heapBytes==null?'н/д':(data.heapBytes/1048576).toFixed(1)+' МБ'}`,
      `RTT: ${data.network?.rttMs??'—'} · jitter: ${ms(data.network?.jitterMs)} мс · replay: ${data.network?.replayedInputs??0}`,
      `Просадки >33 мс: ${data.frameMs.over33} / ${data.frameMs.count}`].join('\n');
  }};
}
