// The baked scene must match the map used by collision and the editor.
export function villageLayoutKey(map) {
  // Coordinate math may differ in its last bits between the Node bake and
  // the browser. Millimetres are finer than the visual export grid.
  const input = JSON.stringify([map.size,map.terrainPads,map.landforms,map.boxes,map.structures,map.roads,map.ship],
    (_,value)=>typeof value==='number'?Math.round(value*1000):value);
  let hash = 2166136261;
  for(let i=0;i<input.length;i++) hash=Math.imul(hash^input.charCodeAt(i),16777619);
  return (hash>>>0).toString(16);
}
