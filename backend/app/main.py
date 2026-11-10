"""JARVIS NEXUS — Modular FastAPI CORE Server."""
from __future__ import annotations

import json
import math
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import psutil
from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .config import REPO_ROOT, UPLOADS_DIR, settings
from .database import Base, SessionLocal, engine, get_db, init_database_extensions
from .models import (
    AgentTaskRun,
    Conversation,
    ConversationMessage,
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
    ToolAuditLog,
)
from .security_crypto import decrypt_text, encrypt_dict, encrypt_text, mask_identifier, verify_worker_token
from .services.inference_hub import build_kaggle_worker_package, inference_hub, test_kaggle_profile_auth
from .services.seed_data import OPERATIONAL_MODES, SPATIAL_ZONES, ensure_seed_data
from .services.simulation_and_tools import (
    agent_coordinator,
    export_sanctuary_backup,
    restore_sanctuary_backup,
    run_coupled_engineering_simulation,
    tool_runner,
)
from .services.world_hub import world_hub

BOOT_TIME = time.time()
PGVECTOR_ACTIVE = False


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global PGVECTOR_ACTIVE
    PGVECTOR_ACTIVE = init_database_extensions()
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        ensure_seed_data(db)
    yield


app = FastAPI(
    title="JARVIS NEXUS CORE",
    version=settings.VERSION,
    description="Persistent orchestration, memory, goals, private compute, scenario direction, and shared 3D embodiment engine.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------

class MoveRequest(BaseModel):
    zone_id: str
    activity: str = "Inspecting operational station."
    emotional_state: str = "focused"
    urgent: bool = False
    mode_override: Optional[str] = None


class ModeSwitchRequest(BaseModel):
    mode_id: str


class SwitchUpdateRequest(BaseModel):
    enabled: bool


class ChatSendRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=8000)
    modality: str = "text"
    media_ref: Optional[str] = None
    conversation_id: Optional[str] = None


class MemoryCreateRequest(BaseModel):
    category: str = "owner_fact"
    epistemic_status: str = "owner_stated"
    title: str
    content: str
    is_sensitive: bool = False
    confidence: float = 1.0
    source_ref: Optional[str] = None
    project_tag: Optional[str] = None


class MemoryUpdateRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    epistemic_status: Optional[str] = None
    evidence_verified: bool = False
    confidence: Optional[float] = None


class GoalCreateRequest(BaseModel):
    title: str
    description: str
    priority: int = 2
    depends_on: List[str] = Field(default_factory=list)
    schedule_spec: str = "continuous"
    assigned_zone: str = "goals_projects"
    autonomous_allowed: bool = True
    next_action: str = ""


class GoalStatusUpdateRequest(BaseModel):
    status: Optional[str] = None
    progress: Optional[int] = None
    next_action: Optional[str] = None


class AgentDispatchRequest(BaseModel):
    objective: str


class ToolExecuteRequest(BaseModel):
    tool_name: str
    arguments: Dict[str, Any] = Field(default_factory=dict)
    confirmation_token: Optional[str] = None


class KaggleProfileUpsertRequest(BaseModel):
    profile_name: str
    kaggle_username: Optional[str] = None
    kaggle_key: Optional[str] = None
    preferred_model: str = settings.DEFAULT_MODEL
    gpu_accelerator: str = "NvidiaTeslaT4x2"
    is_active: Optional[bool] = None


class ScenarioCreateRequest(BaseModel):
    id: Optional[str] = None
    title: str
    classification: str = "illustration"
    summary: str
    duration_sec: float = 16.0
    variables: List[Dict[str, Any]] = Field(default_factory=list)
    branches: List[Dict[str, Any]] = Field(default_factory=list)
    timeline: List[Dict[str, Any]] = Field(default_factory=list)
    actors_props: Dict[str, Any] = Field(default_factory=dict)
    evidence_notes: List[Dict[str, Any]] = Field(default_factory=list)


class ScenarioActivateRequest(BaseModel):
    variables: Dict[str, float] = Field(default_factory=dict)
    playing: bool = True
    current_time: float = 0.0
    playback_rate: float = 1.0


class CommentaryCreateRequest(BaseModel):
    timestamp_sec: float
    label: str
    analysis: str
    spawn_scenario_id: Optional[str] = None


class VideoStateSyncRequest(BaseModel):
    media_id: str
    playing: bool
    current_time: float
    extracted_3d_twin: bool = False


class SimulationRunRequest(BaseModel):
    simulation_type: str = "dual_turbine"
    parameters: Dict[str, float] = Field(default_factory=dict)


class ResearchQueryRequest(BaseModel):
    query: str


# ---------------------------------------------------------------------------
# 1. Health, Capabilities & World State
# ---------------------------------------------------------------------------

@app.get("/api/v1/health")
def get_health(db: Session = Depends(get_db)):
    caps = settings.runtime_capabilities()
    caps["pgvector_extension_active"] = PGVECTOR_ACTIVE
    return {
        "status": "ok",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "uptime_sec": round(time.time() - BOOT_TIME, 1),
        "capabilities": caps,
        "inference": inference_hub.status_snapshot(db),
        "connected_embodiment_clients": len(world_hub.clients),
    }


@app.get("/api/v1/world")
def get_world_state(db: Session = Depends(get_db)):
    return world_hub.serialize_world(db)


@app.post("/api/v1/world/complete-onboarding")
async def complete_onboarding(owner_name: str = Query(default="Owner"), db: Session = Depends(get_db)):
    state = db.query(NexusWorldState).filter_by(id=1).first()
    state.first_launch_completed = True
    state.owner_name = owner_name.strip() or "Owner"
    if state.active_mode == "wake_auth":
        state.active_mode = "living_presence"
    db.commit()
    snap = world_hub.serialize_world(db)
    await world_hub.broadcast("world_sync", snap)
    return snap


@app.post("/api/v1/world/reduced-motion")
async def set_reduced_motion(enabled: bool = Query(...), db: Session = Depends(get_db)):
    state = db.query(NexusWorldState).filter_by(id=1).first()
    state.reduced_motion = enabled
    db.commit()
    snap = world_hub.serialize_world(db)
    await world_hub.broadcast("world_sync", snap)
    return snap


