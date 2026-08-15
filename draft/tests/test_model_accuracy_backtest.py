# TERRITORY: A
"""model_accuracy_backtest — the leak guard, the arithmetic, and the artifact pin."""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BT = HERE.parent / "backtest"
sys.path.insert(0, str(BT))

import model_accuracy_backtest as MAB  # noqa: E402


def test_the_graded_season_is_never_a_prior_season():
    """THE LEAK GUARD. The whole claim of the backtest is 'built strictly from
    prior seasons'; a graded season inside the priors would grade a model on
    its own answer key and every MAE would be flattery."""
    assert MAB.GRADED_SEASON not in MAB.PRIOR_SEASONS


def test_mae_bias_and_spearman_are_the_arithmetic_they_claim(monkeypatch):
    """Hand-checkable numbers through the real grading path."""
    actuals = {f"p{i}": a for i, a in enumerate([100.0, 200.0, 300.0, 150.0, 250.0,
                                                 120.0, 180.0, 220.0, 260.0, 140.0])}
    # forecast = actual + 10 for every player: MAE 10, bias +10, spearman 1.0
    model = {pid: a + 10.0 for pid, a in actuals.items()}
    monkeypatch.setattr(MAB, "season_totals", lambda season, last_week=17: (actuals, {}))
    monkeypatch.setattr(MAB, "positions_record", lambda: {pid: "QB" for pid in actuals})
    out = MAB.grade(models={"m": model})
    cell = out["models"]["m"]["cells"]["QB"]
    assert cell["status"] == "measured" and cell["n"] == 10
    assert cell["mae"] == 10.0 and cell["bias"] == 10.0 and cell["spearman"] == 1.0


def test_a_cell_below_MIN_N_is_unmeasurable_never_a_number(monkeypatch):
    actuals = {"a": 100.0, "b": 200.0}
    monkeypatch.setattr(MAB, "season_totals", lambda season, last_week=17: (actuals, {}))
    monkeypatch.setattr(MAB, "positions_record", lambda: {"a": "TE", "b": "TE"})
    out = MAB.grade(models={"m": {"a": 90.0, "b": 210.0}})
    cell = out["models"]["m"]["cells"]["TE"]
    assert cell == {"n": 2, "status": "unmeasurable"}, (
        "two players is not a measurement — a number here would read as one")


def test_K_and_DEF_are_declared_unmeasurable_not_skipped():
    art = json.loads((BT / "model_accuracy_2025.json").read_text())
    assert "K" in art["unmeasurable"] and "DEF" in art["unmeasurable"]
    assert "proj_mean_sources" in art["unmeasurable"], (
        "the artifact must say WHY the board's own sources are absent from a "
        "backtest that grades projection accuracy")


def _close(a, b, tol=0.002):
    """walk_forward sums player rates in SET iteration order, so float totals
    wobble in the ~1e-12 range between interpreter runs; a wobble that crosses
    a rank tie moves Spearman in the 4th decimal. mae/bias/n must match
    exactly; spearman within tol. A LOOSER tol would let a real drift hide —
    0.002 is the observed wobble (0.0004) with headroom, not a shrug."""
    if isinstance(a, dict) and isinstance(b, dict):
        if set(a) != set(b):
            return False
        return all(_close(a[k], b[k], tol) for k in a)
    if isinstance(a, float) and isinstance(b, float):
        return abs(a - b) <= tol
    return a == b


def test_the_COMMITTED_artifact_matches_regeneration():
    """The waiver_replacement.json pattern: the module drifting or the artifact
    going stale both fail; pinning alone would only catch a hand-edit."""
    art = json.loads((BT / "model_accuracy_2025.json").read_text())
    fresh = MAB.grade()
    assert _close(art["models"], fresh["models"]), (
        "artifact does not match the module's output beyond the documented "
        "spearman wobble — regenerate model_accuracy_2025.json")
    assert _close(art["head_to_head_shared_population"],
                  fresh["head_to_head_shared_population"])


def test_the_artifact_records_the_honest_negative():
    """walk_forward measured WORSE than the naive recency blend on the shared
    2025 population at every position. If a regeneration ever flips this, the
    standing-negative recommendation (REC-3) must be revisited — this test is
    the tripwire, not a hope that someone remembers."""
    art = json.loads((BT / "model_accuracy_2025.json").read_text())
    h2h = art["head_to_head_shared_population"]
    for pos, row in h2h.items():
        if row.get("status") != "measured":
            continue
        assert row["walk_forward"]["mae"] >= row["recency_blend"]["mae"], (
            f"{pos}: walk_forward now BEATS the recency blend — REC-3 in "
            "model_update_recommendations.json is stale, regenerate learning_loop")
