/**
 * Resolves model filenames to loadable URLs.
 * Uses ./models when LOCAL_MODEL_OVERRIDE_ENABLED (debug.js), otherwise the Cloudflare gateway.
 */

import {
  assertValidModelFilename,
  buildRemoteModelUrl,
  getModelGatewayAccessHint
} from "./asset-urls.js";
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

function logGatewayAccessHint() {
  if (isLocalModelOverrideEnabled()) {
    return;
  }

  const hint = getModelGatewayAccessHint();
  if (hint) {
    console.warn("[models]", hint);
  }
}

/**
 * Resolve a model filename to a stable, cache-friendly URL (.glb or .usdz).
 * Gateway access is origin-restricted by the Cloudflare worker.
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

  logGatewayAccessHint();
  return buildRemoteModelUrl(name);
}
