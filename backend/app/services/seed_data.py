"""Canonical spatial zones, 15 operational modes, switches, scenarios, and initial DB seed."""
from __future__ import annotations

import json
from typing import Any, Dict, List
from sqlalchemy.orm import Session

from ..models import (
    GoalAuditEvent,
    GoalRecord,
    KaggleProfileRecord,
    MediaCommentary,
    MediaItem,
    MemoryRecord,
    NexusWorldState,
    OwnerSwitch,
    ScenarioDefinition,
    SecurityAuditEvent,
    SpecialistAgent,
)

# 12 Physical Spatial Zones inside the 28m x 28m Basalt & Obsidian Sanctuary
SPATIAL_ZONES: Dict[str, Dict[str, Any]] = {
    "central_operations": {
        "id": "central_operations",
        "label": "Central Operations Holo-Ring",
        "x": 1.45,
        "z": 0.95,
        "yaw": -0.42,
        "look_target": [0.0, 1.25, 0.0],
        "camera_preset": "living_presence",
        "description": "Primary circular obsidian holo-table and master assembly workspace.",
    },
    "simulation_stage": {
        "id": "simulation_stage",
        "label": "Volumetric Simulation & Scenario Stage",
        "x": 0.0,
        "z": 1.85,
        "yaw": 0.0,
        "look_target": [0.0, 1.4, 4.8],
        "camera_preset": "scenario_stage",
        "description": "Recessed emitter floor for room-scale 3D LiDAR reconstructions and parallel physics simulations.",
    },
    "memory_archive": {
        "id": "memory_archive",
        "label": "Memory Archive Colonnade",
        "x": -6.2,
        "z": -1.2,
        "yaw": 1.32,
        "look_target": [-7.8, 1.55, -1.5],
        "camera_preset": "memory_archive",
        "description": "Crystalline smoked-glass optical columns separating verified facts from provisional hypotheses.",
    },
    "research_area": {
        "id": "research_area",
        "label": "Live Research Alcove",
        "x": -5.3,
        "z": -5.6,
        "yaw": 0.72,
        "look_target": [-6.5, 1.5, -6.9],
        "camera_preset": "research",
        "description": "Multi-plane primary literature, empirical telemetry curves, and citation provenance bay.",
    },
    "goals_projects": {
        "id": "goals_projects",
        "label": "Goals & Ongoing Work Bay",
        "x": -2.6,
        "z": -6.8,
        "yaw": 0.25,
        "look_target": [-3.0, 1.55, -8.2],
        "camera_preset": "goals_projects",
        "description": "Z-depth dependency DAG and scheduled autonomous work timeline.",
    },
    "agent_collaboration": {
        "id": "agent_collaboration",
        "label": "Multi-Agent Collaboration Table",
        "x": 2.7,
        "z": -6.6,
        "yaw": -0.32,
        "look_target": [3.2, 1.45, -8.0],
        "camera_preset": "collaboration",
        "description": "Radial workspace coordinating specialist Systems, Research, Audit, and Simulation agents.",
    },
    "media_presentation": {
        "id": "media_presentation",
        "label": "Architectural Media & Video Wall",
        "x": 4.55,
        "z": -4.55,
        "yaw": -0.58,
        "look_target": [6.9, 1.85, -5.8],
        "camera_preset": "video_presentation",
        "description": "Frameless 4.8m media wall where JARVIS stands beside video evidence to extract 3D reconstructions.",
    },
    "defensive_security": {
        "id": "defensive_security",
        "label": "Defensive Security Vault",
        "x": 6.4,
        "z": 0.45,
        "yaw": -1.35,
        "look_target": [8.1, 1.55, 0.5],
        "camera_preset": "security_alert",
        "description": "Titanium security bulkhead and 3D network-perimeter quarantine lattice.",
    },
    "vision_station": {
        "id": "vision_station",
        "label": "Vision & Optical Input Bay",
        "x": 5.4,
        "z": 4.4,
        "yaw": -2.25,
        "look_target": [6.8, 1.5, 5.4],
        "camera_preset": "vision_station",
        "description": "Explicit optical input inspection plane with mandatory capture-state badging.",
    },
    "diagnostics_telemetry": {
        "id": "diagnostics_telemetry",
        "label": "Diagnostics & Telemetry Station",
        "x": -5.4,
        "z": 4.4,
        "yaw": 2.25,
        "look_target": [-6.8, 1.5, 5.4],
        "camera_preset": "diagnostics",
        "description": "Hardware, database, WebSocket latency, and subsystem health instrumentation.",
    },
    "compute_connections": {
        "id": "compute_connections",
        "label": "Local PC & Kaggle Compute Bay",
        "x": 2.6,
        "z": 6.4,
        "yaw": -2.75,
        "look_target": [3.2, 1.45, 7.8],
        "camera_preset": "compute_connections",
        "description": "Local 4-bit CUDA primary worker node and 6-slot encrypted Kaggle outbound tunnel router.",
    },
    "embodiment_switches": {
        "id": "embodiment_switches",
        "label": "Owner Switches & Embodiment Bay",
        "x": -2.6,
        "z": 6.4,
        "yaw": 2.75,
        "look_target": [-3.2, 1.35, 7.8],
        "camera_preset": "owner_switches",
        "description": "Seven hardware-grade owner kill switches and live holographic/device projection sync.",
    },
}

