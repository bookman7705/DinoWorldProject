import { assertValidModelFilename, resolveRemoteModelUrl } from "./asset-urls.js";

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
 * Load a GLB/GLTF from Cloudflare R2 via the signed-URL worker.
 */
export function loadGltf(loader, modelFilename, { onLoad, onError } = {}) {
  let filename;

  try {
    filename = getModelFilename(modelFilename);
  } catch (error) {
    onError?.(error, []);
    return;
  }

  void resolveRemoteModelUrl(filename)
    .then((url) => {
      loader.load(url, onLoad, undefined, (error) => {
        console.error(`[gltf] Load failed for ${filename}`, error);
        onError?.(error, [url]);
      });
    })
    .catch((error) => {
      console.error(`[gltf] Could not resolve signed URL for ${filename}`, error);
      onError?.(error, []);
    });
}
