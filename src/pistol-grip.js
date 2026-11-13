// M-50 grip: one closed, tapered frame, with a palm swell and relieved heel.
// Shared by first/third-person models. Widths are half widths in metres.
export const HEAVY_GRIP_SECTIONS = [
  [-0.242, 0.019, 0.041, 0.032, 0.130],
  [-0.230, 0.021, 0.043, 0.034, 0.128],
  [-0.200, 0.022, 0.043, 0.034, 0.123],
  [-0.150, 0.022, 0.040, 0.033, 0.113],
  [-0.100, 0.020, 0.035, 0.030, 0.103],
  [-0.052, 0.017, 0.032, 0.025, 0.101],
];
export const COMPACT_GRIP_SECTIONS = [
  [-0.240, 0.027, 0.038, 0.029, 0.145],
  [-0.230, 0.029, 0.040, 0.031, 0.143],
  [-0.190, 0.030, 0.038, 0.031, 0.131],
  [-0.145, 0.029, 0.035, 0.030, 0.118],
  [-0.095, 0.027, 0.032, 0.028, 0.105],
  [-0.052, 0.025, 0.031, 0.025, 0.101],
];
// Front (-Z) and back (+Z) straps both rake towards the heel, matching the
// manufacturer side profiles. Old centre lines leaned forwards towards muzzle.
export function pistolGripSectionAt(rows, y) {
  for(let i=1;i<rows.length;i++) if(y<=rows[i][0]) {
    const t=Math.max(0,Math.min(1,(y-rows[i-1][0])/(rows[i][0]-rows[i-1][0])));
    return rows[i].slice(1).map((v,k)=>rows[i-1][k+1]+(v-rows[i-1][k+1])*t);
  }
  return rows.at(-1).slice(1);
}
export function heavyGripSectionAt(y) {
  const [width,,,center]=pistolGripSectionAt(HEAVY_GRIP_SECTIONS,y);
  return [width,center];
}
