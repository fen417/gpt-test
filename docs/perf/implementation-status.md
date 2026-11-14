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

## Phase 4

- A* uses integer node IDs, Float64 costs (preserve original tie precision), generation-stamped typed workspaces and a typed heap. Static adjacency is cached lazily with generator yields, preserving the navigation time budget. Cancelled/completed jobs return workspaces to the pool. All 28 saved spawn-to-objective paths on all maps match exactly.
- Distance hot path uses sqrt(dx²+dz²). Spatial queries use numeric bins and generation stamps rather than temporary string keys/Sets. Snapshot schema indices are precomputed; non-owner sanitized rows are shared immutably across recipient encoders.
- Solo authority now owns construction, fixed ticks and combat in a dedicated Worker. Input/snapshots/events reuse the network codec; ArrayBuffers transfer ownership. Pause/visibility stops solo ticks, catch-up is capped at two steps, and respawn/squad changes are asynchronous requests. Local movement/fire cosmetics reuse client prediction. Expanded bot names to 32 unique call signs.
- No flow-field replacement was added: measured p99 is already below the 6 ms target and reference routes are preserved. Retained events/snapshot baselines remain immutable; pooling them without lifetime ownership would corrupt reliable delivery. Scratch arrays/workspaces/pose slots are reused where safe.

Measurement against the same protocol-26/history-enabled scenario: step p99 port 3.386→2.392, quarry 4.961→3.461, village 4.216→3.234 ms; average encode 0.125/0.122/0.111→0.049/0.057/0.050 ms. Village maximum 11.134→4.095 ms; quarry still has a 12.909 ms outlier. See phase-4-server.json. Trace-GC run recorded a maximum 10.51 ms pause across the three-map construction/simulation sequence; the ≤5 ms GC criterion is not claimed achieved.

Validation: exact route equivalence, existing authoritative network checks, real Node worker-thread loopback construction/movement/pause/squad test and production worker bundle. Full suite initially exposed timer reordering in the development jitter simulator; per-direction FIFO dispatch fixed it, then all nine combat/network focused checks passed. Final unified suite is rerun in phase 6.

## Phase 5

- External gzip binaries replace 1.9 MB of base64 hand literals. All source bytes match the eight original poses. Original authoring data and attribution remain in art-source; fetch/decompression is cached and uses native streams with a small lazy fallback.
- Prepared 32 soldier templates offline. Runtime loads only requested class/team/weapon combinations and shares typed geometry buffers across clones. Exact three-LOD attributes, indices, skin weights, inverse bind matrices and animated/death bone transforms match the procedural source. Template installation/instantiation measured 1.0–4.5 ms versus 208–503 ms procedural construction on this PC, excluding network/decompression. Team-specific templates remain separate to preserve their existing geometry; uniform-only team recolouring was not substituted.
- Split Three/meshoptimizer/compression chunks, added a bundle visualizer and enforced 700,000-byte initial-JS gzip / 2,500,000-byte total runtime audio budgets in the build and CI. Current result: 510,114 / 2,440,042 bytes. The separate hands/soldier assets are not counted as JavaScript; these limits do not describe total first-session transfer or startup time.
- Runtime recordings use Opus plus AAC fallback. Original WAV/MP3 sources are preserved outside the runtime tree. Quiet Resolve remains complete (198 seconds), metadata preload, starts after a gesture; AAC 75 kbps stereo was needed to meet the combined audio budget. This is a quality/transfer tradeoff for listening review, not a claim of lossless sound.
- One 0.7-second convolution replaces two 1.8-second convolutions, with independent volume sends and complete reverb disconnection on low. Existing voice limits, deduplication and smooth loop release remain. Automated tests verify reconnect/disconnect and fallback decoding; actual audio-thread CPU and perceived crackle require listening on the target device.

Validation: production build and size budgets passed; binary/rig equivalence tests and all eight audio tests passed. See phase-5-soldiers.json and phase-5-size.json. All runtime asset generation commands are in package.json; regenerated assets are committed so normal npm ci/build does not run authoring tools.

## Phase 6

