"""BSC (and, optionally, Ethereum) history via NodeReal MegaNode (free plan, archive data). The API key lives in the
URL path, so every call is cached under a key-free URL. Free public BSC RPCs refuse eth_getLogs history (probed 11 Oct),
hence NodeReal. `network="eth-mainnet"` gives a second Ethereum source with its own rate limit (Etherscan's free limit
is per account, so extra Etherscan keys do not add speed)."""

from __future__ import annotations

import os
from typing import Any, Iterator

from counterledger import cache

URL_TEMPLATE = "https://{network}.nodereal.io/v1/<key>"
PUBLIC_URL = URL_TEMPLATE.format(network="bsc-mainnet")
MAX_SPAN = {"bsc-mainnet": 100_000, "eth-mainnet": 999}  # nr_getAssetTransfers block-range limits (seen 11 Oct)
MIN_GAP = 0.35


def _rpc(method: str, params: list, rid: int = 1, network: str = "bsc-mainnet") -> Any:
    public = URL_TEMPLATE.format(network=network)
    real = public.replace("<key>", os.environ.get("NODEREAL_API_KEY", ""))
    body = {"jsonrpc": "2.0", "id": rid, "method": method, "params": params}
    return cache.post_json(real, body, min_gap=MIN_GAP, ok=cache.rpc_ok, key_url=public)["result"]


def head(as_of: int) -> int:
    """Latest block, cached per `as_of` (an hour boundary) so replays see the same head."""
    return int(_rpc("eth_blockNumber", [], rid=as_of), 16)


def block_ts(n: int) -> int:
    return int(_rpc("eth_getBlockByNumber", [hex(n), False])["timestamp"], 16)


def block_at(ts: int, as_of: int) -> int:
    """Last block with timestamp <= ts (interpolation + bisection; every lookup is cached)."""
    lo, hi = 1, head(as_of)
    t_lo, t_hi = block_ts(lo), block_ts(hi)
    if ts >= t_hi:
        return hi
    while hi - lo > 1:
        guess = lo + int((ts - t_lo) * (hi - lo) / max(t_hi - t_lo, 1))
        mid = min(max(guess, lo + 1), hi - 1)
        t_mid = block_ts(mid)
        if t_mid <= ts:
            lo, t_lo = mid, t_mid
        else:
            hi, t_hi = mid, t_mid
        # keep interpolation from crawling: also bisect when the range is still wide
        if hi - lo > 2000:
            mid = (lo + hi) // 2
            t_mid = block_ts(mid)
            if t_mid <= ts:
                lo, t_lo = mid, t_mid
            else:
                hi, t_hi = mid, t_mid
    return lo


def transfers_from(address: str, b0: int, b1: int, category: str, contracts: list[str] | None = None,
                   network: str = "bsc-mainnet") -> Iterator[dict]:
    """All transfers sent FROM address in blocks [b0, b1], oldest first. category: "external" (native coin) or "20"."""
    cur = b0
    while cur <= b1:
        end = min(cur + MAX_SPAN[network], b1)
        page_key = None
        while True:
            q: dict[str, Any] = {"category": [category], "fromBlock": hex(cur), "toBlock": hex(end),
                                 "fromAddress": address, "order": "asc", "maxCount": "0x3e8"}
            if contracts:
                q["contractAddresses"] = contracts
            if page_key:
                q["pageKey"] = page_key
            r = _rpc("nr_getAssetTransfers", [q], network=network)
            yield from r.get("transfers") or []
            page_key = r.get("pageKey")
            if not page_key or not r.get("transfers"):
                break
        cur = end + 1
