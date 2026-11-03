"""Configuration and secrets.

The VirusTotal key comes from the VIRUSTOTAL_API_KEY environment variable
(local work) or from AWS Systems Manager Parameter Store (on AWS). It is never
written into code, logs or responses.
"""
from __future__ import annotations

import os
from typing import Optional

_cached_key: Optional[str] = None


class ConfigError(Exception):
    pass


def get_vt_key() -> str:
    global _cached_key
    if _cached_key:
        return _cached_key
    key = os.environ.get("VIRUSTOTAL_API_KEY", "").strip()
    if not key:
        parameter = os.environ.get("VT_API_KEY_PARAM", "").strip()
        if parameter:
            try:
                import boto3

                response = boto3.client("ssm").get_parameter(Name=parameter, WithDecryption=True)
                key = response["Parameter"]["Value"].strip()
            except Exception as exc:  # noqa: BLE001
                raise ConfigError("Could not read the VirusTotal key from Parameter Store") from exc
    if not key:
        raise ConfigError("VirusTotal API key is not configured")
    _cached_key = key
    return key
