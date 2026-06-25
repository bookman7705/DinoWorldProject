import * as THREE from "three";
import { MindARThree } from "mindar-image-three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MODEL_REGISTRY, getModelFromQuery } from "./model-registry.js";
import {
  getImageScanTarget,
  imageScanMindSrc,
  IMAGE_SCAN_TARGETS,
  resolveImageScanModelScale,
  validateImageScanTargetAssets
} from "./image-scan-registry.js";
import { isDebugMode } from "./debug.js";
import {
  buildScanDebugSnapshot,
  createImageScanDebugMonitor,
  probeImageScanTarget
} from "./image-scan-debug.js";
import { buildMenuBackUrl } from "./menu-navigation.js";
import { promptModelSelection } from "./model-picker.js";
import { loadGltf } from "./gltf-loader.js";

const scanMenu = document.getElementById("scan-menu");
const scanSubtitleEl = document.getElementById("scan-subtitle");
const mindarContainer = document.getElementById("mindar-container");
const startScanBtn = document.getElementById("start-scan-btn");
const menuBackBtn = document.getElementById("back-btn");
const scanBackBtn = document.getElementById("scan-back-btn");
const scanHint = document.getElementById("scan-hint");

const loader = new GLTFLoader();
const debugMode = isDebugMode(window.location.search);
const selection = getModelFromQuery(window.location.search);

let mindarThree = null;
let renderer = null;
let scene = null;
let camera = null;
let anchor = null;
let model = null;
let sessionRunning = false;

const scanDebug = debugMode ? createImageScanDebugMonitor() : null;
const scanDebugState = {
  phase: "idle",
  sessionStartedAt: null,
  target: null,
  entry: null,
  modelLoaded: false,
  assetProbe: null,
  foundCount: 0,
  lostCount: 0,
  lastError: null
};

function resetScanDebugState() {
  scanDebugState.phase = "idle";
  scanDebugState.sessionStartedAt = null;
  scanDebugState.target = null;
  scanDebugState.entry = null;
  scanDebugState.modelLoaded = false;
  scanDebugState.assetProbe = null;
  scanDebugState.foundCount = 0;
  scanDebugState.lostCount = 0;
  scanDebugState.lastError = null;
}

function setScanDebugPhase(phase) {
  if (!scanDebug) {
    return;
  }
  scanDebugState.phase = phase;
}

function refreshScanDebugSnapshot() {
  if (!scanDebug) {
    return;
  }

  scanDebug.setSnapshotProvider(() =>
    buildScanDebugSnapshot({
      ...scanDebugState,
      mindarThree,
      anchor,
      container: mindarContainer
    })
  );
}

function showScanDebug() {
  if (!scanDebug) {
    return;
  }
  refreshScanDebugSnapshot();
  scanDebug.show();
}

function hideScanDebug() {
  scanDebug?.hide();
}

