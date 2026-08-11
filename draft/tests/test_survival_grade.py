"""SURVIVAL, END TO END — emitted from a clean context, graded from the draft itself.

The first external forecast that can be graded with no outcome data at all, which
means the harness produces a real graded observation today rather than after the
weekly-outcome ingest exists.

The two failures this file is shaped around are both LABELLING, not arithmetic:
a baseline's number stamped as a measurement of the shipped policy, and an
unresolvable forecast scored as a miss. Neither errors; both produce a Brier score
that looks like a result.

Run: python3 -m pytest draft/tests/test_survival_grade.py -q
"""
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import external_replay_run as R  # noqa: E402
import survival_grade as S  # noqa: E402

# A 4-seat, 3-round snake: 1..4, then 4..1, then 1..4.
#   seat T0 picks at overall 1, 8, 9
PICKS = []
for rnd in range(1, 4):
    order = range(4) if rnd % 2 else reversed(range(4))
    for seat in order:
        i = len(PICKS)
        PICKS.append({"overall": i + 1, "round": rnd, "team": "T%d" % seat,
                      "player_id": str(100 + i)})


# ── the seat's next turn, and the end of the draft ──────────────────────────
def test_the_next_turn_comes_from_the_SEAT_SEQUENCE():
    """T0 picks at 1, then not again until 8 — the snake turn. Six picks stand
    between, and that gap is what a survival forecast is about."""
    assert S.next_turn(PICKS, 1, "T0") == 8
    assert S.next_turn(PICKS, 8, "T0") == 9


def test_a_seats_LAST_pick_has_no_next_turn():
    """None, not the end of the draft standing in for a turn that never came."""
    assert S.next_turn(PICKS, 9, "T0") is None
    assert S.next_turn(PICKS, 12, "T3") is None


# ── resolution, and the boundary that inverts the quantity ─────────────────
def test_a_player_taken_IN_BETWEEN_did_not_survive():
    # T0 picks at 1 and 8; player 102 goes at overall 3.
    assert S.resolve(PICKS, 1, "T0", "102") is False


def test_a_player_still_there_DID_survive():
    assert S.resolve(PICKS, 1, "T0", "199") is True


def test_THE_PLAYER_THE_SEAT_TAKES_AT_ITS_NEXT_TURN_SURVIVED():
    """THE BOUNDARY, and getting it wrong inverts the quantity on exactly the
    players the forecast is about. Player 107 is taken by T0 at overall 8 — he
    was THERE TO BE TAKEN, so he survived. Including the seat's own next pick in
    the window would score every player it actually got as 'did not survive'.

    MUTATION: change the window to `overall < x <= nxt`. Red here and nowhere."""
    assert S.resolve(PICKS, 1, "T0", "107") is True


def test_the_forecasting_pick_ITSELF_is_outside_the_window():
    """The other side of the same interval: the player taken AT `overall` is not
    'taken in between'. MUTATION: `overall <= x < nxt`."""
    assert S.resolve(PICKS, 1, "T0", "100") is True


def test_a_forecast_at_a_seats_LAST_pick_is_UNRESOLVABLE_not_false():
    """None, never False. Scoring it as a miss would drag every Brier toward the
    same corner — the absent-is-not-zero failure, in a grader."""
    assert S.resolve(PICKS, 9, "T0", "199") is None


# ── the grader refuses what it cannot honestly average ──────────────────────
def _obs(overall, team, pid, value, policy="baseline:adp_logistic_v1"):
    return {"overall": overall, "payload": {"value": value, "player_id": pid,
                                            "team": team, "policy_id": policy}}


def test_a_MIXED_policy_set_RAISES_rather_than_averaging():
    """Two policies averaged into one Brier measures neither, and the number
    looks exactly like a measurement of both."""
    obs = [_obs(1, "T0", "199", 0.9), _obs(1, "T1", "198", 0.9, policy="shipped")]
    with pytest.raises(ValueError) as e:
        S.grade(obs, PICKS)
    assert "measures neither" in str(e.value)


def test_unresolvable_forecasts_are_COUNTED_and_kept_out_of_the_score():
    obs = [_obs(1, "T0", "199", 0.9), _obs(9, "T0", "199", 0.9)]
    g = S.grade(obs, PICKS)
    assert g["n_scored"] == 1 and g["n_unresolvable"] == 1


def test_a_perfect_forecast_scores_zero_and_a_backwards_one_scores_one():
    """Known-answer, arithmetic stated. Player 102 is taken between T0's picks at
    1 and 8, so the truth is 0. Forecasting 0.0 gives (0-0)^2 = 0; forecasting
    1.0 gives (1-0)^2 = 1."""
    assert S.grade([_obs(1, "T0", "102", 0.0)], PICKS)["brier"] == 0.0
    assert S.grade([_obs(1, "T0", "102", 1.0)], PICKS)["brier"] == 1.0


