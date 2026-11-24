import * as THREE from 'three';

const aoSteps = { off: 0, low: 4, high: 12, gtao: 24 };
const contactSteps = { off: 0, low: 4, medium: 7, high: 12 };
const atmosphereSteps = { off: 0, low: 1, high: 6 };
const bloomSettings = { off: [0, 0], low: [1, .075], medium: [2, .11], high: [3, .155], ultra: [4, .19] };

export class WorldPost {
  constructor(renderer, Target, createStages, webgpu = false) {
    this.renderer = renderer;
    this.Target = Target;
    this.createStages = createStages;
    this.webgpu = webgpu;
    this.state = {
      projection: new THREE.Matrix4(), inverseProjection: new THREE.Matrix4(),
      sunView: new THREE.Vector3(), sunScreen: new THREE.Vector2(), sunColor: new THREE.Color(),
      fogColor: new THREE.Color(), cameraY: 0, upView: new THREE.Vector3(),
      depthSize: new THREE.Vector2(), effectPixel: new THREE.Vector2(),
      steps: new THREE.Vector3(), atmosphereStrength: 0, bloomGain: 0,
    };
    this.passes = 0;
    this.memory = 0;
  }

  configure(effects, width, height, samples) {
    const ao = aoSteps[effects?.ao] ?? 0;
    const contact = contactSteps[effects?.contact] ?? 0;
    const atmosphere = atmosphereSteps[effects?.atmosphere] ?? 0;
    const [levels, gain] = bloomSettings[effects?.bloom ?? 'off'];
    const depth = ao + contact + atmosphere > 0;
    if (!depth && !levels) {
      if (this.world) this.dispose();
      return false;
    }
    const key = depth + '/' + levels;
    if (this.key !== key) {
      this.dispose();
      this.key = key;
      this.world = new this.Target(1, 1, { type: THREE.HalfFloatType, depthBuffer: true,
        depthTexture: depth ? new THREE.DepthTexture(1, 1, THREE.UnsignedIntType) : null });
      if (depth) this.mask = this.colorTarget(true);
      this.bloom = Array.from({ length: levels }, () => this.colorTarget());
      this.stages = this.createStages(this);
    }
    // r181 WebGPU has no sampled MSAA depth resolve. Use FXAA on the
    // composited world in both APIs when sampled world depth is needed.
    const worldSamples = depth ? 0 : samples;
    const world = this.world;
    if (world.samples !== worldSamples) { world.dispose(); world.samples = worldSamples; }
    this.resize(world, width, height);
    this.state.steps.set(ao, contact, atmosphere);
    this.state.depthSize.set(width, height);
    this.state.bloomGain = gain;
    this.passes = 1 + levels + Number(depth);
    this.memory = width * height * (12 + worldSamples * 12);
    if (this.mask) {
      const divisor=ao<=4&&contact<=4&&atmosphere<=1?4:2;
      this.resize(this.mask, Math.ceil(width / divisor), Math.ceil(height / divisor));
      this.state.effectPixel.set(1 / this.mask.width, 1 / this.mask.height);
      this.memory += this.mask.width * this.mask.height * 8;
    }
    for (let i = 0; i < levels; i++) {
      this.resize(this.bloom[i], Math.ceil(width / (4 << i)), Math.ceil(height / (4 << i)));
      this.memory += this.bloom[i].width * this.bloom[i].height * 8;
    }
    return true;
  }

  colorTarget(nearest = false) {
    const filter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
    return new this.Target(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: filter, magFilter: filter });
  }

  resize(target, width, height) {
    if (target.width !== width || target.height !== height) target.setSize(width, height);
  }

  apply(output, camera, scene, sunOffset, sun, campaign) {
    const r = this.renderer, state = this.state;
    if (this.mask) {
      state.projection.copy(camera.projectionMatrix);
      state.inverseProjection.copy(camera.projectionMatrixInverse);
      state.sunView.copy(sunOffset).transformDirection(camera.matrixWorldInverse);
      state.upView.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
      state.cameraY = camera.position.y;
      const dir = state.sunView, p = state.projection.elements;
      state.sunScreen.set(p[0] * dir.x, p[5] * dir.y).multiplyScalar(.5 / Math.max(.05, -dir.z));
      if (this.webgpu) state.sunScreen.y *= -1;
      state.sunScreen.addScalar(.5);
      state.sunColor.copy(sun.color);
      state.fogColor.copy(scene.fog.color);
      state.atmosphereStrength = campaign ? 0 : Math.min(1, sun.intensity / 3);
    }
    try {
      this.stages.render(output);
    } finally {
      r.setRenderTarget(output);
    }
  }

  dispose() {
    this.stages?.dispose();
    this.world?.dispose();
    this.mask?.dispose();
    for (const target of this.bloom ?? []) target.dispose();
    this.world = this.mask = this.bloom = this.stages = this.key = null;
    this.passes = this.memory = 0;
  }
}
