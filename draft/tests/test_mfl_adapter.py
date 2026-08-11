"""The MFL adapter, tested against the shapes the probe actually observed.

Fixtures below are the REAL structures from mfl_schema_probe.json (runs 1-4), not
invented ones — that is the whole point of having probed first. Each of P1-P4 gets
a test that fails if the adapter reverts to the naive reading, because each of
those naive readings looks completely reasonable in isolation.

Rule 11 requirement 4 gets its own group: absent must never become zero. Those are
the quietest failures here — a coerced 0 passes the filters and drags every
downstream number toward the null, and nothing anywhere errors.
"""
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import ingest_filters as F  # noqa: E402
import mfl_adapter as A  # noqa: E402


# ── MFL's scalar wrapper, which is everywhere ───────────────────────────────
def test_t_unwraps_the_dollar_t_wrapper():
    assert A.t({"$t": "CC"}) == "CC"
    assert A.t("CC") == "CC"
    assert A.t(None) == ""


def test_listify_tolerates_the_singleton_dict():
    """Observed as types ['array','object'] on the SAME path across leagues.
    Iterating without this processes a single record's KEYS instead of the record."""
    assert A.listify({"id": "1"}) == [{"id": "1"}]
    assert A.listify([{"id": "1"}]) == [{"id": "1"}]
    assert A.listify(None) == []


# ── P1: draft type is a code ────────────────────────────────────────────────
def test_the_real_observed_code_maps_to_snake():
    """SFIRSTRANDOM is what every league in the probe sample actually returned."""
    assert A.draft_type({"$t": "SFIRSTRANDOM"}) == ("snake", "ok")


def test_an_unrecognised_code_is_NOT_silently_snake():
    """It must be its own attrition reason. Folding it into 'not a snake draft'
    would report that we checked something we did not."""
    kind, reason = A.draft_type("SOMETHING_NEW")
    assert kind is None and reason.startswith("draft_type_unrecognised")


def test_an_absent_draft_type_is_not_snake():
    assert A.draft_type("")[0] is None
    assert A.draft_type(None)[0] is None


def test_linear_and_reversal_are_distinguished_from_snake():
    assert A.draft_type("LINEAR")[0] == "linear"
    assert A.draft_type("3RR")[0] == "third_round_reversal"


# ── P2: range-string limits, and superflex has no slot name ─────────────────
REAL_STARTERS = {"starters": {"count": {"$t": "9"}, "position": [
    {"name": {"$t": "QB"}, "limit": {"$t": "1"}},
    {"name": {"$t": "RB"}, "limit": {"$t": "2"}},
    {"name": {"$t": "WR"}, "limit": {"$t": "2-3"}},
    {"name": {"$t": "TE"}, "limit": {"$t": "1"}},
]}}


def test_a_range_limit_does_not_raise_and_takes_the_minimum():
    """F1 does int(limit) and RAISES on "2-3". The minimum is what must start."""
    slots, sf, invalid = A.starter_slots(REAL_STARTERS)
    assert slots["WR"] == 2 and slots["QB"] == 1
    assert invalid == []


def test_superflex_is_detected_from_the_QB_RANGE_not_a_slot_name():
    """MFL has NO SUPER_FLEX slot — superflex IS a QB limit whose max exceeds its
    min. F1's superflex exclusion could never fire against MFL data, and superflex
    is the one thing F1 says would swamp every positional finding."""
    sfx = {"starters": {"position": [{"name": {"$t": "QB"}, "limit": {"$t": "1-2"}}]}}
    assert A.starter_slots(sfx)[1] is True
    assert A.starter_slots(REAL_STARTERS)[1] is False


def test_an_unparseable_limit_is_counted_invalid_not_defaulted():
    bad = {"starters": {"position": [{"name": {"$t": "RB"}, "limit": {"$t": "two"}}]}}
    slots, _, invalid = A.starter_slots(bad)
    assert "RB" not in slots
    assert invalid and invalid[0]["why"] == "unparseable"


# ── P3/P4: per-position scoring, often absent ───────────────────────────────
def _rules(pos_rules):
    return {"rules": {"positionRules": pos_rules}}


