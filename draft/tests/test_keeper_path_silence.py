# TERRITORY: A
"""STEP 0 — EVERY SILENT-FAILURE CONSTRUCT BETWEEN THE SLEEPER FETCH AND
`kept_player_ids`, MADE LOUD.

Cory's work order: "If a swallowed error can blank the capture, a result of '3'
is ambiguous between broken keeper logic and working logic whose output was
discarded." Step 1's verdict is read THROUGH this path, so the path has to be
incapable of yielding a plausible answer from a failure first.

FOUND, all in `gen_keepers_json.py`:

  F1  `rosters = si.fetch_rosters(...) or []`
      An empty or null response — bad league id, API change, empty cached body —
      became an empty roster list LABELLED `src="sleeper"`. Zero designations,
      reported as a successful live read, every keeper silently returned to the
      draftable pool. It also made the history fallback unreachable on that
      path: the fallback keys on `rosters is None`, and `or []` guarantees it
      never is.

  F2  `my_slot = int(cfg.get("my_draft_slot") or 4)`
      THE WORST OF THE FIVE. This value decides whose rounds are forfeited. A
      missing key silently forfeits team 4's picks, and every pick number on the
      board is then wrong while the board looks entirely normal. The committed
      keepers.json carries `draft_slot: 4` today against a config that says 8 —
      whatever produced that, a real 4 and a defaulted 4 are indistinguishable.

  F3  `teams = int(cfg.get("teams") or 10)`
      Same shape, currently latent because 10 happens to be right.

  F4  The accounting assertion is CONSERVATION OVER ITS OWN INPUT.
      Both sides derive from the same `designating` list, so an empty list reads
      0 == 0 and passes. The workflow's claim that "the only way it exits
      non-zero is its own accounting assertion: designations went missing" is
      false for the failure that matters most — it catches losses AFTER the read
      and is blind to the read returning nothing.

  F5  `ks = r.get("keepers") or (r.get("metadata") or {}).get("keepers")`
      A roster with an explicit empty list and one with no field at all are
      treated identically. Left as-is: both genuinely mean "this team has not
      designated", so the collapse is semantically correct here. Recorded so the
      next reader does not have to re-derive that it was considered.

Run: python -m pytest draft/tests/test_keeper_path_silence.py -q
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))

import gen_keepers_json as gk  # noqa: E402

CFG = {"teams": 10, "my_draft_slot": 8}
ART = {"players": [], "kept_players": [], "keeper_slate": {}}
HIST = {"seasons": [{"season": "2025", "final_rosters": []}]}


def _roster(owner, keepers):
    return {"owner_id": owner, "roster_id": owner, "keepers": keepers}


# ── F2 / F3 — A DEFAULT IS NOT AN ANSWER ────────────────────────────────
def test_a_missing_draft_slot_REFUSES_rather_than_forfeiting_team_4():
    with pytest.raises(SystemExit) as e:
        gk.build({"teams": 10}, ART, HIST, rosters=[_roster("x", ["1"])])
    assert "my_draft_slot" in str(e.value)
    assert "forfeited" in str(e.value), (
        "the refusal must say WHAT a wrong seat costs, or the next reader "
        "restores the default to make the error go away")


def test_a_zero_or_null_slot_is_also_a_refusal_not_a_falsy_default():
    """`or 4` fired on 0 and None alike. Both must refuse."""
    for bad in (0, None, ""):
        with pytest.raises(SystemExit):
            gk.build({"teams": 10, "my_draft_slot": bad}, ART, HIST,
                     rosters=[_roster("x", ["1"])])


def test_a_missing_team_count_refuses_too():
    with pytest.raises(SystemExit) as e:
        gk.build({"my_draft_slot": 8}, ART, HIST, rosters=[_roster("x", ["1"])])
    assert "teams" in str(e.value)


def test_CONTROL_a_complete_config_still_builds():
    """The refusals must not be so broad that a correct config trips them."""
    out = gk.build(CFG, ART, HIST, rosters=[_roster("x", ["1"])])
    assert out["_designating_teams"] == 1
    assert isinstance(out["teams"], list)


# ── F1 — AN EMPTY LIVE READ IS A FAILURE, NOT AN ANSWER ─────────────────
def test_an_empty_sleeper_response_RAISES_instead_of_reporting_zero(monkeypatch):
    """The construct: `fetch_rosters(...) or []`. A league always has rosters,
    so zero is a broken read — and it used to be labelled `src="sleeper"`."""
    class _SI:
        @staticmethod
        def fetch_rosters(_):
            return []                     # the empty-body / wrong-id case
    monkeypatch.setitem(sys.modules, "sleeper_import", _SI)
    with pytest.raises(RuntimeError) as e:
        gk.designations(HIST, None)
    msg = str(e.value)
    assert "NO rosters" in msg
    assert "silently drop every keeper" in msg, (
        "the message must name the CONSEQUENCE — a keeper file with no teams "
        "returns every kept player to the draftable pool")


def test_an_unreachable_sleeper_still_falls_back_to_history_and_SAYS_SO(monkeypatch):
    """The exception path must keep working — the fix must not convert a
    legitimate offline fallback into a hard failure."""
    class _SI:
        @staticmethod
        def fetch_rosters(_):
            raise OSError("network down")
    monkeypatch.setitem(sys.modules, "sleeper_import", _SI)
    hist = {"seasons": [{"season": "2025",
                         "final_rosters": [_roster("h", ["9"])]}]}
    rows, src = gk.designations(hist, None)
    assert rows == [("h", ["9"])]
    assert "history" in src and "sleeper unreachable" in src, (
        "the SOURCE must travel with the data — a fallback that looks like a "
        "live read is how a stale board ships")


def test_an_INJECTED_roster_set_is_labelled_injected_not_sleeper():
    """Step 1 injects a slate. It must never be able to claim it came from a
    live read, or the discriminator grades itself."""
    rows, src = gk.designations(HIST, [_roster("i", ["7"])])
    assert rows == [("i", ["7"])] and src == "injected"


# ── F4 — CONSERVATION CANNOT SEE A MISSING INPUT ────────────────────────
def test_zero_designations_against_a_board_that_saw_some_REFUSES():
    """The independent check. The old assertion compared the same list to
    itself and passed at 0 == 0."""
    art = dict(ART, keeper_slate={"teams_designated": 4})
    out = gk.build(CFG, art, HIST, rosters=[])
    assert out["_designating_teams"] == 0
    with pytest.raises(SystemExit) as e:
        gk._assert_accounting(out, art)
    assert "ZERO designating teams" in str(e.value)
    assert "4" in str(e.value), "the refusal must quote what it was compared against"


def test_a_DIFFERENT_nonzero_count_only_warns(capsys):
    """Two reads at two moments legitimately differ when a team designates in
    between. A hard failure there would block builds for a benign race."""
    art = dict(ART, keeper_slate={"teams_designated": 2})
    out = gk.build(CFG, art, HIST, rosters=[_roster("a", ["1"])])
    gk._assert_accounting(out, art)          # must NOT raise
    assert "designating teams" in capsys.readouterr().out


def test_CONTROL_the_original_conservation_check_still_fires():
    """The new arm must be an addition, not a replacement — a designation lost
    AFTER the read is still the thing the old assertion catches."""
    out = gk.build(CFG, ART, HIST, rosters=[_roster("a", ["1"])])
    out["_designating_teams"] = 5            # simulate a loss between read and emit
    with pytest.raises(SystemExit) as e:
        gk._assert_accounting(out, ART)
    assert "went missing" in str(e.value)
