#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[JARVIS NEXUS] Building 3D Sanctuary frontend bundle..."
(cd frontend && npm run build)

echo "[JARVIS NEXUS] Starting FastAPI CORE + 3D Sanctuary on 0.0.0.0:${JARVIS_PORT:-8000}..."
exec .venv/bin/uvicorn backend.app.main:app --host "${JARVIS_HOST:-0.0.0.0}" --port "${JARVIS_PORT:-8000}"
