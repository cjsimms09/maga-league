# TERRITORY: C
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))

import model_accuracy_grade as G  # noqa: E402


def test_population_EXCLUDES_no_position_and_counts_it():
    proj = {"1": 100.0, "2": 90.0}
    actual = {"1": 95.0, "2": 85.0}
    positions = {"1": "RB"}  # "2" has no position on record
    pop = G.population(proj, actual, positions)
    assert pop["cells"]["RB"] == {"1": (100.0, 95.0)}
    assert pop["exclusions"]["excluded_no_position"] == 1


def test_population_EXCLUDES_no_actual_and_counts_it():
    """MUTATION: drop a player with no realized row silently (or score them
    0) instead of excluding+counting -- a bust with no weekly row is not the
    same fact as a bust who scored zero, and conflating them biases MAE."""
    proj = {"1": 100.0}
    actual = {}  # never played
    positions = {"1": "RB"}
    pop = G.population(proj, actual, positions)
    assert pop["cells"]["RB"] == {}
    assert pop["exclusions"]["excluded_no_actual"] == 1


def test_precision_at_k_PERFECT_MODEL_scores_1(_k=12):
    pairs = {str(i): (100.0 - i, 100.0 - i) for i in range(20)}  # pred==act exactly
    r = G.precision_at_k(pairs, 12)
    assert r["status"] == "measured"
    assert r["precision"] == 1.0
    assert r["hits"] == 12


def test_precision_at_k_INVERTED_MODEL_scores_LOW_not_necessarily_0():
    """A model that ranks EXACTLY BACKWARDS should find none of the real
    top-12 in its own top-12 (for a big enough pool the two sets are
    disjoint). MUTATION: sort ascending instead of descending anywhere and
    this inversion check would silently pass with everything flipped."""
    n = 30
    pairs = {str(i): (float(i), 100.0 - i) for i in range(n)}  # pred and act perfectly inverted
    r = G.precision_at_k(pairs, 12)
    assert r["precision"] == 0.0


def test_precision_at_k_UNMEASURABLE_below_the_k_floor():
    """MUTATION: compute precision off fewer than k real candidates and a
    12-player pool graded 'at 24' would silently re-read its own top-12
    twice, reporting a number for a comparison that cannot exist."""
    pairs = {str(i): (float(30 - i), float(30 - i)) for i in range(12)}
    r = G.precision_at_k(pairs, 24)
    assert r["status"] == "unmeasurable"


def test_grade_position_UNMEASURABLE_below_min_n_reports_NO_NUMBER():
    """MUTATION: compute spearman/mae off 3 players anyway -- a coincidental
    fit off n=3 would read exactly as confident as one off n=50, the same
    failure this project's calibration cells already guard against."""
    pairs = {"1": (10.0, 12.0), "2": (20.0, 18.0), "3": (30.0, 33.0)}
    cell = G.grade_position(pairs, min_n=10)
    assert cell["status"] == "unmeasurable"
    assert cell["spearman"] is None
    assert cell["mae"] is None
    assert cell["precision"]["12"]["status"] == "unmeasurable"


def test_grade_position_MEASURED_carries_both_metric_families():
    pairs = {str(i): (float(30 - i), float(30 - i) + (1 if i % 2 else -1)) for i in range(20)}
    cell = G.grade_position(pairs, min_n=10)
    assert cell["status"] == "measured"
    assert cell["spearman"] is not None
    assert cell["mae"] is not None
    assert set(cell["precision"]) == {"12", "24"}


def test_grade_TOP_LEVEL_produces_all_four_positions_and_names_K_DEF_unmeasurable():
    proj = {str(i): 300.0 - i for i in range(60)}
    actual = {str(i): 300.0 - i for i in range(60)}
    positions = {str(i): ("QB" if i < 15 else "RB" if i < 30 else
                          "WR" if i < 45 else "TE") for i in range(60)}
    out = G.grade(proj, actual, positions, min_n=10)
    assert set(out["cells"]) == set(G.POSITIONS)
    assert "K" in out["unmeasurable_positions"] and "DEF" in out["unmeasurable_positions"]
    assert out["graded"] == 60


def test_grade_TWO_SOURCES_ON_THE_SAME_POPULATION_ARE_DIRECTLY_COMPARABLE():
    """The whole point of a shared harness: two different projection_maps
    graded through the SAME function on the SAME actual/positions produce
    cells comparable position-by-position, no second derivation needed."""
    actual = {str(i): 200.0 - i for i in range(20)}
    positions = {str(i): "WR" for i in range(20)}
    good = {str(i): 200.0 - i for i in range(20)}          # near-perfect
    bad = {str(i): float((i * 37) % 20) for i in range(20)}  # scrambled

    g_good = G.grade(good, actual, positions, min_n=10)
    g_bad = G.grade(bad, actual, positions, min_n=10)
    assert g_good["cells"]["WR"]["spearman"] > g_bad["cells"]["WR"]["spearman"]
    assert g_good["cells"]["WR"]["precision"]["12"]["precision"] >= \
          g_bad["cells"]["WR"]["precision"]["12"]["precision"]


def test_grade_reuses_lab_projections_spearman_not_a_second_derivation():
    """MUTATION: hand-roll a second spearman here instead of importing D13's
    -- a subtle tie-handling or ranking difference between two 'spearman'
    functions is exactly the two-places-that-drift shape rule 11 warns
    about, and it would make own_v6 vs a v7 candidate incomparable to D13's
    own historical numbers."""
    import lab_projections
    assert G.spearman is lab_projections.spearman
