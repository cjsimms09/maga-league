# TERRITORY: A
"""THE DEEP-POOL ORDERING NEVER RAN, TWICE, FOR TWO DIFFERENT ABSENT KEYS.

`apply_with_fallback` prices the players FFC does not list. It claims — at
length, in its own comments — to rank the ones carrying a projection among
themselves and leave the rest honestly tied. That ordering has never executed on
a shipped board.

    FIRST CAUSE (found by C, fixed 2026-08-13): it read `p["search_rank"]`, and
    no board dict carries that key, so `min(rank, 600.0)` gave all 603 the same
    price.

    SECOND CAUSE (this file, 2026-08-14): the replacement read `p["proj_mean"]`,
    which is not assigned until `projections.blend()` — projections.py:238 —
    and build.py does not call blend until :576, FIFTY LINES BELOW the
    `apply_with_fallback` call at :527. Empty on every build, for the same
    reason in a different key.

Measured on the shipped board: max real ADP 317, so the unprojected branch
writes 317 + 600 = 917, and 917 is what all 348 fallback rows carry — including
the 274 that DO have a projection by the time the artifact is written.

WHY IT COULD NOT BE FIXED BY MOVING THE CALL LATER. `raw_adp` is copied from
`adp` at build.py:571, still ABOVE blend. An ordering applied after blend would
never reach `raw_adp` — which is the field `test_actionable_board` reads and the
one a stale ordering hides in. So the ordering has to stay where it is and read
a projection source that exists there: `baseline`, computed at :365.

WHAT THIS FILE IS FOR. The defect is invisible in the artifact — a pool that
genuinely cannot be separated reports the same "0 ordered, 348 tied" as a pool
whose ordering silently did nothing. These checks make the two distinguishable
and pin the fix at the seam rather than at the symptom.

Run: python -m pytest draft/tests/test_fallback_ordering.py -q
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))

import adp as adp_mod  # noqa: E402


def _board(n_priced: int = 40, n_fallback: int = 6):
    """A market of `n_priced` FFC-listed players plus an unlisted deep pool."""
    table, players = {}, []
    for i in range(n_priced):
        pid = f"m{i}"
        players.append({"player_id": pid, "name": f"M{i}", "position": "RB", "team": "KC"})
        table[pid] = {"adp": float(i + 1), "adp_sd": 2.0, "adp_source": "ffc",
                      "name": f"M{i}", "position": "RB", "team": "KC"}
    for i in range(n_fallback):
        players.append({"player_id": f"f{i}", "name": f"F{i}", "position": "WR", "team": "KC"})
    return players, table


def _apply(projections):
    players, table = _board()
    prov = adp_mod.apply_with_fallback(players, table, teams=10, draft_picks=150,
                                       projections=projections)
    fallback = [p for p in players if p.get("adp_source") == "search_rank"]
    return fallback, prov


PROJ = {"f0": 200.0, "f1": 150.0, "f2": 175.0, "f4": 120.0}   # f3, f5 have none


def test_THE_PROJECTED_FALLBACK_POOL_IS_ACTUALLY_ORDERED():
    """The claim the comments have made since the first fix, finally true."""
    fallback, prov = _apply(PROJ)
    priced = [p for p in fallback if p["player_id"] in PROJ]
    assert len({p["adp"] for p in priced}) == len(priced), (
        "the projected fallback players share a price — the ordering did not run: "
        f"{[(p['player_id'], p['adp']) for p in priced]}")
    # Best projection first, and strictly increasing adp as projection falls.
    by_adp = sorted(priced, key=lambda p: p["adp"])
    projs = [PROJ[p["player_id"]] for p in by_adp]
    assert projs == sorted(projs, reverse=True), (
        f"ordered by adp the projections are {projs}, which is not descending")


def test_FAIL_ARM_the_defect_reproduces_when_no_projection_map_is_supplied():
    """Without the map this is EXACTLY the shipped behaviour, so the test above
    is not asserting something that was already true."""
    fallback, prov = _apply(None)
    assert len({p["adp"] for p in fallback}) == 1, (
        "no projection map should reproduce the one-price defect; if this fails "
        "the ordering is coming from somewhere else and the diagnosis is wrong")
    assert prov["fallback_ordered_by_projection"] == 0


def test_A_SILENT_ZERO_AND_A_REAL_ZERO_ARE_DISTINGUISHABLE():
    """The counts alone read identically in both states, which is why nobody saw
    this. Provenance must say WHETHER THE ORDERING HAD ANYTHING TO RANK WITH."""
    _, with_map = _apply(PROJ)
    _, without = _apply(None)
    assert with_map["fallback_projection_map_supplied"] is True
    assert without["fallback_projection_map_supplied"] is False
    assert with_map["fallback_projection_map_size"] == len(PROJ)
    assert without["fallback_projection_map_size"] == 0


def test_UNPROJECTED_PLAYERS_STAY_HONESTLY_TIED_BEHIND_THE_ORDERED_ONES():
    """An ordering that invented a spread for players nothing separates would be
    the more expensive error — a confident wrong ranking beats an honest tie."""
    fallback, prov = _apply(PROJ)
    tied = [p for p in fallback if p["player_id"] not in PROJ]
    ordered = [p for p in fallback if p["player_id"] in PROJ]
    assert len({p["adp"] for p in tied}) == 1, "the unrankable pool was given a spread"
    assert min(p["adp"] for p in tied) > max(p["adp"] for p in ordered), (
        "a player nothing can rank sits AHEAD of one we can rank")
    assert prov["fallback_ordered_by_projection"] == len(ordered)
    assert prov["fallback_unordered_tied"] == len(tied)


def test_NO_FALLBACK_PLAYER_IS_PRICED_INSIDE_THE_REAL_MARKET():
    """The property the original comment rests on: fallback prices start after
    the last real ADP, so ordering them can never push one past a player the
    market actually priced."""
    fallback, _ = _apply(PROJ)
    assert min(p["adp"] for p in fallback) > 40.0, (
        "a fallback player is priced inside the FFC-listed board")


def test_THE_BUILD_PASSES_THE_MAP_AND_DOES_IT_BEFORE_raw_adp_IS_COPIED():
    """THE SEAM, PINNED. The fix only works because `baseline` is handed over at
    the call site AND that call still precedes the `raw_adp = adp` copy. Move
    either and the ordering silently stops reaching the field under test."""
    src = (ROOT / "draft" / "build.py").read_text()
    assert re.search(r"apply_with_fallback\([\s\S]{0,400}?projections=baseline", src), (
        "build.py no longer passes the projection map — the ordering has nothing "
        "to rank with and reverts to one price for the whole deep pool")

    call = src.index("apply_with_fallback(")
    copy = src.index('p["raw_adp"] = p.get("adp"')
    blend = src.index("proj_mod.blend(")
    assert call < copy, (
        "the ADP fallback now runs AFTER raw_adp is copied from adp, so the "
        "ordering can never reach raw_adp")
    assert copy < blend, (
        "raw_adp is copied after blend() — if this is now false the ordering "
        "could be deferred until proj_mean exists, and this whole workaround "
        "is unnecessary; re-read the comment in adp.py before deleting it")


def test_THE_ORDERING_NO_LONGER_DEPENDS_ON_A_KEY_ASSIGNED_LATER():
    """Reading `proj_mean` here is what broke it. The row is allowed as a
    fallback, but the passed-in map must be consulted FIRST or the same absence
    returns the moment the pipeline is reordered again."""
    src = (ROOT / "draft" / "adp.py").read_text()
    block = src[src.index("ordered_by_proj = []"):src.index("ordered_by_proj.sort")]

    # ⚠️ STRIP THE COMMENTS BEFORE MATCHING. My first version searched the raw
    # block and found `p.get("proj_mean")` inside the COMMENT that retracts it,
    # ahead of the real code — so the ordering assertion compared a quotation
    # against a line of source. That is the FIFTH time today I have written an
    # assertion that matched my own retraction (board_publish_gate,
    # dollar_terms_independence, surface_contract, panel_spec, here). The house
    # style is to preserve what was wrong and say so, which makes raw-text
    # matching the wrong instrument by default — so this file strips first
    # rather than relying on me remembering.
    code = "\n".join(ln for ln in block.split("\n")
                     if not ln.lstrip().startswith("#"))

    assert "projections.get(str(p.get(\"player_id\")))" in code, (
        "the fallback ordering does not consult the supplied projection map")
    assert code.index("projections.get") < code.index('p.get("proj_mean")'), (
        "the row key is consulted BEFORE the passed-in map — that is the "
        "dependency that was empty on every build")
    assert 'p.get("proj_mean")' in block, (
        "CONTROL: the retraction comment naming the old key is gone, so the "
        "next reader loses the reason this parameter exists")
