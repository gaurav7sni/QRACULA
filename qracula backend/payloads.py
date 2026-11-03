"""QR codes that are not web links (WiFi, UPI payment, contact, etc.).

There is nothing to look up for these, so we only describe what is inside and
give a short, practical warning. Secrets such as WiFi passwords are never
returned.
"""
from __future__ import annotations

import re
import urllib.parse
from typing import Any

from .core import clean_text

INFO = "INFO"
_LIMIT = 200


def _fields(body: str) -> dict[str, str]:
    """Parse 'K:value;K:value;;' style payloads, honouring backslash-escaped ';'."""
    out: dict[str, str] = {}
    for part in re.split(r"(?<!\\);", body):
        if ":" not in part:
            continue
        key, _, value = part.partition(":")
        out.setdefault(key.strip().upper(), value.replace("\\;", ";").strip())
    return out


def _result(kind: str, headline: str, details: dict[str, Any], reasons: list[str]) -> dict[str, Any]:
    safe_details = {
        k: (clean_text(v, _LIMIT) if isinstance(v, str) else v) for k, v in details.items()
    }
    return {"type": kind, "headline": headline, "details": safe_details, "reasons": reasons}


def classify(text: str) -> dict[str, Any]:
    text = (text or "").strip()
    upper, lower = text.upper(), text.lower()

    if upper.startswith("WIFI:"):
        f = _fields(text[5:])
        return _result(
            "WiFi", "This QR code connects you to a WiFi network",
            {"ssid": f.get("S", ""), "security": f.get("T") or "None",
             "hidden": f.get("H", "").lower() == "true", "hasPassword": bool(f.get("P"))},
            ["Only join networks you recognise",
             "A fake WiFi network can watch what you do online"],
        )

    if lower.startswith("upi://"):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(text).query)
        pick = lambda k: urllib.parse.unquote(q.get(k, [""])[0])  # noqa: E731
        return _result(
            "UPI Payment", "This QR code is a UPI payment request",
            {"payeeName": pick("pn"), "payeeAddress": pick("pa"),
             "amount": pick("am"), "currency": pick("cu")},
            ["Check the payee name and amount in your payment app before you pay",
             "You never need to enter your UPI PIN to receive money",
             "Scammers stick fake payment codes over real ones in shops and on posters"],
        )

    if upper.startswith("BEGIN:VCARD"):
        details: dict[str, Any] = {}
        for line in text.splitlines():
            key, _, value = line.strip().partition(":")
            key = key.upper().split(";")[0]
            if key == "FN":
                details["name"] = value
            elif key == "ORG":
                details["organization"] = value
            elif key == "TEL":
                details["phone"] = value
            elif key == "EMAIL":
                details["email"] = value
        return _result("Contact", "This QR code contains a contact card", details,
                       ["Check the details before saving this contact"])

    if lower.startswith("mailto:") or upper.startswith("MATMSG:"):
        if lower.startswith("mailto:"):
            parsed = urllib.parse.urlparse(text)
            q = urllib.parse.parse_qs(parsed.query)
            details = {"to": parsed.path, "subject": q.get("subject", [""])[0]}
        else:
            f = _fields(text[7:])
            details = {"to": f.get("TO", ""), "subject": f.get("SUB", "")}
        return _result("Email", "This QR code starts an email", details,
                       ["Check who the email is going to before you send it"])

    if upper.startswith(("SMSTO:", "SMS:")):
        number, _, message = text.split(":", 1)[1].partition(":")
        return _result("SMS", "This QR code starts a text message",
                       {"phoneNumber": number, "message": message},
                       ["Premium-rate numbers can charge you for a text. Check the number first"])

    if lower.startswith("tel:"):
        return _result("Phone", "This QR code starts a phone call", {"phoneNumber": text[4:]},
                       ["Check the number before you call it"])

    if lower.startswith("geo:"):
        coords = text[4:].split(",")
        return _result("Location", "This QR code points to a place on a map",
                       {"latitude": coords[0] if coords else "",
                        "longitude": coords[1] if len(coords) > 1 else ""},
                       ["Check the place is where you expect to go"])

    app = re.match(r"^([a-z][a-z0-9+.-]{1,30})://", text, re.I)
    if app:
        return _result(
            "App link", "This QR code opens an app on your phone",
            {"app": app.group(1).lower(), "text": text},
            ["Check that this is the app you expect before you open it",
             "Payment and banking apps are common targets for fake QR codes"],
        )

    return _result("Text", "This QR code contains plain text, not a web link",
                   {"text": text}, ["There is no website to check here"])
