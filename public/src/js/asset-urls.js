/**
 * Remote models (.glb / .usdz) are served via Cloudflare R2 + signed URLs.
 * Repo assets (mind/, tracker_jpg/, etc.) use relative paths for local testing.
 */

export const MODEL_GATEWAY_SIGN_URL =
  "https://model-gateway.shawnk7705.workers.dev/sign";

export const REMOTE_MODEL_PREFIX = "ar-models";

export function remoteModelKey(filename) {
  return `${REMOTE_MODEL_PREFIX}/${filename}`;
}

/**
 * Relative URL for files committed to this repository (served from public/).
 */
export function localRepoAssetUrl(relativePath, version) {
  const normalized = relativePath.replace(/^\//, "");
  const url = normalized.startsWith("./") ? normalized : `./${normalized}`;
  return version != null ? `${url}?v=${version}` : url;
}

export async function fetchSignedAssetUrl(filePath) {
  const res = await fetch(
    `${MODEL_GATEWAY_SIGN_URL}?file=${encodeURIComponent(filePath)}`
  );

  if (!res.ok) {
    throw new Error(`Asset sign failed (${res.status}): ${filePath}`);
  }

  const data = await res.json();
  if (!data?.url) {
    throw new Error(`Asset sign response missing url: ${filePath}`);
  }

  return data.url;
}

export async function resolveRemoteModelUrl(filename) {
  return fetchSignedAssetUrl(remoteModelKey(filename));
}
