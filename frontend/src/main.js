/**
 * JARVIS NEXUS — Primary Client Orchestrator.
 * Connects the Real-Time 3D Sanctuary & Living Character to CORE (/api/v1 & /ws/nexus).
 */
import * as THREE from 'three';
import { NexusSanctuaryScene } from './world/NexusSanctuaryScene.js';

const state = {
  world: null,
  switches: {},
  scenarios: [],
  activeScenarioDef: null,
  mediaItems: [],
  activeInspectorTab: 'scenarios',
  ws: null,
  micStream: null,
  camStream: null,
  recognition: null,
  mediaRecorder: null,
  recordedChunks: [],
};

const canvas = document.getElementById('nexus-canvas');
const labelsLayer = document.getElementById('spatial-labels-layer');
const uploadedVideoEl = document.getElementById('uploaded-video-el');
const opticalCamEl = document.getElementById('optical-cam-el');

const sanctuary = new NexusSanctuaryScene(canvas, labelsLayer);

// Optional external CORE origin when Frontend is hosted separately (e.g. Vercel -> Railway).
// Defaults to '' (same-origin relative URLs) when served directly by Railway / FastAPI / Vite proxy.
const CORE_HTTP_ORIGIN = (import.meta.env.VITE_CORE_URL || '').trim().replace(/\/+$/, '');

function coreHttpUrl(path) {
  return CORE_HTTP_ORIGIN ? `${CORE_HTTP_ORIGIN}${path}` : path;
}

