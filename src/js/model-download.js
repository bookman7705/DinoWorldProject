import {
  MODEL_CACHE_NAME,
  MODEL_GATEWAY_DOWNLOAD_KEY,
  buildRemoteModelUrl,
  assertValidModelFilename
} from "./asset-urls.js";

export function getModelGatewayDownloadKey() {
  return MODEL_GATEWAY_DOWNLOAD_KEY;
}

/**
 * Attach gateway auth to Three.js loaders that use FileLoader (e.g. GLTFLoader).
 */
export function configureModelLoaderAuth(loader) {
  const apiKey = getModelGatewayDownloadKey();
  if (!apiKey) {
    console.warn("[models] MODEL_GATEWAY_DOWNLOAD_KEY is not set — remote downloads will fail.");
    return;
  }

  if (typeof loader.setRequestHeader === "function") {
    loader.setRequestHeader("X-API-Key", apiKey);
  }
}

function buildModelRequest(url) {
  const headers = new Headers();
  const apiKey = getModelGatewayDownloadKey();
  if (apiKey) {
    headers.set("X-API-Key", apiKey);
  }
  return new Request(url, { method: "GET", headers });
}

/**
 * Download a remote model with Cache API + browser HTTP cache (worker sends immutable headers).
 */
export async function fetchRemoteModel(filename, { signal } = {}) {
  const name = assertValidModelFilename(filename);
  const url = buildRemoteModelUrl(name);
  const apiKey = getModelGatewayDownloadKey();

  if (!apiKey) {
    throw new Error("MODEL_GATEWAY_DOWNLOAD_KEY is not configured");
  }

  const cache = await caches.open(MODEL_CACHE_NAME);
  const cached = await cache.match(url);
  if (cached) {
    return cached;
  }

  const response = await fetch(buildModelRequest(url), {
    signal,
    cache: "default"
  });

  if (!response.ok) {
    throw new Error(`Model download failed (${response.status}): ${name}`);
  }

  if (response.status === 200) {
    await cache.put(url, response.clone());
  }

  return response;
}

export async function fetchRemoteModelBlob(filename, options) {
  const response = await fetchRemoteModel(filename, options);
  return response.blob();
}
