import { getModelFilename } from "./asset-urls.js";
import { fetchRemoteModelArrayBuffer } from "./model-download.js";
import { resolveModelUrl } from "./resolve-model-url.js";
import { isLocalModelOverrideEnabled } from "./debug.js";

export { getModelFilename };

/**
 * Load a GLB/GLTF from local ./models override or the Cloudflare download gateway.
 * Remote models are fetched with fetch() then parsed — avoids Three.js FileLoader
 * treating HTTP 206 (Range) responses from the gateway as errors.
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

  if (isLocalModelOverrideEnabled()) {
    loader.load(url, onLoad, undefined, (error) => {
      console.error(`[gltf] Load failed for ${filename}`, error);
      onError?.(error, [url]);
    });
    return;
  }

  void fetchRemoteModelArrayBuffer(url)
    .then((buffer) => {
      loader.parse(buffer, "", onLoad, (error) => {
        console.error(`[gltf] Parse failed for ${filename}`, error);
        onError?.(error, []);
      });
    })
    .catch((error) => {
      console.error(`[gltf] Download failed for ${filename}`, error);
      onError?.(error, [url]);
    });
}