function coreWsBase() {
  if (CORE_HTTP_ORIGIN) {
    return CORE_HTTP_ORIGIN.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}`;
}

async function api(path, options = {}) {
  const headers = options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' };
  const res = await fetch(coreHttpUrl(path), {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      detail = err.detail || detail;
    } catch { /* ignore */ }
    throw new Error(detail);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// 1. Boot & Continuity Initialization
// ---------------------------------------------------------------------------
async function bootstrap() {
  const activityEl = document.getElementById('jarvis-activity-text');
  try {
    await sanctuary.initCharacter((xhr) => {
      if (xhr && xhr.total) {
        const pct = Math.round((xhr.loaded / xhr.total) * 100);
        activityEl.textContent = `Loading rigged 3D character & skeletal clips (${pct}%)...`;
      }
    });
  } catch (err) {
    activityEl.textContent = `Character asset warning: ${err.message}`;
  }

  const [worldSnap, scenariosRes, mediaRes] = await Promise.all([
    api('/api/v1/world'),
    api('/api/v1/scenarios'),
    api('/api/v1/media'),
  ]);

  state.scenarios = scenariosRes.scenarios || [];
  state.mediaItems = mediaRes.items || [];
  applyWorldState(worldSnap, true);

  if (!worldSnap.first_launch_completed) {
    document.getElementById('first-wake-banner').classList.remove('hidden');
    sanctuary.cameraDirector.setPreset('arrival_wake', worldSnap.reduced_motion);
  }

  connectNexusWebSocket();
  bindUIEvents();
  startTelemetryPoll();

  const clock = new THREE.Clock();
  sanctuary.renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    sanctuary.renderFrame(dt, opticalCamEl, Boolean(state.switches.camera));
    syncScenarioSliderReadout();
  });
}

function connectNexusWebSocket() {
  const isMobile = window.innerWidth <= 860;
  const deviceTag = isMobile ? 'mobile_companion' : 'pc_sanctuary';
  const wsUrl = `${coreWsBase()}/ws/nexus?device=${deviceTag}`;

  const dot = document.getElementById('core-conn-dot');
  const ws = new WebSocket(wsUrl);
  state.ws = ws;

  ws.onopen = () => dot.classList.remove('offline');
  ws.onclose = () => {
    dot.classList.add('offline');
    setTimeout(connectNexusWebSocket, 3500);
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      handleLiveEvent(msg);
    } catch { /* noop */ }
  };
}

function handleLiveEvent(msg) {
  const { type, payload } = msg;
  if (type === 'initial_state' || type === 'world_sync' || type === 'scenario_restored') {
    applyWorldState(payload, false);
    if (type === 'scenario_restored') {
      sanctuary.scenarioDirector.clearStage();
      document.getElementById('scenario-director-bar').classList.add('hidden');
    }
  } else if (type === 'jarvis_interrupted') {
    applyWorldState(payload, false);
    sanctuary.jarvis.acknowledgeInterruption(sanctuary.camera.position);
  } else if (type === 'switch_changed') {
    applyWorldState(payload.world, false);
    enforceBrowserSensorGates();
  } else if (type === 'jarvis_spoke') {
    applyWorldState(payload.world, false);
    showJarvisResponse(payload.jarvis_message);
    if (payload.activated_scenario) {
      const def = state.scenarios.find((s) => s.id === payload.activated_scenario.scenario_id);
      if (def) activateClientScenario(def, payload.activated_scenario);
    }
  } else if (type === 'scenario_activated') {
    applyWorldState(payload.world, false);
    activateClientScenario(payload.scenario, payload.runtime);
  } else if (type === 'video_state_changed') {
    applyWorldState(payload.world, false);
    applyVideoState(payload.video);
  }
}

// ---------------------------------------------------------------------------
// 2. Apply Authoritative World, Switch, Locomotion & Camera State
// ---------------------------------------------------------------------------
function applyWorldState(snap, initialSnap = false) {
  if (!snap) return;
  state.world = snap;
  state.switches = snap.switches || {};
  sanctuary.reducedMotion = Boolean(snap.reduced_motion);
  document.getElementById('chk-reduced-motion').checked = sanctuary.reducedMotion;

  // Header status
  const modeObj = (snap.modes || []).find((m) => m.id === snap.active_mode);
  document.getElementById('active-mode-label').textContent = modeObj ? modeObj.label : snap.active_mode;
  document.getElementById('jarvis-zone-badge').textContent = (snap.current_zone || '').replaceAll('_', ' ');
  document.getElementById('jarvis-activity-text').textContent = snap.active_activity_summary || '';

  // Resume button visibility when an interrupted task is on the stack
  const hasStack = Array.isArray(snap.interrupted_task_stack) && snap.interrupted_task_stack.length > 0;
  document.getElementById('btn-resume-task').classList.toggle('hidden', !hasStack);

  // Render 7 Hardware Switches
  renderSwitchesStrip(snap.switches || {});
  sanctuary.syncPhysicalSwitchLevers(snap.switches || {});

  // Render 15 Modes Drawer
  renderModesDrawer(snap.modes || [], snap.active_mode);

  // Move or place JARVIS in 3D space
  const pos = snap.position || { x: 1.45, z: 0.95, yaw: -0.42 };
  const zoneInfo = snap.zones?.[snap.current_zone];
  if (zoneInfo?.look_target) {
    sanctuary.jarvis.lookWorldTarget.set(...zoneInfo.look_target);
  }
  sanctuary.jarvis.focusCamera = ['conversational_focus', 'wake_auth', 'digital_human_embodiment', 'holographic_presence'].includes(snap.active_mode);

  const postureMap = {
    simulation_stage: snap.active_scenario ? 'scenario_direct' : 'scenario_construct',
    media_presentation: 'video_present',
    central_operations: snap.active_mode === 'conversational_focus' ? 'conversational_focus' : 'console_interaction',
  };
  const posture = postureMap[snap.current_zone] || 'console_interaction';

  if (initialSnap) {
    sanctuary.jarvis.root.position.set(pos.x, 0, pos.z);
    sanctuary.jarvis.root.rotation.y = pos.yaw;
    sanctuary.jarvis.targetYaw = pos.yaw;
    sanctuary.jarvis.postureMode = posture;
    sanctuary.jarvis.emotionalState = snap.emotional_state || 'attentive';
  } else {
    sanctuary.jarvis.navigateTo(pos.x, pos.z, pos.yaw, {
      urgent: snap.locomotion_state === 'running' || snap.emotional_state === 'urgent',
      posture,
      emotion: snap.emotional_state || 'focused',
    });
  }

  // Camera & Holographic Mode 15 sync
  const isHolo = snap.active_mode === 'holographic_presence';
  sanctuary.setHologramMode(isHolo, sanctuary.hologramLayout);
  document.getElementById('hologram-control-bar').classList.toggle('hidden', !isHolo);
  document.getElementById('hologram-guides').classList.toggle('hidden', !isHolo);
  document.getElementById('btn-hologram-toggle').classList.toggle('active', isHolo);

  if (snap.active_camera_preset) {
    sanctuary.cameraDirector.setPreset(snap.active_camera_preset, sanctuary.reducedMotion);
  }

  if (snap.active_scenario && !sanctuary.scenarioDirector.activeScenario) {
    const def = state.scenarios.find((s) => s.id === snap.active_scenario.scenario_id);
    if (def) activateClientScenario(def, snap.active_scenario);
  }

  if (snap.active_video) {
    applyVideoState(snap.active_video);
  }
}

function renderSwitchesStrip(sw) {
  const strip = document.getElementById('switches-strip');
  const defs = [
    ['master', 'MASTER'],
    ['microphone', 'MIC'],
    ['camera', 'CAM'],
    ['autonomy', 'AUTO'],
    ['remote_compute', 'KAGGLE'],
    ['computer_control', 'TOOLS'],
    ['embodiment', 'BODY'],
  ];
  strip.innerHTML = defs.map(([key, short]) => {
    const on = Boolean(sw[key]);
    let cls = 'hw-switch-btn';
    if (key === 'master' && !on) cls += ' master-off';
    else if ((key === 'microphone' || key === 'camera') && on) cls += ' sensor-on';
    else if (on) cls += ' on';
    return `<button class="${cls}" data-switch="${key}" title="Toggle ${key}: currently ${on ? 'ON' : 'OFF'}">${short}:${on ? 'ON' : 'OFF'}</button>`;
  }).join('');

  document.getElementById('mic-state-label').textContent = sw.microphone ? 'MIC READY' : 'MIC OFF';
  document.getElementById('cam-state-label').textContent = sw.camera ? 'CAM LIVE' : 'CAM OFF';
}

function renderModesDrawer(modes, activeMode) {
  const list = document.getElementById('modes-list');
  list.innerHTML = modes.map((m) => `
    <button class="mode-row-btn ${m.id === activeMode ? 'active' : ''}" data-mode-id="${m.id}">
      <span>${String(m.index).padStart(2, '0')}. ${m.label}</span>
      <span class="mode-zone">${m.zone.replaceAll('_', ' ')}</span>
    </button>
  `).join('');
}

// ---------------------------------------------------------------------------
// 3. Real Browser Sensor Enforcement (No Hidden Capture!)
// ---------------------------------------------------------------------------
async function enforceBrowserSensorGates() {
  // Microphone enforcement
  if (!state.switches.microphone || !state.switches.master) {
    if (state.micStream) {
      state.micStream.getTracks().forEach((t) => t.stop());
      state.micStream = null;
    }
    if (state.recognition) {
      try { state.recognition.abort(); } catch { /* noop */ }
    }
  }

  // Camera enforcement
  if (!state.switches.camera || !state.switches.master) {
    if (state.camStream) {
      state.camStream.getTracks().forEach((t) => t.stop());
      state.camStream = null;
      opticalCamEl.srcObject = null;
    }
    sanctuary.updateVisionBoard(false, null);
  } else if (!state.camStream && navigator.mediaDevices?.getUserMedia) {
    try {
      state.camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 } });
      opticalCamEl.srcObject = state.camStream;
      await opticalCamEl.play();
      sanctuary.updateVisionBoard(true, opticalCamEl);
    } catch {
      sanctuary.updateVisionBoard(false, null);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Scenario Director & Spatial Video Controls
// ---------------------------------------------------------------------------
function activateClientScenario(def, runtime) {
  state.activeScenarioDef = def;
  sanctuary.scenarioDirector.loadScenario(def, runtime);

  const bar = document.getElementById('scenario-director-bar');
  bar.classList.remove('hidden');
  document.getElementById('sc-class-badge').textContent = def.classification.replaceAll('_', ' ').toUpperCase();
  document.getElementById('sc-title').textContent = def.title;
  document.getElementById('sc-btn-playpause').textContent = sanctuary.scenarioDirector.playing ? 'Pause' : 'Play';

  const slider = document.getElementById('sc-timeline-slider');
  slider.max = String(def.duration_sec || 20);
  slider.value = String(sanctuary.scenarioDirector.currentTime);

  const varsRow = document.getElementById('sc-variables-row');
  varsRow.innerHTML = (def.variables || []).map((v) => {
    const val = runtime.variables?.[v.key] ?? v.default;
    return `
      <label class="var-control">
        <span>${v.label}: <strong class="tabular" id="var-val-${v.key}">${val}</strong></span>
        <input type="range" data-sc-var="${v.key}" min="${v.min}" max="${v.max}" step="${v.step}" value="${val}" />
      </label>
    `;
  }).join('');

  updateScenarioBranchBanner(def, sanctuary.scenarioDirector.variables);
}

function updateScenarioBranchBanner(def, vars) {
  const banner = document.getElementById('sc-branch-readout');
  if (!def || !def.branches || def.branches.length === 0) {
    banner.textContent = '';
    return;
  }
  let chosen = def.branches[def.branches.length - 1];
  if (def.id === 'cryo_manifold_forensic') {
    const ruptured = Number(vars.line_pressure_mpa ?? 210) >= 185 && Number(vars.relief_valve_ms ?? 125) > 70;
    chosen = ruptured ? def.branches[0] : def.branches[1];
  } else if (def.id === 'dual_turbine_sim') {
    chosen = Number(vars.inlet_temp_k ?? 1320) <= 1450 ? def.branches[0] : def.branches[1];
  } else if (def.id === 'zerotrust_compute_flow') {
    chosen = Number(vars.expose_public_port ?? 0) === 0 ? def.branches[0] : def.branches[1];
  }
  banner.className = `scenario-branch-banner ${chosen.severity === 'critical' ? 'critical' : ''}`;
  banner.textContent = `${chosen.label} — ${chosen.outcome}`;
}

function syncScenarioSliderReadout() {
  const sd = sanctuary.scenarioDirector;
  if (!sd.activeScenario) return;
  document.getElementById('sc-time-readout').textContent =
    `${sd.currentTime.toFixed(1).padStart(4, '0')}s / ${sd.duration.toFixed(1)}s`;
  if (sd.playing) {
    document.getElementById('sc-timeline-slider').value = String(sd.currentTime);
  }
  const tl = sd.activeScenario.timeline || [];
  let activeCue = tl[0];
  for (const cue of tl) {
    if (sd.currentTime >= cue.t) activeCue = cue;
  }
  if (activeCue) {
    document.getElementById('sc-phase-label').textContent = activeCue.phase;
  }
}

function applyVideoState(vState) {
  if (!vState) return;
  sanctuary.schlierenFeed.playing = Boolean(vState.playing);
  if (!vState.playing && typeof vState.current_time === 'number') {
    sanctuary.schlierenFeed.seek(vState.current_time);
  }
  if (sanctuary.extracted3DTwinGroup) {
    sanctuary.extracted3DTwinGroup.visible = Boolean(vState.extracted_3d_twin);
  }
  if (!uploadedVideoEl.paused && !vState.playing) uploadedVideoEl.pause();
  if (uploadedVideoEl.src && vState.playing && uploadedVideoEl.paused) {
    uploadedVideoEl.play().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// 5. Speech, Dialogue & Subtitle Synchronization
// ---------------------------------------------------------------------------
function showJarvisResponse(jarvisMsg) {
  if (!jarvisMsg) return;
  const ribbon = document.getElementById('subtitle-ribbon');
  const subText = document.getElementById('subtitle-text');
  const pill = document.getElementById('inference-source-pill');
  const intBtn = document.getElementById('btn-interrupt');

  ribbon.classList.remove('hidden');
  subText.textContent = jarvisMsg.content;
  pill.textContent = jarvisMsg.inference_source;

  if (state.switches.embodiment !== false) {
    intBtn.classList.remove('hidden');
    sanctuary.jarvis.speak(jarvisMsg.content, {
      onEnd: () => intBtn.classList.add('hidden'),
    });
  }
}

// ---------------------------------------------------------------------------
// 6. Contextual Inspector Drawer Views (Scenarios, Video, Memory, Goals, Agents, Kaggle, Telemetry)
// ---------------------------------------------------------------------------
async function renderInspectorTab(tab) {
  state.activeInspectorTab = tab;
  document.querySelectorAll('#inspector-tabs .tab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  const body = document.getElementById('inspector-body');
  body.innerHTML = '<p class="drawer-sub">Synchronizing with CORE...</p>';

  if (tab === 'scenarios') {
    const res = await api('/api/v1/scenarios');
    state.scenarios = res.scenarios || [];
    body.innerHTML = `
      <div class="panel-card">
        <h4>Scenario Director — “Let Me Show You”</h4>
        <p>Launch a room-scale 3D reconstruction, parallel simulation, or architectural flow directly onto the Volumetric Stage.</p>
      </div>
      ${state.scenarios.map((s) => `
        <div class="panel-card">
          <span class="badge fact">${s.classification.replaceAll('_', ' ')}</span>
          <h4 style="margin-top:6px">${s.title}</h4>
          <p>${s.summary}</p>
          <div style="margin-top:8px; display:flex; gap:6px">
            <button class="btn-primary" data-launch-scenario="${s.id}">Construct on 3D Stage</button>
          </div>
        </div>
      `).join('')}
    `;
  } else if (tab === 'media') {
    const res = await api('/api/v1/media');
    state.mediaItems = res.items || [];
    const cur = state.mediaItems[0];
    body.innerHTML = `
      <div class="panel-card">
        <h4>Spatial Video & 3D Frame Extraction</h4>
        <p>JARVIS walks beside—never blocking—the 4.8m Media Wall, pauses at critical frames, and extracts a 3D volumetric twin into space.</p>
        <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:6px">
          <button class="btn-primary" id="vid-btn-walk">Walk to Media Wall</button>
          <button class="btn-chip" id="vid-btn-play">Play</button>
          <button class="btn-chip" id="vid-btn-pause-crit">Pause @ 14.2s Spike</button>
          <button class="btn-cyan-outline btn-chip" id="vid-btn-extract3d">Extract 3D Twin</button>
        </div>
      </div>
      <div class="panel-card">
        <h4>Import Owner Video Clip (MP4 / WebM)</h4>
        <form id="video-upload-form" class="form-grid">
          <input type="text" name="title" placeholder="Clip title (e.g. Bench Test Run #4)" required />
          <input type="file" name="file" accept="video/*" required />
          <button type="submit" class="btn-primary">Upload & Project on Media Wall</button>
        </form>
        <p style="margin-top:6px">FFmpeg host status: <strong>${res.ffmpeg_available ? 'Installed' : 'Not installed in container (WebM native supported)'}</strong> · Video-Gen Adapter: <strong>${res.video_generation_configured ? 'Configured' : 'Unconfigured (no fake videos)'}</strong></p>
      </div>
      ${cur ? `
        <div class="panel-card">
          <h4>Timestamp-Linked Commentary (${cur.title})</h4>
          ${(cur.commentaries || []).map((c) => `
            <div style="margin-top:6px; padding-top:6px; border-top:1px solid rgba(119,153,165,0.15)">
              <span class="badge fact tabular">${c.timestamp_sec.toFixed(1)}s</span>
              <strong> ${c.label}</strong>
              <p>${c.analysis}</p>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
    bindMediaPanelHandlers(cur);
  } else if (tab === 'memory') {
    const memories = await api('/api/v1/memories');
    body.innerHTML = `
      <div class="panel-card">
        <h4>Store Typed Memory Record</h4>
        <form id="mem-create-form" class="form-grid">
          <select name="category">
            <option value="owner_fact">Owner Fact</option>
            <option value="preference">Preference</option>
            <option value="commitment">Commitment</option>
            <option value="project">Project</option>
            <option value="source_research">Source-Backed Research</option>
            <option value="agent_finding">Agent Finding</option>
            <option value="sensitive">Sensitive (Encrypted at Rest)</option>
          </select>
          <select name="epistemic_status">
            <option value="owner_stated">Owner Stated</option>
            <option value="verified_fact">Verified Fact</option>
            <option value="source_backed">Source Backed</option>
            <option value="hypothesis">Hypothesis (Never auto-promoted)</option>
          </select>
          <input type="text" name="title" placeholder="Memory title" required />
          <textarea name="content" rows="2" placeholder="Factual detail or preference..." required></textarea>
          <button type="submit" class="btn-primary">Save to Memory Archive</button>
        </form>
      </div>
      ${memories.map((m) => `
        <div class="panel-card">
          <div style="display:flex; justify-content:space-between; align-items:center">
            <span class="badge ${m.epistemic_status === 'hypothesis' ? 'hypothesis' : 'fact'}">${m.category} · ${m.epistemic_status}</span>
            <button class="btn-chip btn-danger-outline" data-forget-mem="${m.id}">Forget</button>
          </div>
          <h4 style="margin-top:5px">${m.title}</h4>
          <p>${m.content}</p>
        </div>
      `).join('')}
    `;
    bindMemoryPanelHandlers();
  } else if (tab === 'goals') {
    const goals = await api('/api/v1/goals');
    body.innerHTML = `
      <div class="panel-card">
        <h4>Create Goal with Priority & Schedule</h4>
        <form id="goal-create-form" class="form-grid">
          <input type="text" name="title" placeholder="Goal title" required />
          <input type="text" name="description" placeholder="Objective & verification criteria" required />
          <select name="priority">
            <option value="1">Priority P1 (Critical)</option>
            <option value="2" selected>Priority P2 (High)</option>
            <option value="3">Priority P3 (Standard)</option>
          </select>
          <button type="submit" class="btn-primary">Register Goal</button>
        </form>
      </div>
      ${goals.map((g) => `
        <div class="panel-card">
          <div style="display:flex; justify-content:space-between">
            <span class="badge ${g.unmet_dependencies.length ? 'hypothesis' : 'fact'}">P${g.priority} · ${g.status} · ${g.progress}%</span>
            <span class="tabular" style="font-size:11px; color:var(--muted)">${g.schedule_spec}</span>
          </div>
          <h4 style="margin-top:5px">${g.title}</h4>
          <p>${g.description}</p>
          ${g.unmet_dependencies.length ? `<p style="color:var(--amber); margin-top:4px">Blocked on: ${g.unmet_dependencies.join(', ')}</p>` : ''}
          <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap">
            <button class="btn-chip" data-goal-act="${g.id}" data-status="active">Activate</button>
            <button class="btn-chip" data-goal-act="${g.id}" data-status="paused">Pause</button>
            <button class="btn-chip btn-cyan-outline" data-goal-act="${g.id}" data-status="completed" data-prog="100">Mark Complete</button>
            <button class="btn-chip btn-danger-outline" data-goal-act="${g.id}" data-status="cancelled">Cancel</button>
          </div>
        </div>
      `).join('')}
    `;
    bindGoalsPanelHandlers();
  } else if (tab === 'agents') {
    const [agData, toolsData] = await Promise.all([api('/api/v1/agents'), api('/api/v1/tools')]);
    body.innerHTML = `
      <div class="panel-card">
        <h4>Specialist Agents (Bounded Permissions)</h4>
        <p>Every specialist operates within explicit tool allowlists and respects Autonomy & Computer Control switches.</p>
      </div>
      ${agData.agents.map((a) => `
        <div class="panel-card">
          <div style="display:flex; justify-content:space-between">
            <strong>${a.name}</strong>
            <span class="badge fact">${a.status}</span>
          </div>
          <p>${a.role_summary}</p>
          <p style="margin-top:4px; font-size:10.5px">Tools: <code>${a.allowed_tools.join(', ')}</code></p>
          ${a.last_output ? `<p style="margin-top:5px; color:var(--ice)">${a.last_output}</p>` : ''}
          <button style="margin-top:7px" class="btn-primary" data-dispatch-agent="${a.id}">Dispatch Audit Run</button>
        </div>
      `).join('')}
      <div class="panel-card">
        <h4>Guarded Tool Execution</h4>
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px">
          ${toolsData.allowlist.map((t) => `
            <button class="btn-chip ${t.destructive ? 'btn-danger-outline' : ''}" data-exec-tool="${t.tool_name}">
              ${t.tool_name}${t.destructive ? ' (Confirm Gate)' : ''}
            </button>
          `).join('')}
        </div>
        <div id="tool-exec-result" style="margin-top:8px; font-size:11.5px; color:var(--ice)"></div>
      </div>
    `;
    bindAgentsAndToolsHandlers();
  } else if (tab === 'compute') {
    const [compStatus, setupInfo, profiles] = await Promise.all([
      api('/api/v1/compute/status'),
      api('/api/v1/compute/worker-setup-info'),
      api('/api/v1/compute/kaggle/profiles'),
    ]);
    body.innerHTML = `
      <div class="panel-card">
        <h4>Private Inference Routing (Zero Mandatory Cloud APIs)</h4>
        <table class="kv-table">
          <tr><td>Default Model</td><td>${compStatus.default_model}</td></tr>
          <tr><td>Active Backend</td><td>${compStatus.active_backend}</td></tr>
          <tr><td>Connected Workers</td><td>${compStatus.connected_workers.length}</td></tr>
          <tr><td>Masked Worker Token</td><td>${setupInfo.masked_worker_token}</td></tr>
        </table>
        <p style="margin-top:6px">${compStatus.kaggle_session_constraints}</p>
        <p style="margin-top:6px; font-family:var(--font-mono); font-size:10.5px; color:var(--cyan)">${setupInfo.local_pc_command}</p>
      </div>
      <div class="panel-card">
        <h4>6+ Encrypted Kaggle GPU Profiles (Server-Side Fernet)</h4>
        <p>Credentials are encrypted server-side and masked. No public port is ever opened on Kaggle.</p>
      </div>
      ${profiles.map((p) => `
        <div class="panel-card">
          <div style="display:flex; justify-content:space-between; align-items:center">
            <strong>#${p.slot_index} · ${p.profile_name}</strong>
            <span class="badge ${p.is_active ? 'fact' : ''}">${p.is_active ? 'ACTIVE' : 'STANDBY'} · ${p.gpu_accelerator}</span>
          </div>
          <p style="margin-top:4px">User: <code>${p.masked_username}</code> · Key: <code>${p.masked_key}</code></p>
          <p style="font-size:11px; margin-top:2px">Auth Test: <strong>${p.last_auth_status}</strong> — ${p.last_auth_detail}</p>
          <details style="margin-top:6px">
            <summary style="cursor:pointer; color:var(--cyan); font-size:11px">Update Encrypted Credentials / Model</summary>
            <form class="form-grid" data-kaggle-form="${p.id}">
              <input type="text" name="profile_name" value="${p.profile_name}" required />
              <input type="text" name="kaggle_username" placeholder="Kaggle Username (encrypted server-side)" />
              <input type="password" name="kaggle_key" placeholder="Kaggle API Key (encrypted server-side)" />
              <input type="text" name="preferred_model" value="${p.preferred_model}" />
              <button type="submit" class="btn-primary">Encrypt & Save</button>
            </form>
          </details>
          <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap">
            <button class="btn-chip" data-kaggle-select="${p.id}" data-kname="${p.profile_name}" data-kmodel="${p.preferred_model}" data-kgpu="${p.gpu_accelerator}">Select Active</button>
            <button class="btn-chip btn-cyan-outline" data-kaggle-test="${p.id}">Test Auth</button>
            <a class="btn-chip" style="text-decoration:none" href="${coreHttpUrl(`/api/v1/compute/kaggle/profiles/${p.id}/package?core_wss_url=${encodeURIComponent(`${coreWsBase()}/ws/worker`)}`)}" download>Download Worker ZIP</a>
          </div>
        </div>
      `).join('')}
      <div class="panel-card">
        <h4>Add Additional Named Kaggle Profile</h4>
        <form id="kaggle-add-form" class="form-grid">
          <input type="text" name="profile_name" placeholder="e.g. Kaggle-Account-07" required />
          <input type="text" name="kaggle_username" placeholder="Kaggle Username" />
          <input type="password" name="kaggle_key" placeholder="Kaggle API Key" />
          <button type="submit" class="btn-primary">Add Encrypted Profile</button>
        </form>
      </div>
    `;
    bindKaggleHandlers();
  } else if (tab === 'telemetry') {
    const [tel, sec] = await Promise.all([api('/api/v1/telemetry'), api('/api/v1/security/events')]);
    sanctuary.updateTelemetryBoard(tel);
    body.innerHTML = `
      <div class="panel-card">
        <h4>Real Measured Host & Persistence Telemetry</h4>
        <table class="kv-table">
          <tr><td>CPU Utilisation</td><td>${tel.cpu_percent}% (${tel.cpu_cores} cores)</td></tr>
          <tr><td>RAM Used</td><td>${tel.memory_used_mb} / ${tel.memory_total_mb} MB (${tel.memory_percent}%)</td></tr>
          <tr><td>Free Disk</td><td>${tel.disk_free_gb} GB</td></tr>
          <tr><td>Memories / Goals / Scenarios</td><td>${tel.database_records.memories} / ${tel.database_records.goals} / ${tel.database_records.scenarios}</td></tr>
          <tr><td>Connected Embodiment Views</td><td>${tel.embodiment_clients.length}</td></tr>
        </table>
        <div style="margin-top:8px; display:flex; gap:6px">
          <button class="btn-primary" id="btn-export-backup">Export State Backup JSON</button>
        </div>
        <div id="backup-status" style="margin-top:6px; font-size:11px; color:var(--cyan)"></div>
      </div>
      <div class="panel-card">
        <h4>Defensive Security Audit Trail</h4>
        ${sec.events.slice(0, 8).map((e) => `
          <div style="padding:5px 0; border-bottom:1px solid rgba(119,153,165,0.12)">
            <span class="badge ${e.severity === 'critical' ? 'critical' : (e.severity === 'warning' ? 'hypothesis' : 'fact')}">${e.category}</span>
            <p style="margin-top:3px">${e.message}</p>
          </div>
        `).join('')}
      </div>
    `;
    document.getElementById('btn-export-backup')?.addEventListener('click', async () => {
      const res = await api('/api/v1/admin/backup', { method: 'POST' });
      const blob = new Blob([JSON.stringify(res.snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.backup_file;
      a.click();
      document.getElementById('backup-status').textContent = `Exported ${res.backup_file} (secrets scrubbed).`;
    });
  }
}

// ---------------------------------------------------------------------------
// 7. Bind Interactive UI Handlers
// ---------------------------------------------------------------------------
function bindUIEvents() {
  // Modes Drawer
  document.getElementById('btn-modes-drawer').addEventListener('click', () => {
    document.getElementById('modes-drawer').classList.toggle('hidden');
  });
  document.getElementById('btn-close-modes').addEventListener('click', () => {
    document.getElementById('modes-drawer').classList.add('hidden');
  });
  document.getElementById('modes-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-mode-id]');
    if (!btn) return;
    try {
      await api('/api/v1/world/mode', { method: 'POST', body: JSON.stringify({ mode_id: btn.dataset.modeId }) });
    } catch (err) {
      alert(err.message);
    }
  });

  // Quick locomotion & urgent alert buttons
  document.querySelectorAll('[data-quick-move]').forEach((btn) => {
    btn.addEventListener('click', () => {
      api('/api/v1/world/move', {
        method: 'POST',
        body: JSON.stringify({
          zone_id: btn.dataset.quickMove,
          activity: `Walking to ${btn.dataset.quickMove.replaceAll('_', ' ')}.`,
          emotional_state: 'focused',
          urgent: false,
        }),
      });
    });
  });
  document.querySelectorAll('[data-quick-urgent]').forEach((btn) => {
    btn.addEventListener('click', () => {
      api('/api/v1/world/move', {
        method: 'POST',
        body: JSON.stringify({
          zone_id: btn.dataset.quickUrgent,
          activity: 'Urgent defensive perimeter inspection triggered!',
          emotional_state: 'urgent',
          urgent: true,
          mode_override: 'defensive_security',
        }),
      });
    });
  });

  // Reduced Motion toggle
  document.getElementById('chk-reduced-motion').addEventListener('change', (e) => {
    api(`/api/v1/world/reduced-motion?enabled=${e.target.checked}`, { method: 'POST' });
  });

  // 7 Hardware Switches click
  document.getElementById('switches-strip').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-switch]');
    if (!btn) return;
    const key = btn.dataset.switch;
    const nextState = !state.switches[key];
    await api(`/api/v1/switches/${key}`, { method: 'PATCH', body: JSON.stringify({ enabled: nextState }) });
  });

  // Camera Director Preset Selector
  document.getElementById('camera-preset-select').addEventListener('change', (e) => {
    sanctuary.cameraDirector.setManualSelect(e.target.value, sanctuary.reducedMotion);
  });

  // Holographic Mode Toggle & Layout Buttons
  document.getElementById('btn-hologram-toggle').addEventListener('click', async () => {
    const targetMode = state.world?.active_mode === 'holographic_presence' ? 'living_presence' : 'holographic_presence';
    try {
      await api('/api/v1/world/mode', { method: 'POST', body: JSON.stringify({ mode_id: targetMode }) });
    } catch (err) {
      alert(err.message);
    }
  });
  document.querySelectorAll('[data-holo-layout]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-holo-layout]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      sanctuary.setHologramMode(true, btn.dataset.holoLayout);
    });
  });
  document.getElementById('btn-exit-hologram').addEventListener('click', () => {
    api('/api/v1/world/mode', { method: 'POST', body: JSON.stringify({ mode_id: 'living_presence' }) });
  });

  // Inspector Drawer
  document.getElementById('btn-inspector-drawer').addEventListener('click', () => {
    const drw = document.getElementById('inspector-drawer');
    drw.classList.toggle('hidden');
    if (!drw.classList.contains('hidden')) renderInspectorTab(state.activeInspectorTab);
  });
  document.getElementById('btn-close-inspector').addEventListener('click', () => {
    document.getElementById('inspector-drawer').classList.add('hidden');
  });
  document.getElementById('inspector-tabs').addEventListener('click', (e) => {
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) renderInspectorTab(tabBtn.dataset.tab);
  });

  // Scenario Launch Delegation inside Inspector
  document.getElementById('inspector-body').addEventListener('click', async (e) => {
    const launchBtn = e.target.closest('[data-launch-scenario]');
    if (launchBtn) {
      await api(`/api/v1/scenarios/${launchBtn.dataset.launchScenario}/activate`, {
        method: 'POST',
        body: JSON.stringify({ variables: {}, playing: true }),
      });
    }
  });

  // Scenario Transport Bar Controls
  document.getElementById('sc-btn-playpause').addEventListener('click', (e) => {
    const sd = sanctuary.scenarioDirector;
    sd.playing = !sd.playing;
    e.target.textContent = sd.playing ? 'Pause' : 'Play';
  });
  document.getElementById('sc-btn-replay').addEventListener('click', () => {
    sanctuary.scenarioDirector.currentTime = 0;
    sanctuary.scenarioDirector.playing = true;
    document.getElementById('sc-btn-playpause').textContent = 'Pause';
  });
  document.getElementById('sc-rate-select').addEventListener('change', (e) => {
    sanctuary.scenarioDirector.playbackRate = Number(e.target.value);
  });
  document.getElementById('sc-timeline-slider').addEventListener('input', (e) => {
    sanctuary.scenarioDirector.playing = false;
    sanctuary.scenarioDirector.currentTime = Number(e.target.value);
    document.getElementById('sc-btn-playpause').textContent = 'Play';
  });
  document.getElementById('sc-variables-row').addEventListener('input', (e) => {
    const key = e.target.dataset.scVar;
    if (!key) return;
    const val = Number(e.target.value);
    const lbl = document.getElementById(`var-val-${key}`);
    if (lbl) lbl.textContent = String(val);
    sanctuary.scenarioDirector.updateVariables({ [key]: val });
    updateScenarioBranchBanner(state.activeScenarioDef, sanctuary.scenarioDirector.variables);
  });
  document.getElementById('sc-btn-restore').addEventListener('click', () => {
    api('/api/v1/scenarios/restore', { method: 'POST' });
  });
  document.getElementById('sc-btn-record').addEventListener('click', toggleWebMScenarioRecording);

  // First-Launch Wake Banner Actions
  document.getElementById('btn-wake-dismiss').addEventListener('click', async () => {
    document.getElementById('first-wake-banner').classList.add('hidden');
    await api('/api/v1/world/complete-onboarding', { method: 'POST' });
  });
  document.getElementById('btn-wake-compute').addEventListener('click', async () => {
    document.getElementById('first-wake-banner').classList.add('hidden');
    await api('/api/v1/world/complete-onboarding', { method: 'POST' });
    document.getElementById('inspector-drawer').classList.remove('hidden');
    renderInspectorTab('compute');
  });
  document.getElementById('btn-wake-scenario').addEventListener('click', async () => {
    document.getElementById('first-wake-banner').classList.add('hidden');
    await api('/api/v1/world/complete-onboarding', { method: 'POST' });
    await api('/api/v1/scenarios/cryo_manifold_forensic/activate', {
      method: 'POST',
      body: JSON.stringify({ variables: {}, playing: true }),
    });
  });

  // Multimodal Chat Form, Voice PTT, Optical Snap, Interrupt & Resume
  document.getElementById('chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    await api('/api/v1/conversations/send', {
      method: 'POST',
      body: JSON.stringify({ content: text, modality: 'text' }),
    });
  });

  document.getElementById('btn-interrupt').addEventListener('click', async () => {
    sanctuary.jarvis.interruptSpeech();
    document.getElementById('btn-interrupt').classList.add('hidden');
    await api('/api/v1/world/interrupt?reason=Owner+interrupted+speech', { method: 'POST' });
  });

  document.getElementById('btn-resume-task').addEventListener('click', async () => {
    await api('/api/v1/world/resume', { method: 'POST' });
  });

  document.getElementById('btn-mic-ptt').addEventListener('click', handleVoiceCaptureClick);
  document.getElementById('btn-cam-snap').addEventListener('click', handleVisionSnapshotClick);
}