# 15 Connected Operational Modes within the Same Persistent 3D World
OPERATIONAL_MODES: List[Dict[str, Any]] = [
    {"id": "wake_auth", "index": 1, "label": "Wake & Initialization", "zone": "central_operations", "camera": "arrival_wake"},
    {"id": "living_presence", "index": 2, "label": "Living Presence", "zone": "central_operations", "camera": "living_presence"},
    {"id": "conversational_focus", "index": 3, "label": "Conversational Focus", "zone": "central_operations", "camera": "conversation"},
    {"id": "memory_exploration", "index": 4, "label": "Memory Exploration", "zone": "memory_archive", "camera": "memory_archive"},
    {"id": "goals_ongoing_work", "index": 5, "label": "Goals & Ongoing Work", "zone": "goals_projects", "camera": "goals_projects"},
    {"id": "multi_agent_collaboration", "index": 6, "label": "Multi-Agent Collaboration", "zone": "agent_collaboration", "camera": "collaboration"},
    {"id": "tools_execution", "index": 7, "label": "Tools & Guarded Execution", "zone": "diagnostics_telemetry", "camera": "diagnostics"},
    {"id": "live_research", "index": 8, "label": "Live Research", "zone": "research_area", "camera": "research"},
    {"id": "simulation_comparison", "index": 9, "label": "Simulation & Scenario Director", "zone": "simulation_stage", "camera": "scenario_stage"},
    {"id": "vision_understanding", "index": 10, "label": "Vision & Optical Input", "zone": "vision_station", "camera": "vision_station"},
    {"id": "defensive_security", "index": 11, "label": "Defensive Security", "zone": "defensive_security", "camera": "security_alert"},
    {"id": "telemetry_diagnostics", "index": 12, "label": "Telemetry & Diagnostics", "zone": "diagnostics_telemetry", "camera": "diagnostics"},
    {"id": "connections_compute", "index": 13, "label": "Connections & Private Compute", "zone": "compute_connections", "camera": "compute_connections"},
    {"id": "digital_human_embodiment", "index": 14, "label": "Digital-Human Embodiment", "zone": "embodiment_switches", "camera": "conversation"},
    {"id": "holographic_presence", "index": 15, "label": "Physical Holographic Presence", "zone": "simulation_stage", "camera": "hologram_prism"},
]

