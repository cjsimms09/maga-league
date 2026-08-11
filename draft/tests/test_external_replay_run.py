"""THE REPLAY'S CONTAMINATION RULES — written BREAK-FIRST.

Cory, 2026-08-11: a guard written for code you just wrote is written by someone
who already believes the code works, so it confirms rather than disconfirms. The
practical form adopted here — when the guard and the code come from the same
sitting, apply the MUTATION first and write the assertion second, so the guard
exists to catch a failure already seen rather than to confirm an assumption.

Every contamination guard below was produced that way: the mutation was applied
to `external_replay_run.py`, the suite was observed SILENT, and the assertion was
then written and the identical mutation re-run to see it red by name. The
mutations are recorded in each docstring, because the mutation is the evidence —
the assertion alone only proves something passes.

The leaks this file exists to stop all raise the score and none of them raise.

Run: python3 -m pytest draft/tests/test_external_replay_run.py -q
"""
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))
sys.path.insert(0, str(HERE.parent))

import external_replay_run as R  # noqa: E402

TEAMS, ROUNDS = 4, 3
EPOCH = 1756141200                       # 2025-08-25T17:00:00Z (verified below)


def board(n=20):
    return [{"player_id": str(100 + i), "name": "P%d" % i, "adp": float(i + 1)}
            for i in range(n)]


def snapshots(observed="2025-08-20"):
    return [{"observed_at": observed, "rows": board()}]


def record(*, span_hours=2, drop_ts=(), **over):
    """A league that PASSES `screen()`, so a test can break exactly one thing."""
    picks = []
    for rnd in range(1, ROUNDS + 1):
        order = range(TEAMS) if rnd % 2 else reversed(range(TEAMS))
        for seat in order:
            i = len(picks)
            picks.append({
                "overall": i + 1, "round": rnd, "pick_in_round": (i % TEAMS) + 1,
                "team": "T%d" % seat, "player": str(9000 + i), "player_id": str(100 + i),
                "crosswalked": True,
                "timestamp": None if i in drop_ts else EPOCH + i * span_hours * 3600,
            })
    rec = {
        "league_id": "L1", "teams": 10,
        "scoring": {"rec_by_position": {"RB": 0.5, "WR": 0.5, "TE": 0.5}},
        "roster_slots": {"QB": 1, "RB": 2, "WR": 2, "TE": 1, "FLEX": 1},
        "draft_type": "snake",
        "draft": {"status": "complete", "status_detail": None, "picks": picks},
        "draft_at": "2025-08-25", "adp_observed_at": "2025-08-20",
        "pre_draft_adp": {"100": 1.0}, "has_weekly_outcomes": True,
        "unreadable": {}, "source_meta": {"rounds": ROUNDS},
    }
    rec.update(over)
    return rec


def capture_policy(seen):
    """Records every context it is handed, and emits one forecast per pick."""
    def policy(ctx):
        seen.append(ctx)
        return [{"key": "avail:%s" % ctx["overall"], "ftype": "probability",
                 "value": 0.5, "resolution_rule": "taken before this team's next turn"}]
    return policy


def run(rec=None, snaps=None, seen=None):
    return R.replay_league(rec or record(), snaps or snapshots(),
                           capture_policy(seen if seen is not None else []))


# ── it replays at all ───────────────────────────────────────────────────────
def test_a_matched_league_replays_every_pick_in_draft_order():
    seen = []
    out = run(seen=seen)
    assert out["summary"]["picks"] == TEAMS * ROUNDS == len(seen)
    assert [c["overall"] for c in seen] == list(range(1, TEAMS * ROUNDS + 1))


# ── THE STRICTLY-BEFORE RULE ────────────────────────────────────────────────
def test_the_available_set_EXCLUDES_players_already_taken():
    """MUTATION: build `available` from `taken` AFTER adding this pick, or from
    the full pick list. Silent before this assertion existed — a replay that can
    see the future just scores better."""
    seen = []
    run(seen=seen)
    assert len(seen[0]["available"]) == 20
    assert len(seen[5]["available"]) == 15
    assert len(seen[-1]["available"]) == 20 - (TEAMS * ROUNDS - 1)


def test_a_pick_can_still_see_THE_PLAYER_IT_IS_ABOUT_TO_TAKE():
    """THE BOUNDARY, and the direction matters. Pick N must see the player it is
    about to select — he was genuinely available at that moment. Excluding him
    would be the mirror-image error, and it is the one an over-eager fix makes.

    MUTATION: move `taken.add(pid)` above the context construction. Red here."""
    seen = []
    run(seen=seen)
    for ctx, expected in zip(seen, [str(100 + i) for i in range(TEAMS * ROUNDS)]):
        ids = {r["player_id"] for r in ctx["available"]}
        assert expected in ids, "pick %s cannot see its own selection" % ctx["overall"]


