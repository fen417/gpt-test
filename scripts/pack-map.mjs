import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { quantize, reorder } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

export async function packMap(input, output, layers = ['base', 'detail']) {
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder,
  });
  for (const name of layers) {
    const model = await io.read(resolve(input, name + '.glb'));
    // A common world-space grid makes neighbouring chunks agree. At most
    // 0.122 mm of position error keeps close surfaces distinct across LODs.
    const primitives = model.getRoot().listMeshes().flatMap(mesh => mesh.listPrimitives());
    for (const [semantic, grid] of [['POSITION', 4096], ['TEXCOORD_0', 8192]]) {
      const attributes = new Set(primitives.map(primitive => primitive.getAttribute(semantic)));
      for (const attribute of attributes) {
        const values = attribute?.getArray();
        if (!values) continue;
        for (let i = 0; i < values.length; i++) values[i] = Math.round(values[i] * grid) / grid;
      }
    }
    await model.transform(
      reorder({ encoder: MeshoptEncoder, target: 'size' }),
      quantize({ pattern: /^COLOR_0$/, quantizeColor: 8 }),
    );
    model.createExtension(EXTMeshoptCompression).setRequired(true)
      .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
    await io.write(resolve(output, name + '.glb'), model);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2] || !process.argv[3]) throw new Error('Expected input and output directories');
  const layers = process.argv.slice(4);
  await packMap(process.argv[2], process.argv[3], layers.length ? layers : undefined);
}