@app.post("/api/v1/world/mode")
async def switch_operational_mode(req: ModeSwitchRequest, db: Session = Depends(get_db)):
    mode = next((m for m in OPERATIONAL_MODES if m["id"] == req.mode_id), None)
    if not mode:
        raise HTTPException(status_code=404, detail=f"Unknown operational mode '{req.mode_id}'")

    switches = {s.switch_key: s.enabled for s in db.query(OwnerSwitch).all()}
    if req.mode_id in ("digital_human_embodiment", "holographic_presence") and not switches.get("embodiment", True):
        raise HTTPException(status_code=409, detail="Embodiment switch is currently OFF. Enable Embodiment to activate projection modes.")

    urgent = req.mode_id == "defensive_security"
    emotion = "urgent" if urgent else ("listening" if req.mode_id == "conversational_focus" else "focused")
    snap = world_hub.command_move_to_zone(
        db,
        zone_id=mode["zone"],
        activity=f"Operating in {mode['label']} mode.",
        emotional_state=emotion,
        urgent=urgent,
        mode_override=mode["id"],
        camera_override=mode["camera"],
    )
    await world_hub.broadcast("world_sync", snap)
    return snap


@app.post("/api/v1/world/move")
async def move_jarvis(req: MoveRequest, db: Session = Depends(get_db)):
    if req.zone_id not in SPATIAL_ZONES:
        raise HTTPException(status_code=404, detail=f"Unknown spatial zone '{req.zone_id}'")
    snap = world_hub.command_move_to_zone(
        db,
        zone_id=req.zone_id,
        activity=req.activity,
        emotional_state=req.emotional_state,
        urgent=req.urgent,
        mode_override=req.mode_override,
    )
    await world_hub.broadcast("world_sync", snap)
    return snap


@app.post("/api/v1/world/interrupt")
async def interrupt_jarvis(reason: str = Query(default="Owner direct address"), db: Session = Depends(get_db)):
    snap = world_hub.interrupt_for_owner(db, reason=reason)
    await world_hub.broadcast("jarvis_interrupted", snap)
    return snap


@app.post("/api/v1/world/resume")
async def resume_jarvis_work(db: Session = Depends(get_db)):
    snap = world_hub.resume_interrupted_work(db)
    await world_hub.broadcast("world_sync", snap)
    return snap


# ---------------------------------------------------------------------------
# 2. Seven Persistent Owner Switches (Hardware-Grade Enforcement)
# ---------------------------------------------------------------------------

@app.get("/api/v1/switches")
def list_switches(db: Session = Depends(get_db)):
    rows = db.query(OwnerSwitch).all()
    order = ["master", "microphone", "camera", "autonomy", "remote_compute", "computer_control", "embodiment"]
    rows.sort(key=lambda r: order.index(r.switch_key) if r.switch_key in order else 99)
    return [
        {
            "switch_key": r.switch_key,
            "label": r.label,
            "enabled": r.enabled,
            "description": r.description,
            "enforcement_scope": r.enforcement_scope,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in rows
    ]


@app.patch("/api/v1/switches/{switch_key}")
async def update_switch(switch_key: str, req: SwitchUpdateRequest, db: Session = Depends(get_db)):
    sw = db.query(OwnerSwitch).filter_by(switch_key=switch_key).first()
    if not sw:
        raise HTTPException(status_code=404, detail=f"Unknown switch '{switch_key}'")

    sw.enabled = req.enabled
    effects: List[str] = []

    if switch_key == "master" and not req.enabled:
        # Master OFF halts capture, active agent runs, and active scenario playback while retaining safe reactivation
        for sensor_key in ("microphone", "camera"):
            s_obj = db.query(OwnerSwitch).filter_by(switch_key=sensor_key).first()
            if s_obj and s_obj.enabled:
                s_obj.enabled = False
                effects.append(f"{sensor_key}_released")
        running_runs = db.query(AgentTaskRun).filter_by(status="running").all()
        for r in running_runs:
            agent_coordinator.cancel_run(db, r.id)
            effects.append(f"cancelled_agent_run:{r.id}")
        if world_hub.active_scenario_runtime:
            world_hub.active_scenario_runtime["playing"] = False
            effects.append("scenario_paused")
        state = db.query(NexusWorldState).filter_by(id=1).first()
        if state:
            state.locomotion_state = "idle_attentive"
            state.posture = "standby"
            state.emotional_state = "neutral"
            state.active_activity_summary = "Master Power OFF — Standby (all capture and execution halted)."

    if switch_key == "autonomy" and not req.enabled:
        for g in db.query(GoalRecord).filter_by(status="active", autonomous_allowed=True).all():
            g.status = "paused"
            effects.append(f"paused_autonomous_goal:{g.id}")

    if switch_key == "camera" and not req.enabled:
        effects.append("camera_stream_terminated")

    if switch_key == "microphone" and not req.enabled:
        effects.append("microphone_stream_released")

    db.add(SecurityAuditEvent(
        severity="info" if req.enabled else "warning",
        category="owner_switch",
        message=f"Owner toggled switch '{switch_key}' -> {'ON' if req.enabled else 'OFF'}. Effects: {', '.join(effects) or 'immediate gate update'}.",
        source="OwnerSwitchPanel",
    ))
    db.commit()

    snap = world_hub.serialize_world(db)
    await world_hub.broadcast("switch_changed", {"switch_key": switch_key, "enabled": req.enabled, "effects": effects, "world": snap})
    return {"switch_key": switch_key, "enabled": sw.enabled, "effects": effects}


# ---------------------------------------------------------------------------
# 3. Persistent Conversations & Interruption
# ---------------------------------------------------------------------------

@app.get("/api/v1/conversations")
def get_primary_conversation(db: Session = Depends(get_db)):
    conv = db.query(Conversation).order_by(Conversation.created_at.asc()).first()
    if not conv:
        conv = Conversation(title="Primary Sanctuary Session")
        db.add(conv)
        db.commit()
    msgs = (
        db.query(ConversationMessage)
        .filter_by(conversation_id=conv.id)
        .order_by(ConversationMessage.created_at.asc())
        .all()
    )
    return {
        "conversation_id": conv.id,
        "title": conv.title,
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "modality": m.modality,
                "content": m.content,
                "media_ref": m.media_ref,
                "interrupted": m.interrupted,
                "inference_source": m.inference_source,
                "emotional_tone": m.emotional_tone,
                "target_zone": m.target_zone,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in msgs[-60:]
        ],
    }


