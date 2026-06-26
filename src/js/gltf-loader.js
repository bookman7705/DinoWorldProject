import { assertValidModelFilename } from "./asset-urls.js";
import { configureModelLoaderAuth } from "./model-download.js";
import { resolveModelUrl } from "./resolve-model-url.js";

export function getModelFilename(urlOrFilename) {
  if (urlOrFilename == null || typeof urlOrFilename !== "string") {
    throw new Error("Model filename is required");
  }

  if (!urlOrFilename.includes("/") && !urlOrFilename.includes("://")) {
    return assertValidModelFilename(urlOrFilename);
  }

  const path = urlOrFilename.includes("://")
    ? new URL(urlOrFilename, window.location.href).pathname
    : urlOrFilename.split("?")[0];
  const basename = path.split("/").pop() || "";
  return assertValidModelFilename(basename);
}

/**
 * Load a GLB/GLTF. URL comes from local ./models override or the Cloudflare download gateway.
 */
export function loadGltf(loader, modelFilename, { onLoad, onError } = {}) {
  let filename;

  try {
    filename = getModelFilename(modelFilename);
    configureModelLoaderAuth(loader);
  } catch (error) {
    onError?.(error, []);
    return;
  }

  let url;

  try {
    url = resolveModelUrl(filename);
  } catch (error) {
    console.error(`[gltf] Could not resolve model URL for ${filename}`, error);
    onError?.(error, []);
    return;
  }

  loader.load(url, onLoad, undefined, (error) => {
    console.error(`[gltf] Load failed for ${filename}`, error);
    onError?.(error, [url]);
  });
}
