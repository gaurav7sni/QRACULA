"""The analyse step: ties validation, reputation lookup, verdict, explanation and cache together.

Returns (http_status, json_body) pairs so it can be tested without any web server.
"""
from __future__ import annotations

import hashlib
import json
import re
import time
import urllib.parse
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from . import payloads
from .core import (
    MAX_PAYLOAD_CHARS, SUSPICIOUS, Assessment, assess, assess_internal, canonical_url,
    clean_text, is_internal_host, normalize_input, parse_url, HEADLINES,
)
from .explain import Explainer
from .virustotal import Pending, RateLimited, VirusTotal, VirusTotalError

CACHE_TTL_SECONDS = 6 * 3600
PENDING_TTL_SECONDS = 600
RETRY_AFTER_SECONDS = 12
VT_REQUESTS_PER_MINUTE = 4  # the free VirusTotal tier allows 4 requests a minute
CLIENT_LIMIT_PER_5_MIN = 40

# Link types that can run code or reach private data instead of opening a website.
_RISKY_SCHEME = re.compile(r"^(javascript|data|vbscript|file|blob|intent|ms-[a-z-]+):", re.I)

_FRIENDLY_ERRORS = {
    "reputation_auth": "The security check service is not set up correctly. Please try again later.",
    "reputation_unavailable": "The security check service is not available right now. Please try again shortly.",
}


def make_acquire(store: Any, per_minute: int = VT_REQUESTS_PER_MINUTE) -> Callable[[], None]:
    """Build the permission check VirusTotal calls before every request."""

    def acquire() -> None:
        try:
            allowed = store.acquire("vt", per_minute, 60)
        except Exception:  # noqa: BLE001  if storage is down, do not block scans
            allowed = True
        if not allowed:
            raise RateLimited()

    return acquire


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _iso(ts: Optional[int]) -> Optional[str]:
    return datetime.fromtimestamp(ts, timezone.utc).isoformat(timespec="seconds") if ts else None


def error(status: int, code: str, message: str, request_id: str) -> tuple[int, dict]:
    return status, {"error": {"code": code, "message": message, "requestId": request_id}}


