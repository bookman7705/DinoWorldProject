import * as THREE from "three";

/** Minimum |normal·up| to treat a plane as horizontal. */
const HORIZONTAL_NORMAL_DOT = 0.85;

/** Start dragging after this many pixels of movement. */
export const DRAG_DEAD_ZONE_PX = 12;

/** Begin Y snap when model height differs from detected plane by this much. */
const SURFACE_SNAP_THRESHOLD = 0.06;

/** Y interpolation factor toward detected surfaces. */
const SURFACE_Y_LERP = 0.2;

/** Gentle XZ bias toward plane hit under the model (does not override drag). */
const XZ_STABILIZE_LERP = 0.08;

/** Max horizontal distance from model to accept a viewer hit-test plane. */
const MAX_PLANE_XZ_RADIUS = 1.25;

const worldUp = new THREE.Vector3(0, 1, 0);
const tmpMatrix = new THREE.Matrix4();
const tmpPosition = new THREE.Vector3();
const tmpQuaternion = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpNormal = new THREE.Vector3();
const camRight = new THREE.Vector3();
const camForward = new THREE.Vector3();

function isHorizontalPoseFromMatrix(matrix) {
  matrix.decompose(tmpPosition, tmpQuaternion, tmpScale);
  tmpNormal.set(0, 1, 0).applyQuaternion(tmpQuaternion).normalize();
  return Math.abs(tmpNormal.dot(worldUp)) > HORIZONTAL_NORMAL_DOT;
}

/**
 * Pick the best horizontal plane near the model from viewer hit-test results.
 * Prefers the smallest vertical distance to the model (stable table / floor snap).
 */
export function getBestHorizontalPlane(hits, localSpace, modelPos) {
  let bestPlane = null;
  let bestScore = Infinity;

  for (const hit of hits) {
    const pose = hit.getPose(localSpace);
    if (!pose) {
      continue;
    }

    tmpMatrix.fromArray(pose.transform.matrix);
    if (!isHorizontalPoseFromMatrix(tmpMatrix)) {
      continue;
    }

    tmpMatrix.decompose(tmpPosition, tmpQuaternion, tmpScale);

    const dx = tmpPosition.x - modelPos.x;
    const dz = tmpPosition.z - modelPos.z;
    const xzDist = Math.hypot(dx, dz);
    if (xzDist > MAX_PLANE_XZ_RADIUS) {
      continue;
    }

    const yDist = Math.abs(tmpPosition.y - modelPos.y);
    const score = yDist + xzDist * 0.35;

    if (score < bestScore) {
      bestScore = score;
      bestPlane = {
        x: tmpPosition.x,
        y: tmpPosition.y,
        z: tmpPosition.z
      };
    }
  }

  return bestPlane;
}

/**
 * Apply accumulated screen-space drag as camera-aligned movement on the XZ plane.
 * Called only from the XR animation loop.
 */
export function updateDragFromGesture(gesture, modelRoot, camera) {
  if (!gesture.dragging || !modelRoot) {
    return;
  }

  const deltaX = gesture.pendingDeltaX;
  const deltaY = gesture.pendingDeltaY;
  if (deltaX === 0 && deltaY === 0) {
    return;
  }

  camera.getWorldDirection(camForward);
  camForward.y = 0;
  if (camForward.lengthSq() < 1e-8) {
    gesture.pendingDeltaX = 0;
    gesture.pendingDeltaY = 0;
    return;
  }
  camForward.normalize();
  camRight.crossVectors(worldUp, camForward).normalize();

  const dist = camera.position.distanceTo(modelRoot.position);
  const pxToWorld = Math.max(dist * 0.00045, 0.0003);

  modelRoot.position.addScaledVector(camRight, deltaX * pxToWorld);
  modelRoot.position.addScaledVector(camForward, -deltaY * pxToWorld);

  gesture.pendingDeltaX = 0;
  gesture.pendingDeltaY = 0;

  modelRoot.rotation.x = 0;
  modelRoot.rotation.z = 0;
}

