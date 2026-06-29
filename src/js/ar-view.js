import * as THREE from "three";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160/examples/jsm/loaders/GLTFLoader.js";
import { ARButton } from "https://cdn.jsdelivr.net/npm/three@0.160/examples/jsm/webxr/ARButton.js";
import { getModelFromQuery } from "./model-registry.js";
import { buildMenuBackUrl } from "./menu-navigation.js";
import { isDebugMode } from "./debug.js";
import { loadGltf } from "./gltf-loader.js";
import { playModelAnimation } from "./gltf-animations.js";
import {
  configureGltfMaterials,
  configureGltfRenderer,
  setupArSceneLighting
} from "./gltf-materials.js";
import {
  accumulateSingleTouchMove,
  clearGesture,
  clearTwoFingerGesture,
  createGestureState,
  lockGroundAtPlacement,
  movementBlocked,
  processTwoFingerGesture,
  resetSingleTouch,
  resetTwoFinger,
  getTwoFingerMetricsFromTouchList,
  updateModelGrounding
} from "./ar-surface-drag.js";

const statusEl = document.getElementById("ar-status");
const helpEl = document.getElementById("ar-help");
const titleEl = document.getElementById("ar-model-name");
const scaleEl = document.getElementById("ar-scale");
const backBtn = document.getElementById("back-btn");
const touchLayer = document.getElementById("ar-touch-layer");
const copyUrlBtn = document.getElementById("copy-ar-url-btn");
const debugMode = isDebugMode(window.location.search);

if (scaleEl && !debugMode) {
  scaleEl.hidden = true;
}

backBtn.addEventListener("click", () => {
  window.location.href = buildMenuBackUrl(window.location.search).toString();
});

async function isImmersiveArSupported() {
  if (!navigator.xr) {
    return false;
  }

  try {
    return await navigator.xr.isSessionSupported("immersive-ar");
  } catch {
    return false;
  }
}

async function copyPageUrlToClipboard() {
  const url = window.location.href;

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return;
  }

  const input = document.createElement("textarea");
  input.value = url;
  input.setAttribute("readonly", "");
  input.style.cssText = "position:fixed;left:-9999px;top:0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  document.body.removeChild(input);
}

function showUnsupportedArBrowser() {
  statusEl.textContent = "AR is not available in this browser.";
  helpEl.textContent =
    "Try opening this link in Google Chrome on your phone or tablet.";
  if (copyUrlBtn) {
    copyUrlBtn.hidden = false;
  }
}

copyUrlBtn?.addEventListener("click", async () => {
  const defaultLabel = copyUrlBtn.textContent;

  try {
    await copyPageUrlToClipboard();
    copyUrlBtn.textContent = "Link copied!";
    setTimeout(() => {
      copyUrlBtn.textContent = defaultLabel;
    }, 2000);
  } catch {
    statusEl.textContent = "Could not copy link. Copy the address bar manually.";
  }
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

titleEl.textContent = selection.entry.label;

if (!(await isImmersiveArSupported())) {
  showUnsupportedArBrowser();
  throw new Error("WebXR unavailable");
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
configureGltfRenderer(renderer, { exposure: 1.2 });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
renderer.domElement.style.touchAction = "none";

function setGestureInputActive(active) {
  if (touchLayer) {
    touchLayer.classList.toggle("is-active", active);
  }
}

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/** Key light offset from the model anchor — preserves the original rig direction. */
const KEY_LIGHT_OFFSET = new THREE.Vector3(5, 10, 5);
const { keyLight, keyLightTarget } = setupArSceneLighting(scene);

// Invisible floor patch that only shows the key light's shadow.
const shadowPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(4, 4),
  new THREE.ShadowMaterial({ opacity: 0.45 })
);
shadowPlane.rotation.x = -Math.PI / 2;
shadowPlane.receiveShadow = true;
shadowPlane.castShadow = false;
shadowPlane.visible = false;
scene.add(shadowPlane);

function updateShadowReceiverAndKeyLight() {
  if (!placed || !modelRoot) {
    return;
  }

  const { x, y, z } = modelRoot.position;

  // Sit flush on the hit-test floor, centered under the model anchor.
  shadowPlane.position.set(x, y + 0.002, z);

  // Keep key direction fixed relative to the model (not the world origin).
  keyLightTarget.position.set(x, y, z);
  keyLight.position.set(
    x + KEY_LIGHT_OFFSET.x,
    y + KEY_LIGHT_OFFSET.y,
    z + KEY_LIGHT_OFFSET.z
  );
  keyLight.shadow.camera.updateProjectionMatrix();
}

const reticle = new THREE.Mesh(
  new THREE.RingGeometry(0.12, 0.16, 32).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x3bff8f })
);
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);

