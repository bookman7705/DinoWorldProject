/**
 * Resolves model filenames to loadable URLs.
 * Uses ./models when LOCAL_MODEL_OVERRIDE_ENABLED (debug.js), otherwise the Cloudflare gateway.
 */

import { assertValidModelFilename, buildRemoteModelUrl } from "./asset-urls.js";
import { fetchRemoteModelBlob } from "./model-download.js";
import {
  isLocalModelOverrideEnabled,
  LOCAL_MODELS_BASE_PATH
} from "./debug.js";

let loggedOverrideActive = false;

export function localModelUrl(filename) {
  const name = assertValidModelFilename(filename);
  const base = LOCAL_MODELS_BASE_PATH.replace(/\/$/, "");
  return `${base}/${name}`;
}

/**
 * Resolve a model filename to a stable load URL (.glb or .usdz).
 * For Three.js loaders, pair with configureModelLoaderAuth() so X-API-Key is sent.
 */
export function resolveModelUrl(filename) {
  const name = assertValidModelFilename(filename);

  if (isLocalModelOverrideEnabled()) {
    if (!loggedOverrideActive) {
      console.info("[local-models] Override active — loading from", LOCAL_MODELS_BASE_PATH);
      loggedOverrideActive = true;
    }
    return localModelUrl(name);
  }

  return buildRemoteModelUrl(name);
}

/**
 * Resolve a model to a blob/object URL for elements that cannot set request headers (e.g. model-viewer).
 * Uses Cache API + HTTP cache for repeat loads.
 */
export async function resolveModelObjectUrl(filename) {
  const name = assertValidModelFilename(filename);

  if (isLocalModelOverrideEnabled()) {
    if (!loggedOverrideActive) {
      console.info("[local-models] Override active — loading from", LOCAL_MODELS_BASE_PATH);
      loggedOverrideActive = true;
    }
    return localModelUrl(name);
  }

  const blob = await fetchRemoteModelBlob(name);
  return URL.createObjectURL(blob);
}
