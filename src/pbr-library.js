// Shared asset catalogue: actual scan sources, not enlarged legacy textures.
export const PBR_PACK_VERSION=1;
export const PBR_SOURCES=Object.freeze({
  concrete:{asset:'concrete_floor_worn_001',max:4096,height:true,palette:[85,85,83,161,161,150,.88]},
  rock:{asset:'rock_boulder_dry',max:4096,height:true},
  sand:{asset:'gravelly_sand',height:'optional',max:4096,palette:[145,109,75,195,174,134,.93]},
  earth:{asset:'gravelly_sand',height:'optional',max:2048,palette:[145,109,75,137,139,119,.74]},
  asphalt:{asset:'asphalt_02',height:'optional',max:2048,palette:[89,89,83,100,105,106,.96]},
  brick:{asset:'red_bricks_04',height:'optional',max:4096},
  stucco:{asset:'white_plaster_02',height:'optional',max:2048},
  wood:{asset:'wood_plank_wall',height:'optional',max:2048},
  metal:{asset:'rusty_metal_05',height:'optional',max:2048},
  cloth:{asset:'fabric_pattern_07',max:2048,colorVariants:['col_1','col_2','col_03']},
  grass:{asset:'leafy_grass',max:2048},
});
export const DETAIL_SIZE=Object.freeze({off:0,medium:512,standard:1024,high:2048,ultra:4096});
export function choosePbrSize(available,requested,limit=4096){
  if(!requested)return 0;
  return available.filter(size=>size<=requested&&size<=limit).sort((a,b)=>b-a)[0]??0;
}
