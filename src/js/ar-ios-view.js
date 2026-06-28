import { getModelFromQuery } from "./model-registry.js";
import { resolveModelUrl } from "./resolve-model-url.js";
import { buildMenuBackUrl } from "./menu-navigation.js";
import { isAltDownloadSourceEnabled } from "./alt-download-settings.js";
import { downloadModelToObjectUrl } from "./alt-model-download.js";
import { createAltDownloadProgress } from "./alt-download-ui.js";

const titleEl = document.getElementById("ar-model-name");
const statusEl = document.getElementById("ar-status");
const helpEl = document.getElementById("ar-help");
const backBtn = document.getElementById("back-btn");
const startArBtn = document.getElementById("start-ar-btn");
const copyUrlBtn = document.getElementById("copy-ar-url-btn");
const viewer = document.getElementById("ios-viewer");

backBtn.addEventListener("click", () => {
  window.location.href = buildMenuBackUrl(window.location.search).toString();
});

function isIosQuickLookBrowser() {
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (!isIOS) {
    return false;
  }

  return !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua);
}

async function copyPageUrlToClipboard() {
  const url = window.location.href;

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return;
  }

  const input = document.createElement("textarea");
  input.value = url;
  input.setAttribute("readonly", "");
  input.style.cssText = "position:fixed;left:-9999px;top:0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  document.body.removeChild(input);
}

function showUnsupportedIosArBrowser() {
  statusEl.textContent = "AR is not available in this browser.";
  helpEl.textContent = "Try opening this link in Safari on your iPhone or iPad.";
  helpEl.hidden = false;
  startArBtn.disabled = true;
  startArBtn.style.opacity = "0.6";
  if (copyUrlBtn) {
    copyUrlBtn.hidden = false;
  }
}

copyUrlBtn?.addEventListener("click", async () => {
  const defaultLabel = copyUrlBtn.textContent;

  try {
    await copyPageUrlToClipboard();
    copyUrlBtn.textContent = "Link copied!";
    setTimeout(() => {
      copyUrlBtn.textContent = defaultLabel;
    }, 2000);
  } catch {
    statusEl.textContent = "Could not copy link. Copy the address bar manually.";
  }
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

const iosArBrowserSupported = isIosQuickLookBrowser();
if (!iosArBrowserSupported) {
  showUnsupportedIosArBrowser();
} else {
  statusEl.textContent = "Model loading...";
}

if (selection.entry.animation) {
  viewer.setAttribute("animation-name", selection.entry.animation);
}

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
    if (!iosArBrowserSupported || viewer.canActivateAR === false) {
      showUnsupportedIosArBrowser();
    } else {
      statusEl.textContent = "Ready. Tap View in AR to place on a horizontal surface.";
    }
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

  if (!iosArBrowserSupported || viewer.canActivateAR === false) {
    showUnsupportedIosArBrowser();
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
    showUnsupportedIosArBrowser();
  }
});

startArBtn.addEventListener("click", async () => {
  if (!iosArBrowserSupported || !viewer || typeof viewer.activateAR !== "function") {
    showUnsupportedIosArBrowser();
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
    showUnsupportedIosArBrowser();
  }
});
