import * as THREE from "three";

const tmpPosition = new THREE.Vector3();
const tmpQuaternion = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();

/**
 * Keeps the scan model hidden until the MindAR anchor pose settles, then
 * reveals it for the remainder of the current tracking lock.
 */
export function createImageScanPoseStabilizer({
  getAnchorGroup,
  getModelGroup,
  onPhaseChange,
  minWarmupMs = 450,
  maxWarmupMs = 2000,
  stableFramesRequired = 8,
  maxPositionDelta = 0.02,
  maxRotationDelta = 0.05
} = {}) {
  let phase = "idle";
  let warmupStartedAt = 0;
  let stableFrameCount = 0;
  let hasPrevSample = false;
  const prevPosition = new THREE.Vector3();
  const prevQuaternion = new THREE.Quaternion();

  function setPhase(next) {
    if (phase === next) {
      return;
    }
    phase = next;
    onPhaseChange?.(next);
  }

  function readPose(group) {
    group.matrix.decompose(tmpPosition, tmpQuaternion, tmpScale);
    return {
      position: tmpPosition,
      quaternion: tmpQuaternion
    };
  }

  function measureDelta(current, previous) {
    return {
      position: current.position.distanceTo(previous.position),
      rotation: 1 - Math.abs(current.quaternion.dot(previous.quaternion))
    };
  }

  function isStableDelta(delta) {
    return delta.position <= maxPositionDelta && delta.rotation <= maxRotationDelta;
  }

  function hideModel() {
    const modelGroup = getModelGroup();
    if (modelGroup) {
      modelGroup.visible = false;
    }
  }

  function showModel() {
    const modelGroup = getModelGroup();
    if (modelGroup) {
      modelGroup.visible = true;
    }
  }

  function beginWarmup() {
    stableFrameCount = 0;
    hasPrevSample = false;
    warmupStartedAt = performance.now();
    hideModel();
    setPhase("warming");
  }

  function completeWarmup() {
    showModel();
    setPhase("stable");
  }

  function reset() {
    stableFrameCount = 0;
    hasPrevSample = false;
    warmupStartedAt = 0;
    hideModel();
    setPhase("idle");
  }

  function isAnchorTracking() {
    const anchorGroup = getAnchorGroup();
    return Boolean(anchorGroup?.visible);
  }

  function update() {
    if (!isAnchorTracking()) {
      if (phase !== "idle") {
        reset();
      }
      return;
    }

    if (phase === "stable") {
      return;
    }

    if (phase === "idle") {
      beginWarmup();
    }

    const anchorGroup = getAnchorGroup();
    const sample = readPose(anchorGroup);
    const elapsed = performance.now() - warmupStartedAt;

    if (hasPrevSample) {
      const delta = measureDelta(sample, {
        position: prevPosition,
        quaternion: prevQuaternion
      });

      if (isStableDelta(delta)) {
        stableFrameCount += 1;
      } else {
        stableFrameCount = 0;
      }
    }

    prevPosition.copy(sample.position);
    prevQuaternion.copy(sample.quaternion);
    hasPrevSample = true;

    const warmedLongEnough = elapsed >= minWarmupMs;
    const stableEnough = stableFrameCount >= stableFramesRequired;
    const timedOut = elapsed >= maxWarmupMs;

    if ((warmedLongEnough && stableEnough) || timedOut) {
      completeWarmup();
    }
  }

  return {
    update,
    reset,
    dispose: reset,
    getPhase: () => phase
  };
}
