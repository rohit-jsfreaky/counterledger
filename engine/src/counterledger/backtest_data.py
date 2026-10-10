"""Fetch hot-wallet history for each backtest event and write the derived outflow list to data/raw/<event>/.

Outflow = a native ETH transfer (value > 0, not failed) or an allow-listed ERC-20 transfer FROM the hot set TO an
address outside the own set. Rules live in data/events.json (hot_set_rule) and data/heartbeat-params.json.
"""

from __future__ import annotations

import csv
import gzip
import hashlib
import io
import json
from datetime import datetime, timedelta, timezone

from counterledger import cache, etherscan
from counterledger.paths import DATA_DIR

ETH_LABELS = "https://raw.githubusercontent.com/dawsbot/eth-labels/d9b21aefeded56f7fce7208d6fa173d128526c1b/data/csv/accounts.csv"
FTX_LABELS = "https://raw.githubusercontent.com/brianleect/etherscan-labels/923aba72c7e2d0682f7ae6194b6140bd90668dc9/data/etherscan/accounts/ftx.json"

# data range per event: earliest control (ends T-63d, 7 days long) needs a 28-day baseline before it
DAYS_BEFORE = 63 + 7 + 28 + 1
DAYS_AFTER = 2
TAIL_DAYS = 7


def parse_ts(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def load_events() -> dict:
    return json.loads((DATA_DIR / "events.json").read_text())


def own_labels(exchange: str) -> dict[str, str]:
    rows = csv.DictReader(io.StringIO(cache.get_text(ETH_LABELS)))
    out: dict[str, str] = {}
    for r in rows:
        label, tag = r["label"].lower(), r["nameTag"]
        if "exploit" in label:
            continue  # attacker addresses are not the exchange's own
        if label == exchange or tag.lower().startswith(exchange):
            out[r["address"].lower()] = tag
    if exchange == "ftx":
        for a, tag in json.loads(cache.get_text(FTX_LABELS)).items():
            out[a.lower()] = tag
    return out


def fetch_event(ev: dict, tokens: dict[str, str]) -> tuple[list[dict], dict]:
    T = parse_ts(ev["T"])
    start = etherscan.block_at(T - timedelta(days=DAYS_BEFORE))
    end = etherscan.block_at(T + timedelta(days=DAYS_AFTER))
    # tail for the cover replay (data/cover-params.json data_range_after_T_days); a separate range so the
    # main range stays one cached walk
    end_tail = etherscan.block_at(T + timedelta(days=TAIL_DAYS))
    hot = {a.lower() for a in ev["hot_wallets_eth"]}
    own = hot | set(own_labels(ev["own_labels_key"]))
    token_sym = {v.lower(): k for k, v in tokens.items()}

    seen: set[tuple] = set()
    rows: list[dict] = []

    def add(r: dict, asset: str, addr: str) -> None:
        row = {"ts": int(r["timeStamp"]), "block": int(r["blockNumber"]), "hash": r["hash"],
               "asset": asset, "from": addr, "to": r["to"].lower(), "value": r["value"]}
        k = (row["hash"], r.get("logIndex", ""), asset, row["to"], row["value"])
        if k not in seen:
            seen.add(k)
            rows.append(row)

    for i, addr in enumerate(sorted(hot), 1):
        n0 = len(rows)
        for s, e in ((start, end), (end, end_tail)):
            for r in etherscan.normal_txs(addr, s, e):
                if r["from"].lower() == addr and int(r["value"]) > 0 and r.get("isError") == "0" and r["to"]:
                    if r["to"].lower() not in own:
                        add(r, "ETH", addr)
            for r in etherscan.token_transfers(addr, s, e):
                sym = token_sym.get(r["contractAddress"].lower())
                if sym and r["from"].lower() == addr and r["to"].lower() not in own and int(r["value"]) > 0:
                    add(r, sym, addr)
        print(f"  [{i}/{len(hot)}] {addr} outflows={len(rows) - n0}", flush=True)
    rows.sort(key=lambda r: (r["ts"], r["hash"], r["asset"]))
    return rows, {"start_block": start, "end_block": end, "tail_end_block": end_tail, "hot": len(hot), "own": len(own)}


def write_raw(ev_id: str, rows: list[dict], meta: dict) -> None:
    d = DATA_DIR / "raw" / ev_id
    d.mkdir(parents=True, exist_ok=True)
    with gzip.open(d / "outflows.csv.gz", "wt", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["ts", "block", "hash", "asset", "from", "to", "value"])
        w.writeheader()
        w.writerows(rows)
    meta = {**meta, "rows": len(rows), "written_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "outflows_sha256": hashlib.sha256((d / "outflows.csv.gz").read_bytes()).hexdigest()}
    (d / "meta.json").write_text(json.dumps(meta, indent=2))
    from counterledger.heartbeat import write_hourly

    write_hourly(ev_id)


def main() -> None:
    import sys

    params = json.loads((DATA_DIR / "heartbeat-params.json").read_text())
    want = set(sys.argv[1:])
    for ev in load_events()["events"]:
        if want and ev["id"] not in want:
            continue
        print(f"== {ev['id']}", flush=True)
        rows, meta = fetch_event(ev, params["tokens"])
        write_raw(ev["id"], rows, meta)
        print(f"   wrote {len(rows)} outflows", flush=True)


if __name__ == "__main__":
    main()
