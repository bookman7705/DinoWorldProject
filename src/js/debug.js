/**
 * Debug helpers for development. Model picker is enabled via ?debug=1 only.
 */

export const DEBUG_MODE_ENABLED = false;

export function isDebugMode(search = window.location.search) {
  if (DEBUG_MODE_ENABLED) {
    return true;
  }

  const value = new URLSearchParams(search).get("debug");
  return value === "1" || value === "true";
}
