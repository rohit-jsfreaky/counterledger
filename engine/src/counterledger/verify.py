"""`uv run verify` — recompute every published number from committed inputs and print PASS/FAIL lines.
Needs no keys and no network (CL_MODE=replay)."""

from __future__ import annotations

import json
import os
import sys

os.environ.setdefault("CL_MODE", "replay")

from counterledger import cover_backtest, heartbeat  # noqa: E402
from counterledger.paths import DATA_DIR, EVIDENCE_DIR  # noqa: E402

results: list[tuple[bool, str]] = []


def check(ok: bool, msg: str) -> None:
    results.append((ok, msg))
    print(("PASS " if ok else "FAIL ") + msg)


def verify_backtests() -> None:
    hp = json.loads((DATA_DIR / "heartbeat-params.json").read_text())
    cp = json.loads((DATA_DIR / "cover-params.json").read_text())
    for ev in json.loads((DATA_DIR / "events.json").read_text())["events"]:
        d = DATA_DIR / "raw" / ev["id"]
        if not (d / "hourly.csv").exists():
            check(False, f"{ev['id']}: hourly counts missing (data/raw/{ev['id']}/hourly.csv)")
            continue
        full = d / "outflows.csv.gz"
        if full.exists():  # the full transfer list is a release asset; when present, tie hourly.csv to it
            meta = json.loads((d / "meta.json").read_text())
            same_file = heartbeat.sha256_file(full) == meta["outflows_sha256"]
            same_counts = heartbeat.counts_from_outflows(ev["id"]) == heartbeat.hourly_counts(ev["id"])
            check(same_file and same_counts, f"{ev['id']} hourly counts re-derived from all {meta['rows']:,} transfers "
                                             f"(outflows sha256 {meta['outflows_sha256'][:12]}…)")
        else:
            print(f"INFO {ev['id']}: full transfer list not present; download the release asset to re-derive hourly.csv")
        for kind, fn, name in (("heartbeat", lambda: heartbeat.backtest(ev, hp), f"{ev['id']}.json"),
                               ("cover", lambda: cover_backtest.run(ev, cp), f"cover-{ev['id']}.json")):
            path = EVIDENCE_DIR / "backtests" / name
            if not path.exists():
                check(False, f"{ev['id']} {kind}: evidence file missing")
                continue
            stored = json.loads(path.read_text())
            fresh = fn()
            same = stored["evidence_sha256"] == fresh["evidence_sha256"]
            if kind == "heartbeat":
                r = fresh["result"]
                summary = (f"alarm T{r['first_alarm_minus_T_hours']:+}h" if r["first_alarm"] else "no alarm") + \
                          f", control alarms {r['control_alarms_total']}"
            else:
                summary = (f"payout T{fresh['first_payout_minus_T_hours']:+}h" if fresh["first_payout"] else "no payout") + \
                          f" vs Nexus T+100d, control false halts {fresh['control_false_halts']}"
            check(same, f"{ev['id']} {kind} recomputed from raw + params = published evidence ({summary})")


def verify_reserves() -> None:
    summary = json.loads((EVIDENCE_DIR / "reserves" / "summary.json").read_text())
    for key, s in summary.items():
        if s.get("total_usd") is None:
            check(bool(s.get("reason")), f"{s['name']} reserves shown as '—' with a reason: {s.get('reason')}")
            continue
        r = json.loads((EVIDENCE_DIR / "reserves" / f"{key}.json").read_text())
        has_src = all(r["source"].get(k) for k in ("balances", "addresses"))
        sums = abs(sum(a["usd"] for a in r["assets"]) - r["total_usd"]) < 1
        check(has_src and sums, f"{r['name']} reserves ${r['total_usd'] / 1e9:.2f}B: every number has a balance source "
                                f"and an address source; assets sum to the total")


def main() -> None:
    verify_backtests()
    verify_reserves()
    bad = [m for ok, m in results if not ok]
    print(f"\n{len(results) - len(bad)}/{len(results)} PASS")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