def test_reception_points_are_read_PER_POSITION():
    r = _rules([
        {"positions": {"$t": "WR|RB"}, "rule": [
            {"event": {"$t": "CC"}, "points": {"$t": "*0.5"}, "range": {"$t": "0-99"}}]},
        {"positions": {"$t": "TE"}, "rule": [
            {"event": {"$t": "CC"}, "points": {"$t": "*1"}, "range": {"$t": "0-99"}}]},
    ])
    by_pos, reason = A.reception_points_by_position(r)
    assert reason == "ok"
    assert by_pos["WR"] == 0.5 and by_pos["RB"] == 0.5 and by_pos["TE"] == 1.0


def test_TE_PREMIUM_is_EXCLUDED_which_F1_v1_would_have_admitted():
    """The P4 failure exactly: v1 read a single scalar `rec` that MFL does not
    have, so a 0.5/WR + 1.0/TE league would have passed as half-PPR."""
    ok, reason = F.ppr_reason({"RB": 0.5, "WR": 0.5, "TE": 1.0})
    assert ok is False and reason.startswith("F1.te_premium_or_split_ppr")
    assert "TE=1.0" in reason


def test_a_genuine_half_ppr_league_passes():
    assert F.ppr_reason({"RB": 0.5, "WR": 0.5, "TE": 0.5}) == (True, "ok")


def test_an_absent_scoring_export_is_its_OWN_reason_not_a_ppr_failure():
    """TYPE=rules returned {"error": "Error - No League Scoring Rules"} for part of
    the probe sample. Folding that into 'not half-PPR' conflates 'we could not
    tell' with 'we checked and it did not match'."""
    by_pos, reason = A.reception_points_by_position({"error": {"$t": "Error - No League Scoring Rules"}})
    assert by_pos == {} and reason == "no_scoring_rules"
    ok, why = F.ppr_reason(by_pos)
    assert ok is False and why.startswith("F4.no_scoring_rules")


def test_a_position_with_no_reception_rule_is_UNKNOWN_not_zero():
    """A missing rule is not 0.0 PPR. Zero would read as 'checked, not PPR'."""
    ok, why = F.ppr_reason({"RB": 0.5, "WR": 0.5})     # TE absent
    assert ok is False and "TE" in why and why.startswith("F4.no_scoring_rules")


def test_an_unparseable_points_expression_is_skipped_not_zeroed():
    r = _rules([{"positions": {"$t": "WR"}, "rule": [
        {"event": {"$t": "CC"}, "points": {"$t": "??"}}]}])
    by_pos, reason = A.reception_points_by_position(r)
    assert by_pos == {} and reason == "no_reception_rule"


def test_the_reception_code_is_the_one_MFL_documents():
    """CC = "This is the number of receptions in a game." — from TYPE=allRules
    (153 codes), not inferred from the letters."""
    assert A.RECEPTION_EVENT == "CC"


def test_a_singleton_rule_dict_is_still_read():
    """positionRules[].rule is types ['array','object'] on the same path."""
    r = _rules([{"positions": {"$t": "WR"}, "rule":
                 {"event": {"$t": "CC"}, "points": {"$t": "*0.5"}}}])
    assert A.reception_points_by_position(r)[0]["WR"] == 0.5


# ── the draft ───────────────────────────────────────────────────────────────
REAL_DRAFT = {"draftResults": {"draftUnit": {
    "unit": {"$t": "LEAGUE"}, "draftType": {"$t": "SFIRSTRANDOM"},
    "round1DraftOrder": {"$t": "0014,0010,0001"},
    "draftPick": [
        {"round": {"$t": "01"}, "pick": {"$t": "01"}, "franchise": {"$t": "0014"},
         "player": {"$t": "16641"}, "timestamp": {"$t": "1754013254"}, "comments": {"$t": ""}},
        {"round": {"$t": "01"}, "pick": {"$t": "02"}, "franchise": {"$t": "0010"},
         "player": {"$t": "13589"}, "timestamp": {"$t": "1754013300"}, "comments": {"$t": ""}},
    ]}}}


