"""TronGrid v1 client (free Basic plan: 100,000 requests/day). Every call goes through the record/replay cache."""

from __future__ import annotations

import os
from typing import Any, Iterator

from counterledger import cache

URL = "https://api.trongrid.io/v1/accounts/{address}/transactions/trc20"
USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
PAGE = 200
MIN_GAP = 0.25  # two backfills can share the key; stay well under TronGrid limits


def _ok(d: Any) -> bool:
    return isinstance(d, dict) and d.get("success") is True and isinstance(d.get("data"), list)


def trc20_out(address: str, start_ms: int, end_ms: int, contract: str = USDT) -> Iterator[dict]:
    """TRC-20 transfers sent FROM address in [start_ms, end_ms), oldest first, all pages."""
    fingerprint = None
    while True:
        params = {"only_from": "true", "limit": PAGE, "min_timestamp": start_ms, "max_timestamp": end_ms - 1,
                  "contract_address": contract, "order_by": "block_timestamp,asc"}
        if fingerprint:
            params["fingerprint"] = fingerprint
        d = cache.get_json(URL.format(address=address), params,
                           headers={"TRON-PRO-API-KEY": os.environ.get("TRONGRID_API_KEY", "")}, min_gap=MIN_GAP, ok=_ok)
        yield from d["data"]
        fingerprint = (d.get("meta") or {}).get("fingerprint")
        if not fingerprint or not d["data"]:
            return
