"""THE SHARED TEAM VOCABULARY — one table, and the two ways it goes wrong.

FOUND BY C (2026-08-11), CROSS-LANE. `TEAM_ALIASES` carried FFC's abbreviations
and was commented as though FFC were the only source with quirks. MFL uses its
own set, six of which had no entry, so pairs where BOTH SOURCES AGREE and only
the spelling differs were reporting as team disagreements — C measured 956 of
them. C declined to keep a private table in its own lane, which is the right
call: two tables for one question is how the two come to disagree without either
being wrong on its own terms.

WHAT IS VERIFIED HERE AND WHAT IS NOT. The 956 is C's count, taken from MFL
responses this sandbox cannot reach — it is not reproduced. What IS checked, and
independently of C's list, is the CAUSE: the standard MFL abbreviation set
differs from Sleeper's for exactly eight franchises, two of which (JAC, LVR)
were already covered for FFC, leaving exactly the six C named. If C's list had
been short by one, this file would say so.

THE TWO FAILURE MODES THE TABLE HAS.

  · An alias pointing at something that is not a team. `"NEP": "NEW"` normalises
    cleanly, matches nothing, and looks exactly like a player who changed teams.
  · An alias whose target is ITSELF an alias key. `_norm_team` resolves exactly
    once, so `"LVR": "OAK"` beside `"OAK": "LV"` yields OAK — a two-hop rename
    that silently half-applies. The table is clean today; this keeps it so.

Run: python3 -m pytest draft/tests/test_team_aliases.py
"""
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "draft"))

import adp as ADP  # noqa: E402

# The abbreviations MFL publishes. Written out rather than fetched: the point is
# to hold the table against a source we cannot reach from here, and a fixture
# that fetched its own expectation would only prove the fetch worked.
MFL_ABBREVIATIONS = {
    "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN",
    "DET", "GBP", "HOU", "IND", "JAC", "KCC", "LAC", "LAR", "LVR", "MIA",
    "MIN", "NEP", "NOS", "NYG", "NYJ", "PHI", "PIT", "SEA", "SFO", "TBB",
    "TEN", "WAS",
}


def test_every_mfl_abbreviation_normalises_to_a_real_team():
    """The defect itself. Six of these resolved to themselves and matched nothing."""
    unresolved = {a for a in MFL_ABBREVIATIONS
                  if ADP._norm_team(a) not in ADP.NFL_TEAMS}
    assert not unresolved, (
        "MFL abbreviations with no entry in the shared table — every pair using "
        "one of these reports a team disagreement where the sources agree: %s"
        % sorted(unresolved))


def test_the_six_are_exactly_the_remainder_and_not_one_more():
    """C's list, checked rather than adopted.

    MFL and Sleeper differ for eight franchises; JAC and LVR were already in the
    table for FFC. If the delta were seven or nine, C's report was incomplete and
    this says which way.
    """
    delta = {a for a in MFL_ABBREVIATIONS if a not in ADP.NFL_TEAMS}
    assert delta == {"GBP", "JAC", "KCC", "LVR", "NEP", "NOS", "SFO", "TBB"}, sorted(delta)
    newly_added = delta - {"JAC", "LVR"}
    assert newly_added == {"GBP", "KCC", "NEP", "NOS", "SFO", "TBB"}, sorted(newly_added)


def test_no_alias_points_at_something_that_is_not_a_team():
    """A typo'd target normalises cleanly and looks like a player who moved."""
    bad = {k: v for k, v in ADP.TEAM_ALIASES.items() if v not in ADP.NFL_TEAMS}
    assert not bad, "alias targets that are not real teams: %s" % bad


def test_no_alias_target_is_itself_an_alias_key():
    """_norm_team resolves ONCE. A two-hop rename half-applies in silence."""
    chained = {k: v for k, v in ADP.TEAM_ALIASES.items() if v in ADP.TEAM_ALIASES}
    assert not chained, (
        "alias targets that are themselves aliases — _norm_team applies one hop, "
        "so these resolve to the intermediate value: %s" % chained)


def test_an_alias_never_renames_a_real_team():
    """A canonical code must survive normalisation untouched, or the table would
    be able to move players off a team that exists."""
    moved = {t: ADP._norm_team(t) for t in ADP.NFL_TEAMS if ADP._norm_team(t) != t}
    assert not moved, moved


def test_the_shipped_board_uses_only_codes_this_table_knows():
    """Checked AGAINST the declared set, not derived from it (rule 10d).

    `FA` is Sleeper's free-agent marker rather than a team, and is the one
    allowed non-team value — named here so it cannot quietly grow a companion.
    """
    p = os.path.join(ROOT, "public", "draft_data.json")
    if not os.path.exists(p):
        return
    with open(p, encoding="utf-8") as fh:
        board = json.load(fh)
    seen = {(pl or {}).get("team") for pl in board.get("players") or []}
    seen = {t for t in seen if t}
    unknown = seen - ADP.NFL_TEAMS - {"FA"}
    assert not unknown, "board carries team codes the vocabulary does not know: %s" % sorted(unknown)
