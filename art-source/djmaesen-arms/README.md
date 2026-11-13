# First-person hands — asset provenance

Mesh and original texture art: **DJMaesen (bumstrum), “Fps arms”**.
https://sketchfab.com/3d-models/fps-arms-9452ce4cddde4110a4fd73e555a8e412

Rig and grip templates: **Cransh (ccransh)**:
- FPS AK-74m animations: https://sketchfab.com/3d-models/fps-ak-74m-animations-94be8385c402474cacd39bc096c6ca14
- FPS pistol animations: https://sketchfab.com/3d-models/fps-pistol-animations-0d7a343dcb6f401197a73c91aee93f6d

All three are **Creative Commons Attribution 4.0**; see LICENSE.txt and the
author/license metadata recorded in licenses.json from Sketchfab's public API.

Downloaded prepared derivative meshes from **cktang88/3d-fps**, pinned commit
`130ac2a5c856401ec36e7d35afcfefe40c5801f4`:
https://github.com/cktang88/3d-fps/tree/130ac2a5c856401ec36e7d35afcfefe40c5801f4

Upstream files: `public/assets/models/fp/m4a1.glb`, `p226.glb`,
`arms_basecolor.webp`, `arms_normal.webp`. Upstream credits identify the arms,
rig, modifications and baked AO under CC BY 4.0. `source-hashes.json` records
the downloaded GLB hashes. No upstream scripts were executed.

`rifle-arms.glb` and `pistol-arms.glb` retain **only FPArms and its skeleton**,
plus the rifle grip pose; upstream weapon meshes and weapon textures have been
removed. Geometry was decompressed/re-exported with Three.js. Shared arm maps,
including the extracted arm ORM image, live in `src/assets/fps-hands/`.

Run `node scripts/build-fps-hands.mjs` to regenerate `src/fps-hands-data.js`.
The builder crops a wrist-length overlap beneath the game's existing sleeves,
fits separate rifle, pistol, magazine and supply-case hand poses in metres, poses fingers
with the source skeleton and bakes connected trigger/release morphs. Source UVs
and skinned normals are preserved. The supporting magazine hand is mirrored
from the same artist's right-hand mesh; winding and normals are corrected.
The support sleeve meets the palm heel rather than the source wrist bone.
Its covered wrist extension is cropped separately, preserving the existing
palm and finger contact vertices. Rifle hands have about 11,400 triangles per
pair; pistol reload hands about 12,200; supply-case hands about 10,900.
All six poses use one shared PBR material. The supply pair uses mirrored
left-hand meshes with corrected winding and normals. Palms face inward against
the lower case sides. Four fingers rise along each side with a shallow bend;
opposing thumbs form horizontal supports beneath the bottom (mirrored L grips).
All three thumb bones are solved together in a horizontal bend plane rather
than directing its last phalanx independently. Joint lengths are preserved and
successive phalanges curl in the same direction. Hand spacing follows each
case's width. The case and hands share the same
use-gesture transform; sleeves follow the wrist contacts with fitted cuffs.
There is no GLB loading, skeleton solving or AnimationMixer in the frame loop.

Game credit: `credits.html`, linked from the game menu.

## Pistol silhouette references (reference only, not redistributed art)

- Manufacturer G19 Gen5 dimensions and side profile:
  https://us.glock.com/en/products/law-enforcement/pistols/g19-gen5
- Manufacturer Desert Eagle product photographs (DE50BC, left/rear views):
  https://www.magnumresearch.com/pistol-revolver-rifle-photos/

Both fictional game grips were rebuilt with a rearward rake, continuous heel,
larger grasp area and matching magazine/cheek contours. Weapon gameplay values
are unchanged.

## Grip reference

The selected rifle stance is **underhand support**, not an overhand C-clamp:
the palm carries the fore-end from below and the thumb follows its side.
The artist's hand is rotated across the fore-end and all four fingers are posed
around its lower/right edges. Firing hands seat high on the back strap; the
trigger finger is a connected, independently animated part of the same mesh.

- USMC, Positions and Slings, forward hand / right hand:
  https://www.trngcmd.marines.mil/Portals/207/Docs/wtbn/MPMS/DIV%2005%20Positions%20and%20Slings.pdf
- US Army FM 3-22.9, nonfiring hand grip:
  https://www.moore.army.mil/infantry/DoctrineSupplement/ATP3-21.8/PDFs/fm3_22x9.pdf
- USMC Pistol Marksmanship, grip and magazine handling:
  https://www.trngcmd.marines.mil/Portals/207/Docs/wtbn/MCRP%203-01B%20-%20Pistol%20Marksmanship.pdf

The game keeps the requested one-handed first-person pistol stance. These are
visual reference sources, not imported meshes, animations or textures.

## Supply-case pose reference

- Shibby2142, Battlefield 3 — Tip 10 (Medic & Ammo Box Placement):
  https://www.youtube.com/watch?v=_wKIYX1Ev2g

The two-handed carrying/deployment silhouette informed the ammo-box and
medical-bag poses. Only the existing licensed hand meshes are used; no
Battlefield art, textures or animation files are redistributed.
