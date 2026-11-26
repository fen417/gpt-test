const transcoders=new WeakMap();
const disposedRenderers=new WeakSet();

export function withTextureTranscoder(renderer,load){
  if(disposedRenderers.has(renderer))return Promise.reject(new Error('Texture transcoder is disposed'));
  let shared=transcoders.get(renderer);
  if(!shared){
    const loader=import('./webgpu-ktx2.js').then(module=>module.createTextureTranscoder(renderer));
    shared={loader,pending:new Set()};
    transcoders.set(renderer,shared);
  }
  const job=shared.loader.then(load);
  shared.pending.add(job);
  const done=()=>shared.pending.delete(job);
  job.then(done,done);
  return job;
}

export const loadCompressedTexture=(renderer,url)=>withTextureTranscoder(renderer,loader=>loader.loadAsync(url));

export function disposeTextureTranscoder(renderer){
  disposedRenderers.add(renderer);
  const shared=transcoders.get(renderer);
  if(!shared)return;
  transcoders.delete(renderer);
  // GLTF jobs may still be fetching their JSON and have yet to request KTX2.
  Promise.allSettled(shared.pending).then(()=>shared.loader.then(loader=>{
    if(loader.transcoderPending)loader.dispose();
  },()=>{}));
}
