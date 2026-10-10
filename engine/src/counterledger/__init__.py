"""Counterledger engine: observer, backtests, score, evidence writer, verify."""

from dotenv import load_dotenv

from counterledger.paths import ROOT

load_dotenv(ROOT / ".env")


def main() -> None:
    print("counterledger engine — see `uv run verify`")
