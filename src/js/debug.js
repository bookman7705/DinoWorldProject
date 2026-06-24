/**
 * Debug helpers for development. Set DEBUG_MODE_ENABLED to true, or use ?debug=1.
 */

export const DEBUG_MODE_ENABLED = true;

export function isDebugMode(search = window.location.search) {
  if (DEBUG_MODE_ENABLED) {
    return true;
  }

  const value = new URLSearchParams(search).get("debug");
  return value === "1" || value === "true";
}
