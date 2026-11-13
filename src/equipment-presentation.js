import { selectedGadget, isSupplyGadget, gadgetCooldown } from '../shared/gadgets.js';

// Presentation only: ammunition, firing permission and damage stay authoritative.
export class EquipmentPresentation {
  update(player,input,dt,sequence,ack){
    if(!player?.alive||player.vehicleId){this.key=null;return player;}
    const slot=input.weaponSlot||player.weaponSlot||1;
    let kind=selectedGadget(player.classId,input.toolSlot);
    if(isSupplyGadget(kind)&&gadgetCooldown(player,kind)>0)kind=null;
    const key=player.id+'/'+slot+'/'+(kind??'');
    if(this.key!==key){
      const initialized=this.key!=null;this.key=key;this.sequence=sequence;this.elapsed=0;
      this.remaining=initialized?.38:player.equipTime??0;this.confirmed=false;
    }
    this.elapsed+=dt;this.remaining=Math.max(0,this.remaining-dt);
    if(player.gadgetActionRemaining>0)return player;
    const weaponId=slot===2?player.sidearmId:player.primaryWeaponId;
    const matches=player.weaponSlot===slot&&(player.heldGadget??null)===(kind??null);
    if(ack>=this.sequence&&matches)this.confirmed=true;
    // Respect rejection/automatic return after the matching command was consumed.
    if(ack>=this.sequence&&!matches||this.elapsed>1&&!this.confirmed)return player;
    return {...player,weaponSlot:slot,weaponId:weaponId||player.weaponId,heldGadget:kind,equipTime:this.remaining};
  }
}
