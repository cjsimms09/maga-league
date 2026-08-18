# TERRITORY: C
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))

import expert_spread_ceiling_grading as G  # noqa: E402
import projection_error as PE  # noqa: E402


# ── §7: season ranking status (last_updated vs kickoff vs week 3) ──────────

def test_season_ranking_status_2023_2024_ARE_CLEAN(monkeypatch, tmp_path):
    """The two seasons this repo already verified frozen to the second at
    kickoff must report CLEAN, not LATE or EXCLUDED. MUTATION: flip the
    `when <= opener` comparison and every clean season starts reading LATE."""
    monkeypatch.setattr(G, "HERE", tmp_path)
    for season, ts in ((2023, 1694132397), (2024, 1725581975)):
        (tmp_path / f"fp_expert_ranks_{season}.json").write_text(json.dumps(
            {"source_meta": {"last_updated": "x", "last_updated_ts": ts}}))
        out = G.season_ranking_status(season)
        assert out["status"] == "CLEAN", out


def test_season_ranking_status_2025_IS_LATE_NOT_EXCLUDED(monkeypatch, tmp_path):
    """2025's real capture is 14.5h after kickoff -- past kickoff, nowhere near
    week 3. MUTATION: drop the week-3 cutoff check entirely (exclude anything
    past kickoff) and this season would be wrongly thrown out rather than
    included-with-a-discount, silently shrinking the graded population."""
    monkeypatch.setattr(G, "HERE", tmp_path)
    (tmp_path / "fp_expert_ranks_2025.json").write_text(json.dumps(
        {"source_meta": {"last_updated": "9/05", "last_updated_ts": 1757083656}}))
    out = G.season_ranking_status(2025)
    assert out["status"] == "LATE"
    assert 14 < out["hours_after_kickoff"] < 15


def test_season_ranking_status_PAST_WEEK_3_IS_EXCLUDED(monkeypatch, tmp_path):
    """A ranking revised well after week 3 must exclude BY NAME (§7.1), not
    merely discount. MUTATION: return CLEAN/LATE for a wildly late timestamp
    and a hindsight-contaminated season would grade as if it were fine."""
    monkeypatch.setattr(G, "HERE", tmp_path)
    # 2025 kickoff + 60 days, well past the 21-day week-3 proxy.
    late_ts = int(G.SEASON_OPENER_UTC[2025].timestamp()) + 60 * 86400
    (tmp_path / "fp_expert_ranks_2025.json").write_text(json.dumps(
        {"source_meta": {"last_updated": "late", "last_updated_ts": late_ts}}))
    out = G.season_ranking_status(2025)
    assert out["status"] == "EXCLUDED"


def test_season_ranking_status_UNVERIFIABLE_without_last_updated_ts(monkeypatch, tmp_path):
    monkeypatch.setattr(G, "HERE", tmp_path)
    (tmp_path / "fp_expert_ranks_2025.json").write_text(json.dumps({"source_meta": {}}))
    out = G.season_ranking_status(2025)
    assert out["status"] == "UNVERIFIABLE"


# ── per-expert POSITIONAL ranks, derived from each expert's own overall order ──

def test_per_expert_positional_ranks_is_DERIVED_NOT_FPs_pos_rank():
    """Expert e1 ranked b,a,c OVERALL as 5,10,20 -- among RBs only that is
    b=1,a=2,c=3, even though the raw overall numbers are 5/10/20. MUTATION:
    sort by something other than the expert's own overall value (e.g. by FP's
    `pos_rank`) and this reorders silently since `pos_rank` is exactly the
    aggregate the arm is supposed to be an alternative to."""
    rows = [
        {"fp_player_id": "a", "position": "RB", "expert_ranks": {"e1": 10}},
        {"fp_player_id": "b", "position": "RB", "expert_ranks": {"e1": 5}},
        {"fp_player_id": "c", "position": "RB", "expert_ranks": {"e1": 20}},
        {"fp_player_id": "z", "position": "WR", "expert_ranks": {"e1": 1}},
    ]
    out = G.per_expert_positional_ranks(rows, "RB")
    assert out["e1"] == {"b": 1, "a": 2, "c": 3}
    assert "z" not in out["e1"], "a WR must never leak into an RB positional ranking"


