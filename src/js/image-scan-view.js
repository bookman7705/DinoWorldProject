import * as THREE from "three";
import { MindARThree } from "mindar-image-three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinnedScene } from "three/addons/utils/SkeletonUtils.js";
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
import { configureGltfMaterials } from "./gltf-materials.js";
import { playModelAnimation } from "./gltf-animations.js";
import { createImageScanGestureController } from "./image-scan-gestures.js";

const scanMenu = document.getElementById("scan-menu");
const scanSubtitleEl = document.getElementById("scan-subtitle");
const mindarContainer = document.getElementById("mindar-container");
const startScanBtn = document.getElementById("start-scan-btn");
const menuBackBtn = document.getElementById("back-btn");
const scanBackBtn = document.getElementById("scan-back-btn");
const scanHint = document.getElementById("scan-hint");
const scanScaleEl = document.getElementById("scan-scale");

const loader = new GLTFLoader();
const clock = new THREE.Clock();

let mindarThree = null;
let renderer = null;
let scene = null;
let camera = null;
let mixer = null;
let activeTarget = null;
let activeModel = null;
let gestureRoot = null;
let gestureController = null;
let anchor = null;
let cachedModel = null;
let sessionRunning = false;

const debugMode = isDebugMode(window.location.search);
const selection = getModelFromQuery(window.location.search);

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

initScanMenu();

menuBackBtn.addEventListener("click", () => {
  void exitImageScan(buildMenuBackUrl(window.location.search).toString());
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
      if (!debugMode) {
        scanSubtitleEl.textContent = selection.hasValidId
          ? "Image scan is not available for this dinosaur yet."
          : "Cannot start scan: model ID not recognized.";
      }
      startScanBtn.disabled = false;
      return;
    }

    await startScanSession(target);
  } catch (error) {
    console.error(error);
    setHint("Could not start. Allow camera access and try again.", "scanning");
    startScanBtn.disabled = false;
    showMenu();
  }
});

window.addEventListener("pagehide", () => {
  void disposeScanSession();
});

async function exitImageScan(url) {
  await disposeScanSession();
  window.location.href = new URL(url, window.location.href).toString();
}

function showMenu() {
  document.body.classList.remove("scan-session-active");
  scanMenu.hidden = false;
  scanBackBtn.hidden = true;
  scanHint.hidden = true;
  scanScaleEl.hidden = true;
  startScanBtn.disabled = false;
}

