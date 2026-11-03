"""Result cache and shared rate limits.

DynamoDB is used on AWS. A simple in-memory version is used for local work and
tests. Both offer the same three methods (get, put, acquire), so the rest of the
code does not care which one it is talking to.
"""
from __future__ import annotations

import json
import os
import time
from typing import Any, Callable, Optional


class MemoryStore:
    def __init__(self, now: Callable[[], float] = time.time):
        self._now = now
        self._items: dict[str, tuple[Any, float]] = {}
        self._counters: dict[str, tuple[int, int]] = {}

    def get(self, key: str) -> Optional[dict]:
        item = self._items.get(key)
        if not item:
            return None
        value, expires = item
        if expires <= self._now():
            del self._items[key]
            return None
        return value

    def put(self, key: str, value: dict, ttl_seconds: int) -> None:
        self._items[key] = (value, self._now() + ttl_seconds)

    def acquire(self, name: str, limit: int, window_seconds: int) -> bool:
        """Count one use of `name` in the current time window; False if the window is full."""
        window = int(self._now() // window_seconds)
        current_window, hits = self._counters.get(name, (window, 0))
        if current_window != window:
            hits = 0
        if hits >= limit:
            self._counters[name] = (window, hits)
            return False
        self._counters[name] = (window, hits + 1)
        return True


class DynamoStore:
    def __init__(self, table: Any, now: Callable[[], float] = time.time):
        self._table = table
        self._now = now

    def get(self, key: str) -> Optional[dict]:
        item = self._table.get_item(Key={"pk": f"scan#{key}"}).get("Item")
        # DynamoDB deletes expired items lazily, so expiry is checked here too.
        if not item or int(item.get("expiresAt", 0)) <= int(self._now()):
            return None
        try:
            return json.loads(item["data"])
        except (KeyError, ValueError):
            return None

    def put(self, key: str, value: dict, ttl_seconds: int) -> None:
        self._table.put_item(
            Item={"pk": f"scan#{key}", "data": json.dumps(value), "expiresAt": int(self._now() + ttl_seconds)}
        )

    def acquire(self, name: str, limit: int, window_seconds: int) -> bool:
        """Atomically count one use in the current window; False if the window is full."""
        from botocore.exceptions import ClientError

        window = int(self._now() // window_seconds)
        try:
            self._table.update_item(
                Key={"pk": f"rl#{name}#{window}"},
                UpdateExpression="ADD hits :one SET expiresAt = :exp",
                ConditionExpression="attribute_not_exists(hits) OR hits < :limit",
                ExpressionAttributeValues={
                    ":one": 1, ":limit": limit, ":exp": (window + 1) * window_seconds + 300,
                },
            )
            return True
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
                return False
            raise


def make_store():
    table_name = os.environ.get("TABLE_NAME", "").strip()
    if not table_name:
        return MemoryStore()
    import boto3

    return DynamoStore(boto3.resource("dynamodb").Table(table_name))
