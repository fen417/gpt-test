export const RELIEF_STEPS=Object.freeze({off:0,basic:1,low:8,high:16,ultra:24});
// UV-space depths measured for each scan family. Thin materials are excluded.
export const RELIEF_DEPTH=Object.freeze({rock:.055,concrete:.027,brick:.032,stucco:.014,wood:.018,asphalt:.012,sand:.016,earth:.012,metal:.009});
export const RELIEF_RANGE=Object.freeze({off:0,basic:22,low:34,high:46,ultra:52});
export function reliefBudget(quality,distance,facing){
  const max=RELIEF_STEPS[quality]??0,range=RELIEF_RANGE[quality]??0;
  if(!max||distance>=range||facing<=.04)return 0;
  if(max===1)return 1;
  const clamp=(v)=>Math.max(0,Math.min(1,v));
  const lod=clamp(1-distance/range),angle=clamp(1-facing);
  return Math.max(4,Math.min(max,Math.round(max*(.30+.70*lod)*(.58+.42*angle))));
}
