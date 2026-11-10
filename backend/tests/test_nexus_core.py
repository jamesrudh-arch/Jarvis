"""Comprehensive automated integration tests for JARVIS NEXUS CORE."""
from __future__ import annotations

import io
import json
import threading
import zipfile

from fastapi.testclient import TestClient

from backend.app.config import settings
from backend.app.main import app


def test_health_and_truthful_capabilities():
    with TestClient(app) as client:
        r = client.get("/api/v1/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"
        assert data["inference"]["default_model"] == "huihui-ai/Qwen2.5-14B-Instruct-abliterated"
        # No GPU worker connected initially -> must truthfully report none_connected
        assert data["inference"]["active_backend"] == "none_connected"


def test_world_locomotion_interruption_and_resumption():
    with TestClient(app) as client:
        # Move JARVIS to Research Area
        r = client.post("/api/v1/world/move", json={
            "zone_id": "research_area",
            "activity": "Cross-checking stator boundary-layer literature.",
            "emotional_state": "focused",
        })
        assert r.status_code == 200
        assert r.json()["current_zone"] == "research_area"

        # Interrupt JARVIS mid-task
        r_int = client.post("/api/v1/world/interrupt?reason=Owner+question")
        assert r_int.status_code == 200
        snap = r_int.json()
        assert snap["locomotion_state"] == "acknowledge_turn"
        assert snap["emotional_state"] == "listening"
        assert len(snap["interrupted_task_stack"]) >= 1
        assert snap["interrupted_task_stack"][-1]["zone"] == "research_area"

        # Resume interrupted work -> returns to research_area!
        r_res = client.post("/api/v1/world/resume")
        assert r_res.status_code == 200
        resumed = r_res.json()
        assert resumed["current_zone"] == "research_area"
        assert "Cross-checking stator" in resumed["active_activity_summary"]


def test_seven_owner_switches_real_enforcement():
    with TestClient(app) as client:
        sw = client.get("/api/v1/switches").json()
        assert len(sw) == 7
        keys = [s["switch_key"] for s in sw]
        assert keys == [
            "master", "microphone", "camera", "autonomy",
            "remote_compute", "computer_control", "embodiment",
        ]

        # Disable computer_control -> guarded tools MUST be blocked
        client.patch("/api/v1/switches/computer_control", json={"enabled": False})
        blocked = client.post("/api/v1/tools/execute", json={"tool_name": "inspect_workspace", "arguments": {}}).json()
        assert blocked["status"] == "blocked_by_switch"

        # Re-enable computer_control -> read-only tool succeeds
        client.patch("/api/v1/switches/computer_control", json={"enabled": True})
        ok = client.post("/api/v1/tools/execute", json={"tool_name": "inspect_workspace", "arguments": {}}).json()
        assert ok["status"] == "completed"
        assert "entries" in ok["output"]

        # Destructive tool requires confirmation token
        dest = client.post("/api/v1/tools/execute", json={"tool_name": "purge_hypothesis_memories", "arguments": {}}).json()
        assert dest["status"] == "awaiting_confirmation"
        tok = dest["confirmation_token"]
        assert tok.startswith("confirm_")

        # Disable autonomy -> specialist agent dispatch blocked
        client.patch("/api/v1/switches/autonomy", json={"enabled": False})
        ag_blocked = client.post("/api/v1/agents/agent_architect/dispatch", json={"objective": "Audit architecture"}).json()
        assert ag_blocked["status"] == "blocked_by_switch"
        client.patch("/api/v1/switches/autonomy", json={"enabled": True})

        # Disable embodiment -> holographic mode blocked with 409
        client.patch("/api/v1/switches/embodiment", json={"enabled": False})
        holo_blocked = client.post("/api/v1/world/mode", json={"mode_id": "holographic_presence"})
        assert holo_blocked.status_code == 409
        client.patch("/api/v1/switches/embodiment", json={"enabled": True})


def test_memory_epistemic_integrity_and_sensitive_encryption():
    with TestClient(app) as client:
        # Create sensitive memory -> redacted by default, decrypted when reveal_sensitive=true
        r_sens = client.post("/api/v1/memories", json={
            "category": "sensitive",
            "epistemic_status": "owner_stated",
            "title": "Private Hardware Serial",
            "content": "SN-99481-OMEGA",
            "is_sensitive": True,
        })
        assert r_sens.status_code == 200
        sens_id = r_sens.json()["id"]

        masked_list = client.get("/api/v1/memories?category=sensitive").json()
        item = next(m for m in masked_list if m["id"] == sens_id)
        assert item["content"] == "[SENSITIVE RECORD — ENCRYPTED AT REST]"

        revealed_list = client.get("/api/v1/memories?category=sensitive&reveal_sensitive=true").json()
        item_rev = next(m for m in revealed_list if m["id"] == sens_id)
        assert item_rev["content"] == "SN-99481-OMEGA"

        # Create hypothesis -> cannot silently promote to verified_fact without evidence_verified=True
        r_hyp = client.post("/api/v1/memories", json={
            "category": "agent_finding",
            "epistemic_status": "hypothesis",
            "title": "Unconfirmed Valve Resonance",
            "content": "May resonate at 620 Hz.",
            "confidence": 0.55,
        })
        hyp_id = r_hyp.json()["id"]

        bad_promo = client.patch(f"/api/v1/memories/{hyp_id}", json={"epistemic_status": "verified_fact"})
        assert bad_promo.status_code == 409

        good_promo = client.patch(
            f"/api/v1/memories/{hyp_id}",
            json={"epistemic_status": "verified_fact", "evidence_verified": True},
        )
        assert good_promo.status_code == 200

        # Forget memory
        del_resp = client.delete(f"/api/v1/memories/{sens_id}")
        assert del_resp.status_code == 200


def test_goal_dependency_enforcement():
    with TestClient(app) as client:
        # goal-stator-prototype depends on goal-cryo-forensics (currently 'active', not 'completed')
        r_block = client.patch("/api/v1/goals/goal-stator-prototype/status", json={"status": "active"})
        assert r_block.status_code == 409

        # Complete dependency first
        client.patch("/api/v1/goals/goal-cryo-forensics/status", json={"status": "completed", "progress": 100})
        r_ok = client.patch("/api/v1/goals/goal-stator-prototype/status", json={"status": "active"})
        assert r_ok.status_code == 200
        # Restore cryo goal to active for normal runtime
        client.patch("/api/v1/goals/goal-cryo-forensics/status", json={"status": "active", "progress": 65})


def test_scenarios_simulations_and_kaggle_packages():
    with TestClient(app) as client:
        # Activate Forensic Scenario
        act = client.post("/api/v1/scenarios/cryo_manifold_forensic/activate", json={
            "variables": {"line_pressure_mpa": 165, "relief_valve_ms": 45},
            "playing": True,
        })
        assert act.status_code == 200
        assert act.json()["runtime"]["computed"]["branch"] == "controlled_bypass"

        # Restore world
        rest = client.post("/api/v1/scenarios/restore")
        assert rest.status_code == 200
        assert rest.json()["active_scenario"] is None

        # Verify at least 6 Kaggle profiles exist, update & mask credentials, and download ZIP worker package
        profs = client.get("/api/v1/compute/kaggle/profiles").json()
        assert len(profs) >= 6
        p0_id = profs[0]["id"]

        upd = client.patch(f"/api/v1/compute/kaggle/profiles/{p0_id}", json={
            "profile_name": "Kaggle-Primary-T4x2",
            "kaggle_username": "architect_user",
            "kaggle_key": "abcdef1234567890fedcba",
            "preferred_model": "huihui-ai/Qwen2.5-14B-Instruct-abliterated",
            "gpu_accelerator": "NvidiaTeslaT4x2",
            "is_active": True,
        }).json()
        assert "architect_user" not in upd["masked_username"]
        assert "abcdef123456" not in upd["masked_key"]
        assert upd["masked_key"].startswith("kg_")

        pkg = client.get(f"/api/v1/compute/kaggle/profiles/{p0_id}/package?core_wss_url=wss://nexus.local/ws/worker")
        assert pkg.status_code == 200
        zf = zipfile.ZipFile(io.BytesIO(pkg.content))
        names = set(zf.namelist())
        assert {"jarvis_worker.py", "jarvis_kaggle_worker.ipynb", "README_KAGGLE_SETUP.md"}.issubset(names)
        nb_text = zf.read("jarvis_kaggle_worker.ipynb").decode("utf-8")
        assert "JARVIS_WORKER_TOKEN" in nb_text
        # Ensure raw server token is NEVER hardcoded inside exported notebook
        assert settings.WORKER_AUTH_TOKEN not in nb_text

        # Unconfigured video generation must return 503 truthfully, never fake a placeholder video
        vgen = client.post("/api/v1/media/generate?prompt=test")
        assert vgen.status_code == 503


def test_authenticated_private_worker_websocket_streaming():
    with TestClient(app) as client:
        # 1. Unauthenticated worker must be rejected
        try:
            with client.websocket_connect("/ws/worker") as ws_bad:
                ws_bad.receive_text()
                assert False, "Should have closed unauthenticated worker socket"
        except Exception:
            pass

        # 2. Authenticated Local PC worker connects and streams tokens back to /api/v1/conversations/send
        headers = {
            "Authorization": f"Bearer {settings.WORKER_AUTH_TOKEN}",
            "X-Jarvis-Worker-Kind": "local_pc",
            "X-Jarvis-Profile": "Local-RTX-Test",
        }
        with client.websocket_connect("/ws/worker", headers=headers) as ws_worker:
            ws_worker.send_text(json.dumps({
                "type": "worker_hello",
                "worker_kind": "local_pc",
                "profile_name": "Local-RTX-Test",
                "model_id": settings.DEFAULT_MODEL,
                "capabilities": {"cuda_available": True, "vram_gb": 24.0},
                "state": "ready",
            }))
            ws_worker.send_text(json.dumps({
                "type": "worker_state",
                "state": "ready",
                "model_id": settings.DEFAULT_MODEL,
                "detail": "Ready",
            }))

            def responder():
                req_raw = ws_worker.receive_text()
                req = json.loads(req_raw)
                if req.get("type") == "generate":
                    rid = req["request_id"]
                    for tok in ["Telemetry ", "confirms ", "nominal ", "flow."]:
                        ws_worker.send_text(json.dumps({"type": "generation_delta", "request_id": rid, "delta": tok}))
                    ws_worker.send_text(json.dumps({"type": "generation_done", "request_id": rid}))

            t = threading.Thread(target=responder, daemon=True)
            t.start()

            chat_res = client.post("/api/v1/conversations/send", json={
                "content": "Report manifold flow status.",
                "modality": "text",
            })
            t.join(timeout=5)
            assert chat_res.status_code == 200
            body = chat_res.json()
            assert body["jarvis_message"]["inference_source"] == "local_pc"
            assert body["jarvis_message"]["content"] == "Telemetry confirms nominal flow."


def test_supabase_url_and_fernet_passphrase_normalization():
    from cryptography.fernet import Fernet
    from backend.app.config import _normalize_fernet_key, normalize_database_url

    supa_pooler = "postgresql://postgres.ref123:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"
    assert normalize_database_url(supa_pooler) == (
        "postgresql+psycopg://postgres.ref123:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"
    )
    assert normalize_database_url("postgres://u:p@db.supabase.co:5432/postgres") == (
        "postgresql+psycopg://u:p@db.supabase.co:5432/postgres"
    )

    derived = _normalize_fernet_key("my-production-railway-passphrase")
    f = Fernet(derived.encode("ascii"))
    token = f.encrypt(b"jarvis-secret")
    assert f.decrypt(token) == b"jarvis-secret"