async function handleVoiceCaptureClick() {
  if (!state.switches.microphone) {
    alert('Microphone Switch (#2) is currently OFF. Enable MIC in the top switch bar to authorise audio capture.');
    return;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    alert('Browser Web Speech Recognition API is unavailable in this browser. Type directly or connect an audio worker.');
    return;
  }
  const rec = new SR();
  rec.lang = 'en-US';
  rec.interimResults = false;
  state.recognition = rec;
  document.getElementById('mic-state-label').textContent = 'LISTENING...';
  rec.onresult = async (ev) => {
    const transcript = ev.results[0][0].transcript;
    document.getElementById('mic-state-label').textContent = 'MIC READY';
    await api('/api/v1/conversations/send', {
      method: 'POST',
      body: JSON.stringify({ content: transcript, modality: 'voice' }),
    });
  };
  rec.onerror = () => {
    document.getElementById('mic-state-label').textContent = 'MIC READY';
  };
  rec.start();
}

async function handleVisionSnapshotClick() {
  if (!state.switches.camera) {
    alert('Optical Camera Switch (#3) is currently OFF. Enable CAM in the top switch bar to authorise optical capture.');
    return;
  }
  await enforceBrowserSensorGates();
  await api('/api/v1/conversations/send', {
    method: 'POST',
    body: JSON.stringify({
      content: 'Inspect current live optical camera frame at Vision Station.',
      modality: 'vision',
      media_ref: 'live_optical_frame',
    }),
  });
}

