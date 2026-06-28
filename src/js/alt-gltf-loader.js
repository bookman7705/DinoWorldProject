import { getModelFilename } from "./asset-urls.js";
import { downloadModelToObjectUrl } from "./alt-model-download.js";
import { createAltDownloadProgress } from "./alt-download-ui.js";

const trackedObjectUrls = new Set();

function trackObjectUrl(objectUrl) {
  trackedObjectUrls.add(objectUrl);
  return objectUrl;
}

window.addEventListener("pagehide", () => {
  for (const objectUrl of trackedObjectUrls) {
    URL.revokeObjectURL(objectUrl);
  }
  trackedObjectUrls.clear();
});

/**
 * Alt pipeline: stream-download then parse via GLTFLoader from a blob URL.
 * Does not use resolve-model-url.js or gltf-loader.js.
 */
export function loadGltfViaAltDownload(loader, modelFilename, { fileIndex = 1, fileCount = 1 } = {}) {
  let filename;

  try {
    filename = getModelFilename(modelFilename);
  } catch (error) {
    return Promise.reject(error);
  }

  const progress = createAltDownloadProgress({ fileIndex, fileCount });

  return downloadModelToObjectUrl(filename, {
    onProgress: (stats) => progress.update(stats)
  })
    .then(({ objectUrl }) => {
      const trackedUrl = trackObjectUrl(objectUrl);

      return new Promise((resolve, reject) => {
        loader.load(
          trackedUrl,
          (gltf) => {
            progress.close();
            resolve({ gltf, objectUrl: trackedUrl });
          },
          undefined,
          (error) => {
            progress.close();
            URL.revokeObjectURL(trackedUrl);
            trackedObjectUrls.delete(trackedUrl);
            reject(error);
          }
        );
      });
    })
    .catch((error) => {
      progress.close();
      console.error(`[alt-download] Load failed for ${filename}`, error);
      throw error;
    });
}
