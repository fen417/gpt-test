import {WEAPONS} from '../shared/world.js';
import {loadCollimatorModel,mountCollimator} from './collimator.js';
import {cloneWeaponModel,loadWeaponDetail,showWeaponUpgrades} from './weapon-models.js';
import {setWeaponSkin} from './weapon-skins.js';

const optics=new WeakMap();
const loading=new WeakSet();

export function attachmentPreviewItem(weaponId,attachments,refresh,lowDetail=false,skinId=null){
  if(!WEAPONS[weaponId])return null;
  return {
    key:'weapon:'+weaponId+':'+(skinId??'')+(weaponId==='ar416'?(lowDetail?':low':':detailed'):''),
    name:WEAPONS[weaponId].name,
    async load(){
      if(!lowDetail)await loadWeaponDetail(weaponId);
      const model=cloneWeaponModel(weaponId,!lowDetail);
      if(!model)throw Error('Weapon preview unavailable');
      if(skinId)await setWeaponSkin(model,weaponId,skinId);
      return {model,dispose:skinId?()=>void setWeaponSkin(model,weaponId,null):undefined};
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
      const upgradesChanged=showWeaponUpgrades(model,weaponId,attachments,lowDetail);
      return opticChanged||upgradesChanged;
    },
  };
}
