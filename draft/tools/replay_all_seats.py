# TERRITORY: A
"""ALL-SEATS DRAFT REPLAY — does the tool lose to EVERYONE's drafting, or
just Cory's? Built 2026-08-16 for the league benchmark
(draft/audit/league_benchmark_2026-08-16.md).

CORY'S QUESTIONS, VERBATIM (2026-08-16):
  "Does model lose to everyone's drafting or just mine? We need to make this
   model better or at least better than most of the league at drafting, how
   do we do that?"
and the addendum:
  "Do we need to find who the best drafter were? Top 3 and study what they
   do better then make sure model can do that or better"

── WHAT THIS RUNS ─────────────────────────────────────────────────────────────

The EXISTING replay machinery (draft/tools/draft_replay_2025.py — imported,
never edited) is driven for EVERY seat, every season 2023-25: the tool sits
in owner X's real seat with X's real keepers, every OTHER owner's picks
byte-identical to history (the same fixed-opponents counterfactual, per
seat), K/DEF mirrored from X's actual picks, and both frozen rosters — the
tool's and X's actual drafted roster — graded on actual weekly points under
both lineup arms (hindsight-optimal = the roster-quality primary; realistic
start-of-week). PER-SEAT CAVEAT, NAMED: each seat's replay is its own
alternative history — ten seats are ten separate counterfactuals, not one
consistent re-drafted league.

── THE CANDIDATE LAYERS, GRADED THROUGH THE SAME REPLAY ───────────────────────

The single-seat replay named the mechanisms where Cory beat the tool. Two
are buildable walk-forward and run here as configs beside the baseline,
their forms PREREGISTERED in the audit doc before any grade was computed:

  · rookie_prior      — draft/tools/rookie_prior.py (NFL draft capital →
                        rookie-season expectation; classes < Y only)
  · year2_escalator   — draft/tools/year2_escalator.py (measured year-1→2
                        progression, pooled transitions ≤ Y−1)
  · both              — the two together

The third mechanism (roster-status news) is NOT built: the live 2026 board
already carries team/depth/injury fields — verified here against the
committed board (roster_status_verification in the artifact) instead of
re-implemented. The Brady-2023 pathology is a walk-forward artifact.

Every config re-runs every seat and every year; a layer's grade is whether
it closed the tool-vs-owner gaps (Cory's seat first) and lifted the tool's
league-table position — per year, reported honestly even where a layer
helps one year and hurts another.

Run: python3 draft/tools/replay_all_seats.py
Writes draft/data/replay_league_table.json (deterministic byte-for-byte).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent            # draft/tools
DRAFT = HERE.parent
ROOT = DRAFT.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(DRAFT / "backtest"))
sys.path.insert(0, str(DRAFT))

import draft_replay_2025 as R  # noqa: E402  (imported, never edited)
import drafter_skill as DS  # noqa: E402
from model_accuracy_backtest import positions_record  # noqa: E402
from own_model_v2 import board_ages  # noqa: E402
from rookie_prior import fit_rookie_prior, load_store, rookie_overlay  # noqa: E402
from vorp import replacement_levels  # noqa: E402
from year2_escalator import (  # noqa: E402
    fit_escalator,
    transition_distribution,
    year2_overlay,
)

OUT = DRAFT / "data" / "replay_league_table.json"
BOARD = ROOT / "public" / "draft_data.json"

SEASONS = (2025, 2024, 2023)
SEATS = tuple(range(1, 11))
CONFIGS = ("baseline", "rookie_prior", "year2_escalator", "both")

QUESTION_VERBATIM = ("Does model lose to everyone's drafting or just mine? "
                     "We need to make this model better or at least better "
                     "than most of the league at drafting, how do we do "
                     "that?")
ADDENDUM_VERBATIM = ("Do we need to find who the best drafter were? Top 3 "
                     "and study what they do better then make sure model "
                     "can do that or better")


# ── config boards ────────────────────────────────────────────────────────────

def config_boards(season: int, positions: dict, ages: dict,
                  store: dict) -> dict:
    """{config: {proj, positions, overlay_meta}} for one season. The
    baseline is the identical own_v6_nomarket walk-forward board the
    single-seat replay graded; layers modify copies only."""
    baseline = R.build_projections(season, positions, ages)
    r_fit = fit_rookie_prior(season, store)
    e_fit = fit_escalator(season, store)
    rk = rookie_overlay(season, baseline, store, r_fit)
    y2 = year2_overlay(season, baseline, positions, store, e_fit)

    def with_rookies(proj: dict, pos: dict):
        proj = dict(proj)
        pos = dict(pos)
        for pid, info in rk.items():
            proj[pid] = info["proj"]
            pos.setdefault(pid, info["pos"])
        return proj, pos

    esc = dict(baseline)
    esc.update(y2)
    both_proj, both_pos = with_rookies(esc, positions)
    rk_proj, rk_pos = with_rookies(baseline, positions)
    return {
        "baseline": {"proj": baseline, "positions": positions,
                     "meta": {}},
        "rookie_prior": {"proj": rk_proj, "positions": rk_pos,
                         "meta": {"fit": r_fit,
                                  "rookies_added": len(rk)}},
        "year2_escalator": {"proj": esc, "positions": positions,
                            "meta": {"fit": e_fit,
                                     "players_escalated": len(y2)}},
        "both": {"proj": both_proj, "positions": both_pos,
                 "meta": {"rookies_added": len(rk),
                          "players_escalated": len(y2)}},
    }


# ── one seat, one config ─────────────────────────────────────────────────────

def seat_verdict(seat: int, picks: list, keeper_pids: set, proj: dict,
                 repl: dict, positions: dict, weekly: dict, totals: dict,
                 round_means: dict, class_of: dict, season: int,
                 keep_weekly: bool) -> dict:
    rep = R.replay_draft(picks, keeper_pids, proj, repl, positions,
                         cory_roster_id=seat)
    owner_all = [str(p["player_id"]) for p in picks
                 if p["roster_id"] == seat]

    def skill(pids):
        return sorted(p for p in pids
                      if positions.get(p) in ("QB", "RB", "WR", "TE"))

    tool_skill = skill(rep["tool_roster"])
    owner_skill = skill(owner_all)
    unknown = sorted(p for p in owner_all
                     if positions.get(p) is None)
    invisible = sorted(p for p in owner_skill if p not in proj)

    arms = {}
    for arm in ("optimal", "realistic"):
        ts = R.season_series(tool_skill, positions, weekly, proj, arm)
        os_ = R.season_series(owner_skill, positions, weekly, proj, arm)
        entry = {
            "tool_total": round(sum(ts), 2),
            "owner_total": round(sum(os_), 2),
            "delta_tool_minus_owner": round(sum(ts) - sum(os_), 2),
            "head_to_head": R._h2h(ts, os_),
        }
        if keep_weekly:
            entry["tool_weekly"] = ts
            entry["owner_weekly"] = os_
        arms[arm] = entry

    # tool behaviors at this seat (contrast for the drafter study): live
    # skill picks only, surplus vs the same league round means.
    tool_live = [e for e in rep["log"] if e["how"] == "tool"]
    surpluses, rookie_n, year2_n, late, late_hits = [], 0, 0, 0, 0
    first_qb, first_te = None, None
    for e in tool_live:
        pid = e["player_id"]
        rd = DS.round_of(e["pick_no"])
        s = round(totals.get(pid, 0.0) - round_means.get(rd, 0.0), 2)
        surpluses.append(s)
        if class_of.get(pid) == season:
            rookie_n += 1
        if class_of.get(pid) == season - 1:
            year2_n += 1
        if e["pick_no"] >= DS.LATE_FROM_PICK:
            late += 1
            late_hits += 1 if s > 0 else 0
        pos = positions.get(pid)
        if pos == "QB" and first_qb is None:
            first_qb = rd
        if pos == "TE" and first_te is None:
            first_te = rd

    return {
        "arms": arms,
        "tool_roster": tool_skill,
        "shadowed_picks": len(rep["shadowed_picks"]),
        "forced_picks": rep["forced_picks"],
        "owner_rookie_picks_invisible_to_board": len(invisible),
        "owner_unknown_position_excluded": unknown,
        "tool_behavior": {
            "n_live_picks": len(tool_live),
            "value_over_slot": round(sum(surpluses), 2),
            "rookies_taken": rookie_n,
            "year2_taken": year2_n,
            "late_101plus_n": late, "late_101plus_hits": late_hits,
            "first_QB_round": first_qb, "first_TE_round": first_te,
        },
    }


def league_summary(seats: dict, owners: dict, cory_seat: int = 1) -> dict:
    out = {}
    for arm in ("optimal", "realistic"):
        deltas = {rid: seats[str(rid)]["arms"][arm]
                  ["delta_tool_minus_owner"] for rid in SEATS}
        ordered = sorted(deltas.values())
        median = round((ordered[4] + ordered[5]) / 2.0, 2)
        out[arm] = {
            "owners_tool_beats": sorted(
                owners[str(rid)]["display_name"]
                for rid, d in deltas.items() if d > 0),
            "owners_beating_tool": sorted(
                owners[str(rid)]["display_name"]
                for rid, d in deltas.items() if d < 0),
            "beats_n_of_10": sum(1 for d in deltas.values() if d > 0),
            "median_owner_delta": median,
            "cory_delta": deltas[cory_seat],
        }
    return out


# ── one season, all configs ──────────────────────────────────────────────────

def replay_year(season: int, positions: dict, ages: dict, names: dict,
                store: dict, class_of: dict) -> dict:
    srec = R.season_record(season)
    picks, keeper_pids = R.season_draft(srec)
    owners = srec["owners"]
    weekly = R.weekly_points_of(season)
    totals = {pid: round(sum(rows.values()), 2)
              for pid, rows in weekly.items()}
    round_means = DS.season_slate(season, positions)[2]

    boards = config_boards(season, positions, ages, store)
    configs = {}
    for cfg in CONFIGS:
        b = boards[cfg]
        pool = [{"position": b["positions"][p], "proj_mean": v}
                for p, v in sorted(b["proj"].items())]
        repl, _diag = replacement_levels(pool, R.LEAGUE_CFG)
        seats = {}
        for seat in SEATS:
            seats[str(seat)] = dict(
                {"owner": owners[str(seat)]["display_name"]},
                **seat_verdict(seat, picks, keeper_pids, b["proj"], repl,
                               b["positions"], weekly, totals, round_means,
                               class_of, season,
                               keep_weekly=(cfg == "baseline")))
        configs[cfg] = {
            "meta": b["meta"],
            "projection_coverage": len(b["proj"]),
            "seats": seats,
            "league_summary": league_summary(seats, owners),
        }
    return {
        "season": season,
        "owners": {rid: o["display_name"] for rid, o in sorted(
            owners.items(), key=lambda kv: int(kv[0]))},
        "configs": configs,
    }


# ── pooled tables and layer grades ───────────────────────────────────────────

def pooled_tables(years: dict, owners_2025: dict) -> dict:
    out = {}
    for cfg in CONFIGS:
        per_owner = {}
        for rid in SEATS:
            rows = {}
            for arm in ("optimal", "realistic"):
                ds = [years[str(s)]["configs"][cfg]["seats"][str(rid)]
                      ["arms"][arm]["delta_tool_minus_owner"]
                      for s in SEASONS]
                rows[arm] = {
                    "per_year": {str(s): d for s, d in zip(SEASONS, ds)},
                    "mean_delta": round(sum(ds) / len(ds), 2)}
            per_owner[str(rid)] = dict(
                {"owner": owners_2025[str(rid)]}, **rows)
        summary = {}
        for arm in ("optimal", "realistic"):
            means = sorted(per_owner[str(rid)][arm]["mean_delta"]
                           for rid in SEATS)
            summary[arm] = {
                "beats_n_of_10_pooled": sum(1 for m in means if m > 0),
                "median_owner_mean_delta": round(
                    (means[4] + means[5]) / 2.0, 2),
                "cory_mean_delta": per_owner["1"][arm]["mean_delta"],
            }
        per_owner["_summary"] = summary
        out[cfg] = per_owner
    return out


def layer_grades(years: dict, pooled: dict) -> dict:
    grades = {}
    for cfg in ("rookie_prior", "year2_escalator", "both"):
        per_year = {}
        for s in SEASONS:
            y = years[str(s)]["configs"]
            base = y["baseline"]["league_summary"]
            layer = y[cfg]["league_summary"]
            per_year[str(s)] = {
                arm: {
                    "cory_delta_baseline": base[arm]["cory_delta"],
                    "cory_delta_layer": layer[arm]["cory_delta"],
                    "cory_gap_change": round(layer[arm]["cory_delta"]
                                             - base[arm]["cory_delta"], 2),
                    "beats_n_baseline": base[arm]["beats_n_of_10"],
                    "beats_n_layer": layer[arm]["beats_n_of_10"],
                    "median_owner_delta_baseline":
                        base[arm]["median_owner_delta"],
                    "median_owner_delta_layer":
                        layer[arm]["median_owner_delta"],
                } for arm in ("optimal", "realistic")}
        pool_base = pooled["baseline"]["_summary"]
        pool_layer = pooled[cfg]["_summary"]
        grades[cfg] = {
            "per_year": per_year,
            "pooled": {arm: {
                "cory_mean_delta_baseline":
                    pool_base[arm]["cory_mean_delta"],
                "cory_mean_delta_layer":
                    pool_layer[arm]["cory_mean_delta"],
                "cory_gap_change": round(
                    pool_layer[arm]["cory_mean_delta"]
                    - pool_base[arm]["cory_mean_delta"], 2),
                "beats_n_pooled_baseline":
                    pool_base[arm]["beats_n_of_10_pooled"],
                "beats_n_pooled_layer":
                    pool_layer[arm]["beats_n_of_10_pooled"],
            } for arm in ("optimal", "realistic")},
        }
    return grades


# ── layer (c): roster-status verification against the committed live board ───

def roster_status_verification() -> dict:
    d = json.loads(BOARD.read_text())
    players = d["players"]
    teamless = [p for p in players if not p.get("team")]
    teamless_proj = [p["name"] for p in teamless
                     if (p.get("proj_mean") or 0) > 0]
    with_depth = sum(1 for p in players
                     if p.get("depth_chart_order") is not None)
    return {
        "claim_verified": ("the live 2026 board already carries roster "
                           "status — the Brady-2023 pathology is a "
                           "walk-forward artifact, not a live defect; this "
                           "edge is already priced live and no layer is "
                           "built for it"),
        "board_built_at": d.get("built_at"),
        "board_players": len(players),
        "players_with_null_team": len(teamless),
        "teamless_players_carrying_projection": teamless_proj,
        "players_with_depth_chart_order": with_depth,
        "verified": len(teamless_proj) == 0 and len(teamless) == 0,
    }


# ── drafter study + tool contrast ────────────────────────────────────────────

def tool_behavior_contrast(years: dict, top3: list) -> dict:
    """The tool's replayed behaviors in the top-3 drafters' seats, baseline
    vs both-layers — beside what those drafters actually did."""
    out = {}
    for cfg in ("baseline", "both"):
        rows = {}
        for s in SEASONS:
            for rid in top3:
                seat = years[str(s)]["configs"][cfg]["seats"][str(rid)]
                b = seat["tool_behavior"]
                agg = rows.setdefault(str(rid), {
                    "owner": seat["owner"], "n_live_picks": 0,
                    "value_over_slot": 0.0, "rookies_taken": 0,
                    "year2_taken": 0, "late_101plus_hits": 0,
                    "optimal_delta_vs_owner": 0.0})
                agg["n_live_picks"] += b["n_live_picks"]
                agg["value_over_slot"] = round(
                    agg["value_over_slot"] + b["value_over_slot"], 2)
                agg["rookies_taken"] += b["rookies_taken"]
                agg["year2_taken"] += b["year2_taken"]
                agg["late_101plus_hits"] += b["late_101plus_hits"]
                agg["optimal_delta_vs_owner"] = round(
                    agg["optimal_delta_vs_owner"]
                    + seat["arms"]["optimal"]["delta_tool_minus_owner"], 2)
        out[cfg] = rows
    return out


# ── the run ──────────────────────────────────────────────────────────────────

def run() -> dict:
    positions = positions_record()
    ages = board_ages()
    names = R.name_map()
    store = load_store()
    class_of = DS.class_of_map(store)

    years = {}
    for season in SEASONS:
        years[str(season)] = replay_year(season, positions, ages, names,
                                         store, class_of)
    owners_2025 = years["2025"]["owners"]
    pooled = pooled_tables(years, owners_2025)

    owners_by_season = {s: R.season_record(s)["owners"] for s in DS.SEASONS}
    study = DS.study(positions, owners_by_season, store)
    contrast = tool_behavior_contrast(years, study["top3_roster_ids"])

    distributions = [transition_distribution(s, store)
                     for s in (2021, 2022, 2023, 2024)]

    return {
        "_territory": ("TERRITORY: A — produced by "
                       "draft/tools/replay_all_seats.py"),
        "_note": ("All-seats draft replay: the value-policy core over "
                  "own_v6_nomarket walk-forward boards in EVERY owner's "
                  "real seat, 2023-25, opponents fixed, plus the "
                  "preregistered candidate layers (rookie capital prior, "
                  "year-2 escalator) graded through the same replay, the "
                  "tool-independent drafter-skill ranking, and the live-"
                  "board roster-status verification. SIMULATION: each "
                  "seat-year is ONE alternative history; ten seats are ten "
                  "separate counterfactuals. Read the audit doc "
                  "(draft/audit/league_benchmark_2026-08-16.md) before "
                  "quoting any number."),
        "question_verbatim": QUESTION_VERBATIM,
        "addendum_verbatim": ADDENDUM_VERBATIM,
        "policy_tested": ("identical to draft_replay_2025.json's primary "
                          "arm: BPA-by-VORP, caps QB2/RB7/WR7/TE2, "
                          "starter-feasibility rail, K/DEF mirrored per "
                          "seat, own_v6_nomarket season-vintage "
                          "projections; layers modify only the candidate "
                          "board and replacement levels"),
        "years": years,
        "pooled": pooled,
        "layer_grades": layer_grades(years, pooled),
        "year2_progression_measured": distributions,
        "roster_status_verification": roster_status_verification(),
        "drafter_study": study,
        "tool_behavior_in_top3_seats": contrast,
        "honesty": [
            "each seat-year is one alternative history; ten seats x three years are thirty samples of a policy, not a distribution over leagues",
            "fixed opponents PER SEAT: when the tool sits in seat X, the other nine owners repeat history exactly — seats are separate counterfactuals and their tool rosters can overlap across seats",
            "the baseline board is the season-vintage construction minus the market arm (it IS the event replayed) — identical to the single-seat replay's tested arm",
            "layer forms were preregistered in the audit doc and committed before any grade here was computed; grades are reported per year including years a layer hurts",
            "the rookie prior prices draft capital only — no camp news, no depth charts; its fit classes are strictly prior to each replay year (leakage-traced)",
            "the year-2 escalator never de-escalates (clip floor 1.0, preregistered) — it tests the ascending-sophomore hypothesis only; the measured distribution is reported either way",
            "the drafter-skill ranking is tool-independent (actual points vs round means) but surplus is skill + luck on ~36 picks per owner; only the top3-vs-bottom-half group contrast is quotable",
            "K/DEF are mirrored per seat and excluded from lineup arms; keepers apply exactly as history recorded them for every seat",
            "owners' position-less picks (2025 pid 12530) are excluded from lineup grading and counted per seat",
            "the realistic arm treats row-absence as the inactive report, applied to both rosters identically",
        ],
    }


def main() -> None:
    doc = run()
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT.relative_to(ROOT)}")
    for s in SEASONS:
        base = doc["years"][str(s)]["configs"]["baseline"]["league_summary"]
        o = base["optimal"]
        print(f"{s} baseline optimal: beats {o['beats_n_of_10']}/10, "
              f"median {o['median_owner_delta']:+.1f}, "
              f"Cory {o['cory_delta']:+.1f}")
    for cfg, g in doc["layer_grades"].items():
        p = g["pooled"]["optimal"]
        print(f"{cfg}: Cory gap {p['cory_mean_delta_baseline']:+.1f} -> "
              f"{p['cory_mean_delta_layer']:+.1f} "
              f"(change {p['cory_gap_change']:+.1f}), beats "
              f"{p['beats_n_pooled_baseline']} -> {p['beats_n_pooled_layer']}")
    rk = doc["drafter_study"]["ranking"]
    print("drafters:", ", ".join(f"#{r['rank']} {r['owner']}"
                                 for r in rk[:3]))


if __name__ == "__main__":
    main()
