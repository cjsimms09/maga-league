# TERRITORY: A
"""RESTATED LEAGUE TABLE — the proxy benchmark with its two known information
gaps stated in the number instead of the footnotes. Built 2026-08-17 under the
live-edge order (ROUTES.md "THE LIVE-EDGE MEASUREMENT, ORDERED").

WHAT THIS IS: a deterministic INFORMATION CORRECTION to the committed
draft/data/replay_league_table.json — zero fitted parameters, no configuration
search, nothing selected. Two corrections, both ordered:

  1. THE ROSTER-STATUS FILTER (the restated primary). The proxy graded a
     walk-forward board that still priced players whose careers were already
     over before the replayed draft (Brady 2023 at 323 projected points —
     pre-draft-public facts the LIVE board verifiably carries, per
     replay_all_seats.roster_status_verification). The filter removes exactly
     the players committed data proves never played again — the rule, its
     sources and BOTH error directions are in
     draft_replay_2025.roster_status_exclusions. Every excluded player is
     listed by name so the correction is auditable.

  2. THE room_draftable_pool CELL, PROMOTED to the quoted bracket and
     computed for every seat (it existed only for Cory's seat, in
     draft_replay_2025.json's sensitivity grid). Its leak direction is
     unchanged and still named: it imports the room's curation of the exact
     event being replayed (genuine news knowledge AND mere value opinions),
     so it is a bracket EDGE, never the primary.

THE MECHANISM SENTENCE (no_fit_guard discipline — true whether or not any
number moved): the proxy's losses partly priced players who were retired,
unsigned or out before the replayed draft, because the walk-forward stores
carry production and not roster status; the live 2026 board carries that
status, so the uncorrected table understates the live tool relative to
drafters who had the news.

WHAT THIS DOES NOT RESTATE: the candidate-layer grades (rookie_prior /
year2_escalator) — the filter is orthogonal to them and their fits do not
change; they remain in the original artifact only. And it does NOT touch the
original: draft/data/replay_league_table.json is quoted, never rewritten.

Run: python3 draft/tools/replay_league_restated.py
Writes draft/data/replay_league_table_restated.json (deterministic).
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

import draft_replay_2025 as R  # noqa: E402  (imported, never edited here)
import replay_all_seats as A  # noqa: E402  (summary arithmetic reused)
from model_accuracy_backtest import positions_record  # noqa: E402
from own_model_v2 import board_ages  # noqa: E402
from vorp import replacement_levels  # noqa: E402

OUT = DRAFT / "data" / "replay_league_table_restated.json"
ORIGINAL = DRAFT / "data" / "replay_league_table.json"
SINGLE = DRAFT / "data" / "draft_replay_2025.json"

SEASONS = (2025, 2024, 2023)
SEATS = tuple(range(1, 11))

MECHANISM = ("the proxy's losses partly priced players who were retired, "
             "unsigned or out before the replayed draft, because the "
             "walk-forward stores carry production and not roster status; "
             "the live 2026 board carries that status, so the uncorrected "
             "table understates the live tool relative to drafters who had "
             "the news")

ESTIMAND = {
    "optimal": ("mean tool-minus-owner season total of actual points under "
                "the hindsight-optimal weekly lineup, skill slots only, "
                "fixed-opponents counterfactual — the preregistered primary "
                "arm"),
    "realistic": ("mean tool-minus-owner season total under start-of-week "
                  "information lineups (season-to-date pts/game rank, "
                  "row-absence benched) — the tool's best case, never "
                  "quotable alone"),
}


def _arms(tool_skill: list, owner_skill: list, positions: dict, weekly: dict,
          proj: dict) -> dict:
    out = {}
    for arm in ("optimal", "realistic"):
        ts = R.season_series(tool_skill, positions, weekly, proj, arm)
        os_ = R.season_series(owner_skill, positions, weekly, proj, arm)
        out[arm] = {
            "tool_total": round(sum(ts), 2),
            "owner_total": round(sum(os_), 2),
            "delta_tool_minus_owner": round(sum(ts) - sum(os_), 2),
            "head_to_head": R._h2h(ts, os_),
        }
    return out


def _skill(pids, positions):
    return sorted(p for p in pids
                  if positions.get(p) in ("QB", "RB", "WR", "TE"))


def restate_year(season: int, positions: dict, ages: dict,
                 names: dict) -> dict:
    proj = R.build_projections(season, positions, ages)
    excluded, kept_indeterminate = R.roster_status_exclusions(season, proj)
    proj_f = {p: v for p, v in proj.items() if p not in excluded}

    def repl_of(pr):
        pool = [{"position": positions[p], "proj_mean": v}
                for p, v in sorted(pr.items())]
        return replacement_levels(pool, R.LEAGUE_CFG)[0]

    repl = repl_of(proj)          # unfiltered (room-pool cell runs on it)
    repl_f = repl_of(proj_f)      # restated board's own replacement levels

    srec = R.season_record(season)
    picks, keeper_pids = R.season_draft(srec)
    owners = srec["owners"]
    weekly = R.weekly_points_of(season)
    totals = {pid: round(sum(rows.values()), 2)
              for pid, rows in weekly.items()}
    room_pool = {str(p["player_id"]) for p in picks}

    seats = {}
    for seat in SEATS:
        owner_all = [str(p["player_id"]) for p in picks
                     if p["roster_id"] == seat]
        owner_skill = _skill(owner_all, positions)
        # restated primary: the status-filtered walk-forward board.
        rep = R.replay_draft(picks, keeper_pids, proj_f, repl_f, positions,
                             cory_roster_id=seat)
        # grading uses the UNFILTERED projections for both rosters: proj_f is
        # a value-identical subset (the filter changes candidacy and
        # replacement levels, never a projection), and the owner's realistic
        # week-1 ranking must not lose a projection the tool's board dropped.
        arms = _arms(_skill(rep["tool_roster"], positions), owner_skill,
                     positions, weekly, proj)
        # the promoted bracket cell: room-draftable pool over the UNFILTERED
        # board — identical semantics to the single-seat sensitivity cell.
        rp = R.replay_draft(picks, keeper_pids, proj, repl, positions,
                            cory_roster_id=seat, allowed_pids=room_pool)
        ts = R.season_series(_skill(rp["tool_roster"], positions), positions,
                             weekly, proj, "optimal")
        os_ = R.season_series(owner_skill, positions, weekly, proj,
                              "optimal")
        seats[str(seat)] = {
            "owner": owners[str(seat)]["display_name"],
            "arms": arms,
            "tool_roster": _skill(rep["tool_roster"], positions),
            "shadowed_picks": len(rep["shadowed_picks"]),
            "forced_picks": rep["forced_picks"],
            "room_draftable_pool_optimal": {
                "tool_total": round(sum(ts), 2),
                "delta_tool_minus_owner": round(sum(ts) - sum(os_), 2),
                "head_to_head": R._h2h(ts, os_),
            },
        }

    room_deltas = sorted(
        seats[str(rid)]["room_draftable_pool_optimal"]
        ["delta_tool_minus_owner"] for rid in SEATS)
    return {
        "season": season,
        "owners": {rid: o["display_name"] for rid, o in sorted(
            owners.items(), key=lambda kv: int(kv[0]))},
        "board": {
            "projection_coverage_unfiltered": len(proj),
            "projection_coverage_restated": len(proj_f),
            "excluded": [
                {"player_id": p, "name": names.get(p, p),
                 "pos": positions.get(p), "proj": round(proj[p], 2),
                 **meta}
                for p, meta in sorted(excluded.items(),
                                      key=lambda kv: -proj[kv[0]])],
            "kept_indeterminate_zero_game_players": [
                {"player_id": p, "name": names.get(p, p),
                 "pos": positions.get(p), "proj": round(proj[p], 2)}
                for p in kept_indeterminate],
        },
        "seats": seats,
        "league_summary_restated": A.league_summary(seats, owners),
        "league_summary_room_pool_optimal": {
            "beats_n_of_10": sum(1 for d in room_deltas if d > 0),
            "median_owner_delta": round(
                (room_deltas[4] + room_deltas[5]) / 2.0, 2),
            "cory_delta": seats["1"]["room_draftable_pool_optimal"]
            ["delta_tool_minus_owner"],
        },
    }


def pooled(years: dict) -> dict:
    per_owner = {}
    for rid in SEATS:
        rows = {}
        for arm in ("optimal", "realistic"):
            ds = [years[str(s)]["seats"][str(rid)]["arms"][arm]
                  ["delta_tool_minus_owner"] for s in SEASONS]
            rows[arm] = {"per_year": {str(s): d for s, d in zip(SEASONS, ds)},
                         "mean_delta": round(sum(ds) / len(ds), 2)}
        rp = [years[str(s)]["seats"][str(rid)]["room_draftable_pool_optimal"]
              ["delta_tool_minus_owner"] for s in SEASONS]
        rows["room_draftable_pool_optimal"] = {
            "per_year": {str(s): d for s, d in zip(SEASONS, rp)},
            "mean_delta": round(sum(rp) / len(rp), 2)}
        per_owner[str(rid)] = dict(
            {"owner": years["2025"]["owners"][str(rid)]}, **rows)
    summary = {}
    for arm in ("optimal", "realistic", "room_draftable_pool_optimal"):
        means = sorted(per_owner[str(rid)][arm]["mean_delta"]
                       for rid in SEATS)
        summary[arm] = {
            "beats_n_of_10_pooled": sum(1 for m in means if m > 0),
            "median_owner_mean_delta": round((means[4] + means[5]) / 2.0, 2),
            "cory_mean_delta": per_owner["1"][arm]["mean_delta"],
        }
    per_owner["_summary"] = summary
    return per_owner


def run() -> dict:
    positions = positions_record()
    ages = board_ages()
    names = R.name_map()
    original = json.loads(ORIGINAL.read_text())

    years = {}
    for season in SEASONS:
        years[str(season)] = restate_year(season, positions, ages, names)
    pool = pooled(years)

    orig_base = original["pooled"]["baseline"]["_summary"]
    orig_years = {
        s: {arm: original["years"][s]["configs"]["baseline"]
            ["league_summary"][arm] for arm in ("optimal", "realistic")}
        for s in map(str, SEASONS)}

    bracket = {}
    for arm in ("optimal", "realistic"):
        bracket[arm] = {
            "cory_mean_delta": {
                "original_unfiltered": orig_base[arm]["cory_mean_delta"],
                "restated_status_filtered":
                    pool["_summary"][arm]["cory_mean_delta"],
            },
            "beats_n_of_10_pooled": {
                "original_unfiltered": orig_base[arm]["beats_n_of_10_pooled"],
                "restated_status_filtered":
                    pool["_summary"][arm]["beats_n_of_10_pooled"],
            },
            "median_owner_mean_delta": {
                "original_unfiltered":
                    orig_base[arm]["median_owner_mean_delta"],
                "restated_status_filtered":
                    pool["_summary"][arm]["median_owner_mean_delta"],
            },
        }
    # the promoted cell rides the optimal bracket only — it was computed on
    # the optimal arm in the single-seat grid and stays optimal-only here.
    bracket["optimal"]["cory_mean_delta"]["room_draftable_pool"] = \
        pool["_summary"]["room_draftable_pool_optimal"]["cory_mean_delta"]
    bracket["optimal"]["beats_n_of_10_pooled"]["room_draftable_pool"] = \
        pool["_summary"]["room_draftable_pool_optimal"]["beats_n_of_10_pooled"]
    bracket["optimal"]["median_owner_mean_delta"]["room_draftable_pool"] = \
        pool["_summary"]["room_draftable_pool_optimal"][
            "median_owner_mean_delta"]

    return {
        "_territory": ("TERRITORY: A — produced by "
                       "draft/tools/replay_league_restated.py"),
        "_note": ("RESTATED league table: the committed all-seats proxy "
                  "benchmark (draft/data/replay_league_table.json — quoted "
                  "beside, never overwritten) re-run with the deterministic "
                  "roster-status filter on the walk-forward board, plus the "
                  "room_draftable_pool sensitivity cell promoted from the "
                  "single-seat grid and computed for every seat. An "
                  "information correction with zero fitted parameters. The "
                  "policy is unchanged: BPA-by-VORP over own_v6_nomarket "
                  "boards — a WEAKENED PROXY for the live engine, not the "
                  "engine; the engine-driving measurement lives in "
                  "draft/backtest/replay.js and its own artifact."),
        "mechanism": MECHANISM,
        "estimand": ESTIMAND,
        "status_filter_rule": (
            "excluded iff zero recorded games in every committed season "
            "Y..2025 AND (Y<2025, corroborated by at least one later "
            "zero-game season) OR (Y=2025, absent from or teamless on the "
            "committed 2026 live board); indeterminable status STAYS on the "
            "board and is listed. Committed stores only — no new fetches. "
            "Full rule and both error directions: "
            "draft_replay_2025.roster_status_exclusions."),
        "original_artifact": "draft/data/replay_league_table.json",
        "original_summary_quoted": {
            "pooled_baseline": orig_base,
            "per_year_baseline": orig_years,
        },
        "summary_bracket": bracket,
        "years": years,
        "pooled": pool,
        "honesty": [
            "deterministic information correction, not a fit: one preregistered-form rule, no configuration search, nothing selected on outcome",
            "over-exclusion direction (flatters the tool): a player lost AFTER season Y's draft who never returned in committed stores is excluded even though drafters could not have known — every excluded player is listed by name per season for audit",
            "under-exclusion direction (flatters the human): a player publicly out at Y's draft who later logged any committed game, or (2025) whose 2026 board row carries a team, STAYS on the board — his blindness persists in the restated number and is listed, not guessed at",
            "room_draftable_pool imports the room's curation of the exact event being replayed (news knowledge AND value opinions) — bracket edge, never the primary; optimal arm only, as originally computed",
            "the candidate-layer grades (rookie_prior/year2_escalator) are NOT restated — the filter is orthogonal to their fits; they live in the original artifact only",
            "owner rosters and their grading are untouched by the filter — only the tool's candidate pool changes",
            "everything the original table's honesty list says still applies: fixed opponents per seat, thirty samples of a policy, season-vintage no-market boards",
        ],
    }


def main() -> None:
    doc = run()
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT.relative_to(ROOT)}")
    for s in SEASONS:
        y = doc["years"][str(s)]
        ls = y["league_summary_restated"]["optimal"]
        print(f"{s}: excluded {len(y['board']['excluded'])} "
              f"(kept indeterminate {len(y['board']['kept_indeterminate_zero_game_players'])}), "
              f"restated optimal beats {ls['beats_n_of_10']}/10, "
              f"median {ls['median_owner_delta']:+.1f}, "
              f"Cory {ls['cory_delta']:+.1f}")
    b = doc["summary_bracket"]
    for arm in ("optimal", "realistic"):
        print(f"pooled {arm} Cory: "
              + json.dumps(b[arm]["cory_mean_delta"]))


if __name__ == "__main__":
    main()
