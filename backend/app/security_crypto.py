"""Server-side encryption, secret masking, and constant-time token verification."""
from __future__ import annotations

import hmac
import json
from typing import Any, Dict

from cryptography.fernet import Fernet, InvalidToken

from .config import settings

_fernet = Fernet(settings.FERNET_MASTER_KEY.encode("ascii"))


def encrypt_dict(payload: Dict[str, Any]) -> str:
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return _fernet.encrypt(raw).decode("ascii")


def decrypt_dict(token: str) -> Dict[str, Any]:
    if not token:
        return {}
    try:
        raw = _fernet.decrypt(token.encode("ascii"))
        return json.loads(raw.decode("utf-8"))
    except (InvalidToken, ValueError, TypeError):
        return {}


def encrypt_text(plaintext: str) -> str:
    return _fernet.encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt_text(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    try:
        return _fernet.decrypt(ciphertext.encode("ascii")).decode("utf-8")
    except InvalidToken:
        return "[encrypted: unable to decrypt with current server key]"


def mask_identifier(value: str, prefix: str = "") -> str:
    clean = (value or "").strip()
    if not clean:
        return "unconfigured"
    if len(clean) <= 4:
        return f"{prefix}{'•' * len(clean)}"
    if len(clean) <= 8:
        return f"{prefix}{clean[:2]}••••{clean[-2:]}"
    return f"{prefix}{clean[:3]}••••••{clean[-4:]}"


def verify_worker_token(candidate: str) -> bool:
    if not candidate:
        return False
    clean = candidate.strip()
    if clean.lower().startswith("bearer "):
        clean = clean[7:].strip()
    return hmac.compare_digest(clean.encode("utf-8"), settings.WORKER_AUTH_TOKEN.encode("utf-8"))
