// Convert a depth difference in the orthographic shadow map to the penumbra
// radius in texels for a directional light with a 1.4-degree apparent radius.
export function directionalPenumbraScale(shadow) {
  const camera=shadow.camera;
  return .024*(camera.far-camera.near)*shadow.mapSize.x/(camera.right-camera.left);
}

export const PCSS_SETTINGS=Object.freeze({
  blockerTaps:8, filterTaps:16, searchRadius:3.5, minRadius:.78, maxRadius:7,
});