def test_picks_convert_with_per_pick_timestamps():
    rows, meta = A.draft_picks(REAL_DRAFT)
    assert [r["overall"] for r in rows] == [1, 2]
    assert rows[0]["team"] == "0014" and rows[0]["player"] == "16641"
    assert meta["first_pick_at"] == 1754013254
    assert meta["timestamp_coverage"] == 1.0


def test_a_missing_timestamp_is_None_not_epoch_zero():
    """Epoch 0 is 1970, which silently satisfies 'strictly before the draft' —
    the contamination check would pass on data it could not actually date."""
    d = {"draftResults": {"draftUnit": {"draftPick": [
        {"round": {"$t": "01"}, "pick": {"$t": "01"}, "franchise": {"$t": "1"},
         "player": {"$t": "9"}, "timestamp": {"$t": ""}}]}}}
    rows, meta = A.draft_picks(d)
    assert rows[0]["timestamp"] is None
    assert meta["timestamp_coverage"] == 0.0


def test_malformed_picks_are_counted_not_dropped_silently():
    d = {"draftResults": {"draftUnit": {"draftPick": [
        {"round": {"$t": "01"}, "pick": {"$t": "01"}, "franchise": {"$t": "1"}, "player": {"$t": "9"}},
        {"round": {"$t": "01"}, "pick": {"$t": "02"}, "franchise": {"$t": "2"}}]}}}
    rows, meta = A.draft_picks(d)
    assert len(rows) == 1 and len(meta["invalid"]) == 1
    assert meta["coverage"] == 0.5


def test_completeness_is_INFERRED_and_says_so():
    """draftResults carries no status field; F2 wants one. The inference is
    stated in meta rather than presented as a fact MFL supplied."""
    _, meta = A.draft_picks(REAL_DRAFT)
    assert "inferred" in meta["completeness_source"]
    assert A.draft_is_complete(meta, 2, 1) == (True, "ok")
    ok, why = A.draft_is_complete(meta, 12, 15)
    assert ok is False and why.startswith("F2.draft_incomplete:2/180")


def test_the_autopick_clause_is_reported_UNENFORCEABLE():
    """No autopick flag exists anywhere in draftResults — only free-text comments.
    F2's clause must report as unenforced rather than every league quietly
    passing it."""
    _, meta = A.draft_picks(REAL_DRAFT)
    assert meta["autopick_enforceable"] is False
    assert "UNENFORCED" in meta["autopick_note"]


def test_an_unknown_league_shape_does_not_claim_completeness():
    _, meta = A.draft_picks(REAL_DRAFT)
    assert A.draft_is_complete(meta, 0, 15)[1] == "F2.shape_unknown"


# ── the crosswalk at scale ──────────────────────────────────────────────────
# It composes draft/adp.py's matcher rather than reimplementing one. A crosswalk
# is the single best hiding place for a multi-derivation bug: a wrong-but-plausible
# match produces a REAL player and never errors, so the failure is invisible in
# every downstream number.
MFL_PLAYERS = {
    "16641": {"name": "Ja'Marr Chase", "position": "WR", "team": "CIN"},
    "13589": {"name": "Derrick Henry", "position": "RB", "team": "BAL"},
}


def _picks(*ids):
    return [{"overall": i + 1, "player": p} for i, p in enumerate(ids)]


def _fake_index(mapping):
    """Stand-in for the sleeper index; the real matcher is covered by adp's own
    tests, so this isolates the CROSSWALK's accounting."""
    return {"__fake__": mapping}


def _patch_matcher(monkeypatch, mapping):
    monkeypatch.setattr(A, "match_player_shared",
                        lambda meta, idx: (mapping.get(meta["name"]), "exact_name")
                        if mapping.get(meta["name"]) else (None, ""))


def test_crosswalk_reports_completeness(monkeypatch):
    _patch_matcher(monkeypatch, {"Ja'Marr Chase": "7564", "Derrick Henry": "3198"})
    rows, rep = A.crosswalk_picks(_picks("16641", "13589"), MFL_PLAYERS, _fake_index({}))
    assert rep["crosswalk_rate"] == 1.0 and rep["crosswalked"] == 2
    assert rows[0]["player_id"] == "7564"


