import * as THREE from "three";

/** Minimum |normal·up| to treat a plane as horizontal. */
const HORIZONTAL_NORMAL_DOT = 0.85;

/** Start dragging after this many pixels of movement. */
export const DRAG_DEAD_ZONE_PX = 12;

/** Fixed screen pixel → world meters. */
const PX_TO_WORLD = 0.001;

/** Max horizontal distance from model to accept a viewer hit-test plane. */
const MAX_PLANE_XZ_RADIUS = 1.25;

/** Strong preference radius — plane directly under the model. */
const UNDER_MODEL_XZ_PREF = 0.5;

/** Frames a candidate must repeat before committing to the anchor. */
const STABILITY_FRAMES_REQUIRED = 3;

/** Max distance (m) to treat consecutive candidates as the same plane. */
const CANDIDATE_MATCH_DIST = 0.12;

/** Frames without hits before anchor validity decays. */
const ANCHOR_DECAY_AGE = 90;

/** Full-position lerp toward the surface anchor. */
const ANCHOR_POSITION_LERP = 0.15;

/** Slower lerp when switching between surfaces (table → floor). */
const SURFACE_CHANGE_LERP = 0.1;

/** Y delta (m) that counts as a surface change. */
const SURFACE_CHANGE_Y = 0.2;

const worldUp = new THREE.Vector3(0, 1, 0);
const tmpMatrix = new THREE.Matrix4();
const tmpPosition = new THREE.Vector3();
const tmpQuaternion = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpNormal = new THREE.Vector3();
const camRight = new THREE.Vector3();
const camForward = new THREE.Vector3();
const anchorTarget = new THREE.Vector3();

/** Persistent ground anchor — survives sparse Android hit-test frames. */
export const surfaceAnchor = {
  x: 0,
  y: 0,
  z: 0,
  valid: false,
  age: 0
};

/** Internal stability tracker for noisy Android plane hits. */
const stability = {
  x: 0,
  y: 0,
  z: 0,
  frames: 0
};

function isHorizontalPoseFromMatrix(matrix) {
  matrix.decompose(tmpPosition, tmpQuaternion, tmpScale);
  tmpNormal.set(0, 1, 0).applyQuaternion(tmpQuaternion).normalize();
  return Math.abs(tmpNormal.dot(worldUp)) > HORIZONTAL_NORMAL_DOT;
}

function candidateDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * Score horizontal planes: XZ distance under model first, then Y difference.
 */
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

  return { score, xzDist, yDist, x: hitPos.x, y: hitPos.y, z: hitPos.z };
}

/**
 * Pick the best horizontal plane near the model from viewer hit-test results.
 */
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

/**
 * Update persistent anchor using stability bias (reject one-frame Android noise).
 */
export function updateSurfaceAnchorFromHits(
  hits,
  localSpace,
  modelPos,
  { forceImmediate = false, preserveModelXZ = false } = {}
) {
  const candidate = getBestHorizontalPlane(hits, localSpace, modelPos);

  if (!candidate) {
    surfaceAnchor.age += 1;
    if (surfaceAnchor.age > ANCHOR_DECAY_AGE) {
      surfaceAnchor.valid = false;
    }
    return false;
  }

  surfaceAnchor.age = 0;

  const stablePoint = { x: candidate.x, y: candidate.y, z: candidate.z };
  const distToStable = candidateDistance(stablePoint, stability);

  if (distToStable < CANDIDATE_MATCH_DIST) {
    stability.frames += 1;
    stability.x = THREE.MathUtils.lerp(stability.x, candidate.x, 0.45);
    stability.y = THREE.MathUtils.lerp(stability.y, candidate.y, 0.45);
    stability.z = THREE.MathUtils.lerp(stability.z, candidate.z, 0.45);
  } else {
    stability.frames = 1;
    stability.x = candidate.x;
    stability.y = candidate.y;
    stability.z = candidate.z;
  }

  const ready = forceImmediate || stability.frames >= STABILITY_FRAMES_REQUIRED || !surfaceAnchor.valid;
  if (!ready) {
    return false;
  }

  const wasValid = surfaceAnchor.valid;
  const prevY = surfaceAnchor.y;

  surfaceAnchor.x = preserveModelXZ ? modelPos.x : stability.x;
  surfaceAnchor.y = stability.y;
  surfaceAnchor.z = preserveModelXZ ? modelPos.z : stability.z;
  surfaceAnchor.valid = true;
  surfaceAnchor.surfaceChanged = wasValid && Math.abs(surfaceAnchor.y - prevY) > SURFACE_CHANGE_Y;
  return true;
}

