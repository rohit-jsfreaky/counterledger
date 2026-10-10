"""Heartbeat + cover rules on synthetic hourly counts (no network, no data files)."""

from collections import Counter

from counterledger import cover_backtest as cb
from counterledger import heartbeat as hb

COVER = {"halt_threshold_ratio": 0.10, "min_daily_median": 10, "challenge_window_hours": 24}


def steady(hours: int, per_hour: int, start: int = 0) -> Counter:
    return Counter({h: per_hour for h in range(start, start + hours)})


def test_steady_flow_never_alarms():
    c = steady(60 * 24, 10)
    onsets, _ = hb.alarms_in(c, 40 * 24, 50 * 24, K=0.25, N=3, baseline_days=28, min_median=4)
    assert onsets == []


def test_halt_alarms_at_end_of_nth_stall_hour():
    c = steady(60 * 24, 10)
    stop = 45 * 24 + 5
    for h in range(stop, 60 * 24):
        c[h] = 0
    onsets, _ = hb.alarms_in(c, 40 * 24, 50 * 24, K=0.25, N=3, baseline_days=28, min_median=4)
    assert onsets == [(stop + 3) * hb.H]  # end of the 3rd zero hour


def test_quiet_wallet_cannot_alarm_below_min_median():
    c = steady(60 * 24, 2)  # median 2 < 4: rule is not usable, so it must stay silent
    for h in range(45 * 24, 60 * 24):
        c[h] = 0
    onsets, _ = hb.alarms_in(c, 40 * 24, 50 * 24, K=0.25, N=3, baseline_days=28, min_median=4)
    assert onsets == []


def test_two_stall_hours_are_not_enough_for_n3():
    c = steady(60 * 24, 10)
    c[45 * 24] = c[45 * 24 + 1] = 0
    onsets, _ = hb.alarms_in(c, 40 * 24, 50 * 24, K=0.25, N=3, baseline_days=28, min_median=4)
    assert onsets == []


def test_cover_pays_after_challenge_window_when_halt_holds():
    c = steady(70 * 24, 5)  # 120/day
    stop = 50 * 24
    for h in range(stop, 70 * 24):
        c[h] = 0
    found = cb.scan(c, 45 * 24, 60 * 24, COVER)
    assert len(found) == 1
    # trailing 24h drops below 12 (10% of 120) once fewer than 3 busy hours remain in the window
    assert found[0]["payout"] is not None


def test_cover_does_not_pay_if_flow_resumes_inside_window():
    c = steady(70 * 24, 5)
    stop = 50 * 24
    for h in range(stop, stop + 30):
        c[h] = 0  # 30 h pause, then back to normal
    found = cb.scan(c, 45 * 24, 60 * 24, COVER)
    assert found and all(f["payout"] is None for f in found)


def test_canonical_hash_is_key_order_independent():
    assert hb.canonical_hash({"a": 1, "b": 2}) == hb.canonical_hash({"b": 2, "a": 1})
