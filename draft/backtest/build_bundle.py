"""Assemble one season's era-appropriate bundle. AsOf store is the only input.

WHAT A BUNDLE IS: everything a drafter could have known before that season's
draft, in the shape replay.js consumes — the player universe with era-
appropriate projections, that season's contemporaneous FFC ADP, that season's
keepers, the pick sequence, and the config as it stood.

WHAT IT IS NOT: it carries no outcome of any kind. Grading data is assembled
separately in grade.py and joined after the replay has already made its choices.

THE SEAM THAT MATTERS: this module holds an AsOfDataStore and never touches
sleeper_import, adp.fetch_adp or nfl_data_py directly. Every read goes through
the store, so a future edit that reaches for convenient data raises instead of
quietly succeeding.
"""
from __future__ import annotations
import sys, os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import scoring                                     # our engine, never a provider's
import vorp as VORP
from backtest import grade as GR
from backtest import projections as WF


def weekly_points_by_season(weekly_df, seasons, scoring_cfg, crosswalk):
    """Fantasy points per player per season, scored under `scoring_cfg`.

    Always our scoring engine: a provider's points encode a different league's
    rules, and the premise of this whole tool is that the board is built for
    OUR scoring. `crosswalk` maps gsis id -> sleeper id.
    """
    out, games = {}, {}
    if weekly_df is None or len(weekly_df) == 0:
        return out, games
    cols = set(weekly_df.columns)
    id_col = 'player_id' if 'player_id' in cols else 'gsis_id'
    for season in seasons:
        df = weekly_df[weekly_df['season'] == season] if 'season' in cols else weekly_df
        pts, gms = {}, {}
        for row in df.to_dict('records'):
            sid = crosswalk.get(str(row.get(id_col)))
            if not sid:
                continue
            # nflverse column names -> our scoring keys; without this every
            # prior-season total scored ~0 and the projection went flat.
            line = GR.nflverse_weekly_to_scoring(row)
            p = scoring.score_stat_line(line, scoring_cfg)
            pts[sid] = pts.get(sid, 0.0) + p
            gms[sid] = gms.get(sid, 0) + 1
        out[season] = pts
        games[season] = gms
    return out, games


def build(store, *, players_meta, weekly_df, crosswalk, prior_seasons,
          adp_curve=None, teams=None):
    """Return (bundle, notes). `store` is an AsOfDataStore and the only source
    of season-specific truth."""
    season = store.season
    cfg = store.league_config()
    teams = teams or cfg.get("teams") or 10
    notes = {"season": season}

    # 1. Prior production, scored under THIS season's rules.
    prior = [s for s in prior_seasons if int(s) < int(season)]
    if not prior:
        raise RuntimeError(f"{season} has no prior season to fit on; it cannot be replayed")
    pts_by_season, games_by_season = weekly_points_by_season(
        weekly_df, prior, cfg["scoring"], crosswalk)

    positions = {str(p["player_id"]): p.get("position") for p in players_meta}
    # Age AS OF the replayed season, not today. Using current age would make
    # every player in a 2023 replay two years older than he was.
    ages = {}
    for p in players_meta:
        a = p.get("age")
        if a is not None:
            ages[str(p["player_id"])] = float(a) - (int(os.environ.get("CURRENT_SEASON", 2026)) - season)

    proj = WF.walk_forward(season, pts_by_season, games_by_season, positions, ages)

    # 2. Contemporaneous ADP — the store refuses to guess if it cannot get it.
    adp_raw = store.adp(teams=teams)
    adp_by_id = {}
    for row in (adp_raw.get("players") or []):
        pid = str(row.get("sleeper_id") or row.get("player_id") or "")
        if pid:
            adp_by_id[pid] = float(row.get("adp") or 0) or None
    adp_by_id = {k: v for k, v in adp_by_id.items() if v}

    # 3. Sanity gate decides which projection method this season used.
    verdict = WF.sanity_check(proj, adp_by_id)
    method = "walk_forward"
    if not verdict["passes"]:
        if not adp_curve:
            raise RuntimeError(
                f"{season}: walk-forward failed sanity ({verdict}) and no ADP curve "
                "was supplied. Refusing to emit a bundle whose projections are noise.")
        proj = WF.adp_implied(adp_by_id, adp_curve)
        method = "adp_implied"
    notes["projection_method"] = method
    notes["sanity"] = verdict

    # 4. The board.
    players = []
    for p in players_meta:
        pid = str(p["player_id"])
        pm = proj.get(pid)
        if pm is None:
            continue
        a = adp_by_id.get(pid)
        players.append({
            "player_id": pid, "name": p.get("name"), "position": p.get("position"),
            "team": p.get("team"), "bye": p.get("bye"),
            "proj_mean": pm, "proj_sd": round(pm * 0.25, 2),
            "proj_ceiling": round(pm * 1.35, 2),
            "raw_adp": a, "adjusted_adp": a, "adp_sd": None,
            "adp_source": "ffc" if a else "none",
        })
    players = [p for p in players if p["raw_adp"]]
    players.sort(key=lambda x: x["raw_adp"])

    starters = {}
    for slot in cfg.get("roster_positions") or []:
        if slot not in ("BN", "IR", "TAXI"):
            starters[slot] = starters.get(slot, 0) + 1
    VORP.apply_vorp(players, {"teams": teams, "starters": starters})
    VORP.assign_tiers(players)
    for i, p in enumerate(sorted(players, key=lambda x: -(x.get("vorp") or 0))):
        p["overall_rank"] = i + 1
        p["score"] = p.get("vorp")

    # 5. The draft itself. take_until is the only read path; the full ordered
    #    list is legitimate HERE because replay.js consumes it strictly in
    #    order and never looks ahead — see its board-shrinks-monotonically test.
    draft = store.draft()
    picks = sorted(draft.get("picks") or [], key=lambda p: p.get("pick_no") or 0)
    rounds = max((p.get("round") or 1) for p in picks) if picks else 0

    bundle = {
        "season": season, "teams": teams, "rounds": rounds,
        "roster_positions": cfg.get("roster_positions"),
        "players": players, "picks": picks,
        "projection_method": method, "sanity": verdict,
        "keepers": [str(k["player_id"]) for k in store.keepers()],
    }
    notes["players_on_board"] = len(players)
    notes["picks"] = len(picks)
    return bundle, notes
