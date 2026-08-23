# TERRITORY: A
"""THE LOGGER'S RECOMMENDATION MUST BE A PICK-TIME QUANTITY, NOT A STATIC ONE.

Cory, 2026-08-23: *"we need to be better next year! Goal is to draft me best
possible roster and we need to do that next year by any means necessary!"*

── THE DEFECT THIS PINS, measured on the real 2026 draft ─────────────────────

`old_path_recommendation` sorts by `vorp`. That IS what the shipped board ranks
on and it IS correct for a full board — verified: at the top of the board raw
vorp and the board's own `overall_rank` agree 8 of 8 with zero K/DEF in either.

It is not a pick-time quantity. Best-available VORP as the real draft drained:

    after N picks   RB    WR    TE    QB     K   DEF
          0        156   125    81    64    10    29
         60        -19    29    18    11    10    29   <- DEF leads
        100        -53    -9     0     8    10    29   <- and never stops

DEF VORP is FLAT AT 29 for a hundred picks — 32 defences exist and ~10 get
taken, all late — while skill VORP collapses and goes negative. The 2026 log
recorded a K or DEF as the top recommendation at **101 of 150 picks**.

VONA re-baselines against what is LEFT. Replayed over Cory's real twelve picks:
**K/DEF as the #1 recommendation goes 10/12 -> 0/12.**

── WHAT THIS FILE DOES NOT CLAIM ─────────────────────────────────────────────

VONA is roster-BLIND. On the real replay it names Brock Purdy at picks 108,
113, 128, 133 and 148 — five times running — because QB stays expensive to
wait on and nothing tells it Cory already took a quarterback at 93. That is the
same roster-blindness the composite has, and pinning it here so the next reader
does not mistake "no longer recommends defences" for "recommends correctly".
The complete answer is VONA times roster need; MLV is the arm that adds it.

Run: python -m pytest draft/tests/test_vona_path_is_pick_time.py -q
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))

import log_draft_picks as LP  # noqa: E402

FREEZE = ROOT / "draft" / "data" / "pre_draft_freeze_2026.json"
LOG = ROOT / "draft" / "data" / "draft_pick_log_2026.jsonl"

FZ = json.loads(FREEZE.read_text())
ROWS = sorted((json.loads(l) for l in LOG.read_text().strip().split("\n")),
              key=lambda r: r["pick"])
MY = [r["pick"] for r in ROWS
      if str(r.get("team_slot")) == "8" and not r.get("is_keeper")]


def _gone(before: int) -> set[str]:
    return {str(r["player_id"]) for r in ROWS if r["pick"] < before}


def _replay():
    out = []
    for i, pk in enumerate(MY):
        nxt = MY[i + 1] if i + 1 < len(MY) else None
        g = _gone(pk)
        out.append((pk,
                    LP.old_path_recommendation(FZ, g),
                    LP.vona_path_recommendation(FZ, g, pk, nxt)))
    return out


REPLAY = _replay()


def test_CONTROL_the_replay_actually_produced_recommendations():
    """Every assertion below is vacuous on an empty replay."""
    assert len(REPLAY) == 12, f"expected Cory's 12 picks, replayed {len(REPLAY)}"
    assert all(old for _, old, _ in REPLAY), "an old-path arm came back empty"
    assert all(new for _, _, new in REPLAY), "a VONA arm came back empty"


def test_CONTROL_the_old_path_really_does_recommend_defences():
    """The defect must reproduce, or the fix below is measuring nothing.

    This is the known-positive: if the old path ever stops doing this, the
    comparison in the next test is no longer evidence of anything.
    """
    kd = [pk for pk, old, _ in REPLAY if old[0]["position"] in ("K", "DEF")]
    assert len(kd) >= 8, (
        f"the old path named a K/DEF at only {len(kd)} of 12 picks — the "
        "defect this file exists to fix is not reproducing, so re-derive it "
        "before trusting the comparison")


def test_THE_VONA_PATH_DOES_NOT_HAND_CORY_A_DEFENCE_IN_ROUND_5():
    """THE FIX. Measured 10/12 -> 0/12 on the real draft."""
    kd = [(pk, new["recommendation"][0]["position"], new["recommendation"][0]["name"])
          for pk, _, new in REPLAY
          if new.get("recommendation")
          and new["recommendation"][0]["position"] in ("K", "DEF")]
    assert not kd, f"the VONA path still leads with a K/DEF at {kd}"


def test_it_leads_with_SKILL_early_and_lets_QB_rise_late():
    """Not just 'not a defence' — the shape has to be football-sane.

    Early picks should lead with RB/WR/TE (that is where the talent gap is);
    QB should only become the costliest wait later, which is exactly the
    crossover the pre-draft VONA table showed.
    """
    early = [new["recommendation"][0]["position"]
             for pk, _, new in REPLAY if pk <= 73 and new.get("recommendation")]
    assert all(p in ("RB", "WR", "TE") for p in early), (
        f"early picks led with {early} — expected skill positions")


def test_the_cost_of_waiting_is_published_per_position_not_just_a_name():
    """A recommendation with no number behind it cannot be audited later."""
    for pk, _, new in REPLAY:
        if new.get("basis") == "last_pick_no_wait":
            continue
        cost = new.get("cost_of_waiting") or {}
        assert cost, f"pick {pk} published no cost_of_waiting"
        assert new.get("highest_cost_position") in cost, (
            f"pick {pk}: the named position is not in its own cost table")


def test_IT_IS_DETERMINISTIC_because_a_capture_that_cannot_rerun_is_a_story():
    """`old_path_recommendation` makes determinism its defining property. This
    arm is a SIMULATION, so it seeds from a constant plus the pick number —
    same inputs, byte-identical output, re-runnable in January."""
    pk = MY[2]
    g = _gone(pk)
    a = LP.vona_path_recommendation(FZ, g, pk, MY[3])
    b = LP.vona_path_recommendation(FZ, g, pk, MY[3])
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True), (
        "two runs on identical inputs disagree — the arm is unseeded and "
        "nothing recorded from it can be reproduced")


def test_the_last_pick_says_so_rather_than_inventing_a_wait():
    """At the final pick there is no next pick, so waiting cannot cost
    anything. Returning a VONA there would be a fabricated number."""
    _, _, last = REPLAY[-1]
    assert last["basis"] == "last_pick_no_wait", last.get("basis")
    assert last["recommendation"], "the last pick still needs a best-available"


def test_KNOWN_LIMIT_the_vona_path_is_roster_blind():
    """NOT A PASS-BY-DEFAULT. This asserts the limitation is REAL and stated,
    so nobody reads 'stopped recommending defences' as 'recommends correctly'.

    On the real replay it names the same quarterback at five consecutive late
    picks because QB stays expensive to wait on and nothing tells it Cory
    already took one at 93.
    """
    late = [new["recommendation"][0]["name"]
            for pk, _, new in REPLAY if pk >= 108 and new.get("recommendation")]
    repeats = len(late) - len(set(late))
    assert repeats >= 2, (
        "the VONA path no longer repeats a name across late picks — if that is "
        "a real improvement, this test and the docstring's stated limit both "
        "need rewriting rather than deleting")
