# TERRITORY: C
"""THE ARTIFACTS MUST NOT CONTRADICT THEMSELVES, AND THEIR CAVEATS MUST SURVIVE.

Three artifacts landed today — pace, durability, and the projection-spread
reconciliation. Every number in them was measured with egress this sandbox has and
CI does not, so they cannot be regenerate-and-compared the way `waiver_replacement.json`
is. What CAN be asserted is the two things that actually go wrong with a file like
this:

  1. **THE SUMMARY DISAGREES WITH THE CONTENTS.** The shipped board carried
     `fallback_unordered_tied: 1509` on a 686-player board this very morning — a
     provenance figure describing a population that no longer existed. A per-position
     mean recomputed from the per-player rows is a SECOND ROUTE to the same number,
     and two routes part company exactly when one of them stops being maintained.

  2. **A CAVEAT QUIETLY DISAPPEARS.** Every one of these findings is conditional —
     survivorship, kickers unmeasured rather than zero, playoffs included, seasons
     pooled. A number that outlives the sentence qualifying it becomes a fact, and
     that is how "2025 is absent" survived a fortnight as a belief.

Run: python3 -m pytest draft/tests/test_nflverse_artifacts.py -q
"""
import json
from pathlib import Path
from statistics import mean

import pytest

ROOT = Path(__file__).resolve().parents[2]
BT = ROOT / "draft" / "backtest"


def _load(name):
    p = BT / name
    if not p.exists():
        pytest.skip("%s not present" % name)
    return json.loads(p.read_text())


# ── 1. THE SUMMARY IS DERIVED FROM THE ROWS, SO CHECK IT AGAINST THEM ────────

def test_DURABILITY_BY_POSITION_AGREES_WITH_ITS_OWN_PLAYER_ROWS():
    """Two routes to one number. `by_position[pos]["mean_games"]` is a summary; the
    per-player `mean_games` are the evidence. They are written at different moments
    and nothing but this makes them agree.

    MUTATION: compute the summary over a different population — say, all players
    rather than the matched ones — and the artifact reports a positional mean no row
    in it supports, exactly like `fallback_unordered_tied: 1509` on a 686-player
    board."""
    art = _load("nflverse_durability.json")
    rows = art["players"]
    for pos, summ in art["by_position"].items():
        mine = [r["mean_games"] for r in rows.values() if r["position"] == pos]
        assert len(mine) == summ["n"], (pos, len(mine), summ["n"])
        assert abs(mean(mine) - summ["mean_games"]) < 0.01, pos


def test_DURABILITY_GAP_IS_THE_SUBTRACTION_IT_CLAIMS_TO_BE():
    """`gap` must equal realized minus the board constant. A gap computed against a
    different constant than the one printed beside it is unfalsifiable by reading.

    MUTATION: leave `gap` stale after `board_games_expected` changes — the table
    reads as consistent and every conclusion drawn from it is off by the drift."""
    art = _load("nflverse_durability.json")
    for pos, s in art["by_position"].items():
        assert abs((s["mean_games"] - s["board_games_expected"]) - s["gap"]) < 0.011, pos


def test_THE_RECONCILIATION_PREDICTION_ACTUALLY_MATCHES_THE_OBSERVATION():
    """The whole claim is that one mechanism explains both spread findings, and the
    evidence for it is that the prediction lands on the observation. If they drift
    apart the claim is dead, and it must die loudly rather than sit in a file.

    MUTATION: widen the tolerance to 10x — the artifact keeps asserting "one
    mechanism" while the two numbers say otherwise, which is the claim surviving its
    own refutation."""
    art = _load("projection_spread_vs_realized.json")
    rec = art["reconciliation"]["by_position"]
    for pos, r in rec.items():
        pred, obs = r["predicted_weekly_overstatement"], r["observed_weekly_overstatement"]
        assert abs(pred - obs) / obs < 0.15, (pos, pred, obs)
        # AND THE PREDICTION IS THE PRODUCT IT SAYS IT IS, not a fitted number.
        implied = r["season_too_narrow_by"] * (1.0 / r["weekly_share_of_season_variance"] ** 0.5)
        assert abs(implied - pred) < 0.02, (pos, implied, pred)


def test_EVERY_SPREAD_ROW_IS_A_RATIO_OF_THE_TWO_COLUMNS_BESIDE_IT():
    """MUTATION: compute `ratio` against the played-only spread while printing the
    zero-inclusive one — the table understates the board's error by the exact amount
    the missed weeks contribute, in the direction that makes the board look better."""
    art = _load("projection_spread_vs_realized.json")
    for pid, r in art["players"].items():
        if not r.get("ratio"):
            continue
        want = r["board_weekly_sd"] / r["measured_weekly_sd_with_missed_as_zero"]
        assert abs(want - r["ratio"]) < 0.01, pid


