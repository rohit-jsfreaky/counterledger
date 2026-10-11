"""Live withdrawal heartbeat for every exchange on the board (rules: data/heartbeat-live-params.json).

Stateful and incremental: each run fetches only new blocks/time since the last run per address, adds the outflows to
data/live/<exchange>/hourly.csv (committed, small) and writes evidence/heartbeat/<exchange>.json with the state.
The full outflow rows go to data/live/<exchange>/outflows.csv (local, gitignored).
"""

from __future__ import annotations

import csv
import json
import os
import sys
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from counterledger import bsc, etherscan, tron
from counterledger.backtest_data import own_labels
from counterledger.heartbeat import DAY_H, H, canonical_hash, hour_state, iso, sha256_file
from counterledger.paths import DATA_DIR, EVIDENCE_DIR

EXCHANGES = ["coindcx", "kucoin", "bitget", "bybit", "okx", "binance"]
NAMES = {"coindcx": "CoinDCX", "kucoin": "KuCoin", "bitget": "Bitget", "bybit": "Bybit", "okx": "OKX", "binance": "Binance"}
LABEL_KEYS = {"okx": ["okx", "okex"]}
CHAINS = ["ethereum", "tron", "bsc"]
WINDOW_DAYS = 29
THREADS = 4


def _params() -> tuple[dict, dict]:
    return (json.loads((DATA_DIR / "heartbeat-params.json").read_text()),
            json.loads((DATA_DIR / "heartbeat-live-params.json").read_text()))


def _eth_rows(addr: str, own: set[str], token_sym: dict[str, str], b0: int, b1: int, t1: int) -> list[dict]:
    out = []
    for r in etherscan.normal_txs(addr, b0, b1):
        if (r["from"].lower() == addr and int(r["value"]) > 0 and r.get("isError") == "0" and r["to"]
                and r["to"].lower() not in own and int(r["timeStamp"]) < t1):
            out.append({"chain": "ethereum", "ts": int(r["timeStamp"]), "hash": r["hash"], "asset": "ETH",
                        "from": addr, "to": r["to"].lower(), "value": r["value"]})
    for r in etherscan.token_transfers(addr, b0, b1):
        sym = token_sym.get(r["contractAddress"].lower())
        if (sym and r["from"].lower() == addr and r["to"].lower() not in own and int(r["value"]) > 0
                and int(r["timeStamp"]) < t1):
            out.append({"chain": "ethereum", "ts": int(r["timeStamp"]), "hash": r["hash"], "asset": sym,
                        "from": addr, "to": r["to"].lower(), "value": r["value"]})
    return out


def _bsc_rows(addr: str, own: set[str], tokens: list[str], b0: int, b1: int, t1: int,
              network: str = "bsc-mainnet", chain: str = "bsc", native: str = "BNB") -> list[dict]:
    """NodeReal nr_getAssetTransfers rows → outflows. Also used for Ethereum when CL_ETH_SOURCE=nodereal: same signal
    as the Etherscan path (native value > 0 + allow-listed tokens, successful, to outside the own set)."""
    out = []
    for cat, contracts in (("external", None), ("20", tokens)):
        for r in bsc.transfers_from(addr, b0, b1, cat, contracts, network=network):
            ts = int(r.get("blockTimeStamp") or r.get("blockTimestamp") or 0)
            to = (r.get("to") or "").lower()
            if (not to or to in own or ts >= t1 or int(r.get("value") or "0x0", 16) == 0
                    or str(r.get("receiptsStatus", 1)) == "0"):
                continue
            out.append({"chain": chain, "ts": ts, "hash": r["hash"], "asset": r.get("asset") or native,
                        "from": addr, "to": to, "value": str(int(r["value"], 16))})
    return out


def _tron_rows(addr: str, own: set[str], t0: int, t1: int) -> list[dict]:
    return [{"chain": "tron", "ts": r["block_timestamp"] // 1000, "hash": r["transaction_id"], "asset": "USDT",
             "from": addr, "to": r["to"], "value": r["value"]}
            for r in tron.trc20_out(addr, t0 * 1000, t1 * 1000) if r["to"] not in own and int(r["value"]) > 0]


