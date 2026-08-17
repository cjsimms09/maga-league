# TERRITORY: A
"""4e — CAN THE CAPTURE ACTUALLY ANSWER THE FOUR QUESTIONS IT EXISTS FOR?

Cory: "Do not build the scoring now. Verify the capture is SUFFICIENT to build
it later. Report any of the four that the current capture CANNOT support, and
fix the capture."

So this checks field presence against each of the four scoring uses, and says
plainly which one is not supported. It also pins the freeze's immutability,
because a capture that a nightly run can overwrite is the keepers.json failure
with a new filename.

── THE ONE THAT IS NOT FULLY SUPPORTED, STATED UP FRONT ────────────────────

FLEX ALLOCATION. 5a allocates the flex slot empirically from `final_rosters` in
league_history — that is a LINEUP fact (who was started), not a draft fact. The
draft capture records who was DRAFTED at each position, which constrains flex
allocation but does not determine it: a manager can draft five receivers and
start one at flex. 2026 becomes a fourth season for 5a only after the season is
played, from the same weekly source the other three came from.

That is a limit of the QUESTION, not a gap in this capture — no draft-night
record could answer it — and it is asserted below so it cannot be quietly
assumed later.

Run: python -m pytest draft/tests/test_pre_draft_freeze.py -q
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))

import freeze_pre_draft as F  # noqa: E402

pytestmark = pytest.mark.skipif(
    not F.OUT.exists(), reason="no freeze written yet")

FZ = json.loads(F.OUT.read_text()) if F.OUT.exists() else {}


# ── IMMUTABILITY ────────────────────────────────────────────────────────────
def test_the_freeze_has_not_been_ALTERED_since_it_was_written():
    """The stamped hash, recomputed. A hand edit after the draft — tightening a
    prediction that turned out wrong — is the one failure that would make every
    number here worse than useless, and it is otherwise invisible."""
    want = FZ.get("_sha256_of_payload")
    got = F._sha({k: v for k, v in FZ.items() if k != "_sha256_of_payload"})
    assert want == got, (
        f"freeze altered since writing.\n  stamped {want}\n  actual  {got}")


def test_it_records_WHICH_artifact_it_came_from():
    assert FZ.get("source_artifact_built_at")
    assert len(FZ.get("source_artifact_sha256") or "") == 64, (
        "without the source artifact's own hash, a freeze cannot be traced back "
        "to the board that produced it")


def test_the_frozen_pick_list_is_the_KEEPER_AWARE_one():
    """The pick-8 defect, pinned in the capture itself. If my_picks starts at 8
    the whole availability table is 25 slots early and permanently wrong."""
    po = FZ["pick_order"]
    slot = int(FZ["league"]["my_draft_slot"])
    derived = [r["overall"] for r in po["picks"]
               if int(r["slot"]) == slot and not r.get("keeper_slot")]
    assert FZ["my_picks"] == derived, (
        f"frozen my_picks {FZ['my_picks'][:4]} != keeper-aware {derived[:4]}")
    assert FZ["my_picks"][0] != slot, (
        "the first frozen pick equals the draft SLOT — that is the applySlot "
        "confusion and every availability curve below it is wrong")


# ── 4e.1 AVAILABILITY CALIBRATION ───────────────────────────────────────────
def test_SUPPORTED_availability_calibration():
    """Of the players called 70% available at a pick, how many were. Needs a
    probability per player per pick, fixed BEFORE the draft."""
    av = FZ["availability_by_pick"]
    assert len(av) > 300, f"only {len(av)} players carry an availability curve"
    picks = {str(p) for p in FZ["my_picks"]}
    sample = next(iter(av.values()))
    assert set(sample) == picks, (
        "availability is not recorded at every pick I own, so the curve can "
        "only be scored at some of them")
    vals = [v for row in av.values() for v in row.values()]
    assert all(0.0 <= v <= 1.0 for v in vals)
    # NON-DEGENERACY: a table of all-ones or all-zeros would pass every check
    # above and carry no information at all.
    spread = len({round(v, 2) for v in vals})
    assert spread > 20, (
        f"only {spread} distinct probabilities across {len(vals)} cells — the "
        "curve is degenerate and a reliability plot from it would be flat")


# ── 4e.2 REPLACEMENT LEVEL ACCURACY ─────────────────────────────────────────
def test_SUPPORTED_replacement_level_accuracy():
    """Who was ACTUALLY the last starting QB/RB/WR/TE drafted, against what the
    board predicted. Needs the predicted level frozen and position on every
    logged pick."""
    rep = FZ.get("replacement") or {}
    assert rep.get("replacement_points"), "no predicted replacement level frozen"
    for pos in ("QB", "RB", "WR", "TE"):
        assert pos in rep["replacement_points"], pos
        assert pos in rep["starter_counts"], pos
    assert rep.get("flex_slots_allocated") is not None
    assert all(p.get("position") for p in FZ["players"][:50]), (
        "players lack position, so the last starter drafted at each position "
        "cannot be identified from the log")


# ── 4e.3 OLD vs NEW PATH, OUT OF SAMPLE ─────────────────────────────────────
def test_SUPPORTED_old_vs_new_path_out_of_sample():
    """The old path is captured directly. The new path is NOT — and the test is
    whether the freeze carries the inputs to compute it later."""
    assert "old_production" in FZ["valuation_paths_captured"]
    needed = ("proj_mean", "vorp", "replacement", "adp", "adp_sd")
    have = set(FZ["players"][0])
    missing = [f for f in needed if f not in have]
    assert not missing, (
        f"the freeze lacks {missing}, so a VORP-space path cannot be "
        "reconstructed and the out-of-sample comparison is impossible")
    priced = sum(1 for p in FZ["players"]
                 if p.get("proj_mean") is not None and p.get("adp") is not None)
    assert priced > 200, f"only {priced} players carry both a projection and an ADP"


# ── 4e.4 FLEX ALLOCATION — REPORTED AS NOT FULLY SUPPORTED ──────────────────
def test_NOT_SUPPORTED_flex_allocation_needs_lineups_not_the_draft():
    """Asserted so the limit cannot be forgotten and later assumed away.

    Flex allocation is a STARTED-lineup fact. The draft says who was drafted,
    which constrains it and does not determine it. 2026 becomes a fourth season
    for 5a from the weekly lineup source, after the season — not from this."""
    rep = FZ.get("replacement") or {}
    assert rep.get("flex_slots_allocated") is not None, (
        "the flex allocation IN FORCE must be frozen even though the 2026 "
        "OBSERVATION cannot come from draft night — otherwise there is no "
        "record of which allocation these replacement levels assumed")
    hist = json.loads((ROOT / "draft" / "data" / "league_history.json").read_text())
    seasons = [s for s in hist.get("seasons", []) if s.get("final_rosters")]
    assert len(seasons) >= 3, (
        f"only {len(seasons)} seasons carry final_rosters — 5a's empirical flex "
        "allocation rests on these and 2026 will be added from the same source, "
        "NOT from the pick log")


# ── THE DENOMINATION MUST TRAVEL WITH THE PREDICTIONS ───────────────────────
def test_the_availability_basis_is_the_SELECTION_scale_on_BOTH_sides():
    """The defect that forced this freeze to be re-taken. The first cut computed
    survival(market adp, BOARD slot) -- two errors in opposite directions that
    nearly cancelled on today's three-keeper board (Josh Allen 4.6% against a
    true 4.0%) and would not have cancelled at all after the 20 August lock."""
    b = FZ["availability_basis"]
    assert "adjusted_adp" in b["adp_field"]
    assert "live_index_of" in b["pick_scale"]
    assert b["matches_engine"].endswith("liveIndexOf")
    # And the numbers must actually BE on that scale, not merely labelled.
    import keepers as _K
    board = FZ["pick_order"]["picks"]
    p = next(x for x in FZ["players"]
             if x["name"] == "Josh Allen" and x.get("adjusted_adp"))
    want = round(_K.survival_probability(
        float(p["adjusted_adp"]), _K.live_index_of(33, board), p.get("adp_sd")), 6)
    got = FZ["availability_by_pick"][str(p["player_id"])]["33"]
    assert abs(got - want) < 1e-6, f"frozen {got} vs selection-scale {want}"


def test_the_freeze_declares_itself_PROVISIONAL_until_the_slate_locks():
    """5f: the pre-lock run is a rehearsal against the predicted pool. A freeze
    that did not say so would be read in September as the real baseline."""
    assert FZ["status"] == "PROVISIONAL"
    # The reason is DERIVED from the keeper slate (_slate_status carries the
    # slate's own words so the two cannot drift), so pin the MECHANISM — the
    # reason must name the missing precondition — not the hand-written
    # "20 August" sentence this asserted before the derivation existed.
    assert "keeper lock has not passed" in FZ["status_reason"], FZ["status_reason"]
    assert FZ["keepers_on_board_at_freeze"] == 3, FZ["keepers_on_board_at_freeze"]


def test_the_scoring_gap_is_recorded_or_the_curve_measures_the_WRONG_THING():
    """Our projections are 6-point passing TDs; the ADP is 4.0 and no public
    feed serves a parameter for it. A reader scoring these curves in 2027
    without that fact would attribute the gap to the model."""
    d = FZ["denomination"]
    assert d["league_pass_td"] == 6, d["league_pass_td"]
    assert d["market_pass_td"] == 4.0
    assert d["gap_is_closed_form_not_fitted"] is True
    assert "2*passTD" in d["per_player_gap_formula"]


def test_the_KNOWN_sd_width_error_travels_with_the_frozen_curves():
    """Every availability number here was computed with a rule measured at
    ~1.2-1.29x published dispersion. Scoring these curves without that recorded
    would read a known input error as model miscalibration."""
    r = FZ["adp_sd_rule_in_force"]
    assert r["rate"] == 0.15 and r["floor"] == 3.0 and r["cap"] == 15.0
    assert r["measured_rate_from_published_dispersion"] == 0.1083
    assert "1.20-1.29" in r["known_error"]
    assert r["rows_with_published_sd"] > 100


def test_the_keeper_state_records_what_was_APPLIED_not_what_was_CLAIMED():
    """The slate says 'predicted'; the board carries only my three keepers. The
    injection test measured those apart, and a capture that recorded only the
    slate's own words would preserve the claim and lose the fact."""
    assert FZ["keepers_actually_applied_count"] == len(FZ["keepers_actually_applied"])
    assert FZ["opponent_keepers_applied"] == 0
    assert "injection" in FZ["opponent_keepers_applied_basis"]
    assert FZ["keeper_slate_declared"]["status"] in ("predicted", "confirmed")
