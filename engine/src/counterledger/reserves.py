"""Reserves per asset per exchange, from DefiLlama's CEX balances (computed from each exchange's sourced addresses).
Writes evidence/reserves/<exchange>.json. Every number carries the API URL it came from and the address source.
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone

from counterledger import cache
from counterledger.paths import EVIDENCE_DIR

LLAMA_SHA = "6656782872a773a13a7f250c835a2737d339c325"
ADAPTER = "https://github.com/DefiLlama/DefiLlama-Adapters/blob/" + LLAMA_SHA + "/"

EXCHANGES = {
    "binance": {"name": "Binance", "slug": "binance-cex", "addresses": ADAPTER + "projects/binance/index.js",
                "upstream": "https://www.binance.com/bapi/apex/v1/public/apex/market/por/address (Binance's own list)"},
    "okx": {"name": "OKX", "slug": "okx", "addresses": ADAPTER + "projects/okex/index.js"},
    "bybit": {"name": "Bybit", "slug": "bybit", "addresses": ADAPTER + "cex/bybit.js",
              "upstream": "https://api2.bybit.com/common-static/por/ (Bybit's own monthly PoR CSV)"},
    "bitget": {"name": "Bitget", "slug": "bitget", "addresses": ADAPTER + "projects/bitget/index.js"},
    "kucoin": {"name": "KuCoin", "slug": "kucoin", "addresses": ADAPTER + "projects/kucoin/index.js"},
    "coindcx": {"name": "CoinDCX", "slug": "coindcx", "addresses": ADAPTER + "cex/coindcx.js"},
}
# exchanges on the board with no current sourced address list: shown as "—" with the reason
UNTRACKED = {
    "wazirx": {"name": "WazirX", "reason": "no current published address list (its 2023 PoR page on CoinGabbar is gone)"},
}

# chain keys that are aggregates/variants, not separate chains
SKIP_CHAIN_KEYS = ("-", "staking", "pool2", "borrowed", "offers", "vesting", "treasury")


def reserves_for(key: str) -> dict:
    meta = EXCHANGES[key]
    url = f"https://api.llama.fi/protocol/{meta['slug']}"
    p = cache.get_json(url)
    by_asset_usd: dict[str, float] = defaultdict(float)
    by_asset_amt: dict[str, float] = defaultdict(float)
    chains: dict[str, float] = {}
    as_of = None
    for chain, d in p["chainTvls"].items():
        if any(s in chain.lower() for s in SKIP_CHAIN_KEYS) or not d.get("tokensInUsd"):
            continue
        usd, amt = d["tokensInUsd"][-1], d["tokens"][-1]
        as_of = max(as_of or 0, usd["date"])
        chains[chain] = round(sum(usd["tokens"].values()), 2)
        for sym, v in usd["tokens"].items():
            by_asset_usd[sym] += v
        for sym, v in amt["tokens"].items():
            by_asset_amt[sym] += v
    assets = sorted(
        ({"asset": s, "usd": round(v, 2), "amount": by_asset_amt.get(s)} for s, v in by_asset_usd.items() if v > 0),
        key=lambda a: -a["usd"],
    )
    return {
        "kind": "reserves",
        "exchange": key,
        "name": meta["name"],
        "as_of": datetime.fromtimestamp(as_of, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if as_of else None,
        "total_usd": round(sum(a["usd"] for a in assets), 2),
        "chains_usd": dict(sorted(chains.items(), key=lambda x: -x[1])),
        "assets": assets,
        "source": {"balances": url, "addresses": meta["addresses"], "upstream": meta.get("upstream")},
        "note": "Reserves only. They say nothing about what the exchange owes its users.",
    }


def main() -> None:
    out = EVIDENCE_DIR / "reserves"
    out.mkdir(parents=True, exist_ok=True)
    summary = {}
    for key in EXCHANGES:
        r = reserves_for(key)
        (out / f"{key}.json").write_text(json.dumps(r, indent=1))
        summary[key] = {"name": r["name"], "total_usd": r["total_usd"], "as_of": r["as_of"], "assets": len(r["assets"]),
                        "top": [a["asset"] for a in r["assets"][:5]]}
        print(f"{r['name']:<8} ${r['total_usd'] / 1e9:8.2f}B  assets={len(r['assets']):>4}  as_of={r['as_of']}  top={summary[key]['top']}")
    for key, u in UNTRACKED.items():
        summary[key] = {"name": u["name"], "total_usd": None, "reason": u["reason"]}
    (out / "summary.json").write_text(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
