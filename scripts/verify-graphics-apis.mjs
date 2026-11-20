import { chromium } from 'playwright';
import assert from 'node:assert/strict';

// This is a portability smoke test, not a hardware benchmark. SwiftShader can
// expose WebGPU but still lose the software device under CI memory pressure.
const browser = await chromium.launch({ headless: true, args: [
  '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--enable-unsafe-webgpu',
] });

const navigationError = error => /Execution context was destroyed|navigation|Target closed/i.test(String(error));
async function readState(page) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.waitForFunction(() => Boolean(window.__S09_POOL_REVIEW?.renderer?.renderer ||
      document.getElementById('solo-status')?.classList.contains('error')), null, { timeout: 60000 });
    try {
      return await page.evaluate(() => {
        const obj = window.__S09_POOL_REVIEW?.renderer;
        return {
          requested: localStorage.getItem('sector09-gfx-api'),
          api: obj?.api ?? null,
          backend: obj?.renderer?.backend?.constructor?.name ?? null,
          status: document.getElementById('solo-status').textContent,
          activeText: document.getElementById('gfx-api-active').textContent,
          recovery: sessionStorage.getItem('sector09-webgpu-failed'),
        };
      });
    } catch (error) {
      if (!navigationError(error)) throw error;
      await page.waitForLoadState('domcontentloaded');
    }
  }
  throw new Error('Graphics API did not stabilize after navigation');
}

async function playPool(page) {
  await page.locator('#open-solo').waitFor({ state: 'visible', timeout: 60000 });
  await page.locator('#open-solo').dispatchEvent('click');
  await page.locator('#map-select').selectOption('fy_pool_day');
  await page.locator('#population').selectOption('15');
  await page.locator('#solo').dispatchEvent('click');
  await page.waitForFunction(() => !document.getElementById('hud').classList.contains('hidden'),
    null, { timeout: 45000 });
  await page.waitForFunction(() => {
    const stats = window.__S09_POOL_REVIEW?.renderer?.getStats?.();
    return Number.isFinite(stats?.calls) && stats.calls > 0 &&
      Number.isFinite(stats?.triangles) && stats.triangles > 0 &&
      stats.fsr === 'quality' && stats.fsrScale < 1 && stats.sceneWidth > 0;
  }, null, { timeout: 30000 });
  return page.evaluate(() => window.__S09_POOL_REVIEW.renderer.getStats());
}

try {
  for (const api of ['auto', 'webgl2', 'webgpu']) {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } });
    await ctx.addInitScript(selected => {
      localStorage.setItem('sector09-gfx-api', selected);
      localStorage.setItem('sector09-quality', selected === 'webgpu' ? 'low' : 'high');
      localStorage.setItem('sector09-gfx-aa', selected === 'webgpu' ? 'off' : 'auto');
      localStorage.setItem('sector09-gfx-fsr', 'on');
      localStorage.setItem('sector09-gfx-fsr-quality', 'quality');
    }, api);
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') console.log('BROWSER', api, message.text().slice(0, 600));
    });
    try {
      await page.goto('http://127.0.0.1:5173/?poolScreenshot&perf',
        { waitUntil: 'domcontentloaded', timeout: 60000 });
      let state = await readState(page);
      console.log('API STARTUP', JSON.stringify(state));
      assert.equal(state.requested, api, 'Graphics API preference was changed');
      assert.ok(state.api, 'Game failed to create any renderer');
      if (api !== 'webgpu') assert.equal(state.api, 'webgl2');
      if (api === 'webgpu') {
        if (state.api === 'webgpu') assert.equal(state.backend, 'WebGPUBackend');
        else assert.ok(state.recovery, 'WebGPU failed without explaining its fallback');
      }

      let stats;
      try {
        stats = await playPool(page);
      } catch (error) {
        // An unstable software device may be lost *after* WebGPU initialization.
        // The game must recover exactly once to a usable WebGL 2 session.
        if (api !== 'webgpu') throw error;
        console.log('WEBGPU RUNTIME', String(error).slice(0, 500));
        state = await readState(page);
        if (!state.recovery || state.api !== 'webgl2') throw error;
        console.log('WEBGPU RECOVERED', JSON.stringify(state));
        stats = await playPool(page);
      }
      console.log('RENDERED', api, JSON.stringify({
        api: stats.api, backend: stats.backend, calls: stats.calls,
        triangles: stats.triangles, fsr: stats.fsr,
        sceneWidth: stats.sceneWidth, sceneHeight: stats.sceneHeight,
      }));
      assert.ok(Number.isFinite(stats.calls) && stats.calls > 0, 'No GPU draw calls');
      assert.ok(Number.isFinite(stats.triangles) && stats.triangles > 0, 'No GPU triangles');
      assert.equal(stats.fsr, 'quality');
      assert.ok(stats.fsrScale < 1 && stats.sceneWidth > 0 && stats.sceneHeight > 0);
      if (api === 'webgpu') {
        if (stats.api === 'webgpu') assert.equal(stats.backend, 'WebGPU', 'Renderer used WebGL fallback');
        else assert.ok((await readState(page)).recovery, 'Unexpected WebGPU -> WebGL switch');
      } else assert.equal(stats.api, 'webgl2');
      // Non-GPU page errors must never be accepted as a successful fallback.
      if (pageErrors.length && !(api === 'webgpu' && (await readState(page)).recovery)) {
        assert.fail(pageErrors.join(' | '));
      }
    } finally {
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
