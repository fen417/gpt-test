// Authoring-only paint kernel; runtime loads prepared KTX2/WebP.
export function drawVillageSurface(ctx,size,stucco){
  ctx.save();ctx.scale(size/256,size/256);
  let seed = stucco ? 6391 : 1703;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
  ctx.fillStyle = stucco ? '#eee9de' : '#cbb890';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8500; i++) {
    ctx.fillStyle = i % 2 ? '#6d55351b' : '#fff4ce25';
    ctx.fillRect(random() * 256, random() * 256, 1 + random() * 3, 1 + random() * 2);
  }
  if (stucco) {
    ctx.strokeStyle = '#67503d52';
    ctx.lineWidth = .7;
    for (let i = 0; i < 8; i++) {
      let x = random() * 256, y = random() * 220;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let n = 0; n < 6; n++) {
        x += random() * 12 - 6;
        y += random() * 7;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = '#9e85603b';
    for (let i = 0; i < 16; i++) {
      ctx.beginPath();
      ctx.ellipse(random() * 256, random() * 256, 3 + random() * 12, 2 + random() * 5, random(), 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.strokeStyle = '#9d815521';
    ctx.lineWidth = 2;
    for (let y = -8; y < 270; y += 15) {
      ctx.beginPath();
      for (let x = 0; x <= 256; x += 8) ctx.lineTo(x, y + Math.sin(x * .024 + y * .04) * 6);
      ctx.stroke();
    }
  }
  ctx.restore();
}
