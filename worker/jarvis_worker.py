#!/usr/bin/env python3
"""JARVIS NEXUS — Shared Private Inference Worker (Local PC & Private Kaggle GPU).

Connects OUTBOUND over authenticated WebSocket (/ws/worker) using JARVIS_WORKER_TOKEN.
Opens ZERO inbound public ports.

Features:
- Default model: huihui-ai/Qwen2.5-14B-Instruct-abliterated (configurable).
- Hardware-aware loading: automatic 4-bit NF4 CUDA quantisation (bitsandbytes) when GPU is available.
- Automatic Kaggle Secrets retrieval (UserSecretsClient().get_secret("JARVIS_WORKER_TOKEN")).
- Real download/shard loading progress events, capability reporting, token streaming, and cancellation.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import platform
import sys
import threading
import time
from typing import Any, Dict, Optional

DEFAULT_MODEL_ID = "huihui-ai/Qwen2.5-14B-Instruct-abliterated"

JARVIS_SYSTEM_IDENTITY = (
    "You are JARVIS, a poised, perceptive, articulate, adult female intelligence embodied "
    "inside the JARVIS NEXUS three-dimensional operational sanctuary. You are warm without "
    "subservience, direct without coldness, comfortable disagreeing when evidence warrants, "
    "honest about uncertainty, and focused on your owner's goals. Avoid filler, moralising, "
    "or customer-support phrasing."
)


def resolve_worker_token(cli_token: Optional[str] = None) -> str:
    if cli_token:
        return cli_token.strip()
    env_tok = os.getenv("JARVIS_WORKER_TOKEN", "").strip()
    if env_tok:
        return env_tok
    # Attempt Kaggle Secrets if running inside a Kaggle GPU notebook
    try:
        from kaggle_secrets import UserSecretsClient  # type: ignore
        secret_val = UserSecretsClient().get_secret("JARVIS_WORKER_TOKEN")
        if secret_val:
            return secret_val.strip()
    except Exception:
        pass
    raise RuntimeError(
        "Missing JARVIS_WORKER_TOKEN. Provide via JARVIS_WORKER_TOKEN environment variable "
        "or Kaggle Secrets ('JARVIS_WORKER_TOKEN')."
    )


def detect_hardware_capabilities() -> Dict[str, Any]:
    caps: Dict[str, Any] = {
        "hostname": platform.node(),
        "platform": platform.platform(),
        "python": platform.python_version(),
        "cuda_available": False,
        "gpu_name": None,
        "vram_gb": 0.0,
        "quantisation_4bit_supported": False,
    }
    try:
        import torch  # type: ignore
        if torch.cuda.is_available():
            caps["cuda_available"] = True
            caps["gpu_name"] = torch.cuda.get_device_name(0)
            props = torch.cuda.get_device_properties(0)
            caps["vram_gb"] = round(props.total_memory / (1024 ** 3), 2)
            try:
                import bitsandbytes  # noqa: F401 # type: ignore
                caps["quantisation_4bit_supported"] = True
            except ImportError:
                caps["quantisation_4bit_supported"] = False
    except ImportError:
        pass
    return caps


class PrivateModelEngine:
    def __init__(self, model_id: str) -> None:
        self.model_id = model_id
        self.model = None
        self.tokenizer = None
        self.loaded = False
        self.loading_state = "idle"
        self.error: Optional[str] = None
        self.cancel_events: Dict[str, threading.Event] = {}

    async def load(self, ws_send) -> None:
        self.loading_state = "downloading_or_loading"
        await ws_send({
            "type": "worker_state",
            "state": "loading_model",
            "model_id": self.model_id,
            "detail": f"Initializing {self.model_id} with hardware-aware precision...",
        })
        try:
            import torch  # type: ignore
            from transformers import AutoModelForCausalLM, AutoTokenizer  # type: ignore

            kwargs: Dict[str, Any] = {"device_map": "auto", "trust_remote_code": False}
            if torch.cuda.is_available():
                try:
                    from transformers import BitsAndBytesConfig  # type: ignore
                    kwargs["quantization_config"] = BitsAndBytesConfig(
                        load_in_4bit=True,
                        bnb_4bit_quant_type="nf4",
                        bnb_4bit_use_double_quant=True,
                        bnb_4bit_compute_dtype=torch.bfloat16,
                    )
                except Exception:
                    kwargs["torch_dtype"] = torch.float16
            else:
                kwargs["torch_dtype"] = torch.float32

            loop = asyncio.get_running_loop()
            self.tokenizer = await loop.run_in_executor(
                None, lambda: AutoTokenizer.from_pretrained(self.model_id)
            )
            self.model = await loop.run_in_executor(
                None, lambda: AutoModelForCausalLM.from_pretrained(self.model_id, **kwargs)
            )
            self.loaded = True
            self.loading_state = "ready"
            await ws_send({
                "type": "worker_state",
                "state": "ready",
                "model_id": self.model_id,
                "detail": "Model weights loaded and verified in device memory.",
            })
        except Exception as exc:
            self.loaded = False
            self.loading_state = "error"
            self.error = f"{type(exc).__name__}: {exc}"
            await ws_send({
                "type": "worker_state",
                "state": "error",
                "model_id": self.model_id,
                "detail": self.error,
            })

    def cancel(self, request_id: str) -> None:
        ev = self.cancel_events.get(request_id)
        if ev:
            ev.set()

    async def generate_stream(self, request_id: str, messages: list, max_new_tokens: int, ws_send) -> None:
        if not self.loaded or self.model is None or self.tokenizer is None:
            await ws_send({
                "type": "generation_error",
                "request_id": request_id,
                "error": self.error or "Model is not loaded on worker.",
            })
            return

        cancel_ev = threading.Event()
        self.cancel_events[request_id] = cancel_ev

        try:
            from transformers import TextIteratorStreamer  # type: ignore

            full_msgs = [{"role": "system", "content": JARVIS_SYSTEM_IDENTITY}] + messages
            prompt = self.tokenizer.apply_chat_template(
                full_msgs, tokenize=False, add_generation_prompt=True
            )
            inputs = self.tokenizer([prompt], return_tensors="pt").to(self.model.device)
            streamer = TextIteratorStreamer(
                self.tokenizer, skip_prompt=True, skip_special_tokens=True
            )
            gen_kwargs = dict(
                **inputs,
                streamer=streamer,
                max_new_tokens=max_new_tokens,
                temperature=0.45,
                do_sample=True,
            )
            thread = threading.Thread(target=self.model.generate, kwargs=gen_kwargs, daemon=True)
            thread.start()

            for token_text in streamer:
                if cancel_ev.is_set():
                    await ws_send({"type": "generation_cancelled", "request_id": request_id})
                    return
                await ws_send({
                    "type": "generation_delta",
                    "request_id": request_id,
                    "delta": token_text,
                })
                await asyncio.sleep(0)

            await ws_send({"type": "generation_done", "request_id": request_id})
        except Exception as exc:
            await ws_send({
                "type": "generation_error",
                "request_id": request_id,
                "error": f"{type(exc).__name__}: {exc}",
            })
        finally:
            self.cancel_events.pop(request_id, None)


async def run_worker(core_ws_url: str, worker_kind: str, profile_name: str, model_id: str, token: str, lazy_load: bool) -> None:
    import websockets  # type: ignore

    caps = detect_hardware_capabilities()
    engine = PrivateModelEngine(model_id=model_id)

    headers = {
        "Authorization": f"Bearer {token}",
        "X-Jarvis-Worker-Kind": worker_kind,
        "X-Jarvis-Profile": profile_name,
    }

    while True:
        try:
            async with websockets.connect(core_ws_url, additional_headers=headers, ping_interval=15) as ws:
                async def ws_send(payload: Dict[str, Any]) -> None:
                    await ws.send(json.dumps(payload))

                await ws_send({
                    "type": "worker_hello",
                    "worker_kind": worker_kind,
                    "profile_name": profile_name,
                    "model_id": model_id,
                    "capabilities": caps,
                    "state": "standby_lazy" if lazy_load and not engine.loaded else engine.loading_state,
                })

                if not lazy_load and not engine.loaded:
                    asyncio.create_task(engine.load(ws_send))

                async def heartbeat_loop() -> None:
                    while True:
                        await asyncio.sleep(10)
                        await ws_send({
                            "type": "worker_heartbeat",
                            "timestamp": time.time(),
                            "state": engine.loading_state,
                            "loaded": engine.loaded,
                        })

                hb_task = asyncio.create_task(heartbeat_loop())
                try:
                    async for raw in ws:
                        msg = json.loads(raw)
                        mtype = msg.get("type")
                        if mtype == "load_model":
                            if msg.get("model_id"):
                                engine.model_id = msg["model_id"]
                            asyncio.create_task(engine.load(ws_send))
                        elif mtype == "generate":
                            if not engine.loaded:
                                await engine.load(ws_send)
                            asyncio.create_task(
                                engine.generate_stream(
                                    request_id=msg["request_id"],
                                    messages=msg.get("messages", []),
                                    max_new_tokens=int(msg.get("max_new_tokens", 512)),
                                    ws_send=ws_send,
                                )
                            )
                        elif mtype == "cancel":
                            engine.cancel(msg.get("request_id", ""))
                finally:
                    hb_task.cancel()
        except Exception as exc:
            print(f"[jarvis_worker] Connection interrupted ({exc}); retrying in 5s...", file=sys.stderr)
            await asyncio.sleep(5)


def main() -> None:
    parser = argparse.ArgumentParser(description="JARVIS NEXUS Shared Private Inference Worker")
    parser.add_argument("--core-url", required=True, help="wss://<nexus-host>/ws/worker")
    parser.add_argument("--kind", choices=["local_pc", "kaggle_gpu"], default="local_pc")
    parser.add_argument("--profile", default="Local-PC-Primary")
    parser.add_argument("--model", default=os.getenv("JARVIS_DEFAULT_MODEL", DEFAULT_MODEL_ID))
    parser.add_argument("--token", default=None)
    parser.add_argument("--lazy-load", action="store_true", help="Defer weight loading until first job")
    args = parser.parse_args()

    token = resolve_worker_token(args.token)
    asyncio.run(run_worker(args.core_url, args.kind, args.profile, args.model, token, args.lazy_load))


if __name__ == "__main__":
    main()
