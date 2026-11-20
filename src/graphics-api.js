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

export async function createWebGpuRenderer(canvas, { antialias = 'auto', onDeviceLost } = {}) {
  if (!globalThis.isSecureContext || !navigator.gpu) {
    throw new Error('WebGPU требует HTTPS и поддержки браузера.');
  }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('Браузер не предоставил аппаратный WebGPU-адаптер.');
  if(adapter.isFallbackAdapter)throw new Error('WebGPU работает через программный адаптер, а не аппаратный GPU.');
  // Request no optional extensions: weak GPUs must be able to start at Low.
  const timings = new URLSearchParams(globalThis.location?.search ?? '').has('perf');
  const requiredFeatures = timings && adapter.features.has('timestamp-query') ? ['timestamp-query'] : [];
  const device = await adapter.requestDevice({ requiredFeatures });
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
    const info = adapter.info || {};
    const gpuName = [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(' ') || null;
    return { renderer, device, adapter, gpuName, api: 'webgpu' };
  } catch (error) {
    renderer.onDeviceLost = () => {};
    try { renderer.dispose(); } catch (disposeError) { console.warn('WebGPU cleanup:',disposeError); }
    try { device.destroy(); } catch (destroyError) { console.warn('WebGPU device cleanup:',destroyError); }
    throw error;
  }
}
