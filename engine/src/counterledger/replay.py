"""Halt replay inputs for the devnet cover demo: what the observer would have posted before and at a real halt,
taken from the published backtests (no new numbers). Writes evidence/replay/<event>.json."""

from __future__ import annotations

import json

from counterledger import score
from counterledger.heartbeat import canonical_hash
from counterledger.paths import EVIDENCE_DIR


def build(event: str) -> dict:
    hb = json.loads((EVIDENCE_DIR / "backtests" / f"{event}.json").read_text())
    cover = json.loads((EVIDENCE_DIR / "backtests" / f"cover-{event}.json").read_text())
    r = hb["result"]
    pre = r["series"][0]  # first hour of the event window (T-7d): the exchange looked normal
    inputs = {
        "reserves_sourced": True,  # labelled hot wallets with sources (data/events.json)
        "reserves_total_usd": None,
        "heartbeat_state": "normal",
        "floors": [],
        "provers": 0,
        "stuck_withdrawal_proofs": 0,
        "inclusion_failures": 0,
    }
    value, lines = score.compute(inputs, score.load_params())
    halts = cover["halts_in_event_window"]
    doc = {
        "kind": "halt-replay",
        "event": event,
        "pre_event": {"t": pre["t"], "count": pre["count"], "baseline_median": pre["median"], "state": "normal",
                      "score": value, "deductions": lines, "score_inputs": inputs},
        "heartbeat_alarm": r["first_alarm"],
        "halt_confirmed": halts[0]["halt_confirmed"] if halts else None,
        "payout_due": cover["first_payout"],
        "nexus_earliest_claim_days_after_T": 100,
        "sources": {"heartbeat_backtest": {"file": f"evidence/backtests/{event}.json", "evidence_sha256": hb["evidence_sha256"]},
                    "cover_backtest": {"file": f"evidence/backtests/cover-{event}.json", "evidence_sha256": cover["evidence_sha256"]}},
        "note": "Devnet replay of a real past halt: the observer posts the pre-event state, then the confirmed halt, "
                "and the pool runs its normal trigger → challenge window → payout. Test-USDC only.",
    }
    doc["evidence_sha256"] = canonical_hash(doc)
    return doc


def main() -> None:
    import sys

    out = EVIDENCE_DIR / "replay"
    out.mkdir(parents=True, exist_ok=True)
    for ev in sys.argv[1:] or ["ftx-2022-11"]:
        doc = build(ev)
        (out / f"{ev}.json").write_text(json.dumps(doc, indent=1))
        print(ev, "pre-event score", doc["pre_event"]["score"], "| halt confirmed", doc["halt_confirmed"],
              "| payout due", doc["payout_due"])


if __name__ == "__main__":
    main()
