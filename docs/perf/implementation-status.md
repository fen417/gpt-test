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

## Remaining ordered phases

2. Single post pass, inexpensive static ground shadows, texture/material presets.
3. Authoritative lag compensation, immediate local cosmetic firing, deterministic spread, resilient snapshot timing.
4. Measured navigation/encoding allocation reduction, solo worker and bounded catch-up.
5. External binary assets, bundle/audio budgets, loading and audio-thread cost.
6. Version/dependency/metrics audit and final regression checks.
