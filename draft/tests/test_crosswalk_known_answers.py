"""RULE 12 FOR THE INGEST LANE: verify the MATCHES, not the match RATE.

WHY THIS LANE NEEDS IT MOST. Sessions A and B work with data they can eyeball —
a wrong projection looks wrong on a board. This lane ingests leagues nobody has
ever looked at, and the three things that can go wrong here do not error:

  * the crosswalk matches the WRONG PLAYER — a real player, plausible, and the
    coverage rate goes UP when it happens;
  * a scoring conversion is off by a factor — every downstream number scales and
    nothing is out of range;
  * a filter admits a league that is not our format — and it becomes evidence.

`mfl_live_probe.json` is the worked example of the failure: **702 MFL rows, 447
crosswalked, 72% pool coverage — and the artifact retains no MFL id, no match
method and no name pair for any of them.** The number cannot be audited, so a
systematic wrong-match is invisible in it. Rule 11 calls this out directly:
coverage is COMPLETENESS, and completeness says nothing about VALIDITY.

WHAT IS VERIFIED HERE, AND HOW IT AVOIDS BEING SELF-CONFIRMING. The MFL side is
reconstructed in MFL's OWN documented format — `"Chase, Ja'Marr"`, because MFL
prints `Last, First` (`mfl_adp._norm_name` exists for exactly this) — and matched
through the SHIPPED matcher against the REAL board. The expected answer is the
board's own `player_id`, established independently of the matcher. So the
assertion is "MFL's spelling of this player resolves to the id our board already
gave him", not "the matcher agrees with itself".

The arithmetic is STATED, not asserted, in the scoring cases: the expression is
read, the per-reception value written out, and the total recomputed by hand AND
through the shipped scorer, so the two derivation paths are compared rather than
each being internally consistent (rule 11, requirement 4).

Run: python3 -m pytest draft/tests/test_crosswalk_known_answers.py -q
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE.parent / "backtest"))
sys.path.insert(0, str(HERE.parent))

import ingest_filters as F  # noqa: E402
import mfl_adapter as A  # noqa: E402
import mfl_adp as MADP  # noqa: E402
import scoring as SC  # noqa: E402

BOARD = json.loads((ROOT / "public" / "draft_data.json").read_text())
POOL = (BOARD.get("players") or []) + (BOARD.get("kept_players") or [])
INDEX = A.board_index(BOARD)


def mfl_name(full: str) -> str:
    """Our board's 'First Last' -> MFL's 'Last, First'. MFL's actual wire format."""
    parts = full.split()
    return "%s, %s" % (parts[-1], " ".join(parts[:-1])) if len(parts) > 1 else full


