# TERRITORY: A
"""The sweep that finds fields carrying no information of their own.

Cory, 2026-08-17: *"what other data are we missing or calculating off a constant
when we shouldn't be, then find all test we've ran that would've been tainted by
that data and rerun"*

THE POINT OF TESTING A DETECTOR IS THAT IT CAN FAIL. `proj_ceiling`,
`proj_floor`, `proj_sd` and `weekly_sd` were all `proj_mean x (a per-band
constant)`, and all four were found BY ACCIDENT over the course of one day. The
sweep exists so the next one is found by a run instead. That only holds if the
sweep provably catches a known instance, so the known-positive control is tested
here first and hardest.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))
import constant_multiple_sweep as S  # noqa: E402

BOARD = ROOT / "public" / "draft_data.json"


@pytest.fixture(scope="module")
def players():
    if not BOARD.exists():
        pytest.skip("no built board in the tree")
    return S.load_board(BOARD)


def test_the_detector_catches_a_known_constant_multiple(players):
    """THE LOAD-BEARING TEST. Rebuild the pre-fix ceiling — proj_mean x a
    per-band constant — and require the sweep to flag it. Everything else the
    sweep says is worthless if this does not hold, which is why main() refuses
    to print a report when the control fails rather than printing a reassuring
    "none found"."""
    out = S.self_test(players)
    assert out["caught"], "the sweep cannot detect the defect it was built for"
    assert out["detail"]["cells_constant"] >= S.MIN_CELLS_HIT


def test_the_boardwide_test_alone_would_have_missed_it(players):
    """WHY THE FIRST VERSION OF THIS FILE WAS WRONG, pinned so it cannot come
    back. The defect's multiplier VARIES between cells, so the global ratio is
    not constant at all — the boardwide cv sits far above the floor. A sweep
    that only tested boardwide would have reported this board clean while four
    broken fields sat on it."""
    d = S.self_test(players)["detail"]
    assert d["global_cv"] > S.CV_FLOOR, (
        "if the known-positive were also globally constant, this test would not "
        "be demonstrating anything about within-cell detection")


def test_a_ratio_of_two_constants_is_not_reported_as_a_dependency():
    """`adp_season` is 2026 on every row and `games_expected` is fixed per cell,
    so their ratio is perfectly constant while the two are unrelated. Before the
    both-vary filter that artifact was a third of the report, and a report that
    is a third noise is one nobody finishes reading."""
    rows = []
    for i in range(40):
        rows.append({"position": "WR", "proj_mean": 100.0 + i,
                     "always_2026": 2026.0, "also_constant": 17.0})
    out = S.sweep(rows, min_shared=10, min_cell=10, min_cells_hit=1)
    pairs = {(r["field"], r["is_multiple_of"]) for r in out["within_cell_constants"]}
    assert ("always_2026", "also_constant") not in pairs
    assert ("also_constant", "always_2026") not in pairs


def test_a_genuine_within_cell_multiple_is_reported():
    """The other direction: a field that really IS a rescaled copy inside each
    cell, with a different multiplier per cell, must be caught. Without this the
    previous test could be satisfied by a sweep that reports nothing at all."""
    rows = []
    for i in range(40):
        mean = 100.0 + i
        rows.append({"position": "WR", "proj_mean": mean, "shadow": mean * 1.4})
    for i in range(40):
        mean = 10.0 + i * 0.5
        rows.append({"position": "RB", "proj_mean": mean, "shadow": mean * 1.9})
    out = S.sweep(rows, min_shared=10, min_cell=10, min_cells_hit=1)
    hit = [r for r in out["within_cell_constants"]
           if {r["field"], r["is_multiple_of"]} == {"shadow", "proj_mean"}]
    assert hit, "a real per-cell rescaled copy must be caught"


def test_exact_aliases_are_kept_out_of_the_findings():
    """An alias is a naming wart, not a measurement hazard — `consensus_rank` is
    a documented alias of `raw_adp`. Mixing the two categories buries a real
    finding under known-and-intended duplication."""
    rows = [{"position": "WR", "proj_mean": 100.0 + i, "twin": 100.0 + i}
            for i in range(40)]
    out = S.sweep(rows, min_shared=10, min_cell=10, min_cells_hit=1)
    assert any({r["field"], r["is_multiple_of"]} == {"twin", "proj_mean"}
               for r in out["aliases"])
    assert not out["constant_multiples"]


#: The fields KNOWN to participate in a within-cell constant multiple on the
#: live board, as measured 2026-08-17. This is a REGRESSION GATE, not an
#: endorsement: every entry here is a field that cannot be weighted
#: independently of the others, and the dispersion family
#: (proj_ceiling/proj_floor/proj_sd/weekly_sd against proj_mean) is the
#: documented, still-open limitation the re-tune prereg bounds itself by.
#:
#: A NEW NAME APPEARING HERE IS THE ALARM. That is the whole point — the four
#: broken fields were each found by accident, and this list is what turns the
#: next one into a test failure instead of another lucky catch.
KNOWN_PARTICIPANTS = {
    # proj_mean_pre_ds — ADDED 2026-08-20 after investigating, as this test
    # demands, rather than to silence it. It is the blend's value BEFORE
    # attach_draftsharks.py swaps Draft Sharks in, kept as an audit trail
    # (register 140: 363 players' bands were collapsed to floor=ceiling=mean and
    # shipped, and this is what makes that visible next time). It reads as a
    # constant multiple for a mundane reason: for the 453 players Draft Sharks
    # does not cover, the attach leaves proj_mean untouched, so the ratio is
    # EXACTLY 1.0 across most of the board. That is a before/after snapshot, not
    # a rescaled copy anyone could weight independently — and it is already
    # declared not-for-display in nothing_computed_goes_unshown.js for the same
    # reason. No study may weight it; nothing does.
    "proj_mean_pre_ds",
    # ── THE PER-SOURCE FAMILY, ADDED 2026-08-20 AFTER MEASURING, NOT TO SILENCE
    # THE SWEEP. `alt_source_rankings.py` runs the board's OWN apply_vorp and
    # assign_tiers four more times, once per source, on a shadow copy priced by
    # that source. So `vorp_fantasypros` is not a different quantity from
    # `vorp` — it is the SAME function on a near-identical input, and the sweep
    # is right that the two columns are proportional.
    #
    # WHAT I CHECKED BEFORE ADDING THEM, because the alarming reading is "our
    # blend is just FantasyPros rescaled". It is not. Ratio of blend to each
    # single source over the top 200:
    #
    #     fantasypros  median 0.986  cv 0.077
    #     draftsharks  median 0.966  cv 0.097
    #     sleeper      median 1.043  cv 0.209
    #     our model    median 1.233  cv 0.685
    #
    # A true constant multiple has cv ~ 0. The blend is genuinely a blend; what
    # is proportional is the DERIVED column pair, tightened because VORP
    # subtracts a per-position constant from two similar inputs.
    #
    # AND THE RISK THE SWEEP GUARDS AGAINST DOES NOT APPLY HERE. Its danger is a
    # field that LOOKS independent being a rescaled copy, so a study weights both
    # and reports a null it did not earn. These wear the source in the name —
    # nobody would weight `vorp` and `vorp_fantasypros` as two signals — and they
    # exist for exactly one purpose: to re-rank the board when Cory flips the
    # source toggle.
    "vorp", "vorp_fantasypros", "vorp_ownmodel",
    "pos_rank", "pos_rank_fantasypros", "pos_rank_ownmodel",
    "tier", "tier_fantasypros", "tier_ownmodel",
    "tier_rank", "tier_rank_fantasypros", "tier_rank_ownmodel",
    "tier_size", "tier_size_fantasypros", "tier_size_ownmodel",
    "replacement", "replacement_fantasypros", "replacement_ownmodel",
    "replacement_sleeper", "replacement_ds",
    "proj_used_fantasypros", "proj_used_ownmodel", "proj_used_sleeper",
    # the dispersion family — all still proj_mean x a per-cell constant
    "proj_mean", "proj_ceiling", "proj_floor", "proj_sd", "weekly_sd",
    "proj_baseline",
    # INVESTIGATED 2026-08-19 before adding, as this list's own message demands.
    # `proj_mean_sleeper_only` is the PRE-BLEND value the multi-source mean
    # replaced, kept on the row so the change is reversible and auditable. It
    # tracks `proj_mean` closely BY CONSTRUCTION -- it is the same quantity
    # from one of the four sources being averaged -- and the coherence gate
    # tightens the coupling further, since the blend only touches players
    # whose sources agree within 2x. So the detector is RIGHT and the finding
    # is real: this field must never be weighted independently of proj_mean.
    # It exists to be DISPLAYED and to be reverted to, never to be modelled.
    "proj_mean_sleeper_only",
    # adjusted_adp is ADP with small adjustments applied, so it tracks ADP
    # closely by design; the aliases of ADP come along with it
    "adjusted_adp", "adp", "consensus_rank", "raw_adp", "pool_rank",
    # INVESTIGATED 2026-08-17 (issue #8, run 32035071758). With
    # opportunity_cap ruled to 0.0 the adjustment is inert, so proj_mean ==
    # proj_baseline exactly, and the blend's SOURCE column couples to the
    # family it feeds: where Sleeper is the only projection source the
    # per-cell ratio proj_baseline/proj_sleeper is a blend constant. A source
    # input being coupled to the blend built from it is construction, not a
    # hidden dependency.
    "proj_sleeper",
    # DELIBERATELY NOT ADDED: opportunity_adj / opportunity_z. Their joining
    # in run 32035071758 was a REAL DEFECT this gate caught — build.py's
    # config rewrite erased the ruled `opportunity_cap: 0.0`, the layer came
    # back at its 0.15 default, and adj = (z/2)*cap (projections.py:277) is
    # an exact rescale of z wherever unclamped. The erasure is fixed
    # (test_config_keys_survive_rebuild.py); if these two fields ever join
    # again, the killed layer is BACK and this test going red is the alarm
    # working. Do not quiet it by listing them here.
}


def test_no_new_field_has_joined_the_constant_multiple_family(players):
    """THE GATE. Not "the board is clean" — it demonstrably is not — but "the
    board is no worse than the state we have measured and written down"."""
    out = S.sweep(players)
    seen = set()
    for r in out["within_cell_constants"]:
        seen.add(r["field"])
        seen.add(r["is_multiple_of"])
    new = seen - KNOWN_PARTICIPANTS
    assert not new, (
        f"NEW constant-multiple field(s): {sorted(new)}. A field that is a "
        "rescaled copy of another cannot be weighted independently, and any "
        "study that tries will return a null it did not earn. Investigate "
        "before adding to KNOWN_PARTICIPANTS.")


