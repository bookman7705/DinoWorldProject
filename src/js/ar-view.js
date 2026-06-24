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

const debugMaterials = new URLSearchParams(window.location.search).get("debugMaterials") === "1";

const loader = new GLTFLoader();
const clock = new THREE.Clock();
let model = null;
let mixer = null;
let placed = false;
let baseScale = 0.1;

function updateScaleDisplay() {
  if (!model || !placed || !scaleEl) {
    return;
  }

  const percent = Math.round((model.scale.x / baseScale) * 100);
  scaleEl.textContent = `Scale: ${percent}%`;
  scaleEl.hidden = false;
}

statusEl.textContent = "Loading model...";
loadGltf(loader, selection.entry.modelFile, {
  onLoad: (gltf) => {
    model = gltf.scene;
    configureGltfMaterials(model, { debug: debugMaterials });
    baseScale = selection.entry.defaultScale || 0.1;
    model.scale.set(baseScale, baseScale, baseScale);
    model.visible = false;
    scene.add(model);

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
  if (!model || !reticle.visible) {
    return;
  }

  applyPoseToModel(reticle.matrix);
  model.visible = true;
  placed = true;
  updateScaleDisplay();
  statusEl.textContent = "Model placed. Swipe to move, pinch to scale, twist to rotate.";
});
scene.add(controller);

const worldUp = new THREE.Vector3(0, 1, 0);
const cameraDirection = new THREE.Vector3();
const cameraWorldPos = new THREE.Vector3();
const rightVector = new THREE.Vector3();
const forwardVector = new THREE.Vector3();
const tmpMatrix = new THREE.Matrix4();
const tmpPosition = new THREE.Vector3();
const tmpQuaternion = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpNormal = new THREE.Vector3();

const DRAG_DEAD_ZONE_PX = 12;
const ROTATE_DEAD_ZONE_RAD = 0.04;
const SCALE_DEAD_ZONE_RATIO = 0.015;
const DRAG_SENSITIVITY = 0.0035;
const PLANE_SNAP_XZ_RADIUS = 0.85;

const gesture = {
  singleTouch: false,
  twoFinger: false,
  moving: false,
  scaling: false,
  rotating: false,
  startScreenX: 0,
  startScreenY: 0,
  lastScreenX: 0,
  lastScreenY: 0,
  dragAccumPx: 0,
  lastDistance: 0,
  lastAngle: 0
};

function getActiveCamera() {
  return renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
}

function resetSingleTouchGesture(touch) {
  gesture.singleTouch = true;
  gesture.moving = false;
  gesture.dragAccumPx = 0;
  gesture.startScreenX = touch.pageX;
  gesture.startScreenY = touch.pageY;
  gesture.lastScreenX = touch.pageX;
  gesture.lastScreenY = touch.pageY;
}

function resetTwoFingerGesture(touches) {
  const metrics = getTouchMetrics(touches);
  gesture.twoFinger = true;
  gesture.singleTouch = false;
  gesture.moving = false;
  gesture.scaling = false;
  gesture.rotating = false;
  gesture.lastDistance = metrics.distance;
  gesture.lastAngle = metrics.angle;
}

function clearGestureState() {
  gesture.singleTouch = false;
  gesture.twoFinger = false;
  gesture.moving = false;
  gesture.scaling = false;
  gesture.rotating = false;
  gesture.dragAccumPx = 0;
}

function movementBlocked() {
  return gesture.twoFinger || gesture.scaling || gesture.rotating;
}

function getTouchMetrics(touches) {
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return {
    distance: Math.hypot(dx, dy),
    angle: Math.atan2(dy, dx)
  };
}

function normalizeAngle(angle) {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

function isHorizontalPoseFromMatrix(matrix) {
  matrix.decompose(tmpPosition, tmpQuaternion, tmpScale);
  tmpNormal.set(0, 1, 0).applyQuaternion(tmpQuaternion).normalize();
  return Math.abs(tmpNormal.dot(worldUp)) > 0.8;
}

function applyPoseToModel(matrix) {
  matrix.decompose(tmpPosition, tmpQuaternion, tmpScale);
  model.position.copy(tmpPosition);
  model.rotation.x = 0;
  model.rotation.z = 0;
}

function translateModelByScreenDelta(dx, dy) {
  const cam = getActiveCamera();
  cam.getWorldPosition(cameraWorldPos);
  cam.getWorldDirection(cameraDirection);
  cameraDirection.y = 0;

  if (cameraDirection.lengthSq() < 1e-6) {
    return;
  }

  cameraDirection.normalize();
  rightVector.crossVectors(worldUp, cameraDirection).normalize();
  forwardVector.crossVectors(rightVector, worldUp).normalize();

  const distance = cameraWorldPos.distanceTo(model.position);
  const moveScale = Math.max(0.001, distance * DRAG_SENSITIVITY);

  model.position.addScaledVector(rightVector, dx * moveScale);
  model.position.addScaledVector(forwardVector, -dy * moveScale);
}

function considerHorizontalHit(pose, modelPos, state) {
  if (!pose) {
    return;
  }

  tmpMatrix.fromArray(pose.transform.matrix);
  if (!isHorizontalPoseFromMatrix(tmpMatrix)) {
    return;
  }

  tmpMatrix.decompose(tmpPosition, tmpQuaternion, tmpScale);
  const dx = tmpPosition.x - modelPos.x;
  const dz = tmpPosition.z - modelPos.z;
  const distSq = dx * dx + dz * dz;
  const maxDistSq = PLANE_SNAP_XZ_RADIUS * PLANE_SNAP_XZ_RADIUS;

  if (distSq <= maxDistSq && distSq < state.bestDistSq) {
    state.bestDistSq = distSq;
    state.bestY = tmpPosition.y;
  }
}

function correctModelElevation(frame, localSpace) {
  if (!placed || !model || !gesture.moving || !localSpace) {
    return;
  }

  const state = { bestY: null, bestDistSq: PLANE_SNAP_XZ_RADIUS * PLANE_SNAP_XZ_RADIUS };
  const modelPos = model.position;

  if (hitTestSource) {
    for (const hit of frame.getHitTestResults(hitTestSource)) {
      considerHorizontalHit(hit.getPose(localSpace), modelPos, state);
    }
  }

  if (transientHitTestSource) {
    const transientResults = frame.getHitTestResultsForTransientInput(transientHitTestSource);
    for (const result of transientResults) {
      for (const hit of result.results) {
        considerHorizontalHit(hit.getPose(localSpace), modelPos, state);
      }
    }
  }

  if (state.bestY !== null) {
    model.position.y = state.bestY;
  }
}

window.addEventListener(
  "touchstart",
  (event) => {
    if (!placed || !model) {
      return;
    }

    if (event.touches.length === 1) {
      if (!gesture.twoFinger) {
        resetSingleTouchGesture(event.touches[0]);
      }
      return;
    }

    if (event.touches.length >= 2) {
      resetTwoFingerGesture(event.touches);
      event.preventDefault();
    }
  },
  { passive: false }
);

window.addEventListener(
  "touchmove",
  (event) => {
    if (!placed || !model) {
      return;
    }

    if (event.touches.length >= 2) {
      event.preventDefault();

      if (!gesture.twoFinger) {
        resetTwoFingerGesture(event.touches);
      }

      const metrics = getTouchMetrics(event.touches);
      const scaleFactor = metrics.distance / Math.max(gesture.lastDistance, 1);
      const angleDelta = normalizeAngle(metrics.angle - gesture.lastAngle);

      if (Math.abs(scaleFactor - 1) > SCALE_DEAD_ZONE_RATIO) {
        gesture.scaling = true;
      }

      if (Math.abs(angleDelta) > ROTATE_DEAD_ZONE_RAD) {
        gesture.rotating = true;
      }

      if (gesture.scaling) {
        const nextScale = THREE.MathUtils.clamp(model.scale.x * scaleFactor, 0.04, 2.5);
        model.scale.setScalar(nextScale);
        updateScaleDisplay();
      }

      if (gesture.rotating) {
        model.rotation.y -= angleDelta;
      }

      gesture.lastDistance = metrics.distance;
      gesture.lastAngle = metrics.angle;
      return;
    }

    if (event.touches.length !== 1 || !gesture.singleTouch || movementBlocked()) {
      return;
    }

    const touch = event.touches[0];
    const dx = touch.pageX - gesture.lastScreenX;
    const dy = touch.pageY - gesture.lastScreenY;

    if (dx === 0 && dy === 0) {
      return;
    }

    gesture.dragAccumPx += Math.hypot(dx, dy);

    if (!gesture.moving) {
      if (gesture.dragAccumPx < DRAG_DEAD_ZONE_PX) {
        return;
      }
      gesture.moving = true;
    }

    event.preventDefault();
    translateModelByScreenDelta(dx, dy);
    gesture.lastScreenX = touch.pageX;
    gesture.lastScreenY = touch.pageY;
  },
  { passive: false }
);

function handleTouchEnd(event) {
  if (!placed || !model) {
    return;
  }

  if (event.touches.length === 0) {
    clearGestureState();
    return;
  }

  if (event.touches.length === 1) {
    gesture.twoFinger = false;
    gesture.scaling = false;
    gesture.rotating = false;
    resetSingleTouchGesture(event.touches[0]);
    return;
  }

  if (event.touches.length >= 2) {
    resetTwoFingerGesture(event.touches);
  }
}

window.addEventListener("touchend", handleTouchEnd);
window.addEventListener("touchcancel", handleTouchEnd);

let viewerSpace = null;
let localSpace = null;
let hitTestSource = null;
let transientHitTestSource = null;

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

        session
          .requestHitTestSourceForTransientInput({
            profile: "generic-touchscreen",
            entityTypes: ["plane"]
          })
          .then((source) => {
            transientHitTestSource = source;
          })
          .catch(() => {
            transientHitTestSource = null;
          });
      });

      session.requestReferenceSpace("local").then((space) => {
        localSpace = space;
      });

      session.addEventListener("end", () => {
        viewerSpace = null;
        localSpace = null;
        hitTestSource = null;
        transientHitTestSource = null;
      });
    }

    if (hitTestSource && localSpace) {
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

      if (!placed) {
        if (horizontalPose) {
          reticle.visible = true;
          reticle.matrix.fromArray(horizontalPose.transform.matrix);
        } else {
          reticle.visible = false;
        }
      }

      correctModelElevation(frame, localSpace);
    }
  }

  renderer.render(scene, camera);
});
