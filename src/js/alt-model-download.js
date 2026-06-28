import { buildAltDownloadUrl } from "./alt-download-url.js";

function mimeTypeForFilename(filename) {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "usdz") {
    return "model/vnd.usdz+zip";
  }
  if (ext === "glb") {
    return "model/gltf-binary";
  }
  return "application/octet-stream";
}

/**
 * Stream-download a model file (download.html pattern) and expose a blob object URL.
 */
export async function downloadModelToObjectUrl(filename, { mimeType, onProgress } = {}) {
  const url = buildAltDownloadUrl(filename);
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  if (!response.body) {
    throw new Error("Download stream unavailable");
  }

  const total = Number(response.headers.get("Content-Length")) || 0;
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    chunks.push(value);
    received += value.length;

    onProgress?.({
      received,
      total,
      percent: total ? Math.round((received / total) * 100) : null
    });
  }

  const blob = new Blob(chunks, {
    type: mimeType ?? mimeTypeForFilename(filename)
  });

  return {
    blob,
    objectUrl: URL.createObjectURL(blob),
    size: blob.size
  };
}
