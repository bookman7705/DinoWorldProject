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

/** XZ smoothing toward the surface anchor (non-drag). */
const XZ_SNAP_LERP = 0.12;

/** Y smoothing toward the surface anchor. */
const Y_SNAP_LERP = 0.18;

/** Slower XZ lerp when switching between surfaces (table → floor). */
const SURFACE_CHANGE_XZ_LERP = 0.1;

/** Slower Y lerp when switching between surfaces. */
const SURFACE_CHANGE_Y_LERP = 0.15;

/** Y delta (m) that counts as a surface change or unstable spike. */
const SURFACE_CHANGE_Y = 0.2;

/** Lerp factor for smoothing stability tracker toward raw candidates. */
const STABILITY_SMOOTH = 0.35;

const worldUp = new THREE.Vector3(0, 1, 0);
const tmpMatrix = new THREE.Matrix4();
const tmpPosition = new THREE.Vector3();
const tmpQuaternion = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpNormal = new THREE.Vector3();
const camRight = new THREE.Vector3();
const camForward = new THREE.Vector3();

/** Persistent ground anchor — survives sparse Android hit-test frames. */
export const surfaceAnchor = {
  x: 0,
  y: 0,
  z: 0,
  valid: false,
  age: 0,
  surfaceChanged: false
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

function referenceYForSpikeCheck() {
  if (stability.frames > 0) {
    return stability.y;
  }
  if (surfaceAnchor.valid) {
    return surfaceAnchor.y;
  }
  return null;
}

/**
 * Reject one-frame Y spikes unless the candidate is already stabilizing.
 */
function isUnstableYSpike(candidateY) {
  const refY = referenceYForSpikeCheck();
  if (refY === null) {
    return false;
  }
  return (
    Math.abs(candidateY - refY) > SURFACE_CHANGE_Y &&
    stability.frames < STABILITY_FRAMES_REQUIRED
  );
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

function decayAnchorAge() {
  surfaceAnchor.age += 1;
  if (surfaceAnchor.age > ANCHOR_DECAY_AGE) {
    surfaceAnchor.valid = false;
  }
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
    decayAnchorAge();
    return false;
  }

  if (isUnstableYSpike(candidate.y)) {
    decayAnchorAge();
    return false;
  }

  surfaceAnchor.age = Math.max(0, surfaceAnchor.age - 2);

  const distToStable = candidateDistance(candidate, stability);

  if (distToStable < CANDIDATE_MATCH_DIST) {
    stability.frames += 1;
    stability.x = THREE.MathUtils.lerp(stability.x, candidate.x, STABILITY_SMOOTH);
    stability.y = THREE.MathUtils.lerp(stability.y, candidate.y, STABILITY_SMOOTH);
    stability.z = THREE.MathUtils.lerp(stability.z, candidate.z, STABILITY_SMOOTH);
  } else {
    stability.frames = 1;
    stability.x = candidate.x;
    stability.y = candidate.y;
    stability.z = candidate.z;
  }

  const ready = forceImmediate || stability.frames >= STABILITY_FRAMES_REQUIRED;
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
 * Immediately ground the model after placement (direct set allowed only here).
 */
export function lockGroundAtPlacement(frame, hitTestSource, localSpace, modelRoot) {
  if (!frame || !hitTestSource || !localSpace || !modelRoot) {
    return;
  }

  const hits = frame.getHitTestResults(hitTestSource);
  updateSurfaceAnchorFromHits(hits, localSpace, modelRoot.position, {
    forceImmediate: true
  });

  if (surfaceAnchor.valid) {
    modelRoot.position.set(surfaceAnchor.x, surfaceAnchor.y, surfaceAnchor.z);
  }
}

/**
 * Camera-aligned XZ drag — never mutates Y or anchor state.
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
    return;
  }
  camForward.normalize();
  camRight.crossVectors(worldUp, camForward).normalize();

  modelRoot.position.x += camRight.x * deltaX * PX_TO_WORLD + camForward.x * -deltaY * PX_TO_WORLD;
  modelRoot.position.z += camRight.z * deltaX * PX_TO_WORLD + camForward.z * -deltaY * PX_TO_WORLD;

  gesture.pendingDeltaX = 0;
  gesture.pendingDeltaY = 0;
}

/**
 * Smoothly snap model toward the validated surface anchor.
 * While dragging, only Y is influenced — XZ stays under gesture control.
 */
export function updateSurfaceSnap(modelRoot, dragging = false) {
  if (!modelRoot || !surfaceAnchor.valid) {
    return;
  }

  const yLerp = surfaceAnchor.surfaceChanged ? SURFACE_CHANGE_Y_LERP : Y_SNAP_LERP;
  modelRoot.position.y = THREE.MathUtils.lerp(modelRoot.position.y, surfaceAnchor.y, yLerp);

  if (!dragging) {
    const xzLerp = surfaceAnchor.surfaceChanged ? SURFACE_CHANGE_XZ_LERP : XZ_SNAP_LERP;
    modelRoot.position.x = THREE.MathUtils.lerp(modelRoot.position.x, surfaceAnchor.x, xzLerp);
    modelRoot.position.z = THREE.MathUtils.lerp(modelRoot.position.z, surfaceAnchor.z, xzLerp);
  }

  surfaceAnchor.surfaceChanged = false;
}

/**
 * Prevent floating when Android returns no hits — lock to last known ground height.
 */
export function applyFallbackGrounding(modelRoot) {
  if (!modelRoot) {
    return;
  }

  modelRoot.position.y = THREE.MathUtils.lerp(modelRoot.position.y, 0, 0.06);
}

/**
 * Single animation-loop entry: drag → anchor → snap → fallback → rotation lock.
 */
export function updateModelGrounding(frame, hitTestSource, localSpace, modelRoot, gesture, camera) {
  if (!modelRoot) {
    return;
  }

  const dragging = Boolean(gesture?.dragging && !movementBlocked(gesture));

  // 1. Apply drag (XZ only, camera-aligned)
  if (dragging) {
    updateDragFromGesture(gesture, modelRoot, camera);
  }

  // 2. Update anchor from hit-test results
  if (frame && hitTestSource && localSpace) {
    const hits = frame.getHitTestResults(hitTestSource);
    updateSurfaceAnchorFromHits(hits, localSpace, modelRoot.position, {
      preserveModelXZ: dragging
    });
  } else {
    decayAnchorAge();
  }

  // 3. Apply snap to anchor (Y + optional XZ smoothing)
  if (surfaceAnchor.valid) {
    updateSurfaceSnap(modelRoot, dragging);
  } else {
    // 4. Fallback grounding when no valid anchor
    applyFallbackGrounding(modelRoot);
  }

  // 5. Reset X/Z rotation to zero
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
  gesture.scaling = false;
  gesture.rotating = false;
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
  gesture.dragAccumPx = 0;
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