function showScanner() {
  document.body.classList.add("scan-session-active");
  scanMenu.hidden = true;
  scanBackBtn.hidden = false;
}
function updateScanScaleDisplay(gestureScaleFactor) {
  if (!debugMode || !scanScaleEl) {
    return;
  }

  scanScaleEl.textContent = `Scale: ${gestureScaleFactor.toFixed(2)}`;
  scanScaleEl.hidden = !activeTarget;
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

function bindScanGestures() {
  gestureController?.dispose();
  gestureController = createImageScanGestureController({
    getGestureRoot: () => gestureRoot,
    isInteractionEnabled: () => sessionRunning && Boolean(activeTarget) && Boolean(gestureRoot),
    onGestureScaleChange: debugMode ? updateScanScaleDisplay : undefined
  });

  if (debugMode) {
    updateScanScaleDisplay(gestureController.getGestureScaleFactor());
  }
}

function getScanPickerModels() {
  return IMAGE_SCAN_TARGETS.map((target) => MODEL_REGISTRY[target.id]).filter(Boolean);
}

async function resolveScanTarget() {
  const urlTarget = getScanTargetFromUrl();
  if (urlTarget) {
    return urlTarget;
  }

  if (!debugMode) {
    return null;
  }

  const picked = await promptModelSelection(getScanPickerModels(), {
    title: "Select tracking image",
    showIds: true
  });

  if (!picked) {
    return null;
  }

  return getImageScanTarget(picked.id);
}

function loadGltfAsync(modelFile) {
  return new Promise((resolve, reject) => {
    loadGltf(loader, modelFile, {
      onLoad: resolve,
      onError: reject
    });
  });
}

async function preloadModel(target) {
  const entry = MODEL_REGISTRY[target.id];
  if (!entry?.modelFile) {
    throw new Error(`No model file configured for image-scan id "${target.id}"`);
  }

  const gltf = await loadGltfAsync(entry.modelFile);
  configureGltfMaterials(gltf.scene);
  cachedModel = { scene: gltf.scene, animations: gltf.animations };
}

function setupMindAR(target) {
  mindarThree = new MindARThree({
    container: mindarContainer,
    imageTargetSrc: imageScanMindSrc(target),
    filterMinCF: 0.0001,
    filterBeta: 0.01
  });

  ({ renderer, scene, camera } = mindarThree);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(0, 5, 5);
  scene.add(dirLight);

  anchor = mindarThree.addAnchor(0);
  gestureRoot = new THREE.Group();
  anchor.group.add(gestureRoot);

  anchor.onTargetFound = () => onTargetFound(target);
  anchor.onTargetLost = () => onTargetLost(target);
}

function attachScanModel(target) {
  if (!cachedModel || !gestureRoot) {
    return;
  }

  const registryEntry = MODEL_REGISTRY[target.id];
  if (!registryEntry) {
    return;
  }

  clearModelChildren();

  const model = cloneSkinnedScene(cachedModel.scene);
  const [scaleX, scaleY, scaleZ] = resolveImageScanModelScale(target, registryEntry);
  model.scale.set(scaleX, scaleY, scaleZ);
  model.rotation.set(...target.modelRotation);
  model.position.set(...target.modelPosition);

  gestureRoot.add(model);
  activeModel = model;

  if (cachedModel.animations.length > 0) {
    mixer = new THREE.AnimationMixer(model);
    playModelAnimation(mixer, cachedModel.animations, registryEntry.animation);
  }
}

async function startScanSession(target) {
  if (mindarThree) {
    await disposeScanSession();
  }

  showScanner();
  setupMindAR(target);

  setHint("Loading model…", "scanning");
  await preloadModel(target);
  attachScanModel(target);
  bindScanGestures();

  setHint("Starting camera…", "scanning");
  sessionRunning = true;
  activeTarget = null;

  await mindarThree.start();
  mindarThree.resize();

  setHint("Scanning for image…", "scanning");

  renderer.setAnimationLoop(() => {
    const delta = clock.getDelta();
    mixer?.update(delta);
    renderer.render(scene, camera);
  });

  if (!activeTarget && anchor?.visible) {
    onTargetFound(target);
  }
}

function disposeMeshes(object3d) {
  object3d.traverse((child) => {
    if (!child.isMesh) {
      return;
    }
    child.geometry?.dispose?.();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      material?.dispose?.();
    }
  });
}

function clearModelChildren() {
  mixer?.stopAllAction();
  mixer = null;

  if (activeModel) {
    disposeMeshes(activeModel);
    gestureRoot?.remove(activeModel);
  }

  activeModel = null;
}

function clearActiveModel() {
  clearModelChildren();
  gestureRoot = null;
}

async function disposeScanSession() {
  sessionRunning = false;
  gestureController?.dispose();
  gestureController = null;
  activeTarget = null;
  scanScaleEl.hidden = true;

  renderer?.setAnimationLoop(null);

  if (mindarThree) {
    try {
      mindarThree.stop();
    } catch (error) {
      console.warn("MindAR stop:", error);
    }
  }

  if (activeModel) {
    disposeMeshes(activeModel);
  }

  if (cachedModel) {
    disposeMeshes(cachedModel.scene);
    cachedModel = null;
  }

  mindarContainer.replaceChildren();

  anchor = null;
  gestureRoot = null;
  activeModel = null;
  mixer = null;
  mindarThree = null;
  renderer = null;
  scene = null;
  camera = null;
}

function onTargetFound(target) {
  if (!sessionRunning) {
    return;
  }

  activeTarget = target.id;
  setHint("", "scanning");
  if (debugMode) {
    updateScanScaleDisplay(gestureController?.getGestureScaleFactor() ?? 1);
  }
}

function onTargetLost(target) {
  if (!sessionRunning || activeTarget !== target.id) {
    return;
  }

  activeTarget = null;
  setHint("Scanning for image…", "scanning");
  scanScaleEl.hidden = true;
}
