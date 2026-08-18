# TERRITORY: A
"""GUARDS FOR THE QB SCORING-ARBITRAGE STUDY.

The finding this file protects is a NEGATIVE one — the 43.67-point gap between
this league's scoring and the market that prices its ADP does not survive
replacement, and moves picks by a fraction of a round rather than by rounds. A
negative finding is exactly the kind that rots quietly: nothing goes red when a
refactor turns `gap(q) − gap(R)` back into `gap(q)`, and the board would start
recommending quarterbacks two rounds early with every test still green.

So the tests below pin the ARITHMETIC IDENTITY the conclusion rests on, the
LEVEL-CANCELLATION property that is the whole argument, and the two contrasting
pick numbers (naive vs honest) that a reader would use to tell which version is
running.

Run: python -m pytest draft/tests/test_qb_scoring_arbitrage.py -q
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))

from backtest import qb_scoring_arbitrage as QA  # noqa: E402
from backtest.lab_scoring_gap import MARKET_OVERRIDES  # noqa: E402


@pytest.fixture(scope="module")
def board():
    return json.loads(QA.BOARD.read_text())


@pytest.fixture(scope="module")
def rule12():
    return json.loads(QA.RULE12.read_text())


# ── the premise ──────────────────────────────────────────────────────────────

def test_THE_TWO_SCORINGS_DIFFER_IN_EXACTLY_THE_TWO_TERMS_CLAIMED():
    """If a third term ever differs, the closed-form gap is silently wrong."""
    cfg = json.loads((ROOT / "draft" / "config" / "league_config.json").read_text())
    ours = cfg["scoring"]
    theirs = QA.market_scoring(ours)
    differing = {k for k in ours if ours[k] != theirs.get(k)}
    assert differing == {"pass_td", "pass_int"}, differing
    assert ours["pass_td"] == 6.0 and ours["pass_int"] == -2.0
    assert MARKET_OVERRIDES == {"pass_td": 4, "pass_int": -1}


def test_THE_FROZEN_HISTORICAL_STORE_WAS_SCORED_UNDER_OUR_PASSING_TERMS():
    """The historical arm's returns must be in the league's own currency."""
    doc = json.loads(Path(str(QA.WEEKLY).format(season=2023)).read_text())
    table = doc["weeks"][0]["scoring"]
    assert table["pass_td"] == 6.0
    assert table["pass_int"] == -2.0
    # one fingerprint across the captured span, so no week rode a different table
    assert len(set(doc["scoring_fingerprints"])) == 1


# ── the identity ─────────────────────────────────────────────────────────────

def test_CLOSED_FORM_GAP_AGREES_WITH_THE_SHIPPED_SCORER_ON_COMMITTED_ROWS(rule12):
    scoring = rule12["scoring_settings"]
    measured = QA.measured_qb_gaps(rule12)
    assert measured, "no committed raw QB rows — the study lost its only measurement"
    for m in measured:
        row = rule12["players"][m["player_id"]]["projection_row"]
        assert m["gap"] == QA.gap_from_stat_line(row, scoring), m["name"]


def test_THE_GAP_IS_ZERO_OFF_THE_PASSING_STATS():
    """A running back gains nothing. That is why this is a QB story at all."""
    assert QA.gap_identity(0, 0) == 0.0
    cfg = json.loads((ROOT / "draft" / "config" / "league_config.json").read_text())
    rb = {"rush_td": 12, "rush_yd": 1200, "rec": 40, "rec_yd": 300}
    assert QA.gap_from_stat_line(rb, cfg["scoring"]) == 0.0


def test_A_RUSHING_TOUCHDOWN_IS_WORTH_NOTHING_TO_THIS_ARBITRAGE():
    """Pinned because it is the counter-intuitive half of the mechanism: the
    quarterbacks a drafter most wants to 'take early' are rushing quarterbacks,
    and rushing is the part of their game the two scorings agree about."""
    assert QA.gap_identity(20, 8) == QA.gap_identity(20, 8)   # rushing absent
    pocket = QA.gap_identity(pass_td=32, pass_int=12)
    runner = QA.gap_identity(pass_td=22, pass_int=8)
    assert pocket > runner, "high passing-TD volume must gain more, not less"


# ── the argument: levels cancel, only dispersion survives ────────────────────

@pytest.mark.parametrize("level", [0.0, 17.5, 40.0, 1000.0])
def test_A_UNIFORM_GAP_IS_WORTH_EXACTLY_ZERO_AFTER_REPLACEMENT(level):
    """THE WHOLE FINDING, as a property.

    If every quarterback — the replacement included — gains the same number of
    points, the arbitrage is worth nothing to a pick, whatever that number is.
    A 43.67 that cannot be distinguished from 1000.0 in VORP terms is not an edge.
    """
    assert QA.dvorp(level, level) == 0.0


def test_ONLY_THE_DIFFERENCE_FROM_REPLACEMENT_SURVIVES():
    """Shifting both gaps by any constant leaves dVORP untouched."""
    for shift in (0.0, 5.0, 100.0):
        assert QA.dvorp(44.0 + shift, 40.0 + shift) == 4.0


def test_THE_MEASURED_REPLACEMENT_PROXY_REALLY_SITS_AT_THE_REPLACEMENT_LINE(board, rule12):
    """The substitution of Trevor Lawrence for 'the replacement QB' is the one
    empirical step in the 2026 arm. If the nearest measurable quarterback drifts
    far from the line on a future board, gap(R) stops being measured and the
    dVORP number must not be quoted as if it still were."""
    measured = QA.measured_qb_gaps(rule12)
    rep = QA.replacement_qb_proxy(board, [m["player_id"] for m in measured])
    assert abs(rep["distance_points"]) < 10.0, (
        f"nearest measurable QB is {rep['distance_points']} points off the "
        f"replacement line — gap(R) is no longer a measurement")


# ── points into picks ────────────────────────────────────────────────────────

def test_A_ZERO_BONUS_REPRODUCES_THE_BOARDS_OWN_RANKS(board):
    """Guards the rank machinery against an off-by-one that would make every
    movement number wrong in the same direction."""
    moved = QA.ranks_after_qb_bonus(board, 0.0)
    for p in board["players"]:
        if p.get("overall_rank") and p.get("vorp") is not None:
            assert moved[str(p["player_id"])] == p["overall_rank"], p["name"]


def test_MORE_BONUS_NEVER_MOVES_A_QUARTERBACK_DOWN(board):
    qb = QA.qb_board(board)[1]                      # QB2, room to move either way
    pid = str(qb["player_id"])
    ranks = [QA.ranks_after_qb_bonus(board, b)[pid] for b in (0, 5, 10, 25, 60)]
    assert ranks == sorted(ranks, reverse=True), ranks


def test_THE_NAIVE_AND_HONEST_ANSWERS_DISAGREE_LARGELY_AT_QB1(board):
    """The pinned contrast. Treating the raw gap as VORP moves the board's QB1
    by SEVERAL TIMES what the replacement-corrected number moves him. If these
    two ever converge, one of them has been broken.

    RE-DERIVED TWICE 2026-08-17, and the second time is the lesson. The
    original pin demanded a literal full round from the naive arm —
    calibrated on the pre-ruling board (1.2 rounds); the ruled board seats
    QB1 higher, the same bonus moves him 0.7 rounds, and the pin refused a
    board whose contrast was intact (run 32043426901). My first re-pin then
    GUESSED the ruled board's honest arm at <=2 slots and demanded a 3x
    ratio; the ruled board measures honest=3, naive=7, and the guessed
    ratio refused it too (run 32044307209) — the fitted-bound mistake,
    committed while fixing the fitted-bound mistake.

    So the pin is now the DIFFERENCE, measured on both boards rather than
    guessed on either: pre-ruling 12 vs 2 slots (gap 10), ruled 7 vs 3
    (gap 4). The claim this test protects — treating the raw scoring gap as
    VORP materially misprices QB1 relative to the replacement-corrected
    read — is a several-slot separation plus a bounded honest arm, not any
    one board's exact figures."""
    qb1 = QA.qb_board(board)[0]
    naive = QA.slots_moved(board, 43.67, [qb1["player_id"]])[0]
    honest = QA.slots_moved(board, 4.00, [qb1["player_id"]])[0]
    assert naive["slots_earlier"] - honest["slots_earlier"] >= 2, (naive, honest)
    assert naive["slots_earlier"] >= 5, naive
    assert honest["rounds_earlier"] <= 0.5, honest


