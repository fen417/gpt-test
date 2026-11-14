# Performance measurements

Phase 0 adds measurement infrastructure, not a claim of reaching the hardware targets.
Game version: `shared/releases.js`; wire protocol: `shared/world.js`; package version includes the patch component.

## Browser capture

Open the game with `?perf`, load a map, allow assets/shaders to finish loading, then press **Начать запись**. Run at least 60 seconds of actual gameplay, stop and download JSON. Keep one map, graphics quality and game mode per file; a change of any of these stops the capture. Each sample contains the trailing 300-frame timing window, not a cumulative percentile for the entire recording. The report retains one sample per update (approximately one second), hardware/browser metadata, viewport, heap if exposed, graphics counters, audio diagnostics and network timings. Missing heap/GPU timer support is `null`, never a fictitious zero.

GPU queries are asynchronous and enabled only with `?perf`. They measure world + viewmodel submissions, including shadows, but exclude CSS composition and other canvases (for example the weapon preview). Driver-disjoint results are discarded. CPU time covers the main game frame; simulation/render submission times are separate components. CPU and GPU work overlap: do not add them to infer frame time. These counters also remain available as JSON in the game canvas `data-render-stats` and `data-network-stats` attributes.

Required target-device matrix: port/quarry/village × low/high at 1366×768 on Intel HD 610, plus the same matrix on a development PC. Do not substitute a faster GPU, a stationary view, or a synthetic server result for HD 610 gameplay FPS. Keep camera route, bot count, settings and battle intensity comparable before/after. Target hardware capture remains outstanding until those JSON files exist.

## Server benchmark

```
npm run bench -- --output docs/perf/local.json
npm run bench -- --baseline docs/perf/local.json --output docs/perf/comparison.json
node --cpu-prof --cpu-prof-dir=.perf-local scripts/bench-sim.mjs --output .perf-local/profile-run.json
```

The default scenario runs 2400 fixed 60 Hz ticks on each map, 30 bots and 7 synthetic players with movement, aiming, automatic fire, reloading and respawn. Seed is 417. Every third tick prepares a shared snapshot and encodes it for every player. Immediate simulated ACKs model a healthy connection; they do not model RTT, loss, WebSocket/TLS costs, replay or event egress. Step timings exclude input harness and snapshot work; encoding is reported separately. Construction is separate. CPU milliseconds per simulated second are not host CPU utilization. JIT/GC outliers are intentionally retained. Run comparisons sequentially without competing tests/builds on the same machine.

Targets: step p99 ≤6 ms, max ≤10 ms. `--strict` fails on budget/regression warnings; default and `--ci` report them without pretending the targets have been reached. `--ci` emits GitHub annotations. A compatible baseline triggers warnings for p99 regression >20%. Shared CI runners are noisy, so warnings require investigation; green functional tests are a deployment requirement.

`phase-0-baseline.json` is an i9-11900F Windows/Node 24 measurement, not the audit's Xeon/Node 22 measurement or the production Northflank result. The baseline exceeds the maximum-step goal on quarry/village. No optimization win is claimed at phase 0.

## Phase 0 status

- P0-1: overlay, GPU queries, JSON capture and timing tests implemented; target HD 610 matrix pending.
- P0-2: baseline 42/49 passing → 56/56 after restoring fixtures and adding audio regressions. See `phase-0-tests.md`.
- P0-3: Node 24 tests gate deployment; CI benchmark produces annotations and an artifact, with previous CI results cached for comparison.
- P0-4: repeatable active-input benchmark, baseline JSON and CPU-profile summary.
- P0-5: README and protocol documentation updated to current behavior; historical release documents are explicitly labelled.

## Phase 0 validation

Final local run on Node v24.22.1: **59/59 tests passed**, 17.23 s. The three additional tests cover the performance sample ring buffer, non-blocking/disjoint GPU query behavior, and unsupported timer fallback. Production Vite build passed (3.06 s); the renderer bundle remains approximately 1.06 MB gzip and is still above the later phase-5 target.

`development-port-high.json` contains a 112-sample browser smoke recording: stationary player at the port spawn, 31 bots, high quality, 1101×883 viewport. The GPU extension and download both worked; no browser errors were captured. This is validation of collection/export only, not the six-map/quality route matrix or an FPS improvement claim. The CPU profile was recorded while this browser smoke test overlapped, so its timings must not be compared with the isolated server baseline. It still points to `pathJob` (17.4% self time) as a later investigation target.

Remaining acceptance work before graphics tuning: record three maps × low/high on HD 610 at 1366×768 and a comparable moving route on the development PC. Check the public GitHub Actions run after pushing; local tests do not establish hosted CI success.

## Current implementation and limits

Ordered phase results, measured regressions, tradeoffs and remaining hardware acceptance are in [implementation-status.md](implementation-status.md). Reproduce composition with `node scripts/measure-world.mjs`; it counts the complete static scene, not visible draw calls or FPS. Normal `npm run build` now enforces initial-JS/audio transfer budgets and verifies that solo authority is bundled as a Worker. Bundle reports are CI artifacts.

Three is pinned to 0.181.2 because CachedShadows patches shadow rendering internals. Updating it requires the Node regression suite plus a real browser shadow/context-loss render check. The hardware FPS/visual/audio acceptance matrix remains a separate requirement; successful CI does not establish HD 610 performance or subjective online audio quality.

## Revision of 0.16

See [revision-016-results.md](revision-016-results.md) for the follow-up audit, reproduced playback/audio defects, high-quality rendering changes and the explicit HD 610 limitation. `?perf` now records AA/AF and audio delivery/load/voice-budget counters as well as playback-clock recoveries. Modelled audio time is not a real-device listening test; exported browser smoke data is not a matched route benchmark.