DEFAULT_SWITCHES: List[Dict[str, Any]] = [
    {
        "switch_key": "master",
        "label": "Master Operational Power",
        "enabled": True,
        "description": "Halts all active capture, autonomous work, remote compute, and tool execution while retaining safe reactivation.",
        "enforcement_scope": "All active sensors, background schedulers, workers, and execution pipelines.",
    },
    {
        "switch_key": "microphone",
        "label": "Microphone Capture",
        "enabled": False,
        "description": "Controls live audio input acquisition. Disabled by default until explicitly enabled by owner.",
        "enforcement_scope": "Browser MediaStream audio tracks and CORE voice transcription endpoint.",
    },
    {
        "switch_key": "camera",
        "label": "Optical Camera Capture",
        "enabled": False,
        "description": "Controls live camera acquisition for Vision mode. Never captures silently in background.",
        "enforcement_scope": "Browser video capture tracks and CORE vision analysis adapter.",
    },
    {
        "switch_key": "autonomy",
        "label": "Authorised Autonomy",
        "enabled": True,
        "description": "Permits scheduled goal progression and background verification within defined boundaries.",
        "enforcement_scope": "Autonomous goal scheduler and background specialist agent runs.",
    },
    {
        "switch_key": "remote_compute",
        "label": "Remote Kaggle Compute",
        "enabled": True,
        "description": "Permits routing inference jobs over outbound authenticated WebSocket to private Kaggle GPU sessions.",
        "enforcement_scope": "Kaggle GPU worker dispatch queue in InferenceHub.",
    },
    {
        "switch_key": "computer_control",
        "label": "Guarded Computer Control",
        "enabled": True,
        "description": "Permits allowlisted diagnostic and workspace tool execution (destructive actions still require explicit confirmation).",
        "enforcement_scope": "GuardedToolRunner internal and external execution endpoints.",
    },
    {
        "switch_key": "embodiment",
        "label": "3D & Holographic Embodiment",
        "enabled": True,
        "description": "Enables real-time 3D character rendering, speech synthesis, MetaHuman bridge, and holographic projection output.",
        "enforcement_scope": "3D character viewport, Pepper's Ghost hologram view, and embodiment broadcast stream.",
    },
]

