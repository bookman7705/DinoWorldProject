import { getModelFromQuery } from "./model-registry.js";
import { resolveRemoteModelUrl } from "./asset-urls.js";
import { getDebugLocalModelUrls } from "./debug.js";
import { getModelFilename } from "./gltf-loader.js";

const titleEl = document.getElementById("ar-model-name");
const statusEl = document.getElementById("ar-status");
const backBtn = document.getElementById("back-btn");
const startArBtn = document.getElementById("start-ar-btn");
const viewer = document.getElementById("ios-viewer");

backBtn.addEventListener("click", () => {
  const backUrl = new URL("./index.html", window.location.href);
  const model = getModelFromQuery(window.location.search);
  if (model.entry) {
    backUrl.searchParams.set("id", model.entry.id);
  }
  window.location.href = backUrl.toString();
});

const selection = getModelFromQuery(window.location.search);
if (!selection.entry) {
  statusEl.textContent = "Invalid model ID. Return and scan a valid QR code.";
  throw new Error("Invalid model id");
}
titleEl.textContent = selection.entry.label;

if (selection.entry.animation) {
  viewer.setAttribute("animation-name", selection.entry.animation);
}

statusEl.textContent = "Model loading...";

let iosSrcUrl = null;

async function resolveModelAssetUrl(filename) {
  const candidates = [];

  try {
    candidates.push(await resolveRemoteModelUrl(filename));
  } catch (error) {
    console.warn(`[ios-ar] Signed URL unavailable for ${filename}`, error);
  }

  for (const fallbackUrl of getDebugLocalModelUrls(getModelFilename(filename))) {
    if (!candidates.includes(fallbackUrl)) {
      candidates.push(fallbackUrl);
    }
  }

  if (!candidates.length) {
    throw new Error(`No load candidates for ${filename}`);
  }

  return candidates[0];
}

async function initViewer() {
  try {
    const modelUrl = await resolveModelAssetUrl(selection.entry.modelFile);
    viewer.src = modelUrl;

    if (selection.entry.iosFile) {
      iosSrcUrl = await resolveModelAssetUrl(selection.entry.iosFile);
      viewer.setAttribute("ios-src", iosSrcUrl);
    }
  } catch (error) {
    console.error(error);
    statusEl.textContent = "Model failed to load.";
  }
}

void initViewer();

viewer.addEventListener("load", () => {
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
