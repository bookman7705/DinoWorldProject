import { getModelFromQuery, getAvailableModels } from "./model-registry.js";
import { isDebugMode } from "./debug.js";
import { promptModelSelection } from "./model-picker.js";

const modelInfoEl = document.getElementById("model-info");
const statusMessageEl = document.getElementById("status-message");
const viewArBtn = document.getElementById("view-ar-btn");
const imageScanBtn = document.getElementById("image-scan-btn");
const view3dBtn = document.getElementById("view-3d-btn");

const selected = getModelFromQuery(window.location.search);
const debugMode = isDebugMode(window.location.search);
const isAndroid = /android/i.test(navigator.userAgent);
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

function launchImageScan({ replace = false } = {}) {
  const url = new URL("./image-scan.html", window.location.href);
  if (isDebugMode(window.location.search)) {
    url.searchParams.set("debug", "1");
  } else if (selected.hasValidId) {
    url.searchParams.set("id", selected.entry.id);
  }
  if (replace) {
    window.location.replace(url.toString());
  } else {
    window.location.href = url.toString();
  }
}

function stripModelIdFromDebugUrl() {
  if (!isDebugMode(window.location.search)) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (!params.has("id")) {
    return;
  }

  params.delete("id");
  const cleanUrl = new URL(window.location.href);
  cleanUrl.search = params.toString();
  window.history.replaceState(null, "", cleanUrl.toString());
}

async function resolveModelEntry() {
  return promptModelSelection(getAvailableModels(), { showIds: true });
}

function setViewModeButtonsEnabled(enabled) {
  for (const btn of [viewArBtn, view3dBtn]) {
    btn.disabled = !enabled;
    btn.style.opacity = enabled ? "" : "0.6";
  }
}

if (selected.id === "scan") {
  launchImageScan({ replace: true });
} else {
  if (debugMode) {
    const debugBadge = document.createElement("p");
    debugBadge.className = "debug-badge";
    debugBadge.textContent = "Debug mode — choose a dinosaur each time you launch a view";
    modelInfoEl.before(debugBadge);

    if (selected.hasValidId) {
      modelInfoEl.textContent = `QR link: ${selected.entry.label}. Choose a view mode, then pick a dinosaur.`;
    } else {
      modelInfoEl.textContent = "Choose a view mode, then pick a dinosaur from the list.";
    }

    setViewModeButtonsEnabled(true);
    stripModelIdFromDebugUrl();
    window.addEventListener("pageshow", stripModelIdFromDebugUrl);
  } else if (!selected.hasValidId) {
    modelInfoEl.textContent =
      "No dinosaur selected yet. Scan a QR code like ?id=MOSA to get started.";
    setViewModeButtonsEnabled(false);
  } else {
    modelInfoEl.textContent = `Selected: ${selected.entry.label}. ${selected.entry.description}`;
    setViewModeButtonsEnabled(true);
  }

  function launchView3d(entry) {
    const url = new URL("./view-3d.html", window.location.href);
    url.searchParams.set("id", entry.id);
    if (isDebugMode(window.location.search)) {
      url.searchParams.set("debug", "1");
    }
    window.location.href = url.toString();
  }

  function launchAr(entry) {
    if (!isAndroid) {
      if (isIOS) {
        const iosUrl = new URL("./ar-ios.html", window.location.href);
        iosUrl.searchParams.set("id", entry.id);
        if (isDebugMode(window.location.search)) {
          iosUrl.searchParams.set("debug", "1");
        }
        window.location.href = iosUrl.toString();
        return;
      }

      statusMessageEl.textContent = "View in AR currently supports Android and iOS devices.";
      return;
    }

    const url = new URL("./ar.html", window.location.href);
    url.searchParams.set("id", entry.id);
    if (isDebugMode(window.location.search)) {
      url.searchParams.set("debug", "1");
    }
    window.location.href = url.toString();
  }

  async function launchViewWithPicker(launch) {
    const entry = await resolveModelEntry();
    if (!entry) {
      return;
    }

    launch(entry);
  }

  viewArBtn.addEventListener("click", () => {
    if (debugMode) {
      void launchViewWithPicker(launchAr);
      return;
    }

    if (!selected.hasValidId) {
      statusMessageEl.textContent = "Cannot launch AR: model ID not recognized.";
      return;
    }

    launchAr(selected.entry);
  });

  imageScanBtn.addEventListener("click", () => {
    launchImageScan();
  });

  view3dBtn.addEventListener("click", () => {
    if (debugMode) {
      void launchViewWithPicker(launchView3d);
      return;
    }

    if (!selected.hasValidId) {
      statusMessageEl.textContent = "Cannot launch 3D View: model ID not recognized.";
      return;
    }

    launchView3d(selected.entry);
  });
}
