import * as THREE from "three";

/** Lerp factor toward detected surface pose (Scene Viewer–like smoothing). */
const DRAG_SMOOTH_FACTOR = 0.2;

/** Minimum |normal·up| to treat a plane as horizontal. */
const HORIZONTAL_NORMAL_DOT = 0.8;

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

  /**
   * Collect horizontal hit candidates from transient touch rays.
   */
  function updateDragHitTest(frame, localSpace) {
    if (!frame || !localSpace || !transientHitTestSource) {
      return null;
    }

    const transientResults = frame.getHitTestResultsForTransientInput(transientHitTestSource);
    return chooseBestHorizontalHit(transientResults, localSpace);
  }

  /**
   * Prefer the nearest horizontal plane hit along each transient input ray.
   * WebXR returns results sorted by distance; the first horizontal hit is used.
   */
  function chooseBestHorizontalHit(transientResults, localSpace) {
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
        return {
          pose,
          position: hitPosition.clone()
        };
      }
    }

    return null;
  }

  /**
   * Full target position on the detected surface, preserving finger-to-model offset.
   * Orientation stays upright (Y rotation only, preserved by caller).
   */
  function computeTargetDragPose(surfacePoint) {
    targetPosition.copy(surfacePoint).add(fingerToModelOffset);
    return targetPosition;
  }

  function smoothMoveModel(modelRoot, target) {
    modelRoot.position.lerp(target, DRAG_SMOOTH_FACTOR);
    modelRoot.rotation.x = 0;
    modelRoot.rotation.z = 0;
  }

  /**
   * Legacy drag-plane translation when transient hit tests are unavailable or miss.
   * Uses activePlaneY, which updates whenever a surface hit is detected.
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

    modelRoot.position.x += dragWorldPoint.x - gesture.lastDragWorldX;
    modelRoot.position.z += dragWorldPoint.z - gesture.lastDragWorldZ;
    modelRoot.position.y = activePlaneY;

    gesture.lastDragWorldX = dragWorldPoint.x;
    gesture.lastDragWorldZ = dragWorldPoint.z;
  }

  /**
   * Capture finger-to-model offset when a drag begins so the model stays under the finger.
   */
  function establishDragOffset(frame, localSpace) {
    const modelRoot = getModelRoot();
    if (!modelRoot) {
      return;
    }

    activePlaneY = modelRoot.position.y;

    const hit = frame ? updateDragHitTest(frame, localSpace) : null;
    if (hit) {
      fingerToModelOffset.copy(modelRoot.position).sub(hit.position);
      hasFingerOffset = true;
      activePlaneY = hit.position.y;
      return;
    }

    if (
      screenPointToWorldOnPlane(gesture.activeTouchX, gesture.activeTouchY, activePlaneY, dragWorldPoint)
    ) {
      fingerToModelOffset.copy(modelRoot.position).sub(dragWorldPoint);
      hasFingerOffset = true;
    }
  }

  /**
   * Per-frame drag update: transient surface hits with smoothing, else fallback plane drag.
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
      // Switch drag plane to the newly detected surface (table → floor, etc.).
      activePlaneY = hit.position.y;
      const target = computeTargetDragPose(hit.position);
      smoothMoveModel(modelRoot, target);
      return;
    }

    // Transient source missing or no surface under the finger — use drag-plane fallback.
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
