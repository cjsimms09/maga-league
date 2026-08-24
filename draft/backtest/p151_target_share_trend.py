# TERRITORY: D
"""P151 — grades Cory's own ceiling signal (PREDICTION-LEDGER.md, search "P151";
prereg CEILING-PROGRAM-PREREG-2026-08-20.md §4).

CLAIM UNDER TEST: among WR/TE with >=30 targets in season Y, the top quintile of
late-season target-share trend (delta = share weeks 10-17 minus share weeks 1-9)
booms in season Y+1 at >= 1.5x the 10% base rate, LOSO across the four year-pairs
2021->22, 2022->23, 2023->24, 2024->25.

DEFINITIONS, taken exactly from prereg SS1 and SS4 (not re-derived):
  * Season BOOM: realized season points finish in the top decile of
    (realized - LOO pick-curve expectation) WITHIN POSITION. Base rate 10% by
    construction. LOO = fit the pick-curve on the OTHER seasons, never on the
    season being graded.
  * Target share: verified on disk (see below) as player weekly targets over
    TEAM weekly targets -- the same normalisation `component_stats_*.json`'s
    own `tgt_share` field already carries (checked: sums to ~1.000 per
    team-week, see test file). We recompute it directly from raw target counts
    (sum player tgt / sum team tgt over the half-season window) rather than
    averaging the stored per-week `tgt_share`, because averaging per-week
    ratios is sensitive to bye/inactive weeks in a way summed counts are not.
  * Delta-share: share(wks 10-17) - share(wks 1-9), players with >=30
    SEASON-TOTAL targets (weeks 1-17) only.

DATA ACTUALLY ON DISK (verified before writing this, not assumed from the
prereg's description):
  * `component_stats_<season>.json`, 2021-2025: per-week per-player lines with
    `tgt`, `team`, `pos` -- confirmed shape (list of {week, players{pid:line}}).
  * Draft pick number ("historical ADP / draft pick number by player/season"):
    the ONLY per-player, per-season pick-number store on disk is this league's
    own draft record, `draft/data/league_history.json`, and it holds COMPLETE
    drafts for seasons 2023, 2024, 2025 only -- 2021 and 2022 do not exist in
    that file (checked: `[s['season'] for s in league_history['seasons']]` ==
    ['2026','2025','2024','2023']). `external_adp_historical.json` (FFC /
    FantasyPros) is ALSO 2023-2026 only. No 2021/2022 fantasy draft-pick data
    exists anywhere in this repo. CONSEQUENCE: the LOO pick-curve expectation,
    and therefore the boom label, can only be computed for Y+1 in
    {2023, 2024, 2025}. The 2021->22 pair is UNGRADABLE (Y+1=2022 has no pick
    data) and is reported as such, not silently dropped or faked -- 3 of the 4
    preregistered pairs are gradable.
  * Realized season points: `empirical_draft_value.season_totals()` is reused
    unmodified (Rule 11) -- it already routes 2023-2025 through the committed
    `nflverse_weekly_points_*.json` stores and 2021/2022 through
    `component_stats_*` scored under `frozen_table()` (the canonical scoring
    function the CLAUDE.md points at, reached via
    `fetch_component_stats.frozen_scoring_table()` / `scored_weekly_points()`),
    exactly the construction `draft_replay_2025` already uses for parity.

REUSE (Rule 11 -- one derivation, reused), all imported from
`empirical_draft_value.py` rather than reimplemented: `positions_record`,
`season_totals`, `league_drafts`, `mean`, `sd`, `_pct`, `spearman`, `POSITIONS`,
`ROUND_BANDS`. The one genuinely new piece of machinery is the per-POSITION LOO
round-band expectation (`_loo_round_expectation` in that module pools ALL
positions within a round together, which is wrong for a "per position" pick
curve) -- built here as `loo_round_band_expectation`, at the SAME round-band
granularity (`ROUND_BANDS`) that module already uses for its Q2/Q3 studies,
because raw per-pick-number regression is too thin: ~150 picks / 4 positions /
15 rounds averages ~2.5 players per (position, round) per season.

GATES from prereg SS2, all implemented below and read from `main()`:
  * Rule 3e known-positive control, demonstrated with power (not just run
    once): 2024 breakout WRs must show positive delta-share in 2023 at
    above-chance rate, AND a deliberately shuffled version of the same check
    must fail (drop to ~chance), or the "pass" proves nothing.
  * lift reported against the 10% base rate AND a shuffled-label null.
  * correlation gate: delta-share vs a valuation proxy, rank-correlation > 0.9
    is a "costume". No historical `proj_mean` / Draft Sharks band exists for
    2021-2025 (checked: `draft/baseline/*` and `public/draft_data.json` are
    2026-only board snapshots) -- the closest available valuation proxy is the
    player's own draft pick number the FOLLOWING season, which is reported
    with that caveat stated plainly.
"""
from __future__ import annotations

