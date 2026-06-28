import * as THREE from "three";

/** Minimum |normal·up| to treat a plane as horizontal. */
const HORIZONTAL_NORMAL_DOT = 0.85;

/** Start dragging after this many pixels of movement. */
export const DRAG_DEAD_ZONE_PX = 12;

/** Start rotating after this many radians of twist. */
export const ROTATE_DEAD_ZONE_RAD = 0.04;

/** Pinch scale must change by this ratio before scale mode activates. */
export const SCALE_DEAD_ZONE_RATIO = 0.015;

/** Fixed screen pixel → world meters. */
const PX_TO_WORLD = 0.0025;

/** Min / max uniform scale multiplier relative to placement scale. */
const MIN_SCALE = 0.04;
const MAX_SCALE = 10;

/** Max horizontal distance from model to accept a viewer hit-test plane at placement. */
const MAX_PLANE_XZ_RADIUS = 1.25;

/** Strong preference radius — plane directly under the model. */
const UNDER_MODEL_XZ_PREF = 0.5;

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

function scorePlaneCandidate(hitPos, modelPos) {
  const dx = hitPos.x - modelPos.x;
  const dz = hitPos.z - modelPos.z;
  const xzDist = Math.hypot(dx, dz);

  if (xzDist > MAX_PLANE_XZ_RADIUS) {
    return null;
  }

  const yDist = Math.abs(hitPos.y - modelPos.y);
  let score = xzDist * 4 + yDist;

  if (xzDist < UNDER_MODEL_XZ_PREF) {
    score *= 0.35;
  }

  return { score, x: hitPos.x, y: hitPos.y, z: hitPos.z };
}

export function getBestHorizontalPlane(hits, localSpace, modelPos) {
  let best = null;
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
    const scored = scorePlaneCandidate(tmpPosition, modelPos);
    if (!scored || scored.score >= bestScore) {
      continue;
    }

    bestScore = scored.score;
    best = scored;
  }

  return best;
}

export function lockGroundAtPlacement(frame, hitTestSource, localSpace, modelRoot) {
  if (!frame || !hitTestSource || !localSpace || !modelRoot) {
    return;
  }

  const hits = frame.getHitTestResults(hitTestSource);
  const plane = getBestHorizontalPlane(hits, localSpace, modelRoot.position);
  if (plane) {
    modelRoot.position.set(plane.x, plane.y, plane.z);
  }
}

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
    return;
  }
  camForward.normalize();
  camRight.crossVectors(worldUp, camForward).normalize();

  modelRoot.position.x += camRight.x * deltaX * PX_TO_WORLD + camForward.x * -deltaY * PX_TO_WORLD;
  modelRoot.position.z += camRight.z * deltaX * PX_TO_WORLD + camForward.z * -deltaY * PX_TO_WORLD;

  gesture.pendingDeltaX = 0;
  gesture.pendingDeltaY = 0;
}

