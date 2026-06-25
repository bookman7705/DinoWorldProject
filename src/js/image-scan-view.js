import * as THREE from "three";
import { MindARThree } from "mindar-image-three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinnedScene } from "three/addons/utils/SkeletonUtils.js";
import { MODEL_REGISTRY, getModelFromQuery } from "./model-registry.js";
import {
  getImageScanTarget,
  imageScanMindUrl,
  IMAGE_SCAN_TARGETS,
  resolveImageScanModelScale
} from "./image-scan-registry.js";
import { isDebugMode } from "./debug.js";
import { buildMenuBackUrl } from "./menu-navigation.js";
import { promptModelSelection } from "./model-picker.js";
import { loadGltf } from "./gltf-loader.js";
import { configureGltfMaterials, configureGltfRenderer } from "./gltf-materials.js";
import { playModelAnimation } from "./gltf-animations.js";

const scanMenu = document.getElementById("scan-menu");
const scanSubtitleEl = document.getElementById("scan-subtitle");
const mindarContainer = document.getElementById("mindar-container");
const startScanBtn = document.getElementById("start-scan-btn");
const menuBackBtn = document.getElementById("back-btn");
const scanBackBtn = document.getElementById("scan-back-btn");
const scanHint = document.getElementById("scan-hint");

const loader = new GLTFLoader();
const clock = new THREE.Clock();

let mindarThree = null;
let renderer = null;
let scene = null;
let camera = null;
let mixer = null;
let activeTarget = null;
let activeModel = null;
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
  scanMenu.hidden = false;
  mindarContainer.hidden = true;
  scanBackBtn.hidden = true;
  scanHint.hidden = true;
  startScanBtn.disabled = false;
}

function showScanner() {
  scanMenu.hidden = true;
  mindarContainer.hidden = false;
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
    imageTargetSrc: imageScanMindUrl(target),
    maxTrack: 1,
    uiLoading: "no",
    uiScanning: "no",
    filterMinCF: 0.0001,
    filterBeta: 0.01
  });

  ({ renderer, scene, camera } = mindarThree);
  configureGltfRenderer(renderer, { exposure: 1.2 });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(0, 5, 5);
  scene.add(dirLight);

  anchor = mindarThree.addAnchor(0);
  anchor.onTargetFound = () => onTargetFound(target);
  anchor.onTargetLost = () => onTargetLost(target);
}

function attachScanModel(target) {
  if (!cachedModel || !anchor) {
    return;
  }

  const registryEntry = MODEL_REGISTRY[target.id];
  if (!registryEntry) {
    return;
  }

  clearActiveModel();

  const model = cloneSkinnedScene(cachedModel.scene);
  const [scaleX, scaleY, scaleZ] = resolveImageScanModelScale(target, registryEntry);
  model.scale.set(scaleX, scaleY, scaleZ);
  model.rotation.set(...target.modelRotation);
  model.position.set(...target.modelPosition);

  anchor.group.add(model);
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

  setHint("Starting camera…", "scanning");
  sessionRunning = true;
  activeTarget = null;

  await mindarThree.start();

  setHint("Scanning for image…", "scanning");

  renderer.setAnimationLoop(() => {
    if (!sessionRunning) {
      return;
    }

    mixer?.update(clock.getDelta());
    renderer.render(scene, camera);
  });

  if (!activeTarget && anchor?.group?.visible) {
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

function clearActiveModel() {
  mixer?.stopAllAction();
  mixer = null;

  if (activeModel && anchor) {
    anchor.group.remove(activeModel);
    disposeMeshes(activeModel);
  }

  activeModel = null;
}

async function disposeScanSession() {
  sessionRunning = false;
  clearActiveModel();
  activeTarget = null;

  renderer?.setAnimationLoop(null);

  if (mindarThree) {
    try {
      mindarThree.stop();
    } catch (error) {
      console.warn("MindAR stop:", error);
    }
  }

  for (const video of mindarContainer.querySelectorAll("video")) {
    video.srcObject?.getTracks?.().forEach((track) => track.stop());
    video.remove();
  }

  renderer?.domElement?.remove();
  mindarThree?.cssRenderer?.domElement?.remove();

  if (anchor) {
    anchor.onTargetFound = null;
    anchor.onTargetLost = null;
    anchor.group.clear();
    anchor = null;
  }

  mindarContainer.replaceChildren();
  renderer?.dispose();

  if (cachedModel) {
    disposeMeshes(cachedModel.scene);
    cachedModel = null;
  }

  mindarThree = null;
  renderer = null;
  scene = null;
  camera = null;
}

function onTargetFound(target) {
  if (!sessionRunning || !anchor) {
    return;
  }

  activeTarget = target.id;
  setHint("", "scanning");
}

function onTargetLost(target) {
  if (!sessionRunning || activeTarget !== target.id) {
    return;
  }

  activeTarget = null;
  setHint("Scanning for image…", "scanning");
}
