# TERRITORY: C
"""EXPERT-SPREAD-CEILING-PREREG.md §2-§4 + §8, EXECUTED.

Routed 2026-08-18 (ROUTES.md, A -> C, superseding the relay's earlier pass):
"TAKE THE LAST UNGRADED STUDY BEFORE THE DRAFT ... it is yours because the
as-of projection path is YOUR module." The relay's pass (main, commit
f386707c) DECLARED its own deviation from §3 — it graded within ECR band on
realized points "because historical bundles are not committed." They are:
`projection_error._assemble_asof_bundles` (this repo's own walk-forward
machinery, extracted for exactly this reuse) already builds the SAME
leak-free as-of `proj_mean` the shipped calibration is fitted on. This module
grades §3 AS SPECIFIED — within PROJECTION band, not ECR band.

WHAT AN ARM'S "CEILING" MEANS HERE, stated once rather than at every call
site. §0 already settled it: no source publishes a per-player point ceiling.
Every non-BASE arm instead converts a POSITIONAL RANK (FP's per-expert
opinion, reduced four different ways) into POINTS through OUR OWN as-of
projection curve for that season and position — "points at positional rank
r" = the `proj_mean` of whichever player OUR leak-free bundle ranked r-th at
that position that year (`points_at_rank`). Every arm therefore speaks in the
same units as `proj_mean`, comparable to BASE's cohort p90, without inventing
a projected-points number no source states.

§7's constraint — 2025's FP ranks are NOT purely preseason, `last_updated` is
14h27m after that season's kickoff — is enforced here, not left as a caveat.
`grade()` reports every candidate season's `last_updated` beside its result
(§7 consequence 1: "C reports every graded season's last_updated; A does not
rule until it does") and EXCLUDES BY NAME any season whose ranking postdates
that season's week 3 (§7 consequence 1's actual bar — later than kickoff is
not by itself disqualifying, and 2025 does not cross it: +14h27m lands in
week 1, not past week 3). An included-but-late season still carries §7
consequence 4's discount note.

ECR-SPREAD's "spread-scaled term" (§2 leaves the scaling to the implementer):
declared here as the FULL p10-p90 positional-rank width, converted to points
via the same curve, added un-shrunk to `proj_mean`. Undeclared on purpose:
because the grading metric is Spearman (rank-based), multiplying that term by
any fixed positive constant cannot change a single reported correlation — the
scale is a display choice, not a modelling one, so the least additional
apparatus is the honest one.

SHUFFLE permutes players' expert-derived positional ranks WITHIN the SAME
(position, band) group each Spearman is computed over — the finest stratum
at which a real per-player signal, if present, could not regenerate itself
by chance from band structure alone (§2's null, applied at grading grain).

CONDITION 3 (does not worsen Cory's-seat replay) is NOT evaluated by this
module. It requires re-running `replay_seats.js`'s choice-side engine
simulation with each arm's ceiling substituted in, which is TERRITORY: A
(`replay_seats_grade.py`, `engine_seat_choices.json`) and needs its own
network-side dispatch — not a read against committed stores. Left VOID here,
by name, rather than skipped silently; see `SHIP_CONDITIONS["worsens_replay"]`
in the output. If conditions 1/2/4 already fail for an arm, condition 3 is
moot for that arm regardless.

Run: python3 draft/backtest/expert_spread_ceiling_grading.py
Reads (committed, no egress): fp_expert_ranks_{2023,2024,2025}.json,
nflverse_weekly_points_{2023,2024,2025}.json, sleeper_name_index.json,
projection_error_calibration.json (BASE).
Egress ONLY inside `projection_error._assemble_asof_bundles` (Sleeper +
nflverse) — CI-only, same as `regenerate()`. Everything else here is pure
and unit-tested without a network.
Writes: expert_spread_ceiling_grading.json.
"""
from __future__ import annotations

import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent

import expert_grading as EG   # name_index / _norm / spearman — reused, not rewritten
import projection_error as PE  # _assemble_asof_bundles / error_rows / band_of / BAND_EDGES

SEASONS = PE.CALIBRATION_SEASONS  # (2023, 2024, 2025)
SKILL_POS = ("QB", "RB", "WR", "TE")
SHUFFLES = 400
SEED = 42

#: Sleeper's `years_exp` in `sleeper_name_index.json` is a CURRENT (2026)
#: snapshot, not a per-season field. `years_exp_as_of(season) = years_exp_now
#: - (CURRENT_SEASON - season)`; 0 there means the player was a rookie THAT
#: season. Standard Sleeper convention (years_exp increments by 1 per season)
#: — stated as a proxy, not verified per player, because it is a REPORT
#: (§8.2), not a ship gate.
CURRENT_SEASON = 2026

