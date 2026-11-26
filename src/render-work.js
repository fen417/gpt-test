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

// Static world branches can be skipped entirely by the native shadow visitor.
// Keep objective/flag subtrees and any non-static caster reachable.
export function staticShadowPrunePlan(root,staticCasters,dynamicRoots){
  const protectedNodes=new Set();
  const protect=node=>{for(let p=node;p;p=p.parent){protectedNodes.add(p);if(p===root)break;}};
  for(const node of dynamicRoots)protect(node);
  root.traverse(node=>{if(node.castShadow&&!staticCasters.has(node))protect(node);});
  const branches=[],casters=[];
  const walk=node=>{
    if(dynamicRoots.has(node))return;
    if(!protectedNodes.has(node)){branches.push(node);return;}
    if(staticCasters.has(node))casters.push(node);
    for(const child of node.children)walk(child);
  };
  walk(root);return {branches,casters};
}
export function withStaticShadowPruned(plan,callback){
  const changed=[];
  for(const node of plan.branches)if(node.visible){node.visible=false;changed.push(node);}
  try{return withoutCasters(plan.casters,callback);}
  finally{for(const node of changed)node.visible=true;}
}
// Several cascade static refreshes in one frame see the same scene graph.
// Reuse the candidate list rather than traversing the whole scene per cascade.
const shadowCandidates=new WeakMap();
export function frameShadowCandidates(owner){
  const previous=shadowCandidates.get(owner);
  if(previous?.frame===owner.frameCount&&previous.scene===owner.scene)return previous.meshes;
  const meshes=[];owner.scene.traverse(node=>{if(node.isMesh&&node.castShadow)meshes.push(node);});
  shadowCandidates.set(owner,{frame:owner.frameCount,scene:owner.scene,meshes});return meshes;
}
