import * as THREE from "three";
import { MindARThree } from "mindar-image-three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinnedScene } from "three/addons/utils/SkeletonUtils.js";
import { MODEL_REGISTRY } from "./model-registry.js";
import {
  COMBINED_MIND_URL,
  IMAGE_SCAN_TARGETS,
  resolveImageScanModelScale
} from "./image-scan-registry.js";
import { loadGltfWithDebugFallback } from "./gltf-loader.js";
import { configureGltfMaterials, configureGltfRenderer } from "./gltf-materials.js";
import { playModelAnimation } from "./gltf-animations.js";

const scanMenu = document.getElementById("scan-menu");
const mindarContainer = document.getElementById("mindar-container");
const startScanBtn = document.getElementById("start-scan-btn");
const menuBackBtn = document.getElementById("back-btn");
const scanBackBtn = document.getElementById("scan-back-btn");
const scanHint = document.getElementById("scan-hint");

const loader = new GLTFLoader();
const clock = new THREE.Clock();
const modelCache = {};

/** @type {Map<number, { target: object, anchor: object }>} */
const anchorBindings = new Map();

let mindarThree = null;
let renderer = null;
let scene = null;
let camera = null;
let mixer = null;
let activeTarget = null;
let activeModel = null;
let activeAnchor = null;
let sessionRunning = false;

menuBackBtn.addEventListener("click", () => {
  void exitImageScan("./index.html");
});

scanBackBtn.addEventListener("click", async () => {
  await disposeScanSession();
  showMenu();
});

startScanBtn.addEventListener("click", async () => {
  startScanBtn.disabled = true;
  try {
    await startScanSession();
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

function loadGltf(url) {
  return new Promise((resolve, reject) => {
    loadGltfWithDebugFallback(loader, url, {
      onLoad: resolve,
      onError: reject
    });
  });
}

async function preloadModels(onProgress) {
  const ids = [...new Set(IMAGE_SCAN_TARGETS.map((target) => target.id))];
  let loaded = 0;

  await Promise.all(
    ids.map(async (id) => {
      const entry = MODEL_REGISTRY[id];
      if (!entry) {
        throw new Error(`No model registry entry for "${id}"`);
      }

      const gltf = await loadGltf(entry.modelFile);
      configureGltfMaterials(gltf.scene);
      modelCache[id] = { scene: gltf.scene, animations: gltf.animations };

      loaded += 1;
      onProgress?.(loaded, ids.length);
    })
  );
}

function setupMindAR() {
  mindarThree = new MindARThree({
    container: mindarContainer,
    imageTargetSrc: COMBINED_MIND_URL,
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

  for (const target of IMAGE_SCAN_TARGETS) {
    const anchor = mindarThree.addAnchor(target.targetIndex);
    anchor.onTargetFound = () => onTargetFound(target);
    anchor.onTargetLost = () => onTargetLost(target);
    anchorBindings.set(target.targetIndex, { target, anchor });
  }
}

async function startScanSession() {
  if (mindarThree) {
    await disposeScanSession();
  }

  setupMindAR();
  showScanner();
  setHint("Loading models…", "scanning");

  await preloadModels((loaded, total) => {
    setHint(`Loading models… ${loaded}/${total}`, "scanning");
  });

  setHint("Starting camera…", "scanning");
  await mindarThree.start();

  sessionRunning = true;
  activeTarget = null;
  setHint("Scanning for image…", "scanning");

  renderer.setAnimationLoop(() => {
    if (!sessionRunning) {
      return;
    }

    mixer?.update(clock.getDelta());
    renderer.render(scene, camera);
  });
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

  if (activeModel && activeAnchor) {
    activeAnchor.group.remove(activeModel);
    disposeMeshes(activeModel);
  }

  activeModel = null;
  activeAnchor = null;
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

  for (const binding of anchorBindings.values()) {
    binding.anchor.onTargetFound = null;
    binding.anchor.onTargetLost = null;
    binding.anchor.group.clear();
  }
  anchorBindings.clear();

  mindarContainer.replaceChildren();
  renderer?.dispose();

  for (const cached of Object.values(modelCache)) {
    disposeMeshes(cached.scene);
  }
  for (const key of Object.keys(modelCache)) {
    delete modelCache[key];
  }

  mindarThree = null;
  renderer = null;
  scene = null;
  camera = null;
}

function onTargetFound(target) {
  if (!sessionRunning || activeTarget) {
    return;
  }

  const binding = anchorBindings.get(target.targetIndex);
  const cached = modelCache[target.id];
  const registryEntry = MODEL_REGISTRY[target.id];

  if (!binding || !cached || !registryEntry) {
    return;
  }

  activeTarget = target.id;

  const model = cloneSkinnedScene(cached.scene);
  const [scaleX, scaleY, scaleZ] = resolveImageScanModelScale(target, registryEntry);
  model.scale.set(scaleX, scaleY, scaleZ);
  model.rotation.set(...target.modelRotation);
  model.position.set(...target.modelPosition);

  binding.anchor.group.add(model);
  activeModel = model;
  activeAnchor = binding.anchor;

  if (cached.animations.length > 0) {
    mixer = new THREE.AnimationMixer(model);
    playModelAnimation(mixer, cached.animations, registryEntry.animation);
  }

  setHint("", "scanning");
}

function onTargetLost(target) {
  if (!sessionRunning || activeTarget !== target.id) {
    return;
  }

  activeTarget = null;
  clearActiveModel();
  setHint("Scanning for image…", "scanning");
}
