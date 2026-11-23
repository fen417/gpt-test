import {Vector3} from 'three';
import {CLASSES} from '../shared/world.js';
import {InfantryAssets} from './infantry-assets.js';
import {createInfantry,disposeInfantry,updateInfantry} from './infantry.js';
import {mountWeaponPreview} from './weapon-preview.js';
import {attachmentPreviewItem} from './attachment-preview.js';
import {weaponModuleMount} from './weapon-models.js';

export function mountProfilePreview({getRenderer,getSelection,getLowWeaponDetail}){
  const buttons=[...document.querySelectorAll('#profile-weapon-mounts button')];
  const position=new Vector3();
  const preview=mountWeaponPreview({
    panelId:'profile-panel',prefix:'profile-preview',
    getGpuDevice:()=>getRenderer()?.webgpu?.device??null,
    getItem(){
      const renderer=getRenderer(),selection=getSelection();
      if(!renderer||!selection)return null;
      const {classId,team,weaponId,attachments}=selection;
      if(classId)return {
        key:'soldier:'+classId+':'+team,name:CLASSES[classId].name,
        async load(){
          const primary='ar416';
          const assets=renderer.infantry??=new InfantryAssets(renderer.renderer);
          await assets.load(team,primary);
          const player={id:'profile',team,classId,weaponId:primary,x:0,y:0,z:0,yaw:0,pitch:0,alive:true,grounded:true,shotSeq:0};
          const rig=createInfantry(assets.get(team,primary),player);
          rig.marker.visible=false;
          updateInfantry(rig,player,1/60,true);
          return {
            model:rig.group,angle:[.03,Math.PI+.38,0],
            dispose:()=>disposeInfantry(rig),
          };
        },
      };
      return attachmentPreviewItem(weaponId,attachments,()=>preview.update(),getLowWeaponDetail());
    },
    afterDraw(model,camera){
      const visible=model&&getSelection()?.hotspots;
      for(const button of buttons){
        const mount=visible&&weaponModuleMount(model,button.dataset.weaponMount);
        button.hidden=!mount;
        if(!mount)continue;
        mount.getWorldPosition(position).project(camera);
        button.style.left=`${Math.max(3,Math.min(97,50+50*position.x))}%`;
        button.style.top=`${Math.max(5,Math.min(95,50-50*position.y))}%`;
      }
    },
  });
  return preview;
}
