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
  // Request no optional extensions: weak GPUs must be able to start at Low.
  const device = await adapter.requestDevice();
  if (!device) throw new Error('Не удалось создать WebGPU device.');
  const { WebGPURenderer } = await import('three/webgpu');
  const renderer = new WebGPURenderer({
    canvas, device, antialias: antialias === 'on', alpha: false,
    stencil: false, powerPreference: 'high-performance',
  });
  renderer.onDeviceLost = info => onDeviceLost?.(info);
  try {
    await renderer.init();
    // WebGPURenderer may otherwise silently fall back to a WebGL backend.
    if (!renderer.backend?.isWebGPUBackend || renderer.backend.device !== device) {
      throw new Error('WebGPU backend не активирован: запуск через WebGL fallback запрещён.');
    }
    const info = adapter.info || {};
    const gpuName = [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(' ') || null;
    return { renderer, device, adapter, gpuName, api: 'webgpu' };
  } catch (error) {
    renderer.dispose();
    device.destroy();
    throw error;
  }
}
