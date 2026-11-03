"""Helpers for working on a laptop without a VirusTotal key or internet."""
from __future__ import annotations

from .core import Report


class FakeVirusTotal:
    """Answers by website name so the whole app can be tried offline.

    Links containing 'evil' look dangerous, 'sus' looks suspicious, 'slow' stays
    pending on the first try, anything else looks clean.
    """

    def __init__(self):
        self._seen: set[str] = set()

    def check(self, url: str, analysis_id=None) -> Report:
        from .virustotal import Pending

        lowered = url.lower()
        if "slow" in lowered and url not in self._seen:
            self._seen.add(url)
            raise Pending("fake-analysis")
        if "evil" in lowered:
            return Report(malicious=7, suspicious=2, harmless=55, undetected=20, analyzed_at=1_700_000_000, final_url=url)
        if "sus" in lowered:
            return Report(malicious=1, suspicious=2, harmless=60, undetected=20, analyzed_at=1_700_000_000, final_url=url)
        return Report(harmless=65, undetected=25, analyzed_at=1_700_000_000, final_url=url)