const debugMaterials = false;

const loader = new GLTFLoader();
const clock = new THREE.Clock();
let modelRoot = null;
let model = null;
let mixer = null;
let placed = false;
let baseScale = 0.1;
let needsGroundLock = false;

function updateScaleDisplay() {
  if (!debugMode || !modelRoot || !placed || !scaleEl) {
    return;
  }

  const percent = Math.round((modelRoot.scale.x / baseScale) * 100);
  scaleEl.textContent = `Scale: ${percent}%`;
  scaleEl.hidden = false;
}

statusEl.textContent = "Loading model...";
loadGltf(loader, selection.entry.modelFile, {
  onLoad: (gltf) => {
    modelRoot = new THREE.Group();
    model = gltf.scene;
    configureGltfMaterials(model, { debug: debugMaterials });
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
      }
    });
    baseScale = selection.entry.defaultScale || 0.1;
    modelRoot.scale.set(baseScale, baseScale, baseScale);
    modelRoot.visible = false;
    modelRoot.add(model);
    scene.add(modelRoot);

    if (gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(model);
      playModelAnimation(mixer, gltf.animations, selection.entry.animation);
    }

    statusEl.textContent = "Move phone to find a flat surface.";
  },
  onError: () => {
    statusEl.textContent = "Model load failed. Check network access and Cloudflare model hosting.";
  }
});

document.body.appendChild(
  ARButton.createButton(renderer, {
    requiredFeatures: ["hit-test"],
    optionalFeatures: ["dom-overlay"],
    domOverlay: { root: document.getElementById("ar-overlay") }
  })
);

const controller = renderer.xr.getController(0);
controller.addEventListener("select", () => {
  if (!modelRoot || placed || !reticle.visible) {
    return;
  }

  applyPoseToModel(reticle.matrix);
  modelRoot.visible = true;
  placed = true;
  needsGroundLock = true;
  shadowPlane.visible = true;
  updateShadowReceiverAndKeyLight();
  setGestureInputActive(true);
  reticle.visible = false;
  helpEl.hidden = true;
  updateScaleDisplay();
  statusEl.textContent = "Swipe to move. Pinch to scale. Twist to rotate.";
});
scene.add(controller);

const tmpMatrix = new THREE.Matrix4();
const tmpPosition = new THREE.Vector3();
const tmpQuaternion = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpNormal = new THREE.Vector3();
const worldUp = new THREE.Vector3(0, 1, 0);

const gesture = createGestureState();

function getActiveCamera() {
  return renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
}

function getTouchMetrics(touches) {
  return getTwoFingerMetricsFromTouchList(touches);
}

function isHorizontalPoseFromMatrix(matrix) {
  matrix.decompose(tmpPosition, tmpQuaternion, tmpScale);
  tmpNormal.set(0, 1, 0).applyQuaternion(tmpQuaternion).normalize();
  return Math.abs(tmpNormal.dot(worldUp)) > 0.8;
}

function applyPoseToModel(matrix) {
  matrix.decompose(tmpPosition, tmpQuaternion, tmpScale);
  modelRoot.position.copy(tmpPosition);
  modelRoot.rotation.x = 0;
  modelRoot.rotation.z = 0;
}

// --- Layer 1: touch input on dom-overlay layer (WebXR canvas does not receive touches) ---

