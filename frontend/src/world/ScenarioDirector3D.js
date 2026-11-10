/**
 * JARVIS NEXUS — Volumetric 3D Scenario Director ("Let Me Show You").
 *
 * Inspired by Fuel VFX's Iron Man 3 volumetric forensic scene reconstruction:
 * - Constructs temporary room-scale 3D LiDAR point-cloud & wireframe scenes on the Stage.
 * - Spawns minimalist wireframe scenario actors (never extra permanent JARVIS identities).
 * - Animates timelines, pauses at critical moments, renders causal vectors, separates
 *   verified sensor facts (#DDFBFF / #62E6F2) from hypotheses (#E7AE5B), responds live
 *   to Owner variable sliders, and cleanly restores the original world afterward.
 */
import * as THREE from 'three';

export class ScenarioDirector3D {
  constructor(scene) {
    this.scene = scene;
    this.stageRoot = new THREE.Group();
    this.stageRoot.name = 'ScenarioDirector_StageRoot';
    this.stageRoot.visible = false;
    this.scene.add(this.stageRoot);

    // Interactive volumetric light cast onto JARVIS and floor during active scenarios
    this.stageLight = new THREE.PointLight(0x62e6f2, 0.0, 9.5, 1.5);
    this.stageLight.position.set(0, 1.85, 1.85);
    this.scene.add(this.stageLight);

    this.activeScenario = null;
    this.currentTime = 0;
    this.duration = 20;
    this.playing = false;
    this.playbackRate = 1.0;
    this.variables = {};
    this.dynamicRefs = {};
    this.worldAnchors = []; // [{ pos: Vector3, title, sub, amber }]
  }

  loadScenario(scenarioDef, runtimeState = {}) {
    this.clearStage();
    this.activeScenario = scenarioDef;
    this.duration = scenarioDef.duration_sec || 20.0;
    this.currentTime = runtimeState.current_time || 0.0;
    this.playing = runtimeState.playing !== undefined ? runtimeState.playing : true;
    this.playbackRate = runtimeState.playback_rate || 1.0;
    this.variables = { ...(runtimeState.variables || {}) };

    this.stageRoot.visible = true;
    this.stageLight.intensity = 2.4;

    const kind = scenarioDef.actors_props?.voxel_structure || 'cryo_manifold_riser';
    if (kind === 'cryo_manifold_riser') {
      this._buildCryoManifoldForensic();
    } else if (kind === 'dual_turbines') {
      this._buildDualTurbineComparison();
    } else {
      this._buildZeroTrustComputeTopology();
    }
  }

