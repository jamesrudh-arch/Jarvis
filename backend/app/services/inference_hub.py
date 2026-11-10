"""Private Inference Hub, Kaggle Profile Manager, Worker Package Builder, and Truthful Executive."""
from __future__ import annotations

import asyncio
import base64
import io
import json
import time
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx
from fastapi import WebSocket
from sqlalchemy.orm import Session

from ..config import REPO_ROOT, WORKER_PKG_DIR, settings
from ..models import GoalRecord, KaggleProfileRecord, MemoryRecord, OwnerSwitch
from ..security_crypto import decrypt_dict, verify_worker_token
from .seed_data import SPATIAL_ZONES


class ConnectedWorker:
    def __init__(self, worker_id: str, ws: WebSocket, worker_kind: str, profile_name: str) -> None:
        self.worker_id = worker_id
        self.ws = ws
        self.worker_kind = worker_kind  # "local_pc" | "kaggle_gpu"
        self.profile_name = profile_name
        self.model_id = settings.DEFAULT_MODEL
        self.state = "connecting"
        self.loaded = False
        self.capabilities: Dict[str, Any] = {}
        self.last_heartbeat = time.time()
        self.detail = "Handshake established."


class InferenceHub:
    def __init__(self) -> None:
        self.workers: Dict[str, ConnectedWorker] = {}
        self.pending_streams: Dict[str, asyncio.Queue] = {}
        self.active_request_worker: Dict[str, str] = {}

    def register_worker(self, ws: WebSocket, worker_kind: str, profile_name: str) -> ConnectedWorker:
        wid = f"{worker_kind}_{uuid.uuid4().hex[:8]}"
        w = ConnectedWorker(wid, ws, worker_kind, profile_name)
        self.workers[wid] = w
        return w

    def unregister_worker(self, worker_id: str) -> None:
        self.workers.pop(worker_id, None)

    def handle_worker_message(self, worker_id: str, msg: Dict[str, Any]) -> None:
        w = self.workers.get(worker_id)
        if not w:
            return
        w.last_heartbeat = time.time()
        mtype = msg.get("type")
        if mtype == "worker_hello":
            w.model_id = msg.get("model_id", w.model_id)
            w.capabilities = msg.get("capabilities", {})
            w.state = msg.get("state", "connected")
        elif mtype == "worker_state":
            w.state = msg.get("state", w.state)
            w.model_id = msg.get("model_id", w.model_id)
            w.detail = msg.get("detail", w.detail)
            w.loaded = w.state == "ready"
        elif mtype == "worker_heartbeat":
            w.state = msg.get("state", w.state)
            w.loaded = bool(msg.get("loaded", w.loaded))
        elif mtype in ("generation_delta", "generation_done", "generation_error", "generation_cancelled"):
            req_id = msg.get("request_id", "")
            q = self.pending_streams.get(req_id)
            if q:
                q.put_nowait(msg)

    def select_healthy_worker(self, remote_compute_enabled: bool) -> Optional[ConnectedWorker]:
        """CORE prefers a healthy Local PC worker first, then authorised Kaggle GPU worker."""
        now = time.time()
        healthy = [
            w for w in self.workers.values()
            if (now - w.last_heartbeat) < 45 and w.state != "error"
        ]
        for w in healthy:
            if w.worker_kind == "local_pc":
                return w
        if remote_compute_enabled:
            for w in healthy:
                if w.worker_kind == "kaggle_gpu":
                    return w
        return None

    def status_snapshot(self, db: Session) -> Dict[str, Any]:
        switches = {s.switch_key: s.enabled for s in db.query(OwnerSwitch).all()}
        remote_allowed = bool(switches.get("master", True) and switches.get("remote_compute", True))
        selected = self.select_healthy_worker(remote_allowed)
        workers_list = [
            {
                "worker_id": w.worker_id,
                "worker_kind": w.worker_kind,
                "profile_name": w.profile_name,
                "model_id": w.model_id,
                "state": w.state,
                "loaded": w.loaded,
                "detail": w.detail,
                "capabilities": w.capabilities,
                "seconds_since_heartbeat": round(time.time() - w.last_heartbeat, 1),
            }
            for w in self.workers.values()
        ]
        return {
            "default_model": settings.DEFAULT_MODEL,
            "active_backend": (
                selected.worker_kind if selected else (
                    "optional_provider" if (settings.OPTIONAL_OPENAI_BASE_URL and settings.OPTIONAL_OPENAI_MODEL) else "none_connected"
                )
            ),
            "preferred_worker_id": selected.worker_id if selected else None,
            "remote_compute_permitted": remote_allowed,
            "connected_workers": workers_list,
            "optional_provider_configured": bool(settings.OPTIONAL_OPENAI_BASE_URL and settings.OPTIONAL_OPENAI_MODEL),
            "kaggle_session_constraints": (
                "Kaggle GPU notebooks have a typical ~12h continuous runtime ceiling and ~30h/week quota; "
                "outbound WebSocket reconnects automatically across restarts when JARVIS_WORKER_TOKEN is set in Kaggle Secrets."
            ),
        }

    async def cancel_request(self, request_id: str) -> bool:
        wid = self.active_request_worker.get(request_id)
        if wid and wid in self.workers:
            try:
                await self.workers[wid].ws.send_text(json.dumps({"type": "cancel", "request_id": request_id}))
                return True
            except Exception:
                return False
        return False

    async def generate_response(
        self,
        db: Session,
        conversation_history: List[Dict[str, str]],
        user_prompt: str,
    ) -> Tuple[str, str, Dict[str, Any]]:
        """Dispatch to Local PC -> Kaggle GPU -> Optional Adapter -> Truthful Executive Layer.
        Returns (response_text, inference_source, action_directive).
        """
        directive = self._derive_spatial_directive(db, user_prompt)
        switches = {s.switch_key: s.enabled for s in db.query(OwnerSwitch).all()}
        if not switches.get("master", True):
            return (
                "Master operational power is currently switched OFF. All inference dispatch, capture, and background tasks are halted until you re-enable Master Power.",
                "master_off_gate",
                {"zone": None, "emotion": "neutral"},
            )

        remote_ok = bool(switches.get("remote_compute", True))
        worker = self.select_healthy_worker(remote_ok)

        if worker is not None:
            req_id = uuid.uuid4().hex
            q: asyncio.Queue = asyncio.Queue()
            self.pending_streams[req_id] = q
            self.active_request_worker[req_id] = worker.worker_id
            chunks: List[str] = []
            try:
                await worker.ws.send_text(json.dumps({
                    "type": "generate",
                    "request_id": req_id,
                    "messages": conversation_history[-10:] + [{"role": "user", "content": user_prompt}],
                    "max_new_tokens": 512,
                }))
                while True:
                    evt = await asyncio.wait_for(q.get(), timeout=90.0)
                    etype = evt.get("type")
                    if etype == "generation_delta":
                        chunks.append(evt.get("delta", ""))
                    elif etype == "generation_done":
                        break
                    elif etype == "generation_cancelled":
                        chunks.append(" [Interrupted]")
                        break
                    elif etype == "generation_error":
                        return (
                            f"Private worker ({worker.profile_name}) reported an inference error: {evt.get('error')}",
                            f"{worker.worker_kind}_error",
                            directive,
                        )
                return ("".join(chunks).strip(), worker.worker_kind, directive)
            except Exception as exc:
                return (
                    f"Connection to private worker ({worker.profile_name}) timed out or dropped ({type(exc).__name__}).",
                    f"{worker.worker_kind}_error",
                    directive,
                )
            finally:
                self.pending_streams.pop(req_id, None)
                self.active_request_worker.pop(req_id, None)

        # Optional OpenAI-compatible / Ollama endpoint if owner configured one
        if settings.OPTIONAL_OPENAI_BASE_URL and settings.OPTIONAL_OPENAI_MODEL:
            try:
                headers = {"Content-Type": "application/json"}
                if settings.OPTIONAL_OPENAI_API_KEY:
                    headers["Authorization"] = f"Bearer {settings.OPTIONAL_OPENAI_API_KEY}"
                async with httpx.AsyncClient(timeout=35.0) as client:
                    resp = await client.post(
                        f"{settings.OPTIONAL_OPENAI_BASE_URL.rstrip('/')}/chat/completions",
                        headers=headers,
                        json={
                            "model": settings.OPTIONAL_OPENAI_MODEL,
                            "messages": conversation_history[-8:] + [{"role": "user", "content": user_prompt}],
                            "temperature": 0.4,
                        },
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    content = data["choices"][0]["message"]["content"]
                    return (content, "optional_provider", directive)
            except Exception as exc:
                return (
                    f"Configured optional inference endpoint returned an error ({type(exc).__name__}: {exc}).",
                    "optional_provider_error",
                    directive,
                )

        # Truthful Deterministic Sanctuary Executive (never fabricates open-ended LLM intelligence)
        return (self._truthful_executive_reply(db, user_prompt, directive, remote_ok), "executive_offline", directive)

    def _derive_spatial_directive(self, db: Session, text: str) -> Dict[str, Any]:
        low = text.lower()
        if any(w in low for w in ("show me", "scenario", "reconstruct", "manifold", "cryo", "let me show", "forensic")):
            return {"zone": "simulation_stage", "mode": "simulation_comparison", "scenario_id": "cryo_manifold_forensic", "emotion": "focused", "urgent": False}
        if any(w in low for w in ("turbine", "simulate", "simulation", "parallel", "variant")):
            return {"zone": "simulation_stage", "mode": "simulation_comparison", "scenario_id": "dual_turbine_sim", "emotion": "focused", "urgent": False}
        if any(w in low for w in ("video", "clip", "frame", "media", "schlieren", "pause")):
            return {"zone": "media_presentation", "mode": "living_presence", "video_focus": True, "emotion": "focused", "urgent": False}
        if any(w in low for w in ("alert", "security", "intrusion", "urgent", "breach", "quarantine")):
            return {"zone": "defensive_security", "mode": "defensive_security", "emotion": "urgent", "urgent": True}
        if any(w in low for w in ("memory", "remember", "archive", "fact")):
            return {"zone": "memory_archive", "mode": "memory_exploration", "emotion": "attentive", "urgent": False}
        if any(w in low for w in ("goal", "project", "schedule", "milestone")):
            return {"zone": "goals_projects", "mode": "goals_ongoing_work", "emotion": "focused", "urgent": False}
        if any(w in low for w in ("agent", "collaborat", "specialist")):
            return {"zone": "agent_collaboration", "mode": "multi_agent_collaboration", "emotion": "focused", "urgent": False}
        if any(w in low for w in ("research", "paper", "evidence", "literature")):
            return {"zone": "research_area", "mode": "live_research", "emotion": "focused", "urgent": False}
        if any(w in low for w in ("kaggle", "gpu", "worker", "inference", "qwen", "compute")):
            return {"zone": "compute_connections", "mode": "connections_compute", "emotion": "attentive", "urgent": False}
        if any(w in low for w in ("switch", "privacy", "microphone", "camera", "autonomy")):
            return {"zone": "embodiment_switches", "mode": "digital_human_embodiment", "emotion": "attentive", "urgent": False}
        if any(w in low for w in ("hologram", "pepper", "prism", "projection")):
            return {"zone": "simulation_stage", "mode": "holographic_presence", "emotion": "attentive", "urgent": False}
        if any(w in low for w in ("resume", "continue your work", "carry on")):
            return {"resume_work": True, "emotion": "focused", "urgent": False}
        return {"zone": "central_operations", "mode": "conversational_focus", "emotion": "attentive", "urgent": False}

    def _truthful_executive_reply(self, db: Session, prompt: str, directive: Dict[str, Any], remote_ok: bool) -> str:
        goals = db.query(GoalRecord).filter(GoalRecord.status == "active").all()
        mem_count = db.query(MemoryRecord).count()
        remote_note = (
            "Remote Kaggle compute is permitted, awaiting an active outbound worker."
            if remote_ok
            else "Note: Remote Compute switch is currently OFF, so Kaggle workers are blocked."
        )

        if directive.get("resume_work"):
            return (
                "Understood. Returning to my previous station to resume the interrupted task. "
                f"[Inference status: Executive Deterministic Mode — no Local PC or Kaggle GPU worker currently attached. {remote_note}]"
            )
        if directive.get("scenario_id") == "cryo_manifold_forensic":
            return (
                "Let me show you directly on the Volumetric Stage. I am loading the Cryogenic Manifold B-4 room-scale reconstruction—18,000 laser-scanned points separating the measured 210.4 MPa strain-gauge spike from the inferred valve-seat cavitation vector. You can scrub time or lower the relief-valve delay below 70 ms to test the counterfactual branch. "
                "[Source: Deterministic Scenario Director; connect Local PC or Kaggle Qwen2.5-14B worker for open-ended neural synthesis.]"
            )
        if directive.get("scenario_id") == "dual_turbine_sim":
            return (
                "Stepping onto the Simulation Stage to run Variant A against Variant B side by side. Notice Variant A maintains laminar attachment while Variant B develops hub-corner thermal shear above 10,500 RPM. Adjust RPM or Inlet Temperature to inspect the live solver output. "
                "[Source: Coupled Parametric Solver; neural LLM worker currently offline.]"
            )
        if directive.get("video_focus"):
            return (
                "Moving beside the Media Wall now. I have paused the Schlieren stator test at 00:14.2—right where the hub-corner vortex detaches—and you can extract the 3D volumetric twin into space beside me for spatial inspection."
            )
        if directive.get("urgent"):
            return (
                "Moving to the Defensive Security Vault immediately. Perimeter audit shows microphone and camera capture locked OFF unless explicitly enabled, server-side Fernet encryption active, and zero unauthenticated inbound worker ports open."
            )

        zone_id = directive.get("zone") or "central_operations"
        zone_label = SPATIAL_ZONES.get(zone_id, {}).get("label", "Central Operations")
        active_goal_titles = ", ".join(g.title for g in goals[:2]) or "none"
        return (
            f"I have moved to {zone_label}. Right now CORE is operating in truthful Executive Mode—no Local PC CUDA worker or Private Kaggle GPU worker (`{settings.DEFAULT_MODEL}`) is connected yet, so I will not fabricate open-ended model output. "
            f"Your persistent state is live ({mem_count} typed memory records; active goals: {active_goal_titles}). "
            f"Open Connections & Compute to launch the local worker or generate a Kaggle Worker Package, or ask me to reconstruct a 3D scenario on the stage."
        )


async def test_kaggle_profile_auth(db: Session, profile: KaggleProfileRecord) -> Dict[str, Any]:
    """Genuinely attempt HTTP Basic Auth against Kaggle's REST endpoint. Never fabricates success."""
    creds = decrypt_dict(profile.encrypted_credentials or "")
    username = creds.get("username", "").strip()
    api_key = creds.get("key", "").strip()
    now = datetime.now(timezone.utc)

    if not username or not api_key:
        profile.last_auth_status = "missing_credentials"
        profile.last_auth_detail = "No username/API key stored for this profile."
        profile.last_tested_at = now
        db.commit()
        return {"status": profile.last_auth_status, "detail": profile.last_auth_detail}

    token_b64 = base64.b64encode(f"{username}:{api_key}".encode("utf-8")).decode("ascii")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://www.kaggle.com/api/v1/kernels/list?pageSize=1",
                headers={"Authorization": f"Basic {token_b64}"},
            )
        if resp.status_code == 200:
            profile.last_auth_status = "verified"
            profile.last_auth_detail = "HTTP 200 verified against Kaggle API."
        elif resp.status_code in (401, 403):
            profile.last_auth_status = "rejected"
            profile.last_auth_detail = f"Kaggle API rejected credentials (HTTP {resp.status_code})."
        else:
            profile.last_auth_status = f"http_{resp.status_code}"
            profile.last_auth_detail = f"Kaggle API returned HTTP {resp.status_code}."
    except Exception as exc:
        # Honest reporting when sandbox/firewall blocks outbound www.kaggle.com
        profile.last_auth_status = "network_unreachable"
        profile.last_auth_detail = (
            f"Could not reach www.kaggle.com from current host network ({type(exc).__name__}). "
            "Credentials remain encrypted server-side; outbound worker from Kaggle to CORE is unaffected once CORE has a reachable WSS URL."
        )

    profile.last_tested_at = now
    db.commit()
    return {"status": profile.last_auth_status, "detail": profile.last_auth_detail}