function toggleWebMScenarioRecording(e) {
  const btn = e.target;
  if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
    state.mediaRecorder.stop();
    btn.textContent = 'Rec WebM';
    return;
  }
  if (!canvas.captureStream || typeof MediaRecorder === 'undefined') {
    alert('MediaRecorder WebM capture is not supported by this browser.');
    return;
  }
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  state.recordedChunks = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data.size > 0) state.recordedChunks.push(ev.data);
  };
  recorder.onstop = async () => {
    const blob = new Blob(state.recordedChunks, { type: 'video/webm' });
    const fd = new FormData();
    fd.append('title', `Scenario Recording ${new Date().toISOString().slice(11, 19)}`);
    fd.append('source_kind', 'scenario_recording');
    fd.append('file', blob, 'scenario_capture.webm');
    await api('/api/v1/media/upload', { method: 'POST', body: fd });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jarvis_nexus_scenario.webm';
    a.click();
  };
  recorder.start();
  state.mediaRecorder = recorder;
  btn.textContent = 'Stop Rec';
}

// ---------------------------------------------------------------------------
// 8. Inspector Sub-Panel Event Helpers
// ---------------------------------------------------------------------------
function bindMediaPanelHandlers(curMedia) {
  const mId = curMedia?.id || 'media-turbine-bench-01';
  document.getElementById('vid-btn-walk')?.addEventListener('click', () => {
    api('/api/v1/media/video-state', {
      method: 'POST',
      body: JSON.stringify({ media_id: mId, playing: false, current_time: 14.2, extracted_3d_twin: false }),
    });
  });
  document.getElementById('vid-btn-play')?.addEventListener('click', () => {
    api('/api/v1/media/video-state', {
      method: 'POST',
      body: JSON.stringify({ media_id: mId, playing: true, current_time: sanctuary.schlierenFeed.currentTime, extracted_3d_twin: false }),
    });
  });
  document.getElementById('vid-btn-pause-crit')?.addEventListener('click', () => {
    api('/api/v1/media/video-state', {
      method: 'POST',
      body: JSON.stringify({ media_id: mId, playing: false, current_time: 14.2, extracted_3d_twin: false }),
    });
  });
  document.getElementById('vid-btn-extract3d')?.addEventListener('click', () => {
    api('/api/v1/media/video-state', {
      method: 'POST',
      body: JSON.stringify({ media_id: mId, playing: false, current_time: 14.2, extracted_3d_twin: true }),
    });
  });
  document.getElementById('video-upload-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const uploaded = await api('/api/v1/media/upload', { method: 'POST', body: fd });
    uploadedVideoEl.crossOrigin = 'anonymous';
    uploadedVideoEl.src = coreHttpUrl(uploaded.url);
    await uploadedVideoEl.play().catch(() => {});
    sanctuary.setExternalVideoTexture(uploadedVideoEl);
    renderInspectorTab('media');
  });
}

