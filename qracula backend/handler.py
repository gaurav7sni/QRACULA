"""AWS Lambda entry point (Lambda Function URL, payload format 2.0).

  POST /analyze   body: {"payload": "<text decoded from the QR code>"}
  GET  /health

CORS (which websites may call this) is configured on the Function URL in
template.yaml, so no CORS headers are added here.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from .config import ConfigError, get_vt_key
from .explain import Explainer
from .service import Analyzer, error, make_acquire
from .storage import make_store
from .virustotal import VirusTotal

MAX_BODY_BYTES = 8 * 1024
_analyzer: Optional[Analyzer] = None


def configure(analyzer: Analyzer) -> None:
    """Replace the analyzer (used by the local dev server and tests)."""
    global _analyzer
    _analyzer = analyzer


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, "").strip() or default)
    except ValueError:
        return default


def _get_analyzer() -> Analyzer:
    global _analyzer
    if _analyzer is None:
        store = make_store()
        per_minute = _int_env("VT_REQUESTS_PER_MINUTE", 4)
        _analyzer = Analyzer(
            store,
            Explainer(os.environ.get("BEDROCK_MODEL_ID", "")),
            lambda: VirusTotal(get_vt_key(), acquire=make_acquire(store, per_minute)),
            cache_ttl=_int_env("CACHE_TTL_HOURS", 6) * 3600,
            client_limit=_int_env("CLIENT_LIMIT_PER_5_MIN", 40),
        )
    return _analyzer


def _client_id(http: dict) -> Optional[str]:
    """A short, daily-changing hash of the caller's address (the address itself is never stored)."""
    ip = http.get("sourceIp")
    if not ip:
        return None
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return hashlib.sha256(f"{ip}|{day}".encode()).hexdigest()[:16]


def _response(status: int, body: dict, extra_headers: Optional[dict] = None) -> dict:
    headers = {"content-type": "application/json", "cache-control": "no-store"}
    headers.update(extra_headers or {})
    return {"statusCode": status, "headers": headers, "body": json.dumps(body)}


def _read_payload(event: dict) -> tuple[Optional[Any], Optional[str]]:
    """Return (payload, error_code)."""
    raw = event.get("body") or ""
    if event.get("isBase64Encoded"):
        try:
            raw = base64.b64decode(raw).decode("utf-8")
        except (binascii.Error, UnicodeDecodeError):
            return None, "invalid_request"
    if len(raw.encode("utf-8")) > MAX_BODY_BYTES:
        return None, "body_too_large"
    try:
        data = json.loads(raw)
    except ValueError:
        return None, "invalid_request"
    if not isinstance(data, dict) or not isinstance(data.get("payload"), str):
        return None, "invalid_request"
    return data["payload"], None


def lambda_handler(event: dict, context: Any = None) -> dict:
    request_id = getattr(context, "aws_request_id", None) or uuid.uuid4().hex
    http = (event.get("requestContext") or {}).get("http") or {}
    method = (http.get("method") or event.get("httpMethod") or "").upper()
    path = (event.get("rawPath") or event.get("path") or "/").rstrip("/") or "/"

    if path == "/health":
        return _response(200, {"status": "ok"}) if method == "GET" else _response(
            *error(405, "method_not_allowed", "Use GET.", request_id))
    if path != "/analyze":
        return _response(*error(404, "not_found", "Unknown path.", request_id))
    if method == "OPTIONS":
        return {"statusCode": 204, "headers": {}, "body": ""}
    if method != "POST":
        return _response(*error(405, "method_not_allowed", "Use POST.", request_id))

    payload, problem = _read_payload(event)
    if problem == "body_too_large":
        return _response(*error(413, problem, "That request is too large.", request_id))
    if problem:
        return _response(*error(400, problem, 'Send JSON like {"payload": "..."}.', request_id))

    try:
        status, body = _get_analyzer().analyze(payload, request_id, _client_id(http))
    except ConfigError:
        print(json.dumps({"event": "config_error", "requestId": request_id}))
        return _response(*error(500, "server_not_configured", "The service is not set up yet.", request_id))
    except Exception:  # noqa: BLE001
        import traceback
        print(json.dumps({"event": "internal_error", "requestId": request_id, "trace": traceback.format_exc()[-1500:]}))
        return _response(*error(500, "internal_error", "Something went wrong. Please try again.", request_id))

    extra = {"retry-after": str(body.get("retryAfterSeconds", ""))} if status == 202 else None
    return _response(status, body, extra)
