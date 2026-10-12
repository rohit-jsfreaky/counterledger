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
import threading
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


_lock = threading.Lock()


_extra: dict[str, float] = {}  # host -> extra gap learned from 429s: grows on each 429, shrinks on each success


def _adapt(host: str, limited: bool) -> None:
    with _lock:
        e = _extra.get(host, 0.0)
        _extra[host] = min(e * 1.5 + 0.25, 5.0) if limited else max(e * 0.97 - 0.005, 0.0)


def _throttle(host: str, min_gap: float) -> None:
    """Space calls to one host by min_gap seconds, across threads (each thread reserves the next slot)."""
    with _lock:
        slot = max(time.monotonic(), _last_call.get(host, 0) + min_gap + _extra.get(host, 0.0))
        _last_call[host] = slot
    wait = slot - time.monotonic()
    if wait > 0:
        time.sleep(wait)


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
    key_url: str | None = None,
) -> Any:
    """key_url: the URL used for the cache key and the stored record when the real URL carries a secret."""
    shown = key_url or url
    key = request_key(method, shown, params, body) + ("-t" if text else "")
    path = _path(key)
    if path.exists():
        with gzip.open(path, "rt", encoding="utf-8") as f:
            return json.load(f)["response"]
    if _mode() == "replay":
        raise CacheMiss(f"replay mode, no cache for {method} {shown} {_scrub(params)}")

    host = httpx.URL(url).host  # throttle by real host
    data: Any = None
    attempt = limited = 0
    while attempt < 10:
        _throttle(host, min_gap)
        try:
            r = _client_get().request(method, url, params=params, json=body, headers=headers)
        except httpx.TransportError as e:  # timeouts, resets: retry
            data = repr(e)
            time.sleep(min(2**attempt, 60))
            attempt += 1
            continue
        if r.status_code == 429 and "monthly quota" in r.text:  # will not clear by waiting: fail now, loudly
            raise BadResponse(f"{method} {shown} -> quota used up: {r.text[:160]}")
        if r.status_code == 429 and limited < 1000:  # rate limit: slow this host down and wait it out (hours, not minutes)
            data = f"HTTP {r.status_code}: {r.text[:120]}"
            _adapt(host, True)
            time.sleep(min(2**limited, 30))
            limited += 1
            continue
        if r.status_code == 429 or r.status_code >= 500:  # server error: back off up to a minute
            data = f"HTTP {r.status_code}: {r.text[:120]}"
            time.sleep(min(2**attempt, 60))
            attempt += 1
            continue
        r.raise_for_status()
        _adapt(host, False)
        data = r.text if text else r.json()
        if ok is None or ok(data):
            break
        time.sleep(min(2**attempt, 60))  # API-level error (e.g. rate limit in a 200 body): retry, never cache it
        attempt += 1
    else:
        raise BadResponse(f"{method} {shown} {_scrub(params)} -> {str(data)[:200]}")

    path.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "request": {"method": method.upper(), "url": shown, "params": _scrub(params), "body": body},
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


def rpc_ok(d: Any) -> bool:
    """JSON-RPC: an answer with "error" is never cached."""
    return isinstance(d, dict) and "error" not in d and "result" in d


def post_json(
    url: str,
    body: Any,
    headers: dict | None = None,
    min_gap: float = 0.25,
    ok: Callable[[Any], bool] | None = None,
    key_url: str | None = None,
) -> Any:
    return _call("POST", url, None, body, headers, min_gap, ok=ok, key_url=key_url)


def forget(method: str, url: str, params: dict | None = None, body: Any = None, text: bool = False) -> None:
    _path(request_key(method, url, params, body) + ("-t" if text else "")).unlink(missing_ok=True)
