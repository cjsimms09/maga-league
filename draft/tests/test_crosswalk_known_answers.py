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
    assert by_pos == {}, "a rule we cannot read must never become 0.0/reception"
    assert reason == "unreadable_reception_points"
    assert "WR" not in by_pos


# ── the checker's OWN vocabulary, checked against the matcher's ─────────────
def test_A_REAL_KICKER_IN_JACKSONVILLE_IS_NOT_A_CROSS_SOURCE_DISAGREEMENT():
    """THE DEFECT, on real board data. MFL spells a kicker `PK` and Jacksonville
    `JAC`; `build_index` already stored `_norm_pos`/`_norm_team` output, so the
    board says `K` and `JAX`. The old check compared MFL's RAW vocabulary against
    the board's NORMALISED one and reported `disagrees_on: ["position", "team"]` —
    the wrong-player signature — for a player the matcher resolved perfectly.

    The arithmetic, stated: `POS_ALIASES["PK"] == "K"` and `TEAM_ALIASES["JAC"] ==
    "JAX"`, both consulted by the matcher that MADE this pair. So the two sources
    agree; only the two spellings differed, and the difference was OURS.

    MUTATION: compare raw against normalised. Every kicker and every player on the
    nine aliased teams is accused of being the wrong player."""
    from adp import POS_ALIASES, TEAM_ALIASES
    assert POS_ALIASES["PK"] == "K" and TEAM_ALIASES["JAC"] == "JAX"

    little = next(p for p in POOL if p.get("name") == "Cam Little")
    assert little["position"] == "K" and little["team"] == "JAX", little

    mfl_players = {"77001": {"name": MADP._norm_name(mfl_name(little["name"])),
                             "position": "PK", "team": "JAC"}}
    rows, rep = A.crosswalk_picks([{"overall": 1, "player": "77001"}], mfl_players, INDEX)
    assert rows and str(rows[0]["player_id"]) == str(little["player_id"]), rep
    assert rep["conflicts"] == 0, rep["conflict_rows"]
    # ...and the near-miss is REPORTED, so the shrink is attributable rather than
    # a number that quietly got better.
    assert rep["vocabulary_only_agreements"] == 1


def test_a_REAL_position_disagreement_SURVIVES_normalisation():
    """The fix must not be a way to make conflicts go away. Normalisation only
    relabels a spelling both sides already agreed on; RB against WR is untouched.
    MUTATION: return no fields at all, and the wrong-player signature is deleted
    along with the vocabulary noise."""
    wr = next(p for p in POOL if p.get("position") == "WR" and p.get("player_id"))
    mfl_players = {"77002": {"name": MADP._norm_name(mfl_name(wr["name"])),
                             "position": "RB", "team": wr.get("team")}}
    rows, rep = A.crosswalk_picks([{"overall": 1, "player": "77002"}], mfl_players, INDEX)
    if rows:
        assert rep["conflicts"] == 1, rep
        assert rep["conflict_rows"][0]["disagrees_on"] == ["position"]
        assert rep["vocabulary_only_agreements"] == 0


def test_a_player_MFL_lists_with_NO_TEAM_has_not_CONTRADICTED_us():
    """Absent is not a disagreement — the same rule as everywhere else, in the
    checker. MUTATION: drop the presence guard and every player MFL leaves blank
    is filed as a cross-source conflict."""
    rb = next(p for p in POOL if p.get("position") == "RB" and p.get("team"))
    mfl_players = {"77003": {"name": MADP._norm_name(mfl_name(rb["name"])),
                             "position": "RB", "team": ""}}
    _, rep = A.crosswalk_picks([{"overall": 1, "player": "77003"}], mfl_players, INDEX)
    assert rep["conflicts"] == 0, rep["conflict_rows"]
    assert rep["vocabulary_only_agreements"] == 0


