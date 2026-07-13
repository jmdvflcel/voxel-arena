import { GLTFLoader } from "/vendor-examples/loaders/GLTFLoader.js";

export class AssetPipeline {
  constructor() {
    this.loader = new GLTFLoader();
    this.cache = new Map();
    this.manifest = null;
    this.manifestPromise = null;
  }

  async initialize() {
    if (this.manifest) return true;
    if (this.manifestPromise) return this.manifestPromise;
    this.manifestPromise = (async () => {
      try {
        const response = await fetch("/assets/models/manifest.json", { cache: "no-cache" });
        if (!response.ok) return false;
        this.manifest = await response.json();
        return true;
      } catch {
        return false;
      } finally {
        if (!this.manifest) this.manifestPromise = null;
      }
    })();
    return this.manifestPromise;
  }

  load(url) {
    if (!url) return Promise.resolve(null);
    if (this.cache.has(url)) return this.cache.get(url);
    const request = new Promise((resolve) => {
      this.loader.load(
        url,
        (gltf) => resolve(gltf.scene),
        undefined,
        () => { this.cache.delete(url); resolve(null); }
      );
    });
    this.cache.set(url, request);
    return request;
  }

  async addEnvironment(scene, quality) {
    if (!this.manifest && !(await this.initialize())) return null;
    if (quality.pixelRatio < 0.8) return null;
    const model = await this.load(this.manifest.environment);
    if (!model) return null;
    const instance = model.clone(true);
    instance.name = "AuthoredArenaProps";
    instance.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = Boolean(quality.shadows);
      object.receiveShadow = Boolean(quality.shadows);
      object.frustumCulled = true;
    });
    scene.add(instance);
    return instance;
  }

  async weapon(name) {
    if (!this.manifest && !(await this.initialize())) return null;
    const model = await this.load(this.manifest.weapons?.[name]);
    return model?.clone(true) || null;
  }
}
