import { getModelFilename } from "./asset-urls.js";
import { resolveModelUrl } from "./resolve-model-url.js";

export { getModelFilename };

/**
 * Load a GLB/GLTF via GLTFLoader.load() — local ./models or Cloudflare gateway (HTTP 200 only).
 */
export function loadGltf(loader, modelFilename, { onLoad, onError } = {}) {
  let filename;
  let url;

  try {
    filename = getModelFilename(modelFilename);
    url = resolveModelUrl(filename);
  } catch (error) {
    console.error(`[gltf] Could not resolve model URL for ${modelFilename}`, error);
    onError?.(error, []);
    return;
  }

  loader.load(url, onLoad, undefined, (error) => {
    console.error(`[gltf] Load failed for ${filename}`, error);
    onError?.(error, [url]);
  });
}
