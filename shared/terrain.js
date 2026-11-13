const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);

export function makeTerrain(size, landforms, cell = 4, pads = []) {
  const half = size / 2, width = size / cell + 1;
  const heights = new Float32Array(width * width);
  let maxHeight = 0;
  for (let iz = 0; iz < width; iz++) for (let ix = 0; ix < width; ix++) {
    const x = ix * cell - half, z = iz * cell - half;
    let height = 0;
    for (const { x: cx, z: cz, rx, rz, height: rise, flat, angle = 0 } of landforms) {
      const dx = x - cx, dz = z - cz, c = Math.cos(angle), s = Math.sin(angle);
      const radius = Math.hypot((dx * c - dz * s) / rx, (dx * s + dz * c) / rz);
      height += rise * (1 - smooth((radius - flat) / (1 - flat)));
    }
    height *= smooth((half - Math.max(Math.abs(x), Math.abs(z))) / 22);
    heights[iz * width + ix] = height;
    maxHeight = Math.max(maxHeight, heights[iz * width + ix]);
  }

  // Level building footprints while retaining the surrounding slopes and gullies.
  for (const pad of pads) {
    const blend = pad.blend ?? 3;
    const minX = Math.max(0, Math.floor((pad.x - pad.w / 2 - blend + half) / cell));
    const maxX = Math.min(width - 1, Math.ceil((pad.x + pad.w / 2 + blend + half) / cell));
    const minZ = Math.max(0, Math.floor((pad.z - pad.d / 2 - blend + half) / cell));
    const maxZ = Math.min(width - 1, Math.ceil((pad.z + pad.d / 2 + blend + half) / cell));
    for (let iz = minZ; iz <= maxZ; iz++) for (let ix = minX; ix <= maxX; ix++) {
      const x = ix * cell - half, z = iz * cell - half;
      const distance = Math.max(0, Math.abs(x - pad.x) - pad.w / 2, Math.abs(z - pad.z) - pad.d / 2);
      const weight = 1 - smooth(distance / blend);
      const index = iz * width + ix;
      heights[index] += (pad.height - heights[index]) * weight;
      maxHeight = Math.max(maxHeight, heights[index]);
    }
  }

  // A neighbour's blending apron must never lift or excavate a foundation.
  // Keep a grid-cell margin so triangle interpolation stays flat at the walls.
  const protectedPads=pads.filter(p=>p.protectedW&&p.protectedD);
  if(protectedPads.length)for(let iz=0;iz<width;iz++)for(let ix=0;ix<width;ix++){
    const x=ix*cell-half,z=iz*cell-half;let selected=null,best=Infinity;
    for(const pad of protectedPads){
      const reach=Math.max(Math.abs(x-pad.x)/(pad.protectedW/2),Math.abs(z-pad.z)/(pad.protectedD/2));
      if(reach<=1&&reach<best){best=reach;selected=pad;}
    }
    if(selected){heights[iz*width+ix]=selected.height;maxHeight=Math.max(maxHeight,selected.height);}
  }

  function heightAt(x, z) {
    const gx = (x + half) / cell, gz = (z + half) / cell;
    if (gx < 0 || gz < 0 || gx >= width - 1 || gz >= width - 1) return 0;
    const ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz;
    const index = iz * width + ix;
    const a = heights[index], b = heights[index + 1];
    const c = heights[index + width], d = heights[index + width + 1];
    // Use the same diagonal as the ground and gravel meshes.
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v
      : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }

  function raycast(origin, direction, maximum) {
    if (Math.min(origin.y, origin.y + direction.y * maximum) > maxHeight) return Infinity;
    const step = cell * .5;
    const difference = t => origin.y + direction.y * t - heightAt(origin.x + direction.x * t, origin.z + direction.z * t);
    if (difference(0) < -.001) return 0;
    for (let t = Math.min(step, maximum); t > 0;) {
      if (difference(t) <= 0) {
        let near = Math.max(0, t - step), far = t;
        for (let i = 0; i < 8; i++) {
          const middle = (near + far) * .5;
          if (difference(middle) <= 0) far = middle; else near = middle;
        }
        return far;
      }
      if (t === maximum) break;
      t = Math.min(t + step, maximum);
    }
    return Infinity;
  }

  return { cell, heightAt, raycast };
}
