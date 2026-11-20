# SECTOR 09: Graphics API selection (test branch)

This feature is isolated to `test`. It does not alter the gameplay protocol,
server simulation, campaign visibility or the published `main` build.

## Settings

Open **Settings → Image → Graphics API**:

- **Automatic** (default) intentionally chooses legacy WebGL 2.
- **WebGL 2** uses the original `THREE.WebGLRenderer`, GLSL shaders,
  `PostPass`, `CachedShadows` and WebGL timer queries.
- **WebGPU** requests an adapter/device and initializes the official
  `WebGPURenderer` with a mandatory actual WebGPU backend. A WebGL fallback
  inside `WebGPURenderer` is rejected.

Changing the API reloads the page. Graphics quality, FSR, texture/shadow
settings and other preferences are not reset. A failed WebGPU initialization or
device loss reloads once under WebGL 2 and reports the reason. Re-select WebGPU
to retry.

## Shared / dedicated rendering code

Scene objects, imported models, animations, LOD, batching, maps,
simulation and network code remain shared in `GameRenderer`.

WebGL 2 retains the existing native renderer and associated GLSL shaders.

WebGPU uses:

- `webgpu-post-pass.js` and `webgpu-fsr1.js`: HDR target, FXAA,
  EASU 12-tap + RCAS 5-tap, optional MSAA; UI remains browser-native
- `webgpu-sky.js`: TSL procedural atmospheric sky and a cubemap / PMREM
- `webgpu-ground-shadows.js`: TSL baked world-space shadow-map modulation
- `webgpu-smoke.js`: alpha-blended instanced particle billboards
- `tank-webgpu-material.js`: TSL scrollable tracks and desert camouflage
- `webgpu-timer.js`: optional, non-blocking WebGPU timestamps

The WebGPU branch currently uses native dynamic shadow rendering rather than
the WebGL-only patched shadow-map merger. The latter is deliberately left
untouched on WebGL. Cached static/dynamic shadow-map parity and exact image
parity across GPU vendors remain unverified until real GPU comparisons.

## Compare performance

1. Open the `test` build with `?perf`, preferably at the same window size.
2. Use exactly the same map, population (such as 30 bots), graphics quality,
   shadows, FSR quality, resolution, AA and browser settings.
3. Record ~60 seconds with WebGL 2, then export JSON.
4. Switch to WebGPU in Settings (reload) and reproduce the same workload,
   then export JSON separately.
5. Compare avg/p95/p99 frame time, CPU time, optional GPU time, draw calls,
   triangles, visible objects and FSR output dimensions. Prefer frame-time
   percentiles over peak FPS. GPU timing is **unavailable** when timestamp
   queries are not supported.

For meaningful results, verify that the panel says `Backend: WebGPU`.
The mere presence of the `WebGPURenderer` JS class is not evidence.

## Verification boundaries

- `npm test`, `npm run build`, and Chromium smoke scripts are CI checks,
  not proof of hardware performance on Intel, Radeon or NVIDIA devices.
- Browser smoke uses a software-friendly headless environment. The WebGPU
  backend may not be available there and must recover to WebGL.
- Test the actual target GPUs on Low / Medium / High, with and without FSR.
  Verify transparency, sky, terrain, water, vehicle tracks, camera and
  viewmodel independently, rather than assuming a clean compile ensures
  visual parity.
