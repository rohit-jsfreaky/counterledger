"""Custody-visibility score per exchange (rules: data/score-params.json). Writes evidence/score/<exchange>.json with
every input, its source and the deduction lines; `verify` recomputes the score from that file alone."""

from __future__ import annotations

import json
import time

from counterledger import chain
from counterledger.heartbeat import canonical_hash, iso, sha256_file
from counterledger.paths import DATA_DIR, EVIDENCE_DIR

EXCHANGES = ["coindcx", "wazirx", "binance", "bybit", "okx", "kucoin", "bitget"]
AMOUNT_DECIMALS = 6


def load_params() -> dict:
    return json.loads((DATA_DIR / "score-params.json").read_text())


def compute(inputs: dict, p: dict) -> tuple[int, list[dict]]:
    """Pure function of the recorded inputs."""
    d = p["deductions"]
    lines: list[dict] = []
    if not inputs["reserves_sourced"]:
        lines.append({"rule": "no_sourced_reserves", "points": d["no_sourced_reserves"]["points"]})
    hb = inputs["heartbeat_state"]
    if d["heartbeat"].get(hb, 0):
        lines.append({"rule": f"heartbeat:{hb}", "points": d["heartbeat"][hb]})
    shortfalls = [a for a in inputs["floors"] if a["reserve"] is not None and a["floor"] > a["reserve"]]
    if shortfalls:
        lines.append({"rule": "proven_shortfall", "points": d["proven_shortfall"]["points"],
                      "assets": [a["asset"] for a in shortfalls]})
    if inputs["provers"] == 0:
        lines.append({"rule": "not_yet_proven", "points": d["not_yet_proven"]["points"]})
    stuck = min(inputs["stuck_withdrawal_proofs"] * d["stuck_withdrawal_proofs"]["points_each"],
                d["stuck_withdrawal_proofs"]["max"])
    if stuck:
        lines.append({"rule": "stuck_withdrawal_proofs", "points": stuck})
    inc = min(inputs["inclusion_failures"] * d["inclusion_failures"]["points_each"], d["inclusion_failures"]["max"])
    if inc:
        lines.append({"rule": "inclusion_failures", "points": inc})
    lo, hi = p["clamp"]
    score = max(lo, min(hi, p["start"] - sum(x["points"] for x in lines)))
    return score, lines


def gather(ex: str, as_of: int) -> dict:
    summary = json.loads((EVIDENCE_DIR / "reserves" / "summary.json").read_text())
    res = summary.get(ex, {})
    sourced = res.get("total_usd") is not None
    reserve_by_asset: dict[str, float] = {}
    sources = {"score_params_sha256": sha256_file(DATA_DIR / "score-params.json")}
    if sourced:
        rf = EVIDENCE_DIR / "reserves" / f"{ex}.json"
        r = json.loads(rf.read_text())
        reserve_by_asset = {a["asset"]: a["amount"] for a in r["assets"] if a.get("amount") is not None}
        sources["reserves"] = {"file": f"evidence/reserves/{ex}.json", "sha256": sha256_file(rf), "as_of": r["as_of"]}
    hbf = EVIDENCE_DIR / "heartbeat" / f"{ex}.json"
    if hbf.exists():
        hb = json.loads(hbf.read_text())
        hb_state = hb["state"]
        sources["heartbeat"] = {"file": f"evidence/heartbeat/{ex}.json", "sha256": sha256_file(hbf),
                                "as_of": hb["as_of"]}
    else:
        hb_state = "unknown"
        sources["heartbeat"] = {"file": None, "reason": "no live heartbeat (no sourced addresses)" if not sourced
                                else "live heartbeat not run yet"}
    snap = chain.exchange_snapshot(ex, as_of)
    sources["chain"] = {"account": snap["address"], "slot": snap["slot"], "data_sha256": snap["data_sha256"]}
    floors = []
    for f in snap["floors"]:
        amount = f["amount"] / 10**AMOUNT_DECIMALS
        floors.append({"asset": f["asset"], "floor": amount, "provers": f["provers"],
                       "reserve": reserve_by_asset.get(f["asset"])})
    return {
        "reserves_sourced": sourced,
        "reserves_total_usd": res.get("total_usd"),
        "heartbeat_state": hb_state,
        "floors": floors,
        "provers": snap["prover_count"],
        "stuck_withdrawal_proofs": 0,
        "inclusion_failures": 0,
        "_sources": sources,
    }


def build(ex: str, as_of: int | None = None) -> dict:
    as_of = as_of or int(time.time()) // 3600 * 3600
    p = load_params()
    inputs = gather(ex, as_of)
    score, lines = compute(inputs, p)
    doc = {
        "kind": "score",
        "exchange": ex,
        "as_of": iso(as_of),
        "score": score,
        "deductions": lines,
        "inputs": {k: v for k, v in inputs.items() if not k.startswith("_")},
        "sources": inputs["_sources"],
        "params_file": "data/score-params.json",
        "note": "Shows how much of the books can be seen and proven from outside. Not a solvency rating.",
    }
    doc["evidence_sha256"] = canonical_hash(doc)
    return doc


def main() -> None:
    import sys

    out = EVIDENCE_DIR / "score"
    out.mkdir(parents=True, exist_ok=True)
    for ex in sys.argv[1:] or EXCHANGES:
        doc = build(ex)
        (out / f"{ex}.json").write_text(json.dumps(doc, indent=1))
        ded = ", ".join(f"-{d['points']} {d['rule']}" for d in doc["deductions"]) or "none"
        print(f"{ex:<8} score={doc['score']:>3}  ({ded})")


if __name__ == "__main__":
    main()