import json
import math
import random
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import empirical_draft_value as EDV  # noqa: E402  (Rule 11 reuse)

SEED = 20260820
EARLY_WEEKS = tuple(range(1, 10))          # weeks 1-9
LATE_WEEKS = tuple(range(10, 18))          # weeks 10-17
MIN_SEASON_TARGETS = 30
QUINTILE_Q = 0.80                          # top quintile == delta >= 80th pctile
BOOM_Q = 0.90                               # top decile
FEATURE_POS = ("WR", "TE")
YEAR_PAIRS = ((2021, 2022), (2022, 2023), (2023, 2024), (2024, 2025))
PICK_DATA_SEASONS = (2023, 2024, 2025)      # verified: only seasons with a
                                             # complete league draft on disk
ROUND_BANDS = EDV.ROUND_BANDS
SHUFFLE_REPS = 2000


# ── raw component-store access (target counts, not the pre-baked tgt_share) ─

def _component_raw_weeks(season: int) -> dict:
    doc = json.loads((HERE / f"component_stats_{season}.json").read_text())
    return {int(w["week"]): w["players"] for w in doc["weeks"]}


def _team_week_targets(players: dict) -> dict:
    out: dict[str, float] = defaultdict(float)
    for _pid, line in players.items():
        team = line.get("team")
        if team:
            out[team] += float(line.get("tgt", 0) or 0)
    return out


def delta_share(season: int, positions: dict) -> dict:
    """{pid: {pos, season_tgt, early_share, late_share, delta}} for WR/TE with
    >=30 season-total targets and >=1 counted week in EACH half (a player with
    zero counted weeks in a half has no share to compute and is excluded, not
    zeroed -- consistent with this repo's row-presence-is-missing-data rule)."""
    weeks = _component_raw_weeks(season)
    team_wk_tgt = {wk: _team_week_targets(players) for wk, players in weeks.items()}
    player_tgt_by_week: dict[str, dict] = defaultdict(dict)
    player_team_by_week: dict[str, dict] = defaultdict(dict)
    for wk, players in weeks.items():
        for pid, line in players.items():
            player_tgt_by_week[pid][wk] = float(line.get("tgt", 0) or 0)
            player_team_by_week[pid][wk] = line.get("team")

    def half_share(pid: str, week_range) -> float | None:
        num = den = 0.0
        counted = 0
        for wk in week_range:
            if wk not in player_tgt_by_week[pid]:
                continue
            counted += 1
            num += player_tgt_by_week[pid][wk]
            team = player_team_by_week[pid][wk]
            den += team_wk_tgt.get(wk, {}).get(team, 0.0)
        if counted == 0 or den <= 0:
            return None
        return num / den

    out = {}
    for pid, wkmap in player_tgt_by_week.items():
        pos = positions.get(pid)
        if pos not in FEATURE_POS:
            continue
        season_tgt = sum(wkmap.values())
        if season_tgt < MIN_SEASON_TARGETS:
            continue
        early = half_share(pid, EARLY_WEEKS)
        late = half_share(pid, LATE_WEEKS)
        if early is None or late is None:
            continue
        out[pid] = {"pos": pos, "season_tgt": round(season_tgt, 1),
                     "early_share": round(early, 4), "late_share": round(late, 4),
                     "delta": round(late - early, 4)}
    return out


