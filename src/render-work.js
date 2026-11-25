// Static roots are frozen by the renderer. Revisit their materials only after
// an explicit map/material revision. Dynamic branches are still visited each frame.
export class StaticMaterialVisitor{
  constructor(){this.invalidate();}
  invalidate(){this.root=null;this.revision=-1;}
  visit(scene,root,revision,callback){
    if(root&&(this.root!==root||this.revision!==revision)){
      root.traverse(callback);this.root=root;this.revision=revision;
    }
    function walk(object){
      if(object===root||!object.visible)return;
      callback(object);for(const child of object.children)walk(child);
    }
    walk(scene);
  }
}
export function uploadPrefix(attribute,count){
  if(!attribute||count<=0)return;
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0,Math.min(attribute.array.length,count*attribute.itemSize));
  attribute.needsUpdate=true;
}
// The whole billboard quad lies within this sphere regardless of rotation.
export function billboardRadius(scale){return Math.hypot(scale.x,scale.y)*.5+.08;}
export function collectStaticCasters(root){const out=[];root?.traverse(o=>{if(o.castShadow)out.push(o);});return out;}
export function withoutCasters(casters,callback){
  const changed=[];for(const object of casters)if(object.castShadow){object.castShadow=false;changed.push(object);}
  try{return callback();}finally{for(const object of changed)object.castShadow=true;}
}

const uploadHistory=new WeakMap();
// Keep a CPU mirror only for small, often unchanged attributes. If another
// writer touched the attribute (warmup/context changes), upload a fresh prefix.
export function uploadChangedPrefix(attribute,count){
  if(!attribute||count<=0)return;
  const array=attribute.array,end=Math.min(array.length,count*attribute.itemSize);
  let history=uploadHistory.get(attribute);
  if(!history||history.array!==array||history.version!==attribute.version){
    history={array,mirror:new array.constructor(array.length),valid:0,version:attribute.version};
    uploadHistory.set(attribute,history);
  }
  let first=end,last=-1;
  for(let n=0;n<end;n++){
    if(n>=history.valid||history.mirror[n]!==array[n]){
      history.mirror[n]=array[n];if(n<first)first=n;last=n;
    }
  }
  history.valid=Math.max(history.valid,end);
  if(last<0)return;
  // Do not discard queued ranges if the renderer has not consumed them yet.
  attribute.addUpdateRange(first,last-first+1);
  attribute.needsUpdate=true;history.version=attribute.version;
}