#: Real Thursday-night kickoffs (UTC), verified by WebSearch against each
#: season's actual opener (register 4t / §7). `week3_cutoff` adds 21 days —
#: three full weeks — as a stated, round-number proxy for "through week 3",
#: since the prereg names the bar without pinning an exact schedule date.
SEASON_OPENER_UTC = {
    2023: datetime(2023, 9, 8, 0, 20, 0, tzinfo=timezone.utc),   # Thu 9/7 8:20pm ET
    2024: datetime(2024, 9, 6, 0, 20, 0, tzinfo=timezone.utc),   # Thu 9/5 8:20pm ET
    2025: datetime(2025, 9, 5, 0, 20, 0, tzinfo=timezone.utc),   # Thu 9/4 8:20pm ET
}


def week3_cutoff(season):
    opener = SEASON_OPENER_UTC.get(season)
    return (opener + timedelta(days=21)) if opener else None


def season_ranking_status(season):
    """§7: this season's `last_updated`, and whether it is EXCLUDED (postdates
    its own week 3) or merely LATE (postdates kickoff but not week 3, carries
    §7.4's discount note) or CLEAN (at or before kickoff)."""
    doc = json.loads((HERE / f"fp_expert_ranks_{season}.json").read_text())
    meta = doc.get("source_meta") or {}
    ts = meta.get("last_updated_ts")
    opener = SEASON_OPENER_UTC.get(season)
    cutoff = week3_cutoff(season)
    if ts is None or opener is None:
        return {"season": season, "last_updated": meta.get("last_updated"),
                "last_updated_ts": ts, "status": "UNVERIFIABLE",
                "reason": "no last_updated_ts or no known kickoff for this season"}
    when = datetime.fromtimestamp(int(ts), tz=timezone.utc)
    if when > cutoff:
        return {"season": season, "last_updated": meta.get("last_updated"),
                "last_updated_ts": ts, "kickoff_utc": opener.isoformat(),
                "week3_cutoff_utc": cutoff.isoformat(),
                "status": "EXCLUDED",
                "reason": "ranking last revised after this season's week 3 — "
                          "graded on outcomes it could react to (§7.1)"}
    delta_h = (when - opener).total_seconds() / 3600.0
    status = "CLEAN" if when <= opener else "LATE"
    return {"season": season, "last_updated": meta.get("last_updated"),
            "last_updated_ts": ts, "kickoff_utc": opener.isoformat(),
            "week3_cutoff_utc": cutoff.isoformat(),
            "hours_after_kickoff": round(delta_h, 2), "status": status,
            "reason": ("frozen at or before kickoff" if status == "CLEAN" else
                      "postdates kickoff but not week 3 — included, not clean "
                      "evidence alone (§7.4)")}


def per_expert_positional_ranks(rows, position):
    """{expert_id: {fp_player_id: positional_rank}} for one season, derived
    from each expert's own OVERALL ordering restricted to `position` — NOT
    FP's `pos_rank` (that is FP's own aggregate, the thing under test)."""
    pos_rows = [r for r in rows if (r.get("position") or "").upper() == position]
    by_expert = {}
    for r in pos_rows:
        key = str(r.get("fp_player_id"))
        for e, overall in (r.get("expert_ranks") or {}).items():
            by_expert.setdefault(e, []).append((overall, key))
    out = {}
    for e, pairs in by_expert.items():
        pairs.sort(key=lambda t: t[0])
        out[e] = {key: i + 1 for i, (_, key) in enumerate(pairs)}
    return out


def player_expert_ranks(fp_row, per_expert_pos_ranks_for_position):
    """This player's POSITIONAL rank according to every expert who ranked
    them, via the per-expert table `per_expert_positional_ranks` built."""
    key = str(fp_row.get("fp_player_id"))
    out = []
    for e in (fp_row.get("expert_ranks") or {}):
        pr = per_expert_pos_ranks_for_position.get(e, {}).get(key)
        if pr is not None:
            out.append(pr)
    return out


def _quantile(sorted_vals, p):
    if not sorted_vals:
        return None
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    i = p * (len(sorted_vals) - 1)
    lo = int(i)
    hi = min(lo + 1, len(sorted_vals) - 1)
    frac = i - lo
    return sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac


def points_at_rank(curve, r):
    """`curve`: proj_mean values, descending, one per positional rank
    (curve[0] = rank 1). A rank past the population's size clips to the last
    value rather than extrapolating — the curve says nothing past its own
    population."""
    if not curve or r is None:
        return None
    i = max(1, min(int(round(r)), len(curve))) - 1
    return curve[i]