# Boardwide pairs that have been INVESTIGATED and are construction, not
# duplication. Kept as an explicit allowlist rather than a loosened threshold so
# that a new boardwide pair still turns this test red.
#
# INVESTIGATED 2026-08-20 before adding, per this file's own standard.
# ("replacement", "replacement_fantasypros"): both are per-position constants,
# so this test is really asking whether two 6-vectors are proportional. They are
# not identical -- measured per position, blend/FP is QB 1.0091, RB 0.9621,
# TE 0.9802, WR 0.9825 -- a 4.7% spread across the positions Cory drafts. The
# row-weighted cv lands at 0.0151, just under the 0.02 floor, because the OTHER
# TWO cells are exactly 1.0: at K and DEF, FantasyPros covers nobody
# (`covered_fantasypros` is False on all 45 K and all 32 DEF), `proj_used_*`
# falls back to the blend by design, and so FP's replacement level at those two
# positions IS the blend's number copied. 271 of 700 rows are that fallback.
# So the finding is REAL and worth stating: blend-VORP and FantasyPros-VORP are
# within 4% of each other by construction and must never be weighted as two
# independent signals. They are not weighted at all -- they are subtracted from
# projections to re-rank the board when Cory flips the source toggle, which is
# the one use a near-duplicate is legitimate for.
KNOWN_BOARDWIDE_PAIRS = {
    ("replacement", "replacement_fantasypros"),
    ("replacement_fantasypros", "replacement"),
}


def test_no_field_is_a_boardwide_constant_multiple(players):
    """The stricter scope. A boardwide constant multiple is a pure duplicate
    under a second name and needs a written reason to exist."""
    out = S.sweep(players)
    new = [r for r in out["constant_multiples"]
           if (r["field"], r["is_multiple_of"]) not in KNOWN_BOARDWIDE_PAIRS]
    assert new == [], (
        f"boardwide duplicates: {new}. A field that is a rescaled copy of "
        "another across the whole board cannot be weighted independently. "
        "Investigate before adding to KNOWN_BOARDWIDE_PAIRS.")