function bindMemoryPanelHandlers() {
  document.getElementById('mem-create-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    payload.is_sensitive = payload.category === 'sensitive';
    await api('/api/v1/memories', { method: 'POST', body: JSON.stringify(payload) });
    renderInspectorTab('memory');
  });
  document.querySelectorAll('[data-forget-mem]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/api/v1/memories/${btn.dataset.forgetMem}`, { method: 'DELETE' });
      renderInspectorTab('memory');
    });
  });
}

function bindGoalsPanelHandlers() {
  document.getElementById('goal-create-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const p = Object.fromEntries(fd.entries());
    p.priority = Number(p.priority);
    await api('/api/v1/goals', { method: 'POST', body: JSON.stringify(p) });
    renderInspectorTab('goals');
  });
  document.querySelectorAll('[data-goal-act]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const body = { status: btn.dataset.status };
        if (btn.dataset.prog) body.progress = Number(btn.dataset.prog);
        await api(`/api/v1/goals/${btn.dataset.goalAct}/status`, { method: 'PATCH', body: JSON.stringify(body) });
        renderInspectorTab('goals');
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function bindAgentsAndToolsHandlers() {
  document.querySelectorAll('[data-dispatch-agent]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/api/v1/agents/${btn.dataset.dispatchAgent}/dispatch`, {
          method: 'POST',
          body: JSON.stringify({ objective: 'Execute live sanctuary integrity and parameter verification.' }),
        });
        renderInspectorTab('agents');
      } catch (err) {
        alert(err.message);
      }
    });
  });

  document.querySelectorAll('[data-exec-tool]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const outEl = document.getElementById('tool-exec-result');
      const res = await api('/api/v1/tools/execute', {
        method: 'POST',
        body: JSON.stringify({ tool_name: btn.dataset.execTool, arguments: {} }),
      });
      if (res.status === 'awaiting_confirmation') {
        outEl.innerHTML = `
          <span style="color:var(--amber)">${res.detail}</span>
          <button class="btn-chip btn-danger-outline" id="btn-confirm-destructive" style="margin-left:6px">Confirm Irreversible Action</button>
        `;
        document.getElementById('btn-confirm-destructive')?.addEventListener('click', async () => {
          const confirmed = await api('/api/v1/tools/execute', {
            method: 'POST',
            body: JSON.stringify({
              tool_name: btn.dataset.execTool,
              arguments: {},
              confirmation_token: res.confirmation_token,
            }),
          });
          outEl.textContent = `Confirmed & Completed: ${JSON.stringify(confirmed.output)}`;
        });
      } else {
        outEl.textContent = `${res.status}: ${JSON.stringify(res.output || res.detail).slice(0, 260)}`;
      }
    });
  });
}

