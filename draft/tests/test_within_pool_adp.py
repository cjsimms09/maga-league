"""D7 — the board must be frozen before the decision, verifiably, pick by pick.

Three ways this leaks, and every one of them produces a board that looks entirely
normal:

  1. a pick made AFTER the decision, admitted because its DRAFT started earlier
  2. the league's OWN picks in the board it is graded against
  3. a player with one observation priced as if he had an ADP

Run: python3 -m pytest draft/tests/test_within_pool_adp.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import within_pool_adp as W  # noqa: E402

DAY = 86400
T0 = 1722470400          # 2024-08-01T00:00:00Z, a round anchor for the arithmetic


def pick(league, player, overall, ts):
    return {"league_id": league, "player": str(player), "overall": overall, "timestamp": ts}


# ── 1. THE SHARP EDGE: per-PICK, not per-DRAFT ─────────────────────────────
def test_a_pick_made_AFTER_the_decision_is_excluded_even_though_its_draft_STARTED_EARLIER():
    """THE ONE A CARELESS VERSION GETS WRONG. League E starts on day 0 and is still
    drafting on day 5. A decision on day 3 may see E's day-0 picks and MUST NOT see
    its day-5 picks — but "leagues whose draft started earlier" admits both, and
    "leagues whose draft COMPLETED earlier" admits both or neither.

    MUTATION: filter on a per-league start time instead of the pick's own stamp.
    The board gains picks from the future and nothing anywhere says so."""
    pool = [pick("E", 1, 1, T0), pick("E", 2, 2, T0 + 5 * DAY)]
    got = W.qualifying_picks(pool, before_ts=T0 + 3 * DAY, exclude_league="L")
    assert [p["player"] for p in got] == ["1"], "a day-5 pick reached a day-3 decision"


def test_a_pick_at_EXACTLY_the_decision_time_is_excluded():
    """STRICTLY before. A pick made at the same instant was not observable when the
    decision was made."""
    pool = [pick("E", 1, 1, T0)]
    assert W.qualifying_picks(pool, before_ts=T0, exclude_league="L") == []
    assert len(W.qualifying_picks(pool, before_ts=T0 + 1, exclude_league="L")) == 1


def test_an_UNDATED_pick_is_dropped_and_COUNTED_never_assumed_early():
    """A pick we cannot date cannot be shown to precede anything. Admitting it
    would be the whole F5 guarantee resting on an assumption."""
    pool = [pick("E", 1, 1, None), pick("E", 2, 2, T0)]
    b = W.board(pool, T0 + DAY, "L", min_support=1)
    assert b["contributing_picks"] == 1 and b["undated_picks_dropped"] == 1


# ── 2. SELF-EXCLUSION, STRUCTURALLY ────────────────────────────────────────
def test_a_LEAGUES_OWN_PICKS_never_enter_the_board_it_is_graded_against():
    """MUTATION: drop the exclude_league filter. Every league would be priced
    against a board containing its own answers — the same leak already caught in
    the replay when the actual pick was popped off the decision context."""
    pool = [pick("L", 9, 1, T0), pick("E", 9, 40, T0)]
    b = W.board(pool, T0 + DAY, exclude_league="L", min_support=1)
    assert b["rows"] == [{"player_id": "9", "adp": 40.0, "n": 1}], \
        "the league's own pick 1 leaked into its own board"


def test_the_exclusion_is_not_optional_in_the_SIGNATURE():
    """`exclude_league` has no default. A caller cannot forget the filter that
    stops a league grading itself, because the call will not compile without it."""
    import inspect
    sig = inspect.signature(W.qualifying_picks)
    assert sig.parameters["exclude_league"].default is inspect.Parameter.empty
    assert inspect.signature(W.board).parameters["exclude_league"].default \
        is inspect.Parameter.empty


# ── 3. SUPPORT: one observation is not an ADP ──────────────────────────────
def test_a_player_BELOW_SUPPORT_is_ABSENT_from_the_board_not_priced_LATE():
    """MUTATION: keep him with n=1. He would appear at whatever pick he happened to
    go at once — a phantom bargain in front of every policy that reads the board,
    and it looks exactly like a real price."""
    pool = [pick("E%d" % i, 7, 10, T0) for i in range(12)] + [pick("Z", 8, 200, T0)]
    b = W.board(pool, T0 + DAY, "L", min_support=10)
    assert [r["player_id"] for r in b["rows"]] == ["7"]
    assert b["players_below_support"] == 1


def test_the_ADP_is_the_MEAN_and_the_SUPPORT_travels_with_it():
    """Arithmetic stated: picks at 10, 20 and 30 over three leagues average to 20.0
    with n=3. A mean with no n cannot be judged."""
    pool = [pick("A", 5, 10, T0), pick("B", 5, 20, T0), pick("C", 5, 30, T0)]
    b = W.board(pool, T0 + DAY, "L", min_support=3)
    assert b["rows"] == [{"player_id": "5", "adp": 20.0, "n": 3}]


def test_the_board_is_SORTED_by_adp_like_the_store_expects():
    pool = [pick("A", 1, 50, T0), pick("A", 2, 5, T0), pick("B", 1, 50, T0),
            pick("B", 2, 5, T0)]
    rows = W.board(pool, T0 + DAY, "L", min_support=2)["rows"]
    assert [r["player_id"] for r in rows] == ["2", "1"]


def test_the_board_DECLARES_its_source_so_it_cannot_pass_as_provider_ADP():
    b = W.board([], T0, "L")
    assert b["adp_source"] == "within_pool_v1"


def test_support_sensitivity_publishes_the_WHOLE_CURVE():
    """`min_support` is fixed in the registration; publishing the curve is what
    stops it being read as a tuned parameter."""
    pool = [pick("E%d" % i, 7, 10, T0) for i in range(12)] \
        + [pick("F%d" % i, 8, 20, T0) for i in range(6)]
    s = W.support_sensitivity(pool, T0 + DAY, "L")
    assert s["5"] == 2 and s["10"] == 1 and s["25"] == 0
    assert W.MIN_SUPPORT == 10, "the registered primary"


# ── the measurement D7 declared before it ran ──────────────────────────────
def _spread_pool(n_leagues, picks_each=12, start=T0, step=DAY):
    """n leagues drafting one day apart, each taking the same 12 players."""
    pool, leagues = [], []
    for i in range(n_leagues):
        ts = start + i * step
        leagues.append({"league_id": "L%d" % i, "first_pick_ts": ts})
        for j in range(picks_each):
            pool.append(pick("L%d" % i, j, j + 1, ts))
    return leagues, pool


def test_feasibility_reports_WHICH_leagues_get_a_board_not_just_how_many():
    leagues, pool = _spread_pool(20)
    f = W.feasibility(leagues, pool, min_support=10, need_players=5)
    assert f["leagues_dated"] == 20
    # The first ten leagues have fewer than 10 prior leagues behind them, so no
    # player reaches support; the later ones do.
    assert f["leagues_with_usable_board"] > 0
    assert f["usable_in_earlier_half"] < f["usable_in_later_half"]


def test_the_verdict_says_LATE_SKEWED_when_only_later_drafts_are_usable():
    """D7's registered limit: a route that works only for drafts closest to the
    season has not rescued a PRESEASON decision, and the verdict must say so
    rather than reporting the count and letting it read as a win."""
    leagues, pool = _spread_pool(20)
    v = W.feasibility(leagues, pool, min_support=10, need_players=5)["verdict"]
    assert "LATE" in v.upper()


def test_a_pool_that_does_NOT_spread_produces_NO_usable_board_and_says_so():
    """THE ROUTE-CLOSING RESULT, and it must be stated as a fact about the pool
    rather than as an empty table. Every league drafting at the same instant means
    no pick precedes any decision."""
    leagues, pool = _spread_pool(30, step=0)
    f = W.feasibility(leagues, pool, min_support=10, need_players=5)
    assert f["leagues_with_usable_board"] == 0
    assert "do not spread enough" in f["verdict"]


def test_UNDATED_leagues_are_counted_rather_than_dropped_from_the_denominator():
    leagues, pool = _spread_pool(5)
    leagues.append({"league_id": "X", "first_pick_ts": None})
    f = W.feasibility(leagues, pool, min_support=1, need_players=1)
    assert f["leagues_examined"] == 6 and f["leagues_dated"] == 5
    assert f["leagues_undated"] == 1


def test_no_dated_league_at_all_is_a_statement_about_OUR_TIMESTAMPS():
    f = W.feasibility([{"league_id": "X", "first_pick_ts": None}], [])
    assert "about the timestamps we hold, not about the route" in f["verdict"]


# ── M4: are the early drafters a different population? ─────────────────────
def test_a_COVARIATE_that_MOVES_across_the_calendar_is_named_not_buried():
    """D7 registered this and it is not a nicety: if the leagues that draft first
    are systematically different, a board built from earlier picks is 'the early
    drafters before T', not 'the market before T' — and that difference is
    invisible in an ADP number.

    Here every early league is 12-team and every late one is 10-team."""
    leagues = [{"league_id": "E%d" % i, "first_pick_ts": T0 + i * DAY, "teams": 12}
               for i in range(4)] + \
              [{"league_id": "L%d" % i, "first_pick_ts": T0 + (10 + i) * DAY, "teams": 10}
               for i in range(4)]
    c = W.calendar_covariates(leagues, keys=("teams",))
    assert c["by_key"]["teams"]["early"] == {"12": 4}
    assert c["by_key"]["teams"]["late"] == {"10": 4}
    assert c["by_key"]["teams"]["differs"] is True
    assert "EARLY AND LATE DRAFTERS DIFFER" in c["verdict"]


def test_a_covariate_that_does_NOT_move_says_so_without_a_warning():
    """A check that always warns is one nobody reads."""
    leagues = [{"league_id": str(i), "first_pick_ts": T0 + i * DAY, "teams": 10}
               for i in range(8)]
    c = W.calendar_covariates(leagues, keys=("teams",))
    assert c["by_key"]["teams"]["differs"] is False
    assert "no covariate we hold distinguishes" in c["verdict"]
    assert "DIFFER" not in c["verdict"]


def test_an_ABSENT_covariate_is_its_OWN_bucket_not_folded_into_the_modal_value():
    """A covariate we could not read is not evidence that the halves agree."""
    leagues = [{"league_id": "E", "first_pick_ts": T0, "teams": 10},
               {"league_id": "L", "first_pick_ts": T0 + DAY}]
    c = W.calendar_covariates(leagues, keys=("teams",))
    assert c["by_key"]["teams"]["late"] == {"(absent)": 1}
    assert c["by_key"]["teams"]["differs"] is True


def test_a_covariate_ABSENT_FOR_EVERY_LEAGUE_is_a_WRONG_KEY_not_an_agreement():
    """CAUGHT BEFORE IT EVER RAN, and it is the same shape as three other defects
    today: M4 was written reading `keepers` while the league record carries
    `keeper_type`. Every league would have reported "(absent)", the halves would
    have "agreed", and the keeper covariate would have read as a finding — forever.

    MUTATION: drop the vacuous_key check. The verdict goes back to saying no
    covariate distinguishes early from late, which is a statement about a key that
    does not exist."""
    leagues = [{"league_id": str(i), "first_pick_ts": T0 + i * DAY, "teams": 10}
               for i in range(6)]
    c = W.calendar_covariates(leagues, keys=("teams", "a_key_no_record_carries"))
    assert c["by_key"]["a_key_no_record_carries"]["vacuous_key"] is True
    assert c["by_key"]["teams"]["vacuous_key"] is False
    assert "ABSENT FOR EVERY LEAGUE" in c["verdict"]
    assert "Nothing has been measured" in c["verdict"]


def test_the_DEFAULT_covariate_keys_are_ones_the_RECORD_ACTUALLY_CARRIES():
    """The guard above catches it at runtime; this catches it at test time, against
    the real producer rather than against a fixture I wrote."""
    import inspect
    import re
    import mfl_adapter as A
    src = inspect.getsource(A.to_league_record)
    emitted = set(re.findall(r'^\s+"(\w+)":', src, re.M))
    defaults = inspect.signature(W.calendar_covariates).parameters["keys"].default
    missing = [k for k in defaults if k not in emitted]
    assert not missing, "M4 reads keys the record does not emit: %s" % missing