# ── 2. THE CAVEATS OUTLIVE NOBODY ───────────────────────────────────────────

@pytest.mark.parametrize("name,needles", [
    ("nflverse_pace.json", ["game script", "playoffs"]),
    ("nflverse_durability.json", ["SURVIVORSHIP", "rookies"]),
    ("projection_spread_vs_realized.json", ["SURVIVORSHIP", "K and DEF"]),
])
def test_THE_CAVEATS_ARE_STILL_IN_THE_FILE(name, needles):
    """Not a style check. Each of these sentences is the difference between a number
    and a claim: pace is contaminated by game script, availability is measured on
    survivors, and kickers are UNMEASURED rather than zero. A reader who gets the
    figure without the sentence gets a stronger result than the data supports.

    MUTATION: drop a caveat block while keeping its numbers — which is precisely how
    "2025 is absent" outlived the fact that it never was."""
    blob = json.dumps(_load(name))
    for n in needles:
        assert n in blob, "%s lost its caveat mentioning %r" % (name, n)


def test_KICKERS_ARE_EXCLUDED_FROM_THE_SPREAD_ARTIFACT_not_recorded_as_zero():
    """`nflverse_weekly_to_scoring` scores every kicker week at 0.0 through this
    path, so a kicker sd of 0.00 is a fact about our mapping and not about kickers.
    Recording it would be a measured-looking zero.

    MUTATION: include them — a position appears with sd 0.0 and reads as the most
    predictable thing on the board, which would make kickers look like free
    certainty in any consumer that sorts on spread."""
    art = _load("projection_spread_vs_realized.json")
    assert not [r for r in art["players"].values() if r["position"] in ("K", "DEF")]
    assert "K" not in art["by_position"] and "DEF" not in art["by_position"]


def test_PACE_KEEPS_RAW_AND_NEUTRAL_APART_for_every_team():
    """The module's whole design is that a single blended "adjusted" number hides
    which half is doing the work. An artifact that carried only one of them would
    retire that decision silently.

    MUTATION: drop `plays_per_game` and keep only the neutral figure — the gap
    between them, which IS the signal that a team's raw volume was garbage time,
    becomes underivable from the file."""
    art = _load("nflverse_pace.json")
    teams = art["teams"]
    assert len(teams) == 32, len(teams)
    for t, v in teams.items():
        assert v.get("plays_per_game") is not None, t
        assert v.get("neutral_plays_per_game") is not None, t
    # AND THE HEADLINE RHO IS THE REASON THE TWO ARE KEPT APART.
    assert art["raw_vs_neutral_rank_rho"] < 0.8, art["raw_vs_neutral_rank_rho"]


def test_THE_PER_PLAYER_PRIOR_DELTA_IS_THE_SUBTRACTION_IT_CLAIMS():
    """Same class as the `gap` check above, on the block that would actually feed
    a board. `delta` must be `expected_games - position_prior`; a stale delta
    beside a live prior is unfalsifiable by reading, and this is the number a
    consumer would sort on.

    MUTATION: leave `delta` behind when the shrinkage setting changes — every row
    reads as internally consistent while describing a different `k` than the one
    it is filed under."""
    art = _load("nflverse_durability.json")
    prior = art.get("per_player_prior")
    if not prior:
        pytest.skip("per_player_prior not present")
    for setting, block in prior["settings"].items():
        for pid, r in block["players"].items():
            assert abs((r["expected_games"] - r["position_prior"]) - r["delta"]) < 0.011, \
                (setting, pid)


def test_SHRINKAGE_MOVES_PLAYERS_TOWARD_THE_PRIOR_never_away():
    """The whole point of `k` is that a larger one trusts the player's own history
    less. If a setting with more shrinkage moved somebody FURTHER from his position
    constant, the parameter would not mean what its docstring says.

    MUTATION: report the raw history under every k — the table shows three
    identical rows and the choice A is being asked to make looks like it does not
    matter."""
    art = _load("nflverse_durability.json")
    prior = art.get("per_player_prior")
    if not prior:
        pytest.skip("per_player_prior not present")
    s = prior["settings"]
    assert s["shrink_k=None"]["median_abs_delta"] > s["shrink_k=1"]["median_abs_delta"] \
        > s["shrink_k=2"]["median_abs_delta"], {k: v["median_abs_delta"] for k, v in s.items()}
    for pid, raw in s["shrink_k=None"]["players"].items():
        for k in ("shrink_k=1", "shrink_k=2"):
            r = s[k]["players"].get(pid)
            if r:
                assert abs(r["delta"]) <= abs(raw["delta"]) + 1e-6, (pid, k)
