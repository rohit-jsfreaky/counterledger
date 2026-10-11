"""Binance inclusion check: is this user's record a leaf of the account tree Binance published?

Two checks, both required:
1. Merkle inclusion — tools/inclusion (Go) runs Binance's OWN open-source code (github.com/binance/
   zkmerkle-proof-of-solvency, pinned): same Poseidon leaf hash, same fixed-depth Merkle proof.
2. Published root — the record's root must be one Binance published (data/binance-roots.json, each with a source URL);
   otherwise anyone could build their own tree.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

from counterledger.heartbeat import canonical_hash
from counterledger.paths import DATA_DIR, EVIDENCE_DIR, ROOT

TOOL_DIR = ROOT / "tools" / "inclusion"
BIN = TOOL_DIR / ("inclusion.exe" if sys.platform == "win32" else "inclusion")


def ensure_binary() -> Path:
    if not BIN.exists():
        if not shutil.which("go"):
            raise RuntimeError("Go is needed to build tools/inclusion (Binance's verifier code)")
        subprocess.run(["go", "build", "-o", str(BIN), "."], cwd=TOOL_DIR, check=True)
    return BIN


def merkle_check(record_path: Path) -> dict:
    out = subprocess.run([str(ensure_binary()), "verify", str(record_path)], capture_output=True, text=True)
    return json.loads(out.stdout.strip().splitlines()[-1])


def published_roots() -> dict[str, dict]:
    p = DATA_DIR / "binance-roots.json"
    if not p.exists():
        return {}
    return {r["root"].lower(): r for r in json.loads(p.read_text())["roots"]}


def check(record_path: Path) -> dict:
    m = merkle_check(record_path)
    root = (m.get("root") or "").lower()
    pub = published_roots().get(root)
    if m.get("error"):
        verdict = "invalid_record"
    elif not m["included"]:
        verdict = "not_included"
    elif not pub:
        verdict = "root_not_recognised"
    else:
        verdict = "included"
    return {"verdict": verdict, "merkle": m, "published_root": pub}


def testvectors() -> dict:
    """The checker on vectors built with Binance's own tree code: one valid record and three edited ones."""
    expect = {"valid.json": True, "edited_balance.json": False, "wrong_index.json": False, "wrong_root.json": False}
    rows = []
    for name, want in expect.items():
        m = merkle_check(TOOL_DIR / "testdata" / name)
        rows.append({"record": f"tools/inclusion/testdata/{name}", "expected_included": want,
                     "included": m.get("included"), "leaf": m.get("leaf"), "ok": m.get("included") == want})
    doc = {
        "kind": "inclusion-testvectors",
        "verifier_code": "github.com/binance/zkmerkle-proof-of-solvency@a7addd9326722f8d5fcd6c8ac52a06358bf996c5",
        "cross_check": "valid.json -> Binance's own `verifier -user`: 'verify pass!!!'; edited_balance.json -> "
                       "'verify failed...' (run 11 Oct 2026)",
        "binance_repo_sample_note": "Binance's bundled src/verifier/config/user_config.json fails Binance's own "
                                    "verifier at this commit (stale sample); not used.",
        "limit": "Not run on a real Binance user record: the builder has no Binance account, and a new account would "
                 "not be in Binance's tree before the deadline.",
        "vectors": rows,
    }
    doc["evidence_sha256"] = canonical_hash(doc)
    return doc


def main() -> None:
    if len(sys.argv) > 1:
        print(json.dumps(check(Path(sys.argv[1])), indent=1))
        return
    doc = testvectors()
    out = EVIDENCE_DIR / "inclusion"
    out.mkdir(parents=True, exist_ok=True)
    (out / "testvectors.json").write_text(json.dumps(doc, indent=1))
    for r in doc["vectors"]:
        print(f"{'ok ' if r['ok'] else 'BAD'} {r['record']}: included={r['included']} (expected {r['expected_included']})")


if __name__ == "__main__":
    main()
