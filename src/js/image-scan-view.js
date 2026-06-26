import * as THREE from "three";
import { MindARThree } from "mindar-image-three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinnedScene } from "three/addons/utils/SkeletonUtils.js";
import { MODEL_REGISTRY, getModelFromQuery } from "./model-registry.js";
import {
  getImageScanTarget,
  imageScanMindSrc,
  IMAGE_SCAN_TARGETS,
  resolveImageScanModelScale,
  resolveImageScanModelRotation,
  getImageScanTypeFromQuery,
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
import { configureGltfMaterials } from "./gltf-materials.js";
import { playModelAnimation } from "./gltf-animations.js";
import { createImageScanGestureController } from "./image-scan-gestures.js";
import { createImageScanPoseStabilizer } from "./image-scan-pose-stabilizer.js";

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
const debugMode = isDebugMode(window.location.search);
const selection = getModelFromQuery(window.location.search);
const scanTypeConfig = getImageScanTypeFromQuery(window.location.search);

let mindarThree = null;
let renderer = null;
let scene = null;
let camera = null;
let anchor = null;
let modelGroup = null;
let activeModel = null;
let mixer = null;
let gestureController = null;
let poseStabilizer = null;
let cachedModel = null;
let activeTarget = null;
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
  scanScaleEl.hidden = true;
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

function updateScanScaleDisplay(gestureScaleFactor) {
  if (!debugMode || !scanScaleEl) {
    return;
  }

  scanScaleEl.textContent = `Scale: ${gestureScaleFactor.toFixed(2)}`;
  scanScaleEl.hidden = !activeTarget;
}

function bindScanGestures() {
  gestureController?.dispose();
  gestureController = createImageScanGestureController({
    getGestureRoot: () => modelGroup,
    isInteractionEnabled: () => sessionRunning && Boolean(activeTarget) && Boolean(modelGroup),
    onGestureScaleChange: debugMode ? updateScanScaleDisplay : undefined
  });

  if (debugMode) {
    updateScanScaleDisplay(gestureController.getGestureScaleFactor());
  }
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

function loadGltfAsync(modelFile) {
  return new Promise((resolve, reject) => {
    loadGltf(loader, modelFile, { onLoad: resolve, onError: reject });
  });
}

async function preloadModel(target) {
  const entry = MODEL_REGISTRY[target.id];
  if (!entry?.modelFile) {
    throw new Error(`No model for image-scan id "${target.id}"`);
  }

  const gltf = await loadGltfAsync(entry.modelFile);
  configureGltfMaterials(gltf.scene);
  cachedModel = { scene: gltf.scene, animations: gltf.animations };
  scanDebugState.modelLoaded = true;
}

function setupMindAR(target) {
  const mindUrl = imageScanMindSrc(target);
  scanDebug?.log("MindAR init", { targetId: target.id, mindUrl });

  mindarThree = new MindARThree({
    container: mindarContainer,
    imageTargetSrc: mindUrl,
    filterMinCF: 0.0001,
    filterBeta: 0.01,
    warmupTolerance: 8,
    missTolerance: 5
  });

  if (prefersUserFacingCamera()) {
    mindarThree.shouldFaceUser = true;
  }

  ({ renderer, scene, camera } = mindarThree);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(0, 5, 5);
  scene.add(dirLight);

  anchor = mindarThree.addAnchor(0);

  modelGroup = new THREE.Group();
  modelGroup.visible = false;
  anchor.group.add(modelGroup);

  poseStabilizer?.dispose();
  poseStabilizer = createImageScanPoseStabilizer({
    getAnchorGroup: () => anchor?.group,
    getModelGroup: () => modelGroup,
    onPhaseChange: (phase) => {
      if (!sessionRunning || !activeTarget) {
        return;
      }

      if (phase === "warming") {
        setHint("Aligning model to tracking image…", "scanning");
        return;
      }

      if (phase === "stable") {
        gestureController?.resetTransforms();
        const label = MODEL_REGISTRY[activeTarget]?.label ?? activeTarget;
        setHint(`Tracking image found — ${label}`, "found");
      }
    }
  });

  anchor.onTargetFound = () => onTargetFound(target);
  anchor.onTargetLost = () => onTargetLost(target);
}

function attachScanModel(target) {
  if (!cachedModel || !modelGroup) {
    return;
  }

  const entry = MODEL_REGISTRY[target.id];
  if (!entry) {
    return;
  }

  clearModelChildren();

  const model = cloneSkinnedScene(cachedModel.scene);
  const [sx, sy, sz] = resolveImageScanModelScale(target, entry);
  const [rx, ry, rz] = resolveImageScanModelRotation(target, scanTypeConfig);
  model.scale.set(sx, sy, sz);
  model.rotation.set(rx, ry, rz);
  model.position.set(...target.modelPosition);

  modelGroup.visible = false;
  modelGroup.add(model);
  activeModel = model;

  if (cachedModel.animations.length > 0) {
    mixer = new THREE.AnimationMixer(model);
    playModelAnimation(mixer, cachedModel.animations, entry.animation);
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
    modelGroup?.remove(activeModel);
  }

  activeModel = null;
}

function stopContainerMediaStreams(container) {
  for (const video of container.querySelectorAll("video")) {
    const stream = video.srcObject;
    if (stream instanceof MediaStream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    video.srcObject = null;
  }
}

async function disposeScanSession() {
  sessionRunning = false;
  activeTarget = null;
  renderer?.setAnimationLoop(null);
  gestureController?.dispose();
  gestureController = null;
  poseStabilizer?.dispose();
  poseStabilizer = null;
  hideScanDebug();
  setHint("");

  if (mindarThree) {
    try {
      await mindarThree.stop();
    } catch (error) {
      console.warn("MindAR stop:", error);
    }
  }

  clearModelChildren();

  if (cachedModel) {
    disposeMeshes(cachedModel.scene);
    cachedModel = null;
  }

  stopContainerMediaStreams(mindarContainer);

  try {
    renderer?.dispose();
  } catch (error) {
    console.warn("Renderer dispose:", error);
  }

  mindarContainer.replaceChildren();

  mindarThree = null;
  renderer = null;
  scene = null;
  camera = null;
  anchor = null;
  modelGroup = null;
  activeModel = null;
  mixer = null;
}

function exitToMainMenu() {
  void disposeScanSession().then(() => {
    window.location.href = buildMenuBackUrl(window.location.search).toString();
  });
}

function onTargetFound(target) {
  if (!sessionRunning) {
    return;
  }

  scanDebugState.foundCount += 1;
  setScanDebugPhase("target-found");
  scanDebug?.log("target found", { count: scanDebugState.foundCount });

  activeTarget = target.id;
  const label = MODEL_REGISTRY[target.id]?.label ?? target.id;

  if (poseStabilizer?.getPhase() === "stable") {
    setHint(`Tracking image found — ${label}`, "found");
  } else {
    setHint("Aligning model to tracking image…", "scanning");
  }

  if (debugMode) {
    updateScanScaleDisplay(gestureController?.getGestureScaleFactor() ?? 1);
  }
}

function onTargetLost(target) {
  if (!sessionRunning || activeTarget !== target.id) {
    return;
  }

  scanDebugState.lostCount += 1;
  setScanDebugPhase("scanning");
  scanDebug?.log("target lost", { count: scanDebugState.lostCount });

  activeTarget = null;
  poseStabilizer?.reset();
  setHint("Tracking image lost — scanning…", "scanning");
  scanScaleEl.hidden = true;
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

  setupMindAR(target);

  setScanDebugPhase("loading-model");
  setHint("Loading model…", "scanning");
  await preloadModel(target);
  attachScanModel(target);
  bindScanGestures();

  setHint("Starting camera…", "scanning");
  setScanDebugPhase("starting-camera");
  sessionRunning = true;
  activeTarget = null;

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
    mindUrl: imageScanMindSrc(target)
  });

  renderer.setAnimationLoop(() => {
    if (!sessionRunning) {
      return;
    }

    const delta = clock.getDelta();
    mixer?.update(delta);
    poseStabilizer?.update();
    renderer.render(scene, camera);
  });

  if (!activeTarget && anchor?.visible) {
    onTargetFound(target);
  }
}

initScanMenu();

menuBackBtn.addEventListener("click", exitToMainMenu);
scanBackBtn.addEventListener("click", exitToMainMenu);

startScanBtn.addEventListener("click", async () => {
  startScanBtn.disabled = true;
  showScanner();

  try {
    const target = await resolveScanTarget();
    if (!target) {
      showMenu();
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
