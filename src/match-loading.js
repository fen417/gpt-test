import catalog from '../shared/campaign/catalog.json' with {type:'json'};
import './match-loading.css';

const panoramas={
  port:new URL('./assets/panoramas/port.webp',import.meta.url).href,
  quarry:new URL('./assets/panoramas/quarry.webp',import.meta.url).href,
  village:new URL('./assets/panoramas/village.webp',import.meta.url).href,
  fy_pool_day:new URL('./assets/panoramas/fy_pool_day.webp',import.meta.url).href,
  linden_estate:new URL('./assets/panoramas/linden_estate.webp',import.meta.url).href,
};
const modes={solo:'Одиночная игра',server:'Сетевая игра',campaign:'Кампания «Песок и сталь»'};

export function matchLoadingInfo(mode,map,missionId){
  const mission=missionId&&catalog.missions.find(item=>item.id===missionId);
  const image=mission?.previewImage
    ?new URL(import.meta.env.BASE_URL+'campaign/'+mission.previewImage,location.href).href
    :panoramas[map?.id];
  return {mode:modes[mode],title:mission?.title??map?.name??'Подготовка операции',image};
}

export function mountMatchLoading(cancel){
  const get=id=>document.getElementById('match-loading'+id);
  const dialog=get(''),image=get('-image'),progress=get('-progress'),status=get('-status');
  get('-cancel').addEventListener('click',cancel);
  dialog.addEventListener('cancel',event=>{event.preventDefault();cancel();});
  const describe=info=>{
    get('-mode').textContent=info.mode;
    get('-title').textContent=info.title;
    if(info.image)image.src=info.image;
    else image.removeAttribute('src');
    image.hidden=!info.image;
  };
  const update=(step,label)=>{
    progress.value=step;
    status.textContent=label;
  };
  return {
    describe,update,
    async show(info){
      describe(info);
      update(0,'Подготовка операции');
      if(!dialog.open)dialog.showModal();
      if(info.image)await image.decode().catch(()=>{});
      // Give the browser a paint before geometry construction or GPU uploads.
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    },
    close(){if(dialog.open)dialog.close();},
  };
}
