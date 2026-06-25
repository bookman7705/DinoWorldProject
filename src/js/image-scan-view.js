import * as THREE from "three";
import { MindARThree } from "mindar-image-three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MODEL_REGISTRY, getModelFromQuery } from "./model-registry.js";
import {
  getImageScanTarget,
  imageScanMindSrc,
  IMAGE_SCAN_TARGETS,
  resolveImageScanModelScale
} from "./image-scan-registry.js";
import { isDebugMode } from "./debug.js";
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

function showMenu() {
  document.body.classList.remove("scan-session-active");
  scanMenu.hidden = false;
  scanBackBtn.hidden = true;
  scanHint.hidden = true;
  startScanBtn.disabled = false;
}

function showScanner() {
  document.body.classList.add("scan-session-active");
  scanMenu.hidden = true;
  scanBackBtn.hidden = false;
}

function setHint(message) {
  if (!message) {
    scanHint.hidden = true;
    scanHint.textContent = "";
    return;
  }
  scanHint.hidden = false;
  scanHint.textContent = message;
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

  const entry = MODEL_REGISTRY[target.id];
  if (!entry?.modelFile) {
    throw new Error(`No model for image-scan id "${target.id}"`);
  }

  mindarThree = new MindARThree({
    container: mindarContainer,
    imageTargetSrc: imageScanMindSrc(target),
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

  const gltf = await loadScanModel(entry.modelFile);
  model = gltf.scene;
  const [sx, sy, sz] = resolveImageScanModelScale(target, entry);
  model.scale.set(sx, sy, sz);
  model.rotation.set(...target.modelRotation);
  model.position.set(...target.modelPosition);

  anchor.onTargetFound = () => {
    console.log("target found");
    if (model && !anchor.group.children.includes(model)) {
      anchor.group.add(model);
    }
    setHint("");
  };

  anchor.onTargetLost = () => {
    console.log("target lost");
    if (model) {
      anchor.group.remove(model);
    }
    setHint("Scanning for image…");
  };

  setHint("Starting camera…");
  sessionRunning = true;
  await mindarThree.start();
  mindarThree.resize();
  setHint("Scanning for image…");

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
    await startScanSession(target);
  } catch (error) {
    console.error(error);
    setHint("Could not start. Allow camera access and try again.");
    startScanBtn.disabled = false;
    showMenu();
  }
});

window.addEventListener("pagehide", () => {
  void disposeScanSession();
});
