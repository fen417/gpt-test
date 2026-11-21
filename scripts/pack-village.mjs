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
  // Use the same world-space grid for every chunk and layer. The maximum
  // error per axis is 0.122 mm, so shared edges and thin surfaces stay distinct.
  const primitives = model.getRoot().listMeshes().flatMap(mesh => mesh.listPrimitives());
  for (const [semantic, grid] of [['POSITION', 4096], ['TEXCOORD_0', 8192]]) {
    const attributes = new Set(primitives.map(primitive => primitive.getAttribute(semantic)));
    for (const attribute of attributes) {
      const values = attribute.getArray();
      for (let i = 0; i < values.length; i++) values[i] = Math.round(values[i] * grid) / grid;
    }
  }
  await model.transform(
    reorder({encoder:MeshoptEncoder,target:'size'}),
    quantize({pattern:/^COLOR_0$/,quantizeColor:8}),
  );
  model.createExtension(EXTMeshoptCompression).setRequired(true)
    .setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.FILTER});
  await io.write(resolve('src/assets/village',name+'.glb'),model);
}