def update(ex: str, now: int | None = None) -> dict:
    hp, lp = _params()
    reg = json.loads((DATA_DIR / "registry" / f"{ex}.json").read_text())
    d = DATA_DIR / "live" / ex
    d.mkdir(parents=True, exist_ok=True)
    state_p = d / "state.json"
    state = json.loads(state_p.read_text()) if state_p.exists() else {}
    for c in CHAINS:
        state.setdefault(c, {})

    # Resume pin: a run that was stopped keeps its end hour, so a restart sends the same requests and reads them all
    # back from the cache instead of downloading again. Cleared when the run finishes.
    if "pending_t1" in state:
        t1 = state["pending_t1"]
    else:
        t1 = ((now or int(time.time())) // H) * H  # last full hour boundary
        state["pending_t1"] = t1
        state_p.write_text(json.dumps(state, indent=1))
    t0 = t1 - WINDOW_DAYS * 86400
    hot_eth = reg["chains"]["ethereum"]
    hot_tron = reg["chains"]["tron"]
    hot_bsc = reg["chains"]["bsc"]
    own_eth = set(hot_eth) | set(reg["chains"]["bsc"])
    for k in LABEL_KEYS.get(ex, [ex]):
        own_eth |= set(own_labels(k))
    own_tron = set(hot_tron)
    token_sym = {v.lower(): k for k, v in hp["tokens"].items()}

    b0_default = etherscan.block_at(datetime.fromtimestamp(t0, timezone.utc))
    b1 = etherscan.block_at(datetime.fromtimestamp(t1, timezone.utc))
    bsc_tokens = list(lp["bsc_tokens"].values())
    if hot_bsc:
        bb0_default, bb1 = bsc.block_at(t0, t1), bsc.block_at(t1, t1)

    eth_via_nodereal = os.environ.get("CL_ETH_SOURCE") == "nodereal"
    eth_tokens = [v.lower() for v in hp["tokens"].values()]

    def eth_job(a: str) -> list[dict]:
        start = state["ethereum"].get(a, b0_default - 1) + 1
        if start > b1:
            return []
        if eth_via_nodereal:
            return _bsc_rows(a, own_eth, eth_tokens, start, b1, t1, network="eth-mainnet", chain="ethereum", native="ETH")
        return _eth_rows(a, own_eth, token_sym, start, b1, t1)

    def bsc_job(a: str) -> list[dict]:
        start = state["bsc"].get(a, bb0_default - 1) + 1
        return _bsc_rows(a, own_eth, bsc_tokens, start, bb1, t1) if start <= bb1 else []

    def tron_job(a: str) -> list[dict]:
        start = max(state["tron"].get(a, t0), t0)
        return _tron_rows(a, own_tron, start, t1) if start < t1 else []

    rows: list[dict] = []
    with ThreadPoolExecutor(THREADS) as pool:
        for a, got in zip(hot_eth, pool.map(eth_job, hot_eth)):
            rows += got
            state["ethereum"][a] = b1
        for a, got in zip(hot_tron, pool.map(tron_job, hot_tron)):
            rows += got
            state["tron"][a] = t1
        for a, got in zip(hot_bsc, pool.map(bsc_job, hot_bsc)):
            rows += got
            state["bsc"][a] = bb1

    # merge hourly counts (committed) and append rows (local)
    hourly_p = d / "hourly.csv"
    counts: dict[str, Counter] = defaultdict(Counter)
    if hourly_p.exists():
        for r in csv.DictReader(hourly_p.open(encoding="utf-8")):
            h = int(datetime.fromisoformat(r["hour_utc"].replace("Z", "+00:00")).timestamp()) // H
            for c in CHAINS:
                counts[c][h] += int(r.get(c) or 0)
    for r in rows:
        counts[r["chain"]][r["ts"] // H] += 1
    first_h, last_h = t0 // H, t1 // H - 1
    with hourly_p.open("w", newline="\n", encoding="utf-8") as f:
        f.write("hour_utc," + ",".join(CHAINS) + "\n")
        hours = sorted({h for c in CHAINS for h in counts[c]} | set(range(first_h, last_h + 1)))
        for h in hours:
            if h > last_h:
                continue
            f.write(iso(h * H) + "," + ",".join(str(counts[c].get(h, 0)) for c in CHAINS) + "\n")
    with (d / "outflows.csv").open("a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["chain", "ts", "hash", "asset", "from", "to", "value"])
        if f.tell() == 0:
            w.writeheader()
        w.writerows(sorted(rows, key=lambda r: (r["ts"], r["hash"])))
    state["updated_to"] = iso(t1)
    state.pop("pending_t1", None)
    state_p.write_text(json.dumps(state, indent=1))

    doc = status(ex, hp)
    out = EVIDENCE_DIR / "heartbeat"
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{ex}.json").write_text(json.dumps(doc, indent=1))
    return doc


def load_hourly(ex: str) -> dict[str, Counter]:
    counts: dict[str, Counter] = defaultdict(Counter)
    for r in csv.DictReader((DATA_DIR / "live" / ex / "hourly.csv").open(encoding="utf-8")):
        h = int(datetime.fromisoformat(r["hour_utc"].replace("Z", "+00:00")).timestamp()) // H
        for c in CHAINS:
            counts[c][h] = int(r.get(c) or 0)
    return counts


def status(ex: str, hp: dict | None = None) -> dict:
    hp = hp or _params()[0]
    by_chain = load_hourly(ex)
    total: Counter = Counter()
    for c in CHAINS:
        total.update(by_chain[c])
    last_h = max(total) if total else 0
    K, N = hp["K"], hp["N"]
    run = 0
    for h in range(last_h - N + 1, last_h + 1):
        run = run + 1 if hour_state(total, h, K, 28, 4)["stall"] else 0
    now_state = hour_state(total, last_h, K, 28, 4)
    if now_state["median"] < 4:
        state = "not_enough_data"
    elif run >= N:
        state = "below_usual_pattern"
    else:
        state = "normal"
    series = [{"t": iso(h * H), "count": total.get(h, 0), "median": hour_state(total, h, K, 28, 4)["median"],
               "by_chain": {c: by_chain[c].get(h, 0) for c in CHAINS}} for h in range(last_h - 71, last_h + 1)]
    doc = {
        "kind": "live-heartbeat",
        "exchange": ex,
        "name": NAMES[ex],
        "as_of": iso((last_h + 1) * H),
        "state": state,
        "last_hour": {"count": now_state["count"], "baseline_median": now_state["median"]},
        "last_24h_by_chain": {c: sum(by_chain[c].get(h, 0) for h in range(last_h - 23, last_h + 1)) for c in CHAINS},
        "series_72h": series,
        "hourly_file": f"data/live/{ex}/hourly.csv",
        "hourly_sha256": sha256_file(DATA_DIR / "live" / ex / "hourly.csv"),
        "rules": ["data/heartbeat-params.json", "data/heartbeat-live-params.json"],
        "addresses": f"data/registry/{ex}.json",
    }
    doc["evidence_sha256"] = canonical_hash(doc)
    return doc


def _keep_awake() -> None:
    """Long backfills run unattended: ask Windows not to idle-sleep while this process lives (cleared on exit)."""
    if sys.platform == "win32":
        import ctypes

        ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000001)  # ES_CONTINUOUS | ES_SYSTEM_REQUIRED


def main() -> None:
    _keep_awake()
    want = sys.argv[1:] or EXCHANGES
    for ex in want:
        t = time.time()
        doc = update(ex)
        print(f"{doc['name']:<8} state={doc['state']:<20} last_hour={doc['last_hour']} 24h={doc['last_24h_by_chain']} "
              f"({time.time() - t:.0f}s)", flush=True)


if __name__ == "__main__":
    main()