  clearStage() {
    while (this.stageRoot.children.length > 0) {
      const child = this.stageRoot.children[0];
      this.stageRoot.remove(child);
      child.traverse?.((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
    }
    this.dynamicRefs = {};
    this.worldAnchors = [];
    this.activeScenario = null;
    this.playing = false;
    this.stageRoot.visible = false;
    this.stageLight.intensity = 0.0;
  }

  updateVariables(vars) {
    this.variables = { ...this.variables, ...vars };
  }

  _buildCryoManifoldForensic() {
    // 1. 18,000-point Cyan LiDAR Voxel Cloud of Cryogenic Riser, Horizontal Cross-Header & Flange B-4
    const count = 18000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const cCyan = new THREE.Color(0x62e6f2);
    const cIce = new THREE.Color(0xddfbff);

    for (let i = 0; i < count; i++) {
      let x = 0, y = 0, z = 1.85;
      const r = Math.random();
      if (r < 0.48) {
        // Vertical cryogenic column riser
        const ang = Math.random() * Math.PI * 2;
        const rad = 0.24 + (Math.random() - 0.5) * 0.025;
        y = 0.15 + Math.random() * 2.85;
        x = Math.cos(ang) * rad + 0.15;
        z = 1.85 + Math.sin(ang) * rad;
      } else if (r < 0.82) {
        // Horizontal cross-manifold pipe
        const ang = Math.random() * Math.PI * 2;
        const rad = 0.18 + (Math.random() - 0.5) * 0.02;
        x = -1.65 + Math.random() * 3.3;
        y = 1.75 + Math.cos(ang) * rad;
        z = 1.85 + Math.sin(ang) * rad;
      } else {
        // Flange B-4 collar & floor scan grid points
        const ang = Math.random() * Math.PI * 2;
        const rad = 0.36 + Math.random() * 0.08;
        x = 0.15 + Math.cos(ang) * rad;
        y = 1.38 + (Math.random() - 0.5) * 0.14;
        z = 1.85 + Math.sin(ang) * rad;
      }
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const c = Math.random() > 0.82 ? cIce : cCyan;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const ptGeo = new THREE.BufferGeometry();
    ptGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    ptGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const ptMat = new THREE.PointsMaterial({
      size: 0.022,
      vertexColors: true,
      transparent: true,
      opacity: 0.84,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const voxelCloud = new THREE.Points(ptGeo, ptMat);
    this.stageRoot.add(voxelCloud);

    // 2. Two Minimalist Wireframe Scenario Actors + Motion Spline Ribbons
    const actorA = this._createWireframeScenarioActor(0x62e6f2);
    const actorB = this._createWireframeScenarioActor(0x62e6f2);
    this.stageRoot.add(actorA, actorB);

    // Motion trajectory splines
    for (const [sx, sz, ex, ez] of [[-2.2, 1.35, -0.95, 1.75], [2.15, 2.05, 1.25, 1.7]]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sx, 0.95, sz),
        new THREE.Vector3((sx + ex) * 0.5, 1.08, (sz + ez) * 0.5 + 0.18),
        new THREE.Vector3(ex, 1.02, ez),
      ]);
      const lineGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(40));
      const lineMat = new THREE.LineBasicMaterial({ color: 0x62e6f2, transparent: true, opacity: 0.45 });
      this.stageRoot.add(new THREE.Line(lineGeo, lineMat));
    }

    // 3. Amber Fracture Shards & Causal Force Vector Arrow at Flange B-4 (0.15, 1.42, 1.85)
    const burstGroup = new THREE.Group();
    burstGroup.position.set(0.15, 1.42, 1.85);
    const shardMat = new THREE.MeshBasicMaterial({
      color: 0xe7ae5b,
      wireframe: true,
      transparent: true,
      opacity: 0.9,
    });
    const shards = [];
    for (let s = 0; s < 26; s++) {
      const sGeo = new THREE.TetrahedronGeometry(0.04 + Math.random() * 0.08, 0);
      const mesh = new THREE.Mesh(sGeo, shardMat);
      const dir = new THREE.Vector3(
        0.35 + Math.random() * 0.9,
        (Math.random() - 0.35) * 0.8,
        (Math.random() - 0.3) * 0.7
      ).normalize();
      mesh.userData = { dir, speed: 0.25 + Math.random() * 0.65 };
      burstGroup.add(mesh);
      shards.push(mesh);
    }

    const arrow = new THREE.ArrowHelper(
      new THREE.Vector3(0.78, 0.34, 0.52).normalize(),
      new THREE.Vector3(0, 0, 0),
      0.95,
      0xe7ae5b,
      0.22,
      0.12
    );
    burstGroup.add(arrow);
    this.stageRoot.add(burstGroup);

    this.dynamicRefs = { kind: 'cryo', voxelCloud, actorA, actorB, burstGroup, shards, arrow };
    this.worldAnchors = [
      { pos: new THREE.Vector3(0.55, 1.72, 1.95), title: 'FLANGE B-4 ORIGIN · 210.4 MPa', sub: 'MEASURED FACT · STRAIN GAUGE SG-09', amber: true },
      { pos: new THREE.Vector3(-0.65, 2.35, 1.85), title: 'VALVE SEAT CAVITATION (410 Hz)', sub: 'INFERENCE · CONFIDENCE p=0.84', amber: false },
    ];
  }

  _buildDualTurbineComparison() {
    const createTurbine = (xOffset, colorHex) => {
      const grp = new THREE.Group();
      grp.position.set(xOffset, 1.42, 1.85);

      const shroud = new THREE.Mesh(
        new THREE.CylinderGeometry(0.68, 0.58, 1.05, 32, 4, true),
        new THREE.MeshBasicMaterial({ color: colorHex, wireframe: true, transparent: true, opacity: 0.42 })
      );
      shroud.rotation.x = Math.PI / 2;
      grp.add(shroud);

      const rotor = new THREE.Group();
      for (let b = 0; b < 16; b++) {
        const blade = new THREE.Mesh(
          new THREE.BoxGeometry(0.03, 0.54, 0.14),
          new THREE.MeshBasicMaterial({ color: colorHex, wireframe: true, transparent: true, opacity: 0.85 })
        );
        const ang = (b / 16) * Math.PI * 2;
        blade.position.set(Math.cos(ang) * 0.34, Math.sin(ang) * 0.34, 0);
        blade.rotation.z = ang;
        blade.rotation.y = xOffset < 0 ? 0.32 : 0.05; // Swept Variant A vs Straight Variant B
        rotor.add(blade);
      }
      grp.add(rotor);
      this.stageRoot.add(grp);
      return { grp, rotor };
    };

    const varA = createTurbine(-1.25, 0x62e6f2);
    const varB = createTurbine(1.25, 0xe7ae5b);
    this.dynamicRefs = { kind: 'turbines', varA, varB };
    this.worldAnchors = [
      { pos: new THREE.Vector3(-1.25, 2.25, 1.85), title: 'VARIANT A · SWEPT STATOR', sub: 'DATA-DRIVEN SIM · LAMINAR ATTACHED', amber: false },
      { pos: new THREE.Vector3(1.25, 2.25, 1.85), title: 'VARIANT B · STRAIGHT VANE', sub: 'HUB-CORNER VORTEX LOSS +3.1%', amber: true },
    ];
  }

  _buildZeroTrustComputeTopology() {
    const nodes = [
      { pos: [-1.8, 1.4, 1.85], color: 0xddfbff, label: 'SANCTUARY CORE' },
      { pos: [0.0, 1.75, 1.85], color: 0x62e6f2, label: 'LOCAL 4-BIT CUDA' },
      { pos: [1.8, 1.4, 1.85], color: 0x62e6f2, label: 'PRIVATE KAGGLE T4x2' },
    ];
    const meshes = [];
    for (const n of nodes) {
      const m = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.28, 1),
        new THREE.MeshBasicMaterial({ color: n.color, wireframe: true })
      );
      m.position.set(...n.pos);
      this.stageRoot.add(m);
      meshes.push(m);
    }

    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1.8, 1.4, 1.85),
      new THREE.Vector3(0.0, 1.75, 1.85),
      new THREE.Vector3(-1.8, 1.4, 1.85),
      new THREE.Vector3(1.8, 1.4, 1.85),
    ]);
    const tunnelLines = new THREE.LineSegments(
      lineGeo,
      new THREE.LineBasicMaterial({ color: 0x62e6f2, transparent: true, opacity: 0.75 })
    );
    this.stageRoot.add(tunnelLines);

    this.dynamicRefs = { kind: 'zerotrust', meshes, tunnelLines };
    this.worldAnchors = [
      { pos: new THREE.Vector3(0, 2.25, 1.85), title: 'ZERO-TRUST OUTBOUND WSS', sub: 'ARCHITECTURAL ILLUSTRATION · 0 PUBLIC PORTS', amber: false },
    ];
  }

  _createWireframeScenarioActor(colorHex) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: colorHex, wireframe: true, transparent: true, opacity: 0.52 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), mat);
    head.position.y = 1.64;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.58, 10, 2), mat);
    torso.position.y = 1.22;
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.88, 8, 2), mat);
    legs.position.y = 0.46;
    g.add(head, torso, legs);
    return g;
  }

  update(dt) {
    if (!this.activeScenario || !this.stageRoot.visible) return;
    if (this.playing) {
      this.currentTime = (this.currentTime + dt * this.playbackRate) % this.duration;
    }

    const normT = this.currentTime / Math.max(1, this.duration);
    const refs = this.dynamicRefs;

    if (refs.kind === 'cryo') {
      const pLine = Number(this.variables.line_pressure_mpa ?? 210);
      const delayMs = Number(this.variables.relief_valve_ms ?? 125);
      const mitigated = pLine < 185 || delayMs <= 70;

      // Animate wireframe actors along inspection vectors
      refs.actorA.position.set(
        THREE.MathUtils.lerp(-2.1, -1.05, Math.min(1, normT * 1.5)),
        0,
        THREE.MathUtils.lerp(1.4, 1.75, Math.min(1, normT * 1.5))
      );
      refs.actorA.rotation.y = 1.25;
      refs.actorB.position.set(
        THREE.MathUtils.lerp(2.0, 1.35, Math.min(1, normT * 1.4)),
        0,
        THREE.MathUtils.lerp(1.9, 1.65, Math.min(1, normT * 1.4))
      );
      refs.actorB.rotation.y = -1.35;

      // Animate fracture shards only after t=10.5s if NOT mitigated
      const burstProgress = mitigated ? 0.04 : Math.max(0, (this.currentTime - 9.5) / 8.0);
      refs.burstGroup.visible = !mitigated || this.currentTime > 8.0;
      refs.arrow.setColor(new THREE.Color(mitigated ? 0x62e6f2 : 0xe7ae5b));
      for (const sh of refs.shards) {
        sh.position.copy(sh.userData.dir).multiplyScalar(burstProgress * sh.userData.speed);
        sh.rotation.x = burstProgress * 3.2;
      }
      this.stageLight.color.setHex(mitigated ? 0x62e6f2 : (this.currentTime > 9.5 ? 0xe7ae5b : 0x62e6f2));
    } else if (refs.kind === 'turbines') {
      const rpm = Number(this.variables.rotor_rpm ?? 11500);
      const omega = (rpm / 11500) * 5.2;
      refs.varA.rotor.rotation.z += dt * omega;
      refs.varB.rotor.rotation.z += dt * omega * 0.94;
    } else if (refs.kind === 'zerotrust') {
      const exposed = Number(this.variables.expose_public_port ?? 0) >= 1;
      refs.tunnelLines.material.color.setHex(exposed ? 0xff6b67 : 0x62e6f2);
      for (const m of refs.meshes) m.rotation.y += dt * 0.7;
    }
  }
}
