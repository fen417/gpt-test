// Integrate sunlight along the view ray using the same depth maps as the world.
// Shadow positions are calculated in view space to avoid large world coordinates.
export function volumeSunGLSL(count) {
  if (!count) return '';
  const cascades = Array.from({length:count}, (_, i) => i);
  return `
#include <packing>
uniform vec3 volumeSplits;
${cascades.map(i => `uniform sampler2D volumeMap${i}; uniform mat4 volumeMatrix${i};`).join('\n')}
float volumeTap(sampler2D map, mat4 fromView, vec3 position) {
  vec3 p=(fromView*vec4(position,1.)).xyz;
  if(any(lessThan(p,vec3(0.)))||any(greaterThan(p,vec3(1.))))return 1.;
  return step(p.z-.0005,textureLod(map,p.xy,0.).r);
}
float volumeSun(vec3 position){
  ${cascades.slice(0,-1).map(i => `if(-position.z<volumeSplits[${i}])return volumeTap(volumeMap${i},volumeMatrix${i},position);`).join('\n')}
  return volumeTap(volumeMap${count-1},volumeMatrix${count-1},position);
}
`;
}

export function volumeSunWGSL(count) {
  const cascades = Array.from({length:count}, (_, i) => i);
  return {
    parameters: count ? ', volumeSplits: vec3f' + cascades.map(i => `, volumeMap${i}: texture_depth_2d, volumeMatrix${i}: mat4x4f`).join('') : '',
    sample: count ? 'worldVolumeSun(direction*distance, volumeSplits' + cascades.map(i => `, volumeMap${i}, volumeMatrix${i}`).join('') + ')' : '1.',
    source: count ? `
fn worldVolumeTap(map: texture_depth_2d, fromView: mat4x4f, position: vec3f) -> f32 {
  let p=(fromView*vec4f(position,1.)).xyz*vec3f(1.,-1.,2.)+vec3f(0.,1.,-1.);
  if(any(p<vec3f(0.))||any(p>vec3f(1.))){return 1.;}
  let size=vec2i(textureDimensions(map));
  let coord=min(vec2i(p.xy*vec2f(size)),size-1);
  return step(p.z-.0005,textureLoad(map,coord,0));
}
fn worldVolumeSun(position: vec3f, volumeSplits: vec3f${cascades.map(i => `, volumeMap${i}: texture_depth_2d, volumeMatrix${i}: mat4x4f`).join('')}) -> f32 {
  ${cascades.slice(0,-1).map(i => `if(-position.z<volumeSplits[${i}]){return worldVolumeTap(volumeMap${i},volumeMatrix${i},position);}`).join('\n')}
  return worldVolumeTap(volumeMap${count-1},volumeMatrix${count-1},position);
}
` : '',
  };
}