# ── per-position LOO round-band pick-curve expectation (the new piece) ──────

def _band_of(rnd: int) -> str | None:
    for label, lo, hi in ROUND_BANDS:
        if lo <= rnd <= hi:
            return label
    return None


def loo_round_band_expectation(target_season: int, positions: dict) -> dict:
    """{pos: {band_label: mean pts}} fit on PICK_DATA_SEASONS EXCLUDING
    target_season -- the per-position analogue of EDV._loo_round_expectation,
    which pools all positions within a round and is the wrong grain here."""
    fit_seasons = [s for s in PICK_DATA_SEASONS if s != target_season]
    drafts = EDV.league_drafts()
    per: dict = defaultdict(lambda: defaultdict(list))
    for season in fit_seasons:
        totals, games = EDV.season_totals(season)
        for r in drafts[season]:
            pos = positions.get(r["pid"])
            if pos not in EDV.POSITIONS:
                continue
            pts = totals.get(r["pid"]) if games.get(r["pid"], 0) > 0 else None
            if pts is None:
                continue
            band = _band_of(r["round"])
            per[pos][band].append(pts)
    exp = {}
    for pos in EDV.POSITIONS:
        exp[pos] = {label: (EDV.mean(per[pos][label]) if per[pos].get(label) else None)
                    for label, _, _ in ROUND_BANDS}
    return exp, fit_seasons


def boom_labels(target_season: int, positions: dict):
    """Returns (rows, thresholds, residual_pool) or None if target_season has
    no pick data (ungradable). `rows` = {pid: {pos, pts, expected, residual,
    boom}} for every league-drafted skill-position player that season with a
    scorable band expectation. Decile threshold computed WITHIN position,
    across the full drafted population at that position -- boom is a
    population-relative label, not specific to the WR/TE trend cohort."""
    if target_season not in PICK_DATA_SEASONS:
        return None
    drafts = EDV.league_drafts()[target_season]
    totals, games = EDV.season_totals(target_season)
    exp, fit_seasons = loo_round_band_expectation(target_season, positions)
    by_pos_residual: dict = defaultdict(list)
    rows = {}
    for r in drafts:
        pos = positions.get(r["pid"])
        if pos not in EDV.POSITIONS:
            continue
        pts = totals.get(r["pid"]) if games.get(r["pid"], 0) > 0 else None
        if pts is None:
            continue
        band = _band_of(r["round"])
        e = exp[pos].get(band)
        if e is None:
            continue
        resid = pts - e
        rows[r["pid"]] = {"pos": pos, "round": r["round"], "pick_no": r["pick_no"],
                           "pts": pts, "expected": round(e, 2), "residual": resid}
        by_pos_residual[pos].append(resid)
    thresh = {pos: EDV._pct(vals, BOOM_Q) for pos, vals in by_pos_residual.items()}
    for pid, row in rows.items():
        row["boom"] = row["residual"] >= thresh[row["pos"]]
    return rows, thresh, by_pos_residual, fit_seasons


# ── binomial exact test (no scipy in this repo's stdlib-only style) ─────────

def binom_two_sided_p(k: int, n: int, p: float = 0.5) -> float:
    if n == 0:
        return float("nan")
    obs = math.comb(n, k) * (p ** k) * ((1 - p) ** (n - k))
    total = 0.0
    for i in range(n + 1):
        pi = math.comb(n, i) * (p ** i) * ((1 - p) ** (n - i))
        if pi <= obs * (1 + 1e-9):
            total += pi
    return min(1.0, total)


# ── known-positive control (Rule 3e/3f: demonstrated, not just run) ─────────

