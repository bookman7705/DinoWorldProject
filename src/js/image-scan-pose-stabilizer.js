import * as THREE from "three";

const tmpPosition = new THREE.Vector3();
const tmpQuaternion = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();

/**
 * Keeps the scan model hidden until the MindAR anchor pose settles, then
 * reveals it. If the pose jumps soon after reveal (common on first lock),
 * briefly re-enters warmup instead of requiring the user to re-scan.
 */
export function createImageScanPoseStabilizer({
  getAnchorGroup,
  getModelGroup,
  onPhaseChange,
  minWarmupMs = 400,
  maxWarmupMs = 1800,
  stableFramesRequired = 10,
  maxPositionDelta = 0.015,
  maxRotationDelta = 0.04,
  maxScaleDelta = 0.025,
  postRevealGuardMs = 1200,
  jumpPositionDelta = 0.04,
  jumpRotationDelta = 0.12,
  jumpScaleDelta = 0.08
} = {}) {
  let phase = "idle";
  let warmupStartedAt = 0;
  let stableFrameCount = 0;
  let revealStartedAt = 0;
  let hasPrevSample = false;
  const prevPosition = new THREE.Vector3();
  const prevQuaternion = new THREE.Quaternion();
  const prevScale = new THREE.Vector3();

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
      quaternion: tmpQuaternion,
      scale: tmpScale
    };
  }

  function measureDelta(current, previous) {
    const scaleDenominator = Math.max(
      previous.scale.x,
      previous.scale.y,
      previous.scale.z,
      1e-6
    );

    return {
      position: current.position.distanceTo(previous.position),
      rotation: 1 - Math.abs(current.quaternion.dot(previous.quaternion)),
      scale:
        Math.max(
          Math.abs(current.scale.x - previous.scale.x),
          Math.abs(current.scale.y - previous.scale.y),
          Math.abs(current.scale.z - previous.scale.z)
        ) / scaleDenominator
    };
  }

  function isStableDelta(delta) {
    return (
      delta.position <= maxPositionDelta &&
      delta.rotation <= maxRotationDelta &&
      delta.scale <= maxScaleDelta
    );
  }

  function isJumpDelta(delta) {
    return (
      delta.position > jumpPositionDelta ||
      delta.rotation > jumpRotationDelta ||
      delta.scale > jumpScaleDelta
    );
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
    revealStartedAt = 0;
    hideModel();
    setPhase("warming");
  }

  function completeWarmup() {
    showModel();
    revealStartedAt = performance.now();
    setPhase("stable");
    hasPrevSample = false;
  }

  function reset() {
    stableFrameCount = 0;
    hasPrevSample = false;
    warmupStartedAt = 0;
    revealStartedAt = 0;
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

    if (phase === "idle") {
      beginWarmup();
    }

    const anchorGroup = getAnchorGroup();
    const sample = readPose(anchorGroup);
    const elapsed = performance.now() - warmupStartedAt;

    if (phase === "warming") {
      if (hasPrevSample) {
        const delta = measureDelta(sample, {
          position: prevPosition,
          quaternion: prevQuaternion,
          scale: prevScale
        });

        if (isStableDelta(delta)) {
          stableFrameCount += 1;
        } else {
          stableFrameCount = 0;
        }
      }

      prevPosition.copy(sample.position);
      prevQuaternion.copy(sample.quaternion);
      prevScale.copy(sample.scale);
      hasPrevSample = true;

      const warmedLongEnough = elapsed >= minWarmupMs;
      const stableEnough = stableFrameCount >= stableFramesRequired;
      const timedOut = elapsed >= maxWarmupMs;

      if ((warmedLongEnough && stableEnough) || timedOut) {
        completeWarmup();
      }
      return;
    }

    if (phase === "stable") {
      const guardElapsed = performance.now() - revealStartedAt;

      if (guardElapsed <= postRevealGuardMs && hasPrevSample) {
        const delta = measureDelta(sample, {
          position: prevPosition,
          quaternion: prevQuaternion,
          scale: prevScale
        });

        if (isJumpDelta(delta)) {
          beginWarmup();
          return;
        }
      }

      prevPosition.copy(sample.position);
      prevQuaternion.copy(sample.quaternion);
      prevScale.copy(sample.scale);
      hasPrevSample = true;
    }
  }

  return {
    update,
    reset,
    dispose: reset,
    getPhase: () => phase
  };
}
