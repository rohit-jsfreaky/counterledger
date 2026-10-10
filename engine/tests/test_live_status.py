"""Live heartbeat states on synthetic hourly files (no network)."""

from counterledger import live
from counterledger.heartbeat import H, iso

HP = {"K": 0.25, "N": 3}


def write_hourly(tmp_path, monkeypatch, per_hour: dict[int, int], hours: int = 30 * 24, start: int = 1_700_000_000 // H):
    d = tmp_path / "live" / "x"
    d.mkdir(parents=True)
    lines = ["hour_utc,ethereum,tron,bsc"]
    for h in range(start, start + hours):
        lines.append(f"{iso(h * H)},{per_hour.get(h - start, 10)},0,0")
    (d / "hourly.csv").write_text("\n".join(lines) + "\n")
    monkeypatch.setattr(live, "DATA_DIR", tmp_path)
    monkeypatch.setitem(live.NAMES, "x", "X")
    return start


def test_steady_flow_is_normal(tmp_path, monkeypatch):
    write_hourly(tmp_path, monkeypatch, {})
    assert live.status("x", HP)["state"] == "normal"


def test_last_three_hours_at_zero_is_below_usual_pattern(tmp_path, monkeypatch):
    n = 30 * 24
    write_hourly(tmp_path, monkeypatch, {n - 1: 0, n - 2: 0, n - 3: 0})
    assert live.status("x", HP)["state"] == "below_usual_pattern"


def test_quiet_wallets_are_not_enough_data_never_normal(tmp_path, monkeypatch):
    write_hourly(tmp_path, monkeypatch, {h: 1 for h in range(30 * 24)})
    assert live.status("x", HP)["state"] == "not_enough_data"


def test_status_is_deterministic(tmp_path, monkeypatch):
    write_hourly(tmp_path, monkeypatch, {})
    assert live.status("x", HP)["evidence_sha256"] == live.status("x", HP)["evidence_sha256"]

