"""Register 91 — `crosswalk_misses` shipped as a bare `9` and named nobody, and
one of the nine was CORY'S KEEPER.

`public/expert_spread_2026.json` feeds the war room's expert-split badge. It
declared `crosswalk_misses: 9` with no list, so nothing could be checked
against Cory's roster — and **Kenneth Walker III (ECR 23, one of his three
keepers) was one of them.** That is register 80's shape in a second artifact:
a diagnostic whose existence was mistaken for the check having been done.

ROOT CAUSE, measured rather than guessed. `_norm("Kenneth Walker III")` is
`"kenneth walker"` — the suffix strips correctly, so this is NOT a name
normalisation bug. The index simply has no such key: `sleeper_name_index`
deliberately EXCLUDES any name held by two rostered players (*"a caller gets no
answer rather than a wrong one"*), and "kenneth walker" collides between an
inactive WR (4634) and the KC running back (8151). **The exclusion discards the
candidates the caller was about to disambiguate** — this caller already
compares position on the very next line.

The fix reads the published `collisions` block and accepts a UNIQUE position
match, plus reuses `adp.NICKNAMES` (rule 11 — one crosswalk) rather than
inventing a fuzzy rule here.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

ART = ROOT / "public" / "expert_spread_2026.json"


def doc():
    return json.loads(ART.read_text())


def test_corys_keeper_is_crosswalked_and_to_the_RUNNING_BACK():
    """The known-positive. Walker must resolve, and to 8151 — the KC running
    back the board carries — never to 4634, the inactive receiver he collides
    with. Resolving to the wrong man would be worse than not resolving."""
    d = doc()
    row = next((p for p in d["players"] if p["name"] == "Kenneth Walker III"), None)
    assert row is not None, "the FantasyPros feed no longer carries him"
    assert row["player_id"] == "8151", row
    assert row["position"] == "RB"


def test_the_ambiguous_names_are_still_refused():
    """The known-negative, and it is the one that keeps the fix honest.

    Where position does NOT disambiguate, the answer must stay absent — Kyle
    Williams is three rostered WRs and Frank Gore Jr. is two RBs. A fix that
    resolved these would have eroded the exact principle the index's collision
    exclusion exists to protect, and would look identical in a pass/fail count.
    """
    d = doc()
    unmatched = {p["name"] for p in d["crosswalk_unmatched"]}
    assert "Kyle Williams" in unmatched, d["crosswalk_unmatched"]
    assert "Frank Gore Jr." in unmatched, d["crosswalk_unmatched"]


def test_the_diagnostic_NAMES_them_rather_than_only_counting():
    """A bare count cannot tell you one of them is a keeper. Register 80."""
    d = doc()
    assert "crosswalk_unmatched" in d
    assert len(d["crosswalk_unmatched"]) == d["crosswalk_misses"]
    for row in d["crosswalk_unmatched"]:
        assert row.get("name") and row.get("position")


def test_every_recovery_records_HOW_it_was_recovered():
    """A recovered id with no stated mechanism is unauditable — the next reader
    cannot tell a position-disambiguated collision from a fuzzy guess."""
    d = doc()
    assert d["crosswalk_recovered"], "no recoveries at all is itself suspicious"
    for r in d["crosswalk_recovered"]:
        assert r["via"] in ("collision+position", "adp.NICKNAMES"), r
        assert r["player_id"] and r["name"]


def test_FAIL_ARM_removing_the_collision_fallback_loses_the_keeper():
    """A guard that has never failed has not been tested.

    Re-run the join WITHOUT the collision fallback and confirm Walker goes
    missing again. If this passes with the fallback disabled, the fallback is
    not what is resolving him and every claim above is attributing the fix to
    the wrong mechanism.
    """
    import expert_grading as EG
    idx = EG.name_index()
    norm = EG._norm("Kenneth Walker III")
    assert norm not in idx, (
        "the index now contains him directly, so the collision fallback is no "
        "longer the mechanism under test — re-derive this test's premise")
    collisions = json.loads(
        (ROOT / "draft" / "backtest" / "sleeper_name_index.json").read_text()
    )["collisions"]
    same_pos = [c for c in collisions.get(norm, [])
                if (c.get("position") or "").upper() == "RB"]
    assert len(same_pos) == 1 and same_pos[0]["player_id"] == "8151", same_pos


def test_the_recovered_ids_exist_on_the_board_cory_drafts_from():
    """An id that crosswalks to nothing the board carries is not a recovery."""
    board = json.loads((ROOT / "public" / "draft_data.json").read_text())
    known = {str(p.get("player_id")) for p in
             (board.get("players") or []) + (board.get("kept_players") or [])}
    for r in doc()["crosswalk_recovered"]:
        assert r["player_id"] in known, r
