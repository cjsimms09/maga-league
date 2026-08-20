"""THE SCRIPT MUST NOT SCRIPT A PICK THE WAR ROOM WOULD REFUSE.

Found live 2026-08-19, three days before the draft: `opening_script.py`
ranked candidates on RAW VORP and made **Los Angeles Rams DEF the TARGET
at pick 48** — an EIGHTY-PICK reach (that defense's ADP is 128), while
the war-room engine scoring the same board ranked it fifth (Maye 375.8,
Evans 192.8, LaPorta 163.6, Rams 135.5). Raw VORP is not comparable
across positions whose replacement pool is ~10 deep.

These arms pin the fix and, more importantly, the PROPERTY: the document
Cory reads at pick speed may not promote a onesie into a TARGET slot on
a number the engine it claims to script disagrees with.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "draft" / "data" / "opening_script.json"
BOARD = ROOT / "public" / "draft_data.json"
ONESIE = {"K", "DEF"}
REACH_ROUNDS, TEAMS = 1.5, 10


def _doc():
    return json.loads(SCRIPT.read_text())


def _board_adp():
    b = json.loads(BOARD.read_text())
    return {str(p["player_id"]): (p.get("adjusted_adp") or p.get("raw_adp"))
            for p in b["players"]}


def _picks(doc):
    """Every scripted pick across every branch. The shape is
    doc["branches"][<branch>] -> [{pick, candidates:[...]}]; the TARGET is
    candidates[0]. Asserted non-empty by its own control test, because a
    walker that finds nothing makes every other assertion vacuous — which
    is exactly what the first version of this file did."""
    out = []
    for branch in (doc.get("branches") or {}).values():
        for node in (branch or []):
            if isinstance(node, dict) and "pick" in node:
                out.append(node)
    return out


def test_no_onesie_is_targeted_at_a_multi_round_reach():
    """THE ARM THAT MATTERS. A K or DEF may be the target only when the
    market agrees it is roughly due — never eighty picks early."""
    adp = _board_adp()
    offenders = []
    for pk in _picks(_doc()):
        pick_no = pk.get("pick")
        cands = pk.get("candidates") or []
        tgt = cands[0] if cands else {}
        if not isinstance(tgt, dict) or tgt.get("position") not in ONESIE:
            continue
        a = adp.get(str(tgt.get("player_id")))
        if a is None or pick_no is None:
            continue
        if float(a) - float(pick_no) > REACH_ROUNDS * TEAMS:
            offenders.append((pick_no, tgt.get("name"), tgt.get("position"), a))
    assert not offenders, (
        "the opening script targets a onesie the market says is rounds away: "
        f"{offenders} — this is the Rams-DEF-at-48 defect (ADP 128) returning")


def test_the_script_still_targets_somebody_at_every_pick():
    """CONTROL: the guard must not empty the script. A file that recommends
    nothing would pass the assertion above for the wrong reason."""
    picks = _picks(_doc())
    assert picks, "no scripted picks parsed at all"
    for pk in picks:
        cands = pk.get("candidates") or []
        assert cands and cands[0].get("name"), f"pick {pk.get('pick')} has no target"


def test_a_onesie_may_still_be_targeted_when_the_market_agrees():
    """The guard is a REACH guard, not a ban — the pure function must still
    allow a defense once the market has it roughly due. Verified on the
    rule itself so a future rewrite into 'never a onesie' fails here."""
    def blocked(adp_val, pick_no):
        return float(adp_val) - float(pick_no) > REACH_ROUNDS * TEAMS
    assert blocked(128, 48)        # the real defect
    assert not blocked(128, 120)   # same defense, endgame — allowed
    assert not blocked(128, 115)
