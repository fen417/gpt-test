# Ordered implementation record

## Phase 1

- F1-1: discrete 10% resolution steps, one-second down / five-second recovery hysteresis, CPU bottleneck protection, 1024-pixel floor where viewport/DPR permit, both quality levels. Active-work headroom allows recovery on 60 Hz vsync. Manual scale overrides remain explicit.
- F1-2: meshoptimizer attribute-aware topology reduction retains original bone IDs/weights. All four measured classes meet near ≤8000 / middle ≤3000 / far ≤800 triangles. Projected-size thresholds now 8/22 m on low, 12/35 m otherwise. Far actors use instanced simplified figures beyond 80 m outside scopes; scopes retain magnified skinned LOD.
- F1-3: removed all-combination startup warmup; only requested match combinations are built, at most one new template per rendered frame. Offline template loading/team geometry sharing is continued with asset work; runtime construction is still a known stall until that work lands.
- F1-4: removed live backdrop blur, render menu/paused overlays at 30 Hz, freeze solo simulation while paused. Noise/vignette migration belongs to phase 2.
- F1-5: shadow hook installation is idempotent and disposal restores the original renderer method.
- F1-6: release temporary GPU-probe contexts, cap world texture anisotropy at 2× on integrated GPUs.

Measurements: `phase-1-soldiers-before.json` versus `phase-1-soldiers-after.json`, via `scripts/measure-soldiers.mjs`. Near triangles 25,338–26,674 →7,999; middle 11,829–12,261 →2,948–2,964; far 1,046–1,078 →799. Geometry construction with canvas stubs is **slower** (84–255 →179–419 ms per uncached template); these timings are not browser FPS. Startup no longer builds unused combinations, but first-use construction needs the later asset pipeline. No HD 610 FPS gain or silhouette equivalence is asserted without target-device capture.

Validation: 61/61 Node 24 tests; production build passed. Added LOD budget, resolution recovery/CPU protection and shadow-hook idempotence checks. Risks to review in browser: small-detail loss at LOD boundaries, new-template appearance during first-use construction, far figures have reduced animation detail.

## Phase 2

- Added a single full-screen triangle for FXAA, bounded contrast-adaptive sharpening, ACES exposure/tone mapping, output colour conversion, grain and vignette. World and viewmodel share the same half-float target; counters include the post draw. Removed CSS grain/vignette layers.
- Built static 256px ground-shadow masks for all three maps from authoritative colliders and the actual sun direction. Low/medium sample these masks on eligible ground receivers; no per-frame ray work. Medium adds nearby actor shadows; high retains the existing PBR/cached shadow path.
- Prepared seven 512px albedo and normal sets offline. KTX2 has all ten mip levels; WebP is the decode fallback. Basis transcoder is local and worker count is bounded to one. Procedural painting is skipped during normal startup. High uses normal maps; the low/medium path keeps Lambert lighting. High/low material variants are retained to preserve high PBR rather than replacing all high materials with Lambert.
- Added the medium graphics preset; fixed low ↔ medium shadow switching independently of material switching.

Validation: 63/63 tests and production build. Browser loaded the menu and a 31-bot port match without captured errors; saved local screenshot. The hidden browser throttled rendering, so its frame timings are not an FPS comparison. Geometry generation still has first-use spikes; external templates are tracked under phase 5. No claim of ≤1 ms post cost or fixed-point visual equivalence on HD 610 yet.

## Phase 3

- Protocol 26 carries viewed server time/interpolation, owning weapon clock/bloom and trigger state. History is bounded to 24 frames; projectile target poses rewind at most 200 ms against an actually sent snapshot. Current static cover and damage authority remain server-side; revive/team/teleport discontinuities are excluded.
- Immediate personal firearm prediction uses shared cadence, magazine/reload logic and deterministic ID/shot-sequence spread. Predicted sounds/recoil/casings/traces are deduplicated on confirmation. Mounted turret cosmetic prediction is not substituted for authoritative turret heat/fire rules. LAG_COMPENSATION=0 disables rewind; ?predictShots=0 disables personal shot cosmetics for comparison.
- Snapshot ceiling/default 30 Hz, with 20 Hz fallback when five-second mean step exceeds 4 ms and recovery below 3 ms. Steady playback buffer is about 43 ms at 30 Hz. TCP_NODELAY is explicit. Input backlog requests a full resync and drops obsolete commands instead of reconnecting.
- Development ?perf panel includes RTT +50/+100/+150 presets, jitter and a 2-second network pause. Simulator preserves TCP ordering and is excluded from production behavior.

Validation: 72/72 tests, including bounded rewind against a running target, revive discontinuity, exact predicted/authoritative burst cadence and traces, private gun fields, no duplicate cosmetics, ordered simulated delays/jitter and soft recovery. Full-round test now uses the actual 960-second match limit rather than assuming every seeded round must finish before 600 seconds. Build passed.

Benchmark caught an implementation regression from copying complete player objects per bullet/target. Replaced this with direct immutable historical-pose reads before proceeding. New isolated protocol-26 baseline with history enabled is phase-3-server.json: step p99 port 3.386, quarry 4.961, village 4.216 ms; maximum 9.910/20.004/11.134 ms. This is a new scenario versus phase 0, not an optimization win. Phase 4 will compare against this baseline. Human online feel and mounted combat still require multiplayer gameplay acceptance.

## Remaining ordered phases

2. Single post pass, inexpensive static ground shadows, texture/material presets.
3. Authoritative lag compensation, immediate local cosmetic firing, deterministic spread, resilient snapshot timing.
4. Measured navigation/encoding allocation reduction, solo worker and bounded catch-up.
5. External binary assets, bundle/audio budgets, loading and audio-thread cost.
6. Version/dependency/metrics audit and final regression checks.
