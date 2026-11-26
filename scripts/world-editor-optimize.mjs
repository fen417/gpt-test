
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS,EXTMeshoptCompression} from '@gltf-transform/extensions';
import {reorder} from '@gltf-transform/functions';
import {MeshoptDecoder,MeshoptEncoder} from 'meshoptimizer';

// Reorder/compress only. Keep node order, materials, animation, mesh shapes,
// texture bytes and original authoring file intact.
export async function optimizeEditorAsset(buffer){
 await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder
 });
 const doc=await io.readBinary(new Uint8Array(buffer));
 await doc.transform(reorder({encoder:MeshoptEncoder,target:'size'}));
 const ext=doc.getRoot().listExtensionsUsed().find(e=>e.extensionName==='EXT_meshopt_compression')??doc.createExtension(EXTMeshoptCompression);
 ext.setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.FILTER});
 return Buffer.from(await io.writeBinary(doc));
}
