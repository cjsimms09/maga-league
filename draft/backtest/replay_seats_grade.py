# TERRITORY: A
"""GRADE THE ENGINE'S SEAT REPLAY — the live-edge measurement's outcome side.

The choice side (draft/backtest/replay_seats.js, run by the backtest workflow
where the network is) recorded what the REAL engine.js/survival.js — the
shipped configuration, MEASURED_WEIGHTS — took at every seat's real pick
slots under the proxy table's exact fixed-opponents counterfactual, over
era-appropriate bundles assembled under AsOf discipline. That file carries NO
outcomes. This module joins it against the COMMITTED weekly stores with the
SAME grading machinery the proxy league table used (draft_replay_2025's
lineup arms), so every engine-vs-owner delta is directly comparable with the
proxy's tool-vs-owner deltas.

ESTIMANDS, one sentence each (never quote the realistic arm alone):
  optimal   — mean engine-minus-owner season total of actual weekly points
              under the hindsight-optimal legal lineup each week, skill slots
              only, both rosters frozen as drafted, opponents fixed — the
              preregistered primary.
  realistic — the same difference under start-of-week-information lineups
              (season-to-date pts/game rank, week-1 rank from the
              walk-forward projection, row-absence benched) — the tool's
              best case.

THE QB QUESTION rides along: at each of Cory's pre-first-QB picks the choice
file recorded the engine's own component readout for the best available QB;
this module tallies which weighted term keeps the QB below the chosen player
(`value` is weight x VONA — the survival-priced term) and reports the
engine's first-QB round beside Cory's and the league benchmark.

no_fit_guard discipline: everything here is DIAGNOSTIC. One configuration
(the shipped one) is graded; nothing is selected; the mechanism sentence for
any tempting change is routed, not applied.

Run: python3 draft/backtest/replay_seats_grade.py
Reads draft/backtest/engine_seat_choices.json
Writes draft/data/engine_seat_replay.json (deterministic given its inputs).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent            # draft/backtest
DRAFT = HERE.parent
ROOT = DRAFT.parent
sys.path.insert(0, str(DRAFT / "tools"))
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(DRAFT))

import draft_replay_2025 as R  # noqa: E402
import replay_all_seats as A  # noqa: E402
from model_accuracy_backtest import positions_record  # noqa: E402
from own_model_v2 import board_ages  # noqa: E402

CHOICES = HERE / "engine_seat_choices.json"
OUT = DRAFT / "data" / "engine_seat_replay.json"
LEAGUE_TABLE = DRAFT / "data" / "replay_league_table.json"
RESTATED = DRAFT / "data" / "replay_league_table_restated.json"

SEATS = tuple(range(1, 11))

ESTIMAND = {
    "optimal": ("mean engine-minus-owner season total of actual weekly "
                "points under the hindsight-optimal legal lineup, skill "
                "slots only, both rosters frozen as drafted, opponents "
                "fixed — the preregistered primary"),
    "realistic": ("mean engine-minus-owner season total under "
                  "start-of-week-information lineups (season-to-date "
                  "pts/game rank, week-1 from the walk-forward projection, "
                  "row-absence benched) — the tool's best case, never "
                  "quotable alone"),
}


def _skill(pids, positions):
    return sorted(p for p in pids
                  if positions.get(p) in ("QB", "RB", "WR", "TE"))


def first_qb_round_of(picks: list, keeper_pids: set, seat: int,
                      positions: dict) -> int | None:
    """The owner's first live (non-keeper) QB pick, league round number —
    the drafter_study's definition."""
    for p in picks:
        pid = str(p["player_id"])
        if p["roster_id"] != seat:
            continue
        if p.get("is_keeper") or pid in keeper_pids:
            continue
        if positions.get(pid) == "QB":
            return (p["pick_no"] - 1) // 10 + 1
    return None


