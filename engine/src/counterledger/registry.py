"""Exchange address registry: every wallet on Ethereum / BSC / Tron with the URL it came from.
Writes data/registry/<exchange>.json. Unknown = not listed (invariant 1: no address without a source)."""

from __future__ import annotations

import json
import re

from counterledger import cache
from counterledger.paths import DATA_DIR

LLAMA_SHA = "6656782872a773a13a7f250c835a2737d339c325"
RAW = f"https://raw.githubusercontent.com/DefiLlama/DefiLlama-Adapters/{LLAMA_SHA}/"
BLOB = f"https://github.com/DefiLlama/DefiLlama-Adapters/blob/{LLAMA_SHA}/"
CHAINS = ("ethereum", "bsc", "tron")
ADAPTERS = {"okx": "projects/okex/index.js", "kucoin": "projects/kucoin/index.js",
            "bitget": "projects/bitget/index.js", "coindcx": "cex/coindcx.js"}
BINANCE_API = "https://www.binance.com/bapi/apex/v1/public/apex/market/por/address"
BYBIT_CSV = "https://api2.bybit.com/common-static/por/bybit_por_{ym}.csv"
BYBIT_MONTH = "202609"

EVM = re.compile(r"0x[a-fA-F0-9]{40}")
TRON = re.compile(r"T[1-9A-HJ-NP-Za-km-z]{33}")


def _array_after(src: str, start: int) -> str:
    """Text of the [...] array that opens at or after `start` (bracket-balanced)."""
    i = src.index("[", start)
    depth = 0
    for j in range(i, len(src)):
        depth += src[j] == "["
        depth -= src[j] == "]"
        if depth == 0:
            return src[i : j + 1]
    return src[i:]


def _strip_comments(s: str) -> str:
    return re.sub(r"//[^\n]*", "", re.sub(r"/\*.*?\*/", "", s, flags=re.S))


def parse_adapter(src: str) -> dict[str, list[str]]:
    src = _strip_comments(src)
    out: dict[str, set[str]] = {c: set() for c in CHAINS}
    consts = {m.group(1): _array_after(src, m.end() - 1) for m in re.finditer(r"const (\w+)\s*=\s*\[", src)}
    for m in re.finditer(r"\b(ethereum|bsc|tron)\s*:\s*\{\s*owners\s*:\s*(\[|\w+)", src):
        chain, ref = m.group(1), m.group(2)
        body = _array_after(src, m.end() - 1) if ref == "[" else consts.get(ref, "")
        out[chain] |= set(EVM.findall(body) if chain != "tron" else TRON.findall(body))
    if "evmChains" in consts:  # e.g. bitget: evmOwners applied to every chain in evmChains
        for chain in re.findall(r"['\"](\w+)['\"]", consts["evmChains"]):
            if chain in ("ethereum", "bsc"):
                out[chain] |= set(EVM.findall(consts.get("evmOwners", "")))
    return {c: sorted(a.lower() if c != "tron" else a for a in v) for c, v in out.items()}


def binance() -> dict:
    rows = cache.get_json(BINANCE_API)["data"]
    net = {"ETH": "ethereum", "BSC": "bsc", "BEP20": "bsc", "TRX": "tron", "TRON": "tron"}
    out: dict[str, set[str]] = {c: set() for c in CHAINS}
    for r in rows:
        c = net.get(str(r.get("network", "")).upper())
        if c:
            out[c].add(r["address"].lower() if c != "tron" else r["address"])
    return {"chains": {c: sorted(v) for c, v in out.items()}, "source": BINANCE_API, "kind": "exchange's own PoR list"}


def bybit() -> dict:
    csv = cache.get_text(BYBIT_CSV.format(ym=BYBIT_MONTH))
    net = {"ethereum": "ethereum", "bsc": "bsc", "trx": "tron", "tron": "tron"}
    out: dict[str, set[str]] = {c: set() for c in CHAINS}
    for line in csv.strip().splitlines()[1:]:
        parts = line.split(",")
        if len(parts) < 4 or "(ALL)" in parts[0] or "-" not in parts[0]:
            continue
        c = net.get(parts[0].rsplit("-", 1)[1].lower())
        if c:
            for a in " ".join(parts[3:]).split():
                if (c == "tron" and TRON.fullmatch(a)) or (c != "tron" and EVM.fullmatch(a)):
                    out[c].add(a.lower() if c != "tron" else a)
    return {"chains": {c: sorted(v) for c, v in out.items()}, "source": BYBIT_CSV.format(ym=BYBIT_MONTH),
            "kind": "exchange's own monthly PoR CSV"}


def adapter(key: str) -> dict:
    path = ADAPTERS[key]
    return {"chains": parse_adapter(cache.get_text(RAW + path)), "source": BLOB + path, "kind": "DefiLlama adapter"}


def build() -> dict[str, dict]:
    reg = {"binance": binance(), "bybit": bybit(), **{k: adapter(k) for k in ADAPTERS}}
    d = DATA_DIR / "registry"
    d.mkdir(parents=True, exist_ok=True)
    for k, v in reg.items():
        (d / f"{k}.json").write_text(json.dumps({"exchange": k, **v}, indent=1))
    return reg


def main() -> None:
    for k, v in build().items():
        print(f"{k:<8} " + "  ".join(f"{c}={len(v['chains'][c])}" for c in CHAINS) + f"  ({v['kind']})")


if __name__ == "__main__":
    main()
