"""The continuous grading proxy (E1) — the ONE definition money_grade and the
experiments share. Tests the properties that make it a valid SENSITIVITY: it moves
where dollars are flat, it is deterministic, and it degrades sanely."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))
import grade_proxy as GP  # noqa: E402


def test_week_win_prob_smoothes_a_near_miss():
    # Losing the weekly high by half a point is ~0.45, NOT 0 — the whole point:
    # the dollar grade sees 0, the proxy sees "almost".
    p = GP.week_win_prob(119.5, [120.0], sigma=8.0)
    assert 0.35 < p < 0.5, p
    # A clear win integrates near 1, a clear loss near 0.
    assert GP.week_win_prob(160, [110], 8.0) > 0.95
    assert GP.week_win_prob(90, [140], 8.0) < 0.05


def test_hard_indicator_when_sigma_absent():
    assert GP.week_win_prob(120, [110, 115], None) == 1.0
    assert GP.week_win_prob(100, [110, 115], None) == 0.0
    # a tie is shared
    assert abs(GP.week_win_prob(120, [120, 100], None) - 0.5) < 1e-9


def test_proxy_differentiates_where_dollars_are_flat():
    # Two rosters that BOTH miss the playoffs (dollars: playoff=0, RS=0 for both) but
    # differ in weekly quality. The proxy must separate them; dollars cannot.
    # field: 3 teams, 4 weeks. Team 1 is my seat we substitute.
    field = {1: {1: 100, 2: 130, 3: 120}, 2: {1: 100, 2: 130, 3: 120},
             3: {1: 100, 2: 130, 3: 120}, 4: {1: 100, 2: 130, 3: 120}}
    rs = [1, 2, 3, 4]
    sigma = GP.residual_weekly_sigma(field, rs)  # 0 here (no within-team variation)
    good = GP.grade_policy_proxies(field, {1: 128, 2: 128, 3: 128, 4: 128}, 1, rs, [], sigma)
    bad = GP.grade_policy_proxies(field, {1: 105, 2: 105, 3: 105, 4: 105}, 1, rs, [], sigma)
    # both still miss the high every week (top other is 130), but rank differs:
    assert good["mean_weekly_rank"] < bad["mean_weekly_rank"], (good, bad)


def test_deterministic():
    field = {1: {1: 110, 2: 120}, 2: {1: 115, 2: 118}}
    a = GP.grade_policy_proxies(field, {1: 112, 2: 116}, 1, [1, 2], [], 6.0)
    b = GP.grade_policy_proxies(field, {1: 112, 2: 116}, 1, [1, 2], [], 6.0)
    assert a == b


def test_playoff_window_points_is_continuous():
    # fires even with an empty field — the playoff channel made continuous so it
    # moves without the seat making the bracket.
    r = GP.grade_policy_proxies({}, {15: 130, 16: 140}, 1, [], [15, 16], None)
    assert r["playoff_window_points"] == 270.0
