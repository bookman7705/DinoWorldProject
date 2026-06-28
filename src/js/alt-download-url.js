import {
  assertValidModelFilename,
  MODEL_GATEWAY_ORIGIN,
  REMOTE_MODEL_PREFIX
} from "./asset-urls.js";

/**
 * Alt download URLs match download.html (no cache-bust query param).
 * Example: https://model-gateway.shawnk7705.workers.dev/ar-models/rex.usdz
 */
export function buildAltDownloadUrl(filename) {
  const name = assertValidModelFilename(filename);
  return `${MODEL_GATEWAY_ORIGIN}/${REMOTE_MODEL_PREFIX}/${name}`;
}
