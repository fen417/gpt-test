// Procedural team emblems. Team 0 — «АЭГИС» (winged shield), team 1 — «КЛЫК» (fanged hex).
// Every emblem is drawn into a unit box centred at (cx, cy) with edge length `s`.
export const TEAM_NAMES = ['АЭГИС', 'КЛЫК'];

function poly(ctx, cx, cy, s, points) {
  ctx.beginPath();
  points.forEach(([x, y], i) => {
    const px = cx + (x - .5) * s, py = cy + (y - .5) * s;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  });
  ctx.closePath();
}

export function drawTeamEmblem(ctx, cx, cy, s, team, fg, accent, bg) {
  ctx.save();
  ctx.lineJoin = 'round';
  if (team === 0) {
    // Shield outline.
    const shield = [[.5, .04], [.9, .18], [.88, .56], [.8, .76], [.5, .96], [.2, .76], [.12, .56], [.1, .18]];
    poly(ctx, cx, cy, s, shield);
    ctx.fillStyle = fg; ctx.fill();
    poly(ctx, cx, cy, s * .86, shield.map(([x, y]) => [x, y]));
    ctx.fillStyle = bg; ctx.fill();
    // Spread wings.
    poly(ctx, cx, cy, s, [[.5, .2], [.62, .3], [.84, .26], [.76, .44], [.62, .5], [.5, .46], [.38, .5], [.24, .44], [.16, .26], [.38, .3]]);
    ctx.fillStyle = fg; ctx.fill();
    // Double chevron.
    for (const dy of [0, .13]) {
      poly(ctx, cx, cy, s, [[.3, .58 + dy], [.5, .7 + dy], [.7, .58 + dy], [.7, .65 + dy], [.5, .77 + dy], [.3, .65 + dy]]);
      ctx.fillStyle = dy ? accent : fg; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(cx, cy - s * .08, s * .045, 0, Math.PI * 2); ctx.fillStyle = accent; ctx.fill();
  } else {
    // Hexagon frame.
    const hex = [[.5, .03], [.92, .27], [.92, .73], [.5, .97], [.08, .73], [.08, .27]];
    poly(ctx, cx, cy, s, hex);
    ctx.fillStyle = fg; ctx.fill();
    poly(ctx, cx, cy, s * .86, hex);
    ctx.fillStyle = bg; ctx.fill();
    // Angular wolf head with ears.
    poly(ctx, cx, cy, s, [[.2, .2], [.4, .36], [.6, .36], [.8, .2], [.78, .54], [.62, .76], [.5, .84], [.38, .76], [.22, .54]]);
    ctx.fillStyle = fg; ctx.fill();
    // Eyes and fang slits.
    for (const side of [-1, 1]) {
      poly(ctx, cx, cy, s, [[.5 + side * .06, .5], [.5 + side * .2, .46], [.5 + side * .15, .56]]);
      ctx.fillStyle = bg; ctx.fill();
      poly(ctx, cx, cy, s, [[.5 + side * .05, .72], [.5 + side * .1, .62], [.5 + side * .14, .72]]);
      ctx.fillStyle = accent; ctx.fill();
    }
    poly(ctx, cx, cy, s, [[.46, .62], [.54, .62], [.5, .74]]);
    ctx.fillStyle = bg; ctx.fill();
  }
  ctx.restore();
}

// Rectangular banner texture for capture-point flags.
export function drawFlagBanner(canvas, team, teamColorHex) {
  const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  const color = `#${teamColorHex.toString(16).padStart(6, '0')}`;
  ctx.fillStyle = color; ctx.fillRect(0, 0, w, h);
  const shade = ctx.createLinearGradient(0, 0, 0, h);
  shade.addColorStop(0, 'rgba(255,255,255,.14)'); shade.addColorStop(1, 'rgba(0,0,0,.2)');
  ctx.fillStyle = shade; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(8,16,20,.78)';
  ctx.fillRect(0, 0, w, h * .07); ctx.fillRect(0, h * .93, w, h * .07);
  drawTeamEmblem(ctx, w / 2, h / 2, h * .82, team, '#0d1a20', '#f3f4e9', color);
}
