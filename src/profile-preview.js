import {Color} from 'three';
import {CLASSES,WEAPONS,defaultWeaponId} from '../shared/world.js';
import {InfantryAssets} from './infantry-assets.js';
import {createInfantry,disposeInfantry,sampleInfantryClip} from './infantry.js';
import {mountWeaponPreview} from './weapon-preview.js';

function tint(model,color){
  const copies=new Map();
  if(color){
    const shade=new Color(color);
    model.traverseVisible(object=>{
      if(!object.isMesh)return;
      const recolor=material=>{
        if(!material.color||/skin|face|eye|lens|glass/i.test(material.name))return material;
        if(!copies.has(material)){
          const copy=material.clone();
          copy.color.lerp(shade,.55);
          copies.set(material,copy);
        }
        return copies.get(material);
      };
      object.material=Array.isArray(object.material)?object.material.map(recolor):recolor(object.material);
    });
  }
  return ()=>{for(const material of copies.values())material.dispose();};
}

export function mountProfilePreview({getRenderer,getSelection}){
  return mountWeaponPreview({
    panelId:'profile-panel',prefix:'profile-preview',
    getGpuDevice:()=>getRenderer()?.webgpu?.device??null,
    getItem(){
      const renderer=getRenderer(),selection=getSelection();
      if(!renderer||!selection)return null;
      const {classId,team,weaponId,color}=selection;
      if(classId)return {
        key:'soldier:'+classId+':'+team+':'+color,name:CLASSES[classId].name,
        async load(){
          const primary=defaultWeaponId(classId);
          const assets=renderer.infantry??=new InfantryAssets(renderer.renderer);
          await assets.load(team,primary);
          const rig=createInfantry(assets.get(team,primary),{id:'profile',team,classId,weaponId:primary});
          rig.marker.visible=false;
          sampleInfantryClip(rig,'ready_idle',.25);
          const disposeTint=tint(rig.model,color);
          return {
            model:rig.group,angle:[.03,Math.PI+.38,0],
            dispose:()=>{disposeTint();disposeInfantry(rig);},
          };
        },
      };
      return {
        key:'weapon:'+weaponId+':'+color,name:WEAPONS[weaponId].name,
        load(){
          const model=renderer.weaponRig.createPreviewModel(WEAPONS[weaponId].classId??'assault',weaponId);
          return {model,dispose:tint(model,color)};
        },
      };
    },
  });
}