/**
 * Snap model height (and lightly stabilize XZ) using viewer hit-test planes only.
 */
export function updateSurfaceSnap(frame, hitTestSource, localSpace, modelRoot, { dragging = false } = {}) {
  if (!frame || !hitTestSource || !localSpace || !modelRoot) {
    return;
  }

  if (!dragging) {
    return;
  }

  const hits = frame.getHitTestResults(hitTestSource);
  const plane = getBestHorizontalPlane(hits, localSpace, modelRoot.position);
  if (!plane) {
    return;
  }

  const yDiff = Math.abs(modelRoot.position.y - plane.y);
  if (yDiff > SURFACE_SNAP_THRESHOLD) {
    modelRoot.position.y = THREE.MathUtils.lerp(modelRoot.position.y, plane.y, SURFACE_Y_LERP);
  }

  const xzDist = Math.hypot(plane.x - modelRoot.position.x, plane.z - modelRoot.position.z);
  if (xzDist < 0.45) {
    modelRoot.position.x = THREE.MathUtils.lerp(modelRoot.position.x, plane.x, XZ_STABILIZE_LERP);
    modelRoot.position.z = THREE.MathUtils.lerp(modelRoot.position.z, plane.z, XZ_STABILIZE_LERP);
  }
}

/**
 * Create empty gesture state (touch input layer only).
 */
export function createGestureState() {
  return {
    singleTouch: false,
    twoFinger: false,
    dragging: false,
    scaling: false,
    rotating: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    pendingDeltaX: 0,
    pendingDeltaY: 0,
    dragAccumPx: 0,
    lastDistance: 0,
    lastAngle: 0
  };
}

export function resetSingleTouch(gesture, touch) {
  gesture.singleTouch = true;
  gesture.twoFinger = false;
  gesture.dragging = false;
  gesture.dragAccumPx = 0;
  gesture.pendingDeltaX = 0;
  gesture.pendingDeltaY = 0;
  gesture.startX = touch.clientX;
  gesture.startY = touch.clientY;
  gesture.lastX = touch.clientX;
  gesture.lastY = touch.clientY;
}

export function resetTwoFinger(gesture, touches, getTouchMetrics) {
  const metrics = getTouchMetrics(touches);
  gesture.twoFinger = true;
  gesture.singleTouch = false;
  gesture.dragging = false;
  gesture.scaling = false;
  gesture.rotating = false;
  gesture.pendingDeltaX = 0;
  gesture.pendingDeltaY = 0;
  gesture.lastDistance = metrics.distance;
  gesture.lastAngle = metrics.angle;
}

export function clearGesture(gesture) {
  gesture.singleTouch = false;
  gesture.twoFinger = false;
  gesture.dragging = false;
  gesture.scaling = false;
  gesture.rotating = false;
  gesture.dragAccumPx = 0;
  gesture.pendingDeltaX = 0;
  gesture.pendingDeltaY = 0;
}

export function movementBlocked(gesture) {
  return gesture.twoFinger || gesture.scaling || gesture.rotating;
}

/**
 * Record screen movement during a single-finger gesture (no world mutation).
 */
export function accumulateSingleTouchMove(gesture, touch) {
  const dx = touch.clientX - gesture.lastX;
  const dy = touch.clientY - gesture.lastY;
  if (dx === 0 && dy === 0) {
    return false;
  }

  gesture.dragAccumPx += Math.hypot(dx, dy);

  if (!gesture.dragging) {
    if (gesture.dragAccumPx < DRAG_DEAD_ZONE_PX) {
      gesture.lastX = touch.clientX;
      gesture.lastY = touch.clientY;
      return false;
    }
    gesture.dragging = true;
  }

  gesture.pendingDeltaX += dx;
  gesture.pendingDeltaY += dy;
  gesture.lastX = touch.clientX;
  gesture.lastY = touch.clientY;
  return true;
}
