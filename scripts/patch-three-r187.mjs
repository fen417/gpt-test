import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const marker='S09_R187_PROGRAM_UNIFORMS';
export function patchWebGLRenderer(source){
  if(source.includes(marker))return source;
  function replaceOnce(a,b){
    const i=source.indexOf(a);
    if(i<0||source.indexOf(a,i+a.length)>=0)throw Error('Unexpected Three r187 WebGLRenderer layout: '+a.slice(0,100));
    source=source.slice(0,i)+b+source.slice(i+a.length);
  }
  replaceOnce('materialProperties.programVariants = new Map();',
    'materialProperties.programVariants = new Map();\n\t\t\t\tmaterialProperties.programUniforms = new Map(); // '+marker);
  replaceOnce('if ( program !== undefined ) {\n\n\t\t\t\t// early out if program and light state is identical',
    'if ( program !== undefined ) {\n\n'+
    '\t\t\t\tconst record = materialProperties.programUniforms.get( program );\n'+
    '\t\t\t\tconst uniformsChanged = !record || record.version !== material.version;\n'+
    '\t\t\t\tif ( uniformsChanged ) {\n'+
    '\t\t\t\t\tparameters.uniforms = programCache.getUniforms( material );\n'+
    '\t\t\t\t\tif ( _nodesHandler !== null && material.isNodeMaterial ) _nodesHandler.build( material, object, parameters );\n'+
    '\t\t\t\t\tmaterial.onBeforeCompile( parameters, _this );\n'+
    '\t\t\t\t\tmaterialProperties.programUniforms.set( program, { uniforms: parameters.uniforms, version: material.version } );\n'+
    '\t\t\t\t}\n'+
    '\t\t\t\tmaterialProperties.uniforms = materialProperties.programUniforms.get( program ).uniforms;\n'+
    '\t\t\t\tmaterialProperties.uniformsList = null;\n\n'+
    '\t\t\t\t// early out if program and light state is identical');
  replaceOnce('if ( materialProperties.currentProgram === program && materialProperties.lightsStateVersion === lightsStateVersion ) {',
    'if ( !uniformsChanged && materialProperties.currentProgram === program && materialProperties.lightsStateVersion === lightsStateVersion ) {');
  replaceOnce('materialProperties.uniforms = parameters.uniforms;',
    'materialProperties.uniforms = parameters.uniforms;\n'+
    '\t\t\t\tmaterialProperties.programUniforms.set( program, { uniforms: parameters.uniforms, version: material.version } );');
  // A cached output/tone-mapping variant also needs the uniforms belonging
  // to that program. Re-enter getProgram (cached O(1) lookup, no recompile)
  // if the material was edited since its variant was created.
  replaceOnce('if ( program === undefined ) {\n\n\t\t\t\tprogram = getProgram( material, scene, object );',
    'if ( program === undefined || materialProperties.programUniforms.get( program )?.version !== material.version ) {\n\n\t\t\t\tprogram = getProgram( material, scene, object );');
  replaceOnce('materialProperties.currentProgram = program;\n\t\t\t\tmaterialProperties.uniformsList = null;',
    'materialProperties.currentProgram = program;\n\t\t\t\tmaterialProperties.uniforms = materialProperties.programUniforms.get( program ).uniforms;\n\t\t\t\tmaterialProperties.uniformsList = null;');
  replaceOnce('let refreshMaterial = false;',
    'let refreshMaterial = needsProgramChange || needsProgramVariant;');
  return source;
}
export function patchInstalledThree(){
  const directory=new URL('../node_modules/three/',import.meta.url);
  const pkg=JSON.parse(readFileSync(new URL('package.json',directory),'utf8'));
  if(pkg.version!=='0.187.0')throw Error('Review the r187 uniform-cache compatibility fix before upgrading Three.js: '+pkg.version);
  // npm's browser ESM export and direct source imports both need the fix.
  for(const path of ['build/three.module.js','src/renderers/WebGLRenderer.js']){
    const url=new URL(path,directory),old=readFileSync(url,'utf8'),patched=patchWebGLRenderer(old);
    if(patched!==old)writeFileSync(url,patched);
  }
  console.log('Three r187 per-program uniform cache verified');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])patchInstalledThree();