def build_curve(bundle, position):
    """proj_mean, descending, for `position` in one season's as-of bundle —
    "points at positional rank r" for every arm's rank->points step."""
    vals = [float(p.get("proj_mean") or 0.0) for p in (bundle.get("players") or [])
            if (p.get("position") or "").upper() == position]
    vals.sort(reverse=True)
    return vals


def crosswalk_fp_to_sleeper(fp_rows):
    """{sleeper_player_id: fp_row} for one season — same name-index and
    normalization `expert_grading.py` already uses, kept to ONE definition
    (rule 11) rather than a second crosswalk with its own edge cases."""
    idx = EG.name_index()
    out = {}
    misses = 0
    for r in fp_rows:
        hit = idx.get(EG._norm(r.get("name")))
        if not hit or (hit.get("position") or "").upper() != (r.get("position") or "").upper():
            misses += 1
            continue
        out[str(hit["player_id"])] = dict(r, _sleeper_id=str(hit["player_id"]),
                                          _years_exp_now=hit.get("years_exp"))
    return out, misses


#: §2 — named in advance, not tuned after seeing a result.
ARMS = ("BASE", "ECR-MIN", "ECR-Q10", "ECR-SPREAD")


def arm_implied_upside(arm, row, fp_row, per_expert_pos_ranks, curve, base_cells):
    """The arm's ceiling for this player, expressed as ceiling/proj_mean —
    scale-free, the same space `realized_ratio` lives in, and the space in
    which BASE is constant within a (position, band) cell by construction.
    Returns None if the arm cannot be evaluated for this player (no expert
    opinion, or an unmeasurable BASE cell)."""
    proj_mean = row["proj_mean"]
    if not proj_mean:
        return None
    if arm == "BASE":
        cell = base_cells.get((row["position"], row["band"]))
        if not cell or cell.get("status") != "measured":
            return None
        return cell.get("p90_ratio")
    ranks = player_expert_ranks(fp_row, per_expert_pos_ranks) if fp_row else []
    if not ranks:
        return None
    ranks_sorted = sorted(ranks)
    if arm == "ECR-MIN":
        r = ranks_sorted[0]
        pts = points_at_rank(curve, r)
    elif arm == "ECR-Q10":
        r = _quantile(ranks_sorted, 0.10)
        pts = points_at_rank(curve, r)
    elif arm == "ECR-SPREAD":
        r_lo = _quantile(ranks_sorted, 0.10)
        r_hi = _quantile(ranks_sorted, 0.90)
        pts_lo, pts_hi = points_at_rank(curve, r_lo), points_at_rank(curve, r_hi)
        if pts_lo is None or pts_hi is None:
            return None
        width = max(0.0, pts_lo - pts_hi)
        pts = proj_mean + width
    else:
        raise ValueError("unknown arm %r" % arm)
    if pts is None:
        return None
    return pts / proj_mean


def within_band_spearman(rows_with_upside):
    """{(position, band): (rho, n)} — Spearman(implied_upside, realized_ratio)
    computed separately per stratum, per §3 ("computed within projection
    band so a positive result cannot be manufactured by the mean-rank
    relationship BASE already encodes")."""
    groups = {}
    for r in rows_with_upside:
        groups.setdefault((r["position"], r["band"]), []).append(r)
    out = {}
    for key, grp in groups.items():
        if len(grp) < 5:
            out[key] = {"rho": None, "n": len(grp), "status": "too few to measure"}
            continue
        xs = [g["implied_upside"] for g in grp]
        ys = [g["ratio"] for g in grp]
        out[key] = {"rho": round(EG.spearman(xs, ys), 4), "n": len(grp), "status": "measured"}
    return out


def shuffle_null(rows_with_upside, rng, shuffles=SHUFFLES):
    """§2's SHUFFLE null, applied at grading grain: within each (position,
    band) stratum, permute WHICH player each `implied_upside` value belongs
    to (realized_ratio stays put), recompute the pooled n-weighted mean rho,
    repeat `shuffles` times. Returns the null distribution's observed-pooled
    rho list, for a p95 comparison against the real arm."""
    groups = {}
    for r in rows_with_upside:
        groups.setdefault((r["position"], r["band"]), []).append(r)
    null_pooled = []
    for _ in range(shuffles):
        total_w, total = 0, 0.0
        for grp in groups.values():
            if len(grp) < 5:
                continue
            xs = [g["implied_upside"] for g in grp]
            ys = [g["ratio"] for g in grp]
            shuffled = xs[:]
            rng.shuffle(shuffled)
            rho = EG.spearman(shuffled, ys)
            total += rho * len(grp)
            total_w += len(grp)
        null_pooled.append(total / total_w if total_w else 0.0)
    return null_pooled