SEED_SCENARIOS: List[Dict[str, Any]] = [
    {
        "id": "cryo_manifold_forensic",
        "title": "Cryogenic Manifold Cascade — Forensic Reconstruction",
        "classification": "source_backed_reconstruction",
        "summary": "Room-scale 18,000-point LiDAR voxel reconstruction separating measured pressure/thermal sensor telemetry [Fact] from harmonic valve-seat fatigue [Inference], with wireframe technician trajectories and branching pressure-relief variables.",
        "duration_sec": 20.0,
        "variables": [
            {"key": "line_pressure_mpa", "label": "Manifold Line Pressure (MPa)", "min": 110, "max": 240, "default": 210, "step": 5, "unit": "MPa"},
            {"key": "relief_valve_ms", "label": "Bypass Valve Actuation Delay (ms)", "min": 15, "max": 180, "default": 125, "step": 5, "unit": "ms"},
        ],
        "branches": [
            {
                "id": "catastrophic_shear",
                "condition": "line_pressure_mpa >= 185 and relief_valve_ms > 70",
                "label": "Observed Event: Flange Shear at T-00.0s (210 MPa)",
                "outcome": "Acoustic shockwave induces 210 MPa hoop stress at Flange B-4; fracture vector propagates 34 deg NE.",
                "severity": "critical",
            },
            {
                "id": "controlled_bypass",
                "condition": "otherwise",
                "label": "Counterfactual Branch: Sub-70ms Relief Venting",
                "outcome": "Peak transient damped to <= 152 MPa; structural margin preserved at 1.42x yield strength.",
                "severity": "nominal",
            },
        ],
        "timeline": [
            {"t": 0.0, "phase": "Baseline Laminar Cryo Flow", "camera": "scenario_wide", "narration": "At T minus 6 seconds, manifold flow is nominal at 138 MPa. Notice the cyan voxel cloud represents verified laser-scan geometry."},
            {"t": 5.5, "phase": "Acoustic Oscillation Onset [Inference]", "camera": "scenario_actor_track", "narration": "At T minus 2.8 seconds, sensor S-4 records a 410 Hz vibration spike. Technician A moves toward manual isolation."},
            {"t": 11.2, "phase": "Critical Flange Stress Spike [Measured Fact]", "camera": "scenario_origin_closeup", "narration": "Here at T minus 1.4 seconds—pausing playback—thermal imaging confirms 180 degrees Celsius friction heating right at the B-4 collar before rupture."},
            {"t": 16.0, "phase": "Branching Mitigation Comparison", "camera": "scenario_wide", "narration": "Adjust the valve actuation delay below 70 milliseconds to see how early venting eliminates the fracture cascade."},
        ],
        "actors_props": {
            "voxel_structure": "cryo_manifold_riser",
            "wireframe_actors": [
                {"id": "tech_alpha", "label": "Actor A (Inspection Path)", "start": [-2.1, 0.0, 1.4], "end": [-1.05, 0.0, 1.75]},
                {"id": "tech_beta", "label": "Actor B (Isolation Console)", "start": [2.0, 0.0, 1.9], "end": [1.35, 0.0, 1.65]},
            ],
            "causal_vectors": [
                {"origin": [0.15, 1.45, 1.85], "direction": [0.78, 0.34, 0.52], "label": "210 MPa Shear Vector [Measured]", "epistemic": "verified_fact"},
                {"origin": [0.0, 1.15, 1.85], "direction": [-0.35, 0.65, 0.15], "label": "Seat Cavitation [Inference: p=0.84]", "epistemic": "hypothesis"},
            ],
        },
        "evidence_notes": [
            {"kind": "verified_fact", "text": "Strain gauge SG-09 logged 210.4 MPa peak 80 ms prior to loss of telemetry."},
            {"kind": "hypothesis", "text": "Micro-cavitation on primary check-valve seat inferred from 410 Hz FFT harmonic."},
        ],
    },
    {
        "id": "dual_turbine_sim",
        "title": "Parallel Turbine Stator Comparison — Variant A vs Variant B",
        "classification": "data_driven_simulation",
        "summary": "Side-by-side coupled aerodynamic & thermal simulation comparing swept stator geometry (Variant A, laminar cyan) against conventional straight vanes (Variant B, turbulent amber).",
        "duration_sec": 16.0,
        "variables": [
            {"key": "rotor_rpm", "label": "Shaft Speed (RPM)", "min": 4000, "max": 16000, "default": 11500, "step": 500, "unit": "RPM"},
            {"key": "inlet_temp_k", "label": "Turbine Inlet Temp (K)", "min": 950, "max": 1550, "default": 1320, "step": 25, "unit": "K"},
        ],
        "branches": [
            {
                "id": "variant_a_optimal",
                "condition": "inlet_temp_k <= 1450",
                "label": "Variant A Maintains Attached Boundary Layer",
                "outcome": "Variant A reduces blade-tip thermal creep by 28.4% with +3.1% adiabatic efficiency.",
                "severity": "nominal",
            },
            {
                "id": "thermal_limit_exceeded",
                "condition": "otherwise",
                "label": "Both Variants Exceed TBC Coating Margin",
                "outcome": "Above 1450 K without film-cooling augmentation, both geometries breach creep threshold.",
                "severity": "warning",
            },
        ],
        "timeline": [
            {"t": 0.0, "phase": "Cold Spool Baseline", "camera": "scenario_wide", "narration": "Both stator assemblies initialize at identical mass-flow boundary conditions."},
            {"t": 6.0, "phase": "Vortex Shedding Divergence", "camera": "scenario_origin_closeup", "narration": "Notice Variant B on the right developing amber hub-corner stall vortices above 10,500 RPM."},
            {"t": 12.0, "phase": "Steady-State Efficiency Delta", "camera": "scenario_wide", "narration": "Variant A sustains laminar attachment across the shroud ring. I recommend locking Variant A for prototype fabrication."},
        ],
        "actors_props": {
            "voxel_structure": "dual_turbines",
            "wireframe_actors": [],
            "causal_vectors": [
                {"origin": [-1.35, 1.45, 1.85], "direction": [0.0, 0.0, 1.0], "label": "Variant A: Re=4.1e5 Laminar", "epistemic": "verified_fact"},
                {"origin": [1.35, 1.45, 1.85], "direction": [0.25, 0.35, 0.85], "label": "Variant B: Tip Vortex Loss 6.8%", "epistemic": "verified_fact"},
            ],
        },
        "evidence_notes": [
            {"kind": "verified_fact", "text": "Coupled 1D/2D compressible nozzle-stator equations integrated live at 60 Hz."},
        ],
    },
    {
        "id": "zerotrust_compute_flow",
        "title": "Zero-Trust Private Compute & Outbound Kaggle Tunnel",
        "classification": "illustration",
        "summary": "Interactive 3D system architecture demonstrating why JARVIS NEXUS rejects inbound public ports on remote GPUs in favor of outbound authenticated WebSockets.",
        "duration_sec": 14.0,
        "variables": [
            {"key": "expose_public_port", "label": "Simulate Public Port Exposure (0=Zero-Trust, 1=Exposed)", "min": 0, "max": 1, "default": 0, "step": 1, "unit": "mode"},
        ],
        "branches": [
            {
                "id": "zerotrust_secure",
                "condition": "expose_public_port == 0",
                "label": "Outbound Authenticated Tunnel Active",
                "outcome": "Kaggle GPU dials outbound with JARVIS_WORKER_TOKEN; unsolicited external probes drop at perimeter.",
                "severity": "nominal",
            },
            {
                "id": "public_port_compromise",
                "condition": "otherwise",
                "label": "Failure Demonstration: Exposed Tunnel Endpoint",
                "outcome": "Scanner traffic reaches unauthenticated tunnel proxy within 9 seconds; prompts & weights exposed.",
                "severity": "critical",
            },
        ],
        "timeline": [
            {"t": 0.0, "phase": "Sanctuary CORE Dispatch", "camera": "scenario_wide", "narration": "CORE prefers your local 4-bit CUDA GPU worker first, keeping prompts entirely inside local memory."},
            {"t": 5.0, "phase": "Outbound Kaggle Handshake", "camera": "scenario_origin_closeup", "narration": "When remote compute is authorised, the Kaggle session initiates an outbound TLS WebSocket using Kaggle Secrets."},
            {"t": 10.0, "phase": "Attack Surface Comparison", "camera": "scenario_wide", "narration": "Toggle Public Port Exposure to see why unauthenticated ngrok-style ports fail under automated probing."},
        ],
        "actors_props": {
            "voxel_structure": "network_topology",
            "wireframe_actors": [],
            "causal_vectors": [],
        },
        "evidence_notes": [
            {"kind": "verified_fact", "text": "Architectural illustration of CORE inference_hub.py routing rules."},
        ],
    },
]


