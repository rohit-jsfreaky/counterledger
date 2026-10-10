"""Withdrawal heartbeat + backtests. Reads data/raw/<event>/outflows.csv.gz and data/heartbeat-params.json,
writes evidence/backtests/<event>.json. Pure function of those inputs: `verify` re-runs it and compares hashes.
"""

from __future__ import annotations

import csv
import gzip
import hashlib
import json
import statistics
from collections import Counter
from datetime import datetime, timedelta, timezone

from counterledger.paths import DATA_DIR, EVIDENCE_DIR

H = 3600
DAY_H = 24


def iso(ts: int | float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_ts(s: str) -> int:
    return int(datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp())


def sha256_file(path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical_hash(obj: dict) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def load_params() -> dict:
    return json.loads((DATA_DIR / "heartbeat-params.json").read_text())


def counts_from_outflows(ev_id: str) -> Counter:
    """Hourly outflow counts derived from the full transfer list (data/raw/<event>/outflows.csv.gz)."""
    c: Counter = Counter()
    with gzip.open(DATA_DIR / "raw" / ev_id / "outflows.csv.gz", "rt", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            c[int(r["ts"]) // H] += 1
    return c


def write_hourly(ev_id: str) -> None:
    """hourly.csv is the committed input for verify; the full outflows file is a release asset (too big for git)."""
    c = counts_from_outflows(ev_id)
    lines = ["hour_utc,count"] + [f"{iso(h * H)},{c[h]}" for h in sorted(c)]
    (DATA_DIR / "raw" / ev_id / "hourly.csv").write_text("\n".join(lines) + "\n", newline="\n")


def hourly_counts(ev_id: str) -> Counter:
    c: Counter = Counter()
    for line in (DATA_DIR / "raw" / ev_id / "hourly.csv").read_text().splitlines()[1:]:
        t, n = line.split(",")
        c[parse_ts(t) // H] = int(n)
    return c


def raw_refs(ev_id: str) -> dict:
    d = DATA_DIR / "raw" / ev_id
    meta = json.loads((d / "meta.json").read_text())
    return {"hourly_file": f"data/raw/{ev_id}/hourly.csv", "hourly_sha256": sha256_file(d / "hourly.csv"),
            "outflows_file": f"data/raw/{ev_id}/outflows.csv.gz (release asset)",
            "outflows_sha256": meta["outflows_sha256"], "outflows_rows": meta["rows"]}


def hour_state(counts: Counter, h: int, K: float, baseline_days: int, min_median: float) -> dict:
    base = [counts.get(h - DAY_H * k, 0) for k in range(1, baseline_days + 1)]
    med = statistics.median(base)
    n = counts.get(h, 0)
    return {"h": h, "count": n, "median": med, "stall": med >= min_median and n < K * med}


def alarms_in(counts: Counter, h0: int, h1: int, K: float, N: int, baseline_days: int, min_median: float) -> tuple[list[int], list[dict]]:
    """Alarm onsets (unix ts at the END of the N-th consecutive stall hour) for hours [h0, h1)."""
    run, onsets, series = 0, [], []
    # warm the run counter with the N-1 hours before h0 so a stall straddling h0 is not cut
    for h in range(h0 - (N - 1), h1):
        st = hour_state(counts, h, K, baseline_days, min_median)
        run = run + 1 if st["stall"] else 0
        if h >= h0:
            series.append(st)
            if run == N:
                onsets.append((h + 1) * H)
    return onsets, series


def run_event(ev: dict, params: dict, K: float | None = None, N: int | None = None, with_series: bool = False) -> dict:
    K = params["K"] if K is None else K
    N = params["N"] if N is None else N
    bd, mm = 28, 4
    counts = hourly_counts(ev["id"])
    T = parse_ts(ev["T"])
    th = T // H
    ev_h0, ev_h1 = th - 7 * DAY_H, th + 2 * DAY_H
    onsets, series = alarms_in(counts, ev_h0, ev_h1, K, N, bd, mm)
    controls = []
    for end_days in (35, 63):
        c1 = th - end_days * DAY_H
        c_on, c_series = alarms_in(counts, c1 - 7 * DAY_H, c1, K, N, bd, mm)
        controls.append({"window": [iso((c1 - 7 * DAY_H) * H), iso(c1 * H)], "alarms": [iso(t) for t in c_on],
                         "hours_with_usable_baseline": sum(1 for s in c_series if s["median"] >= mm)})
    first = onsets[0] if onsets else None
    fa = parse_ts(ev["first_abnormal"]) if ev.get("first_abnormal") else None
    out = {
        "event": ev["id"], "K": K, "N": N, "T": ev["T"], "T_kind": ev["T_kind"],
        "first_abnormal": ev.get("first_abnormal"),
        "alarms_in_event_window": [iso(t) for t in onsets],
        "first_alarm": iso(first) if first else None,
        "first_alarm_minus_T_hours": round((first - T) / H, 2) if first else None,
        "first_alarm_minus_first_abnormal_hours": round((first - fa) / H, 2) if first and fa else None,
        "event_window_hours_with_usable_baseline": sum(1 for s in series if s["median"] >= mm),
        "controls": controls,
        "control_alarms_total": sum(len(c["alarms"]) for c in controls),
    }
    if with_series:
        out["series"] = [{"t": iso(s["h"] * H), "count": s["count"], "median": s["median"], "stall": s["stall"]}
                         for s in series]
    return out


def backtest(ev: dict, params: dict) -> dict:
    head = run_event(ev, params, with_series=True)
    sweep = [
        {k: run_event(ev, params, K=K, N=N)[k] for k in ("K", "N", "first_alarm_minus_T_hours", "control_alarms_total")}
        for K in params["sweep_as_control_only"]["K"] for N in params["sweep_as_control_only"]["N"]
    ]
    doc = {
        "kind": "heartbeat-backtest",
        "params_file": "data/heartbeat-params.json",
        "params_sha256": sha256_file(DATA_DIR / "heartbeat-params.json"),
        **raw_refs(ev["id"]),
        "event_source": {k: ev.get(k) for k in ("T_source", "T_quote", "first_abnormal_quote", "hot_wallets_source")},
        "result": head,
        "sweep_control_only": sweep,
    }
    doc["evidence_sha256"] = canonical_hash(doc)
    return doc


def main() -> None:
    import sys

    params = json.loads((DATA_DIR / "heartbeat-params.json").read_text())
    events = json.loads((DATA_DIR / "events.json").read_text())["events"]
    want = set(sys.argv[1:])
    out_dir = EVIDENCE_DIR / "backtests"
    out_dir.mkdir(parents=True, exist_ok=True)
    for ev in events:
        if (want and ev["id"] not in want) or not (DATA_DIR / "raw" / ev["id"] / "hourly.csv").exists():
            continue
        doc = backtest(ev, params)
        (out_dir / f"{ev['id']}.json").write_text(json.dumps(doc, indent=1))
        r = doc["result"]
        print(f"{ev['id']}: first_alarm={r['first_alarm']} (T{r['first_alarm_minus_T_hours']:+}h)" if r["first_alarm"]
              else f"{ev['id']}: no alarm in event window", f"| control alarms={r['control_alarms_total']}",
              f"| usable baseline hours event={r['event_window_hours_with_usable_baseline']}/216")


if __name__ == "__main__":
    main()
