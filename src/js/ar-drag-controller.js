import * as THREE from "three";

/** How quickly activePlaneY blends toward a validated detected surface. */
const PLANE_Y_BLEND = 0.18;

/** Minimum |normal·up| to treat a plane as horizontal. */
const HORIZONTAL_NORMAL_DOT = 0.85;

/** Reject hit-test points too far from the finger in XZ. */
const MAX_HIT_XZ_FROM_FINGER = 0.6;

/** Reject hit-test points too far from the model in XZ. */
const MAX_HIT_XZ_FROM_MODEL = 0.9;

/** Max |hit.y − activePlaneY| unless the hit is directly under the model. */
const MAX_Y_FROM_ACTIVE_PLANE = 0.35;

/** Safety cap for a single-frame horizontal step (guards tracking glitches only). */
const MAX_GLITCH_XZ_STEP = 1.5;

/**
 * Surface-aware drag controller for Android WebXR.
 * XZ follows the finger 1:1 on a world-anchored drag plane; Y blends from hit tests.
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
  const fingerWorldPoint = new THREE.Vector3();
  const tmpMatrix = new THREE.Matrix4();
  const tmpPosition = new THREE.Vector3();
  const tmpQuaternion = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();
  const tmpNormal = new THREE.Vector3();
  const hitPosition = new THREE.Vector3();

  let transientHitTestSource = null;
  let activePlaneY = 0;

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

  /**
   * Raycast from the touch point into world space on a horizontal plane.
   * Uses canvas bounds so movement stays world-anchored (not camera-relative).
   */
  function screenPointToWorldOnPlane(clientX, clientY, planeY, out) {
    const cam = getActiveCamera();
    const canvas = getCanvas();
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || window.innerWidth;
    const height = rect.height || window.innerHeight;

    if (width <= 0 || height <= 0) {
      return false;
    }

    dragNdc.set(
      ((clientX - rect.left) / width) * 2 - 1,
      -((clientY - rect.top) / height) * 2 + 1
    );
    dragRaycaster.setFromCamera(dragNdc, cam);
    dragPlane.set(worldUp, -planeY);
    return dragRaycaster.ray.intersectPlane(dragPlane, out) !== null;
  }

  function horizontalDistance(ax, az, bx, bz) {
    return Math.hypot(ax - bx, az - bz);
  }

  function getFingerWorldOnActivePlane() {
    if (!screenPointToWorldOnPlane(gesture.activeTouchX, gesture.activeTouchY, activePlaneY, fingerWorldPoint)) {
      return null;
    }
    return fingerWorldPoint;
  }

  /**
   * Collect a validated horizontal hit from transient touch rays.
   */
  function updateDragHitTest(frame, localSpace) {
    if (!frame || !localSpace || !transientHitTestSource) {
      return null;
    }

    const modelRoot = getModelRoot();
    if (!modelRoot) {
      return null;
    }

    const finger = getFingerWorldOnActivePlane();
    const transientResults = frame.getHitTestResultsForTransientInput(transientHitTestSource);
    return chooseBestHorizontalHit(transientResults, localSpace, modelRoot.position, finger);
  }

  /**
   * Prefer a horizontal hit under the finger, validated against model proximity and height.
   */
  function chooseBestHorizontalHit(transientResults, localSpace, modelPos, finger) {
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

        const modelXzDist = horizontalDistance(hitPosition.x, hitPosition.z, modelPos.x, modelPos.z);
        if (modelXzDist > MAX_HIT_XZ_FROM_MODEL) {
          continue;
        }

        if (finger) {
          const fingerXzDist = horizontalDistance(hitPosition.x, hitPosition.z, finger.x, finger.z);
          if (fingerXzDist > MAX_HIT_XZ_FROM_FINGER) {
            continue;
          }
        }

        const yDelta = Math.abs(hitPosition.y - activePlaneY);
        const maxAllowedY =
          modelXzDist < 0.35 ? MAX_Y_FROM_ACTIVE_PLANE * 2.5 : MAX_Y_FROM_ACTIVE_PLANE;
        if (yDelta > maxAllowedY) {
          continue;
        }

        const fingerPenalty = finger
          ? horizontalDistance(hitPosition.x, hitPosition.z, finger.x, finger.z)
          : 0;
        const score = modelXzDist + fingerPenalty + yDelta * 2;
        if (score < bestScore) {
          bestScore = score;
          bestHit = { position: hitPosition.clone() };
        }
      }
    }

    return bestHit;
  }

  /**
   * Ease activePlaneY toward a validated surface height (table → floor transitions).
   */
  function blendActivePlaneY(hitY) {
    activePlaneY += (hitY - activePlaneY) * PLANE_Y_BLEND;
  }

  /**
   * Direct 1:1 world drag on the active horizontal plane — responsive finger tracking.
   */
  function fallbackDragPlaneTranslation(clientX, clientY) {
    const modelRoot = getModelRoot();
    if (!modelRoot) {
      return;
    }

    if (!screenPointToWorldOnPlane(clientX, clientY, activePlaneY, dragWorldPoint)) {
      return;
    }

    if (!gesture.hasDragWorldAnchor) {
      gesture.lastDragWorldX = dragWorldPoint.x;
      gesture.lastDragWorldZ = dragWorldPoint.z;
      gesture.hasDragWorldAnchor = true;
      modelRoot.position.y = activePlaneY;
      return;
    }

    let dx = dragWorldPoint.x - gesture.lastDragWorldX;
    let dz = dragWorldPoint.z - gesture.lastDragWorldZ;
    const stepLen = Math.hypot(dx, dz);
    if (stepLen > MAX_GLITCH_XZ_STEP) {
      const scale = MAX_GLITCH_XZ_STEP / stepLen;
      dx *= scale;
      dz *= scale;
    }

    modelRoot.position.x += dx;
    modelRoot.position.z += dz;
    modelRoot.position.y = activePlaneY;

    gesture.lastDragWorldX = dragWorldPoint.x;
    gesture.lastDragWorldZ = dragWorldPoint.z;
  }

  function beginDragAnchor(frame, localSpace) {
    const modelRoot = getModelRoot();
    if (!modelRoot) {
      return;
    }

    activePlaneY = modelRoot.position.y;
    gesture.hasDragWorldAnchor = false;

    const hit = frame ? updateDragHitTest(frame, localSpace) : null;
    if (hit) {
      activePlaneY = hit.position.y;
    }
  }

  /**
   * Per-frame drag: 1:1 plane translation + optional height blend from hit tests.
   */
  function updateSurfaceDrag(frame, localSpace) {
    if (!isPlaced() || !gesture.moving) {
      return;
    }

    const modelRoot = getModelRoot();
    if (!modelRoot) {
      return;
    }

    const hit = updateDragHitTest(frame, localSpace);
    if (hit) {
      blendActivePlaneY(hit.position.y);
    }

    fallbackDragPlaneTranslation(gesture.activeTouchX, gesture.activeTouchY);
    modelRoot.rotation.x = 0;
    modelRoot.rotation.z = 0;
  }

  function resetSingleTouchGesture(touch) {
    gesture.singleTouch = true;
    gesture.moving = false;
    gesture.dragAccumPx = 0;
    gesture.hasDragWorldAnchor = false;
    gesture.startScreenX = touch.clientX;
    gesture.startScreenY = touch.clientY;
    gesture.lastScreenX = touch.clientX;
    gesture.lastScreenY = touch.clientY;
    gesture.activeTouchX = touch.clientX;
    gesture.activeTouchY = touch.clientY;
  }

  function resetTwoFingerGesture(touches, getTouchMetrics) {
    const metrics = getTouchMetrics(touches);
    gesture.twoFinger = true;
    gesture.singleTouch = false;
    gesture.moving = false;
    gesture.scaling = false;
    gesture.rotating = false;
    gesture.hasDragWorldAnchor = false;
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
  }

  function movementBlocked() {
    return gesture.twoFinger || gesture.scaling || gesture.rotating;
  }

  function onTouchMoveSingle(touch, frame, localSpace) {
    gesture.activeTouchX = touch.clientX;
    gesture.activeTouchY = touch.clientY;

    const dx = touch.clientX - gesture.lastScreenX;
    const dy = touch.clientY - gesture.lastScreenY;
    if (dx === 0 && dy === 0) {
      return false;
    }

    gesture.dragAccumPx += Math.hypot(dx, dy);

    if (!gesture.moving) {
      if (gesture.dragAccumPx < 12) {
        return false;
      }
      gesture.moving = true;
      beginDragAnchor(frame, localSpace);
    }

    gesture.lastScreenX = touch.clientX;
    gesture.lastScreenY = touch.clientY;

    if (frame && localSpace) {
      updateSurfaceDrag(frame, localSpace);
    }

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
    beginDragAnchor
  };
}
