"""`uv run verify` — recompute every published number from committed inputs and print PASS/FAIL lines.
Needs no keys and no network (CL_MODE=replay)."""

from __future__ import annotations

import json
import os
import sys

os.environ.setdefault("CL_MODE", "replay")

from counterledger import cover_backtest, heartbeat  # noqa: E402
from counterledger.paths import DATA_DIR, EVIDENCE_DIR  # noqa: E402

RELEASE = "https://github.com/rohit-jsfreaky/counterledger/releases/download/data-v1"

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
            print(f"INFO {ev['id']}: full transfer list not present; to re-derive hourly.csv, download "
                  f"{RELEASE}/{ev['id']}-outflows.csv.gz and save it as data/raw/{ev['id']}/outflows.csv.gz")
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


def verify_live() -> None:
    from counterledger import live

    for ex in live.EXCHANGES:
        ev = EVIDENCE_DIR / "heartbeat" / f"{ex}.json"
        if not ev.exists():
            check(False, f"{live.NAMES[ex]} live heartbeat: evidence missing")
            continue
        stored = json.loads(ev.read_text())
        fresh = live.status(ex)
        check(stored["evidence_sha256"] == fresh["evidence_sha256"],
              f"{fresh['name']} live heartbeat state '{fresh['state']}' as of {fresh['as_of']} recomputed from "
              f"data/live/{ex}/hourly.csv (24h outflows {fresh['last_24h_by_chain']})")


def verify_scores() -> None:
    from counterledger import score
    from counterledger.heartbeat import canonical_hash

    p = score.load_params()
    onchain_p = EVIDENCE_DIR / "onchain" / "reports.json"
    posted = json.loads(onchain_p.read_text()) if onchain_p.exists() else {}
    for ex in score.EXCHANGES:
        f = EVIDENCE_DIR / "score" / f"{ex}.json"
        if not f.exists():
            check(False, f"{ex} score: evidence missing")
            continue
        doc = json.loads(f.read_text())
        value, lines = score.compute(doc["inputs"], p)
        body = {k: v for k, v in doc.items() if k != "evidence_sha256"}
        same_hash = canonical_hash(body) == doc["evidence_sha256"]
        ok = value == doc["score"] and lines == doc["deductions"] and same_hash
        on = posted.get(ex, {}).get("score")
        chain_note = ""
        if on:
            ok = ok and on["evidence_sha256"] == doc["evidence_sha256"] and on["value"] == value
            chain_note = f"; same hash posted on devnet (tx {on['tx'][:10]}…)"
        check(ok, f"{ex} score {value} recomputed from its recorded inputs = published{chain_note}")


def verify_proofs() -> None:
    for f in sorted((EVIDENCE_DIR / "proofs").glob("*.json")) if (EVIDENCE_DIR / "proofs").exists() else []:
        d = json.loads(f.read_text())
        private_free = "wallet_balance" not in f.read_text() and "account_id" not in f.read_text()
        check(private_free and d["txs"]["recordProof"] and d["bucketLabel"],
              f"{d['exchange']} balance proof on devnet ({d['bucketLabel']}, record {d['proofRecord'][:8]}…) — "
              f"public file holds no exact balance or account id")


def verify_replays() -> None:
    from counterledger.heartbeat import canonical_hash

    for f in sorted((EVIDENCE_DIR / "onchain").glob("replay-*.json")) if (EVIDENCE_DIR / "onchain").exists() else []:
        d = json.loads(f.read_text())
        src = json.loads((DATA_DIR.parent / d["evidence"]["replay"]).read_text())
        body = {k: v for k, v in src.items() if k != "evidence_sha256"}
        ok = (canonical_hash(body) == src["evidence_sha256"] == d["evidence"]["replay_sha256"]
              and abs(d["paid_test_usdc"] - d["notional_test_usdc"]) < 1e-6
              and all(d["txs"].get(k) for k in ("buy_cover", "post_halt", "open_trigger", "finalize_trigger", "claim_cover")))
        check(ok, f"devnet halt replay {d['exchangeId']}: cover bought (premium {d['premium_test_usdc']} test-USDC), halt "
                  f"posted with the {d['event']} evidence hash, paid {d['paid_test_usdc']:g} after the "
                  f"{d['challenge_window_secs']}s challenge window")


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
    verify_live()
    verify_reserves()
    verify_scores()
    verify_proofs()
    verify_replays()
    bad = [m for ok, m in results if not ok]
    print(f"\n{len(results) - len(bad)}/{len(results)} PASS")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
