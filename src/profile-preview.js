import {CLASSES,WEAPONS,defaultWeaponId} from '../shared/world.js';
import {InfantryAssets} from './infantry-assets.js';
import {createInfantry,disposeInfantry,sampleInfantryClip} from './infantry.js';
import {mountWeaponPreview} from './weapon-preview.js';

export function mountProfilePreview({getRenderer,getSelection}){
  return mountWeaponPreview({
    panelId:'profile-panel',prefix:'profile-preview',
    getGpuDevice:()=>getRenderer()?.webgpu?.device??null,
    getItem(){
      const renderer=getRenderer(),selection=getSelection();
      if(!renderer||!selection)return null;
      const {classId,team,weaponId}=selection;
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
      };
    },
  });
}
