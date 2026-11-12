# Soldier proportions and M-50 grip, 0.10

The character silhouette has been re-authored in `src/soldier-proportions.js`.
These are garment envelopes, not uniform scale multipliers. The chest and pelvis,
deltoids, forearm taper, quadriceps, calves and trouser cuffs have independent
cross sections. The maximum chest width in clothing is now about 43 cm rather
than 38 cm; upper forearm width is about 12.4 cm rather than 10.2 cm; thigh width
is about 20 cm rather than 17 cm; calf width is about 13 cm rather than 10.8 cm.
Shoulder and hip joint centres move laterally by 11/8 mm to fit the new envelopes.
Limb lengths, total stature, gameplay speed and hit volumes remain unchanged.

Plate bags, belt, shoulder webbing, pouches, knee pads, pockets and radio/hydration
leads follow the revised surface. A standing collar connects neck to shoulders.
LOD0 and LOD2 sample the same profiles; LOD1 remains derived from LOD0. The larger
silhouette therefore persists across distance changes.

The former procedural oval head is replaced with an adapted **Infinite head
scan by Lee Perry-Smith**, from the Three.js r181 examples under CC BY 3.0.
See `art-source/lee-perry-smith/README.md` and the preserved author license.
The bust is cropped, uniformly fitted to the head bone, reduced, and its neck
fitted under the collar. The close head is 2,198 triangles and the far head 50.
The source retains a neutral scanned expression; the normal in-game equipment
includes opaque protective goggles. A lower-face cloth cover distinguishes the
second team. Helmet, goggles, headset and straps were fitted around this head.

Geometry is synchronously decoded once and shared. The two ~147 KB local images
are drawn into the shared base-colour/normal atlas after loading; Vite emits
relative hashed asset URLs for GitHub Pages. The atlas is 1792×512. Attribution
is accessible through the main menu's credits link. Head source and deterministic
conversion script are retained so this is reproducible, not an opaque asset drop.

M-50's frame now has a closed lofted grip with an approximately 40 mm palm-swell
width, down from a 65 mm extruded core. Side panels and hardware add several mm.
The heel and upper neck taper independently, the front/back depth is smaller,
and checkering, screws, backstrap, magazine base and supporting-hand placement
follow this profile. First/third-person models share the authored grip sections.
P-19's grip dimensions and weapon gameplay parameters are unchanged.

## Verification

The PNGs compare identical camera views of the actual model builder. Head and
pistol images are close inspection views. The before/after M-50 views use the same
slide state and camera. As elsewhere, these are local studio renders, not claims
of Battlefield-level scanned clothing or full-match performance.

Both teams and all eight primaries/two pistols were constructed; idle, walking,
sprinting, crouching, jumping, reloading, death and reset states retained finite
bone transforms. Skin weights in every LOD sum to one. See `rig-validation.json`.
Maximum LOD0 is 27,325 triangles including weapon and equipment (about 9% above
the original 25k guide, to accommodate the actual anatomical head). LOD1 is
11,336–12,493; LOD2 is 1,022–1,078. The body remains one atlas/skinned draw.

Measured wrist-to-weapon target errors remain below 1e-12 m for both hands,
representative rifles, SMG, MG, sniper and pistols, at aim pitch -0.6/0/+0.6 radians.
The before/after values are recorded in `grips.json`. This verifies IK reach,
not exhaustive mesh collision testing in every possible combat pose.

All 20 locomotion tests passed. Actual ankle startup checks at 20/30/60/120 Hz
retained the previous short takeoff timings. The production viewer loaded both
hashed head textures with HTTP 200 and no JavaScript errors; see
`production-assets.json`. JavaScript syntax, diff whitespace and Vite production
build passed. Network protocol, health and hit detection code were not changed.
