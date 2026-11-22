// Local pose envelopes measured on both infantry rigs. Forward is -Z.
const standing = {
  head: [.055, 1.60, -.11, .155],
  body: [[.015, .85, .07, .035, 1.28, -.02, .23], [0, .17, 0, 0, .77, .045, .23]],
};
const crouched = {
  head: [-.04, 1.015, -.16, .145],
  body: [[-.035, .50, .25, -.04, .81, .025, .21], [0, .16, -.015, -.025, .46, .18, .23]],
};
const prone = {
  head: [.12, .31, -.56, .145],
  body: [[.045, .22, -.39, 0, .20, .19, .21], [0, .19, .19, 0, .20, .94, .16]],
};
const sliding = {
  head: [-.12, .64, .30, .15],
  body: [[-.02, .18, -.04, -.08, .46, .28, .19], [-.01, .15, -.76, -.10, .17, -.05, .21]],
};

function raySphere(dx, dy, dz, direction, radius) {
  const projection = dx*direction.x + dy*direction.y + dz*direction.z;
  const outside = dx*dx + dy*dy + dz*dz - radius*radius;
  if (outside <= 0) return 0;
  const discriminant = projection*projection - outside;
  if (discriminant < 0 || projection >= 0) return Infinity;
  return -projection - Math.sqrt(discriminant);
}

function rayCapsule(origin, direction, [ax, ay, az, bx, by, bz, radius]) {
  const x = origin.x-ax, y = origin.y-ay, z = origin.z-az;
  const ux = bx-ax, uy = by-ay, uz = bz-az;
  const lengthSq = ux*ux + uy*uy + uz*uz;
  const along = (x*ux + y*uy + z*uz) / lengthSq;
  const speed = (direction.x*ux + direction.y*uy + direction.z*uz) / lengthSq;
  const px = x-ux*along, py = y-uy*along, pz = z-uz*along;
  const vx = direction.x-ux*speed, vy = direction.y-uy*speed, vz = direction.z-uz*speed;
  const a = vx*vx + vy*vy + vz*vz, b = px*vx + py*vy + pz*vz;
  const c = px*px + py*py + pz*pz - radius*radius;
  if (c <= 0 && along >= 0 && along <= 1) return 0;
  const disc = b*b - a*c;
  if (a > 1e-8 && disc >= 0) {
    const entry = (-b - Math.sqrt(disc)) / a, point = along + speed*entry;
    if (entry >= 0 && point >= 0 && point <= 1) return entry;
  }
  return Math.min(raySphere(x,y,z,direction,radius), raySphere(x-ux,y-uy,z-uz,direction,radius));
}

export function rayInfantry(origin, direction, pose, crouch) {
  const low = pose.prone || pose.downed;
  const slide = !low && pose.slideTime > 0;
  const profile = low ? prone : slide ? sliding : crouch ? crouched : standing;
  const yaw = slide ? Math.atan2(-pose.slideVx,-pose.slideVz) : pose.yaw;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const x = origin.x-pose.x, z = origin.z-pose.z;
  const local = {x:x*c-z*s, y:origin.y-pose.y, z:x*s+z*c};
  const line = {x:direction.x*c-direction.z*s, y:direction.y, z:direction.x*s+direction.z*c};
  const [hx,hy,hz,radius] = profile.head;
  const head = raySphere(local.x-hx,local.y-hy,local.z-hz,line,radius);
  const body = Math.min(rayCapsule(local,line,profile.body[0]),rayCapsule(local,line,profile.body[1]));
  return {distance:Math.min(head,body),headshot:head<body};
}
