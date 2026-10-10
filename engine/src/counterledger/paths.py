from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]  # repo root (engine/src/counterledger -> repo)
CACHE_DIR = ROOT / "cache"
EVIDENCE_DIR = ROOT / "evidence"
DATA_DIR = ROOT / "data"
