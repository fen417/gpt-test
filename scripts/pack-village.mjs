import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { quantize, reorder } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder,
});
const input=resolve(process.argv[2]??'.perf-local/village-bake');
for(const name of ['base','detail']){
  const model=await io.read(resolve(input,name+'.glb'));
  // Keep positions intact. The terrain shares borders between chunks, and
  // thin paint/metal surfaces sit millimetres apart elsewhere in the map.
  await model.transform(
    reorder({encoder:MeshoptEncoder,target:'size'}),
    quantize({pattern:/^COLOR_0$/,quantizeColor:8}),
  );
  model.createExtension(EXTMeshoptCompression).setRequired(true)
    .setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.FILTER});
  await io.write(resolve('src/assets/village',name+'.glb'),model);
}
