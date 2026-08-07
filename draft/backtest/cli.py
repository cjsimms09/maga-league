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
    # ONE MISSING YEAR MUST NOT KILL THE RUN.
    #
    # The first CI attempt called import_weekly_data(need) with five years and
    # got HTTP 404 on one of them, which took the other four with it and
    # produced no backtest at all. nfl_data_py 0.3.2 serves some seasons from a
    # path that no longer exists, while import_pbp_data for the same years works
    # — so this is a stale URL in the library, not missing data in the world.
    #
    # Pull year by year, keep what answers, and record what did not. A season
    # whose priors are unavailable gets SKIPPED with a caveat further down
    # rather than silently replayed against nothing, which is the failure mode
    # that would matter.
    import pandas as pd
    caveats = []
    frames, missing = [], []
    for y in need:
        try:
            df = nfl.import_weekly_data([y])
            frames.append(df)
            print(f"    {y}: {len(df)} rows")
        except Exception as e:                                   # noqa: BLE001
            missing.append(y)
            print(f"    {y}: UNAVAILABLE ({type(e).__name__}: {e})")
    if not frames:
        print("\nNO WEEKLY DATA AT ALL — cannot project or grade anything."); return 1
    weekly = pd.concat(frames, ignore_index=True)

    # RECOVER THE MISSING SEASONS FROM PLAY-BY-PLAY.
    #
    # 2025 is the season closest to the board we actually draft on, so losing it
    # does not merely shrink N — it re-weights the verdict toward 2023
    # conditions. import_pbp_data serves it even though import_weekly_data 404s.
    #
    # THE GATE: rebuild a season the library CAN serve, and require agreement
    # within rounding on graded points before trusting the rebuilt path for one
    # it cannot. A rebuilt stat line that quietly disagrees would corrupt every
    # grade downstream while looking entirely normal.
    xval = None
    if missing:
        have = sorted(set(need) - set(missing))
        control = have[-1] if have else None
        print(f"\n  recovering {missing} from play-by-play "
              f"(cross-validating on {control})")
        try:
            pbp = nfl.import_pbp_data(sorted(set(missing) | ({control} if control else set())),
                                      downcast=True)
            print(f"    pbp: {len(pbp)} rows")
        except Exception as e:                                   # noqa: BLE001
            pbp = None
            print(f"    pbp UNAVAILABLE: {e}")
        if pbp is not None and control:
            scoring_for_xval = json.load(open(os.path.join(
                os.path.dirname(HERE), "config", "league_config.json")))["scoring"]
            xval = GR.cross_validate(pbp, weekly, control, scoring_for_xval, crosswalk)
            print("    cross-validation:", json.dumps(xval))
            if xval.get("agrees"):
                rebuilt = GR.weekly_from_pbp(pbp, missing)
                if rebuilt:
                    weekly = pd.concat([weekly, pd.DataFrame(rebuilt)], ignore_index=True)
                    print(f"    recovered {missing}: +{len(rebuilt)} player-weeks")
                    caveats.append(
                        "%s weekly stats were REBUILT from play-by-play because "
                        "import_weekly_data 404s for them; cross-validated on %s "
                        "(worst top-200 difference %.3f pts)"
                        % (missing, control, xval["worst_diff_top200"]))
                    missing = []
            else:
                print("    REFUSING the rebuilt path — it does not reproduce "
                      + str(control) + " within tolerance")
                caveats.append(
                    "%s could NOT be recovered: the play-by-play rebuild "
                    "disagreed with the library on %s (%s)"
                    % (missing, control, json.dumps(xval)))
    print(f"  weekly: {len(weekly)} rows over {sorted(set(need) - set(missing))}")
    if missing:
        caveat_missing = ("weekly stats unavailable for %s; any season needing them "
                          "as a prior or for grading is affected" % missing)
        print("  ! " + caveat_missing)
    else:
        caveat_missing = None

    bundles, actual, methods = [], {}, []
    if caveat_missing:
        caveats.append(caveat_missing)
    for season in seasons:
        print(f"\n--- {season} ---")
        # THE NAME MATCHER IS NOT OPTIONAL.
        #
        # The first run that got this far failed its own sanity gate on all
        # three seasons with overlap_with_adp of 18, 14 and 7 players. The cause
        # was here: fetch_adp returns FFC's RAW payload, whose player_id is
        # FFC's own id (Jahmyr Gibbs is 5672 there), and I keyed it as though it
        # were a Sleeper id. Seven coincidental collisions out of two hundred.
        #
        # build_adp_table is the production path — it name-matches FFC to
        # Sleeper and returns rows keyed by SLEEPER id. Reusing it is the same
        # rule the replay follows for engine.js, and I broke it here first.
        def _adp(fmt, teams, year):
            table = ADP.build_adp_table(players_raw, fmt=fmt, teams=teams,
                                        year=year, strict_top_n=10 ** 9)
            rows = table["adp"]
            return {"players": [{"sleeper_id": pid, "adp": r["adp"]}
                                for pid, r in rows.items()]}
        store = AsOfDataStore(season, history, adp_loader=_adp)
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
        n_graded = len(actual[str(season)])
        print(f"  graded {n_graded} players")
        if n_graded == 0:
            caveats.append(f"{season}: replayed but NOTHING could be graded — "
                           "its picks contribute nothing to the headline")

    if not bundles:
        print("\nNO BUNDLES — nothing to replay."); return 1
    caveats.append("Historical FFC ADP is name-matched against TODAY'S Sleeper "
                   "player list, so a player who has since changed teams or "
                   "retired may match differently than he would have that year.")
    caveats.append(f"Seasons replayed: {[b['season'] for b in bundles]}")
    json.dump({"bundles": bundles, "actual_points": actual, "caveats": caveats,
               "methods": methods}, open(args.out, "w"))
    print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
