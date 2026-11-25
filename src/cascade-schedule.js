// Safe scheduling for WebGPU CSM. The shadow transform and its depth image
// must be committed together; no stale-image/new-matrix combinations.
export function cascadePolicy(index,texel){
  if(index===0)return {interval:1,threshold:0,guard:0};
  const threshold=Math.max(.24,texel*(index===1?3:5));
  return {interval:index===1?2:4,threshold,guard:threshold*2.5};
}
export function cascadeDue({index,frame,lastFrame,displacement,texel,invalidated=false,sunChanged=false}){
  if(invalidated||sunChanged||lastFrame===undefined||index===0)return true;
  const {interval,threshold}=cascadePolicy(index,texel);
  return frame-lastFrame>=interval||displacement>threshold;
}