def test_player_expert_ranks_ONLY_COUNTS_EXPERTS_WHO_RANKED_THIS_PLAYER():
    per_expert = {"e1": {"a": 2}, "e2": {"a": 5}, "e3": {"b": 1}}
    row = {"fp_player_id": "a", "expert_ranks": {"e1": 1, "e2": 1, "e3": 1}}
    assert sorted(G.player_expert_ranks(row, per_expert)) == [2, 5]


# ── rank -> points, through the as-of curve ─────────────────────────────────

def test_points_at_rank_CLIPS_AT_BOTH_ENDS():
    """MUTATION: index without clamping and a rank past the population raises
    or silently reads garbage off the end of the list."""
    curve = [300.0, 200.0, 100.0]
    assert G.points_at_rank(curve, 1) == 300.0
    assert G.points_at_rank(curve, 3) == 100.0
    assert G.points_at_rank(curve, 999) == 100.0, "past the population clips, not extrapolates"
    assert G.points_at_rank(curve, 0) == 300.0, "rank below 1 clips to rank 1"


def test_points_at_rank_EMPTY_CURVE_IS_None():
    assert G.points_at_rank([], 1) is None


# ── arm implied-upside, in ceiling/proj_mean units ──────────────────────────

def _fixture():
    fp_rows = [
        {"fp_player_id": "a", "position": "RB", "name": "Alpha",
         "expert_ranks": {"e1": 10, "e2": 30}},
        {"fp_player_id": "b", "position": "RB", "name": "Bravo",
         "expert_ranks": {"e1": 40, "e2": 5}},
    ]
    per_expert = G.per_expert_positional_ranks(fp_rows, "RB")
    curve = [300.0, 250.0, 200.0, 150.0, 100.0]
    base_cells = {("RB", "1-3"): {"status": "measured", "p90_ratio": 1.5},
                 ("RB", "4-8"): {"status": "unmeasurable", "p90_ratio": None}}
    return fp_rows, per_expert, curve, base_cells


def test_BASE_upside_is_the_cell_p90_ratio_REGARDLESS_of_expert_opinion():
    """BASE must be blind to expert data entirely -- it is the incumbent
    cohort constant. MUTATION: let BASE read `fp_row` and it stops being the
    thing every other arm is supposed to beat."""
    fp_rows, per_expert, curve, base_cells = _fixture()
    row = {"proj_mean": 100.0, "position": "RB", "band": "1-3"}
    assert G.arm_implied_upside("BASE", row, fp_rows[0], per_expert, curve, base_cells) == 1.5


def test_BASE_upside_UNMEASURABLE_CELL_is_None():
    fp_rows, per_expert, curve, base_cells = _fixture()
    row = {"proj_mean": 100.0, "position": "RB", "band": "4-8"}
    assert G.arm_implied_upside("BASE", row, fp_rows[0], per_expert, curve, base_cells) is None


def test_ECR_MIN_uses_the_MOST_BULLISH_expert_positional_rank():
    """Player a's positional ranks are [1, 2] (e1's overall 10 -> RB rank 1;
    e2's overall 30 -> RB rank 2, since b's e2 overall 5 is more bullish).
    ECR-MIN takes the best (lowest) -> rank 1 -> curve[0]=300 -> 300/100=3.0.
    MUTATION: take max() instead of min() and the "most bullish" arm would
    silently grade the LEAST bullish opinion instead."""
    fp_rows, per_expert, curve, base_cells = _fixture()
    row = {"proj_mean": 100.0, "position": "RB", "band": "1-3"}
    assert G.arm_implied_upside("ECR-MIN", row, fp_rows[0], per_expert, curve, base_cells) == 3.0


def test_ECR_SPREAD_never_LOWERS_the_ceiling_below_proj_mean():
    """The spread term is `max(0, pts_lo - pts_hi)` -- width is a magnitude,
    never negative. MUTATION: drop the max(0, ...) floor and a mis-ordered
    curve lookup could shave points off proj_mean instead of adding upside,
    turning a ceiling arm into something that sometimes lowers the estimate."""
    fp_rows, per_expert, curve, base_cells = _fixture()
    row = {"proj_mean": 100.0, "position": "RB", "band": "1-3"}
    upside = G.arm_implied_upside("ECR-SPREAD", row, fp_rows[0], per_expert, curve, base_cells)
    assert upside >= 1.0, "ceiling/proj_mean must never fall below 1.0 (the mean itself)"


