"""THE REPLAY->MONEY BRIDGE — the harness's final increment, gated in CI.

Two layers, per the routing order ("the bridge's real test belongs in CI where
nflverse/FFC egress works"):

  * STRUCTURAL (runs everywhere, fixtures): roster reconstruction — keepers +
    per-policy choices, the 'actual' identity, ghost-duplicate dedupe — plus
    coverage honesty and the weekly-scoring/money wiring against real history.

  * CI GATE (skips cleanly when the egress-built artifacts are absent): after
    `cli.py` builds bundles + weekly_points and `dump-replay.js` dumps the
    choices, the real invariants must hold — the 'actual' policy reproduces each
    seat's true drafted roster, every policy money-grades finite and bounded,
    and actual-roster coverage clears the honesty floor. Experiments consume the
    full replay path ONLY behind this gate (lab.yml `replay-bridge` job).
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

import pytest

BT = Path(__file__).resolve().parent.parent / "backtest"
sys.path.insert(0, str(BT))
import bridge as BR      # noqa: E402
import money_grade as MG  # noqa: E402

BUNDLES = BT / "bundles.json"
RECORDS = BT / "replay-records.json"
WEEKLY = BT / "weekly_points.json"
HAVE_ARTIFACTS = BUNDLES.exists() and RECORDS.exists() and WEEKLY.exists()


# --- structural fixtures (run everywhere) ------------------------------------

DUMP = {
    "keepers": [{"roster_id": 1, "player_id": "k1"}, {"roster_id": 2, "player_id": "k2"}],
    "records": [
        {"pick_no": 1, "round": 1, "roster_id": 1, "actual": "a1",
         "choices": {"b0": "x1", "b3": "y1"}},
        {"pick_no": 2, "round": 1, "roster_id": 2, "actual": "a2",
         "choices": {"b0": "x2", "b3": "y2"}},
        {"pick_no": 3, "round": 2, "roster_id": 1, "actual": "a3",
         "choices": {"b0": "x1", "b3": "y3"}},   # b0 repeats x1 — the ghost dupe
    ],
}


def test_actual_policy_reproduces_history():
    r = BR.policy_roster(DUMP, "actual", 1)
    assert r["roster"] == ["k1", "a1", "a3"]      # keeper first, then history's picks
    assert r["duplicates"] == 0


def test_policy_roster_takes_that_policys_choices_only():
    r = BR.policy_roster(DUMP, "b3", 1)
    assert r["roster"] == ["k1", "y1", "y3"]
    r2 = BR.policy_roster(DUMP, "b3", 2)
    assert r2["roster"] == ["k2", "y2"]           # seat 2 sees only its own picks


def test_ghost_duplicates_are_deduped_and_counted():
    r = BR.policy_roster(DUMP, "b0", 1)
    assert r["roster"] == ["k1", "x1"]            # x1 held once
    assert r["duplicates"] == 1                    # and the repeat is on the record


def test_coverage_reports_the_honesty_floor():
    weekly = {"1": {"a": 10.0}, "2": {"a": 8.0, "b": 5.0}}
    assert BR.coverage_of(["a", "b"], weekly) == 1.0
    assert BR.coverage_of(["a", "zz"], weekly) == 0.5
    assert BR.coverage_of([], weekly) == 0.0


def test_weekly_scoring_and_money_wiring_on_real_history():
    # A synthetic two-man roster over a synthetic per-week table, graded against
    # the REAL 2025 field: the wiring (scores -> grade_substituted) must produce
    # bounded, finite money without touching network.
    pos = {"q": "QB", "r": "RB"}
    weekly = {str(w): {"q": 20.0, "r": 12.0} for w in range(1, 16)}
    scores = BR.weekly_scores_for(["q", "r"], weekly, pos)
    assert scores[1] == 32.0 and len(scores) == 15
    hist, pay = MG.load_history(), MG.load_payouts()
    g = BR.grade_policy_seat(hist, pay, "2025", 1, ["q", "r"], weekly, pos)
    p = MG.season_pay(pay, "2025")
    assert 0 <= g["weekly_high"] <= p["weekly_high_total"]
    assert g["regular_season"] in (0.0, float(p["rs_champ"]), float(p["rs_runner_up"]))
    assert g["coverage"] == 1.0


# --- the CI gate (real artifacts; skips in the sandbox) ----------------------

pytestmark_ci = pytest.mark.skipif(
    not HAVE_ARTIFACTS,
    reason="bridge artifacts absent — built only in CI (nflverse/FFC egress)")


@pytestmark_ci
def test_ci_actual_rosters_match_the_real_drafts():
    bundles = json.loads(BUNDLES.read_text())
    dump = json.loads(RECORDS.read_text())["seasons"]
    for b in bundles.get("bundles", []):
        season = str(b["season"])
        sd = dump.get(season)
        assert sd, f"{season} missing from replay dump"
        # History's roster per seat, straight from the bundle's pick stream.
        want: dict[int, set] = {}
        for p in b.get("picks", []):
            want.setdefault(int(p["roster_id"]), set()).add(str(p["player_id"]))
        for rid, players in want.items():
            got = set(BR.policy_roster(sd, "actual", rid)["roster"])
            assert got == players, f"{season} seat {rid}: bridge != draft history"


@pytestmark_ci
def test_ci_every_policy_money_grades_bounded():
    res = BR.run_bridge(BUNDLES, RECORDS, WEEKLY)
    _, pay = MG.load_history(), MG.load_payouts()
    graded = 0
    for season, rows in res["seasons"].items():
        if "skipped" in rows:
            continue
        p = MG.season_pay(pay, season)
        for policy, per_seat in rows.items():
            for rid, g in per_seat.items():
                assert 0 <= g["weekly_high"] <= p["weekly_high_total"], (season, policy, rid)
                assert g["regular_season"] in (0.0, float(p["rs_champ"]), float(p["rs_runner_up"]))
                graded += 1
    assert graded > 0, "the bridge graded nothing — the gate must not pass vacuously"


@pytestmark_ci
def test_ci_actual_coverage_clears_the_honesty_floor():
    # Real drafted rosters are real NFL players; if fewer than 60% of them have
    # weekly rows, the crosswalk or the weekly pull is broken and every policy
    # verdict downstream would be noise. Hold the floor.
    res = BR.run_bridge(BUNDLES, RECORDS, WEEKLY, policies=("actual",))
    checked = 0
    for season, rows in res["seasons"].items():
        if "skipped" in rows:
            continue
        for rid, g in rows["actual"].items():
            assert g["coverage"] >= 0.6, f"{season} seat {rid}: coverage {g['coverage']}"
            checked += 1
    assert checked > 0
