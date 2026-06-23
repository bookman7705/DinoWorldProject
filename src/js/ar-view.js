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
const backBtn = document.getElementById("back-btn");

backBtn.addEventListener("click", () => {
  window.location.href = buildMenuBackUrl(window.location.search).toString();
});

const selection = getModelFromQuery(window.location.search);
if (!selection.entry) {
  statusEl.textContent = `Invalid model ID "${selection.id || ""}". Use a valid id like ?id=allosaurus.`;
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

statusEl.textContent = "Loading model...";
loadGltf(loader, selection.entry.modelFile, {
  onLoad: (gltf) => {
    model = gltf.scene;
    configureGltfMaterials(model, { debug: debugMaterials });
    const scale = selection.entry.defaultScale || 0.1;
    model.scale.set(scale, scale, scale);
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
  statusEl.textContent = "Model placed. Drag to move, pinch to scale, twist to rotate.";
});
scene.add(controller);

const worldUp = new THREE.Vector3(0, 1, 0);
const tmpMatrix = new THREE.Matrix4();
const tmpPosition = new THREE.Vector3();
const tmpQuaternion = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpNormal = new THREE.Vector3();
const gesture = {
  dragging: false,
  scalingRotating: false,
  lastDistance: 0,
  lastAngle: 0
};

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

window.addEventListener(
  "touchstart",
  (event) => {
    if (!placed || !model) return;

    if (event.touches.length === 1) {
      gesture.dragging = true;
      gesture.scalingRotating = false;
      return;
    }

    if (event.touches.length === 2) {
      const metrics = getTouchMetrics(event.touches);
      gesture.dragging = false;
      gesture.scalingRotating = true;
      gesture.lastDistance = metrics.distance;
      gesture.lastAngle = metrics.angle;
      event.preventDefault();
    }
  },
  { passive: false }
);

window.addEventListener(
  "touchmove",
  (event) => {
    if (!placed || !model) return;

    if (event.touches.length !== 2 || !gesture.scalingRotating) return;
    event.preventDefault();

    const metrics = getTouchMetrics(event.touches);
    const scaleFactor = metrics.distance / Math.max(gesture.lastDistance, 1);
    const nextScale = THREE.MathUtils.clamp(model.scale.x * scaleFactor, 0.04, 2.5);
    model.scale.setScalar(nextScale);

    const angleDelta = normalizeAngle(metrics.angle - gesture.lastAngle);
    model.rotation.y -= angleDelta;

    gesture.lastDistance = metrics.distance;
    gesture.lastAngle = metrics.angle;
  },
  { passive: false }
);

window.addEventListener("touchend", () => {
  gesture.dragging = false;
  gesture.scalingRotating = false;
});
window.addEventListener("touchcancel", () => {
  gesture.dragging = false;
  gesture.scalingRotating = false;
});

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

      if (placed && gesture.dragging) {
        let dragPose = null;

        if (transientHitTestSource) {
          const transientResults = frame.getHitTestResultsForTransientInput(transientHitTestSource);
          for (const result of transientResults) {
            for (const hit of result.results) {
              const pose = hit.getPose(localSpace);
              if (!pose) continue;
              tmpMatrix.fromArray(pose.transform.matrix);
              if (isHorizontalPoseFromMatrix(tmpMatrix)) {
                dragPose = pose;
                break;
              }
            }
            if (dragPose) break;
          }
        }

        if (!dragPose && horizontalPose) {
          dragPose = horizontalPose;
        }

        if (dragPose) {
          tmpMatrix.fromArray(dragPose.transform.matrix);
          applyPoseToModel(tmpMatrix);
        }
      }
    }
  }

  renderer.render(scene, camera);
});
