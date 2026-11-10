"""Shared Embodiment & World State Orchestrator.
Maintains one authoritative live JARVIS instance across PC, Mobile, MetaHuman bridge, and Holographic views.
"""
from __future__ import annotations

import asyncio
import json
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from fastapi import WebSocket
from sqlalchemy.orm import Session

from ..models import NexusWorldState, OwnerSwitch
from .seed_data import OPERATIONAL_MODES, SPATIAL_ZONES


class WorldConnectionHub:
    def __init__(self) -> None:
        self.clients: Set[WebSocket] = set()
        self.client_meta: Dict[WebSocket, Dict[str, Any]] = {}
        self._lock = asyncio.Lock()
        self.active_scenario_runtime: Optional[Dict[str, Any]] = None
        self.active_video_runtime: Dict[str, Any] = {
            "media_id": "media-turbine-bench-01",
            "playing": False,
            "current_time": 14.2,
            "extracted_3d_twin": False,
        }

    async def connect(self, ws: WebSocket, device_type: str = "pc_browser") -> None:
        await ws.accept()
        async with self._lock:
            self.clients.add(ws)
            self.client_meta[ws] = {
                "device_type": device_type,
                "connected_at": datetime.now(timezone.utc).isoformat(),
            }

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self.clients.discard(ws)
            self.client_meta.pop(ws, None)

    def connected_devices_summary(self) -> List[Dict[str, Any]]:
        return [
            {"device_type": meta.get("device_type", "unknown"), "connected_at": meta.get("connected_at")}
            for meta in self.client_meta.values()
        ]

    async def broadcast(self, event_type: str, payload: Dict[str, Any]) -> None:
        message = json.dumps({
            "type": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": payload,
        })
        stale: List[WebSocket] = []
        for ws in list(self.clients):
            try:
                await ws.send_text(message)
            except Exception:
                stale.append(ws)
        for ws in stale:
            await self.disconnect(ws)

    def serialize_world(self, db: Session) -> Dict[str, Any]:
        state = db.query(NexusWorldState).filter_by(id=1).first()
        switches = {s.switch_key: s.enabled for s in db.query(OwnerSwitch).all()}
        stack = []
        if state and state.interrupted_task_stack_json:
            try:
                stack = json.loads(state.interrupted_task_stack_json)
            except ValueError:
                stack = []
        return {
            "owner_name": state.owner_name if state else "Owner",
            "first_launch_completed": bool(state.first_launch_completed) if state else False,
            "active_mode": state.active_mode if state else "living_presence",
            "current_zone": state.current_zone if state else "central_operations",
            "position": {
                "x": state.pos_x if state else 1.45,
                "y": state.pos_y if state else 0.0,
                "z": state.pos_z if state else 0.95,
                "yaw": state.yaw_rad if state else -0.42,
            },
            "locomotion_state": state.locomotion_state if state else "idle_console_work",
            "posture": state.posture if state else "focused_standing",
            "emotional_state": state.emotional_state if state else "attentive",
            "active_activity_summary": state.active_activity_summary if state else "",
            "interrupted_task_stack": stack,
            "active_camera_preset": state.active_camera_preset if state else "living_presence",
            "reduced_motion": bool(state.reduced_motion) if state else False,
            "switches": switches,
            "active_scenario": self.active_scenario_runtime,
            "active_video": self.active_video_runtime,
            "connected_devices": self.connected_devices_summary(),
            "zones": SPATIAL_ZONES,
            "modes": OPERATIONAL_MODES,
        }

    def command_move_to_zone(
        self,
        db: Session,
        zone_id: str,
        activity: str,
        emotional_state: str = "focused",
        urgent: bool = False,
        mode_override: Optional[str] = None,
        camera_override: Optional[str] = None,
    ) -> Dict[str, Any]:
        zone = SPATIAL_ZONES.get(zone_id, SPATIAL_ZONES["central_operations"])
        state = db.query(NexusWorldState).filter_by(id=1).first()
        dist = math.hypot(zone["x"] - state.pos_x, zone["z"] - state.pos_z)
        loco = "running" if (urgent and dist > 2.2) else ("walking" if dist > 0.35 else "idle_console_work")

        state.current_zone = zone["id"]
        state.pos_x = float(zone["x"])
        state.pos_z = float(zone["z"])
        state.yaw_rad = float(zone["yaw"])
        state.locomotion_state = loco
        state.posture = "urgent_stance" if urgent else "console_interaction"
        state.emotional_state = emotional_state
        state.active_activity_summary = activity
        if mode_override:
            state.active_mode = mode_override
        state.active_camera_preset = camera_override or zone["camera_preset"]
        db.commit()
        return self.serialize_world(db)

    def interrupt_for_owner(self, db: Session, reason: str = "Owner addressed JARVIS") -> Dict[str, Any]:
        """Push current ongoing activity onto resumable stack and turn attentively toward owner."""
        state = db.query(NexusWorldState).filter_by(id=1).first()
        try:
            stack = json.loads(state.interrupted_task_stack_json or "[]")
        except ValueError:
            stack = []

        if state.active_activity_summary and not state.active_activity_summary.startswith("Attending to Owner"):
            stack.append({
                "zone": state.current_zone,
                "mode": state.active_mode,
                "activity": state.active_activity_summary,
                "posture": state.posture,
                "emotional_state": state.emotional_state,
                "camera": state.active_camera_preset,
                "saved_at": datetime.now(timezone.utc).isoformat(),
            })
            stack = stack[-5:]

        state.interrupted_task_stack_json = json.dumps(stack)
        state.locomotion_state = "acknowledge_turn"
        state.posture = "conversational_focus"
        state.emotional_state = "listening"
        state.active_activity_summary = f"Attending to Owner ({reason})"
        state.active_camera_preset = "conversation"
        db.commit()
        return self.serialize_world(db)

    def resume_interrupted_work(self, db: Session) -> Dict[str, Any]:
        """Pop the latest interrupted task and walk back to resume it."""
        state = db.query(NexusWorldState).filter_by(id=1).first()
        try:
            stack = json.loads(state.interrupted_task_stack_json or "[]")
        except ValueError:
            stack = []

        if not stack:
            return self.command_move_to_zone(
                db,
                "central_operations",
                "Reviewing primary systems assembly at Central Operations.",
                emotional_state="focused",
                mode_override="living_presence",
            )

        prior = stack.pop()
        state.interrupted_task_stack_json = json.dumps(stack)
        db.commit()
        return self.command_move_to_zone(
            db,
            prior.get("zone", "central_operations"),
            prior.get("activity", "Resuming authorised work."),
            emotional_state=prior.get("emotional_state", "focused"),
            mode_override=prior.get("mode", "living_presence"),
            camera_override=prior.get("camera"),
        )


world_hub = WorldConnectionHub()
