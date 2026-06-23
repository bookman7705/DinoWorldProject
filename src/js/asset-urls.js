/**
 * Remote models (.glb / .usdz) are served via Cloudflare R2 + signed URLs.
 * Repo assets (mind/, tracker_jpg/, etc.) use relative paths for local testing.
 */

export const MODEL_GATEWAY_ORIGIN = "https://model-gateway.shawnk7705.workers.dev";

export const MODEL_GATEWAY_SIGN_URL = `${MODEL_GATEWAY_ORIGIN}/sign`;

export const REMOTE_MODEL_PREFIX = "ar-models";

export function remoteModelKey(filename) {
  const name = assertValidModelFilename(filename);
  return `${REMOTE_MODEL_PREFIX}/${name}`;
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

/**
 * The worker signs with PUBLIC_BASE_URL. When that env var is missing it returns
 * "undefined/ar-models/foo.glb?...". Rebuild an absolute URL on the worker origin.
 */
export function normalizeSignedAssetUrl(rawUrl, filePath) {
  if (!rawUrl || typeof rawUrl !== "string") {
    throw new Error(`Signed URL missing for ${filePath}`);
  }

  const key = filePath.replace(/^\/+/, "");

  if (/^https?:\/\//i.test(rawUrl) && !rawUrl.includes("undefined")) {
    return rawUrl;
  }

  const queryIndex = rawUrl.indexOf("?");
  const query = queryIndex >= 0 ? rawUrl.slice(queryIndex) : "";
  const normalized = `${MODEL_GATEWAY_ORIGIN}/${key}${query}`;

  if (normalized.includes("undefined")) {
    throw new Error(`Refusing malformed signed URL for ${filePath}`);
  }

  return normalized;
}

export async function fetchSignedAssetUrl(filePath) {
  const key = filePath.replace(/^\/+/, "");

  if (!key || key.includes("undefined")) {
    throw new Error(`Invalid R2 asset path: ${filePath}`);
  }

  const res = await fetch(
    `${MODEL_GATEWAY_SIGN_URL}?file=${encodeURIComponent(key)}`
  );

  if (!res.ok) {
    throw new Error(`Asset sign failed (${res.status}): ${key}`);
  }

  const data = await res.json();
  if (!data?.url) {
    throw new Error(`Asset sign response missing url: ${key}`);
  }

  return normalizeSignedAssetUrl(data.url, key);
}

export async function resolveRemoteModelUrl(filename) {
  return fetchSignedAssetUrl(remoteModelKey(filename));
}
