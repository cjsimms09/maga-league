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
# ALSO this directory: the backtest modules import each other by bare name
# (`projection_error` does `import field_population`), so importing one of them
# from here fails unless its own package directory is importable too.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import scoring                                     # our engine, never a provider's
import vorp as VORP
from backtest import grade as GR
from backtest import lab_projections as WF


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


#: The dispersion fields a bundle carries, DECLARED ONCE because two readers
#: need them and a hand-mirrored second copy is what went stale six times on
#: 2026-08-17.
#:
#: `harness_divergence.py` AST-parses the board dict literal appended below to
#: learn what a bundle board holds. These fields are attached in a SECOND PASS
#: (they need a calibration the bundle must exist before you can fit), so they
#: are invisible to that parse — and the tool duly reported `proj_ceiling` as
#: LAB-BLIND, i.e. "corrupts a backtest number", hours after it stopped being
#: true. The declaration below is what it reads instead of guessing.
DISPERSION_FIELDS = ("proj_ceiling", "proj_floor", "proj_sd")


def attach_dispersion(players, calibration):
    """Put the MEASURED spread on bundle rows, or leave the fields off entirely.

    THE DEFECT THIS REPLACES. This module used to write, for every player on
    every backtest board:

        proj_sd      = 0.25 * proj_mean          (a GLOBAL constant)
        proj_ceiling = 1.35 * proj_mean          (a GLOBAL constant)

    so `engine.js`'s ceiling term — `proj_ceiling - proj_mean` — was
    `0.35 * proj_mean`, a fixed multiple of the value term. Spearman 1.0000.
    `lab_ceiling_degeneracy.js` put it plainly: THE MEASUREMENT COULD NOT HAVE
    COME OUT ANY OTHER WAY. That is why `MEASURED_WEIGHTS.ceiling` is 0, and the
    zero was to stand "until a real-ceiling board re-runs the experiment".

    ABSENT IS ABSENT — THERE IS NO FALLBACK, DELIBERATELY. Off a cell the
    calibration never measured, the field is OMITTED rather than filled in.
    `proj_sd_for`'s own docstring says why: a global fallback "is exactly how
    `0.25 * proj_mean` reached the board, and a consumer cannot tell a fitted
    number from a filled-in one." `engine.js` reads
    `(p.proj_ceiling || p.proj_mean) - p.proj_mean`, so an omitted ceiling
    contributes a spread of zero — which is the honest reading of "we have no
    ceiling measurement for this player", and not the same as claiming his
    ceiling equals his mean by construction.

    WHAT THIS DOES NOT FIX, stated here rather than discovered later: the
    measured ceiling is still `proj_mean x a per-cell constant`. It varies
    BETWEEN cells and not WITHIN them, so it reduces the collinearity without
    removing it. A weight fitted on this board measures cross-band dispersion
    differences only, and cannot speak to whether an individual player is worth
    taking for his upside.

    `weekly_sd` is deliberately NOT attached. Production derives it from games
    played, the bundle has no games-expected figure, and inventing one would be
    the same class of error this function exists to remove.
    """
    from backtest import projection_error as PE

    by_pos = {}
    for p in players:
        pos, mean = p.get("position"), p.get("proj_mean")
        if pos and isinstance(mean, (int, float)):
            by_pos.setdefault(pos, []).append(p)
    attached = {"proj_ceiling": 0, "proj_floor": 0, "proj_sd": 0}
    unmeasurable = 0
    for pos, rows in by_pos.items():
        rows.sort(key=lambda r: -(r.get("proj_mean") or 0.0))
        for rank, p in enumerate(rows, start=1):
            mean = p.get("proj_mean") or 0.0
            got = False
            for field, fn in zip(DISPERSION_FIELDS,
                                 (PE.proj_ceiling_for, PE.proj_floor_for,
                                  PE.proj_sd_for)):
                val, status = fn(calibration, pos, rank, mean)
                if status == "measured" and val is not None:
                    p[field] = val
                    p[field + "_source"] = "measured_calibration"
                    attached[field] += 1
                    got = True
            if not got:
                unmeasurable += 1
    return {"attached": attached, "players_with_no_measured_cell": unmeasurable,
            "players": len(players)}


