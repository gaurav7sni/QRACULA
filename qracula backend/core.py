"""Input validation and verdict rules.

No AWS or network code lives here, so everything in this module can be tested
on a laptop. The verdict is decided ONLY by the rules below; the AI never
decides it, it only explains it.
"""
from __future__ import annotations

import ipaddress
import re
import socket
import urllib.parse
from dataclasses import dataclass, field
from typing import Optional

MAX_PAYLOAD_CHARS = 2048
LONG_URL_CHARS = 1000

# One or two engines flagging a link is often a false positive, so it is a
# warning. Three or more is treated as dangerous. This is a policy choice:
# change it here and the tests will tell you what else moves.
DANGER_THRESHOLD = 3

SHORTENER_DOMAINS = (
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "v.gd",
    "buff.ly", "rebrand.ly", "cutt.ly", "shorturl.at", "tiny.cc", "rb.gy",
    "t.ly", "s.id", "qrco.de",
)

# Control characters, zero-width characters and bidirectional overrides.
# They can make a link look like something it is not, so they are removed
# from anything we send back and make a link invalid when found inside it.
_UNSAFE_CHARS = re.compile("[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]")
_WHITESPACE = re.compile(r"\s")

DANGEROUS = "DANGEROUS"
SUSPICIOUS = "SUSPICIOUS"
SAFE = "SAFE"

HEADLINES = {
    DANGEROUS: "Dangerous link: do not open it",
    SUSPICIOUS: "Be careful: this link has warning signs",
    SAFE: "No known threat found",
}


def clean_text(value: str, limit: Optional[int] = None) -> str:
    """Remove invisible/unsafe characters and optionally shorten the text."""
    text = _UNSAFE_CHARS.sub("", value or "")
    if limit is not None and len(text) > limit:
        text = text[: max(limit - 1, 0)] + "…"
    return text


def normalize_input(text: str) -> str:
    """Add https:// to bare 'www.' links. Everything else is left unchanged."""
    text = (text or "").strip()
    if re.match(r"^www\.[^\s/]+", text, re.I) and not _WHITESPACE.search(text):
        return "https://" + text
    return text


def parse_url(text: str) -> Optional[urllib.parse.ParseResult]:
    """Return a parsed http(s) URL, or None if it is not an acceptable link."""
    text = (text or "").strip()
    if not text or len(text) > MAX_PAYLOAD_CHARS:
        return None
    if _UNSAFE_CHARS.search(text) or _WHITESPACE.search(text):
        return None
    try:
        parsed = urllib.parse.urlparse(text)
        host = parsed.hostname
        _ = parsed.port  # raises ValueError for an invalid port
    except ValueError:
        return None
    if parsed.scheme.lower() not in ("http", "https") or not host:
        return None
    if parsed.username or parsed.password:
        return None
    return parsed


def canonical_url(parsed: urllib.parse.ParseResult) -> str:
    """Normalised form used for caching and for the reputation lookup.

    The #fragment is dropped: it is never sent to the website, and it can
    contain private tokens that should not be shared with a third party.
    """
    return urllib.parse.urlunparse(
        parsed._replace(scheme=parsed.scheme.lower(), netloc=parsed.netloc.lower(), fragment="")
    )


def _ip_or_none(host: str):
    """Parse an IP address, including the old numeric spellings browsers still accept.

    '127.1', '0177.0.0.1' and '0x7f.0.0.1' all open 127.0.0.1 in a browser, so they
    must not be mistaken for ordinary website names.
    """
    host = host.strip("[]")
    try:
        return ipaddress.ip_address(host)
    except ValueError:
        pass
    if re.fullmatch(r"[0-9a-fx.]+", host, re.I):
        try:
            return ipaddress.IPv4Address(socket.inet_aton(host))
        except OSError:
            return None
    return None


def is_internal_host(host: str) -> bool:
    """True for localhost, private/reserved IPs and single-label or .local names.

    Such addresses cannot be checked online, and sending them to a third-party
    service would leak internal names.
    """
    host = (host or "").lower().strip("[]").rstrip(".")
    ip = _ip_or_none(host)
    if ip is not None:
        return not ip.is_global
    if "." not in host:
        return True
    return host == "localhost" or host.endswith(
        (".localhost", ".local", ".internal", ".lan", ".intranet", ".home.arpa")
    )