function bindKaggleHandlers() {
  document.querySelectorAll('[data-kaggle-form]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const body = Object.fromEntries(fd.entries());
      await api(`/api/v1/compute/kaggle/profiles/${form.dataset.kaggleForm}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      renderInspectorTab('compute');
    });
  });

  document.querySelectorAll('[data-kaggle-select]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/api/v1/compute/kaggle/profiles/${btn.dataset.kaggleSelect}`, {
        method: 'PATCH',
        body: JSON.stringify({
          profile_name: btn.dataset.kname,
          preferred_model: btn.dataset.kmodel,
          gpu_accelerator: btn.dataset.kgpu,
          is_active: true,
        }),
      });
      renderInspectorTab('compute');
    });
  });

  document.querySelectorAll('[data-kaggle-test]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/api/v1/compute/kaggle/profiles/${btn.dataset.kaggleTest}/test`, { method: 'POST' });
      renderInspectorTab('compute');
    });
  });

  document.getElementById('kaggle-add-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    await api('/api/v1/compute/kaggle/profiles', { method: 'POST', body: JSON.stringify(body) });
    renderInspectorTab('compute');
  });
}

function startTelemetryPoll() {
  setInterval(async () => {
    try {
      const tel = await api('/api/v1/telemetry');
      sanctuary.updateTelemetryBoard(tel);
    } catch { /* ignore transient */ }
  }, 8000);
}

bootstrap();
