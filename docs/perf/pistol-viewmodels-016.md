# Pistol viewmodels, 0.16

P-19 and M-50 retain the original procedural rig, palm contact, muzzle and reload
anchors. No external models or runtime textures were added. Weapon previews use
the same improved geometry as the first-person rig.

The compact pistol has a bevelled slide, recessed rear plate, extractor, textured
polymer grip and anti-glare grooves. M-50 has a fixed barrel shroud, metallic
chamfers, barrel ports and an articulated hammer. The front sight stays on the
fixed barrel while the rear slide cycles. Both have animated triggers.

Sprint raises the complete held rig in the right hand, with reduced sway. Aim,
reload and recoil blend out that stance. The firing hand stays on its existing
grip; sprint does not introduce a second hand. These are presentation changes;
movement speed and combat rules are unchanged.

The first published stance rotated the shoulder endpoint into the frame and
exposed the closed end of the sleeve. The correction moves the raised pistol
further right and refits the sleeve after the final weapon transform: the wrist
follows the glove, and the shoulder blends to a camera-relative point behind the
near plane. This includes cover retraction and does not add geometry or draws.

## Rendering cost

Measured in the compiled review scene, with loaded FPS hands, idle/sprint and
High quality. Values include the visible hand and sleeve, exclude the world and
postprocessing. The old baseline was taken in the same review harness before
editing the pistol geometry.

| Rig | Before triangles | After triangles | Before draws | After draws |
| --- | ---: | ---: | ---: | ---: |
| P-19 | 17,419 | 15,143 | 17 | 22 |
| M-50 | 18,835 | 16,311 | 19 | 27 |

Small fittings now use a shared one-segment rounded box instead of the rifle's
denser rounded box. Rigid parts still batch by material. Additional finishes and
independent trigger/hammer increase draw calls despite reducing triangle count.
These counters do not establish gameplay FPS or performance on other GPUs.

## Verification and preview

- Node tests: sprint direction and cancellation during aim,
  reload and recoil, plus existing viewmodel depth/cover/material checks.
- Regression check uses the actual sleeve mesh, including the shoulder rim and
  cuff, through five sprint blend values, four gait phases, both pistols and
  FOV 65/85/105. Its cut edge stays outside the image and its cuff stays on the
  glove. This replaces relying on barrel orientation alone to accept the pose.
- Corrected production build: initial JS 514,649 / 700,000 gzip bytes; runtime audio
  2,429,751 / 2,500,000 bytes. Version stays 0.16, protocol stays 26.
- Browser review: both pistols in sprint and ADS, reload framing, firing and Low
  material compatibility. No console errors matching the production preview's
  origin were recorded. This is a controlled visual review, not a full match.
- Removed embedded BOM characters before imports in main/renderer; these
  interfered with Vite's development import rewriting.

Run `npm run preview:pistols` and open
`http://127.0.0.1:4174/test/pistol-review.html`. The isolated production preview
build is generated under ignored `.perf-local/pistol-preview`; it is not part of
the published game entrypoints. The controls select weapon, pose and quality.
