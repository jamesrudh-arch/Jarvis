# Jarvis — JARVIS NEXUS

**JARVIS NEXUS** is a persistent, owner-controlled intelligence embodied as a living adult female NPC inside a real-time three-dimensional operational sanctuary—capable of natural locomotion, interruption and task resumption, multi-agent coordination, interactive room-scale 3D volumetric scenario reconstruction (*“Let me show you”*), spatial video analysis, private Local PC / Kaggle GPU inference, and live holographic projection.

---

## Architecture Overview

1. **Real-Time 3D World & Embodied Character (`frontend/`)**
   - **Engine**: Three.js WebGL2 with ACES Filmic tone mapping, soft shadow cascades, restrained bloom (`UnrealBloomPass`), and procedural basalt/slate/titanium PBR materials.
   - **Character (`JarvisCharacterController.js`)**: MIT-licensed 66-bone humanoid rig (`jarvis_avaturn.glb`) with 72 ARKit & Oculus viseme blendshapes across head, eyes, eyelashes, teeth, and tongue; Mixamo locomotion retargeting (`walking.fbx` + `xbot_locomotion.glb`) with zeroed root X/Z drift to eliminate foot-skating; collision-aware navigation around the central holo-ring; gaze-first turns; natural blinking; and real-time phoneme-to-viseme speech synchronization (`LipsyncEn`).
   - **12 Navigable Zones & 15 Connected Modes**: Central Operations, Volumetric Simulation Stage, Memory Archive Colonnade, Live Research Alcove, Goals & Projects Bay, Multi-Agent Collaboration Table, Frameless 4.8m Media Wall, Defensive Security Vault, Vision & Optical Input Bay, Diagnostics Station, Local/Kaggle Compute Bay, and the 7-Channel Owner Switch & Embodiment Bay.
   - **Scenario Director (`ScenarioDirector3D.js`)**: Constructs room-scale 18,000-point LiDAR voxel clouds, wireframe scenario actors, causal stress vectors, and dual-stator engineering simulations with interactive variable sliders, branching outcomes, timeline scrubbing, WebM recording, and clean world restoration.
   - **Shared Embodiment & Holographic Projection**: Synchronizes over `/ws/nexus` across PC browser, responsive Mobile Companion view, optional MetaHuman bridge listeners (`embodiment_frame_sync` skeletal/gaze stream), and Mode 15 Physical Holographic Presence (45° Pepper's Ghost mirror output and 4-Face Pyramid quad-camera WebGL scissor rendering).

2. **Modular Orchestration CORE (`backend/`)**
   - **Stack**: Python FastAPI, SQLAlchemy 2.0 ORM, WebSockets, Fernet AES-128-CBC+HMAC server-side secret encryption, SQLite for local dev/tests, and PostgreSQL + `pgvector` in production (`backend/migrations/001_initial_nexus_schema.sql`).
   - **Epistemic Memory**: Ten typed memory categories with encrypted `sensitive` records and a hard guardrail (`HTTP 409`) preventing silent promotion of `hypothesis` records to `verified_fact` without explicit verification.
   - **Goals, Specialist Agents & Guarded Tools**: Priority/dependency-gated goals, bounded specialist agents with instant cancellation, and allowlisted tools with confirmation tokens for destructive actions.
   - **Seven Hardware-Grade Owner Switches**: `Master`, `Microphone`, `Camera`, `Autonomy`, `Remote Compute`, `Computer Control`, and `Embodiment`—enforced both server-side in CORE and client-side on browser `MediaStream` tracks.

3. **Shared Private Inference Worker (`worker/jarvis_worker.py`)**
   - **Default Model**: `huihui-ai/Qwen2.5-14B-Instruct-abliterated` (configurable; zero mandatory cloud APIs or Ollama dependency).
   - **Local PC & Private Kaggle GPU**: Hardware-aware loading with 4-bit NF4 `bitsandbytes` CUDA quantisation where GPU hardware is present. Kaggle workers authenticate outbound via `JARVIS_WORKER_TOKEN` stored in Kaggle Secrets—opening **zero public ports**.

---

## Quick Start

### 1. Local Development
```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
(cd frontend && npm install)

# Terminal 1: Start CORE API & WebSocket Hub (0.0.0.0:8000)
.venv/bin/uvicorn backend.app.main:app --host 0.0.0.0 --port 8000

# Terminal 2: Start Vite 3D Sanctuary Server (0.0.0.0:5173)
cd frontend && npm run dev
```

### 2. Production Deployment (PostgreSQL + `pgvector`)
1. Copy `.env.example` to `.env` and configure `DATABASE_URL=postgresql+psycopg://user:pass@host:5432/jarvis_nexus`.
2. Apply `backend/migrations/001_initial_nexus_schema.sql` or allow CORE lifespan startup to initialize schema and `CREATE EXTENSION IF NOT EXISTS vector`.
3. Launch `./scripts/start_nexus.sh`.

### 3. Connecting Local PC or Private Kaggle GPU Inference
- **Local PC GPU**: Run `./scripts/run_local_worker.sh` on a machine with CUDA + `torch`, `transformers`, `accelerate`, and `bitsandbytes`.
- **Private Kaggle GPU**: Open **INSPECT -> Kaggle / GPU** inside the sanctuary, configure any of the 6+ encrypted profile slots, copy the server's `WORKER_AUTH_TOKEN` from `.jarvis_secret_key` into Kaggle Notebook **Add-ons -> Secrets** as `JARVIS_WORKER_TOKEN`, and click **Download Worker ZIP** to obtain `jarvis_kaggle_worker.ipynb` + `jarvis_worker.py`.

---

## Verified Automated Tests & Honest Environment Limitations

Run full automated checks:
```bash
.venv/bin/pytest -v
node frontend/tests/verify_character_and_scene.mjs
(cd frontend && npm run build)
```

- **Verified in Automated Suite**: CORE REST/WebSocket APIs, locomotion & interruption/resumption stack, 7 owner switch enforcement cascades, epistemic memory guardrails & Fernet encryption, DAG goal dependencies, coupled parametric simulation math, Kaggle encrypted profiles & ZIP worker package export, authenticated `/ws/worker` token streaming, 66-bone GLB rig & 72 morph-target integrity, `LipsyncEn` viseme scheduling, and production Vite bundle compilation.
- **External Hardware/Environment Notes**: When running inside a CPU-only container without an attached NVIDIA GPU, `ffmpeg` binary, physical Pepper's Ghost acrylic prism, or external Kaggle internet access, CORE truthfully reports those capabilities as offline/unconnected without fabricating model outputs, authentication results, or generated videos.