def build(store, *, players_meta, weekly_df, crosswalk, prior_seasons,
          adp_curve=None, teams=None, calibration=None):
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

    # 4. The board — must include EVERY player the room actually drafted.
    #
    # THE LEAK THIS FIXES. The board was FFC-priced-only and dropped anyone
    # without a projection, so a real 150-pick draft with kickers, defences and
    # deep fliers lost 23-34% of its picks off the board. A board that never
    # sees a third of the picks cannot deplete, so players 'survive' predictions
    # that said they were gone — which is exactly the calibration break the
    # report showed (predicted 5% survival, 41% actual). A backtest board that
    # is missing the real picks is not a smaller board, it is a wrong one.
    draft = store.draft()
    picks = sorted(draft.get("picks") or [], key=lambda pp: pp.get("pick_no") or 0)
    # STAMP KEEPERS FROM THE SEASON-WIDE UNION. 2023's main draft carries no
    # is_keeper flags (its keepers live in a separate 30-pick ledger draft),
    # so a replay reading only the main draft's flags decided keeper slots as
    # live picks. store.keepers() now unions the season's drafts; the emitted
    # picks carry the flag replay.js actually reads. Copies, not mutations —
    # the history dict is not ours to edit.
    keeper_ids = {str(k.get("player_id")) for k in store.keepers()}
    picks = [dict(pp, is_keeper=bool(pp.get("is_keeper"))
                  or str(pp.get("player_id")) in keeper_ids) for pp in picks]
    drafted_ids = {str(pp.get("player_id")) for pp in picks}
    pick_no_by_id = {str(pp.get("player_id")): pp.get("pick_no") for pp in picks}

    players = []
    for p in players_meta:
        pid = str(p["player_id"])
        pm = proj.get(pid)
        a = adp_by_id.get(pid)
        # Keep him if we can value him OR the room actually drafted him.
        if pm is None and pid not in drafted_ids:
            continue
        players.append({
            "player_id": pid, "name": p.get("name"), "position": p.get("position"),
            "team": p.get("team"), "bye": p.get("bye"),
            "proj_mean": pm if pm is not None else 0.0,
            # NO SYNTHETIC DISPERSION HERE ANY MORE. `proj_sd = 0.25 * mean` and
            # `proj_ceiling = 1.35 * mean` used to be written on this line, which
            # made the ceiling term a fixed multiple of the value term on every
            # backtest board ever built (Spearman 1.0000) and is why the ceiling
            # weight measured collinear and was zeroed. Dispersion is now
            # attached by `attach_dispersion` from the measured calibration, or
            # NOT AT ALL — see that function for why there is no fallback.
            "raw_adp": a, "adjusted_adp": a, "adp_sd": None,
            "adp_source": "ffc" if a else ("drafted" if pid in drafted_ids else "none"),
            # ── AGE, AS OF THE REPLAYED SEASON (2026-08-14) ──────────────────
            #
            # `ages` has been computed correctly above since this file was
            # written — with the as-of-season adjustment, so a 2023 replay does
            # not make everyone two years older than he was — AND IT WAS NEVER
            # WRITTEN TO THE PLAYER. So `riskAdjustment`'s age clause could not
            # fire on any bundle board, ever.
            #
            # MEASURED CONSEQUENCE, not asserted: with no age the risk term takes
            # ONE distinct value (0.0) across 400 candidates at four picks. With
            # age it takes 6, spanning [-25, 0]. All four of its live inputs give
            # 11 and [-60, +6], which is production exactly.
            "age": ages.get(pid),
        })

    # Fallback ADP mirrors the production pipeline: everyone without an FFC price
    # goes BEHIND FFC's last player, ordered by projection then by when the room
    # actually took them, so every drafted player has a sensible board position.
    priced = [p for p in players if p["raw_adp"]]
    unpriced = [p for p in players if not p["raw_adp"]]
    ffc_max = max((p["raw_adp"] for p in priced), default=200.0)
    unpriced.sort(key=lambda x: (-(x["proj_mean"] or 0.0),
                                 pick_no_by_id.get(x["player_id"], 9999)))
    for i, up in enumerate(unpriced):
        up["raw_adp"] = up["adjusted_adp"] = ffc_max + 1 + i
        up["adp_sd"] = 30.0
    players = priced + unpriced
    players.sort(key=lambda x: x["raw_adp"])

    # MEASURED DISPERSION, OR NONE. The caller supplies a calibration fitted with
    # THIS season held out (`calibrate(exclude_season=season)` raises if it is
    # not), because a spread fitted on the season being graded is foreknowledge
    # the drafter did not have — the exp33 leak, one level down. A caller that
    # supplies nothing gets a board with no dispersion fields at all rather than
    # the old synthetic constants.
    notes["dispersion"] = (
        attach_dispersion(players, calibration) if calibration else
        {"attached": None,
         "why": "no calibration supplied — dispersion fields are ABSENT rather "
                "than synthesised. The former 1.35x/0.25x constants made the "
                "ceiling term a fixed multiple of the value term, which is the "
                "defect this refusal exists to prevent recurring."})

    starters = {}
    for slot in cfg.get("roster_positions") or []:
        if slot not in ("BN", "IR", "TAXI"):
            starters[slot] = starters.get(slot, 0) + 1
    VORP.apply_vorp(players, {"teams": teams, "starters": starters})
    VORP.assign_tiers(players)
    for i, p in enumerate(sorted(players, key=lambda x: -(x.get("vorp") or 0))):
        p["overall_rank"] = i + 1
        p["score"] = p.get("vorp")

    # 5. The draft itself was fetched above (board coverage needed it). take_until
    #    remains the only in-order read path replay.js uses.
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

    # ── WHAT THIS BOARD CANNOT CARRY, DECLARED ON THE ARTIFACT ───────────────
    #
    # The engine reads 28 player fields. A bundle board carries a fraction of
    # them, and until 2026-08-14 nothing said so — which is how `risk` came to be
    # identically zero in every backtest this project has ever run while the
    # result tables read "risk contributes nothing" and everyone believed it was
    # a fact about football.
    #
    # THREE OF RISK'S FIVE INPUTS ARE PERMANENTLY UNAVAILABLE HERE, and that is a
    # LIMIT rather than a to-do. `injury_status` and `depth_chart_order` come from
    # Sleeper's LIVE player payload (draft/build.py) and nothing archives them;
    # `opportunity_z` is derived point-in-time by the production pipeline. Writing
    # today's values into a 2023 replay would be LOOKAHEAD CONTAMINATION — a
    # player's 2026 injury flag deciding a 2023 pick — and that is strictly worse
    # than absence, because absence trips a guard and contamination does not.
    #
    # So the bundle DECLARES the gap instead of filling it. A consumer that needs
    # a field this board lacks can now find out from the board rather than from a
    # sweep a year later.
    bundle["field_limits"] = {
        "engine_reads": 28,
        "carried_here": sorted(players[0].keys()) if players else [],
        "absent_and_unrecoverable": {
            "injury_status": "Sleeper live payload; no historical archive. Today's "
                             "flag in a past replay is lookahead contamination.",
            "depth_chart_order": "same source, same reason.",
            "opportunity_z": "derived point-in-time by the production pipeline.",
            "games_missed_3yr": "read by the engine, written by NO board, "
                                "production included (declared optional there).",
        },
        "synthetic_not_sourced": {
            # FIXED 2026-08-17. This block used to declare proj_ceiling as
            # "1.35 x proj_mean ... RANK-IDENTICAL to value here (Spearman
            # 1.0000)" and proj_sd as "0.25 x proj_mean. Carries no information
            # beyond proj_mean." Both are gone: dispersion now comes from the
            # measured per-(position, band) calibration, or is absent.
            "adp_sd": "None for every FFC-priced player.",
        },
        "dispersion_now_measured": {
            "proj_ceiling / proj_floor / proj_sd": (
                "measured p90 / p10 / sd ratio per (position, band), from the "
                "same appliers production uses, fitted LEAVE-ONE-SEASON-OUT. "
                "Absent off an unmeasured cell — never a fallback constant."),
            "still_not_per_player": (
                "the measured spread is proj_mean x a per-CELL constant: it "
                "varies between cells, not within them. So a ceiling weight "
                "fitted here measures CROSS-BAND dispersion differences only "
                "and cannot say whether an individual player is worth taking "
                "for his upside. The collinearity is reduced, not removed."),
            "weekly_sd": (
                "NOT attached. Production derives it from games played and the "
                "bundle has no games-expected figure; inventing one would be "
                "the same error this change removes."),
        },
        "consequence": "the risk term is DEGENERATE on this board without `age` "
                       "and PARTIAL with it: 6 distinct values against production's "
                       "11. Any experiment grading risk here is grading an "
                       "age-only risk term and must say so.",
    }
    return bundle, notes
