/**
 * JARVIS NEXUS — Deliberate Cinema Camera Director.
 *
 * Implements:
 * - Calibrated cinema prime focal lengths (24mm, 28mm, 35mm, 40mm, 50mm, 65mm).
 * - Critically damped spring movement, wall-boundary clamping, zero character clipping.
 * - Automatic reframing when JARVIS walks across the sanctuary.
 * - User OrbitControls inspection with non-fighting manual override.
 * - Full Reduced-Motion accessibility support (gentle immediate cuts, zero drift).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

function focalLengthToVerticalFov(focalMm, sensorHeightMm = 24) {
  return THREE.MathUtils.radToDeg(2 * Math.atan(sensorHeightMm / (2 * focalMm)));
}

export class CameraDirector {
  constructor(camera, domElement) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 1.25;
    this.controls.maxDistance = 13.5;
    this.controls.maxPolarAngle = Math.PI * 0.495; // Never dip below floor!
    this.controls.target.set(0.6, 1.38, 0.4);

    this.manualUserHoldSec = 0;
    this.controls.addEventListener('start', () => {
      this.manualUserHoldSec = 6.0;
    });

    this.mode = 'auto';
    this.activePreset = 'living_presence';
    this.desiredPos = new THREE.Vector3(2.55, 1.58, 3.85);
    this.desiredTarget = new THREE.Vector3(0.85, 1.42, 0.65);
    this.desiredFov = focalLengthToVerticalFov(40);

    this.camera.position.copy(this.desiredPos);
    this.camera.fov = this.desiredFov;
    this.camera.updateProjectionMatrix();
  }

  setPreset(presetName, reducedMotion = false) {
    this.activePreset = presetName;
    this.manualUserHoldSec = 0;
    if (reducedMotion) {
      this._snapImmediately();
    }
  }

  setManualSelect(value, reducedMotion = false) {
    this.mode = value;
    this.manualUserHoldSec = 0;
    if (value !== 'auto') {
      this.activePreset = value;
      if (reducedMotion) this._snapImmediately();
    }
  }

  _computeComposition(jarvis) {
    const jPos = jarvis.root.position;
    const jYaw = jarvis.root.rotation.y;
    const fwd = new THREE.Vector3(Math.sin(jYaw), 0, Math.cos(jYaw));
    const right = new THREE.Vector3(Math.cos(jYaw), 0, -Math.sin(jYaw));
    const preset = this.mode === 'auto' ? this.activePreset : this.mode;

    // If JARVIS is actively walking/running across the hall in auto mode, smoothly track her!
    if (this.mode === 'auto' && jarvis.waypoints.length > 0 && preset !== 'wide_sanctuary') {
      this.desiredFov = focalLengthToVerticalFov(35);
      this.desiredPos.set(jPos.x + fwd.x * 2.9 + right.x * 1.15, 1.62, jPos.z + fwd.z * 2.9 + right.z * 1.15);
      this.desiredTarget.set(jPos.x, 1.38, jPos.z);
      return;
    }

    switch (preset) {
      case 'arrival_wake':
        this.desiredFov = focalLengthToVerticalFov(35);
        this.desiredPos.set(2.9, 1.68, 4.6);
        this.desiredTarget.set(0.45, 1.38, 0.35);
        break;

      case 'conversation':
        // Intimate-yet-respectful 65mm eye-level conversational composition
        this.desiredFov = focalLengthToVerticalFov(60);
        this.desiredPos.set(
          jPos.x + fwd.x * 1.95 + right.x * 0.25,
          1.58,
          jPos.z + fwd.z * 1.95 + right.z * 0.25
        );
        this.desiredTarget.set(jPos.x, 1.52, jPos.z);
        break;

      case 'follow_jarvis':
        this.desiredFov = focalLengthToVerticalFov(35);
        this.desiredPos.set(jPos.x + fwd.x * 2.85 + right.x * 0.9, 1.6, jPos.z + fwd.z * 2.85 + right.z * 0.9);
        this.desiredTarget.set(jPos.x, 1.38, jPos.z);
        break;

      case 'scenario_stage':
        // Wide 28mm volumetric stage framing capturing both JARVIS and room-scale 3D reconstruction
        this.desiredFov = focalLengthToVerticalFov(28);
        this.desiredPos.set(0.25, 1.78, 5.65);
        this.desiredTarget.set(0.0, 1.42, 1.65);
        break;

      case 'video_presentation':
        // Places Media Wall cleanly on left/center and JARVIS beside it on right (never blocking!)
        this.desiredFov = focalLengthToVerticalFov(35);
        this.desiredPos.set(2.55, 1.65, -1.65);
        this.desiredTarget.set(5.65, 1.58, -5.2);
        break;

      case 'memory_archive':
        this.desiredFov = focalLengthToVerticalFov(40);
        this.desiredPos.set(-3.4, 1.62, 0.65);
        this.desiredTarget.set(-6.8, 1.5, -1.35);
        break;

      case 'research':
        this.desiredFov = focalLengthToVerticalFov(40);
        this.desiredPos.set(-3.1, 1.6, -3.2);
        this.desiredTarget.set(-5.9, 1.48, -6.3);
        break;

      case 'goals_projects':
        this.desiredFov = focalLengthToVerticalFov(38);
        this.desiredPos.set(-1.3, 1.62, -4.1);
        this.desiredTarget.set(-2.8, 1.5, -7.6);
        break;

      case 'collaboration':
        this.desiredFov = focalLengthToVerticalFov(38);
        this.desiredPos.set(1.3, 1.62, -4.0);
        this.desiredTarget.set(3.0, 1.45, -7.5);
        break;

      case 'security_alert':
        this.desiredFov = focalLengthToVerticalFov(35);
        this.desiredPos.set(3.6, 1.6, 2.2);
        this.desiredTarget.set(7.2, 1.5, 0.5);
        break;

      case 'vision_station':
        this.desiredFov = focalLengthToVerticalFov(40);
        this.desiredPos.set(3.2, 1.58, 2.6);
        this.desiredTarget.set(6.2, 1.48, 4.9);
        break;

      case 'diagnostics':
        this.desiredFov = focalLengthToVerticalFov(40);
        this.desiredPos.set(-3.2, 1.58, 2.6);
        this.desiredTarget.set(-6.2, 1.48, 4.9);
        break;

      case 'compute_connections':
        this.desiredFov = focalLengthToVerticalFov(40);
        this.desiredPos.set(1.1, 1.6, 4.1);
        this.desiredTarget.set(2.9, 1.45, 7.2);
        break;

      case 'owner_switches':
        this.desiredFov = focalLengthToVerticalFov(42);
        this.desiredPos.set(-1.1, 1.58, 4.1);
        this.desiredTarget.set(-2.9, 1.38, 7.2);
        break;

      case 'hologram_prism':
        this.desiredFov = focalLengthToVerticalFov(45);
        this.desiredPos.set(jPos.x + fwd.x * 2.95, 1.35, jPos.z + fwd.z * 2.95);
        this.desiredTarget.set(jPos.x, 1.08, jPos.z);
        break;

      case 'wide_sanctuary':
        this.desiredFov = focalLengthToVerticalFov(24);
        this.desiredPos.set(0.0, 2.65, 9.2);
        this.desiredTarget.set(0.0, 1.35, -0.5);
        break;

      case 'living_presence':
      default:
        this.desiredFov = focalLengthToVerticalFov(40);
        this.desiredPos.set(2.65, 1.62, 3.85);
        this.desiredTarget.set(0.65, 1.38, 0.45);
        break;
    }

    // Clamp inside architectural walls (radius <= 10.6m, height >= 0.95m) to prevent wall clipping
    const radial = Math.hypot(this.desiredPos.x, this.desiredPos.z);
    if (radial > 10.4) {
      const s = 10.4 / radial;
      this.desiredPos.x *= s;
      this.desiredPos.z *= s;
    }
    this.desiredPos.y = THREE.MathUtils.clamp(this.desiredPos.y, 0.95, 5.5);
  }

  _snapImmediately() {
    this.camera.position.copy(this.desiredPos);
    this.controls.target.copy(this.desiredTarget);
    this.camera.fov = this.desiredFov;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  update(dt, jarvis, reducedMotion = false) {
    this._computeComposition(jarvis);

    if (this.manualUserHoldSec > 0) {
      this.manualUserHoldSec -= dt;
      this.controls.update();
      return;
    }

    const alpha = reducedMotion ? 1.0 : 1.0 - Math.exp(-dt * 2.8);
    this.camera.position.lerp(this.desiredPos, alpha);
    this.controls.target.lerp(this.desiredTarget, alpha);

    if (Math.abs(this.camera.fov - this.desiredFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.desiredFov, alpha);
      this.camera.updateProjectionMatrix();
    }
    this.controls.update();
  }
}
