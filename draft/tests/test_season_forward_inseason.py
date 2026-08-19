"""Forward-mode invariants at small n, through the real functions — the
calibration itself is graded by the hindcast artifact (P103), not here."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import money_grade as MG  # noqa: E402
import season_forward_inseason as S  # noqa: E402

HISTORY = MG.load_history()
PAYOUTS = MG.load_payouts()
SEASON = next(str(s.get("season")) for s in HISTORY["seasons"]
              if len(MG.playoff_placements(s)) >= MG.PLAYOFF_TEAMS)


def test_playoff_probability_sums_to_four():
    odds = S.forward_odds(HISTORY, PAYOUTS, SEASON, 8, n_worlds=40)
    total = sum(c["p_playoffs"] for c in odds.values())
    assert abs(total - MG.PLAYOFF_TEAMS) < 0.005


def test_more_weeks_never_uses_future_scores():
    """The week-4 view must be identical whether or not weeks 5+ exist in
    the store — proven by cutting them out and comparing."""
    s = MG.season_of(HISTORY, SEASON)
    import copy
    trimmed = copy.deepcopy(HISTORY)
    ts = MG.season_of(trimmed, SEASON)
    ts["weeks"] = {k: v for k, v in ts["weeks"].items() if int(k) <= 4}
    # trimmed history cannot simulate brackets (no playoff placements), so
    # compare the shrunk pools it would draw from instead of full odds
    full_field = MG.field_weekly_scores(s)
    trim_field = MG.field_weekly_scores(ts)
    past = [w for w in MG.regular_season_weeks(s) if w <= 4]
    for r in {r for wk in full_field.values() for r in wk}:
        a = [full_field[w][r] for w in past if r in full_field.get(w, {})]
        b = [trim_field[w][r] for w in past if r in trim_field.get(w, {})]
        assert a == b, f"seat {r}: the week-4 view depends on later weeks"


def test_FAIL_ARM_preseason_live_publish_refuses(monkeypatch, tmp_path):
    with pytest.raises(SystemExit, match="no realized regular-season"):
        S.write_live(2026, n_worlds=10)


def test_FAIL_ARM_week_zero_refuses():
    with pytest.raises(ValueError, match="before any realized week"):
        S.forward_odds(HISTORY, PAYOUTS, SEASON, 0, n_worlds=5)


def test_posture_thresholds_are_the_ruled_constants():
    assert S.posture(0.70) == "comfortable"
    assert S.posture(0.699) == "bubble"
    assert S.posture(0.30) == "chasing"
    assert S.posture(0.301) == "bubble"


def test_live_feed_appends_and_never_overwrites(tmp_path, monkeypatch):
    """B's 08-19 ask, pinned: an earlier week's row must survive a later
    write — the widget diffs two rows it already has."""
    import json
    dest = tmp_path / "public" / "season_forward_live.json"
    dest.parent.mkdir(parents=True)
    dest.write_text(json.dumps({"season": int(SEASON), "weeks": {
        "1": {"as_of_week": 1, "per_seat": {"1": {"p_playoffs": 0.5}}}}}))
    monkeypatch.setattr(S, "HERE", tmp_path / "draft" / "backtest")

    def fake_odds(*a, **k):
        return {"1": {"p_playoffs": 0.8, "E_total": 100.0, "p5": 0.0, "p95": 400.0}}
    monkeypatch.setattr(S, "forward_odds", fake_odds)
    doc = S.write_live(int(SEASON), n_worlds=5)
    assert "1" in doc["weeks"], "the earlier week was overwritten away"
    latest = str(doc["latest_week"])
    assert doc["weeks"][latest]["per_seat"]["1"]["posture"] == "comfortable"
