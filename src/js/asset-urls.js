/**
 * Remote models (.glb / .usdz) are served via the Cloudflare R2 download gateway.
 * Repo assets (mind/, tracker_jpg/, etc.) use relative paths for local testing.
 */

export const MODEL_GATEWAY_ORIGIN = "https://model-gateway.shawnk7705.workers.dev";

/** Must match the worker env DOWNLOAD_KEY (sent as X-API-Key on model requests). */
export const MODEL_GATEWAY_DOWNLOAD_KEY = "";

export const REMOTE_MODEL_PREFIX = "ar-models";

/** Cache API bucket for stable gateway URLs (pairs with worker Cache-Control: immutable). */
export const MODEL_CACHE_NAME = "dino-world-models-v1";

export function remoteModelKey(filename) {
  const name = assertValidModelFilename(filename);
  return `${REMOTE_MODEL_PREFIX}/${name}`;
}

/**
 * Stable, cache-friendly URL for a remote model file.
 */
export function buildRemoteModelUrl(filename) {
  const key = remoteModelKey(filename);
  return `${MODEL_GATEWAY_ORIGIN}/${key}`;
}

/**
 * Relative URL for files committed to this repository.
 */
export function localRepoAssetUrl(relativePath, version) {
  const normalized = relativePath.replace(/^\//, "");
  const url = normalized.startsWith("./") ? normalized : `./${normalized}`;
  return version != null ? `${url}?v=${version}` : url;
}

export function assertValidModelFilename(filename) {
  if (filename == null || typeof filename !== "string") {
    throw new Error("Model filename is required");
  }

  const trimmed = filename.trim();
  if (!trimmed || trimmed === "undefined") {
    throw new Error(`Invalid model filename: ${String(filename)}`);
  }

  if (trimmed.includes("undefined")) {
    throw new Error(`Model filename must not contain "undefined": ${trimmed}`);
  }

  return trimmed;
}
