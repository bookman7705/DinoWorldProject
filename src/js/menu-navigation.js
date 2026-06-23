/**
 * Build index.html URL when leaving a view. Preserves debug flag only (not model id).
 */
export function buildMenuBackUrl(search = window.location.search) {
  const backUrl = new URL("./index.html", window.location.href);
  const params = new URLSearchParams(search);
  const debug = params.get("debug");

  if (debug === "1" || debug === "true") {
    backUrl.searchParams.set("debug", "1");
  }

  return backUrl;
}
