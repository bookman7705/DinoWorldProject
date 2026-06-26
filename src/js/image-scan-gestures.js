import * as THREE from "three";

const ROTATE_DEAD_ZONE_PX = 12;
const SCALE_DEAD_ZONE_RATIO = 0.015;
const ROTATE_RADIANS_PER_PX = 0.008;
const MIN_GESTURE_SCALE = 0.25;
const MAX_GESTURE_SCALE = 4;

const TABLE_ROTATE_AXIS = new THREE.Vector3(0, 0, 1);
const WALL_ROTATE_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * Pinch-to-scale and single-finger horizontal swipe rotation for image-scan models.
 * Transforms apply to gestureRoot (child of the MindAR anchor group).
 *
 * Placement pitch (table vs wall) lives on a child group; this layer only handles
 * user scale and left/right yaw in anchor space:
 * - table: spin around Z (normal to a flat target)
 * - wall: spin around Y (vertical on a wall target)
 */
export function createImageScanGestureController({
  getGestureRoot,
  isInteractionEnabled,
  onGestureScaleChange,
  placementType = "table",
  touchTarget = window
} = {}) {
  const rotateAxis = placementType === "wall" ? WALL_ROTATE_AXIS : TABLE_ROTATE_AXIS;
  let gestureScaleFactor = 1;

  const gesture = {
    singleTouch: false,
    twoFinger: false,
    rotating: false,
    scaling: false,
    rotateAccumPx: 0,
    lastScreenX: 0,
    lastDistance: 0
  };

  function applyGestureScale() {
    const root = getGestureRoot();
    if (!root) {
      return;
    }

    root.scale.setScalar(gestureScaleFactor);
    onGestureScaleChange?.(gestureScaleFactor);
  }

  function resetSingleTouchGesture(touch) {
    gesture.singleTouch = true;
    gesture.rotating = false;
    gesture.rotateAccumPx = 0;
    gesture.lastScreenX = touch.pageX;
  }

  function resetTwoFingerGesture(touches) {
    const metrics = getTouchMetrics(touches);
    gesture.twoFinger = true;
    gesture.singleTouch = false;
    gesture.rotating = false;
    gesture.scaling = false;
    gesture.lastDistance = metrics.distance;
  }

  function clearGestureState() {
    gesture.singleTouch = false;
    gesture.twoFinger = false;
    gesture.rotating = false;
    gesture.scaling = false;
    gesture.rotateAccumPx = 0;
  }

  function gestureBlocked() {
    return gesture.twoFinger || gesture.scaling;
  }

  function getTouchMetrics(touches) {
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return {
      distance: Math.hypot(dx, dy)
    };
  }

  function onTouchStart(event) {
    if (!isInteractionEnabled?.()) {
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
  }

  function onTouchMove(event) {
    if (!isInteractionEnabled?.()) {
      return;
    }

    const root = getGestureRoot();
    if (!root) {
      return;
    }

    if (event.touches.length >= 2) {
      event.preventDefault();

      if (!gesture.twoFinger) {
        resetTwoFingerGesture(event.touches);
      }

      const metrics = getTouchMetrics(event.touches);
      const scaleFactor = metrics.distance / Math.max(gesture.lastDistance, 1);

      if (Math.abs(scaleFactor - 1) > SCALE_DEAD_ZONE_RATIO) {
        gesture.scaling = true;
      }

      if (gesture.scaling) {
        gestureScaleFactor = THREE.MathUtils.clamp(
          gestureScaleFactor * scaleFactor,
          MIN_GESTURE_SCALE,
          MAX_GESTURE_SCALE
        );
        applyGestureScale();
      }

      gesture.lastDistance = metrics.distance;
      return;
    }

    if (event.touches.length !== 1 || !gesture.singleTouch || gestureBlocked()) {
      return;
    }

    const touch = event.touches[0];
    const dx = touch.pageX - gesture.lastScreenX;

    if (dx === 0) {
      return;
    }

    gesture.rotateAccumPx += Math.abs(dx);

    if (!gesture.rotating) {
      if (gesture.rotateAccumPx < ROTATE_DEAD_ZONE_PX) {
        return;
      }
      gesture.rotating = true;
    }

    event.preventDefault();
    root.rotateOnAxis(rotateAxis, dx * ROTATE_RADIANS_PER_PX);
    gesture.lastScreenX = touch.pageX;
  }

  function onTouchEnd(event) {
    if (!isInteractionEnabled?.()) {
      return;
    }

    if (event.touches.length === 0) {
      clearGestureState();
      return;
    }

    if (event.touches.length === 1) {
      gesture.twoFinger = false;
      gesture.scaling = false;
      resetSingleTouchGesture(event.touches[0]);
      return;
    }

    if (event.touches.length >= 2) {
      resetTwoFingerGesture(event.touches);
    }
  }

  const touchOptions = { passive: false };

  touchTarget.addEventListener("touchstart", onTouchStart, touchOptions);
  touchTarget.addEventListener("touchmove", onTouchMove, touchOptions);
  touchTarget.addEventListener("touchend", onTouchEnd);
  touchTarget.addEventListener("touchcancel", onTouchEnd);

  function resetTransforms() {
    gestureScaleFactor = 1;
    clearGestureState();

    const root = getGestureRoot();
    if (root) {
      root.scale.setScalar(1);
      root.rotation.set(0, 0, 0);
      root.quaternion.identity();
    }

    onGestureScaleChange?.(gestureScaleFactor);
  }

  function dispose() {
    touchTarget.removeEventListener("touchstart", onTouchStart, touchOptions);
    touchTarget.removeEventListener("touchmove", onTouchMove, touchOptions);
    touchTarget.removeEventListener("touchend", onTouchEnd);
    touchTarget.removeEventListener("touchcancel", onTouchEnd);
    resetTransforms();
  }

  return {
    dispose,
    resetTransforms,
    getGestureScaleFactor: () => gestureScaleFactor
  };
}
