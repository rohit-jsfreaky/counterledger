"""Cover payout replay: when would a heartbeat-triggered cover have paid, vs Nexus Mutual's 100-day halt rule?
Reads data/raw/<event>/outflows.csv.gz + data/cover-params.json, writes evidence/backtests/cover-<event>.json.
"""

from __future__ import annotations

import json
import statistics
from collections import Counter

from counterledger.heartbeat import DAY_H, H, canonical_hash, hourly_counts, iso, parse_ts, raw_refs, sha256_file
from counterledger.paths import DATA_DIR, EVIDENCE_DIR


def trailing(counts: Counter, h: int) -> int:
    return sum(counts.get(x, 0) for x in range(h - DAY_H + 1, h + 1))


def halted(counts: Counter, h: int, p: dict) -> tuple[bool, int, float]:
    """Halt rule evaluated at the END of hour h."""
    t24 = trailing(counts, h)
    med = statistics.median(trailing(counts, h - DAY_H * k) for k in range(1, 29))
    return med >= p["min_daily_median"] and t24 < p["halt_threshold_ratio"] * med, t24, med


def scan(counts: Counter, h0: int, h1: int, p: dict) -> list[dict]:
    """Halt confirmations and payouts in hours [h0, h1)."""
    out, h = [], h0
    cw = p["challenge_window_hours"]
    while h < h1:
        ok, t24, med = halted(counts, h, p)
        if not ok:
            h += 1
            continue
        confirm = (h + 1) * H
        end_h = h + cw
        still, t24e, mede = halted(counts, end_h, p) if end_h < h1 + cw else (False, None, None)
        out.append({"halt_confirmed": iso(confirm), "trailing24": t24, "baseline_daily_median": med,
                    "payout": iso((end_h + 1) * H) if still else None,
                    "at_window_end": {"trailing24": t24e, "baseline_daily_median": mede}})
        # skip to the first hour the halt rule stops holding, so one halt is one record
        while h < h1 and halted(counts, h, p)[0]:
            h += 1
    return out


def run(ev: dict, p: dict) -> dict:
    counts = hourly_counts(ev["id"])
    T = parse_ts(ev["T"])
    th = T // H
    found = scan(counts, th - 7 * DAY_H, th + (p["data_range_after_T_days"] - 1) * DAY_H, p)
    first_pay = next((f["payout"] for f in found if f["payout"]), None)
    controls = []
    for end_days in (35, 63):
        c1 = th - end_days * DAY_H
        controls.append({"window": [iso((c1 - 7 * DAY_H) * H), iso(c1 * H)],
                         "halts": scan(counts, c1 - 7 * DAY_H, c1, p)})
    doc = {
        "kind": "cover-backtest",
        "event": ev["id"],
        "T": ev["T"],
        "params_file": "data/cover-params.json",
        "params_sha256": sha256_file(DATA_DIR / "cover-params.json"),
        **raw_refs(ev["id"]),
        "halts_in_event_window": found,
        "first_payout": first_pay,
        "first_payout_minus_T_hours": round((parse_ts(first_pay) - T) / H, 2) if first_pay else None,
        "nexus_earliest_claim_days_after_T": 100,
        "controls": controls,
        "control_false_halts": sum(len(c["halts"]) for c in controls),
        "limit": "History has no stuck-withdrawal proofs, so this replay uses the on-chain rule alone.",
    }
    doc["evidence_sha256"] = canonical_hash(doc)
    return doc


def main() -> None:
    import sys

    p = json.loads((DATA_DIR / "cover-params.json").read_text())
    want = set(sys.argv[1:])
    out = EVIDENCE_DIR / "backtests"
    out.mkdir(parents=True, exist_ok=True)
    for ev in json.loads((DATA_DIR / "events.json").read_text())["events"]:
        if (want and ev["id"] not in want) or not (DATA_DIR / "raw" / ev["id"] / "hourly.csv").exists():
            continue
        d = run(ev, p)
        (out / f"cover-{ev['id']}.json").write_text(json.dumps(d, indent=1))
        print(f"{ev['id']}: first payout {d['first_payout']} (T{d['first_payout_minus_T_hours']:+}h)" if d["first_payout"]
              else f"{ev['id']}: no payout in T-7d..T+{p['data_range_after_T_days']}d",
              f"| halts={len(d['halts_in_event_window'])} | control false halts={d['control_false_halts']}")


if __name__ == "__main__":
    main()