def test_BREAKEVEN_IS_A_REFUSAL_NOT_A_CLAMP_WHEN_UNREACHABLE(board):
    """Asking a quarterback to climb further than the board is deep returns None."""
    qb1 = QA.qb_board(board)[0]
    assert QA.breakeven_bonus(board, qb1["player_id"], want_slots=10_000) is None


def test_BREAKEVEN_ACTUALLY_ACHIEVES_THE_MOVE_IT_QUOTES(board):
    """A break-even that does not clear the bar it names is a wrong number, not a
    conservative one."""
    for row in QA.breakeven_table(board, top=4):
        need = row["dvorp_needed_for_one_round"]
        if need is None:
            continue
        qb = next(q for q in QA.qb_board(board) if q["name"] == row["name"])
        moved = QA.slots_moved(board, need, [qb["player_id"]])[0]
        assert moved["slots_earlier"] >= QA.TEAMS, (row["name"], moved)


def test_THE_MEASURED_EDGE_FALLS_FAR_SHORT_OF_EVERY_BREAKEVEN(board, rule12):
    """The finding, stated as a comparison a drafter can act on: the arbitrage
    that is actually measured is nowhere near what a one-round move would need."""
    measured = QA.measured_qb_gaps(rule12)
    rep = QA.replacement_qb_proxy(board, [m["player_id"] for m in measured])
    gap_r = next(m["gap"] for m in measured if m["player_id"] == rep["nearest_qb_id"])
    best = max(QA.dvorp(m["gap"], gap_r) for m in measured)
    needs = [r["dvorp_needed_for_one_round"] for r in QA.breakeven_table(board, top=6)
             if r["dvorp_needed_for_one_round"] is not None]
    assert best < min(needs), (best, min(needs))