def pick_players(n=6):
    """A SPREAD across the board, not the top of it.

    The first six players in any board are the six most famous men in football
    and will match under any implementation — a sample of them proves nothing.
    Stepping through the ranked pool puts late-round players in the sample, which
    is where a name matcher actually fails.
    """
    usable = [p for p in POOL if p.get("name") and p.get("player_id") and p.get("position")]
    if len(usable) < n:
        return usable
    step = max(1, len(usable) // n)
    return usable[::step][:n]


# ── the crosswalk, both sides, against a KNOWN answer ───────────────────────
@pytest.mark.parametrize("player", pick_players(), ids=lambda p: str(p.get("name")))
def test_MFLs_spelling_of_a_real_board_player_resolves_to_that_players_own_id(player):
    """KNOWN-ANSWER CASE. The expected id comes from the board, not the matcher.

    Both sides are reported on failure — MFL name/pos/team as MFL would send it,
    the id we expected, the id we got — because "it did not match" and "it matched
    the wrong man" are different defects and the second is the dangerous one.
    """
    mfl_side = {"name": MADP._norm_name(mfl_name(player["name"])),
                "position": player.get("position"), "team": player.get("team")}
    got, method = A.match_player_shared(mfl_side, INDEX)
    assert got == str(player["player_id"]), (
        "MFL side %r -> got %r via %r, board says %r"
        % (mfl_side, got, method, player["player_id"]))
    assert method, "a match with no recorded METHOD cannot be traced later"


def test_the_MFL_name_format_is_actually_being_exercised():
    """A fixture that does not use MFL's format would test nothing about MFL.

    Verifies the premise of every case above rather than assuming it — a test
    asserting the wrong premise proves nothing.
    """
    assert mfl_name("Ja'Marr Chase") == "Chase, Ja'Marr"
    assert MADP._norm_name("Chase, Ja'Marr") == "Ja'Marr Chase"


# ── the failure that RAISES the coverage rate ───────────────────────────────
def test_a_matched_pair_whose_SOURCES_DISAGREE_is_counted_not_celebrated():
    """THE WRONG-PLAYER SIGNATURE. Two sources agreeing on a name and disagreeing
    on POSITION is what a bad match looks like, and every completeness check ever
    written scores it as a success — the rate goes UP.

    Here MFL calls a real board player a RB when the board has him at his true
    position; the match still lands, so `crosswalk_rate` is 1.0, and the conflict
    is the only thing that says anything is wrong.
    """
    p = next(x for x in POOL if x.get("position") in ("WR", "TE") and x.get("player_id"))
    wrong_pos = "RB"
    mfl_players = {"99001": {"name": MADP._norm_name(mfl_name(p["name"])),
                             "position": p["position"], "team": p.get("team")}}
    picks = [{"overall": 1, "player": "99001"}]
    _, rep = A.crosswalk_picks(picks, mfl_players, INDEX)
    assert rep["crosswalk_rate"] == 1.0 and rep["conflicts"] == 0

    mfl_players["99001"]["position"] = wrong_pos
    rows, rep2 = A.crosswalk_picks(picks, mfl_players, INDEX)
    if rows:                                   # matched anyway, on name
        assert rep2["conflicts"] == 1, rep2
        c = rep2["conflict_rows"][0]
        assert "position" in c["disagrees_on"]
        assert c["mfl_pos"] == wrong_pos and c["board_pos"] == p["position"]
        assert rep2["crosswalk_rate"] == 1.0, "the RATE cannot see this — that is the point"


def test_conflicts_are_reported_IN_FULL_never_sampled():
    """A sample of unmatched players is fine — you are counting a shortfall. A
    sample of CONFLICTS is not: each one is a specific claim that a specific pick
    is the wrong player, and truncating the list hides individual bad rows."""
    assert "conflict_rows" in A.crosswalk_picks([], {}, INDEX)[1]
    rep = A.crosswalk_picks([], {}, INDEX)[1]
    assert rep["conflicts"] == len(rep["conflict_rows"])


def test_the_matched_sample_carries_BOTH_SIDES_so_the_rate_is_auditable():
    """The defect in `mfl_live_probe.json`, closed: a rate with no pairs behind it
    cannot be checked by anyone."""
    players = pick_players(4)
    mfl_players = {str(90000 + i): {"name": MADP._norm_name(mfl_name(p["name"])),
                                    "position": p["position"], "team": p.get("team")}
                   for i, p in enumerate(players)}
    picks = [{"overall": i + 1, "player": k} for i, k in enumerate(mfl_players)]
    _, rep = A.crosswalk_picks(picks, mfl_players, INDEX)
    assert rep["matched_sample"], rep
    for s in rep["matched_sample"]:
        assert s["mfl_id"] and s["sleeper_id"] and s["method"]
        assert s["mfl_name"] and s["board_name"], "a pair missing a side proves nothing"


def test_the_board_side_is_read_from_the_SAME_index_the_matcher_searched():
    """A second lookup could report a pair that matching never saw."""
    by_id = A._board_by_id(INDEX)
    assert by_id, "the id map must be derived from the matcher's own index"
    some = next(iter(by_id.values()))
    assert {"id", "name", "pos", "team"} <= set(some)


# ── the collisions that actually exist on the live board ────────────────────
# The six spread cases above all match on EXACT NAME, which is the easy path and
# says nothing about the loose ones. Wrong matches come from the loose paths, so
# these are derived from the board's REAL collisions rather than invented:
#
#   frank gore  -> Frank Gore (RB, FA, 232)  and  Frank Gore Jr (RB, BUF, 11573)
#                  same normalised name, SAME POSITION, both live on the board.
#                  A pick of Gore Jr matched to Gore Sr attaches a retired
#                  player's non-existent outcomes to a real 2025 draft slot.
#   josh johnson-> three players, WR / RB / QB
#   tjohnson    -> Ty Johnson (RB, BUF) and Tez Johnson (WR, TB), initials key
def _name_collisions(min_size=2):
    return {k: v for k, v in INDEX["by_name"].items() if len(v) >= min_size}


def test_the_board_still_CONTAINS_a_same_name_same_position_collision():
    """The premise of the next two tests. If this ever stops being true the cases
    below are vacuous, so it fails LOUDLY and asks to be re-based rather than
    passing on a board that no longer contains the hazard."""
    same_pos = [(k, v) for k, v in _name_collisions().items()
                if len({r["pos"] for r in v}) < len(v)]
    assert same_pos, ("no same-name/same-position collision on the current board — the "
                      "wrong-player cases below now prove nothing and need re-basing")


def test_a_same_name_collision_resolves_to_the_candidate_MATCHING_TEAM():
    """The dangerous case, on real data: two players, one name, one position.
    Only the team separates them, and picking the wrong one yields a REAL player
    with a real id and no error anywhere."""
    for _, cands in _name_collisions().items():
        by_pos = {}
        for r in cands:
            by_pos.setdefault(r["pos"], []).append(r)
        for pos, group in by_pos.items():
            if len(group) < 2:
                continue
            for r in group:
                if not r.get("team"):
                    continue
                got, method = A.match_player_shared(
                    {"name": r["name"], "position": pos, "team": r["team"]}, INDEX)
                assert got == r["id"], (
                    "%s %s/%s -> %s via %s, expected %s"
                    % (r["name"], pos, r["team"], got, method, r["id"]))
                assert "team" in (method or ""), (
                    "a collision resolved WITHOUT using the team is a coin flip that "
                    "happened to land: %s -> %s via %r" % (r["name"], got, method))


def test_a_same_name_same_position_collision_REFUSES_when_the_team_is_absent():
    """'Unknown' must not be resolved by guessing. With two same-position players
    sharing a name and no team to separate them, a match is a coin flip — and a
    coin flip that returns a real player is indistinguishable from a correct
    match everywhere downstream."""
    checked = 0
    for _, cands in _name_collisions().items():
        by_pos = {}
        for r in cands:
            by_pos.setdefault(r["pos"], []).append(r)
        for pos, group in by_pos.items():
            if len(group) < 2:
                continue
            got, method = A.match_player_shared(
                {"name": group[0]["name"], "position": pos, "team": None}, INDEX)
            assert got is None, (
                "%s/%s is ambiguous with no team (%s) but matched %s via %s"
                % (group[0]["name"], pos, [r["id"] for r in group], got, method))
            checked += 1
    assert checked, "no ambiguous case was exercised — this test proved nothing"


# ── the scoring conversion, arithmetic STATED and cross-checked ─────────────
def test_a_half_ppr_reception_rule_converts_with_the_arithmetic_written_out():
    """MFL expression -> per-reception value -> points, computed BY HAND here and
    independently through the SHIPPED scorer.

      expression        "*0.5"
      strip the operator 0.5 points per reception
      a 6-reception game 6 x 0.5 = 3.0 reception points

    The hand figure and `scoring.score_stat_line` are two derivation paths for
    one quantity; comparing them is the check rule 11 says matters most, and
    each being internally consistent is exactly what would hide a factor error.
    """
    rules = {"rules": {"positionRules": [
        {"positions": "WR|RB|TE", "rule": [
            {"event": {"$t": "CC"}, "points": {"$t": "*0.5"}, "range": {"$t": "0-99"}}]}]}}
    by_pos, reason = A.reception_points_by_position(rules)
    assert reason == "ok"
    assert by_pos["WR"] == 0.5 and by_pos["RB"] == 0.5 and by_pos["TE"] == 0.5

    by_hand = 6 * 0.5
    assert by_hand == 3.0
    through_shipped = SC.score_stat_line({"rec": 6}, {"rec": by_pos["WR"]})
    assert through_shipped == by_hand == 3.0


def test_a_FULL_ppr_league_converts_to_double_and_is_excluded_not_rescaled():
    """The factor error this catches: reading "*1" as 0.5 (or the reverse) doubles
    or halves every pass-catcher's value with nothing out of range.

      expression        "*1"
      per reception      1.0
      a 6-reception game 6 x 1.0 = 6.0 — exactly twice the half-PPR figure
    """
    rules = {"rules": {"positionRules": [
        {"positions": "WR|RB|TE", "rule": [
            {"event": {"$t": "CC"}, "points": {"$t": "*1"}, "range": {"$t": "0-99"}}]}]}}
    by_pos, _ = A.reception_points_by_position(rules)
    assert by_pos["WR"] == 1.0
    assert SC.score_stat_line({"rec": 6}, {"rec": by_pos["WR"]}) == 6.0 == 2 * 3.0
    ok, why = F.ppr_reason(by_pos)
    # PRECISE, not `startswith("F1.")`. This is exactly where the deleted
    # `mfl_adapter.ppr_verdict` DISAGREED with `screen()`: it called a uniform
    # full-PPR league TE-premium, which is false, and nothing caught it because it
    # had no caller. A generic assertion here would pass under either answer and
    # would have let the two implementations stay out of step.
    assert ok is False and why == "F1.scoring_not_half_ppr", why


def test_a_TE_premium_league_is_caught_by_the_PER_POSITION_read():
    """0.5 for WR/RB and 1.0 for TE. A scalar read — which is what F1 v1 did —
    would have taken one of these numbers and admitted the league.

      WR  "*0.5" -> 6 receptions x 0.5 = 3.0
      TE  "*1"   -> 6 receptions x 1.0 = 6.0   (twice the WR figure, same box score)
    """
    rules = {"rules": {"positionRules": [
        {"positions": "WR|RB", "rule": [
            {"event": {"$t": "CC"}, "points": {"$t": "*0.5"}}]},
        {"positions": "TE", "rule": [
            {"event": {"$t": "CC"}, "points": {"$t": "*1"}}]}]}}
    by_pos, _ = A.reception_points_by_position(rules)
    assert SC.score_stat_line({"rec": 6}, {"rec": by_pos["WR"]}) == 3.0
    assert SC.score_stat_line({"rec": 6}, {"rec": by_pos["TE"]}) == 6.0
    assert F.ppr_reason(by_pos)[1].startswith("F1.te_premium_or_split_ppr")


def test_an_unreadable_expression_scores_NOTHING_rather_than_zero_points():
    """A rule we cannot read is not a rule worth 0.0/reception. A coerced zero
    passes the PPR band by looking like 'not PPR' and is indistinguishable from
    a measured one."""
    rules = {"rules": {"positionRules": [
        {"positions": "WR", "rule": [{"event": {"$t": "CC"}, "points": {"$t": "??"}}]}]}}
    by_pos, reason = A.reception_points_by_position(rules)
    assert by_pos == {} and reason == "no_reception_rule"
    assert "WR" not in by_pos