@app.post("/api/v1/conversations/send")
async def send_conversation_message(req: ChatSendRequest, db: Session = Depends(get_db)):
    switches = {s.switch_key: s.enabled for s in db.query(OwnerSwitch).all()}
    if req.modality == "voice" and not switches.get("microphone", False):
        raise HTTPException(status_code=403, detail="Microphone switch is OFF. Enable Microphone capture to send voice input.")
    if req.modality == "vision" and not switches.get("camera", False):
        raise HTTPException(status_code=403, detail="Camera switch is OFF. Enable Optical Camera capture to send live vision input.")

    conv = (
        db.query(Conversation).filter_by(id=req.conversation_id).first()
        if req.conversation_id
        else db.query(Conversation).order_by(Conversation.created_at.asc()).first()
    )
    if not conv:
        conv = Conversation(title="Primary Sanctuary Session")
        db.add(conv)
        db.commit()

    # Save interrupted state if JARVIS was working elsewhere
    world_hub.interrupt_for_owner(db, reason="Conversational turn")

    user_msg = ConversationMessage(
        conversation_id=conv.id,
        role="user",
        modality=req.modality,
        content=req.content,
        media_ref=req.media_ref,
        inference_source="owner",
        emotional_tone="neutral",
    )
    db.add(user_msg)
    db.commit()

    prior_msgs = (
        db.query(ConversationMessage)
        .filter_by(conversation_id=conv.id)
        .order_by(ConversationMessage.created_at.asc())
        .all()
    )
    history = [{"role": "assistant" if m.role == "jarvis" else "user", "content": m.content} for m in prior_msgs[:-1]]

    reply_text, inf_source, directive = await inference_hub.generate_response(db, history, req.content)

    # Apply task-linked spatial movement / scenario activation
    if directive.get("resume_work"):
        world_snap = world_hub.resume_interrupted_work(db)
    elif directive.get("zone"):
        world_snap = world_hub.command_move_to_zone(
            db,
            zone_id=directive["zone"],
            activity=f"Addressing Owner: {req.content[:72]}",
            emotional_state=directive.get("emotion", "attentive"),
            urgent=bool(directive.get("urgent", False)),
            mode_override=directive.get("mode"),
        )
    else:
        world_snap = world_hub.serialize_world(db)

    activated_scenario = None
    if directive.get("scenario_id"):
        sc = db.query(ScenarioDefinition).filter_by(id=directive["scenario_id"]).first()
        if sc:
            default_vars = {v["key"]: v["default"] for v in json.loads(sc.variables_json or "[]")}
            world_hub.active_scenario_runtime = {
                "scenario_id": sc.id,
                "title": sc.title,
                "classification": sc.classification,
                "variables": default_vars,
                "playing": True,
                "current_time": 0.0,
                "playback_rate": 1.0,
            }
            activated_scenario = world_hub.active_scenario_runtime
            world_snap["active_scenario"] = activated_scenario

    jarvis_msg = ConversationMessage(
        conversation_id=conv.id,
        role="jarvis",
        modality="speech_and_text",
        content=reply_text,
        inference_source=inf_source,
        emotional_tone=directive.get("emotion", "attentive"),
        target_zone=directive.get("zone"),
    )
    db.add(jarvis_msg)
    db.commit()

    payload = {
        "user_message": {"id": user_msg.id, "content": user_msg.content, "modality": user_msg.modality},
        "jarvis_message": {
            "id": jarvis_msg.id,
            "content": jarvis_msg.content,
            "inference_source": jarvis_msg.inference_source,
            "emotional_tone": jarvis_msg.emotional_tone,
            "target_zone": jarvis_msg.target_zone,
            "created_at": jarvis_msg.created_at.isoformat(),
        },
        "world": world_snap,
        "activated_scenario": activated_scenario,
    }
    await world_hub.broadcast("jarvis_spoke", payload)
    return payload


# ---------------------------------------------------------------------------
# 4. Typed 10-Category Memory System
# ---------------------------------------------------------------------------

VALID_MEMORY_CATEGORIES = {
    "owner_fact", "preference", "conversation_context", "commitment",
    "project", "tool_history", "agent_finding", "source_research",
    "scenario_media", "sensitive",
}


def _simple_lexical_embedding(text: str) -> List[float]:
    """Deterministic 16-dim normalized character-trigram hash projection for local semantic ranking."""
    vec = [0.0] * 16
    clean = (text or "").lower()
    for i in range(max(0, len(clean) - 2)):
        tri = clean[i : i + 3]
        idx = hash(tri) % 16
        vec[idx] += 1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [round(v / norm, 4) for v in vec]


@app.get("/api/v1/memories")
def list_memories(
    category: Optional[str] = None,
    q: Optional[str] = None,
    reveal_sensitive: bool = False,
    db: Session = Depends(get_db),
):
    query = db.query(MemoryRecord)
    if category:
        query = query.filter_by(category=category)
    items = query.order_by(MemoryRecord.updated_at.desc()).all()

    results = []
    q_low = (q or "").strip().lower()
    for m in items:
        body = decrypt_text(m.encrypted_payload) if (m.is_sensitive and reveal_sensitive and m.encrypted_payload) else (
            "[SENSITIVE RECORD — ENCRYPTED AT REST]" if m.is_sensitive else m.content
        )
        if q_low and q_low not in m.title.lower() and q_low not in body.lower() and q_low not in (m.project_tag or "").lower():
            continue
        results.append({
            "id": m.id,
            "category": m.category,
            "epistemic_status": m.epistemic_status,
            "title": m.title,
            "content": body,
            "is_sensitive": m.is_sensitive,
            "confidence": m.confidence,
            "source_ref": m.source_ref,
            "project_tag": m.project_tag,
            "updated_at": m.updated_at.isoformat() if m.updated_at else None,
        })
    return results


