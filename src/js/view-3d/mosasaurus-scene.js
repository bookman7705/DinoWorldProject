import * as THREE from "three";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160/examples/jsm/loaders/GLTFLoader.js";
import { loadGltf } from "../gltf-loader.js";
import { isAltDownloadSourceEnabled } from "../alt-download-settings.js";
import { loadGltfViaAltDownload } from "../alt-gltf-loader.js";
import { configureGltfMaterials, configureGltfRenderer } from "../gltf-materials.js";
import { playModelAnimation } from "../gltf-animations.js";
import { CameraController } from "./camera-controller.js";
import { createUnderwaterEnvironment } from "./underwater-environment.js";

const MOSA_FOV = 45;
const MOSA_FAR = 200;
const RENDERER_EXPOSURE = 1.55;

export function initMosasaurusView({ selection, view3dConfig, statusEl }) {
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a2840);
  scene.fog = new THREE.FogExp2(0x0a2840, 0.018);

  const initialW = window.innerWidth || 1;
  const initialH = window.innerHeight || 1;
  const camera = new THREE.PerspectiveCamera(MOSA_FOV, initialW / initialH, 0.1, MOSA_FAR);

  const renderer = new THREE.WebGLRenderer({
    antialias: !isIOS,
    alpha: false,
    powerPreference: isIOS ? "low-power" : "high-performance",
    failIfMajorPerformanceCrisis: false,
  });
  const pixelRatio = isIOS ? Math.min(window.devicePixelRatio, 2) : Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x0a2840, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  configureGltfRenderer(renderer, { exposure: RENDERER_EXPOSURE });

  const canvas = renderer.domElement;
  canvas.style.webkitTransform = "translateZ(0)";
  document.body.appendChild(canvas);

  const cameraController = new CameraController(camera, canvas);
  applyCameraConfig(cameraController, view3dConfig.camera);

  const loader = new GLTFLoader();
  const clock = new THREE.Clock();
  const mixers = [];
  let environment = null;

  statusEl.textContent = "Loading underwater scene...";

  createUnderwaterEnvironment(scene)
    .then((env) => {
      environment = env;
      statusEl.textContent = "Loading Mosasaurus...";
      loadMosasaurus();
    })
    .catch(() => {
      statusEl.textContent = "Environment load failed. Check that water-scene assets are available.";
    });

  function loadModelFile(modelFilename, { onLoad, onError, fileIndex, fileCount }) {
    if (isAltDownloadSourceEnabled()) {
      loadGltfViaAltDownload(loader, modelFilename, { fileIndex, fileCount })
        .then(({ gltf }) => onLoad(gltf))
        .catch((error) => onError?.(error));
      return;
    }

    loadGltf(loader, modelFilename, { onLoad, onError });
  }

  function loadMosasaurus() {
    loadModelFile(selection.entry.modelFile, {
      fileIndex: 1,
      fileCount: 1,
      onLoad: (gltf) => {
        const model = gltf.scene;
        configureGltfMaterials(model);
        applyTransform(model, view3dConfig);

        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        scene.add(model);
        addMosasaurusSpotlight(scene, view3dConfig.spotlightTarget ?? view3dConfig.camera.target);

        if (gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(model);
          playModelAnimation(mixer, gltf.animations, selection.entry.animation);
          mixers.push(mixer);
        }

        statusEl.textContent = "";
      },
      onError: () => {
        statusEl.textContent = "Model load failed. Check network access and Cloudflare model hosting.";
      },
    });
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
    const elapsed = clock.elapsedTime;

    if (environment) {
      environment.update(elapsed, delta);
    }

    for (const mixer of mixers) {
      mixer.update(delta);
    }

    cameraController.update();
    renderer.render(scene, camera);
  }

  animate();
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

function addMosasaurusSpotlight(targetScene, target) {
  const [tx, ty, tz] = target;
  const spotlightTarget = new THREE.Object3D();
  spotlightTarget.position.set(tx, ty, tz);
  targetScene.add(spotlightTarget);

  const spotlight = new THREE.SpotLight(0xd0eeff, 6, 50, Math.PI / 4, 0.4, 1.2);
  spotlight.position.set(tx + 4, ty + 9, tz + 6);
  spotlight.target = spotlightTarget;
  spotlight.castShadow = false;
  targetScene.add(spotlight);
}