def test_arm_upside_with_NO_expert_opinion_is_None():
    fp_rows, per_expert, curve, base_cells = _fixture()
    row = {"proj_mean": 100.0, "position": "RB", "band": "1-3"}
    orphan = {"fp_player_id": "nobody", "position": "RB", "expert_ranks": {}}
    for arm in ("ECR-MIN", "ECR-Q10", "ECR-SPREAD"):
        assert G.arm_implied_upside(arm, row, orphan, per_expert, curve, base_cells) is None


def test_arm_upside_ZERO_proj_mean_is_None_not_a_divide_by_zero():
    fp_rows, per_expert, curve, base_cells = _fixture()
    row = {"proj_mean": 0.0, "position": "RB", "band": "1-3"}
    assert G.arm_implied_upside("BASE", row, fp_rows[0], per_expert, curve, base_cells) is None


# ── within-band grading, and the null ───────────────────────────────────────

def test_within_band_spearman_KEEPS_BANDS_SEPARATE():
    """Two bands, each internally perfectly correlated but in OPPOSITE
    directions -- if bands were pooled before correlating, the result would
    wash toward zero and hide that both are actually strong signals.
    MUTATION: pool all rows into one Spearman call and this drops to ~0."""
    rows = ([{"position": "RB", "band": "1-3", "implied_upside": i, "ratio": i}
            for i in range(1, 6)] +
           [{"position": "RB", "band": "33+", "implied_upside": i, "ratio": -i}
            for i in range(1, 6)])
    out = G.within_band_spearman(rows)
    assert out[("RB", "1-3")]["rho"] == 1.0
    assert out[("RB", "33+")]["rho"] == -1.0


def test_within_band_spearman_THIN_BAND_REPORTS_STATUS_NOT_A_NUMBER():
    """MUTATION: compute a Spearman off 2 points anyway -- a coincidental
    correlation off n=2 would read exactly as confident as one off n=50."""
    rows = [{"position": "QB", "band": "1-3", "implied_upside": 1, "ratio": 1},
           {"position": "QB", "band": "1-3", "implied_upside": 2, "ratio": 2}]
    out = G.within_band_spearman(rows)
    assert out[("QB", "1-3")]["status"] == "too few to measure"
    assert out[("QB", "1-3")]["rho"] is None


def test_shuffle_null_DESTROYS_A_REAL_SIGNAL():
    """A perfectly-correlated stratum's shuffled twin must land far from 1.0
    almost every draw -- the whole point of the null. MUTATION: shuffle `ys`
    instead of `xs` (or shuffle nothing) and the null would just reproduce
    the same rho every time, and no real arm could ever clear it."""
    rows = [{"position": "RB", "band": "1-3", "implied_upside": i, "ratio": i}
           for i in range(1, 9)]
    rng = random.Random(7)
    null = G.shuffle_null(rows, rng, shuffles=200)
    assert sum(1 for v in null if v > 0.9) < 20, "a real 1.0 signal must not survive shuffling"


# ── §4 condition 4: distinct ceilings among players sharing a proj_mean ─────

def test_distinct_ceilings_condition_FLAGS_a_constant_replaced_by_a_constant():
    """Two players share proj_mean 100 and BOTH get ceiling 1.5 -- the exact
    register-4j shape the arm is supposed to fix. MUTATION: compare `len(v)`
    to something other than `len(sharing)` for the REPAIRS verdict and a
    partially-repaired arm could misreport as fully fixed."""
    rows = {"BASE": [{"position": "RB", "proj_mean": 100.0, "implied_upside": 1.5},
                     {"position": "RB", "proj_mean": 100.4, "implied_upside": 1.5}]}
    out = G.distinct_ceilings_condition(rows)
    assert out["BASE"]["status"] == "DOES NOT REPAIR 4j — one constant replaced by another"


def test_distinct_ceilings_condition_PASSES_when_ceilings_actually_differ():
    rows = {"ECR-MIN": [{"position": "RB", "proj_mean": 100.0, "implied_upside": 1.2},
                        {"position": "RB", "proj_mean": 100.4, "implied_upside": 3.7}]}
    out = G.distinct_ceilings_condition(rows)
    assert out["ECR-MIN"]["status"] == "REPAIRS 4j"


def test_distinct_ceilings_condition_SINGLETON_GROUPS_DONT_COUNT():
    """A proj_mean held by exactly one player says nothing about whether the
    arm discriminates -- there is no sibling to differ from."""
    rows = {"ECR-MIN": [{"position": "RB", "proj_mean": 100.0, "implied_upside": 1.2},
                        {"position": "RB", "proj_mean": 200.0, "implied_upside": 3.7}]}
    out = G.distinct_ceilings_condition(rows)
    assert out["ECR-MIN"]["proj_mean_groups_with_2plus_players"] == 0


