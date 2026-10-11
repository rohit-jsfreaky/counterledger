"""Read Counterledger accounts from Solana devnet (through the record/replay cache; one snapshot per hour)."""

from __future__ import annotations

import base64
import hashlib
import json
import struct
import time

from counterledger import cache
from counterledger.paths import DATA_DIR

DEVNET = "https://api.devnet.solana.com"


def devnet_state() -> dict:
    return json.loads((DATA_DIR / "devnet.json").read_text())


def account_data(address: str, as_of: int | None = None) -> tuple[bytes, int]:
    """Raw account bytes + slot. Cached per `as_of` hour so a replay reads the same snapshot."""
    hour = (as_of or int(time.time())) // 3600 * 3600
    body = {"jsonrpc": "2.0", "id": hour, "method": "getAccountInfo",
            "params": [address, {"encoding": "base64", "commitment": "confirmed"}]}
    r = cache.post_json(DEVNET, body, ok=cache.rpc_ok)["result"]
    if not r["value"]:
        raise LookupError(f"no account {address} on devnet")
    return base64.b64decode(r["value"]["data"][0]), r["context"]["slot"]


class _R:
    def __init__(self, b: bytes):
        self.b, self.i = b, 0

    def take(self, n: int) -> bytes:
        v = self.b[self.i : self.i + n]
        self.i += n
        return v

    def u8(self) -> int:
        return self.take(1)[0]

    def u16(self) -> int:
        return struct.unpack("<H", self.take(2))[0]

    def u32(self) -> int:
        return struct.unpack("<I", self.take(4))[0]

    def u64(self) -> int:
        return struct.unpack("<Q", self.take(8))[0]

    def i64(self) -> int:
        return struct.unpack("<q", self.take(8))[0]

    def string(self) -> str:
        return self.take(self.u32()).decode()


def _report(r: _R) -> dict:
    return {"value": r.u16(), "as_of": r.i64(), "evidence_hash": r.take(32).hex()}


def decode_exchange(data: bytes) -> dict:
    """Borsh layout of `state::Exchange` (after the 8-byte discriminator)."""
    r = _R(data[8:])
    out = {"id": r.string(), "name": r.string()}
    out["provider_hashes"] = [r.take(32).hex() for _ in range(r.u32())]
    out["prover_count"] = r.u32()
    floors = []
    for _ in range(r.u32()):
        asset = r.take(12).rstrip(b"\0").decode()
        floors.append({"asset": asset, "amount": r.u64(), "provers": r.u32()})
    out["floors"] = floors
    out["heartbeat"] = _report(r)
    out["score"] = _report(r)
    return out


def exchange_snapshot(exchange_id: str, as_of: int | None = None) -> dict:
    st = devnet_state()
    addr = st["exchanges"][exchange_id]["address"]
    data, slot = account_data(addr, as_of)
    return {"address": addr, "slot": slot, "data_sha256": hashlib.sha256(data).hexdigest(), **decode_exchange(data)}