class Analyzer:
    def __init__(
        self,
        store: Any,
        explainer: Explainer,
        vt_provider: Callable[[], VirusTotal],
        *,
        cache_ttl: int = CACHE_TTL_SECONDS,
        client_limit: int = CLIENT_LIMIT_PER_5_MIN,
    ):
        self._store = store
        self._explainer = explainer
        self._vt_provider = vt_provider
        self._cache_ttl = cache_ttl
        self._client_limit = client_limit

    # Storage problems must never stop a scan, so cache access is best effort.
    def _cache_get(self, key: str) -> Optional[dict]:
        try:
            return self._store.get(key)
        except Exception:  # noqa: BLE001
            return None

    def _cache_put(self, key: str, value: dict, ttl: Optional[int] = None) -> None:
        try:
            self._store.put(key, value, ttl or self._cache_ttl)
        except Exception:  # noqa: BLE001
            pass

    def _client_allowed(self, client_id: Optional[str]) -> bool:
        """Per-visitor limit so one person cannot use up everyone's scans. Fails open."""
        if not client_id or self._client_limit <= 0:
            return True
        try:
            return bool(self._store.acquire(f"client-{client_id}", self._client_limit, 300))
        except Exception:  # noqa: BLE001
            return True

    def analyze(self, payload: Any, request_id: str, client_id: Optional[str] = None) -> tuple[int, dict]:
        started = time.perf_counter()
        text = normalize_input(payload if isinstance(payload, str) else "")
        if not text:
            return error(400, "empty_payload", "Nothing to check. Send the text or link from the QR code.", request_id)
        if len(text) > MAX_PAYLOAD_CHARS:
            return error(400, "payload_too_long", "That is too long to check.", request_id)

        if _RISKY_SCHEME.match(text):
            return 200, self._risky_scheme(text, request_id)

        try:
            scheme = urllib.parse.urlparse(text).scheme.lower()
        except ValueError:
            scheme = ""
        if scheme not in ("http", "https"):
            return 200, self._not_a_link(text, request_id)

        parsed = parse_url(text)
        if parsed is None:
            return error(400, "invalid_url", "Only normal http or https links can be checked.", request_id)

        url = canonical_url(parsed)
        key = hashlib.sha256(url.encode("utf-8")).hexdigest()[:40]
        host = parsed.hostname or ""

        if is_internal_host(host):
            return 200, self._build(url, host, None, assess_internal(parsed), None, request_id, cacheable=False)

        cached = self._cache_get(key)
        if cached:
            self._log(request_id, key, cached.get("verdict"), True, started)
            return 200, {**cached, "cached": True, "requestId": request_id}

        if not self._client_allowed(client_id):
            return error(429, "too_many_requests", "You are scanning very quickly. Please wait a few minutes.", request_id)

        pending_key = f"pending-{key}"
        waiting = self._cache_get(pending_key)
        try:
            report = self._vt_provider().check(url, analysis_id=(waiting or {}).get("analysisId"))
        except Pending as exc:
            if exc.analysis_id:  # remember the running scan so the retry continues it
                self._cache_put(pending_key, {"analysisId": exc.analysis_id}, PENDING_TTL_SECONDS)
            return 202, {"status": "pending", "retryAfterSeconds": RETRY_AFTER_SECONDS, "requestId": request_id}
        except RateLimited:
            return error(429, "busy", "Many people are scanning right now. Please try again in a minute.", request_id)
        except VirusTotalError as exc:
            status = 502
            return error(status, exc.code, _FRIENDLY_ERRORS.get(exc.code, exc.message), request_id)

        assessment = assess(report, parsed)
        if report.stale:
            assessment.reasons.append("The latest check was still running, so this uses an older result")
        body = self._build(url, host, report, assessment, report, request_id, cacheable=not report.stale, key=key)
        self._log(request_id, key, body["verdict"], False, started)
        return 200, body

    def _build(self, url, host, report, assessment: Assessment, evidence_report, request_id,
               cacheable: bool, key: Optional[str] = None) -> dict:
        final = clean_text(report.final_url, 300) if report and report.final_url else None
        final_host = ""
        if final:
            try:
                final_host = urllib.parse.urlparse(final).hostname or ""
            except ValueError:
                final_host = ""
        evidence = None
        if evidence_report:
            evidence = {
                "malicious": evidence_report.malicious, "suspicious": evidence_report.suspicious,
                "harmless": evidence_report.harmless, "undetected": evidence_report.undetected,
                "analyzedAt": _iso(evidence_report.analyzed_at), "stale": evidence_report.stale,
            }
        domain = clean_text(final_host or host, 100)
        explanation = self._explainer.explain(
            {"verdict": assessment.verdict, "reasons": assessment.reasons,
             "evidence": evidence or {}, "domain": domain}
        )
        body = {
            "status": "complete",
            "payloadType": "URL",
            "verdict": assessment.verdict,
            "headline": assessment.headline,
            "reasons": assessment.reasons,
            "destination": {"scanned": clean_text(url, 300), "final": final, "domain": domain},
            **explanation,
            "evidence": evidence,
            "checkedAt": _now_iso(),
            "cached": False,
            "requestId": request_id,
        }
        if cacheable and key:
            self._cache_put(key, body)
        return body

    def _not_a_link(self, text: str, request_id: str) -> dict:
        info = payloads.classify(text)
        return {
            "status": "complete", "payloadType": info["type"], "verdict": payloads.INFO,
            "headline": info["headline"], "reasons": info["reasons"], "details": info["details"],
            "destination": None, "aiExplanation": None, "recommendation": None,
            "explanationSource": None, "evidence": None,
            "checkedAt": _now_iso(), "cached": False, "requestId": request_id,
        }

    def _risky_scheme(self, text: str, request_id: str) -> dict:
        scheme = clean_text(text.split(":", 1)[0].lower(), 30)
        return {
            "status": "complete", "payloadType": "Unsafe link type", "verdict": SUSPICIOUS,
            "headline": HEADLINES[SUSPICIOUS],
            "reasons": [
                f"This is a '{scheme}:' link, not a normal website",
                "This kind of link can run code or open private data on your device",
            ],
            "details": {"text": clean_text(text, 200)}, "destination": None,
            "aiExplanation": None, "recommendation": "Do not open this. Scan a different QR code.",
            "explanationSource": None, "evidence": None,
            "checkedAt": _now_iso(), "cached": False, "requestId": request_id,
        }

    @staticmethod
    def _log(request_id: str, key: str, verdict: Optional[str], cached: bool, started: float) -> None:
        # Only a short hash of the link is logged, never the link itself.
        print(json.dumps({
            "event": "analyze", "requestId": request_id, "urlHash": key[:12], "verdict": verdict,
            "cached": cached, "ms": round((time.perf_counter() - started) * 1000),
        }))
