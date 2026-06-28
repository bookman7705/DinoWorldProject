import * as THREE from "three";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160/examples/jsm/loaders/GLTFLoader.js";
import { ARButton } from "https://cdn.jsdelivr.net/npm/three@0.160/examples/jsm/webxr/ARButton.js";
import { getModelFromQuery } from "./model-registry.js";
import { buildMenuBackUrl } from "./menu-navigation.js";
import { loadGltf } from "./gltf-loader.js";
import { playModelAnimation } from "./gltf-animations.js";
import {
  configureGltfMaterials,
  configureGltfRenderer,
  setupArSceneLighting
} from "./gltf-materials.js";
import { CONTACT_SHADOW_ENABLED, createContactShadow } from "./ar-contact-shadow.js";
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
  updateModelGrounding
} from "./ar-surface-drag.js";

const statusEl = document.getElementById("ar-status");
const helpEl = document.getElementById("ar-help");
const titleEl = document.getElementById("ar-model-name");
const scaleEl = document.getElementById("ar-scale");
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

titleEl.textContent = selection.entry.label;

if (!navigator.xr) {
  statusEl.textContent = "WebXR not found on this device/browser.";
  helpEl.textContent = "Use a supported Android browser with WebXR enabled.";
  throw new Error("WebXR unavailable");
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
configureGltfRenderer(renderer, { exposure: 1.2 });
document.body.appendChild(renderer.domElement);
renderer.domElement.style.touchAction = "none";

const touchTarget = renderer.domElement;

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
});

setupArSceneLighting(scene);

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
  if (!modelRoot || !placed || !scaleEl) {
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
    baseScale = selection.entry.defaultScale || 0.1;
    modelRoot.scale.set(baseScale, baseScale, baseScale);
    modelRoot.visible = false;
    if (CONTACT_SHADOW_ENABLED) {
      modelRoot.add(createContactShadow(model, renderer));
    }
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
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return {
    distance: Math.hypot(dx, dy),
    angle: Math.atan2(dy, dx)
  };
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

// --- Layer 1: touch input state only (no raycasts / hit tests) ---

touchTarget.addEventListener(
  "touchstart",
  (event) => {
    if (!placed || !model) {
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
  },
  { passive: false }
);

touchTarget.addEventListener(
  "touchmove",
  (event) => {
    if (!placed || !model) {
      return;
    }

    if (event.touches.length >= 2) {
      event.preventDefault();

      if (!gesture.twoFinger) {
        resetTwoFinger(gesture, event.touches, getTouchMetrics);
      }

      const metrics = getTouchMetrics(event.touches);
      processTwoFingerGesture(gesture, metrics);
      return;
    }

    if (event.touches.length !== 1 || !gesture.singleTouch || movementBlocked(gesture)) {
      return;
    }

    const didMove = accumulateSingleTouchMove(gesture, event.touches[0]);
    if (didMove) {
      event.preventDefault();
    }
  },
  { passive: false }
);

function handleTouchEnd(event) {
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

touchTarget.addEventListener("touchend", handleTouchEnd);
touchTarget.addEventListener("touchcancel", handleTouchEnd);

// --- Layer 2: world updates (animation loop only) ---

let viewerSpace = null;
let localSpace = null;
let hitTestSource = null;

renderer.setAnimationLoop((_, frame) => {
  if (mixer) {
    mixer.update(clock.getDelta());
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
        helpEl.hidden = false;
      });
    }

    if (localSpace) {
      if (!placed && hitTestSource) {
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
      } else if (placed && modelRoot) {
        reticle.visible = false;

        if (needsGroundLock && hitTestSource) {
          lockGroundAtPlacement(frame, hitTestSource, localSpace, modelRoot);
          needsGroundLock = false;
        }

        if (updateModelGrounding(modelRoot, gesture, getActiveCamera())) {
          updateScaleDisplay();
        }
      }
    }
  }

  renderer.render(scene, camera);
});