def ensure_seed_data(db: Session) -> None:
    """Idempotently initialize world state, 7 owner switches, memories, goals, agents, 6 Kaggle slots, and scenarios."""
    if not db.query(NexusWorldState).filter_by(id=1).first():
        db.add(NexusWorldState(id=1))

    existing_switches = {s.switch_key for s in db.query(OwnerSwitch).all()}
    for sw in DEFAULT_SWITCHES:
        if sw["switch_key"] not in existing_switches:
            db.add(OwnerSwitch(**sw))

    if db.query(MemoryRecord).count() == 0:
        db.add_all([
            MemoryRecord(
                category="preference",
                epistemic_status="owner_stated",
                title="Direct Executive Communication & Spatial Demonstration",
                content="Owner prefers direct, candid technical analysis without filler or moralising, backed by interactive 3D volumetric reconstructions ('Let me show you') when diagnosing complex systems.",
                confidence=1.0,
                source_ref="Owner Baseline Directive",
                project_tag="JARVIS_NEXUS",
            ),
            MemoryRecord(
                category="project",
                epistemic_status="verified_fact",
                title="JARVIS NEXUS Persistent Sanctuary Architecture",
                content="Core architecture separates Three.js real-time 3D world & rigged character performance from FastAPI orchestration, typed persistence, and private Local/Kaggle GPU inference workers.",
                confidence=1.0,
                source_ref="backend/app/main.py",
                project_tag="JARVIS_NEXUS",
            ),
            MemoryRecord(
                category="source_research",
                epistemic_status="source_backed",
                title="4-Bit NF4 Quantisation Memory Budget for Qwen2.5-14B",
                content="huihui-ai/Qwen2.5-14B-Instruct-abliterated in 4-bit NF4 requires ~9.2 GB VRAM for weights plus KV-cache headroom, fitting comfortably on a 16 GB local GPU or dual-T4 Kaggle session.",
                confidence=0.96,
                source_ref="worker/jarvis_worker.py hardware estimator",
                project_tag="Inference",
            ),
            MemoryRecord(
                category="agent_finding",
                epistemic_status="hypothesis",
                title="Provisional Stator Tip-Clearance Sensitivity",
                content="Preliminary aerodynamic sweep suggests blade-tip clearance above 1.4% chord may trigger early corner stall; pending full mesh convergence verification.",
                confidence=0.72,
                source_ref="Simulation Analyst Run #01",
                project_tag="Propulsion_Study",
            ),
        ])

    if db.query(GoalRecord).count() == 0:
        g1 = GoalRecord(
            id="goal-private-inference",
            title="Verify Private Local or Kaggle GPU Inference Link",
            description="Establish authenticated private worker connection (huihui-ai/Qwen2.5-14B-Instruct-abliterated) without relying on commercial APIs.",
            priority=1,
            status="active",
            progress=40,
            depends_on_json="[]",
            schedule_spec="on_boot + continuous_heartbeat",
            assigned_zone="compute_connections",
            autonomous_allowed=True,
            next_action="Awaiting local worker launch or Kaggle Worker Package deployment.",
        )
        g2 = GoalRecord(
            id="goal-cryo-forensics",
            title="Complete Cryogenic Manifold B-4 Root-Cause Validation",
            description="Cross-validate strain-gauge SG-09 spike against check-valve cavitation hypothesis in Scenario Director.",
            priority=2,
            status="active",
            progress=65,
            depends_on_json="[]",
            schedule_spec="authorised_background",
            assigned_zone="simulation_stage",
            autonomous_allowed=True,
            next_action="Compare sub-70ms bypass valve branch against measured 210 MPa transient.",
        )
        g3 = GoalRecord(
            id="goal-stator-prototype",
            title="Lock Swept Turbine Stator Variant A Geometry",
            description="Finalize Variant A laminar stator specification once thermal creep margin is reviewed by Owner.",
            priority=3,
            status="pending",
            progress=20,
            depends_on_json=json.dumps(["goal-cryo-forensics"]),
            schedule_spec="milestone_gated",
            assigned_zone="research_area",
            autonomous_allowed=True,
            next_action="Blocked on completion of Cryogenic Manifold B-4 thermal cross-check.",
        )
        db.add_all([g1, g2, g3])
        db.flush()
        db.add(GoalAuditEvent(
            goal_id="goal-cryo-forensics",
            event_type="initialized",
            detail="Goal initialized with room-scale 3D forensic reconstruction scenario cryo_manifold_forensic.",
            actor="CORE",
        ))

    if db.query(SpecialistAgent).count() == 0:
        db.add_all([
            SpecialistAgent(
                id="agent_architect",
                name="Systems Architect",
                role_summary="Evaluates repository structure, module boundaries, database schemas, and architectural trade-offs.",
                allowed_tools_json=json.dumps(["inspect_workspace", "check_runtime_health", "verify_migrations"]),
                permission_boundary="Read-only workspace & schema inspection; zero external network or file deletion.",
                status="idle",
            ),
            SpecialistAgent(
                id="agent_researcher",
                name="Empirical Researcher",
                role_summary="Synthesizes workspace documents, technical telemetry, and source-backed evidence while flagging unverified claims.",
                allowed_tools_json=json.dumps(["search_memories", "inspect_workspace", "run_parametric_sweep"]),
                permission_boundary="Read-only memory & simulation parameter sweeps; cannot promote hypothesis to fact unilaterally.",
                status="idle",
            ),
            SpecialistAgent(
                id="agent_security",
                name="Security & Integrity Auditor",
                role_summary="Audits owner switch enforcement, secret encryption hygiene, worker authentication tokens, and tool logs.",
                allowed_tools_json=json.dumps(["audit_security_posture", "check_runtime_health"]),
                permission_boundary="Defensive posture verification only; strictly non-offensive.",
                status="idle",
            ),
            SpecialistAgent(
                id="agent_simulation",
                name="Simulation & Scenario Analyst",
                role_summary="Executes differential-equation engineering sweeps and prepares 3D volumetric scenarios for JARVIS.",
                allowed_tools_json=json.dumps(["run_parametric_sweep", "list_scenarios"]),
                permission_boundary="Sandboxed mathematical solver only.",
                status="idle",
            ),
        ])

    if db.query(KaggleProfileRecord).count() < 6:
        existing_slots = {p.slot_index for p in db.query(KaggleProfileRecord).all()}
        default_names = [
            "Kaggle-Primary-T4x2",
            "Kaggle-Research-P100",
            "Kaggle-Fallback-North",
            "Kaggle-Simulation-Batch",
            "Kaggle-Nightly-Eval",
            "Kaggle-Reserve-06",
        ]
        for idx, pname in enumerate(default_names, start=1):
            if idx not in existing_slots:
                db.add(KaggleProfileRecord(
                    slot_index=idx,
                    profile_name=pname,
                    masked_username="unconfigured",
                    masked_key="unconfigured",
                    gpu_accelerator="NvidiaTeslaT4x2" if idx % 2 == 1 else "NvidiaTeslaP100",
                    is_active=(idx == 1),
                ))

    existing_scenarios = {s.id for s in db.query(ScenarioDefinition).all()}
    for sc in SEED_SCENARIOS:
        if sc["id"] not in existing_scenarios:
            db.add(ScenarioDefinition(
                id=sc["id"],
                title=sc["title"],
                classification=sc["classification"],
                summary=sc["summary"],
                duration_sec=sc["duration_sec"],
                variables_json=json.dumps(sc["variables"]),
                branches_json=json.dumps(sc["branches"]),
                timeline_json=json.dumps(sc["timeline"]),
                actors_props_json=json.dumps(sc["actors_props"]),
                evidence_notes_json=json.dumps(sc["evidence_notes"]),
            ))

    if db.query(MediaItem).count() == 0:
        vid_id = "media-turbine-bench-01"
        db.add(MediaItem(
            id=vid_id,
            title="Stator Rig High-Speed Schlieren Optical Test (Procedural Stream + Upload Ready)",
            media_type="video",
            source_kind="procedural_telemetry_feed",
            file_path="builtin://schlieren_turbine_test",
            mime_type="video/canvas-stream",
            duration_sec=24.0,
            captions_vtt=(
                "WEBVTT\n\n"
                "00:00.000 --> 00:06.000\nBaseline optical Schlieren pass: Mach 0.72 laminar stator inflow.\n\n"
                "00:06.000 --> 00:13.500\nNotice hub-corner density gradient forming on straight-vane Variant B.\n\n"
                "00:13.500 --> 00:19.000\nSignificant frame (00:14.2): Peak thermal shear spike prior to flow separation.\n\n"
                "00:19.000 --> 00:24.000\nSwept Variant A comparison pass: boundary layer remains attached.\n"
            ),
            linked_project="Propulsion_Study",
            linked_scenario_id="dual_turbine_sim",
        ))
        db.flush()
        db.add_all([
            MediaCommentary(
                media_id=vid_id,
                timestamp_sec=3.2,
                label="Laminar Inflow Baseline",
                analysis="Clean nozzle expansion with uniform stagnation pressure across all 24 stator passages.",
                spawn_scenario_id=None,
            ),
            MediaCommentary(
                media_id=vid_id,
                timestamp_sec=14.2,
                label="Critical Frame: Hub-Corner Vortex Detachment",
                analysis="Shock-boundary interaction detaches here on Variant B. Extracting this frame into 3D Stage demonstrates the exact radial pressure gradient.",
                spawn_scenario_id="dual_turbine_sim",
            ),
        ])

    if db.query(SecurityAuditEvent).count() == 0:
        db.add(SecurityAuditEvent(
            severity="info",
            category="boot_integrity",
            message="CORE initialized with server-side Fernet secret store; microphone and camera switches verified OFF by default.",
            source="SecurityMonitor",
            resolved=True,
        ))

    db.commit()
