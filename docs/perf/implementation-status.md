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

## Remaining ordered phases

2. Single post pass, inexpensive static ground shadows, texture/material presets.
3. Authoritative lag compensation, immediate local cosmetic firing, deterministic spread, resilient snapshot timing.
4. Measured navigation/encoding allocation reduction, solo worker and bounded catch-up.
5. External binary assets, bundle/audio budgets, loading and audio-thread cost.
6. Version/dependency/metrics audit and final regression checks.