export function resetSurfaceAnchor() {
  surfaceAnchor.x = 0;
  surfaceAnchor.y = 0;
  surfaceAnchor.z = 0;
  surfaceAnchor.valid = false;
  surfaceAnchor.age = 0;
  surfaceAnchor.surfaceChanged = false;
  stability.x = 0;
  stability.y = 0;
  stability.z = 0;
  stability.frames = 0;
}

/**
 * Immediately ground the model after placement.
 */
export function lockGroundAtPlacement(frame, hitTestSource, localSpace, modelRoot) {
  if (!frame || !hitTestSource || !localSpace || !modelRoot) {
    return;
  }

  const hits = frame.getHitTestResults(hitTestSource);
  const updated = updateSurfaceAnchorFromHits(hits, localSpace, modelRoot.position, {
    forceImmediate: true
  });

  if (updated && surfaceAnchor.valid) {
    modelRoot.position.set(surfaceAnchor.x, surfaceAnchor.y, surfaceAnchor.z);
    return;
  }

  if (surfaceAnchor.valid) {
    modelRoot.position.set(surfaceAnchor.x, surfaceAnchor.y, surfaceAnchor.z);
  }
}

/**
 * Camera-aligned XZ drag projected on the active ground height.
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

  modelRoot.position.addScaledVector(camRight, deltaX * PX_TO_WORLD);
  modelRoot.position.addScaledVector(camForward, -deltaY * PX_TO_WORLD);

  gesture.pendingDeltaX = 0;
  gesture.pendingDeltaY = 0;
}

/**
 * Smoothly snap full model position toward the validated surface anchor.
 */
export function updateSurfaceSnap(modelRoot) {
  if (!modelRoot || !surfaceAnchor.valid) {
    return;
  }

  anchorTarget.set(surfaceAnchor.x, surfaceAnchor.y, surfaceAnchor.z);

  const lerpFactor = surfaceAnchor.surfaceChanged ? SURFACE_CHANGE_LERP : ANCHOR_POSITION_LERP;
  modelRoot.position.lerp(anchorTarget, lerpFactor);

  surfaceAnchor.surfaceChanged = false;
}

/**
 * Prevent floating when Android returns no hits — lock to last known ground height.
 */
export function applyFallbackGrounding(modelRoot) {
  if (!modelRoot) {
    return;
  }

  if (surfaceAnchor.valid) {
    modelRoot.position.y = THREE.MathUtils.lerp(modelRoot.position.y, surfaceAnchor.y, 0.12);
    return;
  }

  modelRoot.position.y = THREE.MathUtils.lerp(modelRoot.position.y, 0, 0.06);
}

/**
 * Single animation-loop entry: evaluate anchor, drag, snap, fallback.
 */
export function updateModelGrounding(frame, hitTestSource, localSpace, modelRoot, gesture, camera) {
  if (!modelRoot) {
    return;
  }

  if (gesture?.dragging) {
    updateDragFromGesture(gesture, modelRoot, camera);
  }

  if (frame && hitTestSource && localSpace) {
    const hits = frame.getHitTestResults(hitTestSource);
    updateSurfaceAnchorFromHits(hits, localSpace, modelRoot.position, {
      preserveModelXZ: Boolean(gesture?.dragging)
    });
  } else {
    surfaceAnchor.age += 1;
    if (surfaceAnchor.age > ANCHOR_DECAY_AGE) {
      surfaceAnchor.valid = false;
    }
  }

  if (surfaceAnchor.valid) {
    updateSurfaceSnap(modelRoot);
  } else {
    applyFallbackGrounding(modelRoot);
  }

  modelRoot.rotation.x = 0;
  modelRoot.rotation.z = 0;
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
