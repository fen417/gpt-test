import {CLASSES,WEAPONS,defaultWeaponId} from '../shared/world.js';
import {InfantryAssets} from './infantry-assets.js';
import {createInfantry,disposeInfantry,sampleInfantryClip} from './infantry.js';
import {mountWeaponPreview} from './weapon-preview.js';
import {mountCollimator} from './collimator.js';

export function mountProfilePreview({getRenderer,getSelection}){
  const optics=new WeakMap();
  return mountWeaponPreview({
    panelId:'profile-panel',prefix:'profile-preview',
    getGpuDevice:()=>getRenderer()?.webgpu?.device??null,
    getItem(){
      const renderer=getRenderer(),selection=getSelection();
      if(!renderer||!selection)return null;
      const {classId,team,weaponId,collimator}=selection;
      if(classId)return {
        key:'soldier:'+classId+':'+team,name:CLASSES[classId].name,
        async load(){
          const primary=defaultWeaponId(classId);
          const assets=renderer.infantry??=new InfantryAssets(renderer.renderer);
          await assets.load(team,primary);
          const rig=createInfantry(assets.get(team,primary),{id:'profile',team,classId,weaponId:primary});
          rig.marker.visible=false;
          sampleInfantryClip(rig,'ready_idle',.25);
          return {
            model:rig.group,angle:[.03,Math.PI+.38,0],
            dispose:()=>disposeInfantry(rig),
          };
        },
      };
      return {
        key:'weapon:'+weaponId,name:WEAPONS[weaponId].name,
        load:()=>({model:renderer.weaponRig.createPreviewModel(WEAPONS[weaponId].classId??'assault',weaponId)}),
        update(model){
          if(collimator&&!optics.has(model))optics.set(model,mountCollimator(weaponId,model));
          return optics.get(model)?.show(Boolean(collimator));
        },
      };
    },
  });
}
