// M-50 grip: one closed, tapered frame, with a palm swell and relieved heel.
// Shared by first/third-person models. Widths are half widths in metres.
export const HEAVY_GRIP_SECTIONS = [
  [-0.219, 0.017, 0.028, 0.027, 0.076],
  [-0.209, 0.019, 0.031, 0.029, 0.077],
  [-0.18, 0.02, 0.032, 0.03, 0.084],
  [-0.13, 0.02, 0.031, 0.031, 0.094],
  [-0.09, 0.018, 0.03, 0.03, 0.102],
  [-0.052, 0.015, 0.03, 0.025, 0.103],
];
export function heavyGripSectionAt(y) {
  const rows = HEAVY_GRIP_SECTIONS;
  for (let i = 1; i < rows.length; i++)
    if (y <= rows[i][0]) {
      const t = Math.max(
        0,
        Math.min(1, (y - rows[i - 1][0]) / (rows[i][0] - rows[i - 1][0])),
      );
      return [
        rows[i - 1][1] + (rows[i][1] - rows[i - 1][1]) * t,
        rows[i - 1][4] + (rows[i][4] - rows[i - 1][4]) * t,
      ];
    }
  return [rows.at(-1)[1], rows.at(-1)[4]];
}
