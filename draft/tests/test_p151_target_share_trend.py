# TERRITORY: D
"""P151 target-share-trend grader -- the claims it makes about ITSELF.

Preregistration: `draft/CEILING-PROGRAM-PREREG-2026-08-20.md` SS1, SS2, SS4.
Ledger: `PREDICTION-LEDGER.md`, P151.

What is pinned here, and why:
  * THE TGT_SHARE NORMALISATION. `component_stats_*.json`'s own `tgt_share`
    field, and this module's own re-derivation from raw `tgt` counts, must
    both sum to ~1.0 across a team's players in a given week -- otherwise
    "target share" isn't a share at all and every downstream number is
    meaningless.
  * THE ELIGIBILITY FILTER. `delta_share` must return WR/TE only, and only
    players with >=30 SEASON-total targets.
  * THE LOSO LEAKAGE GUARD (prereg SS1's explicit "check it explicitly with a
    test" requirement). `loo_round_band_expectation(target_season, ...)` must
    never fit on `target_season` itself.
  * THE BOOM BASE RATE. The decile threshold construction must produce a
    boom rate close to 10% within a position across ITS OWN drafted
    population (not the WR/TE trend cohort, which is a different, smaller,
    non-representative subset by design -- that subset's rate is exactly what
    P151 is grading, so it is NOT expected to sit at 10%).
  * THE MISSING-DATA GAP. 2021->2022 must come back UNGRADABLE, explicitly,
    because no draft pick-number data for 2022 exists anywhere in this repo
    (checked directly against `league_history.json` and
    `external_adp_historical.json`) -- silently dropping it or silently
    fabricating a curve would both be worse than a stated gap.
  * THE STATISTICS. The exact binomial two-sided p-value is pinned against
    hand-computed values.

No test here touches the network.
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
BT = HERE.parent / "backtest"
sys.path.insert(0, str(BT))

import empirical_draft_value as EDV  # noqa: E402
import p151_target_share_trend as P  # noqa: E402


# ── the data-source claims this module makes about itself ──────────────────

def test_tgt_share_sums_to_one_per_team_week_raw_counts():
    """Confirms the RAW re-derivation (sum tgt / sum team tgt) agrees with the
    store's own precomputed `tgt_share` field, spot-checked on one season/week
    -- if these disagree the two are not the same normalisation and P151's
    'target share' claim is wrong."""
    weeks = P._component_raw_weeks(2022)
    w1 = weeks[1]
    team_tot = P._team_week_targets(w1)
    for pid, line in w1.items():
        team = line.get("team")
        stored = line.get("tgt_share")
        if stored is None or not team or team_tot.get(team, 0) <= 0:
            continue
        recomputed = line.get("tgt", 0) / team_tot[team]
        assert abs(recomputed - stored) < 0.01, (pid, recomputed, stored)


def test_league_history_has_no_2021_or_2022_draft():
    """Pins the exact data gap this module's docstring claims: pick-number
    data starts at 2023. If this ever starts failing because 2021/2022 drafts
    were added to the store, P151's 2021->22 pair should be re-run, not left
    UNGRADABLE forever."""
    doc = json.loads((HERE.parent / "data" / "league_history.json").read_text())
    seasons = {s["season"] for s in doc["seasons"]}
    assert "2022" not in seasons and "2021" not in seasons
    assert "2023" in seasons


def test_external_adp_historical_also_starts_at_2023():
    doc = json.loads((BT / "external_adp_historical.json").read_text())
    assert set(doc["years"].keys()) == {"2023", "2024", "2025", "2026"}


# ── eligibility filter ───────────────────────────────────────────────────────

def test_delta_share_is_wr_te_only_and_respects_the_target_floor():
    positions = EDV.positions_record()
    ds = P.delta_share(2023, positions)
    assert ds, "fixture assumption: 2023 has eligible players"
    for pid, row in ds.items():
        assert row["pos"] in ("WR", "TE")
        assert row["season_tgt"] >= P.MIN_SEASON_TARGETS
        assert -1.0 <= row["delta"] <= 1.0


def test_delta_share_excludes_a_low_target_player():
    """A player under the 30-target floor must not appear, even if he has
    rows in both halves of the season."""
    positions = EDV.positions_record()
    weeks = P._component_raw_weeks(2023)
    # find a real WR/TE under the floor to use as the fixture
    totals = {}
    for wk, players in weeks.items():
        for pid, line in players.items():
            if positions.get(pid) in ("WR", "TE"):
                totals[pid] = totals.get(pid, 0) + line.get("tgt", 0)
    low = [pid for pid, t in totals.items() if 0 < t < P.MIN_SEASON_TARGETS]
    assert low, "fixture assumption: at least one under-floor WR/TE exists in 2023"
    ds = P.delta_share(2023, positions)
    for pid in low:
        assert pid not in ds


# ── LOSO leakage guard (prereg SS1: 'check it explicitly with a test') ──────

def test_loo_round_band_expectation_never_fits_on_its_own_target_season():
    positions = EDV.positions_record()
    for season in P.PICK_DATA_SEASONS:
        _exp, fit_seasons = P.loo_round_band_expectation(season, positions)
        assert season not in fit_seasons, \
            f"LOO curve for {season} leaked {season} into its own fit"
        assert set(fit_seasons) <= set(P.PICK_DATA_SEASONS) - {season}


def test_boom_labels_none_for_a_season_with_no_pick_data():
    positions = EDV.positions_record()
    assert P.boom_labels(2022, positions) is None
    assert P.boom_labels(2021, positions) is None


# ── the boom base rate is ~10% BY CONSTRUCTION, within a position's own
#    drafted population (not the WR/TE trend cohort -- see module docstring) ─

def test_boom_base_rate_near_ten_percent_within_position():
    positions = EDV.positions_record()
    for season in P.PICK_DATA_SEASONS:
        rows, thresh, pool, _fit = P.boom_labels(season, positions)
        for pos, vals in pool.items():
            if len(vals) < 10:
                continue
            n_boom = sum(1 for pid, r in rows.items()
                         if r["pos"] == pos and r["boom"])
            rate = n_boom / len(vals)
            # decile construction on a finite, discretely-valued sample: not
            # exactly 10%, but must be in a sane neighbourhood of it.
            assert 0.03 <= rate <= 0.20, (season, pos, rate, len(vals))


# ── the year-pair grading and the stated 2021->22 gap ───────────────────────

def test_2021_to_22_pair_is_explicitly_ungradable():
    positions = EDV.positions_record()
    r = P.grade_pair(2021, 2022, positions)
    assert r["status"] == "ungradable"
    assert "2022" in r["reason"]


def test_the_three_gradable_pairs_all_return_a_status():
    positions = EDV.positions_record()
    for y, y1 in ((2022, 2023), (2023, 2024), (2024, 2025)):
        r = P.grade_pair(y, y1, positions)
        assert r["status"] == "graded", r
        assert r["top_quintile_gradable_n"] > 0
        assert 0 <= r["top_quintile_boom_rate"] <= 1
        assert r["shuffled_label_null"]["reps"] == P.SHUFFLE_REPS


def test_pooled_grade_excludes_the_ungradable_pair():
    positions = EDV.positions_record()
    pairs = [P.grade_pair(y, y1, positions) for y, y1 in P.YEAR_PAIRS]
    pooled = P.pooled_grade(pairs)
    assert pooled["pairs_excluded"] == ["2021->2022"]
    assert len(pooled["pairs_pooled"]) == 3
    assert pooled["top_quintile_gradable_n"] == sum(
        p["top_quintile_gradable_n"] for p in pairs if p["status"] == "graded")


# ── known-positive control's OWN power check ────────────────────────────────

def test_known_positive_control_shuffle_lands_near_chance():
    """The control's own corruption test must actually corrupt the join --
    if shuffling the pid<->delta-share mapping did NOT move the positive
    rate toward 50%, the shuffle isn't doing what it claims to."""
    positions = EDV.positions_record()
    result = P.known_positive_control(positions)
    assert result["status"] == "ok"
    demo = result["control_demonstration"]
    assert demo["corrupted_join_reps"] == 1000
    assert 0.35 <= demo["corrupted_join_mean_positive_rate"] <= 0.65, \
        "a shuffled pid<->delta mapping should land near chance (0.5); it \
did not, which means the shuffle itself is not exercising the join the way \
the control claims to"


# ── statistics, pinned against a hand-computed answer ───────────────────────

@pytest.mark.parametrize("k,n,expected", [
    (0, 5, 0.0625),
    (5, 5, 0.0625),
    (2, 5, 1.0),
    (3, 10, 0.34375),
])
def test_binom_two_sided_p_matches_hand_computed_values(k, n, expected):
    assert P.binom_two_sided_p(k, n, 0.5) == pytest.approx(expected, abs=1e-9)


def test_correlation_gate_uses_a_real_proxy_and_flags_costumes_correctly():
    positions = EDV.positions_record()
    pairs = [P.grade_pair(y, y1, positions) for y, y1 in P.YEAR_PAIRS]
    gate = P.correlation_gate(pairs, positions)
    assert gate["n"] > 50
    assert -1.0 <= gate["spearman_rho"] <= 1.0
    assert gate["is_a_costume"] == (abs(gate["spearman_rho"]) > 0.9)