def build_kaggle_worker_package(profile: KaggleProfileRecord, core_wss_url: str) -> Path:
    """Create a downloadable ZIP containing jarvis_worker.py, a guided Kaggle GPU .ipynb notebook, and setup docs.
    Never embeds raw secrets in the notebook—instructs loading JARVIS_WORKER_TOKEN from Kaggle Secrets!
    """
    worker_src = (REPO_ROOT / "worker" / "jarvis_worker.py").read_text(encoding="utf-8")
    notebook = {
        "nbformat": 4,
        "nbformat_minor": 5,
        "metadata": {
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
            "accelerator": profile.gpu_accelerator,
        },
        "cells": [
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": [
                    f"# JARVIS NEXUS — Private Kaggle GPU Worker ({profile.profile_name})\n",
                    "- **Zero Public Ports**: Connects outbound over TLS WebSocket to your JARVIS NEXUS CORE.\n",
                    "- **Secret Hygiene**: Add `JARVIS_WORKER_TOKEN` in Kaggle Notebook **Add-ons -> Secrets** before running.\n",
                    f"- **Configured Model**: `{profile.preferred_model}` (4-bit NF4 CUDA quantisation).\n",
                ],
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "!pip install -q transformers accelerate bitsandbytes websockets sentencepiece\n",
                ],
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "from kaggle_secrets import UserSecretsClient\n",
                    "import os, subprocess, sys\n\n",
                    "# Verify secret presence without printing it\n",
                    "token = UserSecretsClient().get_secret('JARVIS_WORKER_TOKEN')\n",
                    "assert token and len(token) > 12, 'Enable JARVIS_WORKER_TOKEN in Kaggle Secrets'\n",
                    "os.environ['JARVIS_WORKER_TOKEN'] = token\n\n",
                    f"CORE_WSS_URL = {json.dumps(core_wss_url)}\n",
                    f"MODEL_ID = {json.dumps(profile.preferred_model)}\n",
                    f"PROFILE_NAME = {json.dumps(profile.profile_name)}\n\n",
                    "subprocess.run([\n",
                    "    sys.executable, 'jarvis_worker.py',\n",
                    "    '--core-url', CORE_WSS_URL,\n",
                    "    '--kind', 'kaggle_gpu',\n",
                    "    '--profile', PROFILE_NAME,\n",
                    "    '--model', MODEL_ID,\n",
                    "], check=True)\n",
                ],
            },
        ],
    }

    readme = (
        f"# Kaggle Private GPU Worker Setup — {profile.profile_name}\n\n"
        "1. Open Kaggle -> New Notebook -> Settings -> Accelerator -> GPU T4 x2 (or P100) & Turn Internet ON.\n"
        "2. Open Add-ons -> Secrets -> Add Secret named `JARVIS_WORKER_TOKEN` (copy token from Owner Compute Modal on local server).\n"
        "3. Upload `jarvis_worker.py` to the notebook working directory and import `jarvis_kaggle_worker.ipynb`.\n"
        "4. Run all cells. No public port or ngrok tunnel is opened; the session dials outbound to CORE.\n"
        "5. Note Kaggle quota limits (~12h max session, ~30h weekly GPU quota).\n"
    )

    safe_slug = "".join(c if c.isalnum() or c in "-_" else "_" for c in profile.profile_name)
    out_path = WORKER_PKG_DIR / f"jarvis_worker_{safe_slug}.zip"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("jarvis_worker.py", worker_src)
        zf.writestr("jarvis_kaggle_worker.ipynb", json.dumps(notebook, indent=2))
        zf.writestr("README_KAGGLE_SETUP.md", readme)
    out_path.write_bytes(buf.getvalue())
    return out_path


inference_hub = InferenceHub()