def grade_season(season: int, seats_choices: dict, positions: dict,
                 ages: dict, names: dict) -> dict:
    proj = R.build_projections(season, positions, ages)
    weekly = R.weekly_points_of(season)
    totals = {pid: round(sum(rows.values()), 2)
              for pid, rows in weekly.items()}
    srec = R.season_record(season)
    picks, keeper_pids = R.season_draft(srec)
    owners = srec["owners"]

    def lineup_arms(roster_pids, owner_skill):
        engine_skill = _skill(roster_pids, positions)
        arms = {}
        for arm in ("optimal", "realistic"):
            ts = R.season_series(engine_skill, positions, weekly, proj, arm)
            os_ = R.season_series(owner_skill, positions, weekly, proj, arm)
            arms[arm] = {
                "tool_total": round(sum(ts), 2),
                "owner_total": round(sum(os_), 2),
                "delta_tool_minus_owner": round(sum(ts) - sum(os_), 2),
                "head_to_head": R._h2h(ts, os_),
            }
        return engine_skill, arms

    seats = {}
    filtered_present = True
    for seat in SEATS:
        ch = seats_choices[str(seat)]
        owner_all = [str(p["player_id"]) for p in picks
                     if p["roster_id"] == seat]
        owner_skill = _skill(owner_all, positions)
        engine_skill, arms = lineup_arms(ch["roster"], owner_skill)
        row = {
            "owner": owners[str(seat)]["display_name"],
            "arms": arms,
            "engine_roster": [
                {"player_id": p, "name": names.get(p, p),
                 "pos": positions.get(p), "actual": totals.get(p, 0.0)}
                for p in engine_skill],
            "shadowed_picks": ch["shadowed_picks"],
            "kdef_top_entry_demotions": ch["kdef_top_entry_demotions"],
            "first_QB_round_engine": ch["first_QB_round"],
            "first_QB_round_owner": first_qb_round_of(
                picks, keeper_pids, seat, positions),
            "first_TE_round_engine": ch["first_TE_round"],
        }
        # the DIAGNOSTIC board arm: the same engine over the same bundle
        # minus the committed deterministic status exclusions.
        fch = ch.get("status_filtered")
        if fch:
            f_skill, f_arms = lineup_arms(fch["roster"], owner_skill)
            row["status_filtered"] = {
                "arms": f_arms,
                "engine_roster": [
                    {"player_id": p, "name": names.get(p, p),
                     "pos": positions.get(p), "actual": totals.get(p, 0.0)}
                    for p in f_skill],
                "first_QB_round_engine": fch["first_QB_round"],
            }
        else:
            filtered_present = False
        seats[str(seat)] = row

    out = {
        "season": season,
        "owners": {rid: o["display_name"] for rid, o in sorted(
            owners.items(), key=lambda kv: int(kv[0]))},
        "seats": seats,
        "league_summary": A.league_summary(seats, owners),
    }
    if filtered_present:
        fseats = {rid: {"arms": seats[rid]["status_filtered"]["arms"]}
                  for rid in seats}
        out["league_summary_status_filtered"] = A.league_summary(fseats,
                                                                 owners)
    return out


def qb_question(choices: dict, years: dict, league_table: dict) -> dict:
    """Cory's seat: when does the engine take its first QB, and what does the
    engine's own component output say is holding the QB back before then?"""
    ds = league_table["drafter_study"]["top3_vs_bottom_half"]
    per_season = {}
    for s, ydoc in sorted(choices["seasons"].items()):
        seat1 = ydoc["seats"]["1"]
        term_counts: dict[str, int] = {}
        detail = []
        for rec in seat1["records"]:
            if rec.get("how") != "engine":
                continue
            if seat1["first_QB_round"] is not None and \
                    rec["round"] >= seat1["first_QB_round"] and \
                    rec.get("chosen_pos") == "QB":
                break
            tq = rec.get("top_qb")
            if not tq:
                continue
            adv = tq.get("chosen_largest_term_advantage") or {}
            term = adv.get("term")
            if term:
                term_counts[term] = term_counts.get(term, 0) + 1
            detail.append({
                "pick_no": rec["pick_no"], "round": rec["round"],
                "chosen": rec.get("chosen_name") or rec["chosen"],
                "chosen_pos": rec.get("chosen_pos"),
                "top_qb": tq,
            })
        per_season[s] = {
            "engine_first_QB_round": seat1["first_QB_round"],
            "engine_first_QB_round_status_filtered":
                (seat1.get("status_filtered") or {}).get("first_QB_round"),
            "owner_first_QB_round":
                years[s]["seats"]["1"]["first_QB_round_owner"],
            "delaying_term_counts_pre_first_QB": term_counts,
            "pre_first_QB_pick_detail": detail,
        }
    return {
        "question": ("does survival/VONA already produce the QB-wait the "
                     "top-3 drafters show?"),
        "term_note": ("in the engine's published components the weighted "
                      "`value` term is weight x VONA — the survival-priced "
                      "opportunity-cost term; `tier`/`need`/`risk` are "
                      "zero-weighted in MEASURED_WEIGHTS and cannot delay "
                      "anything"),
        "league_benchmark_first_QB_round": {
            "top3": ds["first_QB_round_mean"]["top3"],
            "bottom_half": ds["first_QB_round_mean"]["bottom_half"],
        },
        "per_season": per_season,
    }