@app.post("/api/v1/memories")
def create_memory(req: MemoryCreateRequest, db: Session = Depends(get_db)):
    if req.category not in VALID_MEMORY_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category '{req.category}'.")

    is_sens = req.is_sensitive or req.category == "sensitive"
    enc = encrypt_text(req.content) if is_sens else None
    stored_content = "[ENCRYPTED]" if is_sens else req.content
    emb = json.dumps(_simple_lexical_embedding(f"{req.title} {req.content}"))

    rec = MemoryRecord(
        category=req.category,
        epistemic_status=req.epistemic_status,
        title=req.title,
        content=stored_content,
        encrypted_payload=enc,
        is_sensitive=is_sens,
        confidence=req.confidence,
        source_ref=req.source_ref,
        project_tag=req.project_tag,
        embedding_json=emb,
    )
    db.add(rec)
    db.commit()
    return {"id": rec.id, "category": rec.category, "epistemic_status": rec.epistemic_status, "is_sensitive": rec.is_sensitive}


@app.patch("/api/v1/memories/{memory_id}")
def update_memory(memory_id: str, req: MemoryUpdateRequest, db: Session = Depends(get_db)):
    rec = db.query(MemoryRecord).filter_by(id=memory_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Memory record not found.")

    # Never silently convert speculation/hypothesis into verified_fact!
    if rec.epistemic_status == "hypothesis" and req.epistemic_status == "verified_fact" and not req.evidence_verified:
        raise HTTPException(
            status_code=409,
            detail="Cannot promote a hypothesis to verified_fact without explicit evidence_verified=true confirmation.",
        )

    if req.title is not None:
        rec.title = req.title
    if req.content is not None:
        if rec.is_sensitive:
            rec.encrypted_payload = encrypt_text(req.content)
            rec.content = "[ENCRYPTED]"
        else:
            rec.content = req.content
    if req.epistemic_status is not None:
        rec.epistemic_status = req.epistemic_status
    if req.confidence is not None:
        rec.confidence = req.confidence

    db.commit()
    return {"id": rec.id, "epistemic_status": rec.epistemic_status, "updated": True}


@app.delete("/api/v1/memories/{memory_id}")
def forget_memory(memory_id: str, db: Session = Depends(get_db)):
    rec = db.query(MemoryRecord).filter_by(id=memory_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Memory record not found.")
    db.delete(rec)
    db.commit()
    return {"forgotten_id": memory_id, "status": "deleted"}


# ---------------------------------------------------------------------------
# 5. Goals, Dependencies & Auditable Scheduling
# ---------------------------------------------------------------------------

@app.get("/api/v1/goals")
def list_goals(db: Session = Depends(get_db)):
    goals = db.query(GoalRecord).order_by(GoalRecord.priority.asc(), GoalRecord.created_at.asc()).all()
    status_by_id = {g.id: g.status for g in goals}
    out = []
    for g in goals:
        deps = json.loads(g.depends_on_json or "[]")
        unmet_deps = [d for d in deps if status_by_id.get(d) != "completed"]
        audits = (
            db.query(GoalAuditEvent)
            .filter_by(goal_id=g.id)
            .order_by(GoalAuditEvent.created_at.desc())
            .limit(5)
            .all()
        )
        out.append({
            "id": g.id,
            "title": g.title,
            "description": g.description,
            "priority": g.priority,
            "status": g.status,
            "progress": g.progress,
            "depends_on": deps,
            "unmet_dependencies": unmet_deps,
            "schedule_spec": g.schedule_spec,
            "assigned_zone": g.assigned_zone,
            "autonomous_allowed": g.autonomous_allowed,
            "next_action": g.next_action,
            "audit_trail": [
                {"event_type": a.event_type, "detail": a.detail, "actor": a.actor, "created_at": a.created_at.isoformat()}
                for a in audits
            ],
        })
    return out


@app.post("/api/v1/goals")
def create_goal(req: GoalCreateRequest, db: Session = Depends(get_db)):
    g = GoalRecord(
        title=req.title,
        description=req.description,
        priority=req.priority,
        status="active",
        progress=0,
        depends_on_json=json.dumps(req.depends_on),
        schedule_spec=req.schedule_spec,
        assigned_zone=req.assigned_zone,
        autonomous_allowed=req.autonomous_allowed,
        next_action=req.next_action,
    )
    db.add(g)
    db.flush()
    db.add(GoalAuditEvent(goal_id=g.id, event_type="created", detail=f"Goal created (priority P{req.priority}).", actor="Owner"))
    db.commit()
    return {"id": g.id, "status": g.status}


@app.patch("/api/v1/goals/{goal_id}/status")
async def update_goal_status(goal_id: str, req: GoalStatusUpdateRequest, db: Session = Depends(get_db)):
    g = db.query(GoalRecord).filter_by(id=goal_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Goal not found.")

    if req.status == "active":
        deps = json.loads(g.depends_on_json or "[]")
        for dep_id in deps:
            dep = db.query(GoalRecord).filter_by(id=dep_id).first()
            if dep and dep.status != "completed":
                raise HTTPException(
                    status_code=409,
                    detail=f"Dependency '{dep.title}' ({dep.id}) must be completed before activating this goal.",
                )

    changes = []
    if req.status is not None:
        g.status = req.status
        changes.append(f"status->{req.status}")
    if req.progress is not None:
        g.progress = max(0, min(100, req.progress))
        changes.append(f"progress->{g.progress}%")
    if req.next_action is not None:
        g.next_action = req.next_action
        changes.append("updated next_action")

    db.add(GoalAuditEvent(goal_id=g.id, event_type="updated", detail=", ".join(changes) or "noop", actor="Owner"))
    db.commit()
    await world_hub.broadcast("goals_updated", {"goal_id": g.id, "status": g.status, "progress": g.progress})
    return {"id": g.id, "status": g.status, "progress": g.progress}


# ---------------------------------------------------------------------------
# 6. Specialist Agents & Guarded Tools
# ---------------------------------------------------------------------------

@app.get("/api/v1/agents")
def list_agents(db: Session = Depends(get_db)):
    agents = db.query(SpecialistAgent).all()
    runs = db.query(AgentTaskRun).order_by(AgentTaskRun.started_at.desc()).limit(15).all()
    return {
        "agents": [
            {
                "id": a.id,
                "name": a.name,
                "role_summary": a.role_summary,
                "allowed_tools": json.loads(a.allowed_tools_json or "[]"),
                "permission_boundary": a.permission_boundary,
                "status": a.status,
                "current_task": a.current_task,
                "last_output": a.last_output,
            }
            for a in agents
        ],
        "recent_runs": [
            {
                "id": r.id,
                "agent_id": r.agent_id,
                "objective": r.objective,
                "status": r.status,
                "trace": json.loads(r.trace_json or "[]"),
                "result_summary": r.result_summary,
                "started_at": r.started_at.isoformat() if r.started_at else None,
            }
            for r in runs
        ],
    }


@app.post("/api/v1/agents/{agent_id}/dispatch")
async def dispatch_specialist_agent(agent_id: str, req: AgentDispatchRequest, db: Session = Depends(get_db)):
    world_snap = world_hub.command_move_to_zone(
        db,
        zone_id="agent_collaboration",
        activity=f"Coordinating {agent_id} on: {req.objective[:60]}",
        emotional_state="focused",
        mode_override="multi_agent_collaboration",
    )
    await world_hub.broadcast("world_sync", world_snap)
    res = await agent_coordinator.dispatch_agent(db, agent_id, req.objective)
    await world_hub.broadcast("agent_run_finished", res)
    return res


@app.post("/api/v1/agents/runs/{run_id}/cancel")
def cancel_agent_run(run_id: str, db: Session = Depends(get_db)):
    run = agent_coordinator.cancel_run(db, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Agent run not found.")
    return {"run_id": run.id, "status": run.status}


@app.get("/api/v1/tools")
def list_guarded_tools(db: Session = Depends(get_db)):
    logs = db.query(ToolAuditLog).order_by(ToolAuditLog.created_at.desc()).limit(20).all()
    return {
        "allowlist": GuardedToolRunner_spec_list(),
        "audit_logs": [
            {
                "id": l.id,
                "tool_name": l.tool_name,
                "scope": l.scope,
                "destructive": l.destructive,
                "status": l.status,
                "confirmation_token": l.confirmation_token,
                "output_excerpt": l.output_excerpt,
                "duration_ms": l.duration_ms,
                "created_at": l.created_at.isoformat() if l.created_at else None,
            }
            for l in logs
        ],
    }


def GuardedToolRunner_spec_list() -> List[Dict[str, Any]]:
    return [{"tool_name": k, **v} for k, v in tool_runner.ALLOWLIST.items()]


@app.post("/api/v1/tools/execute")
def execute_guarded_tool(req: ToolExecuteRequest, db: Session = Depends(get_db)):
    return tool_runner.execute(db, req.tool_name, req.arguments, req.confirmation_token)


# ---------------------------------------------------------------------------
# 7. Live Research & Coupled Simulations
# ---------------------------------------------------------------------------

@app.post("/api/v1/research/query")
async def run_live_research(req: ResearchQueryRequest, db: Session = Depends(get_db)):
    world_snap = world_hub.command_move_to_zone(
        db,
        zone_id="research_area",
        activity=f"Researching primary sources & workspace evidence: {req.query[:60]}",
        emotional_state="focused",
        mode_override="live_research",
    )
    await world_hub.broadcast("world_sync", world_snap)

    q_low = req.query.lower()
    memories = db.query(MemoryRecord).all()
    matched_memories = [
        {"id": m.id, "title": m.title, "epistemic_status": m.epistemic_status, "source_ref": m.source_ref, "excerpt": m.content[:220]}
        for m in memories
        if not m.is_sensitive and (q_low in m.title.lower() or q_low in m.content.lower() or any(tok in m.content.lower() for tok in q_low.split()))
    ]

    # Search repository markdown/code documentation truthfully
    repo_hits = []
    for doc_path in REPO_ROOT.rglob("*.md"):
        if "node_modules" in doc_path.parts or ".venv" in doc_path.parts:
            continue
        text = doc_path.read_text(encoding="utf-8", errors="ignore")
        if any(tok in text.lower() for tok in q_low.split() if len(tok) > 2):
            repo_hits.append({
                "file": doc_path.relative_to(REPO_ROOT).as_posix(),
                "excerpt": text[:280].replace("\n", " "),
            })

    return {
        "query": req.query,
        "provenance_policy": "Truthful source-backed retrieval only; zero fabricated citations.",
        "memory_matches": matched_memories,
        "workspace_documents": repo_hits[:8],
    }


@app.post("/api/v1/simulations/run")
async def run_simulation(req: SimulationRunRequest, db: Session = Depends(get_db)):
    result = run_coupled_engineering_simulation(req.simulation_type, req.parameters)
    await world_hub.broadcast("simulation_computed", result)
    return result


# ---------------------------------------------------------------------------
# 8. Scenario Director ("Let Me Show You")
# ---------------------------------------------------------------------------

def _serialize_scenario(s: ScenarioDefinition) -> Dict[str, Any]:
    return {
        "id": s.id,
        "title": s.title,
        "classification": s.classification,
        "summary": s.summary,
        "duration_sec": s.duration_sec,
        "variables": json.loads(s.variables_json or "[]"),
        "branches": json.loads(s.branches_json or "[]"),
        "timeline": json.loads(s.timeline_json or "[]"),
        "actors_props": json.loads(s.actors_props_json or "{}"),
        "evidence_notes": json.loads(s.evidence_notes_json or "[]"),
    }


@app.get("/api/v1/scenarios")
def list_scenarios(db: Session = Depends(get_db)):
    rows = db.query(ScenarioDefinition).order_by(ScenarioDefinition.created_at.asc()).all()
    return {
        "active_runtime": world_hub.active_scenario_runtime,
        "scenarios": [_serialize_scenario(s) for s in rows],
    }


@app.post("/api/v1/scenarios")
def save_scenario(req: ScenarioCreateRequest, db: Session = Depends(get_db)):
    valid_classes = {"illustration", "data_driven_simulation", "source_backed_reconstruction", "speculative_visualisation"}
    if req.classification not in valid_classes:
        raise HTTPException(status_code=400, detail=f"Classification must be one of {sorted(valid_classes)}")

    sc_id = req.id or f"scenario_{uuid.uuid4().hex[:8]}"
    existing = db.query(ScenarioDefinition).filter_by(id=sc_id).first()
    if existing:
        existing.title = req.title
        existing.classification = req.classification
        existing.summary = req.summary
        existing.duration_sec = req.duration_sec
        existing.variables_json = json.dumps(req.variables)
        existing.branches_json = json.dumps(req.branches)
        existing.timeline_json = json.dumps(req.timeline)
        existing.actors_props_json = json.dumps(req.actors_props)
        existing.evidence_notes_json = json.dumps(req.evidence_notes)
        db.commit()
        return _serialize_scenario(existing)

    sc = ScenarioDefinition(
        id=sc_id,
        title=req.title,
        classification=req.classification,
        summary=req.summary,
        duration_sec=req.duration_sec,
        variables_json=json.dumps(req.variables),
        branches_json=json.dumps(req.branches),
        timeline_json=json.dumps(req.timeline),
        actors_props_json=json.dumps(req.actors_props),
        evidence_notes_json=json.dumps(req.evidence_notes),
    )
    db.add(sc)
    db.commit()
    return _serialize_scenario(sc)


@app.post("/api/v1/scenarios/{scenario_id}/activate")
async def activate_scenario(scenario_id: str, req: ScenarioActivateRequest, db: Session = Depends(get_db)):
    sc = db.query(ScenarioDefinition).filter_by(id=scenario_id).first()
    if not sc:
        raise HTTPException(status_code=404, detail=f"Scenario '{scenario_id}' not found.")

    default_vars = {v["key"]: v["default"] for v in json.loads(sc.variables_json or "[]")}
    merged_vars = {**default_vars, **req.variables}

    sim_type = "cryo_manifold" if "cryo" in sc.id else "dual_turbine"
    live_calc = run_coupled_engineering_simulation(sim_type, merged_vars)

    world_hub.active_scenario_runtime = {
        "scenario_id": sc.id,
        "title": sc.title,
        "classification": sc.classification,
        "variables": merged_vars,
        "playing": req.playing,
        "current_time": req.current_time,
        "playback_rate": req.playback_rate,
        "computed": live_calc,
    }

    world_snap = world_hub.command_move_to_zone(
        db,
        zone_id="simulation_stage",
        activity=f"Directing 3D Scenario: {sc.title}",
        emotional_state="focused",
        mode_override="simulation_comparison",
        camera_override="scenario_stage",
    )
    await world_hub.broadcast("scenario_activated", {"scenario": _serialize_scenario(sc), "runtime": world_hub.active_scenario_runtime, "world": world_snap})
    return {"scenario": _serialize_scenario(sc), "runtime": world_hub.active_scenario_runtime}


@app.post("/api/v1/scenarios/restore")
async def restore_world_from_scenario(db: Session = Depends(get_db)):
    world_hub.active_scenario_runtime = None
    world_snap = world_hub.command_move_to_zone(
        db,
        zone_id="central_operations",
        activity="World restored from temporary scenario stage.",
        emotional_state="attentive",
        mode_override="living_presence",
    )
    await world_hub.broadcast("scenario_restored", world_snap)
    return world_snap


# ---------------------------------------------------------------------------
# 9. Spatial Video & Media Services
# ---------------------------------------------------------------------------

@app.get("/api/v1/media")
def list_media(db: Session = Depends(get_db)):
    items = db.query(MediaItem).order_by(MediaItem.created_at.desc()).all()
    out = []
    for m in items:
        comms = (
            db.query(MediaCommentary)
            .filter_by(media_id=m.id)
            .order_by(MediaCommentary.timestamp_sec.asc())
            .all()
        )
        out.append({
            "id": m.id,
            "title": m.title,
            "media_type": m.media_type,
            "source_kind": m.source_kind,
            "url": m.file_path if m.file_path.startswith("builtin://") else f"/api/v1/media/files/{Path(m.file_path).name}",
            "mime_type": m.mime_type,
            "duration_sec": m.duration_sec,
            "captions_vtt": m.captions_vtt,
            "linked_project": m.linked_project,
            "linked_scenario_id": m.linked_scenario_id,
            "commentaries": [
                {
                    "id": c.id,
                    "timestamp_sec": c.timestamp_sec,
                    "label": c.label,
                    "analysis": c.analysis,
                    "spawn_scenario_id": c.spawn_scenario_id,
                }
                for c in comms
            ],
        })
    return {
        "items": out,
        "active_video": world_hub.active_video_runtime,
        "ffmpeg_available": settings.runtime_capabilities()["ffmpeg_available"],
        "video_generation_configured": settings.runtime_capabilities()["video_generation_backend_configured"],
    }


@app.post("/api/v1/media/upload")
async def upload_media_file(
    title: str = Form(...),
    source_kind: str = Form(default="owner_import"),
    linked_project: Optional[str] = Form(default=None),
    linked_scenario_id: Optional[str] = Form(default=None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    ext = Path(file.filename or "clip.webm").suffix or ".webm"
    safe_name = f"media_{uuid.uuid4().hex[:10]}{ext}"
    dest = UPLOADS_DIR / safe_name
    raw = await file.read()
    dest.write_bytes(raw)

    item = MediaItem(
        title=title,
        media_type="video",
        source_kind=source_kind,
        file_path=str(dest),
        mime_type=file.content_type or "video/webm",
        duration_sec=0.0,
        linked_project=linked_project,
        linked_scenario_id=linked_scenario_id,
    )
    db.add(item)
    db.commit()
    return {"id": item.id, "title": item.title, "url": f"/api/v1/media/files/{safe_name}"}


@app.get("/api/v1/media/files/{filename}")
def serve_uploaded_media(filename: str):
    safe = Path(filename).name
    target = UPLOADS_DIR / safe
    if not target.exists():
        raise HTTPException(status_code=404, detail="Media file not found.")
    return FileResponse(target)


@app.post("/api/v1/media/{media_id}/commentary")
def add_media_commentary(media_id: str, req: CommentaryCreateRequest, db: Session = Depends(get_db)):
    item = db.query(MediaItem).filter_by(id=media_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Media item not found.")
    c = MediaCommentary(
        media_id=media_id,
        timestamp_sec=req.timestamp_sec,
        label=req.label,
        analysis=req.analysis,
        spawn_scenario_id=req.spawn_scenario_id,
    )
    db.add(c)
    db.commit()
    return {"id": c.id, "timestamp_sec": c.timestamp_sec, "label": c.label}


@app.post("/api/v1/media/video-state")
async def sync_spatial_video_state(req: VideoStateSyncRequest, db: Session = Depends(get_db)):
    world_hub.active_video_runtime = {
        "media_id": req.media_id,
        "playing": req.playing,
        "current_time": req.current_time,
        "extracted_3d_twin": req.extracted_3d_twin,
    }
    world_snap = world_hub.command_move_to_zone(
        db,
        zone_id="media_presentation",
        activity="Presenting spatial video evidence beside Media Wall.",
        emotional_state="focused",
        camera_override="video_presentation",
    )
    await world_hub.broadcast("video_state_changed", {"video": world_hub.active_video_runtime, "world": world_snap})
    return world_hub.active_video_runtime


@app.post("/api/v1/media/generate")
def request_video_generation(prompt: str = Query(...)):
    """Replaceable video-generation adapter. Never fabricates a generated video when unconfigured."""
    if not settings.OPTIONAL_VIDEO_GEN_ENDPOINT:
        raise HTTPException(
            status_code=503,
            detail=(
                "No external video-generation backend is configured (OPTIONAL_VIDEO_GEN_ENDPOINT is unset). "
                "JARVIS NEXUS never fabricates placeholder generated videos—use owner video import or live 3D Scenario WebM recording."
            ),
        )
    return {"status": "dispatched", "endpoint": settings.OPTIONAL_VIDEO_GEN_ENDPOINT, "prompt": prompt}


# ---------------------------------------------------------------------------
# 10. Local PC & Private Kaggle Compute (6+ Encrypted Profiles)
# ---------------------------------------------------------------------------

@app.get("/api/v1/compute/status")
def get_compute_status(db: Session = Depends(get_db)):
    return inference_hub.status_snapshot(db)


@app.get("/api/v1/compute/worker-setup-info")
def get_worker_setup_info():
    """Return masked token fingerprint and local CLI launch command without exposing raw keys in public logs."""
    return {
        "default_model": settings.DEFAULT_MODEL,
        "masked_worker_token": mask_identifier(settings.WORKER_AUTH_TOKEN, prefix=""),
        "secret_file_location": ".jarvis_secret_key (server-side 0600)",
        "local_pc_command": (
            f"python3 worker/jarvis_worker.py --core-url ws://127.0.0.1:{settings.PORT}/ws/worker "
            f"--kind local_pc --model {settings.DEFAULT_MODEL}"
        ),
        "kaggle_secret_name": "JARVIS_WORKER_TOKEN",
    }


@app.get("/api/v1/compute/kaggle/profiles")
def list_kaggle_profiles(db: Session = Depends(get_db)):
    rows = db.query(KaggleProfileRecord).order_by(KaggleProfileRecord.slot_index.asc()).all()
    return [
        {
            "id": p.id,
            "slot_index": p.slot_index,
            "profile_name": p.profile_name,
            "masked_username": p.masked_username,
            "masked_key": p.masked_key,
            "has_credentials": bool(p.encrypted_credentials),
            "preferred_model": p.preferred_model,
            "gpu_accelerator": p.gpu_accelerator,
            "is_active": p.is_active,
            "last_auth_status": p.last_auth_status,
            "last_auth_detail": p.last_auth_detail,
            "last_tested_at": p.last_tested_at.isoformat() if p.last_tested_at else None,
        }
        for p in rows
    ]


@app.post("/api/v1/compute/kaggle/profiles")
def add_kaggle_profile(req: KaggleProfileUpsertRequest, db: Session = Depends(get_db)):
    max_slot = db.query(KaggleProfileRecord).count() + 1
    enc = None
    m_user = "unconfigured"
    m_key = "unconfigured"
    if req.kaggle_username and req.kaggle_key:
        enc = encrypt_dict({"username": req.kaggle_username.strip(), "key": req.kaggle_key.strip()})
        m_user = mask_identifier(req.kaggle_username.strip())
        m_key = mask_identifier(req.kaggle_key.strip(), prefix="kg_")

    if req.is_active:
        db.query(KaggleProfileRecord).update({KaggleProfileRecord.is_active: False})

    prof = KaggleProfileRecord(
        slot_index=max_slot,
        profile_name=req.profile_name,
        masked_username=m_user,
        masked_key=m_key,
        encrypted_credentials=enc,
        preferred_model=req.preferred_model,
        gpu_accelerator=req.gpu_accelerator,
        is_active=bool(req.is_active),
    )
    db.add(prof)
    db.commit()
    return {"id": prof.id, "slot_index": prof.slot_index, "profile_name": prof.profile_name, "masked_username": prof.masked_username}


@app.patch("/api/v1/compute/kaggle/profiles/{profile_id}")
def update_kaggle_profile(profile_id: str, req: KaggleProfileUpsertRequest, db: Session = Depends(get_db)):
    prof = db.query(KaggleProfileRecord).filter_by(id=profile_id).first()
    if not prof:
        raise HTTPException(status_code=404, detail="Kaggle profile not found.")

    prof.profile_name = req.profile_name
    prof.preferred_model = req.preferred_model
    prof.gpu_accelerator = req.gpu_accelerator

    if req.kaggle_username and req.kaggle_key:
        prof.encrypted_credentials = encrypt_dict({
            "username": req.kaggle_username.strip(),
            "key": req.kaggle_key.strip(),
        })
        prof.masked_username = mask_identifier(req.kaggle_username.strip())
        prof.masked_key = mask_identifier(req.kaggle_key.strip(), prefix="kg_")
        prof.last_auth_status = "credentials_updated_untested"

    if req.is_active is True:
        db.query(KaggleProfileRecord).update({KaggleProfileRecord.is_active: False})
        prof.is_active = True
    elif req.is_active is False:
        prof.is_active = False

    db.commit()
    return {"id": prof.id, "profile_name": prof.profile_name, "is_active": prof.is_active, "masked_username": prof.masked_username, "masked_key": prof.masked_key}


@app.delete("/api/v1/compute/kaggle/profiles/{profile_id}")
def delete_kaggle_profile(profile_id: str, db: Session = Depends(get_db)):
    prof = db.query(KaggleProfileRecord).filter_by(id=profile_id).first()
    if not prof:
        raise HTTPException(status_code=404, detail="Kaggle profile not found.")
    db.delete(prof)
    db.commit()
    return {"deleted_id": profile_id}


@app.post("/api/v1/compute/kaggle/profiles/{profile_id}/test")
async def test_kaggle_profile(profile_id: str, db: Session = Depends(get_db)):
    prof = db.query(KaggleProfileRecord).filter_by(id=profile_id).first()
    if not prof:
        raise HTTPException(status_code=404, detail="Kaggle profile not found.")
    return await test_kaggle_profile_auth(db, prof)


@app.get("/api/v1/compute/kaggle/profiles/{profile_id}/package")
def download_kaggle_worker_package(
    profile_id: str,
    core_wss_url: str = Query(default="wss://your-nexus-host.example/ws/worker"),
    db: Session = Depends(get_db),
):
    prof = db.query(KaggleProfileRecord).filter_by(id=profile_id).first()
    if not prof:
        raise HTTPException(status_code=404, detail="Kaggle profile not found.")
    zip_path = build_kaggle_worker_package(prof, core_wss_url=core_wss_url)
    return FileResponse(zip_path, filename=zip_path.name, media_type="application/zip")


# ---------------------------------------------------------------------------
# 11. Defensive Security, Telemetry & Backup/Restore
# ---------------------------------------------------------------------------

@app.get("/api/v1/security/events")
def list_security_events(db: Session = Depends(get_db)):
    events = db.query(SecurityAuditEvent).order_by(SecurityAuditEvent.created_at.desc()).limit(30).all()
    switches = {s.switch_key: s.enabled for s in db.query(OwnerSwitch).all()}
    return {
        "posture_summary": {
            "server_side_fernet_encryption": True,
            "public_worker_ports_open": 0,
            "microphone_capture_active": bool(switches.get("microphone", False)),
            "camera_capture_active": bool(switches.get("camera", False)),
            "computer_control_enabled": bool(switches.get("computer_control", True)),
        },
        "events": [
            {
                "id": e.id,
                "severity": e.severity,
                "category": e.category,
                "message": e.message,
                "source": e.source,
                "resolved": e.resolved,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in events
        ],
    }


@app.get("/api/v1/telemetry")
def get_real_telemetry(db: Session = Depends(get_db)):
    vm = psutil.virtual_memory()
    disk = psutil.disk_usage(str(REPO_ROOT))
    return {
        "measured_at": datetime.now(timezone.utc).isoformat(),
        "uptime_sec": round(time.time() - BOOT_TIME, 1),
        "cpu_percent": psutil.cpu_percent(interval=0.04),
        "cpu_cores": psutil.cpu_count(logical=True),
        "memory_used_mb": round((vm.total - vm.available) / (1024 * 1024), 1),
        "memory_total_mb": round(vm.total / (1024 * 1024), 1),
        "memory_percent": vm.percent,
        "disk_free_gb": round(disk.free / (1024 ** 3), 2),
        "database_records": {
            "memories": db.query(MemoryRecord).count(),
            "goals": db.query(GoalRecord).count(),
            "scenarios": db.query(ScenarioDefinition).count(),
            "kaggle_profiles": db.query(KaggleProfileRecord).count(),
            "tool_audits": db.query(ToolAuditLog).count(),
        },
        "embodiment_clients": world_hub.connected_devices_summary(),
        "inference": inference_hub.status_snapshot(db),
    }


@app.post("/api/v1/admin/backup")
def create_backup(db: Session = Depends(get_db)):
    return export_sanctuary_backup(db)


@app.post("/api/v1/admin/restore")
def restore_backup(snapshot: Dict[str, Any], db: Session = Depends(get_db)):
    return restore_sanctuary_backup(db, snapshot)


# ---------------------------------------------------------------------------
# 12. Live WebSockets: Shared Embodiment (/ws/nexus) & Private Workers (/ws/worker)
# ---------------------------------------------------------------------------

@app.websocket("/ws/nexus")
async def ws_nexus_embodiment(ws: WebSocket, device: str = Query(default="pc_browser")):
    await world_hub.connect(ws, device_type=device)
    try:
        with SessionLocal() as db:
            await ws.send_text(json.dumps({
                "type": "initial_state",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "payload": world_hub.serialize_world(db),
            }))
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            mtype = msg.get("type")
            if mtype == "character_pose_telemetry":
                # Re-broadcast live skeletal/gaze sync to companion, hologram, and optional MetaHuman listeners
                await world_hub.broadcast("embodiment_frame_sync", msg.get("payload", {}))
            elif mtype == "ping":
                await ws.send_text(json.dumps({"type": "pong", "ts": time.time()}))
    except WebSocketDisconnect:
        await world_hub.disconnect(ws)
    except Exception:
        await world_hub.disconnect(ws)


@app.websocket("/ws/worker")
async def ws_private_inference_worker(ws: WebSocket):
    auth_header = ws.headers.get("authorization", "") or ws.query_params.get("token", "")
    if not verify_worker_token(auth_header):
        with SessionLocal() as db:
            db.add(SecurityAuditEvent(
                severity="critical",
                category="worker_auth_rejected",
                message="Rejected unauthenticated inbound WebSocket connection on /ws/worker.",
                source="InferenceHub",
            ))
            db.commit()
        await ws.close(code=4401)
        return

    worker_kind = ws.headers.get("x-jarvis-worker-kind", "local_pc")
    profile_name = ws.headers.get("x-jarvis-profile", "Private-Worker")
    await ws.accept()
    worker = inference_hub.register_worker(ws, worker_kind=worker_kind, profile_name=profile_name)
    await world_hub.broadcast("worker_connected", {"worker_id": worker.worker_id, "worker_kind": worker_kind, "profile_name": profile_name})

    try:
        while True:
            raw = await ws.receive_text()
            data = json.loads(raw)
            inference_hub.handle_worker_message(worker.worker_id, data)
            if data.get("type") in ("worker_hello", "worker_state"):
                await world_hub.broadcast("worker_state_update", {
                    "worker_id": worker.worker_id,
                    "state": worker.state,
                    "model_id": worker.model_id,
                    "detail": worker.detail,
                })
    except WebSocketDisconnect:
        pass
    finally:
        inference_hub.unregister_worker(worker.worker_id)
        await world_hub.broadcast("worker_disconnected", {"worker_id": worker.worker_id})


# Serve compiled 3D Sanctuary bundle directly from CORE when frontend/dist is built
_FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"
if (_FRONTEND_DIST / "index.html").exists():
    app.mount("/", StaticFiles(directory=str(_FRONTEND_DIST), html=True), name="sanctuary_static")