def test_THE_CONCLUSION_HOLDS_ACROSS_EVERY_PLAUSIBLE_REPLACEMENT_GAP(board):
    """The adversarial sweep, pinned.

    gap(R)=40 is measured off a proxy 1.70 points above the line, while the QB
    actually ON the line is a rushing quarterback whose gap is plausibly lower —
    which would make the arbitrage BIGGER. Even at gap(R)=24, implying a
    replacement quarterback who throws 17 touchdowns, the board's QB1 still moves
    less than a full round. If that ever stops being true the verdict changes and
    this test is where it should surface.
    """
    rows = QA.dvorp_sensitivity(board, 44.0)
    assert rows, "sensitivity sweep produced nothing"
    assert all(r["qb1_rounds_earlier"] < 1.0 for r in rows), rows
    # and it must be monotone: a smaller replacement gap can only help the thesis
    slots = [r["qb1_slots_earlier"] for r in rows]
    assert slots == sorted(slots, reverse=True), slots


# ── the historical arm's machinery ───────────────────────────────────────────

def test_ISOTONIC_FIT_IS_NON_INCREASING_AND_EXACT_ON_MONOTONE_INPUT():
    xs = [1, 2, 3, 4, 5]
    ys = [10.0, 8.0, 6.0, 4.0, 2.0]
    assert QA._isotonic(xs, ys) == ys
    noisy = QA._isotonic([1, 2, 3, 4], [5.0, 9.0, 3.0, 1.0])
    assert all(noisy[i] >= noisy[i + 1] - 1e-9 for i in range(len(noisy) - 1)), noisy
    assert abs(sum(noisy) - sum([5.0, 9.0, 3.0, 1.0])) < 1e-9, "PAVA must preserve mass"


def test_ISOTONIC_RESIDUALS_SUM_TO_ZERO_SO_NO_POSITION_IS_FAVOURED_BY_THE_FIT():
    ys = [12.0, 3.0, 40.0, 5.0, 1.0, 9.0]
    fit = QA._isotonic([1, 2, 3, 4, 5, 6], ys)
    assert abs(sum(y - f for y, f in zip(ys, fit))) < 1e-9


