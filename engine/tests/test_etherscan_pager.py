"""The pager must return every row even when the server caps rows per call and one block holds more than a page."""

from counterledger import etherscan

CAP = 3


def fake_chain(rows_per_block: dict[int, int]):
    rows = [{"hash": f"0x{b}-{i}", "blockNumber": str(b), "logIndex": str(i), "from": "a", "to": "b", "value": "1"}
            for b, n in sorted(rows_per_block.items()) for i in range(n)]

    def _get(chainid, *, startblock, endblock, page, offset, **_):
        sel = [r for r in rows if startblock <= int(r["blockNumber"]) <= endblock]
        size = min(CAP, offset)
        return sel[(page - 1) * size: page * size]

    return rows, _get


def test_pager_reads_all_rows_across_capped_pages(monkeypatch):
    rows, g = fake_chain({1: 2, 2: 2, 3: 1, 5: 2})
    monkeypatch.setattr(etherscan, "_get", g)
    got = list(etherscan._walk(1, "tokentx", "a", 1, 9))
    assert [r["hash"] for r in got] == [r["hash"] for r in rows]


def test_pager_reads_a_block_bigger_than_one_page(monkeypatch):
    rows, g = fake_chain({1: 1, 2: 8, 3: 2})  # block 2 alone needs 3 capped pages
    monkeypatch.setattr(etherscan, "_get", g)
    got = list(etherscan._walk(1, "tokentx", "a", 2, 9))
    assert [r["hash"] for r in got] == [r["hash"] for r in rows if r["blockNumber"] != "1"]
