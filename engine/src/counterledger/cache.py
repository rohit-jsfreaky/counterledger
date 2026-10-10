"""Record once, replay free (CLAUDE.md invariant 5).

Every external HTTP call goes through `get_json` / `post_json`. The cache key is a hash of the request with secrets
removed, so replay mode needs no keys and no network. Mode comes from CL_MODE: "record" (default: use cache, fetch on
miss) or "replay" (cache only; a miss is an error).
"""

from __future__ import annotations

import gzip
import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any, Callable

import httpx

from counterledger.paths import CACHE_DIR

# query/header names whose values never enter the key, the stored file, or logs
SECRET_NAMES = {"apikey", "api_key", "api-key", "key", "token", "tron-pro-api-key", "x-api-key", "authorization"}

_client: httpx.Client | None = None
_last_call: dict[str, float] = {}


class CacheMiss(RuntimeError):
    pass


def _mode() -> str:
    return os.environ.get("CL_MODE", "record")


def _scrub(d: dict[str, Any] | None) -> dict[str, Any]:
    return {k: v for k, v in sorted((d or {}).items()) if k.lower() not in SECRET_NAMES}


def request_key(method: str, url: str, params: dict | None, body: Any) -> str:
    canon = json.dumps(
        {"m": method.upper(), "u": url, "p": _scrub(params), "b": body}, sort_keys=True, separators=(",", ":")
    )
    return hashlib.sha256(canon.encode()).hexdigest()


def _path(key: str) -> Path:
    return CACHE_DIR / "http" / key[:2] / f"{key}.json.gz"


def _client_get() -> httpx.Client:
    global _client
    if _client is None:
        _client = httpx.Client(timeout=60, headers={"User-Agent": "counterledger-observer/0.1"}, follow_redirects=True)
    return _client


def _throttle(host: str, min_gap: float) -> None:
    wait = _last_call.get(host, 0) + min_gap - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    _last_call[host] = time.monotonic()


class BadResponse(RuntimeError):
    pass


def _call(
    method: str,
    url: str,
    params: dict | None,
    body: Any,
    headers: dict | None,
    min_gap: float,
    text: bool = False,
    ok: Callable[[Any], bool] | None = None,
) -> Any:
    key = request_key(method, url, params, body) + ("-t" if text else "")
    path = _path(key)
    if path.exists():
        with gzip.open(path, "rt", encoding="utf-8") as f:
            return json.load(f)["response"]
    if _mode() == "replay":
        raise CacheMiss(f"replay mode, no cache for {method} {url} {_scrub(params)}")

    host = httpx.URL(url).host
    data: Any = None
    for attempt in range(6):
        _throttle(host, min_gap)
        try:
            r = _client_get().request(method, url, params=params, json=body, headers=headers)
        except httpx.TransportError as e:  # timeouts, resets: retry
            data = repr(e)
            time.sleep(2**attempt)
            continue
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(2**attempt)
            continue
        r.raise_for_status()
        data = r.text if text else r.json()
        if ok is None or ok(data):
            break
        time.sleep(2**attempt)  # API-level error (e.g. rate limit in a 200 body): retry, never cache it
    else:
        raise BadResponse(f"{method} {url} {_scrub(params)} -> {str(data)[:200]}")

    path.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "request": {"method": method.upper(), "url": url, "params": _scrub(params), "body": body},
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "response": data,
    }
    with gzip.open(path, "wt", encoding="utf-8") as f:
        json.dump(record, f, separators=(",", ":"))
    return data


def get_json(
    url: str,
    params: dict | None = None,
    headers: dict | None = None,
    min_gap: float = 0.25,
    ok: Callable[[Any], bool] | None = None,
) -> Any:
    return _call("GET", url, params, None, headers, min_gap, ok=ok)


def get_text(url: str, params: dict | None = None, headers: dict | None = None, min_gap: float = 0.25) -> str:
    return _call("GET", url, params, None, headers, min_gap, text=True)


def post_json(url: str, body: Any, headers: dict | None = None, min_gap: float = 0.25) -> Any:
    return _call("POST", url, None, body, headers, min_gap)
