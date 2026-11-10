/**
 * JARVIS NEXUS — Real-Time 3D Architectural Sanctuary & Holographic Projection Engine.
 *
 * Builds all 12 spatial zones in restrained cinematic realism (#02070B / #06121A / #62E6F2):
 * 1. Central Operations Circular Obsidian Holo-Ring + Volumetric Assembly
 * 2. Volumetric Simulation & Scenario Stage
 * 3. Memory Archive Crystalline Colonnade (5 optical glass columns + 3D knowledge nodes)
 * 4. Live Research Alcove (Z-depth optical literature planes)
 * 5. Goals & Ongoing Work Bay (Z-depth dependency DAG)
 * 6. Multi-Agent Collaboration Table (4 rotating geometric specialist workspaces)
 * 7. Frameless 4.8m Architectural Media Wall + Extracted 3D Volumetric Twin
 * 8. Defensive Security Bulkhead Vault + 3D Geodesic Perimeter Lattice
 * 9. Vision & Optical Input Station (explicit live capture badge)
 * 10. Diagnostics & Telemetry Station
 * 11. Local PC & Private Kaggle Compute Routing Bay
 * 12. Seven-Channel Physical Hardware Switch Console & Embodiment Pedestal
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import {
  createBasaltTextures,
  createHonedSlateFloorTextures,
  SchlierenFeedRenderer,
} from './ProceduralTextures.js';
import { JarvisCharacterController } from './JarvisCharacterController.js';
import { ScenarioDirector3D } from './ScenarioDirector3D.js';
import { CameraDirector } from './CameraDirector.js';

export class NexusSanctuaryScene {
  constructor(canvas, labelsContainer) {
    this.canvas = canvas;
    this.labelsContainer = labelsContainer;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true, // Supports WebM recording & frame extraction
    });
    const isMobile = window.innerWidth <= 860;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.35 : 2.0));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02070b);
    this.scene.fog = new THREE.FogExp2(0x02070b, 0.032); // Subtle depth, never obscuring JARVIS

    // Subtle PBR environment reflection map (low intensity so surfaces don't look glossy plastic)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.24;

    this.camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.1, 65);
    this.cameraDirector = new CameraDirector(this.camera, this.canvas);

    // Post-processing with strictly restrained bloom (only high-luminance volumetric filaments glow)
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.24, // strength
      0.34, // radius
      0.84  // high threshold so skin & dark stone stay crisp
    );
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    // Architecture & Interactive Station Groups
    this.architectureGroup = new THREE.Group();
    this.scene.add(this.architectureGroup);

    this.schlierenFeed = new SchlierenFeedRenderer();
    this.mediaScreenMat = null;
    this.extracted3DTwinGroup = null;
    this.centerHoloAssembly = null;
    this.securityLattice = null;
    this.agentSolids = [];
    this.switchLevers = {};
    this.visionBoardCtx = null;
    this.visionBoardTex = null;
    this.telemetryBoardCtx = null;
    this.telemetryBoardTex = null;

    this._buildArchitecturalShellAndLighting();
    this._buildAllTwelveZones();

    // Living Character & Scenario Director
    this.jarvis = new JarvisCharacterController(this.scene);
    this.scenarioDirector = new ScenarioDirector3D(this.scene);

    // Holographic Mode State (Mode 15)
    this.hologramMode = false;
    this.hologramLayout = 'peppers_ghost'; // peppers_ghost | pyramid_4face | direct_black
    this.pyramidCam = new THREE.PerspectiveCamera(38, 1, 0.1, 30);

    this.reducedMotion = false;
    this.embodimentEnabled = true;

    window.addEventListener('resize', () => this.onResize());
  }

  async initCharacter(onProgress) {
    await this.jarvis.load(onProgress);
  }

  _buildArchitecturalShellAndLighting() {
    const basalt = createBasaltTextures();
    const slate = createHonedSlateFloorTextures();

    // 1. Honed Dark Obsidian Slate Floor (28m diameter)
    const floorMat = new THREE.MeshStandardMaterial({
      map: slate.map,
      roughnessMap: slate.roughnessMap,
      roughness: 0.42,
      metalness: 0.18,
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14.5, 64), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.architectureGroup.add(floor);

    // Restrained recessed floor calibration rings (NOT lighting up every surface!)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x3b9aa6, transparent: true, opacity: 0.48 });
    for (const [rIn, rOut] of [[1.95, 1.98], [4.35, 4.38], [8.85, 8.88]]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(rIn, rOut, 96), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.003;
      this.architectureGroup.add(ring);
    }

    // 2. Perimeter Split-Basalt Monolith Walls & Brushed Gunmetal Structural Ribs
    const basaltMat = new THREE.MeshStandardMaterial({
      map: basalt.map,
      roughnessMap: basalt.roughnessMap,
      bumpMap: basalt.bumpMap,
      bumpScale: 0.045,
      roughness: 0.88,
      metalness: 0.08,
    });
    const titaniumMat = new THREE.MeshStandardMaterial({
      color: 0x101920,
      roughness: 0.34,
      metalness: 0.84,
    });

    const segments = 12;
    const wallRadius = 12.2;
    for (let i = 0; i < segments; i++) {
      const ang = (i / segments) * Math.PI * 2;
      const wallPanel = new THREE.Mesh(new THREE.BoxGeometry(5.6, 6.8, 0.55), basaltMat);
      wallPanel.position.set(Math.cos(ang) * wallRadius, 3.4, Math.sin(ang) * wallRadius);
      wallPanel.rotation.y = -ang + Math.PI / 2;
      wallPanel.receiveShadow = true;
      this.architectureGroup.add(wallPanel);

      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.28, 7.0, 0.75), titaniumMat);
      const ribAng = ang + Math.PI / segments;
      rib.position.set(Math.cos(ribAng) * (wallRadius - 0.15), 3.5, Math.sin(ribAng) * (wallRadius - 0.15));
      rib.rotation.y = -ribAng + Math.PI / 2;
      this.architectureGroup.add(rib);
    }

    // Coffered Dark Acoustic Ceiling Grid + Suspended Circular Lighting Rig
    const ceiling = new THREE.Mesh(
      new THREE.CircleGeometry(13.0, 48),
      new THREE.MeshStandardMaterial({ color: 0x040b10, roughness: 0.92, metalness: 0.2 })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 6.8;
    this.architectureGroup.add(ceiling);

    const gantry = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.09, 16, 72), titaniumMat);
    gantry.rotation.x = Math.PI / 2;
    gantry.position.y = 5.45;
    this.architectureGroup.add(gantry);

    // Motivated Architectural Lighting
    const ambient = new THREE.HemisphereLight(0x9ec5d6, 0x061017, 0.52);
    this.architectureGroup.add(ambient);

    const centralDownlight = new THREE.SpotLight(0xfff0dd, 8.5, 16, Math.PI * 0.34, 0.65, 1.2);
    centralDownlight.position.set(0, 5.8, 0.5);
    centralDownlight.castShadow = true;
    centralDownlight.shadow.mapSize.set(2048, 2048);
    centralDownlight.shadow.bias = -0.0004;
    this.architectureGroup.add(centralDownlight);

    // Warm-neutral cove accents over perimeter stations
    for (const [lx, lz, col, intensity] of [
      [-6.8, -1.5, 0x62e6f2, 2.2], // Memory Colonnade
      [-5.8, -6.2, 0xd8eef5, 2.4], // Research Alcove
      [3.0, -7.2, 0x62e6f2, 2.0],  // Collaboration
      [6.2, -5.2, 0xd8eef5, 2.4],  // Media Wall
      [7.2, 0.5, 0x9ec5d6, 2.2],   // Security Vault
      [0.0, 6.8, 0xd8eef5, 2.2],   // Compute & Switches
    ]) {
      const pl = new THREE.PointLight(col, intensity, 8.5, 1.5);
      pl.position.set(lx, 3.8, lz);
      this.architectureGroup.add(pl);
    }
  }

  _buildAllTwelveZones() {
    const smokedGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x091924,
      roughness: 0.14,
      metalness: 0.1,
      transmission: 0.62,
      thickness: 0.08,
      transparent: true,
      opacity: 0.86,
    });
    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x0e171f,
      roughness: 0.36,
      metalness: 0.82,
    });

    // ZONE 1 & 2: Central Operations Circular Obsidian Holo-Table (0,0,0) & Recessed Stage Ring
    const pitRing = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.06, 16, 64), darkMetalMat);
    pitRing.rotation.x = Math.PI / 2;
    pitRing.position.y = 0.03;
    this.architectureGroup.add(pitRing);

    const holoTableTop = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.36, 0.045, 64), smokedGlassMat);
    holoTableTop.position.set(0, 0.92, 0);
    this.architectureGroup.add(holoTableTop);

    for (let s = 0; s < 4; s++) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.94, 12), darkMetalMat);
      const a = (s / 4) * Math.PI * 2 + Math.PI / 4;
      strut.position.set(Math.cos(a) * 0.92, 0.46, Math.sin(a) * 0.92);
      strut.rotation.z = Math.cos(a) * 0.18;
      strut.rotation.x = -Math.sin(a) * 0.18;
      this.architectureGroup.add(strut);
    }

    // Floating Volumetric Architectural & Turbine Assembly above Central Holo-Table
    this.centerHoloAssembly = new THREE.Group();
    this.centerHoloAssembly.position.set(0, 1.48, 0);
    const cadMat = new THREE.MeshBasicMaterial({
      color: 0x62e6f2,
      wireframe: true,
      transparent: true,
      opacity: 0.55,
    });
    const outerCore = new THREE.Mesh(new THREE.TorusKnotGeometry(0.34, 0.08, 96, 14, 2, 3), cadMat);
    const innerFrame = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.56, 1),
      new THREE.MeshBasicMaterial({ color: 0xddfbff, wireframe: true, transparent: true, opacity: 0.22 })
    );
    const holoGlow = new THREE.PointLight(0x62e6f2, 1.6, 4.5, 1.6);
    this.centerHoloAssembly.add(outerCore, innerFrame, holoGlow);
    this.architectureGroup.add(this.centerHoloAssembly);

    // ZONE 3: Memory Archive Crystalline Colonnade (-7.8, 0, -1.5)
    for (let c = 0; c < 5; c++) {
      const cz = -3.5 + c * 1.05;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 4.4, 6), smokedGlassMat);
      col.position.set(-7.8, 2.2, cz);
      this.architectureGroup.add(col);

      // Suspended 3D knowledge constellation nodes inside & in front of columns
      for (let n = 0; n < 7; n++) {
        const isHyp = (c + n) % 4 === 0;
        const node = new THREE.Mesh(
          new THREE.SphereGeometry(0.032, 10, 10),
          new THREE.MeshBasicMaterial({ color: isHyp ? 0xe7ae5b : 0xddfbff })
        );
        node.position.set(
          -7.2 + Math.sin(n * 1.7 + c) * 0.45,
          0.95 + n * 0.34,
          cz + Math.cos(n * 2.1) * 0.28
        );
        this.architectureGroup.add(node);
      }
    }

    // ZONE 4: Live Research Alcove (-6.5, 0, -6.9) — Multi-plane translucent optical sheets
    for (let p = 0; p < 3; p++) {
      const sheet = this._makeTexturedGlassPanel(
        1.35,
        0.92,
        `RESEARCH PLANE 0${p + 1}`,
        p === 1 ? 'JOURNAL OF AEROTHERMODYNAMICS · VERIFIED' : 'EMPIRICAL CURVE · PROVENANCE LINKED',
        p === 2 ? '#e7ae5b' : '#62e6f2'
      );
      sheet.position.set(-7.1 + p * 0.85, 1.55 + (p % 2) * 0.14, -7.2 + p * 0.32);
      sheet.rotation.y = 0.62;
      this.architectureGroup.add(sheet);
    }

    // ZONE 5: Goals & Ongoing Work Bay (-3.0, 0, -8.2) — Z-depth Dependency DAG Nodes
    const dagGroup = new THREE.Group();
    dagGroup.position.set(-3.0, 1.52, -8.0);
    dagGroup.rotation.y = 0.22;
    const dagCoords = [
      [-0.8, 0.35, 0, 0xddfbff],
      [-0.8, -0.25, 0.15, 0x62e6f2],
      [0.0, 0.08, 0.25, 0x62e6f2],
      [0.85, 0.08, 0.4, 0xe7ae5b],
    ];
    const linePts = [];
    for (const [dx, dy, dz, col] of dagCoords) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.15, 0.04),
        new THREE.MeshBasicMaterial({ color: col, wireframe: true })
      );
      box.position.set(dx, dy, dz);
      dagGroup.add(box);
      linePts.push(new THREE.Vector3(dx, dy, dz));
    }
    dagGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(linePts),
      new THREE.LineBasicMaterial({ color: 0x62e6f2, transparent: true, opacity: 0.65 })
    ));
    this.architectureGroup.add(dagGroup);

    // ZONE 6: Multi-Agent Collaboration Table (3.2, 0, -8.0) — 4 Geometric Specialist Workspaces
    const collabTable = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.98, 0.04, 48), smokedGlassMat);
    collabTable.position.set(3.2, 0.92, -8.0);
    this.architectureGroup.add(collabTable);

    for (let a = 0; a < 4; a++) {
      const ang = (a / 4) * Math.PI * 2;
      const ico = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.16, 0),
        new THREE.MeshBasicMaterial({ color: 0x62e6f2, wireframe: true, transparent: true, opacity: 0.78 })
      );
      ico.position.set(3.2 + Math.cos(ang) * 0.62, 1.38, -8.0 + Math.sin(ang) * 0.62);
      this.architectureGroup.add(ico);
      this.agentSolids.push(ico);
    }

    // ZONE 7: Frameless 4.4m x 2.48m Architectural Media Wall (6.9, 0, -5.8)
    const wallFrame = new THREE.Mesh(new THREE.BoxGeometry(4.52, 2.6, 0.08), darkMetalMat);
    wallFrame.position.set(6.9, 1.92, -5.8);
    wallFrame.rotation.y = -0.62;
    this.architectureGroup.add(wallFrame);

    this.mediaScreenMat = new THREE.MeshBasicMaterial({ map: this.schlierenFeed.texture });
    const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.38, 2.46), this.mediaScreenMat);
    screenMesh.position.set(6.86, 1.92, -5.74);
    screenMesh.rotation.y = -0.62;
    this.architectureGroup.add(screenMesh);

    // Extracted 3D Volumetric Twin beside Media Wall (toggled when extracting paused video frame!)
    this.extracted3DTwinGroup = new THREE.Group();
    this.extracted3DTwinGroup.position.set(5.25, 1.38, -4.15);
    this.extracted3DTwinGroup.visible = false;
    const twinOuter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.38, 0.78, 24, 3, true),
      new THREE.MeshBasicMaterial({ color: 0x62e6f2, wireframe: true })
    );
    twinOuter.rotation.z = Math.PI / 2;
    const twinCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0xe7ae5b, wireframe: true })
    );
    this.extracted3DTwinGroup.add(twinOuter, twinCore);
    this.architectureGroup.add(this.extracted3DTwinGroup);

    // ZONE 8: Defensive Security Bulkhead Vault (8.6, 0, 0.5) + Geodesic Perimeter Lattice
    const vaultDoor = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.22, 48), darkMetalMat);
    vaultDoor.rotation.z = Math.PI / 2;
    vaultDoor.position.set(9.4, 1.95, 0.5);
    this.architectureGroup.add(vaultDoor);

    this.securityLattice = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.58, 2),
      new THREE.MeshBasicMaterial({ color: 0x62e6f2, wireframe: true, transparent: true, opacity: 0.55 })
    );
    this.securityLattice.position.set(7.6, 1.52, 0.5);
    this.architectureGroup.add(this.securityLattice);

    // ZONE 9: Vision & Optical Input Bay (6.8, 0, 5.4) — Explicit Optical State Plane
    const { mesh: visMesh, ctx: visCtx, tex: visTex } = this._makeDynamicCanvasBoard(1.6, 1.0);
    visMesh.position.set(6.8, 1.55, 5.4);
    visMesh.rotation.y = -2.32;
    this.visionBoardCtx = visCtx;
    this.visionBoardTex = visTex;
    this.architectureGroup.add(visMesh);
    this.updateVisionBoard(false, null);

    // ZONE 10: Diagnostics & Telemetry Station (-6.8, 0, 5.4)
    const { mesh: telMesh, ctx: telCtx, tex: telTex } = this._makeDynamicCanvasBoard(1.75, 1.05);
    telMesh.position.set(-6.8, 1.55, 5.4);
    telMesh.rotation.y = 2.32;
    this.telemetryBoardCtx = telCtx;
    this.telemetryBoardTex = telTex;
    this.architectureGroup.add(telMesh);
    this.updateTelemetryBoard({ cpu_percent: 0, memory_used_mb: 0, memory_total_mb: 3800, uptime_sec: 0 });

    // ZONE 11: Compute & Private Kaggle Connection Bay (3.2, 0, 7.8)
    const computeDesk = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.88, 0.72), darkMetalMat);
    computeDesk.position.set(3.2, 0.44, 7.8);
    computeDesk.rotation.y = -2.85;
    this.architectureGroup.add(computeDesk);

    const localGpuCube = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.28, 0.28),
      new THREE.MeshBasicMaterial({ color: 0x62e6f2, wireframe: true })
    );
    localGpuCube.position.set(2.75, 1.32, 7.65);
    this.architectureGroup.add(localGpuCube);

    for (let k = 0; k < 6; k++) {
      const slotMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.14, 0.04),
        new THREE.MeshBasicMaterial({ color: k === 0 ? 0xddfbff : 0x7799a5, wireframe: true })
      );
      slotMesh.position.set(3.45 + (k % 2) * 0.26, 1.18 + Math.floor(k / 2) * 0.2, 7.9);
      slotMesh.rotation.y = -2.85;
      this.architectureGroup.add(slotMesh);
    }

    // ZONE 12: Owner 7-Channel Physical Hardware Switch Console (-3.2, 0, 7.8)
    const switchPedestal = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.92, 0.65), darkMetalMat);
    switchPedestal.position.set(-3.2, 0.46, 7.8);
    switchPedestal.rotation.y = 2.85;
    this.architectureGroup.add(switchPedestal);

    const keys = ['master', 'microphone', 'camera', 'autonomy', 'remote_compute', 'computer_control', 'embodiment'];
    keys.forEach((k, idx) => {
      const lever = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.16, 0.04),
        new THREE.MeshStandardMaterial({
          color: 0x62e6f2,
          emissive: 0x62e6f2,
          emissiveIntensity: 0.45,
          roughness: 0.3,
        })
      );
      const offset = (idx - 3) * 0.21;
      lever.position.set(-3.2 + offset * Math.cos(2.85), 0.98, 7.8 - offset * Math.sin(2.85));
      lever.rotation.y = 2.85;
      this.architectureGroup.add(lever);
      this.switchLevers[k] = lever;
    });
  }

  _makeTexturedGlassPanel(w, h, title, subtitle, accentHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 340;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(6, 18, 26, 0.82)';
    ctx.fillRect(0, 0, 512, 340);
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, 500, 328);

    ctx.fillStyle = accentHex;
    ctx.font = 'bold 18px monospace';
    ctx.fillText(title, 24, 42);
    ctx.fillStyle = '#ddfbff';
    ctx.font = '14px sans-serif';
    ctx.fillText(subtitle, 24, 72);

    // Technical curve lines
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 24; x <= 480; x += 16) {
      const y = 215 - Math.sin(x * 0.025) * 48 - (x - 24) * 0.14;
      if (x === 24) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
    );
  }

  _makeDynamicCanvasBoard(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
    );
    return { mesh, ctx, tex };
  }

  updateVisionBoard(cameraActive, videoEl) {
    const ctx = this.visionBoardCtx;
    if (!ctx) return;
    ctx.fillStyle = '#040d14';
    ctx.fillRect(0, 0, 640, 400);
    ctx.strokeStyle = cameraActive ? '#e7ae5b' : '#62e6f2';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, 628, 388);

    if (cameraActive && videoEl && videoEl.readyState >= 2) {
      ctx.drawImage(videoEl, 18, 64, 604, 290);
    } else {
      ctx.fillStyle = '#7799a5';
      ctx.font = '18px monospace';
      ctx.fillText('NO HIDDEN OPTICAL CAPTURE', 165, 205);
      ctx.font = '14px sans-serif';
      ctx.fillText('Enable Switch #3 (CAM) to stream real optical input.', 145, 238);
    }

    ctx.fillStyle = cameraActive ? '#e7ae5b' : '#62e6f2';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(cameraActive ? 'OPTICAL INPUT: ACTIVE (LIVE STREAM)' : 'OPTICAL INPUT: LOCKED OFF', 22, 40);
    this.visionBoardTex.needsUpdate = true;
  }

  updateTelemetryBoard(tel) {
    const ctx = this.telemetryBoardCtx;
    if (!ctx) return;
    ctx.fillStyle = '#040d14';
    ctx.fillRect(0, 0, 640, 400);
    ctx.strokeStyle = '#62e6f2';
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, 628, 388);

    ctx.fillStyle = '#62e6f2';
    ctx.font = 'bold 19px monospace';
    ctx.fillText('SANCTUARY TELEMETRY · MEASURED HOST', 24, 42);

    ctx.fillStyle = '#ddfbff';
    ctx.font = '17px monospace';
    const lines = [
      `CPU UTILISATION : ${Number(tel.cpu_percent || 0).toFixed(1)} %`,
      `MEMORY USED     : ${Number(tel.memory_used_mb || 0).toFixed(0)} / ${Number(tel.memory_total_mb || 0).toFixed(0)} MB`,
      `UPTIME          : ${Number(tel.uptime_sec || 0).toFixed(0)} s`,
      `INFERENCE ROUTE : ${(tel.inference?.active_backend || 'executive_offline').toUpperCase()}`,
      `PUBLIC PORTS    : 0 (ZERO-TRUST VERIFIED)`,
    ];
    lines.forEach((ln, idx) => ctx.fillText(ln, 28, 102 + idx * 46));
    this.telemetryBoardTex.needsUpdate = true;
  }

  syncPhysicalSwitchLevers(switchMap) {
    for (const [k, lever] of Object.entries(this.switchLevers)) {
      const on = Boolean(switchMap[k]);
      lever.rotation.x = on ? -0.35 : 0.35;
      const col = !switchMap.master ? 0xff6b67 : ((k === 'microphone' || k === 'camera') && on ? 0xe7ae5b : (on ? 0x62e6f2 : 0x32444d));
      lever.material.color.setHex(col);
      lever.material.emissive.setHex(col);
      lever.material.emissiveIntensity = on ? 0.55 : 0.08;
    }
    this.embodimentEnabled = Boolean(switchMap.embodiment ?? true);
    this.jarvis.root.visible = this.embodimentEnabled;
  }

  setExternalVideoTexture(videoEl) {
    if (videoEl) {
      const vTex = new THREE.VideoTexture(videoEl);
      vTex.colorSpace = THREE.SRGBColorSpace;
      this.mediaScreenMat.map = vTex;
    } else {
      this.mediaScreenMat.map = this.schlierenFeed.texture;
    }
    this.mediaScreenMat.needsUpdate = true;
  }

  setHologramMode(enabled, layout = 'peppers_ghost') {
    this.hologramMode = enabled;
    this.hologramLayout = layout;
    this.architectureGroup.visible = !enabled; // Pure optical black background for Pepper's Ghost reflection
    this.scene.background.setHex(enabled ? 0x000000 : 0x02070b);
    document.body.classList.toggle('holo-mirror-active', enabled && layout === 'peppers_ghost');
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const isMobile = w <= 860;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.35 : 2.0));
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  renderFrame(dt, opticalVideoEl, cameraSwitchOn) {
    // 1. Update procedural video & volumetric idle elements
    this.schlierenFeed.update(dt);
    if (cameraSwitchOn && opticalVideoEl) {
      this.updateVisionBoard(true, opticalVideoEl);
    }

    if (this.centerHoloAssembly) {
      // Dim central tabletop model when room-scale Stage Scenario is active so visuals don't clash
      const stageActive = Boolean(this.scenarioDirector.activeScenario);
      this.centerHoloAssembly.visible = !stageActive;
      if (!this.reducedMotion) {
        this.centerHoloAssembly.rotation.y += dt * 0.28;
      }
    }

    if (!this.reducedMotion) {
      if (this.securityLattice) this.securityLattice.rotation.y += dt * 0.22;
      this.agentSolids.forEach((s, i) => {
        s.rotation.x += dt * (0.35 + i * 0.08);
        s.rotation.y += dt * 0.45;
      });
      if (this.extracted3DTwinGroup?.visible) {
        this.extracted3DTwinGroup.rotation.y += dt * 0.65;
      }
    }

    // 2. Update Scenario Director, Living JARVIS, and Camera Director
    this.scenarioDirector.update(dt);
    this.jarvis.update(dt, this.camera.position, this.reducedMotion);
    this.cameraDirector.update(dt, this.jarvis, this.reducedMotion);

    // 3. Project 3D world-space scenario callout tags onto screen
    this._renderSpatialAnchors();

    // 4. Render either standard ACES Filmic sanctuary OR 4-Face Holographic Pyramid Scissor Viewports
    if (this.hologramMode && this.hologramLayout === 'pyramid_4face') {
      this._renderFourFacePyramid();
    } else {
      this.renderer.setScissorTest(false);
      this.composer.render();
    }
  }

  _renderFourFacePyramid() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const size = Math.floor(Math.min(w, h) * 0.44);
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);

    this.renderer.setScissorTest(false);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.clear();
    this.renderer.setScissorTest(true);

    const jPos = this.jarvis.root.position;
    const views = [
      { x: cx - size / 2, y: cy + 16, yaw: 0 },               // Top (0 deg)
      { x: cx + 16, y: cy - size / 2, yaw: Math.PI / 2 },     // Right (90 deg)
      { x: cx - size / 2, y: cy - size - 16, yaw: Math.PI },  // Bottom (180 deg)
      { x: cx - size - 16, y: cy - size / 2, yaw: -Math.PI / 2 }, // Left (270 deg)
    ];

    for (const v of views) {
      const vx = Math.max(0, Math.floor(v.x));
      const vy = Math.max(0, Math.floor(v.y));
      const vw = Math.min(size, w - vx);
      const vh = Math.min(size, h - vy);
      if (vw <= 10 || vh <= 10) continue;

      this.renderer.setViewport(vx, vy, vw, vh);
      this.renderer.setScissor(vx, vy, vw, vh);
      this.pyramidCam.aspect = vw / vh;
      this.pyramidCam.position.set(
        jPos.x + Math.sin(v.yaw) * 2.85,
        1.15,
        jPos.z + Math.cos(v.yaw) * 2.85
      );
      this.pyramidCam.lookAt(jPos.x, 0.98, jPos.z);
      this.pyramidCam.updateProjectionMatrix();
      this.renderer.render(this.scene, this.pyramidCam);
    }
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.setScissorTest(false);
  }

  _renderSpatialAnchors() {
    const anchors = this.scenarioDirector.worldAnchors;
    if (!anchors || anchors.length === 0 || this.hologramMode) {
      if (this.labelsContainer.childElementCount > 0) this.labelsContainer.innerHTML = '';
      return;
    }

    while (this.labelsContainer.childElementCount < anchors.length) {
      const div = document.createElement('div');
      div.className = 'spatial-tag';
      this.labelsContainer.appendChild(div);
    }
    while (this.labelsContainer.childElementCount > anchors.length) {
      this.labelsContainer.lastElementChild.remove();
    }

    anchors.forEach((a, i) => {
      const el = this.labelsContainer.children[i];
      const proj = a.pos.clone().project(this.camera);
      if (proj.z > 1) {
        el.style.opacity = '0';
        return;
      }
      const sx = (proj.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-proj.y * 0.5 + 0.5) * window.innerHeight;
      el.className = `spatial-tag ${a.amber ? 'amber' : ''}`;
      el.style.left = `${sx}px`;
      el.style.top = `${sy}px`;
      el.style.opacity = '1';
      el.innerHTML = `${a.title}<span class="tag-sub">${a.sub}</span>`;
    });
  }
}