function normalizeAngle(angle) {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

function resetTwoFingerAccumulators(gesture) {
  gesture.twoFingerMode = null;
  gesture.scaling = false;
  gesture.rotating = false;
  gesture.pendingScaleRatio = 1;
  gesture.pendingRotationRad = 0;
  gesture.rotateAccumRad = 0;
  gesture.startDistance = 0;
}

/** Clear two-finger scale/rotate mode when lifting a finger. */
export function clearTwoFingerGesture(gesture) {
  gesture.twoFinger = false;
  resetTwoFingerAccumulators(gesture);
}

/**
 * Record two-finger pinch or twist; picks one mode per gesture so scale and rotate do not fight.
 */
export function processTwoFingerGesture(
  gesture,
  metrics,
  {
    scaleDeadZoneRatio = SCALE_DEAD_ZONE_RATIO,
    rotateDeadZoneRad = ROTATE_DEAD_ZONE_RAD
  } = {}
) {
  const frameScaleRatio = metrics.distance / Math.max(gesture.lastDistance, 1);
  const angleDelta = normalizeAngle(metrics.angle - gesture.lastAngle);
  const totalScaleRatio = metrics.distance / Math.max(gesture.startDistance, 1);

  if (!gesture.twoFingerMode) {
    gesture.rotateAccumRad += Math.abs(angleDelta);

    if (Math.abs(totalScaleRatio - 1) > scaleDeadZoneRatio) {
      gesture.twoFingerMode = "scale";
      gesture.scaling = true;
    } else if (gesture.rotateAccumRad >= rotateDeadZoneRad) {
      gesture.twoFingerMode = "rotate";
      gesture.rotating = true;
    }
  }

  if (gesture.twoFingerMode === "scale") {
    gesture.pendingScaleRatio *= frameScaleRatio;
  } else if (gesture.twoFingerMode === "rotate" && angleDelta !== 0) {
    gesture.pendingRotationRad += angleDelta;
  }

  gesture.lastDistance = metrics.distance;
  gesture.lastAngle = metrics.angle;
}

export function applyScaleFromGesture(gesture, modelRoot) {
  if (!modelRoot || gesture.pendingScaleRatio === 1) {
    return false;
  }

  const nextScale = THREE.MathUtils.clamp(
    modelRoot.scale.x * gesture.pendingScaleRatio,
    MIN_SCALE,
    MAX_SCALE
  );
  modelRoot.scale.setScalar(nextScale);
  gesture.pendingScaleRatio = 1;
  return true;
}

export function applyRotationFromGesture(gesture, modelRoot) {
  if (!modelRoot || gesture.pendingRotationRad === 0) {
    return;
  }

  modelRoot.rotation.y -= gesture.pendingRotationRad;
  gesture.pendingRotationRad = 0;
}

/**
 * Apply gestured transform each frame: scale, rotate, drag.
 */
export function updateModelGrounding(modelRoot, gesture, camera) {
  if (!modelRoot) {
    return false;
  }

  const didScale = applyScaleFromGesture(gesture, modelRoot);
  applyRotationFromGesture(gesture, modelRoot);

  const dragging = Boolean(gesture?.dragging && !movementBlocked(gesture));
  if (dragging) {
    updateDragFromGesture(gesture, modelRoot, camera);
  }

  modelRoot.rotation.x = 0;
  modelRoot.rotation.z = 0;
  return didScale;
}

export function createGestureState() {
  return {
    singleTouch: false,
    twoFinger: false,
    twoFingerMode: null,
    dragging: false,
    scaling: false,
    rotating: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    pendingDeltaX: 0,
    pendingDeltaY: 0,
    pendingRotationRad: 0,
    pendingScaleRatio: 1,
    dragAccumPx: 0,
    rotateAccumRad: 0,
    startDistance: 0,
    lastDistance: 0,
    lastAngle: 0
  };
}

export function resetSingleTouch(gesture, touch) {
  gesture.singleTouch = true;
  gesture.twoFinger = false;
  resetTwoFingerAccumulators(gesture);
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
  gesture.dragAccumPx = 0;
  gesture.pendingDeltaX = 0;
  gesture.pendingDeltaY = 0;
  resetTwoFingerAccumulators(gesture);
  gesture.startDistance = metrics.distance;
  gesture.lastDistance = metrics.distance;
  gesture.lastAngle = metrics.angle;
}

export function clearGesture(gesture) {
  gesture.singleTouch = false;
  gesture.twoFinger = false;
  gesture.dragging = false;
  gesture.dragAccumPx = 0;
  gesture.pendingDeltaX = 0;
  gesture.pendingDeltaY = 0;
  resetTwoFingerAccumulators(gesture);
}

export function movementBlocked(gesture) {
  return gesture.twoFinger || gesture.scaling || gesture.rotating;
}

export function accumulateSingleTouchMove(gesture, touch) {
  if (movementBlocked(gesture)) {
    return false;
  }

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