# ── the wrong match the conflict check found on its first real run ──────────
def test_A_TEAM_UNIT_IS_NOT_A_PLAYER_and_must_not_match_a_team_DEFENSE():
    """MEASURED, run 11: 103 picks whose MFL position was TMQB or TMPK matched a
    team DEFENSE — `TMQB -> DEF` 65 times, `TMPK -> DEF` 38. MFL names a team unit
    "Bills, Buffalo", `_norm_name` turns that into "Buffalo Bills", and Sleeper's
    Buffalo DEF carries the same full name. So the NAME matched, the crosswalk
    scored a success, and 103 picks were priced as a defense.

    This is the failure the conflict check exists for and it caught it: the rate
    went UP when these landed. MUTATION: match them anyway and report the conflict.
    A pick that is not a player has no right answer to be matched to."""
    d = next(p for p in POOL if p.get("position") == "DEF" and p.get("name"))
    mfl_players = {"77004": {"name": d["name"], "position": "TMQB", "team": d.get("team")}}
    rows, rep = A.crosswalk_picks([{"overall": 1, "player": "77004"}], mfl_players, INDEX)
    assert rows == [], "a team unit matched a board entity: %r" % (rows,)
    assert rep["team_units_refused"] == 1
    # ...and NOT folded into no_sleeper_match, which would report a gap in our
    # board coverage that does not exist.
    assert rep["no_sleeper_match"] == 1 and rep["conflicts"] == 0
    assert rep["unmatched_sample"][0]["why"] == "team_unit_not_a_player"


def test_a_TEAM_DEFENSE_is_a_real_board_entity_and_still_matches():
    """The refusal must be the TM-prefixed units only. `Def` is a position our
    board really carries, and refusing it would delete every defense pick in the
    pool. MUTATION: refuse anything team-shaped."""
    assert A.is_team_unit("TMQB") and A.is_team_unit("TMPK") and A.is_team_unit("tmwr")
    assert not A.is_team_unit("Def") and not A.is_team_unit("TM") and not A.is_team_unit("TE")
    assert not A.is_team_unit(None) and not A.is_team_unit("")
    # AND THE ONES THAT ARE NOT TM-PREFIXED. Run 12 surfaced 57 more of exactly the
    # same kind under names the prefix cannot reach: `ST -> DEF` 27 times and
    # `Off -> DEF` 30, with samples reading "Buffalo Bills ST BUF | Buffalo Bills
    # DEF BUF". Special teams and team offense are separate MFL entities sharing a
    # name with the team DEFENSE on our board, so they match it and score as a
    # success. MUTATION: keep only the prefix test; 57 picks are priced as defenses.
    assert A.is_team_unit("ST") and A.is_team_unit("Off") and A.is_team_unit("off")
    # ...and the real board entity survives, or every defense pick in the pool dies.
    assert not A.is_team_unit("DEF") and not A.is_team_unit("D") and not A.is_team_unit("K")


