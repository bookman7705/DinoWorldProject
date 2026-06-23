import { MOUSE, TOUCH } from "three";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160/examples/jsm/controls/OrbitControls.js";

/**
 * Orbit camera wrapper with configurable look-at target, zoom range, and pitch limits.
 * Panning is disabled — only orbit (rotate/pitch) and zoom are allowed.
 */
export class CameraController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.enableRotate = true;
    this.controls.mouseButtons.LEFT = MOUSE.ROTATE;
    this.controls.mouseButtons.MIDDLE = MOUSE.DOLLY;
    this.controls.mouseButtons.RIGHT = null;
    this.controls.touches.ONE = TOUCH.ROTATE;
    // OrbitControls r160 only handles TWO-finger DOLLY_PAN / DOLLY_ROTATE — not TOUCH.DOLLY.
    // With pan disabled, DOLLY_PAN gives pinch-to-zoom only.
    this.controls.touches.TWO = TOUCH.DOLLY_PAN;

    this._targetOrigin = { x: 0, y: 2, z: 0 };
    this._minDistance = 4;
    this._maxDistance = 30;
    this._minPitch = 0.15;
    this._maxPitch = Math.PI / 2 - 0.05;

    this.setTargetOrigin(0, 2, 0);
    this.applyLimits();
  }

  setTargetOrigin(x, y, z) {
    this._targetOrigin = { x, y, z };
    this.controls.target.set(x, y, z);
    this.controls.update();
  }

  getTargetOrigin() {
    return { ...this._targetOrigin };
  }

  setDistanceLimits(min, max) {
    this._minDistance = min;
    this._maxDistance = max;
    this.controls.minDistance = min;
    this.controls.maxDistance = max;
  }

  getDistanceLimits() {
    return { min: this._minDistance, max: this._maxDistance };
  }

  /**
   * Pitch limits use OrbitControls polar angle (radians): 0 = above target, PI/2 = horizon.
   */
  setPitchLimits(minRadians, maxRadians) {
    this._minPitch = minRadians;
    this._maxPitch = maxRadians;
    this.controls.minPolarAngle = minRadians;
    this.controls.maxPolarAngle = maxRadians;
  }

  getPitchLimits() {
    return { min: this._minPitch, max: this._maxPitch };
  }

  setInitialPosition(x, y, z) {
    this.camera.position.set(x, y, z);
    this.controls.update();
  }

  applyLimits() {
    this.controls.minDistance = this._minDistance;
    this.controls.maxDistance = this._maxDistance;
    this.controls.minPolarAngle = this._minPitch;
    this.controls.maxPolarAngle = this._maxPitch;
  }

  update() {
    this.controls.target.set(this._targetOrigin.x, this._targetOrigin.y, this._targetOrigin.z);
    this.controls.update();
  }

  dispose() {
    this.controls.dispose();
  }
}