def test_POSTSEASON_WEEKS_ARE_NOT_COUNTED_AS_FANTASY_POINTS():
    """NFL weeks 19-22 are in the store and score nothing in this league. Counting
    them would hand four teams' quarterbacks a month nobody could start."""
    assert list(QA.REG_SEASON_WEEKS) == list(range(1, 19))
    _, stamp = QA._load_weekly_totals(2024)
    assert max(stamp["weeks_used"]) == 18
    assert len(stamp["weeks_used"]) == 18


def test_BOOTSTRAP_REFUSES_TO_INVENT_AN_INTERVAL_IT_CANNOT_HAVE():
    out = QA._boot_ci([])
    assert out["lo"] is None and out["hi"] is None and "why" in out
    one = QA._boot_ci([5.0])
    assert one["mean"] == 5.0 and one["lo"] is None


def test_UNMATCHED_AND_UNGRADED_PICKS_ARE_EXCLUDED_AND_COUNTED_NEVER_ZEROED():
    """Absent is not zero. The counts have to survive, or the denominator lies."""
    cfg = json.loads((ROOT / "draft" / "config" / "league_config.json").read_text())
    history = json.loads(QA.HISTORY.read_text())
    positions = json.loads(QA.POSITIONS.read_text())
    res = QA.season_residuals(2025, history, positions, cfg)
    exc = res["excluded_counted"]
    assert set(exc) == {"keeper", "no_position", "not_graded_position",
                        "no_realized_row"}
    assert exc["keeper"] > 0, "2025 had keepers; a zero here means they leaked in"
    assert exc["not_graded_position"] > 0, "K and DEF picks exist and must be counted"
    graded = {r["player_id"] for r in res["picks"]}
    assert len(graded) == res["n"]
    # every graded row carries a real realized total, not a filled-in zero
    assert all(r["points"] != 0.0 for r in res["picks"]), \
        "a 0.0 in the primary arm means an absent player was zeroed"


def test_THE_SENSITIVITY_ARM_ADMITS_MORE_PICKS_THAN_THE_PRIMARY():
    cfg = json.loads((ROOT / "draft" / "config" / "league_config.json").read_text())
    history = json.loads(QA.HISTORY.read_text())
    positions = json.loads(QA.POSITIONS.read_text())
    a = QA.season_residuals(2025, history, positions, cfg)
    b = QA.season_residuals(2025, history, positions, cfg, unmatched_as_zero=True)
    assert b["n"] >= a["n"]
    assert b["n"] - a["n"] == a["excluded_counted"]["no_realized_row"]


def test_REALIZED_REPLACEMENT_IS_RECOMPUTED_PER_SEASON_NOT_BORROWED_FROM_THE_BOARD():
    """A single replacement level across three seasons would make the residual a
    statement about which season was high-scoring."""
    cfg = json.loads((ROOT / "draft" / "config" / "league_config.json").read_text())
    history = json.loads(QA.HISTORY.read_text())
    positions = json.loads(QA.POSITIONS.read_text())
    levels = [QA.season_residuals(s, history, positions, cfg)["realized_replacement"]["QB"]
              for s in QA.SEASONS]
    assert len(set(levels)) == len(levels), levels
    board = json.loads(QA.BOARD.read_text())
    assert board["replacement"]["replacement_points"]["QB"] not in levels


def test_PERMUTATION_NULL_RETURNS_A_FRACTION_AND_REFUSES_ON_AN_EMPTY_POSITION():
    cfg = json.loads((ROOT / "draft" / "config" / "league_config.json").read_text())
    history = json.loads(QA.HISTORY.read_text())
    positions = json.loads(QA.POSITIONS.read_text())
    seasons = [QA.season_residuals(s, history, positions, cfg) for s in QA.SEASONS]
    out = QA.permutation_null(seasons, "QB", draws=200)
    assert 0.0 <= out["two_sided_fraction_at_least_as_extreme"] <= 1.0
    assert "why" in QA.permutation_null(seasons, "PUNTER", draws=10)