def test_the_baseline_reference_is_reported_so_a_score_can_be_judged():
    """A Brier with nothing to compare it against is a number, not a result. The
    honest floor is predicting the base rate every time: p(1-p)."""
    obs = [_obs(1, "T0", "102", 0.5), _obs(1, "T0", "199", 0.5)]
    g = S.grade(obs, PICKS)
    assert g["base_rate"] == 0.5
    assert g["brier_of_always_base_rate"] == 0.25          # 0.5 x 0.5, stated
    assert g["brier"] == 0.25 and g["beats_base_rate"] is False


def test_grading_NOTHING_returns_None_rather_than_a_perfect_score():
    """An empty set must not produce brier 0.0 — a run that graded nothing would
    read as a flawless one."""
    g = S.grade([], PICKS)
    assert g["n_scored"] == 0 and g["brier"] is None and g["beats_base_rate"] is None


# ── the labelling that keeps a baseline out of the shipped record ───────────
def test_a_BASELINE_is_never_read_as_the_shipped_policy():
    assert S.is_shipped_policy("baseline:adp_logistic_v1") is False
    assert S.is_shipped_policy(S.SHIPPED) is True
    assert S.is_shipped_policy(None) is False


def test_every_baseline_forecast_DECLARES_its_policy():
    """MUTATION: drop `policy_id` from the emitted extra. The observation would
    carry only the shipped weights' fingerprint and read as a measurement of the
    tool."""
    ctx = {"overall": 1, "team": "T0", "picks_until_next_turn": 7,
           "available": [{"player_id": "199", "adp": 12.0}]}
    fs = S.adp_baseline(ctx)
    assert fs and all(f["extra"]["policy_id"].startswith(S.BASELINE_PREFIX) for f in fs)
    assert all(not S.is_shipped_policy(f["extra"]["policy_id"]) for f in fs)


def test_the_resolution_rule_is_written_BEFORE_any_outcome_is_known():
    """A forecast whose rule is chosen later can be reinterpreted, which is how a
    null becomes a success."""
    ctx = {"overall": 1, "team": "T0", "picks_until_next_turn": 7,
           "available": [{"player_id": "199", "adp": 12.0}]}
    rule = S.adp_baseline(ctx)[0]["resolution_rule"]
    assert "still undrafted when this seat picks again" in rule
    assert "UNRESOLVABLE" in rule


# ── end to end through the real harness ────────────────────────────────────
def test_the_harness_emits_and_the_grader_scores_the_same_observations():
    """THE POINT OF THE UNIT: a real graded external observation, with no outcome
    data, no nflverse and no egress."""
    record = {
        "league_id": "L1", "teams": 10,
        "scoring": {"rec_by_position": {"RB": 0.5, "WR": 0.5, "TE": 0.5}},
        "roster_slots": {"QB": 1, "RB": 2, "WR": 2, "TE": 1, "FLEX": 1},
        "draft_type": "snake",
        "draft": {"status": "complete",
                  "picks": [dict(p, crosswalked=True, timestamp=1756141200 + p["overall"] * 600)
                            for p in PICKS]},
        "draft_at": "2025-08-25", "adp_observed_at": "2025-08-20",
        "pre_draft_adp": {"100": 1.0}, "has_weekly_outcomes": True, "unreadable": {},
    }
    snaps = [{"observed_at": "2025-08-20",
              "rows": [{"player_id": str(100 + i), "adp": float(i + 1)} for i in range(20)]}]
    out = R.replay_league(record, snaps, S.adp_baseline)
    assert out["observations"], "the baseline emitted nothing"
    # `emit_forecast` SPREADS `extra` into the payload rather than nesting it, so
    # player_id / team / policy_id are already top-level — the grader consumes an
    # observation exactly as the harness emits it, with no reshaping step that
    # could quietly become a second contract.
    assert "policy_id" in out["observations"][0]["payload"]
    g = S.grade(out["observations"], record["draft"]["picks"])
    assert g["n_scored"] > 0
    assert g["policy_id"].startswith(S.BASELINE_PREFIX), \
        "an external observation must never claim to be the shipped policy"
    assert 0.0 <= g["brier"] <= 1.0


def test_the_context_supplies_the_gap_WITHOUT_supplying_the_future():
    """`picks_until_next_turn` comes from the SEAT SEQUENCE, which every manager
    in the room knows. The selections in between are the future and must not be
    reachable from the context."""
    seen = []
    record = {"draft": {"picks": [dict(p, crosswalked=True) for p in PICKS]}}
    envs = R.decision_contexts(record, [{"player_id": str(100 + i), "adp": 1.0} for i in range(20)])
    for e in envs:
        seen.append(e["context"])
    first = seen[0]
    assert first["next_turn_overall"] == 8 and first["picks_until_next_turn"] == 7
    assert seen[-1]["next_turn_overall"] is None, "the last pick has no next turn"
    assert "actual_player_id" not in first