- Pinned Three to the already-used 0.181.2 patch. CachedShadows installation/uninstallation is covered by a regression test; it deliberately depends on Three's shadow internals. On upgrades, rerun a real WebGL shadow/context-loss check. A forced context loss/restore was not exercised in this environment.
- Metrics are denied by default without a token, including loopback peers which may be reverse proxies. Explicit METRICS_ALLOW_LOCAL=1 permits only direct local requests without forwarding headers; keep it disabled behind proxies. Constant-time bearer validation remains. Added direct/proxy/spoofed-address tests; no client secret is introduced.
- Preserved deterministic firearm spread and documented the one-room/7-human/30-bot server boundary. Synchronized snapshot settings, protocol 26, current controls, Node 24 and deployment/budget documentation.
- Fixed a composed shader hook being overwritten by point-light optimization; kept distinct program cache keys for road/ground shadow variants. Prevented repeated ground-material clones on map revisits. Idle far soldiers no longer walk in place.
- Fixed UI clicks incorrectly restarting the anti-misfire timer, and a stale solo setInput call after moving authority to Worker. Production browser testing caught a Worker bundling failure hidden by the development server: the literal Worker constructor now makes Vite bundle all shared imports. Build checks reject a missing worker chunk.
- Follow-up to the measured village draw-call overrun: static opaque surfaces now batch across paint colours using exact linear vertex colours, retaining geometry groups, materials, transforms and negative-scale winding. Terrain uses larger seamless chunks with locked borders, a 5 mm simplifier error target, and road colour blending in the ground pass instead of a duplicate transparent terrain pass. The count for the entire static village is 1372 meshes / 660104 triangles before this follow-up, versus 217 / 365744 afterward. This counts every mesh without visibility culling and excludes actors/viewmodels/shadow passes; it is not an FPS result. Full composition for each map is in phase-6-world.json.

Validation so far: 81/81 Node 24 tests; production build and asset budgets pass. Real production browser startup caught and resolved issues missed by unit tests. Target HD 610 and a matched moving-route GPU comparison are unavailable, so frame time and universal ≤300 draws / ≤250k triangle acceptance remain open. High shadows count extra draws/triangles; arbitrary camera positions and crowded near spawns can exceed the proposed budgets. No claim that all rendering or GC budgets are met. Mounted-turret cosmetics remain server-confirmed; no flow fields or uniform-only team geometry replacement was added where the measured/code-preservation tradeoff did not justify it.

Final local verification: 81/81 tests passed on Node v24.22.1 (26.58 s). Build: 511847 bytes of initial JS gzip and 2440042 bytes of all runtime audio, both within budget; see phase-6-size.json. Port, quarry and village production startup, quality changes, pause/clear controls and returning to the menu were exercised. Final client console had no captured errors after the identified fixes. Background-browser throttling produced one-second frames, so these UI runs do not constitute FPS measurements. The observed village view still exceeded the proposed draw/triangle limits (about 329 calls / 416k triangles with actors/viewmodel); these targets remain explicitly unfulfilled, rather than being inferred from reduced static counts.

Isolated final authority benchmark (30 bots, 7 active synthetic humans, 60 Hz; 20 Hz encoding for baseline comparability): step p99 port/quarry/village 2.660 / 3.552 / 3.425 ms; max 7.749 / 20.101 / 6.986 ms. The p99 target passes on this PC; the quarry maximum does not. Reports retain that warning. This does not establish the same limits on a 0.5-vCPU hosted instance. Public server health before publishing still advertised protocol 25; client and server must move together to 26.

## Follow-up revision of 0.16

The user's second audit and the disappearing-audio investigation are recorded in [revision-016-results.md](revision-016-results.md). This supersedes phase-2/phase-5 texture and post-AA choices: high now uses MSAA, ground and normals have UASTC assets, far gait advances continuously, and playback catches up after long frame stalls. Version 0.16 and protocol 26 are retained. HD 610 acceptance is still unavailable on the RTX 3070 workstation.

## PT-90 explosion follow-up

The heavy/rocket recording's strong attack began 606.7 ms into the file, despite earlier silence trimming. The preserved original was realigned with 3 ms lead; the new attack is at 3.0 ms. Rocket presentation also added up to 350 ms of distance delay for remote explosions; this extra timer is removed for rocket events. Four audible distances and the synthesis fallback are covered by the audio test. Focused audio suite: 10/10; production build and transfer budgets passed. See pt90-explosion-alignment.json and `npm run assets:explosion`. Game version remains 0.16.
