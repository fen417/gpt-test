import {WEAPONS} from '../shared/world.js';
import {loadCollimatorModel,mountCollimator} from './collimator.js';
import {cloneWeaponModel,showWeaponUpgrades} from './weapon-models.js';

const optics=new WeakMap();
const loading=new WeakSet();

export function attachmentPreviewItem(weaponId,attachments,refresh){
  if(!WEAPONS[weaponId])return null;
  return {
    key:'weapon:'+weaponId,
    name:WEAPONS[weaponId].name,
    load:()=>{
      const model=cloneWeaponModel(weaponId);
      if(!model)throw Error('Weapon preview unavailable');
      return {model};
    },
    update(model){
      const show=attachments?.optic==='collimator-15';
      if(show&&!optics.has(model)){
        const optic=mountCollimator(weaponId,model);
        if(optic)optics.set(model,optic);
        else if(!loading.has(model)){
          loading.add(model);
          void loadCollimatorModel().then(refresh).catch(()=>{}).finally(()=>loading.delete(model));
        }
      }
      const opticChanged=optics.get(model)?.show(show);
      const upgradesChanged=showWeaponUpgrades(model,weaponId,attachments);
      return opticChanged||upgradesChanged;
    },
  };
}
