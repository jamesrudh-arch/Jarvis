#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f ".jarvis_secret_key" ]]; then
  WORKER_TOKEN="$(grep '^WORKER_AUTH_TOKEN=' .jarvis_secret_key | cut -d= -f2-)"
  export JARVIS_WORKER_TOKEN="${JARVIS_WORKER_TOKEN:-$WORKER_TOKEN}"
fi

exec python3 worker/jarvis_worker.py \
  --core-url "${CORE_WS_URL:-ws://127.0.0.1:8000/ws/worker}" \
  --kind local_pc \
  --profile "${WORKER_PROFILE:-Local-PC-Primary}" \
  --model "${JARVIS_DEFAULT_MODEL:-huihui-ai/Qwen2.5-14B-Instruct-abliterated}" \
  "$@"
