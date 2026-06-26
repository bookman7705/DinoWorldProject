/**
 * Remote models (.glb / .usdz) are served via the Cloudflare R2 download gateway.
 * Repo assets (mind/, tracker_jpg/, etc.) use relative paths for local testing.
 */

export const MODEL_GATEWAY_ORIGIN = "https://model-gateway.shawnk7705.workers.dev";

/** Must match allowedOrigins in cloudflare/worker.js */
export const MODEL_GATEWAY_ALLOWED_ORIGINS = ["https://bookman7705.github.io"];

export const REMOTE_MODEL_PREFIX = "ar-models";

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
 * Warn when the current page origin cannot access the model gateway worker.
 */
export function getModelGatewayAccessHint() {
  const origin = window.location.origin;
  if (!origin || origin === "null") {
    return (
      "Model gateway requires an http(s) origin. " +
      "Enable LOCAL_MODEL_OVERRIDE_ENABLED in debug.js for local file testing."
    );
  }

  if (MODEL_GATEWAY_ALLOWED_ORIGINS.includes(origin)) {
    return null;
  }

  return (
    `Model downloads are restricted to: ${MODEL_GATEWAY_ALLOWED_ORIGINS.join(", ")}. ` +
    "Enable LOCAL_MODEL_OVERRIDE_ENABLED in debug.js for local testing."
  );
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
