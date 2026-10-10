"""Etherscan V2 client (free plan: Ethereum/Polygon/Arbitrum). Every call goes through the record/replay cache."""

from __future__ import annotations

import os
from datetime import datetime
from typing import Any, Iterator

from counterledger import cache

URL = "https://api.etherscan.io/v2/api"
PAGE = 10000
MIN_GAP = 0.22  # free plan: 5 calls/second


def _ok(d: Any) -> bool:
    if not isinstance(d, dict):
        return False
    if d.get("status") == "1":
        return True
    # "No transactions found" is a real empty answer; anything else (rate limit, bad key) is an error
    return "no transactions found" in str(d.get("message", "")).lower() or "no records found" in str(d.get("result", "")).lower()


def _get(chainid: int, **params: Any) -> Any:
    p = {"chainid": chainid, **params, "apikey": os.environ.get("ETHERSCAN_API_KEY", "")}
    return cache.get_json(URL, p, min_gap=MIN_GAP, ok=_ok)["result"]


def block_at(ts: datetime, chainid: int = 1, closest: str = "before") -> int:
    r = _get(chainid, module="block", action="getblocknobytime", timestamp=int(ts.timestamp()), closest=closest)
    return int(r)


def _walk(chainid: int, action: str, address: str, start: int, end: int) -> Iterator[dict]:
    """All rows for address in [start, end], ascending. Pages by moving startblock, so no page*offset limit applies."""
    # The server caps rows per call (1,000 on the free plan, whatever `offset` says), so never trust a short page:
    # keep moving startblock to the last block seen until a call brings nothing new.
    seen: set[tuple] = set()
    cur = start
    while True:
        rows = _get(chainid, module="account", action=action, address=address, startblock=cur, endblock=end,
                    page=1, offset=PAGE, sort="asc")
        if not isinstance(rows, list) or not rows:
            return
        new = 0
        for r in rows:
            k = (r["hash"], r.get("logIndex", ""), r.get("contractAddress", ""), r.get("from"), r.get("to"), r.get("value"))
            if k not in seen:
                seen.add(k)
                new += 1
                yield r
        last = int(rows[-1]["blockNumber"])
        if new == 0 or last >= end:
            return
        if last == cur:
            # one block fills a whole capped page: read just that block page by page, then step past it
            page = 2
            while True:
                more = _get(chainid, module="account", action=action, address=address, startblock=cur, endblock=cur,
                            page=page, offset=len(rows), sort="asc")
                if not isinstance(more, list) or not more:
                    break
                for r in more:
                    k = (r["hash"], r.get("logIndex", ""), r.get("contractAddress", ""), r.get("from"), r.get("to"), r.get("value"))
                    if k not in seen:
                        seen.add(k)
                        yield r
                if len(more) < len(rows):
                    break
                page += 1
            cur = last + 1
            continue
        cur = last  # re-read the last block; duplicates are dropped by `seen`


def normal_txs(address: str, start: int, end: int, chainid: int = 1) -> Iterator[dict]:
    return _walk(chainid, "txlist", address, start, end)


def token_transfers(address: str, start: int, end: int, chainid: int = 1) -> Iterator[dict]:
    return _walk(chainid, "tokentx", address, start, end)