def pooled_rho(band_result):
    """n-weighted mean rho across measured bands — one number per arm per
    season, for the ship-condition comparisons."""
    measured = [(v["rho"], v["n"]) for v in band_result.values()
               if v["status"] == "measured" and v["rho"] is not None]
    if not measured:
        return None
    total_w = sum(n for _, n in measured)
    return sum(rho * n for rho, n in measured) / total_w if total_w else None


def distinct_ceilings_condition(rows_by_arm):
    """§4 condition 4: among players sharing a `proj_mean` (rounded to the
    nearest point, the register-4j test), does the arm actually assign them
    DIFFERENT ceilings, or does one constant just replace another? Mirrors
    register 4j's own test (0 of 535 board players differed) and
    `fp_expert_ranks.coverage()`'s `distinct_rank_spreads`."""
    out = {}
    for arm, rows in rows_by_arm.items():
        groups = {}
        for r in rows:
            if r["implied_upside"] is None:
                continue
            groups.setdefault((r["position"], round(r["proj_mean"])), []).append(r["implied_upside"])
        sharing = {k: v for k, v in groups.items() if len(v) >= 2}
        distinct_within = sum(1 for v in sharing.values() if len(set(round(x, 4) for x in v)) > 1)
        out[arm] = {"proj_mean_groups_with_2plus_players": len(sharing),
                    "of_those_with_distinct_ceilings": distinct_within,
                    "status": ("REPAIRS 4j" if sharing and distinct_within == len(sharing)
                              else "PARTIAL" if distinct_within else
                              "DOES NOT REPAIR 4j — one constant replaced by another")}
    return out


def grade_season(per_expert_pos_ranks_by_pos, curves_by_pos, base_cells,
                 as_of_rows, fp_by_sleeper):
    rows_by_arm = {arm: [] for arm in ARMS}
    for row in as_of_rows:
        pos = row["position"]
        fp_row = fp_by_sleeper.get(row["player_id"])
        for arm in ARMS:
            upside = arm_implied_upside(
                arm, row, fp_row, per_expert_pos_ranks_by_pos.get(pos, {}),
                curves_by_pos.get(pos) or [], base_cells)
            rows_by_arm[arm].append(dict(row, implied_upside=upside))
    return rows_by_arm


