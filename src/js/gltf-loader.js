import { resolveRemoteModelUrl } from "./asset-urls.js";
import { getDebugLocalModelUrls } from "./debug.js";

export function getModelFilename(urlOrFilename) {
  if (!urlOrFilename.includes("/") && !urlOrFilename.includes("://")) {
    return urlOrFilename;
  }

  const path = urlOrFilename.includes("://")
    ? new URL(urlOrFilename, window.location.href).pathname
    : urlOrFilename.split("?")[0];
  return path.split("/").pop() || "";
}

async function buildModelLoadCandidates(filename) {
  const candidates = [];

  try {
    candidates.push(await resolveRemoteModelUrl(filename));
  } catch (error) {
    console.warn(`[gltf] Signed URL unavailable for ${filename}`, error);
  }

  for (const fallbackUrl of getDebugLocalModelUrls(filename)) {
    if (!candidates.includes(fallbackUrl)) {
      candidates.push(fallbackUrl);
    }
  }

  return candidates;
}

/**
 * Load a GLB/GLTF from Cloudflare (signed URL), with debug local fallbacks on PC.
 */
export function loadGltfWithDebugFallback(loader, modelFilename, { onLoad, onError } = {}) {
  const filename = getModelFilename(modelFilename);

  void buildModelLoadCandidates(filename)
    .then((candidates) => {
      if (!candidates.length) {
        onError?.(new Error(`No load candidates for ${filename}`), []);
        return;
      }

      let candidateIndex = 0;

      function tryLoad() {
        const url = candidates[candidateIndex];
        loader.load(
          url,
          onLoad,
          undefined,
          (error) => {
            console.warn(`[gltf] Load failed for ${url}`, error);

            candidateIndex += 1;
            if (candidateIndex < candidates.length) {
              console.info(`[debug] Trying fallback: ${candidates[candidateIndex]}`);
              tryLoad();
              return;
            }

            onError?.(error, candidates);
          }
        );
      }

      tryLoad();
    })
    .catch((error) => {
      onError?.(error, []);
    });
}
