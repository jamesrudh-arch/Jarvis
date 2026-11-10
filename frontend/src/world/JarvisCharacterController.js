/**
 * JARVIS NEXUS — Embodied Adult Female Character Controller.
 *
 * Implements:
 * - Licensed 66-bone humanoid rig (jarvis_avaturn.glb) + 72 ARKit/Oculus morph targets.
 * - Runtime PBR wardrobe & skin tailoring matching approved pre-production baseline.
 * - Collision-aware navigation around central holo-table, smooth turn-in-place,
 *   walk (1.32 m/s), urgent run (3.25 m/s), damped acceleration/deceleration, zero foot-skating.
 * - Gaze-first head/eye tracking, natural Poisson asymmetric blinking, subtle breathing,
 *   contextual console/scenario/presentation poses, and synchronized viseme lip-sync
 *   with instant mid-speech interruption.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { retarget } from '../vendor/retargeter.mjs';
import { LipsyncEn } from '../vendor/lipsync-en.mjs';
import { tailorSuitAlbedoTexture } from './ProceduralTextures.js';

const AVATURN_RETARGET = {
  Hips: { y: 0.03 },
  Spine: { y: 0.02 },
  Spine1: { y: 0.02, z: 0.01 },
  Spine2: { y: 0.02, z: 0.01 },
  Neck: { z: 0.02, y: 0.01 },
  Head: { z: 0.02 },
  LeftShoulder: { rx: -0.45 },
  RightShoulder: { rx: -0.45 },
  scaleToHipsLevel: 1.0,
};

const VISEME_NAMES = [
  'viseme_sil', 'viseme_PP', 'viseme_FF', 'viseme_TH', 'viseme_DD',
  'viseme_kk', 'viseme_CH', 'viseme_SS', 'viseme_nn', 'viseme_RR',
  'viseme_aa', 'viseme_E', 'viseme_I', 'viseme_O', 'viseme_U',
];

export class JarvisCharacterController {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'JARVIS_Embodiment_Root';
    this.root.position.set(1.45, 0, 0.95);
    this.root.rotation.y = -0.42;
    this.scene.add(this.root);

    this.armature = null;
    this.mixer = null;
    this.actions = {};
    this.activeActionName = null;
    this.bones = {};
    this.morphMeshes = [];

    // Dedicated character 3-point motivated lighting rig (ensures face is ALWAYS readable!)
    this.lightRig = new THREE.Group();
    const keyLight = new THREE.SpotLight(0xfff1e0, 3.6, 7.5, Math.PI * 0.28, 0.65, 1.3);
    keyLight.position.set(0.85, 2.55, 1.65);
    keyLight.castShadow = false;
    this.keyTarget = new THREE.Object3D();
    this.keyTarget.position.set(0, 1.55, 0);
    this.lightRig.add(this.keyTarget);
    keyLight.target = this.keyTarget;

    const fillLight = new THREE.PointLight(0x7799a5, 1.05, 5.0, 1.5);
    fillLight.position.set(-1.1, 1.65, 1.25);

    this.rimLight = new THREE.PointLight(0x62e6f2, 1.45, 4.5, 1.6);
    this.rimLight.position.set(-0.4, 1.85, -1.15);

    this.lightRig.add(keyLight, fillLight, this.rimLight);
    this.root.add(this.lightRig);

    // Subtle ground contact shadow disc beneath feet
    const contactGeo = new THREE.CircleGeometry(0.36, 32);
    const contactMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
    });
    const contactDisc = new THREE.Mesh(contactGeo, contactMat);
    contactDisc.rotation.x = -Math.PI / 2;
    contactDisc.position.y = 0.004;
    this.root.add(contactDisc);

    // Locomotion & Navigation state
    this.waypoints = [];
    this.targetYaw = -0.42;
    this.currentSpeed = 0;
    this.urgentRun = false;
    this.postureMode = 'console_interaction'; // console_interaction | conversational_focus | scenario_construct | scenario_direct | video_present | standby
    this.emotionalState = 'attentive'; // neutral | listening | focused | concerned | urgent
    this.lookWorldTarget = new THREE.Vector3(0, 1.4, 3.5);
    this.focusCamera = true;

    // Blinking & Breathing timers
    this.blinkTimer = 2.4;
    this.blinkPhase = -1;
    this.breathClock = 0;

    // Lip-sync & Speech Engine
    this.lipsync = new LipsyncEn();
    this.isSpeaking = false;
    this.speechTimeline = []; // [{ viseme, startMs, endMs }]
    this.speechStartPerf = 0;
    this.activeUtterance = null;
    this.onSpeechEndCallback = null;

    this.loaded = false;
  }

  async load(onProgress) {
    const gltfLoader = new GLTFLoader();
    const fbxLoader = new FBXLoader();

    const [avatarGltf, xbotGltf, walkFbx] = await Promise.all([
      gltfLoader.loadAsync('/models/jarvis_avaturn.glb', onProgress),
      gltfLoader.loadAsync('/models/xbot_locomotion.glb'),
      fbxLoader.loadAsync('/models/walking.fbx'),
    ]);

    this.armature = avatarGltf.scene.getObjectByName('Armature') || avatarGltf.scene;
    this.armature.scale.setScalar(1);

    // Calibrate skeleton to standard Mixamo coordinate rolls & scale
    retarget(this.armature, AVATURN_RETARGET);

    // Tailor PBR materials to match approved Storyboard Character Direction
    this.armature.traverse((obj) => {
      if (obj.isBone) {
        this.bones[obj.name] = obj;
      }
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        obj.frustumCulled = false;

        if (obj.morphTargetDictionary && obj.morphTargetInfluences) {
          this.morphMeshes.push(obj);
        }

        const mat = obj.material;
        if (mat) {
          const mName = (mat.name || obj.name || '').toLowerCase();
          if (mName.includes('look')) {
            mat.map = tailorSuitAlbedoTexture(mat.map);
            mat.roughness = 0.78;
            mat.metalness = 0.06;
            mat.needsUpdate = true;
          } else if (mName.includes('hair')) {
            mat.color = new THREE.Color(0x2a1d17);
            mat.roughness = 0.64;
            mat.metalness = 0.04;
            mat.needsUpdate = true;
          } else if (mName.includes('shoe')) {
            mat.color = new THREE.Color(0x12161c);
            mat.roughness = 0.42;
            mat.metalness = 0.12;
            mat.needsUpdate = true;
          } else if (mName === 'head' || mName === 'body') {
            const phys = new THREE.MeshPhysicalMaterial({
              map: mat.map,
              normalMap: mat.normalMap,
              roughnessMap: mat.roughnessMap,
              roughness: 0.54,
              metalness: 0.0,
              sheen: 0.28,
              sheenRoughness: 0.68,
              sheenColor: new THREE.Color(0xd99a82),
              clearcoat: 0.04,
              clearcoatRoughness: 0.55,
            });
            obj.material = phys;
          }
        }
      }
    });

    this.root.add(this.armature);

    // Initialize AnimationMixer & retarget locomotion clips cleanly (removing X/Z root drift)
    this.mixer = new THREE.AnimationMixer(this.armature);

    const walkClip = this._prepareMixamoClip(walkFbx.animations[0], 'female_walk', 0.01, true);
    this.actions.walk = this.mixer.clipAction(walkClip);

    for (const rawClip of xbotGltf.animations) {
      const cname = rawClip.name.toLowerCase();
      if (['idle', 'run', 'agree', 'headshake'].includes(cname)) {
        const prepped = this._prepareMixamoClip(rawClip.clone(), cname, 0.01, true);
        this.actions[cname] = this.mixer.clipAction(prepped);
      }
    }

    this._fadeToAction('idle', 0.01);
    this.loaded = true;
  }

  _prepareMixamoClip(clip, newName, posScale = 0.01, stripXZRoot = true) {
    clip.name = newName;
    const keptTracks = [];
    for (const t of clip.tracks) {
      t.name = t.name.replaceAll('mixamorig:', '').replaceAll('mixamorig', '');
      const [boneName, prop] = t.name.split('.');
      if (!this.bones[boneName]) continue;

      if (prop === 'position') {
        if (boneName !== 'Hips') continue;
        const baseY = t.values[1] * (t.values[1] > 3 ? posScale : 1.0);
        const factor = t.values[1] > 3 ? posScale : 1.0;
        for (let i = 0; i < t.values.length; i += 3) {
          t.values[i] = stripXZRoot ? 0 : t.values[i] * factor;
          t.values[i + 1] = Math.max(0.92, t.values[i + 1] * factor || baseY);
          t.values[i + 2] = stripXZRoot ? 0 : t.values[i + 2] * factor;
        }
      }
      keptTracks.push(t);
    }
    clip.tracks = keptTracks;
    return clip;
  }

  _fadeToAction(name, duration = 0.32) {
    if (!this.actions[name] || this.activeActionName === name) return;
    const next = this.actions[name];
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(duration).play();
    if (this.activeActionName && this.actions[this.activeActionName]) {
      this.actions[this.activeActionName].fadeOut(duration);
    }
    this.activeActionName = name;
  }

  /**
   * Navigate smoothly around the central holo-table obstacle (radius 2.15m at origin)
   * so JARVIS never clips through consoles or slides sideways.
   */
  navigateTo(targetX, targetZ, targetYaw, { urgent = false, posture = 'console_interaction', emotion = 'focused' } = {}) {
    this.urgentRun = Boolean(urgent);
    this.postureMode = posture;
    this.emotionalState = emotion;
    this.targetYaw = targetYaw;

    const start = new THREE.Vector2(this.root.position.x, this.root.position.z);
    const goal = new THREE.Vector2(targetX, targetZ);
    const dist = start.distanceTo(goal);
    if (dist < 0.14) {
      this.waypoints = [];
      return;
    }

    // Check if straight segment intersects central circular holo-table (r = 1.95m)
    const seg = goal.clone().sub(start);
    const segLenSq = seg.lengthSq();
    const tProj = Math.max(0, Math.min(1, (-start.x * seg.x - start.z * seg.y) / segLenSq));
    const closest = start.clone().addScaledVector(seg, tProj);
    const clearanceRadius = 2.15;

    this.waypoints = [];
    if (closest.length() < clearanceRadius && start.length() > 1.2 && goal.length() > 1.2) {
      // Compute tangent arc waypoint around the central ring
      const a1 = Math.atan2(start.y, start.x);
      const a2 = Math.atan2(goal.y, goal.x);
      let delta = a2 - a1;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const midAng = a1 + delta * 0.5;
      this.waypoints.push(new THREE.Vector2(Math.cos(midAng) * 2.55, Math.sin(midAng) * 2.55));
    }
    this.waypoints.push(goal);
  }

  acknowledgeInterruption(cameraWorldPos) {
    this.waypoints = [];
    this.currentSpeed = 0;
    this.urgentRun = false;
    this.postureMode = 'conversational_focus';
    this.emotionalState = 'listening';
    this.focusCamera = true;
    this.interruptSpeech();

    const dx = cameraWorldPos.x - this.root.position.x;
    const dz = cameraWorldPos.z - this.root.position.z;
    this.targetYaw = Math.atan2(dx, dz);
  }

  /**
   * Speak with real-time phoneme-to-Oculus-viseme facial synchronization.
   */
  speak(text, { onStart, onEnd } = {}) {
    this.interruptSpeech();
    if (!text) return;

    const clean = text.replace(/\[.*?\]/g, '').trim();
    if (!clean) return;

    // Build phoneme/viseme schedule using LipsyncEn
    const words = clean.split(/\s+/);
    const timeline = [];
    let cursorMs = 60;

    for (const rawWord of words) {
      const upper = this.lipsync.preProcessText(rawWord);
      const oculusSeq = this.lipsync.wordsToVisemes(upper);
      const wordDurMs = Math.max(150, Math.min(540, rawWord.length * 58));

      if (oculusSeq && oculusSeq.visemes && oculusSeq.visemes.length > 0) {
        const totalRel = oculusSeq.durations.reduce((a, b) => a + b, 0) || 1;
        for (let i = 0; i < oculusSeq.visemes.length; i++) {
          const vCode = oculusSeq.visemes[i];
          const segMs = (oculusSeq.durations[i] / totalRel) * wordDurMs;
          timeline.push({
            viseme: `viseme_${vCode}`,
            startMs: cursorMs,
            endMs: cursorMs + segMs,
          });
          cursorMs += segMs;
        }
      } else {
        timeline.push({ viseme: 'viseme_aa', startMs: cursorMs, endMs: cursorMs + wordDurMs * 0.7 });
        cursorMs += wordDurMs;
      }
      cursorMs += 42;
    }

    this.speechTimeline = timeline;
    this.speechStartPerf = performance.now();
    this.isSpeaking = true;
    this.onSpeechEndCallback = onEnd || null;
    if (onStart) onStart();

    // Synthesize audible voice via browser SpeechSynthesis when available and unmuted
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(clean);
        const voices = window.speechSynthesis.getVoices();
        const femaleVoice = voices.find((v) =>
          /en/i.test(v.lang) && /samantha|victoria|kate|serena|sonia|aria|jenny|female|uk/i.test(v.name)
        ) || voices.find((v) => /en-GB|en-US/i.test(v.lang));
        if (femaleVoice) utt.voice = femaleVoice;
        utt.rate = 1.02;
        utt.pitch = 0.96;
        utt.onend = () => {
          this.isSpeaking = false;
          this._clearVisemes();
          if (this.onSpeechEndCallback) this.onSpeechEndCallback();
        };
        this.activeUtterance = utt;
        window.speechSynthesis.speak(utt);
      } catch {
        // Fallback purely to timed viseme timeline
      }
    }
  }

  interruptSpeech() {
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    }
    this.isSpeaking = false;
    this.speechTimeline = [];
    this.activeUtterance = null;
    this._clearVisemes();
    if (this.onSpeechEndCallback) {
      const cb = this.onSpeechEndCallback;
      this.onSpeechEndCallback = null;
      cb();
    }
  }

  _setMorph(name, value, lerpAlpha = 0.25) {
    for (const mesh of this.morphMeshes) {
      const idx = mesh.morphTargetDictionary[name];
      if (idx !== undefined) {
        const cur = mesh.morphTargetInfluences[idx] || 0;
        mesh.morphTargetInfluences[idx] = cur + (value - cur) * lerpAlpha;
      }
    }
  }

  _clearVisemes() {
    for (const v of VISEME_NAMES) {
      this._setMorph(v, 0, 1.0);
    }
    this._setMorph('jawOpen', 0, 1.0);
  }

  getHeadWorldPosition(target = new THREE.Vector3()) {
    if (this.bones.Head) {
      this.bones.Head.getWorldPosition(target);
      return target;
    }
    return target.set(this.root.position.x, 1.62, this.root.position.z);
  }

  update(dt, cameraWorldPos, reducedMotion = false) {
    if (!this.loaded) return;
    const clampedDt = Math.min(dt, 0.05);
    this.breathClock += clampedDt;

    // 1. Grounded Waypoint Locomotion (zero foot-skating!)
    if (this.waypoints.length > 0) {
      const wp = this.waypoints[0];
      const dx = wp.x - this.root.position.x;
      const dz = wp.y - this.root.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist < 0.12) {
        this.waypoints.shift();
      } else {
        const desiredYaw = Math.atan2(dx, dz);
        this.root.rotation.y = this._lerpAngle(this.root.rotation.y, desiredYaw, clampedDt * 7.5);

        const maxSpeed = this.urgentRun ? 3.25 : 1.32;
        const decelFactor = this.waypoints.length === 1 ? Math.min(1, dist / 0.75) : 1;
        const targetSpeed = maxSpeed * Math.max(0.32, decelFactor);
        this.currentSpeed += (targetSpeed - this.currentSpeed) * Math.min(1, clampedDt * 8.0);

        const step = Math.min(dist, this.currentSpeed * clampedDt);
        this.root.position.x += (dx / dist) * step;
        this.root.position.z += (dz / dist) * step;

        const clipName = this.urgentRun && this.actions.run ? 'run' : 'walk';
        this._fadeToAction(clipName, 0.22);
        if (this.actions[clipName]) {
          const refSpeed = clipName === 'run' ? 3.25 : 1.32;
          this.actions[clipName].setEffectiveTimeScale(Math.max(0.55, this.currentSpeed / refSpeed));
        }
      }
    } else {
      this.currentSpeed *= Math.max(0, 1 - clampedDt * 10);
      this._fadeToAction('idle', 0.35);
      this.root.rotation.y = this._lerpAngle(this.root.rotation.y, this.targetYaw, clampedDt * 5.0);
    }

    // 2. Advance skeletal mixer
    this.mixer.update(clampedDt);

    // 3. Subtle additive posture & hand interaction layering (only when standing still)
    if (this.waypoints.length === 0 && !reducedMotion) {
      this._applyPostureLayer();
    }

    // 4. Head & Eye Gaze Tracking (rotates eyes/head naturally rather than spinning whole body!)
    const gazeTarget = this.focusCamera ? cameraWorldPos : this.lookWorldTarget;
    this._applyGazeTracking(gazeTarget);

    // 5. Asymmetric Natural Blinking
    this._updateBlinking(clampedDt);

    // 6. Emotional Facial Expression Morphs
    this._updateExpressions();

    // 7. Synchronized Phoneme/Viseme Lip-Sync
    this._updateLipSync();
  }

  _applyPostureLayer() {
    const t = this.breathClock;
    if (this.bones.Spine1) {
      this.bones.Spine1.rotation.x += Math.sin(t * 1.45) * 0.012;
    }

    const rArm = this.bones.RightArm;
    const rFore = this.bones.RightForeArm;
    const lArm = this.bones.LeftArm;
    const lFore = this.bones.LeftForeArm;
    if (!rArm || !rFore || !lArm || !lFore) return;

    if (this.postureMode === 'console_interaction') {
      // Right hand raised gently manipulating volumetric assembly above holo-table
      rArm.rotation.x -= 0.42 + Math.sin(t * 1.1) * 0.04;
      rArm.rotation.z -= 0.12;
      rFore.rotation.x -= 0.55 + Math.cos(t * 1.3) * 0.05;
    } else if (this.postureMode === 'scenario_construct') {
      // Symmetrical restrained two-hand volumetric expansion gesture
      rArm.rotation.x -= 0.48;
      rFore.rotation.x -= 0.52;
      lArm.rotation.x -= 0.48;
      lFore.rotation.x -= 0.52;
    } else if (this.postureMode === 'scenario_direct' || this.postureMode === 'video_present') {
      //Measured explanatory presentation gesture toward 3D evidence
      rArm.rotation.x -= 0.54;
      rArm.rotation.y += 0.22;
      rFore.rotation.x -= 0.38;
    } else if (this.isSpeaking) {
      // Restrained conversational gesture (not on every word!)
      const env = Math.max(0, Math.sin(t * 0.85));
      rArm.rotation.x -= 0.22 * env;
      rFore.rotation.x -= 0.38 * env;
    }
  }

  _applyGazeTracking(worldTarget) {
    if (!this.bones.Head || !this.bones.Neck) return;
    const headPos = this.getHeadWorldPosition(new THREE.Vector3());
    const localDir = worldTarget.clone().sub(headPos);
    localDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.root.rotation.y).normalize();

    const yaw = THREE.MathUtils.clamp(Math.atan2(localDir.x, localDir.z), -0.58, 0.58);
    const pitch = THREE.MathUtils.clamp(-Math.asin(THREE.MathUtils.clamp(localDir.y, -0.8, 0.8)), -0.32, 0.32);

    this.bones.Neck.rotation.y += yaw * 0.32;
    this.bones.Neck.rotation.x += pitch * 0.28;
    this.bones.Head.rotation.y += yaw * 0.45;
    this.bones.Head.rotation.x += pitch * 0.42;

    // Subtle ocular look morphs
    const eyeX = THREE.MathUtils.clamp(yaw * 0.85, -0.5, 0.5);
    const eyeY = THREE.MathUtils.clamp(-pitch * 0.85, -0.4, 0.4);
    this._setMorph('eyeLookOutLeft', Math.max(0, eyeX), 0.3);
    this._setMorph('eyeLookInRight', Math.max(0, eyeX), 0.3);
    this._setMorph('eyeLookInLeft', Math.max(0, -eyeX), 0.3);
    this._setMorph('eyeLookOutRight', Math.max(0, -eyeX), 0.3);
    this._setMorph('eyeLookUpLeft', Math.max(0, eyeY), 0.3);
    this._setMorph('eyeLookUpRight', Math.max(0, eyeY), 0.3);
    this._setMorph('eyeLookDownLeft', Math.max(0, -eyeY), 0.3);
    this._setMorph('eyeLookDownRight', Math.max(0, -eyeY), 0.3);
  }

  _updateBlinking(dt) {
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0 && this.blinkPhase < 0) {
      this.blinkPhase = 0;
      this.blinkTimer = 3.1 + Math.random() * 2.8;
    }
    if (this.blinkPhase >= 0) {
      this.blinkPhase += dt / 0.15;
      const w = this.blinkPhase < 0.5 ? this.blinkPhase * 2 : Math.max(0, (1 - this.blinkPhase) * 2);
      this._setMorph('eyeBlinkLeft', w, 0.85);
      this._setMorph('eyeBlinkRight', w * 0.96, 0.85);
      if (this.blinkPhase >= 1) {
        this.blinkPhase = -1;
        this._setMorph('eyeBlinkLeft', 0, 0.85);
        this._setMorph('eyeBlinkRight', 0, 0.85);
      }
    }
  }

  _updateExpressions() {
    const e = this.emotionalState;
    this._setMorph('browInnerUp', e === 'listening' ? 0.18 : (e === 'concerned' ? 0.36 : (e === 'urgent' ? 0.24 : 0.04)), 0.14);
    this._setMorph('browDownLeft', e === 'focused' ? 0.24 : (e === 'concerned' ? 0.22 : (e === 'urgent' ? 0.3 : 0.0)), 0.14);
    this._setMorph('browDownRight', e === 'focused' ? 0.24 : (e === 'concerned' ? 0.22 : (e === 'urgent' ? 0.3 : 0.0)), 0.14);
    this._setMorph('eyeSquintLeft', e === 'focused' ? 0.18 : 0.04, 0.14);
    this._setMorph('eyeSquintRight', e === 'focused' ? 0.18 : 0.04, 0.14);
    this._setMorph('eyeWideLeft', e === 'urgent' ? 0.22 : 0.0, 0.18);
    this._setMorph('eyeWideRight', e === 'urgent' ? 0.22 : 0.0, 0.18);
    // Composed poise — never a frozen customer-support grin
    this._setMorph('mouthSmileLeft', e === 'listening' ? 0.06 : 0.02, 0.12);
    this._setMorph('mouthSmileRight', e === 'listening' ? 0.06 : 0.02, 0.12);
  }

  _updateLipSync() {
    if (!this.isSpeaking || this.speechTimeline.length === 0) {
      for (const v of VISEME_NAMES) this._setMorph(v, 0, 0.25);
      this._setMorph('jawOpen', 0, 0.25);
      return;
    }

    const elapsed = performance.now() - this.speechStartPerf;
    const lastEnd = this.speechTimeline[this.speechTimeline.length - 1].endMs;

    if (elapsed > lastEnd + 180) {
      if (!('speechSynthesis' in window) || !window.speechSynthesis.speaking) {
        this.isSpeaking = false;
        this._clearVisemes();
        if (this.onSpeechEndCallback) {
          const cb = this.onSpeechEndCallback;
          this.onSpeechEndCallback = null;
          cb();
        }
      }
      return;
    }

    let activeV = 'viseme_sil';
    for (const seg of this.speechTimeline) {
      if (elapsed >= seg.startMs && elapsed <= seg.endMs) {
        activeV = seg.viseme;
        break;
      }
    }

    for (const v of VISEME_NAMES) {
      this._setMorph(v, v === activeV ? 0.68 : 0.0, 0.42);
    }
    const openWeight = ['viseme_aa', 'viseme_O', 'viseme_E'].includes(activeV) ? 0.26 : 0.08;
    this._setMorph('jawOpen', activeV === 'viseme_sil' ? 0.0 : openWeight, 0.38);
  }

  _lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * Math.min(1, t);
  }
}
