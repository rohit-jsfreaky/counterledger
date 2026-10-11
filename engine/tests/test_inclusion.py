"""Inclusion verdicts: a Merkle-valid record still needs a root Binance published."""

import json

import pytest

from counterledger import inclusion

VALID = inclusion.TOOL_DIR / "testdata" / "valid.json"


def _go_ready() -> bool:
    try:
        inclusion.ensure_binary()
        return True
    except Exception:  # noqa: BLE001
        return False


pytestmark = pytest.mark.skipif(not _go_ready(), reason="Go toolchain not available to build tools/inclusion")


def test_valid_record_with_unpublished_root_is_not_called_included(monkeypatch):
    monkeypatch.setattr(inclusion, "published_roots", lambda: {})
    assert inclusion.check(VALID)["verdict"] == "root_not_recognised"


def test_valid_record_with_published_root_is_included(monkeypatch):
    root = json.loads(VALID.read_text())["Root"]
    monkeypatch.setattr(inclusion, "published_roots", lambda: {root: {"root": root, "source": "test"}})
    assert inclusion.check(VALID)["verdict"] == "included"


def test_edited_record_is_not_included(monkeypatch):
    root = json.loads(VALID.read_text())["Root"]
    monkeypatch.setattr(inclusion, "published_roots", lambda: {root: {"root": root, "source": "test"}})
    assert inclusion.check(inclusion.TOOL_DIR / "testdata" / "edited_balance.json")["verdict"] == "not_included"