def test_the_unmatched_set_is_reported_as_a_COMPOSITION_not_ten_examples():
    """`unmatched_sample` is fine for counting a shortfall and useless for asking
    whether the shortfall is STRUCTURED — which is the question my own discovery
    audit named as an absent class:

        "I split conflicts by field but never asked whether unmatched players
         DIFFER SYSTEMATICALLY from matched ones (rookies? DSTs? suffixes?). If
         they do, every downstream number is biased in a direction nobody has
         characterised."

    Ten examples cannot answer it, and the full set is discarded at the end of the
    run — so the question was permanently unanswerable from the record. The
    composition is a dozen integers and makes it answerable on every run.

    The fixture is deliberately skewed: everything that matches is a real board
    player, everything that misses is a fabricated name. A reader must be able to
    see that the misses are not a random draw from the same population.
    """
    good = pick_players(4)
    mfl_players = {str(90000 + i): {"name": MADP._norm_name(mfl_name(p["name"])),
                                    "position": p["position"], "team": p.get("team")}
                   for i, p in enumerate(good)}
    for i in range(3):                       # names no board carries
        mfl_players[str(95000 + i)] = {"name": "Zzzz Nobodyson%d" % i,
                                       "position": "RB", "team": "FA"}
    picks = [{"overall": i + 1, "player": k} for i, k in enumerate(mfl_players)]
    _, rep = A.crosswalk_picks(picks, mfl_players, INDEX)

    assert "unmatched_composition" in rep, "the shortfall's shape is not reported"
    uc = rep["unmatched_composition"]
    assert uc["by_pos"].get("RB") == 3, uc
    # every unmatched row is counted, and the total ties back to the reported count
    assert sum(uc["by_pos"].values()) == uc["n"] == len(rep["unmatched_sample"]) + 0, uc
    assert uc["n"] == rep["no_sleeper_match"], (uc["n"], rep["no_sleeper_match"])
    # and the COMPARISON is what makes "systematically different" answerable.
    # NOT "RB is absent from the matches" — pick_players() draws real board players
    # and may well include RBs, which is what this assertion got wrong first time.
    # The answerable claim is that the two SHARES differ.
    mc = rep["matched_composition"]
    assert mc["n"] == rep["crosswalked"] == 4, mc
    assert sum(mc["by_pos"].values()) == mc["n"], mc
    miss_rb = uc["by_pos"].get("RB", 0) / uc["n"]
    hit_rb = mc["by_pos"].get("RB", 0) / mc["n"]
    assert miss_rb == 1.0 and miss_rb > hit_rb, (uc["by_pos"], mc["by_pos"])


def test_the_composition_counts_EVERY_unmatched_row_not_the_sample():
    """The whole point: the sample is capped at 10 and the composition is not."""
    mfl_players = {str(95000 + i): {"name": "Zzzz Nobodyson%d" % i,
                                    "position": "WR", "team": "FA"}
                   for i in range(25)}
    picks = [{"overall": i + 1, "player": k} for i, k in enumerate(mfl_players)]
    _, rep = A.crosswalk_picks(picks, mfl_players, INDEX)
    assert len(rep["unmatched_sample"]) == 10          # unchanged, still a sample
    assert sum(rep["unmatched_composition"]["by_pos"].values()) == 25


def test_an_unmatched_row_with_NO_POSITION_is_named_unknown_not_dropped():
    """Absent is never zero, applied to the composition itself.

    Found by a surviving mutation: folding a missing position away makes the
    composition's totals disagree with the count it sits beside, and a whole class
    of miss — the ones MFL gave us no position for — becomes invisible in the one
    report meant to characterise them.
    """
    mfl_players = {"96001": {"name": "Zzzz Nopositionson", "team": "FA"}}   # no position
    picks = [{"overall": 1, "player": "96001"}]
    _, rep = A.crosswalk_picks(picks, mfl_players, INDEX)
    uc = rep["unmatched_composition"]
    assert uc["by_pos"].get("unknown") == 1, uc
    assert uc["n"] == 1 == sum(uc["by_pos"].values()), uc


def test_the_suffix_count_catches_BOTH_spellings():
    """Suffixed names are one of the three hypotheses this composition exists to
    answer, and nothing tested them. `Jr` and `Jr.` are the same player and must
    count the same — a matcher that trips on one trips on the other."""
    names = ["Zzzz Aaaason Jr", "Zzzz Bbbbson Jr.", "Zzzz Cccc III", "Zzzz Dddd"]
    mfl_players = {str(97000 + i): {"name": n, "position": "WR", "team": "FA"}
                   for i, n in enumerate(names)}
    picks = [{"overall": i + 1, "player": k} for i, k in enumerate(mfl_players)]
    _, rep = A.crosswalk_picks(picks, mfl_players, INDEX)
    uc = rep["unmatched_composition"]
    assert uc["n"] == 4, uc
    assert uc["with_name_suffix"] == 3, uc      # Jr, Jr. and III — not the plain name