def run(choices_path: Path | None = None) -> dict:
    """`choices_path` defaults to the shipping-configuration choice file.

    REGISTER 56 / P107 added sibling files for the VONA arms
    (`engine_seat_choices_a1.json`, `_a2.json`) produced by the SAME CI job
    against the SAME bundle. Grading them means pointing this function at one
    of those instead — the machinery is identical, which is the point: an arm
    graded by a second grader is an arm graded against a different ruler.
    """
    cp = choices_path or CHOICES
    if not cp.exists():
        raise SystemExit(f"no {cp.name} — dispatch the "
                         "backtest workflow (it assembles bundles where the "
                         "network is) and pull its commit first")
    choices = json.loads(cp.read_text())
    league_table = json.loads(LEAGUE_TABLE.read_text())
    restated = json.loads(RESTATED.read_text()) if RESTATED.exists() else None

    positions = positions_record()
    ages = board_ages()
    names = R.name_map()

    seasons = sorted(choices["seasons"], reverse=True)
    years = {}
    for s in seasons:
        years[s] = grade_season(int(s), choices["seasons"][s]["seats"],
                                positions, ages, names)

    filtered = all("status_filtered" in years[s]["seats"]["1"]
                   for s in seasons)

    def pooled_of(getter):
        per_owner = {}
        for rid in SEATS:
            rows = {"owner": years[seasons[0]]["owners"][str(rid)]}
            for arm in ("optimal", "realistic"):
                ds = [getter(years[s]["seats"][str(rid)])[arm]
                      ["delta_tool_minus_owner"] for s in seasons]
                rows[arm] = {"per_year": {s: d for s, d in zip(seasons, ds)},
                             "mean_delta": round(sum(ds) / len(ds), 2)}
            per_owner[str(rid)] = rows
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
        return per_owner

    per_owner = pooled_of(lambda seat: seat["arms"])
    pooled_filtered = (pooled_of(lambda seat: seat["status_filtered"]["arms"])
                       if filtered else None)

    proxy_ctx = {
        "proxy_original_pooled_baseline":
            league_table["pooled"]["baseline"]["_summary"],
    }
    if restated:
        proxy_ctx["proxy_restated_bracket"] = restated["summary_bracket"]

    return {
        "_territory": ("TERRITORY: A — produced by "
                       "draft/backtest/replay_seats_grade.py over "
                       "draft/backtest/engine_seat_choices.json"),
        "_note": ("THE LIVE-EDGE MEASUREMENT: the shipped engine.js/"
                  "survival.js (MEASURED_WEIGHTS) in every owner's real "
                  "seat, era-appropriate bundles (walk-forward projections "
                  "+ contemporaneous FFC ADP, AsOf discipline), fixed "
                  "opponents, keepers as recorded, K/DEF mirrored, graded "
                  "on committed actual weekly points with the proxy "
                  "table's exact lineup arms. Each seat-season is ONE "
                  "alternative history. The choice side ran in CI at the "
                  "recorded head; grading joined outcomes afterwards — "
                  "the replay never saw them."),
        "estimand": ESTIMAND,
        "engine_meta": choices["meta"],
        "coverage": {
            "seasons": [int(s) for s in seasons],
            "seats_per_season": 10,
            "seat_seasons": 10 * len(seasons),
            "why": ("the era bundles cover every league season with a "
                    "recorded draft (2023-25); earlier seasons have no "
                    "recorded picks to replay"),
        },
        "board_arms": {
            "status_blind": ("the bundle board exactly as cli.py assembles "
                            "it — the engine's choices include players whose "
                            "careers were over before the replayed draft "
                            "(the same blindness the proxy table's "
                            "restatement corrected); reported because it is "
                            "what the harness produces today"),
            "status_filtered": ("DIAGNOSTIC: the same bundles minus the "
                                "committed deterministic roster-status "
                                "exclusions (draft/data/"
                                "roster_status_exclusions.json, the "
                                "board-agnostic population); same rule, "
                                "zero fitted parameters, nothing selected"),
        },
        "proxy_context_quoted": proxy_ctx,
        "years": years,
        "pooled": per_owner,
        "pooled_status_filtered": pooled_filtered,
        "qb_question": qb_question(choices, years, league_table),
        "honesty": [
            "one configuration graded — the shipped MEASURED_WEIGHTS; nothing was searched, nothing selected (no_fit_guard)",
            "the bundle board is NOT the proxy board: bundle projections are the backtest lab's walk-forward construction with contemporaneous FFC ADP; the grading projections (realistic-arm ranks only) are the proxy's own_v6_nomarket, so owner totals match the proxy table exactly",
            "the engine's risk term is age-only on bundle boards and its injury/depth/opportunity inputs are DECLARED ABSENT there (build_bundle field_limits) — the live engine has strictly more information than this replay gives it",
            "rookies exist on the bundle board only where the room drafted them (fallback ADP behind FFC's last price); their projections are walk-forward and therefore absent-or-zero — the same rookie blindness the proxy named",
            "fixed opponents per seat: ten seats are ten separate counterfactuals, not one re-drafted league",
            "K/DEF mirrored at the owner's actual slots; engine top entries that were K/DEF at a skill slot were demoted and counted per seat",
            "both arms are always reported together; the realistic arm alone is the tool's best case and is not the headline",
        ],
    }


