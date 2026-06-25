/**
 * Resolves model filenames to loadable URLs.
 * Uses ./models when LOCAL_MODEL_OVERRIDE_ENABLED (debug.js), otherwise Cloudflare signed URLs.
 */

import { assertValidModelFilename, resolveRemoteModelUrl } from "./asset-urls.js";
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
 * Resolve a model filename to a loadable URL (.glb or .usdz).
 */
export async function resolveModelUrl(filename) {
  const name = assertValidModelFilename(filename);

  if (isLocalModelOverrideEnabled()) {
    if (!loggedOverrideActive) {
      console.info("[local-models] Override active — loading from", LOCAL_MODELS_BASE_PATH);
      loggedOverrideActive = true;
    }
    return localModelUrl(name);
  }

  return resolveRemoteModelUrl(name);
}
