/**
 * Debug helpers for development.
 * Set DEBUG_MODE_ENABLED to true to enable debug features app-wide.
 */

export const DEBUG_MODE_ENABLED = false;

/** When true, .glb / .usdz files load from LOCAL_MODELS_BASE_PATH instead of Cloudflare R2. */
export const LOCAL_MODEL_OVERRIDE_ENABLED = false;

/** Site-relative folder for local model files when override is enabled. */
export const LOCAL_MODELS_BASE_PATH = "./models";

export function isDebugMode() {
  return DEBUG_MODE_ENABLED;
}

export function isLocalModelOverrideEnabled() {
  return DEBUG_MODE_ENABLED && LOCAL_MODEL_OVERRIDE_ENABLED;
}