def main() -> None:
    # `--choices` / `--out` keep the default invocation byte-identical while
    # letting the P107 arms be graded by this same module.
    argv = sys.argv[1:]
    def _arg(name, default):
        return argv[argv.index(name) + 1] if name in argv else default
    cp = Path(_arg("--choices", str(CHOICES)))
    out = Path(_arg("--out", str(OUT)))
    doc = run(cp)
    doc["_choices_file"] = cp.name
    doc["_vona_arm"] = (json.loads(cp.read_text()).get("meta") or {}).get("vona_arm", "a0")
    out.write_text(json.dumps(doc, indent=1))
    globals()["OUT"] = out
    print(f"wrote {out.relative_to(ROOT)}  (arm {doc['_vona_arm']})")
    for s in doc["coverage"]["seasons"]:
        ls = doc["years"][str(s)]["league_summary"]
        o, r_ = ls["optimal"], ls["realistic"]
        print(f"{s}: optimal beats {o['beats_n_of_10']}/10 "
              f"median {o['median_owner_delta']:+.1f} Cory {o['cory_delta']:+.1f} | "
              f"realistic beats {r_['beats_n_of_10']}/10 "
              f"median {r_['median_owner_delta']:+.1f} Cory {r_['cory_delta']:+.1f}")
    p = doc["pooled"]["_summary"]
    print("pooled (status_blind):", json.dumps(p))
    if doc.get("pooled_status_filtered"):
        print("pooled (status_filtered):",
              json.dumps(doc["pooled_status_filtered"]["_summary"]))
    q = doc["qb_question"]
    for s, row in q["per_season"].items():
        print(f"QB {s}: engine r{row['engine_first_QB_round']} vs "
              f"Cory r{row['owner_first_QB_round']} | delays "
              + json.dumps(row["delaying_term_counts_pre_first_QB"]))


if __name__ == "__main__":
    main()
