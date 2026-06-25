/**
 * Debug helpers for development. Set DEBUG_MODE_ENABLED to true, or use ?debug=1.
 */

export const DEBUG_MODE_ENABLED = true;

/** When true, .glb / .usdz files load from LOCAL_MODELS_BASE_PATH instead of Cloudflare R2. */
export const LOCAL_MODEL_OVERRIDE_ENABLED = false;

/** Site-relative folder for local model files when override is enabled. */
export const LOCAL_MODELS_BASE_PATH = "./models";

export function isDebugMode(search = window.location.search) {
  if (DEBUG_MODE_ENABLED) {
    return true;
  }

  const value = new URLSearchParams(search).get("debug");
  return value === "1" || value === "true";
}

export function isLocalModelOverrideEnabled() {
  return LOCAL_MODEL_OVERRIDE_ENABLED;
}
