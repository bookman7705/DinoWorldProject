/**
 * PC / local testing helper. Enable via URL (?debug=1) or set DEBUG_MODE_ENABLED to true.
 */

export const DEBUG_MODE_ENABLED = true;

/**
 * Folder on your PC that contains .glb / .usdz files (file:// fallback in debug mode).
 * Update this path to match your machine.
 */
export const DEBUG_LOCAL_MODEL_DIR =
  "C:\\Users\\Afrom\\Documents\\Chat GPT\\Coding\\GitHub\\Dino World Project\\public\\models";

/**
 * Optional local HTTP base when a static dev server is running, e.g.
 * "http://localhost:8080/models/". Override per session with ?debugModelBase=...
 */
export const DEBUG_LOCAL_MODEL_HTTP_BASE = "http://localhost:8080/models/";

export function isDebugMode(search = window.location.search) {
  if (DEBUG_MODE_ENABLED) {
    return true;
  }

  const value = new URLSearchParams(search).get("debug");
  return value === "1" || value === "true";
}

export function isDebugPcClient(search = window.location.search) {
  if (!isDebugMode(search)) {
    return false;
  }

  return !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function pathToFileUrl(dirPath, filename) {
  const normalizedDir = dirPath.replace(/\\/g, "/").replace(/\/$/, "");
  const fullPath = `${normalizedDir}/${filename}`;
  if (/^[a-zA-Z]:/.test(fullPath)) {
    return `file:///${fullPath}`;
  }

  return `file://${fullPath.startsWith("/") ? "" : "/"}${fullPath}`;
}

/**
 * Returns local fallback URLs to try after the hosted path fails (debug mode on PC only).
 */
export function getDebugLocalModelUrls(filename, search = window.location.search) {
  if (!isDebugPcClient(search)) {
    return [];
  }

  const urls = [];
  const params = new URLSearchParams(search);
  const httpBase = (params.get("debugModelBase") || DEBUG_LOCAL_MODEL_HTTP_BASE || "").trim();

  if (httpBase) {
    const base = httpBase.endsWith("/") ? httpBase : `${httpBase}/`;
    urls.push(new URL(filename, base).href);
  }

  if (DEBUG_LOCAL_MODEL_DIR) {
    urls.push(pathToFileUrl(DEBUG_LOCAL_MODEL_DIR, filename));
  }

  return urls;
}
