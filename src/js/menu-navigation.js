import { getModelFromQuery } from "./model-registry.js";
import { isDebugMode } from "./debug.js";

/**
 * Build index.html URL when leaving a view.
 * Debug mode: preserves debug flag only (not model id).
 * Production: preserves the dinosaur id so the menu stays tied to the QR code.
 */
export function buildMenuBackUrl(search = window.location.search) {
  const backUrl = new URL("./index.html", window.location.href);
  const params = new URLSearchParams(search);

  if (isDebugMode(search)) {
    const debug = params.get("debug");
    if (debug === "1" || debug === "true") {
      backUrl.searchParams.set("debug", "1");
    }
    return backUrl;
  }

  const { entry } = getModelFromQuery(search);
  if (entry) {
    backUrl.searchParams.set("id", entry.id);
  }

  return backUrl;
}
