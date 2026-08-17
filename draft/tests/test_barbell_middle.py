# TERRITORY: A
"""Is the middle of the draft dead, or merely flat? — the claims this module
makes about itself.

Preregistration: `draft/audit/barbell_strategy_2026-08-17.md` §4.1.

The load-bearing tests here, and why each exists:

  * THE WIRE COUNTERFACTUAL IS THE ARGUABLE PART, SO IT IS PINNED TO ITS
    SOURCE. Every "dead" verdict in this study is a comparison against
    `wire_level.json`. If that artifact is regenerated with a different
    statistic — or if the module ever quietly starts reading `per_week` where
    it declared `ongoing.per_week` — every verdict moves and nothing says so.
    Both levels are asserted against the committed bytes, and the ORDER
    between them (churned > held at every position) is asserted too, because
    that ordering is the whole reason both are reported as a bracket.
  * BELOW REPLACEMENT IS NOT BELOW THE ALTERNATIVE. That distinction is the
    study's central conceptual claim, and it only means something if the two
    thresholds genuinely differ. A test asserts the wire sits materially below
    replacement at every position — if they ever coincide, the flat-vs-dead
    distinction is vacuous and this document needs rewriting.
  * NO SECOND DEFINITION OF AN OUTCOME. The survivorship arms, the scoring
    window and the LEAGUE-WINNER label all come from other committed modules
    by import. Tests assert this module's population IS
    `empirical_draft_value.pick_rows`'s and that the tier cuts ARE
    `tiered_outcome_model.K_SLOTS`'s — a drifted copy would produce numbers
    that look right and disagree with the study they are compared to.
  * ARM E AND ARM Z MUST AGREE IN SIGN, OR THE DISAGREEMENT IS THE FINDING.
    Pinned, because exactly one drafted skill player in three seasons never
    played, so the arms should be near-identical here and a large divergence
    would mean the arm split broke.

No test here touches the network.
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
BT = HERE.parent / "backtest"
sys.path.insert(0, str(BT))
sys.path.insert(0, str(HERE.parent))

import barbell_middle as BM                          # noqa: E402
import empirical_draft_value as EDV                  # noqa: E402
import tiered_outcome_model as TOM                   # noqa: E402

ARTIFACT = BT / "barbell_middle.json"


@pytest.fixture(scope="module")
def art():
    if not ARTIFACT.exists():
        pytest.skip("run python3 draft/backtest/barbell_middle.py first")
    return json.loads(ARTIFACT.read_text())


# ── the wire, the benchmark every "dead" verdict rests on ───────────────────

def test_wire_levels_are_the_committed_bytes_not_a_copy():
    doc = json.loads((BM.DATA / "wire_level.json").read_text())
    w = BM.wire_levels()
    for pos in BM.POSITIONS:
        assert w["held_per_week"][pos] == float(doc["ongoing"]["per_week"][pos])
        assert w["churned_per_week"][pos] == float(doc["per_week"][pos])
        # 17 scored weeks per roster spot — the league's own window.
        assert w["held_season"][pos] == pytest.approx(
            w["held_per_week"][pos] * 17, abs=0.05)


def test_held_is_below_churned_at_every_position():
    """The bracket only brackets if its two ends are ordered.

    `held` is the median of the three weeks AFTER acquisition; `churned` is the
    acquisition-week median over adds that were actually started, and is
    selection-biased upward by construction. If they ever cross, the artifact
    changed shape and 'primary vs upper bound' is no longer the right reading.
    """
    w = BM.wire_levels()
    for pos in BM.POSITIONS:
        assert w["churned_per_week"][pos] > w["held_per_week"][pos], pos


def test_replacement_minus_wire_splits_the_onesies_from_the_deep_positions():
    """THE STUDY'S CENTRAL DISTINCTION, AS A TEST — AND IT AR­RIVED RED TWICE.

    'Flat' and 'dead' can only differ where the alternative use of a roster
    spot is worth LESS than the starter-rank replacement level. This assertion
    was first written as `gap > 20` over all four positions. It failed at QB
    (gap −0.7), so it was narrowed to RB/WR/TE and failed again at TE (gap
    8.5). Both reds were right, and together they are a finding:

      QB  replacement 330.1  wire 330.8  gap  −0.7   the wire IS replacement
      TE  replacement 124.1  wire 115.6  gap   +8.5  the wire is nearly it
      WR  replacement 155.0  wire 124.1  gap  +30.9
      RB  replacement 170.8  wire 100.3  gap  +70.5

    **The split is exactly onesie-vs-deep.** QB and TE need 10 starters in a
    10-team league, so the wire holds essentially replacement-quality players
    at both; RB and WR need 21 and 29, so the wire is far below. Consequence
    for the study, and it is why this is a test rather than a sentence in the
    doc: at QB and TE, 'below replacement' and 'below the alternative' are the
    SAME statement and nothing can be separated; at RB and WR they are
    genuinely different questions, which is where the flat-vs-dead distinction
    does its work.
    """
    w = BM.wire_levels()
    repl = EDV.realized_replacement(EDV.positions_record())
    gap = {p: repl[p] - w["held_season"][p] for p in BM.POSITIONS}
    assert abs(gap["QB"]) < 10, gap
    assert 0 < gap["TE"] < 20, gap
    assert gap["WR"] > 20, gap
    assert gap["RB"] > 50, gap
    # Ordering, so a regenerated wire that reshuffles the positions is visible.
    assert gap["RB"] > gap["WR"] > gap["TE"] > gap["QB"], gap


def test_k_and_def_are_absent_from_the_wire_and_are_excluded_not_zeroed():
    """nflverse is offence-only, so K/DEF have no measured wire level.

    Absent is not zero: a K compared against a wire of 0.0 would read as a
    spectacular pick. The comparison must simply not be made for them.
    """
    doc = json.loads((BM.DATA / "wire_level.json").read_text())
    assert "K" not in doc["ongoing"]["per_week"]
    assert "DEF" not in doc["ongoing"]["per_week"]
    w = BM.wire_levels()
    assert set(w["held_season"]) == set(BM.POSITIONS)


# ── no second definition of anything ────────────────────────────────────────

def test_population_is_the_empirical_study_s_own_pick_rows(art):
    positions = EDV.positions_record()
    rows, surv = EDV.pick_rows(positions)
    assert art["survivorship"] == json.loads(json.dumps(surv))
    # 450 picks over three real drafts, and exactly one skill player who never
    # took a snap (empirical study §5) — the arm split's whole footprint.
    assert len(rows) == 450
    assert sum(s["never_played"] for s in surv.values()) == 1


def test_league_winner_cuts_are_the_committed_tiered_model_s(art):
    d = art["upside_arm_E"]["tier_definition"]
    assert d["K_slots"] == dict(TOM.K_SLOTS)
    assert d["league_winner_index"] == TOM.LEAGUE_WINNER
    assert d["tiers"] == list(TOM.TIERS)
    for season, field in d["by_season_field"].items():
        for pos, f in field.items():
            # ceil(K/2), asserted rather than trusted — an off-by-one here
            # silently doubles or halves every upside rate in the study.
            assert f["league_winner_cut"] == -(-f["K"] // 2), (season, pos)


def test_scoring_window_is_weeks_1_to_17(art):
    assert art["scoring_window_weeks"] == [1, EDV.LAST_SCORED_WEEK] == [1, 17]
    assert art["seasons"] == list(EDV.SEASONS)


def test_the_phase_boundary_is_corys_sentence_not_a_fitted_parameter(art):
    assert BM.BARBELL_PHASE_BOUNDARY == 8
    assert art["phase_boundary_round"] == 8
    labels = list(art["value_arm_E"]["by_phase"])
    assert labels == ["4-8 ANCHOR phase", "9-15 SWING phase"]


# ── the arms, and the shape of the answer ───────────────────────────────────

def test_arm_E_and_arm_Z_agree_in_sign_everywhere(art):
    """One never-played skill pick in 450 means the arms must be near-identical.

    A sign disagreement here would not be a finding about drafting — it would
    mean the arm split broke, because there is almost nothing for it to move.
    """
    e = art["value_arm_E"]["by_band"]
    z = art["value_arm_Z"]["by_band"]
    for band in e:
        if not e[band].get("n"):
            continue
        for key in ("vs_replacement", "vs_wire_held", "vs_wire_churned"):
            a, b = e[band][key]["mean"], z[band][key]["mean"]
            assert (a >= 0) == (b >= 0), (band, key, a, b)
            assert abs(a - b) < 15, (band, key, a, b)


def test_every_reported_cell_carries_an_n_and_an_interval(art):
    for arm in ("value_arm_E", "value_arm_Z"):
        for group in ("by_band", "by_phase", "by_round"):
            for label, cell in art[arm][group].items():
                if not cell.get("n"):
                    continue
                assert cell["ci95"] and len(cell["ci95"]) == 2, (arm, group, label)
                for key in ("vs_replacement", "vs_wire_held", "vs_wire_churned"):
                    d = cell.get(key)
                    if d is None:
                        continue
                    assert d["ci95"][0] <= d["mean"] <= d["ci95"][1], (label, key)
                    assert d["verdict"] in (
                        "ABOVE the alternative", "BELOW the alternative",
                        "one-season, not replicated",
                        "not distinguishable from noise", "insufficient n")


def test_the_verdict_rule_is_the_empirical_study_s_stability_rule():
    """CI excluding the null AND the same sign in >= 2 of 3 seasons.

    Broken at the boundary in both directions (rule 10a): a CI that excludes
    zero but replicates in only one season must NOT be called a finding.
    """
    assert BM._verdict(1.0, 5.0, {2023: 1, 2024: 1, 2025: -1}) == "ABOVE the alternative"
    assert BM._verdict(-5.0, -1.0, {2023: -1, 2024: -1, 2025: 1}) == "BELOW the alternative"
    assert BM._verdict(1.0, 5.0, {2023: 1, 2024: -1, 2025: -1}) == "one-season, not replicated"
    assert BM._verdict(-1.0, 5.0, {2023: 1, 2024: 1, 2025: 1}) == "not distinguishable from noise"
    assert BM._verdict(float("nan"), float("nan"), {}) == "insufficient n"


def test_the_headline_the_middle_is_at_wire_parity_and_the_late_band_is_below(art):
    """THE STUDY'S ANSWER, PINNED SO A RERUN THAT MOVES IT IS VISIBLE.

    Not a tautology: three separate things have to hold together — the middle
    band's wire interval must COVER zero (flat, not dead), the late band's must
    lie ENTIRELY BELOW it (dead), and the early band's ENTIRELY ABOVE it. If a
    refetch of any input flips one of them, this test names which.
    """
    band = art["value_arm_E"]["by_band"]
    early = band["4-6 EARLY"]["vs_wire_held"]
    mid = band["7-10 MIDDLE"]["vs_wire_held"]
    late = band["11-15 LATE"]["vs_wire_held"]
    assert early["ci95"][0] > 0, early
    assert mid["ci95"][0] < 0 < mid["ci95"][1], mid
    assert late["ci95"][1] < 0, late


def test_the_late_band_carries_no_extra_upside_tail(art):
    """The half of Cory's hypothesis that had never been measured.

    'Draft upside late' predicts the late band holds MORE league-winners than
    the middle. Measured, it holds fewer, in all three seasons. Pinned by sign,
    not by magnitude — the magnitude is inside its own interval.
    """
    d = art["upside_arm_E"]["late_minus_middle_league_winner_rate"]
    assert d["difference"] < 0
    assert all(v is not None and v <= 0 for v in d["per_season"].values()), d
    assert d["verdict"] == "not distinguishable from noise"


def test_choosing_inside_every_band_beat_a_blind_draw(art):
    """The second, independent sense of 'dead': is the PICKING informative?

    A band where real picks do no better than the mean of what was still on the
    board would be dead in a way no value comparison can see. None is.
    """
    for label, cell in art["picking_information"]["by_band"].items():
        if not cell.get("n"):
            continue
        assert cell["vs_blind"]["ci95"][0] > 0, (label, cell["vs_blind"])
        assert cell["mean_pool_remaining"] > 300, label


def test_board_state_pool_shrinks_monotonically_within_a_season():
    """CONTROL — an availability model that never removed anyone would make the
    blind-draw baseline constant and the whole of (c) vacuous."""
    positions = EDV.positions_record()
    state = BM.board_state(positions)
    for season, per_pick in state.items():
        picks = sorted(per_pick)
        sizes = [per_pick[p]["pool_n"] for p in picks]
        assert sizes == sorted(sizes, reverse=True), season
        assert sizes[0] - sizes[-1] >= 100, (season, sizes[0], sizes[-1])


def test_late_quarterback_is_the_worst_cell_against_the_wire(art):
    """A streamed QB is worth ~19.5 pts/week — the highest wire level of any
    position — so a bench QB drafted late is the one pick the wire dominates
    outright. Named because it is the most actionable single cell in the study.
    """
    cells = art["value_arm_E"]["by_band_position"]
    lateqb = cells["11-15 LATE|QB"]["vs_wire_held"]
    assert lateqb["ci95"][1] < 0, lateqb
    worst = min((c["vs_wire_held"]["mean"], k) for k, c in cells.items()
                if c.get("n") and c.get("vs_wire_held"))
    assert worst[1] == "11-15 LATE|QB", worst