function onTouchStart(event) {
  if (!placed || !model) {
    return;
  }

  if (event.target.closest(".overlay-btn")) {
    return;
  }

  if (event.touches.length === 1) {
    if (!gesture.twoFinger && !gesture.singleTouch) {
      resetSingleTouch(gesture, event.touches[0]);
    }
    return;
  }

  if (event.touches.length >= 2) {
    resetTwoFinger(gesture, event.touches, getTouchMetrics);
    event.preventDefault();
  }
}

function onTouchMove(event) {
  if (!placed || !model) {
    return;
  }

  if (event.touches.length >= 2) {
    event.preventDefault();

    if (!gesture.twoFinger) {
      resetTwoFinger(gesture, event.touches, getTouchMetrics);
    }

    processTwoFingerGesture(gesture, getTouchMetrics(event.touches));
    return;
  }

  if (gesture.twoFinger) {
    return;
  }

  if (event.touches.length !== 1 || !gesture.singleTouch || movementBlocked(gesture)) {
    return;
  }

  if (accumulateSingleTouchMove(gesture, event.touches[0])) {
    event.preventDefault();
  }
}

function onTouchEnd(event) {
  if (!placed || !model) {
    return;
  }

  if (event.touches.length === 0) {
    clearGesture(gesture);
    return;
  }

  if (event.touches.length === 1) {
    clearTwoFingerGesture(gesture);
    if (!gesture.singleTouch) {
      resetSingleTouch(gesture, event.touches[0]);
    }
    return;
  }

  if (event.touches.length >= 2) {
    resetTwoFinger(gesture, event.touches, getTouchMetrics);
  }
}

document.addEventListener("touchstart", onTouchStart, { passive: false, capture: true });
document.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
document.addEventListener("touchend", onTouchEnd, { passive: false, capture: true });
document.addEventListener("touchcancel", onTouchEnd, { passive: false, capture: true });

// --- Layer 2: world updates (animation loop only) ---

let viewerSpace = null;
let localSpace = null;
let hitTestSource = null;

renderer.setAnimationLoop((_, frame) => {
  if (mixer) {
    mixer.update(clock.getDelta());
  }

  if (placed && modelRoot) {
    if (frame && needsGroundLock && hitTestSource && localSpace) {
      lockGroundAtPlacement(frame, hitTestSource, localSpace, modelRoot);
      needsGroundLock = false;
    }

    if (updateModelGrounding(modelRoot, gesture, getActiveCamera())) {
      updateScaleDisplay();
    }

    updateShadowReceiverAndKeyLight();
  }

  if (frame) {
    const session = renderer.xr.getSession();
    if (!viewerSpace) {
      session.requestReferenceSpace("viewer").then((space) => {
        viewerSpace = space;
        session
          .requestHitTestSource({ space: viewerSpace, entityTypes: ["plane"] })
          .then((source) => {
            hitTestSource = source;
          });
      });

      session.requestReferenceSpace("local").then((space) => {
        localSpace = space;
      });

      session.addEventListener("end", () => {
        viewerSpace = null;
        localSpace = null;
        hitTestSource = null;
        needsGroundLock = false;
        placed = false;
        shadowPlane.visible = false;
        setGestureInputActive(false);
        helpEl.hidden = false;
      });
    }

    if (localSpace && !placed && hitTestSource) {
      const hits = frame.getHitTestResults(hitTestSource);
      let horizontalPose = null;

      for (const hit of hits) {
        const pose = hit.getPose(localSpace);
        if (!pose) continue;
        tmpMatrix.fromArray(pose.transform.matrix);
        if (isHorizontalPoseFromMatrix(tmpMatrix)) {
          horizontalPose = pose;
          break;
        }
      }

      if (horizontalPose) {
        reticle.visible = true;
        reticle.matrix.fromArray(horizontalPose.transform.matrix);
      } else {
        reticle.visible = false;
      }
    } else if (placed) {
      reticle.visible = false;
    }
  }

  renderer.render(scene, camera);
});
