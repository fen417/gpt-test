# Locomotion correction, 0.10

The old controller used `speed / stride` with a full-cycle stride reaching 5.2 m,
while independently placing both feet on sinusoids in root-local space. It wrote
`planted` every frame, so the apparent contact points were never world-locked.
`startStep` and `moveStep` existed but were unused. AnimationMixer is not involved;
this project uses procedural two-bone IK. Changing cadence alone could not fix it.

## Controller

`src/soldier-locomotion.js` plans alternating contacts using the displayed root
position and the existing exponentially filtered horizontal velocity. It retains
a cycle phase, step timer, per-foot world contact, swing origin, touchdown target,
duration, lift and heading. One cycle corresponds to two steps. Stance contacts
are unchanged until toe-off. A moving foot predicts touchdown from the remaining
swing time; early toe-off handles acceleration and direction changes before the
leg exhausts its reach. Swing-only lateral correction limits crossing. Local
velocity changes the target direction and stance duration for side steps, back
steps and diagonals. Stationary replanting handles turns in place and stopping.
Ground contacts are released in the air and during sliding.

The planner integrates at no more than 1/120 s per substep, using interpolated
positions within each update. It allocates no Vector3, Quaternion or Matrix4 in
its update loop. The existing two-bone solver poses the legs. Its old 0.53 m
horizontal clamp was also moving stance targets; the reach correction now uses
the available anatomical reach, with pelvis lowering. Pelvis recovery is slower
than compression, avoiding repeated upward pops between contacts. Crouch shares
the height reduction between pelvis and torso instead of folding the knees as
deeply. Recoil, aim, reload, throw, hit reactions, death, sliding and weapon grips
continue through the existing upper-body code.

Close and scoped characters retain full animation updates. The existing reduced
rate becomes 30 Hz at medium distances and 20 Hz at the far LOD; contact phase and
bones persist across LOD swaps. The renderer's existing frustum culling remains.

## Speed constraint

Gameplay movement values, network messages and hit volumes are unchanged. Normal
weapon movement is 5.55–6.65 m/s and sprint multiplies it by 1.55, reaching 10.31 m/s.
The requested upper guide of 1.3 m per step and 4 steps/s covers only 5.2 m/s.
They cannot both hold at the game's sprint speed. At high speeds this controller
uses flight time with bounded leg excursion, instead of stretching the legs or
forcing eight ground contacts each second. Diagnostic step length is actual root
travel per planned landing, not the forward/back reach of an individual leg.

Representative steady values (computed by the gait planner):

| Root speed | Planned step length | Steps/s |
|---|---:|---:|
| 1.4 m/s | about 0.72 m | about 1.94 |
| 3.1 m/s | about 0.99 m | about 3.14 |
| 6.3 m/s | about 1.55 m | about 4.07 |
| 9.765 m/s | about 2.22 m | about 4.39 |

Recovery corrections can cause an extra replant during a stop or reversal. Swing
excursion relative to the hip is bounded separately at 0.46 m. Increasing swing
excursion to match the high-speed landing distance would reintroduce the original
problem.

## Diagnostics and validation

`soldier-review.html` has walk/run/sprint, both side steps, backwards, diagonal,
stop, 180-degree turn, reversal, crouch, jump and reload scenarios. Select 30, 60 or
120 Hz, optionally enable the 20 Hz snapshot/interpolation emulation. The camera
follows the actual translating model over a stationary grid. Green markers show
foot targets. Diagnostics can be disabled and are not added to the game HUD.
Changing gait scenarios preserves the running cycle phase.

`node --test test/soldier-locomotion.test.js` passes 16 tests. They cover three frame
rates, stance locking, phase/landing-count consistency, slow walk, normal run,
actual game run/sprint, side/back/diagonal movement, crouch, stop, in-place turn,
reversal, sparse snapshots, jump recovery and sliding. Network emulation at
different display frame rates samples different root paths; its tolerance permits
up to 0.30 cycle phase spread over eight seconds, while allowing at most two
landing-count differences. This is not a claim of bit-identical poses across FPS.

Browser validation exercised the actual skinned rig and IK, not only planner
points: 10 scenarios × 30/60/120 Hz, six seconds each. `ik.json` records the measured
world positions of ankle bones during stance. Maximum horizontal target error
and interframe stance movement were below 1e-12 m on flat ground. Terrain, roofs,
collisions and animation interpolation can introduce other differences; this is
not a universal zero-slip claim. Four-pose renders were inspected for walking,
running, sprinting, side movement and crouching (the PNGs beside this document).

`network.json` records an actual local WebSocket server and two separate Chromium
pages using Multiplayer.connect/sendInput, the existing snapshot codec and the
renderer-equivalent root interpolation. The observer animated its received remote
actor through sprint, strafe and stop. It received 310 snapshots overall and
measured approximately 25 m of remote travel across 365 observer updates with no
JavaScript errors. This validates the dedicated-server transport locally; PeerJS
across the public internet was not exercised.

The full-detail CPU animation microbenchmark (`cpu.json`) measured about 0.13,
0.21 and 0.32 ms for 10/20/32 characters. Counts include two diagnostic markers in
this scene. The browser uses ANGLE/SwiftShader software rendering, so this is no
claim about GPU performance or stable full-match FPS. Production build passes.

## Starting-step correction

A later startup regression exposed a gap in the original steady-gait tests.
The first launch used the still-cold filtered velocity to choose its entire swing
duration (up to 0.65 s). That value persisted even while the displayed root was
already running. At 30 Hz and 6.3 m/s the reproduced first touchdown happened at
0.40 s, after 2.52 m of travel. The initial low lift also made the early movement
hard to read.

An idle-to-moving transition now plans a short acceleration push-off, no longer
than 0.18 s, using observed displayed displacement for the first launch. The usual
velocity filter, cycle rate and steady gait are retained. Resuming during an
idle/turn replant transfers that foot into the moving step immediately, retaining
its current lift. It leaves the opposite foot supporting rather than launching
both together. A reset after respawn/offscreen return clears the transition flag.
The small takeoff-gait object is cached per actor.

The regression suite now has 20 tests, with startup/restart checks at
20/30/60/120 Hz for 6.3 and 9.765 m/s, both direct movement and 20 Hz snapshot
emulation. `startup.json` records planner timing. `startup-bones.json` measures the
actual ankle bones of the skinned model: after one second idle, first rise above
2 cm occurred within 17–50 ms for direct motion and at most 67 ms with snapshot
emulation. First touchdown occurred by 200/233 ms respectively. These delays are
from motion start in the scenarios, not a network-latency guarantee. Syntax and
production build were checked again.
