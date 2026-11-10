"""Configuration and runtime capability detection for JARVIS NEXUS CORE."""
from __future__ import annotations

import os
import secrets
import shutil
from pathlib import Path
from typing import Any, Dict

from cryptography.fernet import Fernet

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "backend" / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
BACKUPS_DIR = DATA_DIR / "backups"
WORKER_PKG_DIR = DATA_DIR / "worker_packages"
SECRET_KEY_FILE = REPO_ROOT / ".jarvis_secret_key"

for directory in (DATA_DIR, UPLOADS_DIR, BACKUPS_DIR, WORKER_PKG_DIR):
    directory.mkdir(parents=True, exist_ok=True)


def _load_or_create_secrets() -> Dict[str, str]:
    """Load or generate server-side master encryption key and worker auth token.
    Stored exclusively in .jarvis_secret_key (gitignored, 0600 permissions).
    Never exposed to frontend JavaScript, localStorage, or public APIs.
    """
    data: Dict[str, str] = {}
    if SECRET_KEY_FILE.exists():
        for line in SECRET_KEY_FILE.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                data[k.strip()] = v.strip()

    changed = False
    if "FERNET_MASTER_KEY" not in data:
        data["FERNET_MASTER_KEY"] = Fernet.generate_key().decode("ascii")
        changed = True
    if "WORKER_AUTH_TOKEN" not in data:
        env_tok = os.getenv("JARVIS_WORKER_TOKEN", "").strip()
        data["WORKER_AUTH_TOKEN"] = env_tok or f"jnx_wk_{secrets.token_urlsafe(32)}"
        changed = True

    if changed:
        content = (
            "# Server-side JARVIS NEXUS secrets — DO NOT COMMIT\n"
            f"FERNET_MASTER_KEY={data['FERNET_MASTER_KEY']}\n"
            f"WORKER_AUTH_TOKEN={data['WORKER_AUTH_TOKEN']}\n"
        )
        SECRET_KEY_FILE.write_text(content, encoding="utf-8")
        try:
            os.chmod(SECRET_KEY_FILE, 0o600)
        except OSError:
            pass

    return data


_SECRETS = _load_or_create_secrets()


class Settings:
    PROJECT_NAME: str = "JARVIS NEXUS CORE"
    VERSION: str = "1.0.0"

    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        f"sqlite:///{(DATA_DIR / 'jarvis_nexus.db').as_posix()}",
    )
    SUPABASE_DB_URL: str = os.getenv("SUPABASE_DB_URL", "").strip()

    HOST: str = os.getenv("JARVIS_HOST", "0.0.0.0")
    PORT: int = int(os.getenv("JARVIS_PORT", "8000"))

    DEFAULT_MODEL: str = os.getenv(
        "JARVIS_DEFAULT_MODEL",
        "huihui-ai/Qwen2.5-14B-Instruct-abliterated",
    )

    OPTIONAL_OPENAI_BASE_URL: str = os.getenv("OPTIONAL_OPENAI_BASE_URL", "").strip()
    OPTIONAL_OPENAI_API_KEY: str = os.getenv("OPTIONAL_OPENAI_API_KEY", "").strip()
    OPTIONAL_OPENAI_MODEL: str = os.getenv("OPTIONAL_OPENAI_MODEL", "").strip()

    OPTIONAL_VIDEO_GEN_ENDPOINT: str = os.getenv("OPTIONAL_VIDEO_GEN_ENDPOINT", "").strip()
    OPTIONAL_VIDEO_GEN_API_KEY: str = os.getenv("OPTIONAL_VIDEO_GEN_API_KEY", "").strip()

    FERNET_MASTER_KEY: str = _SECRETS["FERNET_MASTER_KEY"]
    WORKER_AUTH_TOKEN: str = os.getenv("JARVIS_WORKER_TOKEN", "").strip() or _SECRETS["WORKER_AUTH_TOKEN"]

    @property
    def is_postgres(self) -> bool:
        return self.DATABASE_URL.startswith("postgresql")

    def runtime_capabilities(self) -> Dict[str, Any]:
        ffmpeg_path = shutil.which("ffmpeg")
        nvidia_smi = shutil.which("nvidia-smi")
        psql_path = shutil.which("psql")
        return {
            "database_engine": "postgresql" if self.is_postgres else "sqlite_dev",
            "pgvector_package_installed": True,
            "supabase_configured": bool(self.SUPABASE_DB_URL),
            "ffmpeg_available": bool(ffmpeg_path),
            "ffmpeg_binary": ffmpeg_path,
            "local_nvidia_gpu_detected": bool(nvidia_smi),
            "psql_cli_available": bool(psql_path),
            "optional_provider_configured": bool(
                self.OPTIONAL_OPENAI_BASE_URL and self.OPTIONAL_OPENAI_MODEL
            ),
            "video_generation_backend_configured": bool(self.OPTIONAL_VIDEO_GEN_ENDPOINT),
            "default_private_model": self.DEFAULT_MODEL,
        }


settings = Settings()