def known_positive_control(positions: dict) -> dict:
    """2024 breakout WRs must show positive delta-share in 2023 at
    above-chance rate, or the join between the two years is broken."""
    boom = boom_labels(2024, positions)
    if boom is None:
        return {"status": "ungradable"}
    rows2024, _thresh, _pool, _fit = boom
    breakout_wr_pids = [pid for pid, r in rows2024.items()
                        if r["pos"] == "WR" and r["boom"]]
    ds2023 = delta_share(2023, positions)
    checked = [(pid, ds2023[pid]["delta"]) for pid in breakout_wr_pids if pid in ds2023]
    n = len(checked)
    pos_n = sum(1 for _, d in checked if d > 0)
    rate = pos_n / n if n else None
    p_value = binom_two_sided_p(pos_n, n, 0.5) if n else None

    # demonstrate the control has power: break the join deliberately by
    # shuffling which player each 2023 delta-share value is attached to
    # (same population, same value distribution, identity destroyed) and
    # confirm the "pass" collapses toward chance.
    ds2023_pids = list(ds2023.keys())
    ds2023_vals = [ds2023[p]["delta"] for p in ds2023_pids]
    rng = random.Random(SEED)
    corrupted_rates = []
    for _ in range(1000):
        shuffled_vals = ds2023_vals[:]
        rng.shuffle(shuffled_vals)
        corrupted_map = dict(zip(ds2023_pids, shuffled_vals))
        c_checked = [corrupted_map[pid] for pid in breakout_wr_pids if pid in corrupted_map]
        if c_checked:
            corrupted_rates.append(sum(1 for d in c_checked if d > 0) / len(c_checked))
    corrupted_mean = EDV.mean(corrupted_rates) if corrupted_rates else None
    # power check: fraction of corrupted-join replicates that "pass" as loudly
    # as the real join did (>= observed rate)
    power_beaten_by_chance = (sum(1 for r in corrupted_rates if r >= rate) / len(corrupted_rates)
                               if (rate is not None and corrupted_rates) else None)

    return {
        "status": "ok",
        "breakout_wr_count_2024": len(breakout_wr_pids),
        "checked_n": n,
        "positive_delta_n": pos_n,
        "positive_rate": rate,
        "binomial_p_vs_chance": p_value,
        "control_demonstration": {
            "method": "shuffled the pid<->2023-delta-share mapping 1000x (same "
                      "value distribution, identity destroyed) to confirm a "
                      "broken join would NOT pass this control",
            "corrupted_join_mean_positive_rate": corrupted_mean,
            "corrupted_join_reps": len(corrupted_rates),
            "fraction_of_corrupted_reps_matching_or_beating_real_rate": power_beaten_by_chance,
        },
    }


# ── the actual LOSO grade, one year-pair at a time ───────────────────────────

