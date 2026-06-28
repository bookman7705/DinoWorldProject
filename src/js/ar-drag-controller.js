import * as THREE from "three";

/** Horizontal follow responsiveness. */
const DRAG_XZ_LERP = 0.35;

/** Height anchoring — kept lower to avoid aggressive Y snaps. */
const DRAG_Y_LERP = 0.12;

/** Minimum |normal·up| to treat a plane as horizontal. */
const HORIZONTAL_NORMAL_DOT = 0.85;

/** Reject hit-test points too far from the model in XZ. */
const MAX_HIT_XZ_FROM_MODEL = 0.75;

/** Max horizontal travel per frame (prevents single-frame leaps). */
const MAX_FRAME_XZ_DELTA = 0.18;

/** Max vertical travel per frame when anchoring to a surface. */
const MAX_FRAME_Y_DELTA = 0.08;

/** Max |hit.y − activePlaneY| to accept without gradual transition. */
const MAX_Y_FROM_ACTIVE_PLANE = 0.35;

/**
 * Surface-aware drag controller for Android WebXR.
 * Prefers transient touch hit tests; falls back to a horizontal drag plane.
 */
export function createArDragController({
  getModelRoot,
  getActiveCamera,
  getCanvas,
  isPlaced
}) {
  const worldUp = new THREE.Vector3(0, 1, 0);
  const dragRaycaster = new THREE.Raycaster();
  const dragNdc = new THREE.Vector2();
  const dragPlane = new THREE.Plane();
  const dragWorldPoint = new THREE.Vector3();
  const tmpMatrix = new THREE.Matrix4();
  const tmpPosition = new THREE.Vector3();
  const tmpQuaternion = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();
  const tmpNormal = new THREE.Vector3();
  const fingerToModelOffset = new THREE.Vector3();
  const targetPosition = new THREE.Vector3();
  const hitPosition = new THREE.Vector3();
  const frameDelta = new THREE.Vector3();

  let transientHitTestSource = null;
  let activePlaneY = 0;
  let hasFingerOffset = false;

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
    activeTouchX: 0,
    activeTouchY: 0,
    dragAccumPx: 0,
    lastDistance: 0,
    lastAngle: 0,
    hasDragWorldAnchor: false,
    lastDragWorldX: 0,
    lastDragWorldZ: 0
  };

  function setTransientHitTestSource(source) {
    transientHitTestSource = source;
  }

  function clearTransientHitTestSource() {
    transientHitTestSource = null;
  }

  function isHorizontalPoseFromMatrix(matrix) {
    matrix.decompose(tmpPosition, tmpQuaternion, tmpScale);
    tmpNormal.set(0, 1, 0).applyQuaternion(tmpQuaternion).normalize();
    return Math.abs(tmpNormal.dot(worldUp)) > HORIZONTAL_NORMAL_DOT;
  }

  function screenPointToWorldOnPlane(screenX, screenY, planeY, out) {
    const cam = getActiveCamera();
    const canvas = getCanvas();
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;

    dragNdc.set((screenX / width) * 2 - 1, -(screenY / height) * 2 + 1);
    dragRaycaster.setFromCamera(dragNdc, cam);
    dragPlane.set(worldUp, -planeY);
    return dragRaycaster.ray.intersectPlane(dragPlane, out) !== null;
  }

  function horizontalDistanceToModel(hitPos, modelPos) {
    const dx = hitPos.x - modelPos.x;
    const dz = hitPos.z - modelPos.z;
    return Math.hypot(dx, dz);
  }

  /**
   * Collect horizontal hit candidates from transient touch rays.
   */
  function updateDragHitTest(frame, localSpace) {
    if (!frame || !localSpace || !transientHitTestSource) {
      return null;
    }

    const modelRoot = getModelRoot();
    if (!modelRoot) {
      return null;
    }

    const transientResults = frame.getHitTestResultsForTransientInput(transientHitTestSource);
    return chooseBestHorizontalHit(transientResults, localSpace, modelRoot.position);
  }

  /**
   * Pick the horizontal hit nearest the model in XZ, rejecting distant/outlier surfaces.
   * Avoids snapping to a far floor/wall plane that happens to appear first along the touch ray.
   */
  function chooseBestHorizontalHit(transientResults, localSpace, modelPos) {
    let bestHit = null;
    let bestScore = Infinity;

    for (const bundle of transientResults) {
      for (const hit of bundle.results) {
        const pose = hit.getPose(localSpace);
        if (!pose) {
          continue;
        }

        tmpMatrix.fromArray(pose.transform.matrix);
        if (!isHorizontalPoseFromMatrix(tmpMatrix)) {
          continue;
        }

        tmpMatrix.decompose(hitPosition, tmpQuaternion, tmpScale);

        const xzDist = horizontalDistanceToModel(hitPosition, modelPos);
        if (xzDist > MAX_HIT_XZ_FROM_MODEL) {
          continue;
        }

        const yDelta = Math.abs(hitPosition.y - activePlaneY);
        // Allow larger height changes only when the hit is directly under/near the model
        // (intentional table → floor transition). Reject distant planes with large Y gaps.
        const maxAllowedY =
          xzDist < 0.35 ? MAX_Y_FROM_ACTIVE_PLANE * 2.5 : MAX_Y_FROM_ACTIVE_PLANE;
        if (yDelta > maxAllowedY) {
          continue;
        }

        // Prefer hits under/near the model; penalize large height discrepancies.
        const score = xzDist + yDelta * 2;
        if (score < bestScore) {
          bestScore = score;
          bestHit = {
            pose,
            position: hitPosition.clone()
          };
        }
      }
    }

    return bestHit;
  }

  /**
   * Target on the detected surface using horizontal finger offset only (Y comes from the plane).
   */
  function computeTargetDragPose(surfacePoint) {
    targetPosition.set(
      surfacePoint.x + fingerToModelOffset.x,
      surfacePoint.y,
      surfacePoint.z + fingerToModelOffset.z
    );
    return targetPosition;
  }

  /**
   * Move toward the target with separate, clamped XZ and Y steps.
   */
  function smoothMoveModel(modelRoot, target) {
    const current = modelRoot.position;

    frameDelta.set(
      target.x - current.x,
      target.y - current.y,
      target.z - current.z
    );

    const xzLen = Math.hypot(frameDelta.x, frameDelta.z);
    if (xzLen > MAX_FRAME_XZ_DELTA) {
      const scale = MAX_FRAME_XZ_DELTA / xzLen;
      frameDelta.x *= scale;
      frameDelta.z *= scale;
    }

    frameDelta.y = THREE.MathUtils.clamp(frameDelta.y, -MAX_FRAME_Y_DELTA, MAX_FRAME_Y_DELTA);

    current.x += frameDelta.x * DRAG_XZ_LERP;
    current.z += frameDelta.z * DRAG_XZ_LERP;
    current.y += frameDelta.y * DRAG_Y_LERP;

    modelRoot.rotation.x = 0;
    modelRoot.rotation.z = 0;
  }

  /**
   * Legacy drag-plane translation when transient hit tests are unavailable or miss.
   * Uses activePlaneY, which updates whenever a validated surface hit is detected.
   */
  function fallbackDragPlaneTranslation(screenX, screenY) {
    const modelRoot = getModelRoot();
    if (!modelRoot) {
      return;
    }

    if (!screenPointToWorldOnPlane(screenX, screenY, activePlaneY, dragWorldPoint)) {
      return;
    }

    if (!gesture.hasDragWorldAnchor) {
      gesture.lastDragWorldX = dragWorldPoint.x;
      gesture.lastDragWorldZ = dragWorldPoint.z;
      gesture.hasDragWorldAnchor = true;
      return;
    }

    const dx = dragWorldPoint.x - gesture.lastDragWorldX;
    const dz = dragWorldPoint.z - gesture.lastDragWorldZ;
    const stepLen = Math.hypot(dx, dz);
    if (stepLen > MAX_FRAME_XZ_DELTA) {
      const scale = MAX_FRAME_XZ_DELTA / stepLen;
      modelRoot.position.x += dx * scale;
      modelRoot.position.z += dz * scale;
    } else {
      modelRoot.position.x += dx;
      modelRoot.position.z += dz;
    }

    modelRoot.position.y = activePlaneY;

    gesture.lastDragWorldX = dragWorldPoint.x;
    gesture.lastDragWorldZ = dragWorldPoint.z;
  }

  /**
   * Capture horizontal finger-to-model offset when a drag begins.
   */
  function establishDragOffset(frame, localSpace) {
    const modelRoot = getModelRoot();
    if (!modelRoot) {
      return;
    }

    activePlaneY = modelRoot.position.y;

    const hit = frame ? updateDragHitTest(frame, localSpace) : null;
    if (hit) {
      fingerToModelOffset.set(
        modelRoot.position.x - hit.position.x,
        0,
        modelRoot.position.z - hit.position.z
      );
      hasFingerOffset = true;
      activePlaneY = hit.position.y;
      return;
    }

    if (
      screenPointToWorldOnPlane(gesture.activeTouchX, gesture.activeTouchY, activePlaneY, dragWorldPoint)
    ) {
      fingerToModelOffset.set(
        modelRoot.position.x - dragWorldPoint.x,
        0,
        modelRoot.position.z - dragWorldPoint.z
      );
      hasFingerOffset = true;
    }
  }

  /**
   * Per-frame drag update: validated transient hits with constrained smoothing, else fallback.
   */
  function updateSurfaceDrag(frame, localSpace) {
    if (!isPlaced() || !gesture.moving) {
      return;
    }

    const modelRoot = getModelRoot();
    if (!modelRoot) {
      return;
    }

    if (!hasFingerOffset) {
      establishDragOffset(frame, localSpace);
    }

    const hit = updateDragHitTest(frame, localSpace);
    if (hit) {
      activePlaneY = hit.position.y;
      gesture.hasDragWorldAnchor = false;
      const target = computeTargetDragPose(hit.position);
      smoothMoveModel(modelRoot, target);
      return;
    }

    fallbackDragPlaneTranslation(gesture.activeTouchX, gesture.activeTouchY);
  }

  function resetSingleTouchGesture(touch) {
    gesture.singleTouch = true;
    gesture.moving = false;
    gesture.dragAccumPx = 0;
    gesture.hasDragWorldAnchor = false;
    hasFingerOffset = false;
    gesture.startScreenX = touch.pageX;
    gesture.startScreenY = touch.pageY;
    gesture.lastScreenX = touch.pageX;
    gesture.lastScreenY = touch.pageY;
    gesture.activeTouchX = touch.pageX;
    gesture.activeTouchY = touch.pageY;
  }

  function resetTwoFingerGesture(touches, getTouchMetrics) {
    const metrics = getTouchMetrics(touches);
    gesture.twoFinger = true;
    gesture.singleTouch = false;
    gesture.moving = false;
    gesture.scaling = false;
    gesture.rotating = false;
    gesture.hasDragWorldAnchor = false;
    hasFingerOffset = false;
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
    gesture.hasDragWorldAnchor = false;
    hasFingerOffset = false;
  }

  function movementBlocked() {
    return gesture.twoFinger || gesture.scaling || gesture.rotating;
  }

  function onTouchMoveSingle(touch, frame, localSpace) {
    gesture.activeTouchX = touch.pageX;
    gesture.activeTouchY = touch.pageY;

    const dx = touch.pageX - gesture.lastScreenX;
    const dy = touch.pageY - gesture.lastScreenY;
    if (dx === 0 && dy === 0) {
      return false;
    }

    gesture.dragAccumPx += Math.hypot(dx, dy);

    if (!gesture.moving) {
      if (gesture.dragAccumPx < 12) {
        return false;
      }
      gesture.moving = true;
      gesture.hasDragWorldAnchor = false;
      hasFingerOffset = false;
      establishDragOffset(frame, localSpace);
    }

    gesture.lastScreenX = touch.pageX;
    gesture.lastScreenY = touch.pageY;
    return true;
  }

  return {
    gesture,
    setTransientHitTestSource,
    clearTransientHitTestSource,
    resetSingleTouchGesture,
    resetTwoFingerGesture,
    clearGestureState,
    movementBlocked,
    onTouchMoveSingle,
    updateSurfaceDrag,
    establishDragOffset
  };
}