def grade():  # pragma: no cover  (drives the egress-gated assembly step)
    """Reads every committed input, asks `_assemble_asof_bundles` for the
    as-of bundles, grades all four §2 arms plus SHUFFLE against §3's metric,
    reports §7's per-season status, §8's rookie slice, and §4's conditions
    1/2/4 (condition 3 explicitly VOID — see module docstring)."""
    asm = PE._assemble_asof_bundles(SEASONS)
    if asm.get("status") == "VOID":
        return asm
    bundles_by_season = {b.get("season"): b for b in asm["bundles"]}
    actual_by_season = {b.get("season"): a for b, a in zip(asm["bundles"], asm["actual"])}

    base_cal = PE.load()
    base_cells = base_cal.get("cells") or {}

    rng = random.Random(SEED)
    season_status = {}
    per_season = {}
    for season in SEASONS:
        season_status[str(season)] = season_ranking_status(season)
        bundle = bundles_by_season.get(season)
        actual = actual_by_season.get(season)
        if bundle is None or actual is None:
            per_season[str(season)] = {"status": "SKIPPED",
                                       "reason": "no as-of bundle/actual for this season"}
            continue

        as_of_rows = PE.error_rows(bundle, actual, only_positions=SKILL_POS)
        fp_doc = json.loads((HERE / f"fp_expert_ranks_{season}.json").read_text())
        fp_rows = fp_doc.get("players") or []
        fp_by_sleeper, crosswalk_misses = crosswalk_fp_to_sleeper(fp_rows)

        per_expert_pos_ranks_by_pos = {pos: per_expert_positional_ranks(fp_rows, pos)
                                       for pos in SKILL_POS}
        curves_by_pos = {pos: build_curve(bundle, pos) for pos in SKILL_POS}

        rows_by_arm = grade_season(per_expert_pos_ranks_by_pos, curves_by_pos,
                                   base_cells, as_of_rows, fp_by_sleeper)

        arms_out = {}
        for arm in ARMS:
            rows = [r for r in rows_by_arm[arm] if r["implied_upside"] is not None]
            band_rho = within_band_spearman(rows)
            pooled = pooled_rho(band_rho)
            null = (shuffle_null(rows, rng) if arm != "BASE" and rows else [])
            null_sorted = sorted(null)
            p95 = null_sorted[int(0.95 * len(null_sorted))] if null_sorted else None
            arms_out[arm] = {
                "graded_players": len(rows),
                "band_rho": {"%s|%s" % k: v for k, v in band_rho.items()},
                "pooled_rho": round(pooled, 4) if pooled is not None else None,
                "shuffle_p95_pooled_rho": round(p95, 4) if p95 is not None else None,
                "clears_shuffle": (pooled is not None and p95 is not None and pooled > p95),
            }

        rookie_rows_by_arm = {}
        for arm in ARMS:
            rr = []
            for r in rows_by_arm[arm]:
                if r["implied_upside"] is None:
                    continue
                fp_row = fp_by_sleeper.get(r["player_id"])
                years_exp_now = fp_row.get("_years_exp_now") if fp_row else None
                if years_exp_now is None:
                    continue
                years_exp_as_of = years_exp_now - (CURRENT_SEASON - season)
                if years_exp_as_of == 0:
                    rr.append(r)
            rookie_rows_by_arm[arm] = rr
        rookie_out = {}
        for arm in ARMS:
            band_rho = within_band_spearman(rookie_rows_by_arm[arm])
            pooled = pooled_rho(band_rho)
            rookie_out[arm] = {"graded_rookie_players": len(rookie_rows_by_arm[arm]),
                               "pooled_rho": round(pooled, 4) if pooled is not None else None}

        per_season[str(season)] = {
            "status": "MEASURED",
            "crosswalk_misses": crosswalk_misses,
            "on_board_skill_position_rows": len(as_of_rows),
            "arms": arms_out,
            "rookie_slice_§8": rookie_out,
            "condition_4_distinct_ceilings": distinct_ceilings_condition(rows_by_arm),
        }

    excluded = [s for s, v in season_status.items() if v.get("status") == "EXCLUDED"]
    included_seasons = [int(s) for s in per_season if s not in excluded
                        and per_season[s].get("status") == "MEASURED"]

    ship = {}
    for arm in ARMS:
        if arm == "BASE":
            continue
        wins = sum(1 for s in included_seasons
                  if (per_season[str(s)]["arms"][arm]["pooled_rho"] or -9) >
                     (per_season[str(s)]["arms"]["BASE"]["pooled_rho"] or 9))
        clears_shuffle_count = sum(1 for s in included_seasons
                                   if per_season[str(s)]["arms"][arm]["clears_shuffle"])
        cond4 = [per_season[str(s)]["condition_4_distinct_ceilings"][arm]["status"]
                for s in included_seasons]
        ship[arm] = {
            "condition_1_beats_base_on_2_of_3_seasons":
                {"seasons_beating_base": wins, "of": len(included_seasons),
                 "clears": wins >= 2 and len(included_seasons) >= 2},
            "condition_2_shuffle_does_not_match":
                {"seasons_clearing_shuffle": clears_shuffle_count, "of": len(included_seasons),
                 "clears": clears_shuffle_count == len(included_seasons) and len(included_seasons) > 0},
            "condition_3_worsens_replay": {"status": "VOID — not evaluated by this module; "
                                           "requires A's replay_seats_grade.py with this "
                                           "arm's ceiling substituted in"},
            "condition_4_repairs_4j": {"per_season": cond4},
            "ships": None,  # never computed here — Cory's call after 08-22, per §4
        }

    return {
        "_territory": "TERRITORY: C — produced by expert_spread_ceiling_grading.py",
        "_prereg": "EXPERT-SPREAD-CEILING-PREREG.md §2-§4, §7, §8",
        "_note": "NOTHING SHIPS TO THE BOARD BEFORE 2026-08-22 (§4). This is a "
                 "measurement, not a change — proj_ceiling and the board are "
                 "untouched by running this.",
        "seasons_requested": list(SEASONS),
        "season_ranking_status_§7": season_status,
        "seasons_excluded_by_name": excluded,
        "seasons_graded": included_seasons,
        "per_season": per_season,
        "ship_conditions_§4": ship,
    }


OUT = HERE / "expert_spread_ceiling_grading.json"


def main() -> int:  # pragma: no cover  (egress; CI only)
    result = grade()
    if result.get("status") == "VOID":
        print("VOID — %s" % result.get("reason"))
        return 1
    OUT.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"seasons_graded": result["seasons_graded"],
                      "ship_conditions_§4": result["ship_conditions_§4"]}, indent=2))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