def grade_pair(y: int, y1: int, positions: dict) -> dict:
    ds = delta_share(y, positions)
    if not ds:
        return {"year_pair": f"{y}->{y1}", "status": "no_delta_share_eligible_players"}
    if y1 not in PICK_DATA_SEASONS:
        return {"year_pair": f"{y}->{y1}", "status": "ungradable",
                "reason": f"no draft pick-number data exists for {y1} "
                          "(league_history.json and external_adp_historical.json "
                          "both start at 2023) -- LOO pick-curve expectation, "
                          "and therefore the boom label, cannot be computed"}
    boom = boom_labels(y1, positions)
    rows_y1, thresh, resid_pool, fit_seasons = boom
    deltas = [v["delta"] for v in ds.values()]
    cut = EDV._pct(deltas, QUINTILE_Q)
    top_q_pids = [pid for pid, v in ds.items() if v["delta"] >= cut]
    rest_pids = [pid for pid, v in ds.items() if v["delta"] < cut]
    gradable_top = [pid for pid in top_q_pids if pid in rows_y1]
    gradable_rest = [pid for pid in rest_pids if pid in rows_y1]
    booms_top = [pid for pid in gradable_top if rows_y1[pid]["boom"]]
    booms_rest = [pid for pid in gradable_rest if rows_y1[pid]["boom"]]
    rate_top = len(booms_top) / len(gradable_top) if gradable_top else None
    rate_rest = len(booms_rest) / len(gradable_rest) if gradable_rest else None
    lift = (rate_top / 0.10) if rate_top is not None else None

    # shuffled-label null: relabel which gradable players are "top quintile"
    # at random (fixed group size = len(gradable_top)) drawn from the full
    # gradable pool for this pair, recompute the boom rate of the shuffled
    # "top" group, many times.
    pool = gradable_top + gradable_rest
    rng = random.Random(SEED + y)
    null_rates = []
    if pool and gradable_top:
        boom_flags = {pid: rows_y1[pid]["boom"] for pid in pool}
        k = len(gradable_top)
        for _ in range(SHUFFLE_REPS):
            sample = rng.sample(pool, k)
            null_rates.append(sum(1 for pid in sample if boom_flags[pid]) / k)
    null_mean = EDV.mean(null_rates) if null_rates else None
    null_p = (sum(1 for r in null_rates if r >= rate_top) / len(null_rates)
              if (null_rates and rate_top is not None) else None)

    return {
        "year_pair": f"{y}->{y1}",
        "status": "graded",
        "loo_fit_seasons_used_for_Y+1_curve": fit_seasons,
        "delta_share_eligible_n": len(ds),
        "quintile_cutoff_delta": round(cut, 4),
        "top_quintile_n": len(top_q_pids),
        "top_quintile_gradable_n": len(gradable_top),  # drafted in Y+1 w/ a boom label
        "top_quintile_gradable_excluded_undrafted_in_Y+1": len(top_q_pids) - len(gradable_top),
        "top_quintile_booms": len(booms_top),
        "top_quintile_boom_rate": rate_top,
        "rest_gradable_n": len(gradable_rest),
        "rest_booms": len(booms_rest),
        "rest_boom_rate": rate_rest,
        "lift_vs_10pct_base_rate": lift,
        "shuffled_label_null": {
            "reps": len(null_rates),
            "null_mean_rate": null_mean,
            "empirical_p_observed_or_more_extreme": null_p,
        },
        "top_quintile_delta_share_values": sorted(
            [round(ds[pid]["delta"], 4) for pid in top_q_pids], reverse=True),
        "top_quintile_positions": {
            "WR": sum(1 for pid in top_q_pids if ds[pid]["pos"] == "WR"),
            "TE": sum(1 for pid in top_q_pids if ds[pid]["pos"] == "TE"),
        },
    }


def pooled_grade(pair_results: list) -> dict:
    graded = [p for p in pair_results if p["status"] == "graded"]
    if not graded:
        return {"status": "no_gradable_pairs"}
    top_booms = sum(p["top_quintile_booms"] for p in graded)
    top_n = sum(p["top_quintile_gradable_n"] for p in graded)
    rest_booms = sum(p["rest_booms"] for p in graded)
    rest_n = sum(p["rest_gradable_n"] for p in graded)
    rate_top = top_booms / top_n if top_n else None
    lift = rate_top / 0.10 if rate_top is not None else None
    return {
        "status": "graded",
        "pairs_pooled": [p["year_pair"] for p in graded],
        "pairs_excluded": [p["year_pair"] for p in pair_results if p["status"] != "graded"],
        "top_quintile_gradable_n": top_n,
        "top_quintile_booms": top_booms,
        "top_quintile_boom_rate": rate_top,
        "rest_gradable_n": rest_n,
        "rest_booms": rest_booms,
        "rest_boom_rate": (rest_booms / rest_n if rest_n else None),
        "lift_vs_10pct_base_rate": lift,
        "clears_1.5x_bar": (lift is not None and lift >= 1.5),
    }


