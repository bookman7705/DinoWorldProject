import { getModelFromQuery } from "./model-registry.js";
import { resolveModelUrl } from "./resolve-model-url.js";
import { buildMenuBackUrl } from "./menu-navigation.js";
import { isAltDownloadSourceEnabled } from "./alt-download-settings.js";
import { downloadModelToObjectUrl } from "./alt-model-download.js";
import { createAltDownloadProgress } from "./alt-download-ui.js";

const titleEl = document.getElementById("ar-model-name");
const statusEl = document.getElementById("ar-status");
const backBtn = document.getElementById("back-btn");
const startArBtn = document.getElementById("start-ar-btn");
const viewer = document.getElementById("ios-viewer");

backBtn.addEventListener("click", () => {
  window.location.href = buildMenuBackUrl(window.location.search).toString();
});

const selection = getModelFromQuery(window.location.search);
if (!selection.entry) {
  statusEl.textContent = "Invalid model ID. Return and scan a valid QR code.";
  throw new Error("Invalid model id");
}

if (!selection.entry.modelFile) {
  statusEl.textContent = "Model configuration error: missing model file.";
  throw new Error(`Missing modelFile for id "${selection.id}"`);
}

titleEl.textContent = selection.entry.label;

if (selection.entry.animation) {
  viewer.setAttribute("animation-name", selection.entry.animation);
}

statusEl.textContent = "Model loading...";

let iosSrcUrl = null;
const altObjectUrls = new Set();

window.addEventListener("pagehide", () => {
  for (const objectUrl of altObjectUrls) {
    URL.revokeObjectURL(objectUrl);
  }
  altObjectUrls.clear();
});

function trackAltObjectUrl(objectUrl) {
  altObjectUrls.add(objectUrl);
  return objectUrl;
}

function initViewerDefault() {
  try {
    const modelUrl = resolveModelUrl(selection.entry.modelFile);
    viewer.src = modelUrl;

    if (selection.entry.iosFile) {
      iosSrcUrl = resolveModelUrl(selection.entry.iosFile);
      viewer.setAttribute("ios-src", iosSrcUrl);
    }
  } catch (error) {
    console.error(error);
    statusEl.textContent = "Model failed to load.";
  }
}

async function initViewerViaAltDownload() {
  const progress = createAltDownloadProgress({ fileIndex: 1, fileCount: 1 });

  try {
    if (!selection.entry.iosFile) {
      throw new Error("Missing iOS USDZ source for this model.");
    }

    const usdz = await downloadModelToObjectUrl(selection.entry.iosFile, {
      mimeType: "model/vnd.usdz+zip",
      onProgress: (stats) => progress.update(stats)
    });

    iosSrcUrl = trackAltObjectUrl(usdz.objectUrl);
    viewer.setAttribute("ios-src", iosSrcUrl);
    viewer.src = iosSrcUrl;

    progress.close();
    statusEl.textContent = "Ready. Tap View in AR to place on a horizontal surface.";
  } catch (error) {
    console.error(error);
    progress.close();
    statusEl.textContent = error?.message || "Model failed to load.";
  }
}

function initViewer() {
  if (isAltDownloadSourceEnabled()) {
    void initViewerViaAltDownload();
    return;
  }

  initViewerDefault();
}

initViewer();

viewer.addEventListener("load", () => {
  if (isAltDownloadSourceEnabled()) {
    return;
  }

  statusEl.textContent = "Ready. Tap View in AR to place on a horizontal surface.";
});

viewer.addEventListener("error", () => {
  statusEl.textContent = "Model failed to load.";
});

viewer.addEventListener("ar-status", (event) => {
  const state = event?.detail?.status;
  if (state === "session-started") {
    statusEl.textContent = "AR started.";
  } else if (state === "not-presenting") {
    statusEl.textContent = "AR closed.";
  } else if (state === "failed") {
    statusEl.textContent = "AR launch failed on this device/browser.";
  }
});

startArBtn.addEventListener("click", async () => {
  if (!viewer || typeof viewer.activateAR !== "function") {
    statusEl.textContent = "AR is not supported by this iOS browser.";
    return;
  }

  if (!iosSrcUrl) {
    statusEl.textContent = "Missing iOS USDZ source for this model.";
    return;
  }

  try {
    statusEl.textContent = "Starting AR...";
    viewer.setAttribute("ios-src", iosSrcUrl);
    await viewer.activateAR();
  } catch {
    statusEl.textContent = "Unable to launch AR. Check iOS AR support and USDZ file availability.";
  }
});