function prefersUserFacingCamera() {
  return !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function getScanTargetFromUrl() {
  if (!selection.hasValidId) {
    return null;
  }
  return getImageScanTarget(selection.id);
}

function initScanMenu() {
  if (debugMode) {
    scanSubtitleEl.textContent =
      "Choose a dinosaur, then point your camera at its tracking image.";
    void reportMissingScanAssets(getScanTargetFromUrl());
    return;
  }

  const target = getScanTargetFromUrl();
  if (!target) {
    scanSubtitleEl.textContent = selection.hasValidId
      ? "Image scan is not available for this dinosaur yet."
      : "No dinosaur selected. Scan a QR code like ?id=MOSA to get started.";
    startScanBtn.disabled = true;
    startScanBtn.style.opacity = "0.6";
    return;
  }

  const entry = MODEL_REGISTRY[target.id];
  scanSubtitleEl.textContent = entry
    ? `Point your camera at the ${entry.label} tracking image.`
    : "Point your camera at the tracking image.";
}

async function reportMissingScanAssets(target) {
  if (!debugMode || !target) {
    return;
  }

  const probe = await probeImageScanTarget(target);
  scanDebugState.assetProbe = probe;
  scanDebug?.log("asset probe", probe);

  if (!probe.allOk) {
    const missing = [];
    if (!probe.mind.ok) {
      missing.push(`${probe.mind.path} (.mind: ${probe.mind.error ?? probe.mind.status})`);
    }
    if (!probe.tracker.ok) {
      missing.push(`${probe.tracker.path} (.jpg: ${probe.tracker.error ?? probe.tracker.status})`);
    }
    const message = `Missing image-scan assets for ${target.id}: ${missing.join(", ")}`;
    scanSubtitleEl.textContent = message;
    console.warn("[image-scan]", message);
  }
}

function showMenu() {
  document.body.classList.remove("scan-session-active");
  scanMenu.hidden = false;
  scanBackBtn.hidden = true;
  scanHint.hidden = true;
  startScanBtn.disabled = false;
  hideScanDebug();
  resetScanDebugState();
}

function showScanner() {
  document.body.classList.add("scan-session-active");
  scanMenu.hidden = true;
  scanBackBtn.hidden = false;
}

function setHint(message, tone = "scanning") {
  if (!message) {
    scanHint.hidden = true;
    scanHint.textContent = "";
    scanHint.classList.remove("scan-hint--scanning", "scan-hint--found");
    return;
  }

  scanHint.hidden = false;
  scanHint.textContent = message;
  scanHint.classList.remove("scan-hint--scanning", "scan-hint--found");
  scanHint.classList.add(tone === "found" ? "scan-hint--found" : "scan-hint--scanning");
}

function getScanPickerModels() {
  return IMAGE_SCAN_TARGETS.map((t) => MODEL_REGISTRY[t.id]).filter(Boolean);
}

async function resolveScanTarget() {
  const fromUrl = getScanTargetFromUrl();
  if (fromUrl) {
    return fromUrl;
  }
  if (!debugMode) {
    return null;
  }
  const picked = await promptModelSelection(getScanPickerModels(), {
    title: "Select tracking image",
    showIds: true
  });
  return picked ? getImageScanTarget(picked.id) : null;
}

function loadScanModel(modelFile) {
  return new Promise((resolve, reject) => {
    loadGltf(loader, modelFile, { onLoad: resolve, onError: reject });
  });
}

async function disposeScanSession() {
  sessionRunning = false;
  renderer?.setAnimationLoop(null);
  model = null;
  hideScanDebug();

  if (mindarThree) {
    try {
      mindarThree.stop();
    } catch (error) {
      console.warn("MindAR stop:", error);
    }
  }

  mindarContainer.replaceChildren();
  mindarThree = null;
  renderer = null;
  scene = null;
  camera = null;
  anchor = null;
}

async function startScanSession(target) {
  await disposeScanSession();
  showScanner();
  setHint("Loading…");

  resetScanDebugState();
  scanDebugState.target = target;
  scanDebugState.sessionStartedAt = performance.now();
  setScanDebugPhase("loading");
  showScanDebug();

  const entry = MODEL_REGISTRY[target.id];
  scanDebugState.entry = entry ?? null;
  if (!entry?.modelFile) {
    throw new Error(`No model for image-scan id "${target.id}"`);
  }

  if (debugMode) {
    scanDebugState.assetProbe = await probeImageScanTarget(target);
    scanDebug?.log("session asset probe", scanDebugState.assetProbe);
    if (!scanDebugState.assetProbe.allOk) {
      setHint(
        `Missing assets — check debug panel (.mind / .jpg for ${target.id})`,
        "scanning"
      );
    }
  } else {
    const assetCheck = await validateImageScanTargetAssets(target);
    if (!assetCheck.ok && assetCheck.message) {
      setHint(assetCheck.message, "scanning");
    }
  }

  const mindUrl = imageScanMindSrc(target);
  scanDebug?.log("MindAR init", { targetId: target.id, mindUrl });

  mindarThree = new MindARThree({
    container: mindarContainer,
    imageTargetSrc: mindUrl,
    filterMinCF: 0.0001,
    filterBeta: 0.01
  });

  if (prefersUserFacingCamera()) {
    mindarThree.shouldFaceUser = true;
  }

  ({ renderer, scene, camera } = mindarThree);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1));
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(0, 1, 1);
  scene.add(light);

  anchor = mindarThree.addAnchor(0);

  setScanDebugPhase("loading-model");
  const gltf = await loadScanModel(entry.modelFile);
  model = gltf.scene;
  scanDebugState.modelLoaded = true;
  const [sx, sy, sz] = resolveImageScanModelScale(target, entry);
  model.scale.set(sx, sy, sz);
  model.rotation.set(...target.modelRotation);
  model.position.set(...target.modelPosition);

  const label = entry.label;

  anchor.onTargetFound = () => {
    scanDebugState.foundCount += 1;
    setScanDebugPhase("target-found");
    scanDebug?.log("target found", { count: scanDebugState.foundCount });
    if (model && !anchor.group.children.includes(model)) {
      anchor.group.add(model);
    }
    setHint(`Tracking image found — ${label}`, "found");
  };

  anchor.onTargetLost = () => {
    scanDebugState.lostCount += 1;
    setScanDebugPhase("scanning");
    scanDebug?.log("target lost", { count: scanDebugState.lostCount });
    if (model) {
      anchor.group.remove(model);
    }
    setHint("Tracking image lost — scanning…", "scanning");
  };

  setHint("Starting camera…");
  setScanDebugPhase("starting-camera");
  sessionRunning = true;

  try {
    await mindarThree.start();
  } catch (error) {
    scanDebugState.lastError =
      error instanceof Error ? error.message : String(error);
    scanDebug?.log("mindarThree.start failed", scanDebugState.lastError);
    throw error;
  }

  mindarThree.resize();
  setScanDebugPhase("scanning");
  setHint("Scanning for tracking image…", "scanning");
  scanDebug?.log("session running", {
    cameraFacing: mindarThree.shouldFaceUser ? "user" : "environment",
    mindUrl
  });

  renderer.setAnimationLoop(() => {
    if (!sessionRunning) {
      return;
    }
    renderer.render(scene, camera);
  });
}

initScanMenu();

menuBackBtn.addEventListener("click", () => {
  void disposeScanSession().then(() => {
    window.location.href = buildMenuBackUrl(window.location.search).toString();
  });
});

scanBackBtn.addEventListener("click", async () => {
  await disposeScanSession();
  showMenu();
});

startScanBtn.addEventListener("click", async () => {
  startScanBtn.disabled = true;
  try {
    const target = await resolveScanTarget();
    if (!target) {
      startScanBtn.disabled = false;
      return;
    }

    if (debugMode) {
      await reportMissingScanAssets(target);
    }

    await startScanSession(target);
  } catch (error) {
    console.error(error);
    scanDebugState.lastError = error instanceof Error ? error.message : String(error);
    setScanDebugPhase("error");
    scanDebug?.log("start scan failed", scanDebugState.lastError);
    setHint("Could not start. Allow camera access and try again.");
    startScanBtn.disabled = false;
    showMenu();
  }
});

window.addEventListener("pagehide", () => {
  void disposeScanSession();
});