def test_an_unknown_MFL_id_is_its_own_reason(monkeypatch):
    """'MFL gave us an id we never fetched' is NOT 'our board is missing players'.
    Conflating them makes the attrition report blame the wrong side."""
    _patch_matcher(monkeypatch, {"Ja'Marr Chase": "7564"})
    _, rep = A.crosswalk_picks(_picks("16641", "99999"), MFL_PLAYERS, _fake_index({}))
    assert rep["unknown_mfl_id"] == 1 and rep["no_sleeper_match"] == 0


def test_a_player_absent_from_our_board_is_a_DIFFERENT_reason(monkeypatch):
    _patch_matcher(monkeypatch, {"Ja'Marr Chase": "7564"})
    _, rep = A.crosswalk_picks(_picks("16641", "13589"), MFL_PLAYERS, _fake_index({}))
    assert rep["no_sleeper_match"] == 1 and rep["unknown_mfl_id"] == 0
    assert rep["unmatched_sample"][0]["name"] == "Derrick Henry"


def test_how_each_match_was_made_is_recorded(monkeypatch):
    """A systematic wrong-match shows as a DISTRIBUTION (everything landing via a
    loose method) rather than being found one player at a time."""
    _patch_matcher(monkeypatch, {"Ja'Marr Chase": "7564", "Derrick Henry": "3198"})
    rows, rep = A.crosswalk_picks(_picks("16641", "13589"), MFL_PLAYERS, _fake_index({}))
    assert rep["methods"] == {"exact_name": 2}
    assert all(r["matched_by"] for r in rows)


def test_the_F2_bar_is_inclusive_at_90_percent():
    assert A.crosswalk_verdict({"crosswalk_rate": 0.90})[0] is True
    ok, why = A.crosswalk_verdict({"crosswalk_rate": 0.899})
    assert ok is False and why.startswith("F2.crosswalk_below_90pct")


def test_an_empty_pick_list_does_not_claim_full_coverage():
    """0/0 must not read as 100% matched — a league we failed to fetch would
    otherwise sail through F2 as perfectly crosswalked."""
    _, rep = A.crosswalk_picks([], MFL_PLAYERS, _fake_index({}))
    assert rep["crosswalk_rate"] == 0.0
    assert A.crosswalk_verdict(rep)[0] is False


# ── the crosswalk TARGET must be the whole board ────────────────────────────
def test_board_index_includes_kept_players():
    """draft_data.json REMOVES drafted keepers from `players` into `kept_players`.
    An index from `players` alone misses them: measured on the live artifact, all
    three of Cory's keepers fail while Gibbs succeeds — 1/4 instead of 4/4.

    The miss is booked as `no_sleeper_match` ("our board lacks this player") when
    the truth is "we built the index from a partial pool", so it would fail real
    leagues for our own bug and blame the source."""
    import json
    board = json.loads((HERE.parent.parent / "public" / "draft_data.json").read_text())
    kept = board.get("kept_players") or []
    if not kept:
        return                                  # nothing to prove on a keeperless board
    idx = A.board_index(board)
    mfl = {str(i): {"name": k["name"], "position": k["position"], "team": k.get("team")}
           for i, k in enumerate(kept)}
    picks = [{"overall": i + 1, "player": str(i)} for i in range(len(kept))]
    _, rep = A.crosswalk_picks(picks, mfl, idx)
    assert rep["crosswalk_rate"] == 1.0, rep["unmatched_sample"]

    # And the partial index really does fail — so this test is not vacuous.
    from adp import build_index
    partial = build_index({str(p["player_id"]): {
        "full_name": p["name"], "position": p["position"], "team": p.get("team"),
        "search_rank": None} for p in board["players"]})
    _, bad = A.crosswalk_picks(picks, mfl, partial)
    assert bad["crosswalk_rate"] < 1.0, "the partial index should miss the keepers"
