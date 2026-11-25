// Only imported when the user explicitly selects WebGPU. The automatic mode
// deliberately retains the existing WebGL renderer until benchmarked.
export const GRAPHICS_API_KEY = 'sector09-gfx-api';
export const GRAPHICS_API_CHOICES = ['auto', 'webgl2', 'webgpu'];

export function preferredGraphicsApi(storage = globalThis.localStorage) {
  const value = storage?.getItem(GRAPHICS_API_KEY) ?? 'auto';
  return GRAPHICS_API_CHOICES.includes(value) ? value : 'auto';
}

export function graphicsApiName(api) {
  return api === 'webgpu' ? 'WebGPU' : 'WebGL 2';
}

export async function createWebGpuRenderer(canvas, {
  antialias = 'auto', onDeviceLost,
  timings = new URLSearchParams(globalThis.location?.search ?? '').has('perf'),
} = {}) {
  if (!globalThis.isSecureContext || !navigator.gpu) {
    throw new Error('WebGPU требует HTTPS и поддержки браузера.');
  }
  // Chromium ignores powerPreference on Windows and logs a warning for it.
  // Omit the ignored hint there; other platforms still prefer the fast GPU.
  const isWindows=navigator.userAgentData?.platform==='Windows'||/Windows/i.test(navigator.userAgent??'');
  const adapter = await navigator.gpu.requestAdapter(isWindows?{}:{powerPreference:'high-performance'});
  if (!adapter) throw new Error('Браузер не предоставил аппаратный WebGPU-адаптер.');
  if(adapter.isFallbackAdapter)throw new Error('WebGPU работает через программный адаптер, а не аппаратный GPU.');
  // Some browsers expose SwiftShader as a regular (non-fallback) adapter.
  // Reject known software implementations instead of reporting them as hardware.
  const adapterInfo=adapter.info??{};
  const adapterDescription=[adapterInfo.vendor,adapterInfo.architecture,adapterInfo.device,adapterInfo.description]
    .filter(Boolean).join(' ');
  if(/swiftshader|llvmpipe|softpipe|lavapipe|software rasterizer|microsoft basic render/i.test(adapterDescription)){
    throw new Error('WebGPU обнаружил программный адаптер ('+adapterDescription+'). Выбран аппаратный WebGL 2.');
  }
  // Request timestamps only for diagnostics or a saved adaptive quality target.
  const compression = ['texture-compression-bc','texture-compression-etc2','texture-compression-astc'].filter(feature=>adapter.features.has(feature));
  const requiredFeatures = [...compression,...(timings && adapter.features.has('timestamp-query') ? ['timestamp-query'] : [])];
  let device;
  try { device=await adapter.requestDevice({requiredFeatures}); }
  catch(error){
    if(!compression.length)throw error;
    // An advertised compression format may still fail to initialize on a
    // driver. Keep the previous no-compression device path available.
    device=await adapter.requestDevice({requiredFeatures:requiredFeatures.filter(feature=>!compression.includes(feature))});
  }
  if (!device) throw new Error('Не удалось создать WebGPU device.');
  const { WebGPURenderer } = await import('three/webgpu');
  const renderer = new WebGPURenderer({
    canvas, device, antialias: antialias === 'on', alpha: false,
    stencil: false, powerPreference: 'high-performance',
    trackTimestamp: requiredFeatures.includes('timestamp-query'),
  });
  // Don't treat an intentional device.destroy() during failed initialization as
  // an unexpected hardware loss. The backend invokes this callback dynamically.
  renderer.onDeviceLost = () => {};
  try {
    await renderer.init();
    // WebGPURenderer may otherwise silently fall back to a WebGL backend.
    if (!renderer.backend?.isWebGPUBackend || renderer.backend.device !== device) {
      throw new Error('WebGPU backend не активирован: запуск через WebGL fallback запрещён.');
    }
    renderer.onDeviceLost = info => onDeviceLost?.(info);
    const gpuName = adapterDescription || null;
    return { renderer, device, adapter, gpuName, api: 'webgpu' };
  } catch (error) {
    renderer.onDeviceLost = () => {};
    try { renderer.dispose(); } catch (disposeError) { console.warn('WebGPU cleanup:',disposeError); }
    try { device.destroy(); } catch (destroyError) { console.warn('WebGPU device cleanup:',destroyError); }
    throw error;
  }
}
