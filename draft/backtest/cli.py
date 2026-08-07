"""Assemble real bundles + grading data. Runs where the network is (CI).

Everything season-specific goes through AsOfDataStore. This file is the only
place the two sides meet, and they meet in one direction: bundles are written
first, grading second, and the replay reads bundles without ever seeing the
grading dict.
"""
from __future__ import annotations
import json, os, sys, argparse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)

import adp as ADP
import sleeper_import as SL
from backtest.asof import AsOfDataStore
from backtest import build_bundle as BB
from backtest import grade as GR


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--history", default=os.path.join(os.path.dirname(HERE), "data", "league_history.json"))
    ap.add_argument("--out", default=os.path.join(HERE, "bundles.json"))
    ap.add_argument("--seasons", default="")
    args = ap.parse_args()

    history = json.load(open(args.history))
    seasons = [int(s) for s in args.seasons.split(",") if s.strip()] or [
        int(s["season"]) for s in history.get("seasons", [])
        if any((d.get("picks") or []) for d in (s.get("drafts") or []))]
    seasons = sorted(seasons)
    print("replayable seasons:", seasons)

    import nfl_data_py as nfl
    players_raw = SL.fetch_players()
    players_meta = [{"player_id": str(pid), "name": p.get("full_name"),
                     "position": p.get("position"), "team": p.get("team"),
                     "age": p.get("age"), "gsis_id": p.get("gsis_id")}
                    for pid, p in players_raw.items() if p.get("position")]
    try:
        ids_df = nfl.import_ids()
    except Exception as e:
        print("  ! import_ids unavailable:", e); ids_df = None
    crosswalk = GR.crosswalk_gsis_to_sleeper(players_meta, ids_df)
    print(f"  crosswalk: {len(crosswalk)} gsis->sleeper")

    need = sorted({y for s in seasons for y in (s - 2, s - 1, s)})
    need = [y for y in need if y >= 2018]
    print("  pulling weekly for", need)
    weekly = nfl.import_weekly_data(need)
    print(f"  weekly: {len(weekly)} rows")

    bundles, actual, caveats, methods = [], {}, [], []
    for season in seasons:
        print(f"\n--- {season} ---")
        store = AsOfDataStore(season, history,
                              adp_loader=lambda fmt, teams, year: ADP.fetch_adp(fmt, teams, year))
        try:
            bundle, notes = BB.build(store, players_meta=players_meta, weekly_df=weekly,
                                     crosswalk=crosswalk,
                                     prior_seasons=[season - 2, season - 1])
        except Exception as e:
            print(f"  SKIPPED: {e}")
            caveats.append(f"{season} skipped: {e}")
            continue
        print(f"  board {notes['players_on_board']} players, {notes['picks']} picks, "
              f"method {notes['projection_method']}, sanity {notes['sanity']['spearman_vs_adp']}")
        bundles.append(bundle)
        methods.append({"season": season, "method": notes["projection_method"],
                        "spearman": notes["sanity"]["spearman_vs_adp"]})
        # Grading — the far side of the wall, assembled AFTER the bundle.
        cfg = store.league_config()
        actual[str(season)] = GR.rest_of_season_points(weekly, season, cfg["scoring"], crosswalk)
        print(f"  graded {len(actual[str(season)])} players")

    if not bundles:
        print("\nNO BUNDLES — nothing to replay."); return 1
    caveats.append(f"Seasons replayed: {[b['season'] for b in bundles]}")
    json.dump({"bundles": bundles, "actual_points": actual, "caveats": caveats,
               "methods": methods}, open(args.out, "w"))
    print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