def correlation_gate(pair_results: list, positions: dict) -> dict:
    """delta-share(Y) vs the player's OWN draft pick number in Y+1 -- the
    closest available valuation-proxy substitute for `proj_mean` / the Draft
    Sharks band, because NO historical per-season board snapshot (proj_mean,
    proj_ceiling/floor) exists anywhere in this repo for 2021-2025; every
    `draft/baseline/*` and `public/draft_data.json` artifact on disk is a 2026
    snapshot. Reported with that substitution stated, not silently swapped."""
    pairs = []
    for y, y1 in YEAR_PAIRS:
        if y1 not in PICK_DATA_SEASONS:
            continue
        ds = delta_share(y, positions)
        drafts_y1 = {r["pid"]: r["pick_no"] for r in EDV.league_drafts()[y1]}
        for pid, v in ds.items():
            if pid in drafts_y1:
                pairs.append((v["delta"], -drafts_y1[pid]))  # negate: higher
                # pick number = later = worse, so flip sign so "more positive
                # delta-share" lining up with "better (earlier) pick" reads as
                # a POSITIVE correlation like the prereg's proj_mean framing
    rho = EDV.spearman(pairs) if len(pairs) >= 3 else None
    n = len(pairs)
    return {
        "proxy_used": "player's own draft pick number in season Y+1 (negated, "
                      "so higher = earlier/more-valued), because no historical "
                      "proj_mean or Draft Sharks band exists for 2021-2025",
        "n": n,
        "spearman_rho": rho,
        "is_a_costume": (rho is not None and abs(rho) > 0.9),
    }


# ── INDEPENDENT CONTROLS (D, 2026-08-24) ────────────────────────────────────
# WHY THESE EXIST. The original `known_positive_control` asks:
#   "do 2024 breakout WRs show positive 2023 delta-share above chance?"
# That is the CONVERSE of the hypothesis under test -- P(high delta | boom)
# against P(boom | high delta). If Cory's signal is false, this control is
# EXPECTED to fail, so it cannot license a null: a control that can only pass
# when the hypothesis is true is not a control, it is a second measurement of
# the hypothesis.
#
# It did fail its own stated criterion (positive rate 0.40 on n=5, p=1.0), its
# corrupted-join demonstration shows 85.4% of DELIBERATELY BROKEN joins doing as
# well or better, and `status` was a hardcoded literal that read as a pass. Yet
# 5 of the 6 breakout WRs DID match by id into the 2023 table, so the join is
# demonstrably functional -- the control was mis-specified, not tripped.
#
# The two below are independent of the hypothesis by construction: one tests the
# ARITHMETIC on fabricated input, the other tests IDENTITY across seasons.
# Neither can be affected by whether target-share trend predicts booms.

def _synthetic_delta_share_control() -> dict:
    """MECHANICAL: fabricate two players and confirm delta_share's arithmetic.

    A player whose second-half target count DOUBLES must produce a large
    positive delta; one whose second-half count HALVES must produce a large
    negative one. Independent of the hypothesis: it is arithmetic on invented
    numbers, and it fails only if the computation is wrong."""
    weeks = {}
    for wk in range(1, 18):
        late = wk >= 10
        weeks[wk] = {
            "RISER": {"pos": "WR", "team": "AAA", "tgt": 12 if late else 6},
            "FALLER": {"pos": "WR", "team": "AAA", "tgt": 6 if late else 12},
            "FILLER": {"pos": "WR", "team": "AAA", "tgt": 12},
        }
    team_wk = {wk: _team_week_targets(pl) for wk, pl in weeks.items()}

    def half(pid, rng):
        num = den = 0.0
        for wk in rng:
            num += weeks[wk][pid]["tgt"]
            den += team_wk[wk]["AAA"]
        return num / den

    riser = half("RISER", range(10, 18)) - half("RISER", range(1, 10))
    faller = half("FALLER", range(10, 18)) - half("FALLER", range(1, 10))
    ok = riser > 0.05 and faller < -0.05
    return {
        "passed": ok,
        "riser_delta": round(riser, 4),
        "faller_delta": round(faller, 4),
        "requirement": "riser delta > +0.05 and faller delta < -0.05",
        "why_independent": "arithmetic on fabricated targets; cannot be affected "
                           "by whether the hypothesis is true",
    }


