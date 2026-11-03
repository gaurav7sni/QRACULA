"""VirusTotal v3 client using only the standard library.

A fresh scan is never waited on for long: the client submits the link, waits
once, and if the result is not ready it raises Pending(analysis_id). The caller
remembers the analysis id and, when the browser asks again, passes it back so
we only POLL that analysis instead of submitting the link a second time (which
would waste the small free-tier quota).

Every request first asks `acquire` for permission, which is how the quota is
shared across all running Lambda copies.
"""
from __future__ import annotations

import base64
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Optional

from .core import Report

VT_BASE = "https://www.virustotal.com/api/v3"
VT_TIMEOUT = 8
SUBMIT_WAIT_SECONDS = 10
MAX_REPORT_AGE_SECONDS = 7 * 24 * 3600
_COUNT_KEYS = ("malicious", "suspicious", "harmless", "undetected")


class VirusTotalError(Exception):
    """A problem with the reputation service. `code` is safe to show to clients."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class RateLimited(Exception):
    """The reputation service quota is used up for now."""


class _AnalysisGone(Exception):
    """VirusTotal no longer knows this analysis id (it expired)."""


class Pending(Exception):
    """The scan was started but is not finished yet. Carries the analysis id to poll later."""

    def __init__(self, analysis_id: Optional[str] = None):
        super().__init__("scan pending")
        self.analysis_id = analysis_id


def url_id(url: str) -> str:
    return base64.urlsafe_b64encode(url.encode("utf-8")).decode("ascii").rstrip("=")


def http_request(method: str, url: str, *, headers: dict, data: Optional[dict] = None,
                 timeout: int = VT_TIMEOUT) -> tuple[int, Any]:
    """Tiny HTTP helper. Returns (status_code, parsed_json_or_None)."""
    body = urllib.parse.urlencode(data).encode("utf-8") if data else None
    request = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 (fixed https host)
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as exc:
        status, raw = exc.code, exc.read()
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise VirusTotalError("reputation_unavailable", "The reputation service could not be reached.") from exc
    try:
        return status, (json.loads(raw.decode("utf-8")) if raw else None)
    except ValueError:
        return status, None


def _stats(raw: Optional[dict]) -> dict[str, int]:
    raw = raw or {}
    return {key: int(raw.get(key, 0) or 0) for key in _COUNT_KEYS}


def _report(stats: dict[str, int], analyzed_at: Optional[int], final_url: Optional[str] = None) -> Report:
    return Report(
        malicious=stats["malicious"], suspicious=stats["suspicious"],
        harmless=stats["harmless"], undetected=stats["undetected"],
        analyzed_at=analyzed_at, final_url=final_url,
    )


def _parse_report(body: Any) -> Report:
    try:
        attrs = body["data"]["attributes"]
        analyzed = attrs.get("last_analysis_date")
        return _report(
            _stats(attrs.get("last_analysis_stats")),
            int(analyzed) if analyzed else None,
            attrs.get("last_final_url"),
        )
    except (KeyError, TypeError, ValueError, AttributeError) as exc:
        raise VirusTotalError("reputation_unavailable", "The reputation service sent an unexpected reply.") from exc


def _parse_analysis(body: Any) -> tuple[str, dict[str, int], Optional[int]]:
    try:
        attrs = body["data"]["attributes"]
        date = attrs.get("date")
        return attrs.get("status", ""), _stats(attrs.get("stats")), int(date) if date else None
    except (KeyError, TypeError, ValueError, AttributeError) as exc:
        raise VirusTotalError("reputation_unavailable", "The reputation service sent an unexpected reply.") from exc


class VirusTotal:
    def __init__(
        self,
        api_key: str,
        *,
        acquire: Optional[Callable[[], None]] = None,
        http: Callable[..., tuple[int, Any]] = http_request,
        sleep: Callable[[float], None] = time.sleep,
        now: Callable[[], float] = time.time,
        submit_wait: float = SUBMIT_WAIT_SECONDS,
    ):
        self._key = api_key
        self._acquire = acquire
        self._http = http
        self._sleep = sleep
        self._now = now
        self._submit_wait = submit_wait

    def _call(self, method: str, path: str, data: Optional[dict] = None) -> tuple[int, Any]:
        if self._acquire:
            self._acquire()  # raises RateLimited when the shared quota is used up
        status, body = self._http(
            method, f"{VT_BASE}{path}",
            headers={"x-apikey": self._key, "Accept": "application/json"}, data=data,
        )
        if status in (401, 403):
            raise VirusTotalError("reputation_auth", "The reputation service rejected our credentials.")
        if status == 429:
            raise RateLimited()
        if status >= 500:
            raise VirusTotalError("reputation_unavailable", "The reputation service is having problems.")
        return status, body

    def _is_fresh(self, report: Report) -> bool:
        if not report.analyzed_at or report.total == 0:
            return False
        return (self._now() - report.analyzed_at) <= MAX_REPORT_AGE_SECONDS

    def _poll(self, url: str, analysis_id: str) -> Optional[Report]:
        """One status check of a running analysis. None = not finished (or gone)."""
        status, body = self._call("GET", f"/analyses/{analysis_id}")
        if status == 404:
            raise _AnalysisGone()
        if status != 200:
            return None
        state, stats, date = _parse_analysis(body)
        if state == "completed" and sum(stats.values()) > 0:
            return self._add_destination(url, _report(stats, date or int(self._now())))
        return None

    def check(self, url: str, analysis_id: Optional[str] = None) -> Report:
        """Return a recent report for the link, starting a scan if needed.

        Pass the analysis_id from an earlier Pending to continue that scan instead
        of starting a new one.
        """
        if analysis_id:
            try:
                report = self._poll(url, analysis_id)
            except _AnalysisGone:
                report = None
            else:
                if report:
                    return report
                raise Pending(analysis_id)  # still running; keep waiting on the same scan

        status, body = self._call("GET", f"/urls/{url_id(url)}")
        cached: Optional[Report] = None
        if status == 200:
            cached = _parse_report(body)
            if self._is_fresh(cached):
                return cached
        elif status != 404:
            raise VirusTotalError("reputation_unavailable", "The reputation service sent an unexpected reply.")

        status, body = self._call("POST", "/urls", data={"url": url})
        try:
            new_id = body["data"]["id"] if status == 200 else None
        except (KeyError, TypeError):
            new_id = None
        if not new_id:
            raise VirusTotalError("reputation_unavailable", "The reputation service did not accept the link.")

        self._sleep(self._submit_wait)
        try:
            report = self._poll(url, new_id)
        except _AnalysisGone:
            report = None
        if report:
            return report
        if cached is not None and cached.total > 0:
            cached.stale = True  # an old report is better than none, if clearly marked
            return cached
        raise Pending(new_id)

    def _add_destination(self, url: str, report: Report) -> Report:
        """Best effort: fetch where the link redirects to. Never fails the scan."""
        try:
            status, body = self._call("GET", f"/urls/{url_id(url)}")
            if status == 200:
                report.final_url = _parse_report(body).final_url
        except (RateLimited, VirusTotalError):
            pass
        return report