def is_shortener(host: str) -> bool:
    host = (host or "").lower()
    return any(host == d or host.endswith("." + d) for d in SHORTENER_DOMAINS)


def url_signals(parsed: urllib.parse.ParseResult) -> list[str]:
    """Cheap warning signs found in the link itself. Warnings, never proof."""
    host = (parsed.hostname or "").lower()
    signals: list[str] = []
    if parsed.scheme.lower() == "http":
        signals.append("The link uses HTTP, not HTTPS, so the connection is not encrypted")
    if _ip_or_none(host) is not None:
        signals.append("The link uses a raw IP address instead of a website name")
    if is_shortener(host):
        signals.append("This is a shortened link, so the real destination is hidden")
    if any(label.startswith("xn--") for label in host.split(".")) or not host.isascii():
        signals.append("The website name uses look-alike characters that can imitate another site")
    if len(parsed.geturl()) > LONG_URL_CHARS:
        signals.append("The link is unusually long")
    return signals


def _same_site(a: str, b: str) -> bool:
    """True when two hosts are the same site or one is a subdomain of the other."""
    a, b = (a or "").lower().rstrip("."), (b or "").lower().rstrip(".")
    return a == b or a.endswith("." + b) or b.endswith("." + a)


def redirect_signal(parsed: urllib.parse.ParseResult, final_url: Optional[str]) -> Optional[str]:
    """Warn when the link ends up on a different website than the one scanned."""
    if not final_url:
        return None
    try:
        final_host = urllib.parse.urlparse(final_url).hostname
    except ValueError:
        return None
    if not final_host or _same_site(final_host, parsed.hostname or ""):
        return None
    if is_shortener(parsed.hostname or ""):
        return None  # already flagged as a shortener; the destination is shown separately
    return f"The link redirects to a different website ({clean_text(final_host, 80)})"


@dataclass
class Report:
    """What the reputation service knows about a link."""

    malicious: int = 0
    suspicious: int = 0
    harmless: int = 0
    undetected: int = 0
    analyzed_at: Optional[int] = None
    final_url: Optional[str] = None
    stale: bool = False

    @property
    def total(self) -> int:
        return self.malicious + self.suspicious + self.harmless + self.undetected


@dataclass
class Assessment:
    verdict: str
    headline: str
    reasons: list[str] = field(default_factory=list)


def _engines(n: int) -> str:
    return f"{n} security engine" + ("" if n == 1 else "s")


def assess(report: Report, parsed: urllib.parse.ParseResult) -> Assessment:
    """Decide the verdict from the reputation report and the link's own shape."""
    signals = url_signals(parsed)
    redirect = redirect_signal(parsed, report.final_url)
    if redirect:
        signals.append(redirect)

    if report.malicious >= DANGER_THRESHOLD:
        danger = [f"{_engines(report.malicious)} flagged this link as malicious"] + signals
        return Assessment(DANGEROUS, HEADLINES[DANGEROUS], danger)

    reasons: list[str] = []
    if report.malicious > 0:
        reasons.append(f"{_engines(report.malicious)} flagged this link as malicious")
    if report.suspicious > 0:
        reasons.append(f"{_engines(report.suspicious)} marked this link as suspicious")
    reasons.extend(signals)
    if reasons:
        return Assessment(SUSPICIOUS, HEADLINES[SUSPICIOUS], reasons)

    return Assessment(
        SAFE,
        HEADLINES[SAFE],
        [f"None of the {report.total} security engines that checked it flagged this link"],
    )


def assess_internal(parsed: urllib.parse.ParseResult) -> Assessment:
    """Verdict for private/local addresses, which are never looked up online."""
    return Assessment(
        SUSPICIOUS,
        HEADLINES[SUSPICIOUS],
        [
            "This link points to a private or local address that cannot be checked online",
            "A QR code in a public place should not lead to an internal address",
        ],
    )