# ── crosswalk reuse: must go through expert_grading, not a second definition ─

def test_crosswalk_fp_to_sleeper_REUSES_expert_grading_name_index(monkeypatch):
    """MUTATION: hand-roll a second normalization/lookup here instead of
    calling `EG.name_index()` and the two crosswalks can silently disagree on
    a name this repo has already special-cased once (rule 11)."""
    import expert_grading as EG

    monkeypatch.setattr(EG, "name_index", lambda: {
        "alpha": {"player_id": "111", "position": "RB", "years_exp": 2}})
    fp_rows = [{"name": "Alpha", "position": "RB", "fp_player_id": "a"},
              {"name": "Nobody Here", "position": "RB", "fp_player_id": "z"}]
    out, misses = G.crosswalk_fp_to_sleeper(fp_rows)
    assert set(out) == {"111"}
    assert out["111"]["_sleeper_id"] == "111"
    assert out["111"]["_years_exp_now"] == 2
    assert misses == 1


def test_crosswalk_fp_to_sleeper_REFUSES_a_position_mismatch(monkeypatch):
    """A name match at the WRONG position is not a crosswalk hit -- same
    Josh-Allen-the-linebacker discipline `sleeper_name_index.py` already
    applies. MUTATION: drop the position check and a QB could silently
    crosswalk onto a same-named kicker."""
    import expert_grading as EG

    monkeypatch.setattr(EG, "name_index", lambda: {
        "josh allen": {"player_id": "999", "position": "QB", "years_exp": 5}})
    fp_rows = [{"name": "Josh Allen", "position": "LB", "fp_player_id": "x"}]
    out, misses = G.crosswalk_fp_to_sleeper(fp_rows)
    assert out == {}
    assert misses == 1


# ── grade(): the full offline pipeline, real assembly mocked out ───────────

def test_grade_EXCLUDES_A_SEASON_BY_NAME_from_seasons_graded(monkeypatch, tmp_path):
    """The end-to-end wiring check for §7: a season whose capture lands
    EXCLUDED must not appear in `seasons_graded`, even though it still has a
    bundle and actuals available. MUTATION: build `seasons_graded` from
    `per_season`'s MEASURED status alone (ignoring `excluded`) and a
    hindsight-contaminated season would silently re-enter the primary
    result."""
    monkeypatch.setattr(G, "HERE", tmp_path)
    monkeypatch.setattr(PE, "load", lambda: {"cells": {}})

    for season in (2023, 2024, 2025):
        ts = int(G.SEASON_OPENER_UTC[season].timestamp())
        if season == 2025:
            ts += 60 * 86400  # push 2025 well past week 3
        (tmp_path / f"fp_expert_ranks_{season}.json").write_text(json.dumps({
            "source_meta": {"last_updated": "x", "last_updated_ts": ts},
            "players": [{"fp_player_id": "a", "name": "Alpha", "position": "RB",
                        "expert_ranks": {"e1": 1}}]}))

    bundles = [{"season": s, "players": [{"player_id": "111", "position": "RB",
                                          "proj_mean": 100.0, "proj_rank": 1}]}
              for s in (2023, 2024, 2025)]
    actual = [{"111": 150.0} for _ in (2023, 2024, 2025)]
    monkeypatch.setattr(PE, "_assemble_asof_bundles",
                        lambda seasons: {"bundles": bundles, "actual": actual, "skipped": []})
    import expert_grading as EG
    monkeypatch.setattr(EG, "name_index", lambda: {
        "alpha": {"player_id": "111", "position": "RB", "years_exp": 3}})

    out = G.grade()
    assert 2025 in out["seasons_excluded_by_name"] or "2025" in out["seasons_excluded_by_name"], out
    assert 2025 not in out["seasons_graded"]
    assert set(out["seasons_graded"]) == {2023, 2024}


def test_grade_VOID_PROPAGATES_from_assemble_asof_bundles(monkeypatch, tmp_path):
    """MUTATION: swallow the VOID and grade an empty population instead of
    surfacing the same failure `regenerate()` already refuses to hide."""
    monkeypatch.setattr(G, "HERE", tmp_path)
    monkeypatch.setattr(PE, "_assemble_asof_bundles",
                        lambda seasons: {"status": "VOID", "reason": "no egress here"})
    out = G.grade()
    assert out["status"] == "VOID"