def _cross_season_identity_control(y: int, y1: int) -> dict:
    """IDENTITY: the same pid must denote the same POSITION in both seasons.

    A scrambled id-join would mix WRs with RBs/QBs at close to the population
    rate. Independent of the hypothesis: positions do not encode target trend."""
    try:
        a = _component_raw_weeks(y)
        b = _component_raw_weeks(y1)
    except FileNotFoundError:
        return {"passed": None, "reason": f"component_stats missing for {y} or {y1}"}
    def pos_of(weeks):
        out = {}
        for _wk, players in weeks.items():
            for pid, line in players.items():
                if line.get("pos"):
                    out.setdefault(pid, line["pos"])
        return out
    pa, pb = pos_of(a), pos_of(b)
    shared = [pid for pid in pa if pid in pb]
    agree = sum(1 for pid in shared if pa[pid] == pb[pid])
    rate = agree / len(shared) if shared else None
    ok = bool(shared) and rate is not None and rate >= 0.95
    return {
        "passed": ok,
        "seasons": f"{y}->{y1}",
        "shared_pids": len(shared),
        "position_agreement_rate": round(rate, 4) if rate is not None else None,
        "requirement": ">=0.95 position agreement on shared pids",
        "why_independent": "position identity does not encode target-share trend",
    }


def main() -> dict:
    positions = EDV.positions_record()
    control = known_positive_control(positions)
    # The original control's own criterion, evaluated rather than assumed. Its
    # `status` field is a hardcoded literal meaning "it ran", not "it passed".
    control["passes_its_own_criterion"] = bool(
        control.get("positive_rate") is not None
        and control["positive_rate"] > 0.5
        and (control.get("binomial_p_vs_chance") or 1.0) < 0.05)
    control["licenses_a_null"] = False
    control["why_not"] = ("this control is the CONVERSE of the hypothesis "
                          "(P(high delta|boom) vs P(boom|high delta)), so it is "
                          "expected to fail whenever the hypothesis is false. It "
                          "cannot license a null. See the independent controls.")
    independent = {
        "arithmetic": _synthetic_delta_share_control(),
        "identity": [_cross_season_identity_control(y, y1) for y, y1 in YEAR_PAIRS],
    }
    pair_results = [grade_pair(y, y1, positions) for y, y1 in YEAR_PAIRS]
    pooled = pooled_grade(pair_results)
    corr = correlation_gate(pair_results, positions)
    result = {
        "_territory": "TERRITORY: D",
        "_note": "P151 grade -- PREDICTION-LEDGER.md P151 / "
                 "CEILING-PROGRAM-PREREG-2026-08-20.md SS4. Written by "
                 "p151_target_share_trend.py.",
        "known_positive_control": control,
        "independent_controls": independent,
        "year_pairs": pair_results,
        "pooled": pooled,
        "correlation_gate": corr,
    }
    return result


if __name__ == "__main__":
    out = main()
    (HERE / "p151_target_share_trend.json").write_text(json.dumps(out, indent=2, default=str))
    print(json.dumps(out, indent=2, default=str))
    # GATE (D, 2026-08-24): this script used to exit 0 whatever its controls
    # said, so a broken pipeline and a real null were indistinguishable from
    # outside. The independent controls now gate the exit code.
    ic = out["independent_controls"]
    failed = []
    if not ic["arithmetic"]["passed"]:
        failed.append("arithmetic")
    for row in ic["identity"]:
        if row["passed"] is False:
            failed.append("identity " + row.get("seasons", "?"))
    if failed:
        print("INDEPENDENT CONTROLS FAILED: " + ", ".join(failed), file=sys.stderr)
        sys.exit(2)
