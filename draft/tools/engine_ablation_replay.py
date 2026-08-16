#!/usr/bin/env python3
# TERRITORY: A
"""ENGINE ABLATION — THE REPLAY FRAME (2023-25 real history).

Cory, 2026-08-16, verbatim: "Take the current complete engine and decompose
its advantage against a simple baseline using controlled ablations. Should we
try this? And anything that doesn't hurt model could be removed?"

The sim frame (draft/tools/engine_ablation.js) measures every layer inside a
model room. This driver is the second, independent measurement frame: the
draft-replay harness (draft/tools/draft_replay_2025.py — imported, not
re-implemented) on the league's REAL 2023/2024/2025 drafts, Cory's real seat
and keepers, opponents' picks fixed to history, graded on actual weekly
points.

WHAT IS PERIOD-COMPUTABLE HERE, AND WHAT IS NOT — the honest boundary, stated
up front. The replay's policy is the value core (BPA-by-VORP with needs
rails) because the full engine cannot run period-correct: it is wired to the
2026 board (ADP, survival, wire levels, opportunity metrics, keeper slate all
2026-shaped; see DRAFT-REPLAY-PREDECLARATION.md — the season boards do not
exist anywhere). So the ONLY layers this frame can ablate are the baseline's
own rails:

  onesie_caps          QB<=2/TE<=2 (the ONESIE_HARD_CAP analog) — ablating to
                       the room caps (QB3/TE3) is the committed sensitivity
                       grid's room_caps cell, recomputed here and pinned equal
  feasibility_rail     the starter-feasibility rail (a pick that leaves the
                       lineup unfillable is refused)
  position_caps        all caps at once (99s)
  all_rails            caps AND rail off — pure BPA-by-VORP, K/DEF mirrored

Every engine-side layer (VONA/survival, wire bench, KOV, ROOM_MIX, stack,
conservation, opportunity adjustment, depth-chart dampening, seat plan) is
NOT period-computable and is listed as such in the artifact — quoting a
replay number for them would be quoting a number about nothing.

Three seasons are three samples: NO CI is quotable on n=3 and none is
emitted. Per-year deltas and the pooled mean only, spread shown.

Run:    python3 draft/tools/engine_ablation_replay.py
Writes: draft/data/engine_ablation_replay_2026.json
        (ENGINE_ABLATION_REPLAY_OUT overrides — tests use a scratch path).
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tools"))

import draft_replay_2025 as DR  # noqa: E402  (the harness, imported whole)

OUT = ROOT / "draft" / "data" / "engine_ablation_replay_2026.json"

QUESTION_VERBATIM = (
    "Take the current complete engine and decompose its advantage against a "
    "simple baseline using controlled ablations. Should we try this? And "
    "anything that doesn't hurt model could be removed?")

# Rail-off is expressed through the harness's own parameters (starters all
# zero => unfilled_starters() is 0 => the forced rail never fires). No harness
# code is modified; the grading path (optimal_week_points) still uses the real
# STARTER_SLOTS, so only the DRAFT policy changes.
NO_STARTERS = {"QB": 0, "RB": 0, "WR": 0, "TE": 0}
OPEN_CAPS = {"QB": 99, "RB": 99, "WR": 99, "TE": 99}

CONFIGS = {
    # name: (caps, starters, flex_slots, doc)
    "primary": (DR.POSITION_CAPS, DR.STARTER_SLOTS, DR.FLEX_SLOTS,
                "the committed replay's primary cell — onesie caps QB2/TE2 + "
                "feasibility rail (pinned equal to draft_replay_2025.json)"),
    "minus_onesie_caps": (DR.ROOM_CAPS, DR.STARTER_SLOTS, DR.FLEX_SLOTS,
                          "onesie caps relaxed to the measured room caps "
                          "QB3/TE3 (the ONESIE_HARD_CAP analog ablated; equals "
                          "the committed grid's room_caps cell)"),
    "minus_feasibility_rail": (DR.POSITION_CAPS, NO_STARTERS, 0,
                               "starter-feasibility rail off — a pick may leave "
                               "the lineup unfillable"),
    "minus_position_caps": (OPEN_CAPS, DR.STARTER_SLOTS, DR.FLEX_SLOTS,
                            "all position caps open (99) — the rail alone"),
    "minus_all_rails": (OPEN_CAPS, NO_STARTERS, 0,
                        "caps AND rail off — pure BPA-by-VORP, K/DEF mirrored"),
}

NOT_PERIOD_COMPUTABLE = {
    "wire_bench": "needs the measured wire level and the engine's bench branch — 2026-wired",
    "kov_ramp": "keeper-option value needs the engine composite over a season board that does not exist",
    "kov_term": "same",
    "stack_term": "engine composite term — not in the replay's value core",
    "room_mix": "survival-model prior; the replay has no survival model (opponents are history)",
    "conserve": "survival-model correction; same",
    "onesie_discount": "engine score-level discount; the replay's analog IS the cap (ablated above)",
    "onesie_need_discount": "engine need-term rewrite; no composite in the replay",
    "flex_discount": "engine need-term rewrite; no composite in the replay",
    "ceiling_tiebreak": "engine ordering rule over proj_ceiling; the replay board has no ceilings",
    "opportunity": "nflfastR opportunity metrics are derived point-in-time (2026); writing today's values into a 2023 replay would be lookahead contamination",
    "depth_chart": "depth_chart_order comes from Sleeper's LIVE payload with no historical archive (same lookahead problem)",
    "vona_slot_aware": "engine VONA variant; no engine here",
    "stage2_cap": "engine anchor; no engine here",
    "seat_plan": "the DP seat plan is solved against the 2026 board and seat",
    "doctrine_tilt": "on-the-day enrollment; nothing to enroll in a replay",
}


def replay_cell(season: int, positions: dict, ages: dict,
                caps: dict, starters: dict, flex_slots: int) -> dict:
    """One (season, config) cell: replay the draft under the config, grade the
    optimal arm vs Cory's real drafted roster. Mirrors replay_season()'s
    grading exactly (same functions), without its full reporting payload."""
    proj = DR.build_projections(season, positions, ages)
    pool = [{"position": positions[p], "proj_mean": v}
            for p, v in sorted(proj.items())]
    repl, _diag = DR.replacement_levels(pool, DR.LEAGUE_CFG)

    srec = DR.season_record(season)
    picks, keeper_pids = DR.season_draft(srec)
    rep = DR.replay_draft(picks, keeper_pids, proj, repl, positions,
                          caps=caps, starters=starters, flex_slots=flex_slots)

    weekly = DR.weekly_points_of(season)
    cory_all = [str(p["player_id"]) for p in picks
                if p["roster_id"] == DR.CORY_ROSTER_ID]

    def skill(pids):
        return sorted(p for p in pids
                      if positions.get(p) not in ("K", "DEF"))

    ts = DR.season_series(skill(rep["tool_roster"]), positions, weekly,
                          proj, "optimal")
    cs = DR.season_series(skill(cory_all), positions, weekly, proj, "optimal")
    counts = rep["position_counts"]
    return {
        "tool_optimal_total": round(sum(ts), 2),
        "cory_optimal_total": round(sum(cs), 2),
        "delta_tool_minus_cory": round(sum(ts) - sum(cs), 2),
        "head_to_head": DR._h2h(ts, cs),
        "position_counts": counts,
        "forced_picks": rep["forced_picks"],
    }


def run() -> dict:
    positions = DR.positions_record()
    ages = DR.board_ages()
    committed = json.loads((ROOT / "draft" / "data"
                            / "draft_replay_2025.json").read_text())

    years: dict = {}
    for season in DR.REPLAY_SEASONS:
        cells = {}
        for name, (caps, starters, flex, _doc) in CONFIGS.items():
            cells[name] = replay_cell(season, positions, ages,
                                      caps, starters, flex)
        # Parity pins: this driver must reproduce the committed replay's
        # primary cell and its room_caps grid cell, or it is measuring a
        # different harness than the one the audit already trusts.
        y = committed["years"][str(season)]
        prim = y["arms"]["optimal"]["delta_tool_minus_cory"]
        room = y["sensitivity_grid_optimal_arm"]["room_caps"][
            "delta_tool_minus_cory"]
        if abs(cells["primary"]["delta_tool_minus_cory"] - prim) > 1e-9:
            raise RuntimeError(
                f"{season}: primary cell {cells['primary']['delta_tool_minus_cory']} "
                f"!= committed replay {prim} — harness drift, refusing to write")
        if abs(cells["minus_onesie_caps"]["delta_tool_minus_cory"] - room) > 1e-9:
            raise RuntimeError(
                f"{season}: minus_onesie_caps {cells['minus_onesie_caps']['delta_tool_minus_cory']} "
                f"!= committed room_caps {room} — harness drift, refusing to write")
        # Layer contributions: primary minus ablated (positive = the rail was
        # helping the tool arm that year, on the hindsight-optimal ruler).
        contrib = {}
        for name in CONFIGS:
            if name == "primary":
                continue
            contrib[name.replace("minus_", "")] = round(
                cells["primary"]["delta_tool_minus_cory"]
                - cells[name]["delta_tool_minus_cory"], 2)
        years[str(season)] = {"cells": cells,
                              "layer_contribution_optimal_pts": contrib}

    pooled = {}
    for name in CONFIGS:
        if name == "primary":
            continue
        key = name.replace("minus_", "")
        vals = [years[str(s)]["layer_contribution_optimal_pts"][key]
                for s in DR.REPLAY_SEASONS]
        pooled[key] = {"per_year": {str(s): v for s, v
                                    in zip(DR.REPLAY_SEASONS, vals)},
                       "mean_pts_per_season": round(sum(vals) / len(vals), 2),
                       "min": min(vals), "max": max(vals),
                       "sign_stable_across_years":
                           all(v > 0 for v in vals) or all(v < 0 for v in vals)}

    return {
        "_territory": ("TERRITORY: A — produced by "
                       "draft/tools/engine_ablation_replay.py"),
        "question_verbatim": QUESTION_VERBATIM,
        "frame": ("draft-replay harness (draft_replay_2025.py) on real "
                  "2023-25 history — the independent frame beside the sim "
                  "ladder in draft/data/engine_ablation_2026.json"),
        "configs": {k: v[3] for k, v in CONFIGS.items()},
        "not_period_computable": NOT_PERIOD_COMPUTABLE,
        "honesty": [
            "three seasons are three samples — NO CI is quotable on n=3 and none is emitted; per-year values and the pooled mean only, spread shown",
            "only the baseline's own rails are period-computable; every engine-side layer is listed in not_period_computable with its reason",
            "layer_contribution = primary_delta - ablated_delta on the hindsight-optimal ruler (positive = the rail helped that year)",
            "the primary and minus_onesie_caps cells are pinned equal to the committed draft_replay_2025.json before anything is written",
            "all of draft_replay_2025.py's own limitations apply unchanged (fixed opponents, no rookies, no news, walk-forward projections minus the market arm)",
        ],
        "years": years,
        "pooled_layer_contribution": pooled,
        "summary": {
            "headline": ("rail-layer contributions on real history, "
                         "pts/season on the optimal ruler (tool arm)"),
            "pooled": pooled,
        },
    }


def main() -> None:
    doc = run()
    out = Path(os.environ.get("ENGINE_ABLATION_REPLAY_OUT", OUT))
    out.write_text(json.dumps(doc, indent=1))
    print(f"wrote {out}")
    for key, row in doc["pooled_layer_contribution"].items():
        print(f"  {key:22s} pooled {row['mean_pts_per_season']:+8.1f} pts/season  "
              f"per-year {row['per_year']}  sign-stable={row['sign_stable_across_years']}")


if __name__ == "__main__":
    main()