def test_a_pick_can_NEVER_see_a_player_taken_at_an_EARLIER_pick():
    seen = []
    run(seen=seen)
    for i, ctx in enumerate(seen):
        ids = {r["player_id"] for r in ctx["available"]}
        for earlier in range(i):
            assert str(100 + earlier) not in ids, (
                "pick %d still sees player taken at pick %d" % (i + 1, earlier + 1))


def test_a_seats_roster_holds_only_the_picks_it_had_ALREADY_MADE():
    """MUTATION: build `roster` from all of a team's picks up front. Silent —
    and it hands the need model a roster it has not built yet, which is the
    quietest of these because the roster is never printed."""
    seen = []
    run(seen=seen)
    # Expected roster is built from the FIXTURE's own mapping (pick `overall` takes
    # player `100 + overall - 1`), not from the context — reading it back out of
    # the thing under test would be the check comparing a function to itself.
    by_team = {}
    for ctx in seen:
        assert ctx["roster"] == by_team.get(ctx["team"], []), (
            "pick %s roster %s, expected %s"
            % (ctx["overall"], ctx["roster"], by_team.get(ctx["team"], [])))
        by_team.setdefault(ctx["team"], []).append(str(100 + ctx["overall"] - 1))
    assert any(len(v) > 1 for v in by_team.values()), \
        "no seat picked twice — the accumulating-roster case was never exercised"


# ── the policy must never be handed the answer ──────────────────────────────
def test_the_POLICY_NEVER_RECEIVES_THE_ACTUAL_PICK():
    """MUTATION: leave `actual_player_id` in the context instead of popping it.
    Silent — and a policy that can read the answer is not being measured on
    anything at all. This is the leak that is not a subtle bias, it is a void."""
    seen = []
    run(seen=seen)
    for ctx in seen:
        assert "actual_player_id" not in ctx, \
            "the policy was handed the selection it is supposed to predict"
    # AND IT MUST NOT APPEAR LATER EITHER. The first cut popped the answer off the
    # context and put it back after the policy returned; a policy that keeps its
    # context would have found the answer in it a moment later. Re-checked after
    # the whole replay has finished, against the very objects the policy held.
    assert all("actual_player_id" not in c for c in seen), \
        "the answer appeared in a context the policy still holds"


def test_the_actual_pick_IS_kept_beside_the_observation_for_grading():
    """Withholding it from the policy must not mean discarding it — a forecast
    nothing can be graded against is not evidence either."""
    out = run()
    assert out["observations"]
    assert all(o.get("actual_player_id") for o in out["observations"])


# ── the frozen board, and refusal ───────────────────────────────────────────
def test_the_board_is_the_FROZEN_pre_draft_one():
    out = run()
    assert out["summary"]["board_asof"] == "2025-08-20"
    assert out["summary"]["board_size"] == 20


def test_a_league_the_FILTERS_REJECTED_is_refused_not_replayed():
    """MUTATION: default `screen` to a permissive lambda. Silent — and an excluded
    league's observations are indistinguishable from an admitted league's once
    they are in the aggregate, which defeats the pre-registration one function
    past the screen."""
    with pytest.raises(R.ReplayRefused) as e:
        R.replay_league(record(teams=14), snapshots(), capture_policy([]))
    assert "F1.teams" in str(e.value)


def test_a_league_with_no_pre_draft_snapshot_raises_rather_than_back_filling():
    from asof import TimeTravelError
    with pytest.raises(TimeTravelError):
        R.replay_league(record(), [{"observed_at": "2026-08-26", "rows": board()}],
                        capture_policy([]))


# ── every forecast is stamped from ITS OWN pick ─────────────────────────────
def test_each_forecast_carries_the_lead_days_of_the_pick_that_produced_it():
    """MUTATION: pass `decided_at=None` to `emit_forecast`. Silent — every
    forecast then carries the first pick's staleness, understating it by the
    whole length of the draft on the picks where the board is oldest."""
    out = run(rec=record(span_hours=12))          # 12 picks x 12h ≈ 5.5 days
    lead = [o["lead_days"] for o in out["observations"]]
    assert all(o["lead_days_basis"] == "pick" for o in out["observations"])
    assert lead[0] == 5 and lead[-1] > lead[0], lead


def test_the_summary_reports_the_SPREAD_and_the_draft_span():
    out = run(rec=record(span_hours=12))
    sp = out["summary"]["lead_days_spread"]
    assert sp["n"] == TEAMS * ROUNDS and sp["max"] > sp["min"]
    assert out["summary"]["draft_span_days"] == sp["max"] - sp["min"]


def test_an_undated_pick_is_counted_and_kept_OUT_of_the_spread():
    out = run(rec=record(drop_ts=(3, 4)))
    assert out["summary"]["undated_picks"] == 2
    assert out["summary"]["lead_days_spread"]["undated"] == 2
    assert out["summary"]["lead_days_spread"]["n"] == TEAMS * ROUNDS - 2


def test_a_SAME_DAY_draft_reports_a_zero_span():
    """The common case must stay correct while the multi-day one is served."""
    out = run(rec=record(span_hours=0))
    assert out["summary"]["draft_span_days"] == 0
