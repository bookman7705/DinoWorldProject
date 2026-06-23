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
  if (debugMode) {
    url.searchParams.set("debug", "1");
  }
  if (replace) {
    window.location.replace(url.toString());
  } else {
    window.location.href = url.toString();
  }
}

if (selected.id === "scan") {
  launchImageScan({ replace: true });
} else {
  if (debugMode) {
    const debugBadge = document.createElement("p");
    debugBadge.className = "debug-badge";
    debugBadge.textContent = "Debug mode — pick a model when launching a view";
    modelInfoEl.before(debugBadge);
    modelInfoEl.textContent = selected.hasValidId
      ? `QR model: ${selected.entry.label}. Modes will prompt for model selection.`
      : "No QR model loaded. Modes will prompt for model selection.";
  } else if (!selected.hasValidId) {
    modelInfoEl.textContent =
      "No dinosaur selected yet. Tap 3D View to choose one, or scan a QR code like ?id=rex.";
    viewArBtn.disabled = true;
    viewArBtn.style.opacity = "0.6";
  } else {
    modelInfoEl.textContent = `Selected: ${selected.entry.label}. ${selected.entry.description}`;
  }

  async function resolveModelEntry({ promptWhenMissing = false } = {}) {
    if (selected.hasValidId) {
      return selected.entry;
    }

    if (promptWhenMissing || debugMode) {
      return promptModelSelection(getAvailableModels());
    }

    return null;
  }

  function launchView3d(entry) {
    const url = new URL("./view-3d.html", window.location.href);
    url.searchParams.set("id", entry.id);
    if (debugMode) {
      url.searchParams.set("debug", "1");
    }
    window.location.href = url.toString();
  }

  function launchAr(entry) {
    if (!isAndroid) {
      if (isIOS) {
        const iosUrl = new URL("./ar-ios.html", window.location.href);
        iosUrl.searchParams.set("id", entry.id);
        if (debugMode) {
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
    if (debugMode) {
      url.searchParams.set("debug", "1");
    }
    window.location.href = url.toString();
  }

  viewArBtn.addEventListener("click", async () => {
    const entry = await resolveModelEntry({ promptWhenMissing: debugMode });
    if (!entry) {
      if (!debugMode) {
        statusMessageEl.textContent = "Cannot launch AR: model ID not recognized.";
      }
      return;
    }

    launchAr(entry);
  });

  imageScanBtn.addEventListener("click", () => {
    launchImageScan();
  });

  view3dBtn.addEventListener("click", async () => {
    const entry = await resolveModelEntry({ promptWhenMissing: true });
    if (!entry) {
      return;
    }

    launchView3d(entry);
  });
}
