# Soldier visuals 0.10

The body remains a shared, atlas-painted SkinnedMesh. Existing bones, character
states and two-link IK drive the new anatomical meshes. No external GLB or
third-party artwork is required. All meshes and textures are generated once per
template and reused by clones. The visual changes do not modify the snapshot
codec, network protocol, capsule/sphere hit detection or damage rules.

The previous model stretched the upper torso by 0.14 m without extending the
legs. That deformation is removed. Landmarks now use metre coordinates: hip
0.96, shoulder 1.455, head origin 1.65; thigh/shin lengths 0.435/0.405 and upper
arm/forearm 0.315/0.275. Standing eye height remains close to the simulation's
1.65 m. The unhelmeted head is approximately 0.239 m high. Cloth adds volume
around asymmetric front/back anatomical contours. Bone locations and IK lengths
are changed together. The crouch drop remains aligned with the crouched head
hit region. Upper-body turn amplitude and foot lift are reduced.

Equipment includes conforming front/back plate bags, flat shoulder webbing,
magazine and utility pouches, belt, radio/headset, helmet mounts, goggles, mask,
knee protection and continuous boot uppers. The atlas shares base colour,
tangent-space normal and packed occlusion/roughness/metal channels; vertex
colours retain team/class variations. AO is a light material micro-occlusion,
not a baked scene/contact-occlusion map.

LOD0 is 22,372–25,072 triangles including the held weapon. The upper bound is
about 0.3% above the requested 25,000 budget. LOD1 is 10,488–11,353 triangles;
LOD2 is 872–928. The medium geometry is generated once with joint/weight/atlas
boundaries preserved. All three levels use the same animated skeleton. Default
near switching is around 28 m (17 m at low quality); the pre-existing far
thresholds are 55/70/95 m depending on quality/GPU mode. Hysteresis and the
renderer’s scope-dependent projected distance remain in use. These distances
are initial settings, not a claim of hardware-wide optimal tuning. The renderer
culls complete characters with its existing bounding sphere. A body is one draw
call; contact shadows and markers are separate.

## Inspection

Open `soldier-review.html` beside the game (also built for GitHub Pages). It has
camera views, equipment visibility, all three LODs, locomotion states, weapon
selection and 1/10/20/32-character scene sizes. The scene animates actual game
rigs; it does not duplicate model construction. Mouse drag rotates the view.
The scene's CPU timing is animation time, not GPU frame time or match FPS.

`before.png`, `front.png`, `back.png`, `side.png` and `perspective.png` record the
local review. The old model's fallback material lacks camouflage when no world
surface provider is supplied; the new generator supplies its own fallback.
The comparison therefore shows both the silhouette and fallback-material change.

Validation used Chromium 158, WebGL via ANGLE/SwiftShader, 1200×900. Both teams
and eight primary weapons plus two pistols were constructed. Idle, walking,
sprinting, crouching, jumping, reloading, death and a reset after death produced
finite bone transforms. All LOD weights summed to one. See `integration.json`.
Front/back/side/perspective and equipment-hidden views were inspected. An actual
solo match with 23 bots started without JavaScript errors. Production build and
JavaScript syntax checks passed.

CPU-only animation microbenchmark: 120 iterations per count, first 21 discarded,
1/60 s step. All characters run at full detail with no animation throttling.

| Characters | Mean animation CPU | P95 animation CPU | Scene draw calls |
|---|---:|---:|---:|
| 10 | 0.103 ms | 0.200 ms | 21 |
| 20 | 0.166 ms | 0.300 ms | 41 |
| 32 | 0.267 ms | 0.500 ms | 65 |

Draw counts include a contact shadow per character and one grid. Rendering was
submitted once per count to verify the draw budget; the CPU loop does not measure
GPU completion. SwiftShader is software rendering. These numbers do not establish
stable 60 FPS, hardware performance or full-match frame time. See `cpu-report.json`.
A live match between two separate remote clients was not run; compatibility was
checked by retaining and reading the existing snapshot fields, interpolation and
hit detection. Final artistic fidelity remains bounded by procedural modelling;
these assets are not scanned characters with manually painted AAA textures.
