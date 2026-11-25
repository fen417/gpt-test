// Convert a depth difference in the orthographic shadow map to the penumbra
// radius in texels for a directional light with a 1.4-degree apparent radius.
export function directionalPenumbraScale(shadow) {
  const camera=shadow.camera;
  return .024*(camera.far-camera.near)*shadow.mapSize.x/(camera.right-camera.left);
}

export const PCSS_SETTINGS=Object.freeze({
  blockerTaps:8, filterTaps:16, searchRadius:3.5, minRadius:.78, maxRadius:7,
});

// An orthographic cascade's world footprint grows with distance. Fixed biases
// leave coarse cascades prone to self-shadowing and detach near shadows.
// Bias is in normalized shadow depth; normalBias is in world metres.
export function cascadeShadowBias(shadow,pcss=false) {
  const c=shadow.camera,span=Math.max(c.right-c.left,c.top-c.bottom);
  const texel=span/Math.max(1,Math.min(shadow.mapSize.x,shadow.mapSize.y));
  const depth=Math.max(1,c.far-c.near);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  return {
    bias:-clamp(texel*(pcss?.70:.52)/depth,.00008,.0018),
    normalBias:clamp(texel*(pcss?.92:.72),.025,.25),
  };
}
export function applyCascadeShadowBias(shadow,pcss=false){
  Object.assign(shadow,cascadeShadowBias(shadow,pcss));
}
