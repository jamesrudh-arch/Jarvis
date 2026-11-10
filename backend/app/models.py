"""Typed SQLAlchemy ORM models for JARVIS NEXUS CORE."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_uuid() -> str:
    return str(uuid.uuid4())


class NexusWorldState(Base):
    __tablename__ = "nexus_world_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    owner_name: Mapped[str] = mapped_column(String(120), default="Owner")
    first_launch_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    active_mode: Mapped[str] = mapped_column(String(64), default="wake_auth")
    current_zone: Mapped[str] = mapped_column(String(64), default="central_operations")
    pos_x: Mapped[float] = mapped_column(Float, default=1.45)
    pos_y: Mapped[float] = mapped_column(Float, default=0.0)
    pos_z: Mapped[float] = mapped_column(Float, default=0.95)
    yaw_rad: Mapped[float] = mapped_column(Float, default=-0.42)
    locomotion_state: Mapped[str] = mapped_column(String(40), default="idle_console_work")
    posture: Mapped[str] = mapped_column(String(40), default="focused_standing")
    emotional_state: Mapped[str] = mapped_column(String(40), default="attentive")
    active_activity_summary: Mapped[str] = mapped_column(
        Text, default="Reviewing primary systems assembly at Central Operations."
    )
    interrupted_task_stack_json: Mapped[str] = mapped_column(Text, default="[]")
    active_camera_preset: Mapped[str] = mapped_column(String(64), default="living_presence")
    reduced_motion: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class OwnerSwitch(Base):
    __tablename__ = "owner_switches"

    switch_key: Mapped[str] = mapped_column(String(40), primary_key=True)
    label: Mapped[str] = mapped_column(String(80))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    description: Mapped[str] = mapped_column(Text)
    enforcement_scope: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class MemoryRecord(Base):
    __tablename__ = "memory_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    category: Mapped[str] = mapped_column(String(40), index=True)
    epistemic_status: Mapped[str] = mapped_column(String(32), default="owner_stated", index=True)
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text)
    encrypted_payload: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_sensitive: Mapped[bool] = mapped_column(Boolean, default=False)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    source_ref: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    project_tag: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    embedding_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    title: Mapped[str] = mapped_column(String(200), default="Primary Sanctuary Session")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    conversation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(24))
    modality: Mapped[str] = mapped_column(String(24), default="text")
    content: Mapped[str] = mapped_column(Text)
    media_ref: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    interrupted: Mapped[bool] = mapped_column(Boolean, default=False)
    inference_source: Mapped[str] = mapped_column(String(64), default="executive_offline")
    emotional_tone: Mapped[str] = mapped_column(String(32), default="attentive")
    target_zone: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class GoalRecord(Base):
    __tablename__ = "goals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    priority: Mapped[int] = mapped_column(Integer, default=2)
    status: Mapped[str] = mapped_column(String(32), default="active", index=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    depends_on_json: Mapped[str] = mapped_column(Text, default="[]")
    schedule_spec: Mapped[str] = mapped_column(String(100), default="continuous")
    assigned_zone: Mapped[str] = mapped_column(String(64), default="goals_projects")
    autonomous_allowed: Mapped[bool] = mapped_column(Boolean, default=True)
    next_action: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class GoalAuditEvent(Base):
    __tablename__ = "goal_audit_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    goal_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("goals.id", ondelete="CASCADE"), index=True
    )
    event_type: Mapped[str] = mapped_column(String(48))
    detail: Mapped[str] = mapped_column(Text)
    actor: Mapped[str] = mapped_column(String(64), default="JARVIS")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SpecialistAgent(Base):
    __tablename__ = "specialist_agents"

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    role_summary: Mapped[str] = mapped_column(Text)
    allowed_tools_json: Mapped[str] = mapped_column(Text, default="[]")
    permission_boundary: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="idle")
    current_task: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_output: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class AgentTaskRun(Base):
    __tablename__ = "agent_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    agent_id: Mapped[str] = mapped_column(String(48), ForeignKey("specialist_agents.id"), index=True)
    objective: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="running")
    trace_json: Mapped[str] = mapped_column(Text, default="[]")
    result_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class ToolAuditLog(Base):
    __tablename__ = "tool_audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    tool_name: Mapped[str] = mapped_column(String(80))
    scope: Mapped[str] = mapped_column(String(48))
    arguments_json: Mapped[str] = mapped_column(Text)
    destructive: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(32))
    confirmation_token: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    output_excerpt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class KaggleProfileRecord(Base):
    __tablename__ = "kaggle_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    slot_index: Mapped[int] = mapped_column(Integer, default=1)
    profile_name: Mapped[str] = mapped_column(String(100))
    masked_username: Mapped[str] = mapped_column(String(80), default="unconfigured")
    masked_key: Mapped[str] = mapped_column(String(80), default="unconfigured")
    encrypted_credentials: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    preferred_model: Mapped[str] = mapped_column(
        String(160), default="huihui-ai/Qwen2.5-14B-Instruct-abliterated"
    )
    gpu_accelerator: Mapped[str] = mapped_column(String(64), default="NvidiaTeslaT4x2")
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    last_auth_status: Mapped[str] = mapped_column(String(48), default="untested")
    last_auth_detail: Mapped[str] = mapped_column(Text, default="Credentials not yet tested.")
    last_tested_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ScenarioDefinition(Base):
    __tablename__ = "scenarios"

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    classification: Mapped[str] = mapped_column(String(48))
    summary: Mapped[str] = mapped_column(Text)
    duration_sec: Mapped[float] = mapped_column(Float, default=18.0)
    variables_json: Mapped[str] = mapped_column(Text, default="[]")
    branches_json: Mapped[str] = mapped_column(Text, default="[]")
    timeline_json: Mapped[str] = mapped_column(Text, default="[]")
    actors_props_json: Mapped[str] = mapped_column(Text, default="{}")
    evidence_notes_json: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MediaItem(Base):
    __tablename__ = "media_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    title: Mapped[str] = mapped_column(String(200))
    media_type: Mapped[str] = mapped_column(String(32), default="video")
    source_kind: Mapped[str] = mapped_column(String(40), default="owner_import")
    file_path: Mapped[str] = mapped_column(Text)
    mime_type: Mapped[str] = mapped_column(String(80), default="video/mp4")
    duration_sec: Mapped[float] = mapped_column(Float, default=0.0)
    captions_vtt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    linked_project: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    linked_scenario_id: Mapped[Optional[str]] = mapped_column(String(48), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MediaCommentary(Base):
    __tablename__ = "media_commentaries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    media_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("media_items.id", ondelete="CASCADE"), index=True
    )
    timestamp_sec: Mapped[float] = mapped_column(Float)
    label: Mapped[str] = mapped_column(String(140))
    analysis: Mapped[str] = mapped_column(Text)
    spawn_scenario_id: Mapped[Optional[str]] = mapped_column(String(48), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SecurityAuditEvent(Base):
    __tablename__ = "security_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    severity: Mapped[str] = mapped_column(String(24), default="info")
    category: Mapped[str] = mapped_column(String(48))
    message: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(80), default="CORE")
    resolved: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
