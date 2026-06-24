import * as THREE from "three";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160/examples/jsm/loaders/GLTFLoader.js";
import { getModelFromQuery, ISLAND_WORLD_FILE } from "./model-registry.js";
import { buildMenuBackUrl } from "./menu-navigation.js";
import { loadGltf } from "./gltf-loader.js";
import { CameraController } from "./view-3d/camera-controller.js";
import { configureGltfMaterials, configureGltfRenderer } from "./gltf-materials.js";
import { setupSceneLighting } from "./view-3d/scene-lights.js";
import { playModelAnimation } from "./gltf-animations.js";

const statusEl = document.getElementById("view-3d-status");
const helpEl = document.getElementById("view-3d-help");
const descriptionEl = document.getElementById("view-3d-description");
const titleEl = document.getElementById("view-3d-model-name");
const backBtn = document.getElementById("back-btn");

backBtn.addEventListener("click", () => {
  window.location.href = buildMenuBackUrl(window.location.search).toString();
});

const selection = getModelFromQuery(window.location.search);
if (!selection.entry) {
  statusEl.textContent = `Invalid model ID "${selection.id || ""}". Use a valid id like ?id=MOSA.`;
  helpEl.textContent = "";
  throw new Error("Invalid model id");
}

if (!selection.entry.modelFile) {
  statusEl.textContent = "Model configuration error: missing model file.";
  helpEl.textContent = "";
  throw new Error(`Missing modelFile for id "${selection.id}"`);
}

const view3dConfig = selection.entry.view3d;
if (!view3dConfig) {
  statusEl.textContent = "3D View is not configured for this model.";
  helpEl.textContent = "";
  throw new Error("Missing view3d config");
}

titleEl.textContent = selection.entry.label;
helpEl.textContent = "Drag to orbit. Pinch or scroll to zoom.";

if (view3dConfig.description) {
  descriptionEl.textContent = view3dConfig.description;
  descriptionEl.hidden = false;
} else {
  descriptionEl.textContent = "";
  descriptionEl.hidden = true;
}

const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const initialW = window.innerWidth || 1;
const initialH = window.innerHeight || 1;
const camera = new THREE.PerspectiveCamera(60, initialW / initialH, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({
  antialias: !isIOS,
  alpha: false,
  powerPreference: "low-power",
  failIfMajorPerformanceCrisis: false
});
const pixelRatio = isIOS ? Math.min(window.devicePixelRatio, 2) : window.devicePixelRatio;
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x111111, 1);
configureGltfRenderer(renderer, { exposure: 1.2 });

const canvas = renderer.domElement;
canvas.style.webkitTransform = "translateZ(0)";
document.body.appendChild(canvas);

const cameraController = new CameraController(camera, canvas);
applyCameraConfig(cameraController, view3dConfig.camera);

setupSceneLighting(scene, view3dConfig.lighting);

const loader = new GLTFLoader();
const clock = new THREE.Clock();
const mixers = [];

statusEl.textContent = "Loading island world...";

loadGltf(loader, ISLAND_WORLD_FILE, {
  onLoad: (gltf) => {
    const island = gltf.scene;
    island.position.set(0, 0, 0);
    island.scale.set(1, 1, 1);
    configureGltfMaterials(island);
    scene.add(island);

    if (gltf.animations.length > 0) {
      const islandMixer = new THREE.AnimationMixer(island);
      gltf.animations.forEach((clip) => islandMixer.clipAction(clip).play());
      mixers.push(islandMixer);
    }

    statusEl.textContent = "Loading dinosaur model...";
    loadDinosaur();
  },
  onError: () => {
    statusEl.textContent = "Island load failed. Check network access and Cloudflare model hosting.";
  }
});

function loadDinosaur() {
  loadGltf(loader, selection.entry.modelFile, {
    onLoad: (gltf) => {
      const dinosaur = gltf.scene;
      configureGltfMaterials(dinosaur);
      applyTransform(dinosaur, view3dConfig);
      scene.add(dinosaur);

      if (gltf.animations.length > 0) {
        const dinoMixer = new THREE.AnimationMixer(dinosaur);
        playModelAnimation(dinoMixer, gltf.animations, selection.entry.animation);
        mixers.push(dinoMixer);
      }

      statusEl.textContent = "";
    },
    onError: () => {
      statusEl.textContent = "Model load failed. Check network access and Cloudflare model hosting.";
    }
  });
}

function applyTransform(object, config) {
  const [px, py, pz] = config.position;
  const [sx, sy, sz] = config.scale;
  const [rx, ry, rz] = config.rotation;

  object.position.set(px, py, pz);
  object.scale.set(sx, sy, sz);
  object.rotation.set(rx, ry, rz);
}

function applyCameraConfig(controller, cameraConfig) {
  const [tx, ty, tz] = cameraConfig.target;
  controller.setTargetOrigin(tx, ty, tz);
  controller.setDistanceLimits(cameraConfig.minDistance, cameraConfig.maxDistance);
  controller.setPitchLimits(cameraConfig.minPitch, cameraConfig.maxPitch);

  if (cameraConfig.initialPosition) {
    const [x, y, z] = cameraConfig.initialPosition;
    controller.setInitialPosition(x, y, z);
  }
}

function onWindowResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w <= 0 || h <= 0) return;

  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

window.addEventListener("resize", onWindowResize);
if (typeof window.visualViewport !== "undefined") {
  window.visualViewport.addEventListener("resize", onWindowResize);
}
if (isIOS) {
  setTimeout(onWindowResize, 100);
}

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  for (const mixer of mixers) {
    mixer.update(delta);
  }

  cameraController.update();
  renderer.render(scene, camera);
}

animate();
