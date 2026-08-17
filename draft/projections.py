"""Module 2 — projection engine.

Projections are not built from scratch. A consensus baseline is converted to
*our* scoring, then nudged by opportunity metrics that consensus reacts to
slowly — target share, air yards, red-zone work, snap share. The nudge is capped
because opportunity is a leading indicator, not a projection.
"""
from __future__ import annotations
from statistics import mean, pstdev

from scoring import normalize_def_stat_line, score_stat_line

# Week-to-week scoring volatility by position, as a fraction of season mean.
# TEs and RBs swing harder per point than WRs (touchdown dependence and injury
# exposure respectively), so their floor/ceiling bands are wider.
POSITION_VARIANCE = {
    "QB": 0.22, "RB": 0.34, "WR": 0.30, "TE": 0.36, "K": 0.28, "DEF": 0.38,
}
FLOOR_Z = -0.674   # 25th percentile
CEILING_Z = 1.036  # 85th percentile

# Expected games. Positional durability priors from historical games-missed.
EXPECTED_GAMES = {"QB": 15.5, "RB": 14.2, "WR": 15.0, "TE": 14.8, "K": 16.5, "DEF": 17.0}

# --- per-player variance (audit P1.7) ---------------------------------------
#
# POSITION_VARIANCE alone is a FLAT constant within a position, which made
# season_sd = mean x const and therefore ceiling - mean = mean x const x 1.036.
# UpsideBonus was, by construction, a fixed multiple of proj_mean — Spearman
# 1.0000 against proj_mean at every position on the real board, with the ratio
# a literal constant. It was not measuring upside; it was re-weighting the
# projection signal already inside VONA, and the x1.6 late-draft multiplier
# amplified the duplicate.
#
# These modifiers spread it out using data the pipeline already pulls. A
# committee back and a bell-cow with equal projections should not have equal
# ceilings — the committee back is the one with a real chance of a season far
# from his mean, in both directions.
VAR_MULT_MIN, VAR_MULT_MAX = 0.70, 1.45

# Workload concentration. A high share of his team's opportunity means the role
# is secure and the outcome is closer to the projection.
VAR_WORKLOAD_BELLCOW = -0.18      # top-of-role usage
VAR_WORKLOAD_COMMITTEE = 0.14     # thin or split usage
VAR_WORKLOAD_HIGH = 0.20          # share above this counts as a bell-cow
VAR_WORKLOAD_LOW = 0.08           # share below this counts as a committee piece

VAR_BACKUP = 0.16                 # not the starter on the depth chart
VAR_ROOKIE = 0.22                 # no NFL usage history at all
VAR_SECOND_YEAR = 0.10
VAR_INJURED = 0.12                # carrying a designation right now
VAR_AGE_CLIFF = 0.06              # past positional peak
PEAK_AGE = {"QB": 30, "RB": 26, "WR": 27, "TE": 28, "K": 32, "DEF": 27}


def player_variance(p: dict, metrics: dict | None = None) -> tuple[float, list[str]]:
    """Season-level volatility for one player, as a fraction of his mean.

    Returns (variance, reasons) — the reasons ride into the artifact so the
    Why? panel can say *why* a ceiling is high, rather than just asserting it.
    """
    pos = p.get("position") or "WR"
    base = POSITION_VARIANCE.get(pos, 0.30)
    m = metrics or {}
    mult, why = 1.0, []

    if pos in ("RB", "WR", "TE"):
        share = max(float(m.get("opportunity_share") or 0.0),
                    float(m.get("target_share") or 0.0))
        if share >= VAR_WORKLOAD_HIGH:
            mult += VAR_WORKLOAD_BELLCOW
            why.append(f"bell-cow usage ({share:.0%} of team opportunity)")
        elif 0 < share < VAR_WORKLOAD_LOW:
            mult += VAR_WORKLOAD_COMMITTEE
            why.append(f"committee usage ({share:.0%})")

    order = p.get("depth_chart_order")
    if order is not None and order != "" and int(order or 1) >= 2:
        mult += VAR_BACKUP
        why.append("behind on the depth chart")

    exp = p.get("years_exp")
    if exp == 0:
        mult += VAR_ROOKIE
        why.append("rookie, no usage history")
    elif exp == 1:
        mult += VAR_SECOND_YEAR
        why.append("second year")

    if p.get("injury_status"):
        mult += VAR_INJURED
        why.append(f"carrying {p['injury_status']}")

    age, peak = p.get("age"), PEAK_AGE.get(pos, 27)
    if age and age > peak:
        mult += VAR_AGE_CLIFF
        why.append(f"age {int(age)}, past the {pos} peak")

    mult = max(VAR_MULT_MIN, min(VAR_MULT_MAX, mult))
    return base * mult, why


def baseline_from_projections(raw: dict, scoring: dict) -> dict[str, float]:
    """Convert provider stat-line projections into our league's points.

    Team-defense rows are vocabulary-normalized first (projection TD components
    -> the aggregates the league prices; see scoring.DEF_PROJ_TD_ALIASES and
    DECISIONS-NEEDED #0, fixed 2026-08-16 under Cory's "we fix now" ruling).
    The gate is the id shape: Sleeper keys DSTs by team code, never a numeric
    id — and individual returners' rows, which carry the same component keys
    but must NOT be normalized (st_td prices 0.0 for them), are always numeric.
    """
    out = {}
    for pid, line in (raw or {}).items():
        stats = line.get("stats") if isinstance(line, dict) and "stats" in line else line
        if not isinstance(stats, dict):
            continue
        if not str(pid).isdigit():
            stats = normalize_def_stat_line(stats)
        out[str(pid)] = score_stat_line(stats, scoring)
    return out


def opportunity_metrics(pbp, weekly, seasons: list[int], weights: list[float]) -> dict[str, dict]:
    """Recency-weighted opportunity composite per player from nflfastR data.

    Returns {player_id: {target_share, air_yards_share, adot, wopr, rz_targets,
                         carries, opportunity_share, gl_carries, rz_share}}.
    Tolerates missing columns — feeds change shape between seasons.

    THE CONTRACT USED TO PROMISE `snap_share` AND `xfp_delta` AND NEITHER IS
    COMPUTED ANYWHERE (corrected 2026-08-17). A docstring naming a field the
    function does not produce is worse than silence: a reader plans around it,
    and the absence looks like a data gap rather than a missing feature. Snap
    share needs nflverse snap_counts, which this repo has never pulled — it is
    a real gap and it is filed as one, not implied here.
    """
    import pandas as pd  # imported here so the module loads without pandas

    if pbp is None or len(pbp) == 0:
        return {}

    per_season: dict[int, dict[str, dict]] = {}
    for season in seasons:
        df = pbp[pbp["season"] == season] if "season" in pbp.columns else pbp
        if len(df) == 0:
            continue

        team_plays = df.groupby("posteam").size().rename("team_plays")
        pass_plays = df[df.get("pass_attempt", 0) == 1] if "pass_attempt" in df.columns else df[df["play_type"] == "pass"]

        # Receiving: target share and air yards share.
        rec = pass_plays.dropna(subset=["receiver_player_id"]) if "receiver_player_id" in pass_plays.columns else pd.DataFrame()
        metrics: dict[str, dict] = {}
        if len(rec):
            team_targets = rec.groupby("posteam").size().rename("team_targets")
            team_air = rec.groupby("posteam")["air_yards"].sum().rename("team_air") if "air_yards" in rec.columns else None
            g = rec.groupby(["receiver_player_id", "posteam"])
            for (pid, team), grp in g:
                tt = float(team_targets.get(team, 0)) or 1.0
                tshare = len(grp) / tt
                ashare = 0.0
                adot = 0.0
                if team_air is not None and "air_yards" in grp.columns:
                    ta = float(team_air.get(team, 0)) or 1.0
                    ashare = float(grp["air_yards"].sum()) / ta
                    adot = float(grp["air_yards"].mean() or 0)
                rz = grp[grp.get("yardline_100", 100) <= 20] if "yardline_100" in grp.columns else grp.iloc[0:0]
                metrics.setdefault(str(pid), {}).update({
                    "target_share": tshare,
                    "air_yards_share": ashare,
                    "adot": adot,
                    "wopr": 1.5 * tshare + 0.7 * ashare,
                    "rz_targets": len(rz),
                })

        # Rushing: opportunity share and goal-line work.
        if "rusher_player_id" in df.columns:
            rush = df.dropna(subset=["rusher_player_id"])
            for (pid, team), grp in rush.groupby(["rusher_player_id", "posteam"]):
                plays = float(team_plays.get(team, 0)) or 1.0
                m = metrics.setdefault(str(pid), {})
                carries = len(grp)
                m["carries"] = carries
                m["opportunity_share"] = (carries + m.get("rz_targets", 0)) / plays
                if "yardline_100" in grp.columns:
                    m["gl_carries"] = int((grp["yardline_100"] <= 5).sum())
                    m["rz_share"] = float((grp["yardline_100"] <= 20).sum()) / max(carries, 1)
        per_season[season] = metrics

    # Recency weighting across seasons.
    ordered = sorted(per_season.keys(), reverse=True)
    combined: dict[str, dict] = {}
    for idx, season in enumerate(ordered):
        w = weights[idx] if idx < len(weights) else 0.0
        if w <= 0:
            continue
        for pid, m in per_season[season].items():
            acc = combined.setdefault(pid, {})
            for k, v in m.items():
                acc[k] = acc.get(k, 0.0) + w * float(v)
    return combined


def composite_z(metrics: dict[str, dict], players: list[dict]) -> dict[str, float]:
    """Per-position z-score of the opportunity composite."""
    by_pos: dict[str, list[tuple[str, float]]] = {}
    for p in players:
        pid = str(p["player_id"])
        m = metrics.get(pid)
        if not m:
            continue
        if p["position"] in ("WR", "TE"):
            raw = m.get("wopr", 0.0)
        elif p["position"] == "RB":
            raw = m.get("opportunity_share", 0.0) * 10 + m.get("rz_share", 0.0)
        else:
            continue
        by_pos.setdefault(p["position"], []).append((pid, raw))

    out: dict[str, float] = {}
    for pos, rows in by_pos.items():
        vals = [v for _, v in rows]
        mu, sd = mean(vals), (pstdev(vals) or 1.0)
        for pid, v in rows:
            out[pid] = (v - mu) / sd
    return out


def _sd_calibration():
    """C's measured 2023-25 projection-error calibration, with its own applier.

    REC-1, APPLIED 2026-08-15 under Cory's ruling ("We need to fix!!!"), after the
    decision arm was RE-RUN on the 86e42bc2 board (677 players) and reproduced the
    original result exactly: roles identical at all twelve seats, the only movement
    four bench players (PROJ-SD-DECISION-ARM.md, addendum). Returns
    (projection_error module, loaded calibration) or None — and None means every
    row falls back to the POSITION_VARIANCE path unchanged, which is the
    pre-REC-1 behaviour, never a silent zero.
    """
    import sys
    from pathlib import Path
    bt = Path(__file__).resolve().parent / "backtest"
    if str(bt) not in sys.path:
        sys.path.insert(0, str(bt))
    try:
        import projection_error as PE
        cal = PE.load()
    except Exception:
        return None
    return (PE, cal) if (cal.get("cells")) else None


def blend(players: list[dict], baseline: dict[str, float], metrics: dict[str, dict],
          cfg: dict) -> list[dict]:
    """Apply the capped opportunity adjustment and derive floor/ceiling.

    proj_sd comes from the MEASURED 2023-25 error calibration where a
    (position, projection-rank band) cell was measured (REC-1, applied under
    Cory's 2026-08-22 ruling), and from the POSITION_VARIANCE path everywhere
    else — K/DEF and any band the calibration marks unmeasurable.
    """
    cap = float(cfg.get("opportunity_cap", 0.15))
    z = composite_z(metrics, players) if metrics else {}
    pe = _sd_calibration()

    # First pass: the mean, so the second pass can rank within position. The
    # rank MUST be the same ordering vorp.assign_tiers later writes as pos_rank
    # (proj_mean desc within position) — the calibration was fitted on that
    # band definition and a different rank here would read the wrong cell.
    means: dict[int, float] = {}
    for p in players:
        pid = str(p["player_id"])
        base = baseline.get(pid)
        if base is None:
            base = p.get("proj_mean") or _rank_fallback(p)
        adj = max(-cap, min(cap, (z.get(pid, 0.0) / 2.0) * cap))
        means[id(p)] = base * (1 + adj)
        p["_blend_base"] = base
        p["_blend_adj"] = adj

    rank_of: dict[int, int] = {}
    by_pos: dict[str, list[dict]] = {}
    for p in players:
        by_pos.setdefault(p.get("position") or "", []).append(p)
    for pos, group in by_pos.items():
        ordered = sorted(group, key=lambda x: -means[id(x)])
        for i, p in enumerate(ordered):
            rank_of[id(p)] = i + 1

    # ── CELL-AVERAGE PLAYER MULTIPLIER, for the compose path below ─────────
    #
    # Cory, 2026-08-17: "The ceiling shouldn't be a calculated value?? It should
    # be different depending on the player. That makes no sense."
    #
    # He was right and this is the pre-pass that lets it be fixed. REC-1's
    # measured band sd was OVERWRITING player_variance rather than composing
    # with it, so every player in a (position, rank-band) cell ended up with the
    # SAME relative upside. Measured on the live board: within-cell variation in
    # relative upside was 0.0006 — i.e. none. The bell-cow and the committee
    # back the function above is written to separate had identical ceilings.
    #
    # The two quantities measure different things and belong multiplied:
    #   * the band ratio sets the LEVEL   (how wrong projections are for a WR
    #     ranked 33+ — measured, 1,304 player-seasons, worth keeping);
    #   * player_variance sets the SPREAD (which players inside that band are
    #     volatile — structural, and what was being destroyed).
    #
    # Normalising by the CELL AVERAGE is what keeps this honest: the mean sd
    # inside every cell is preserved exactly, so the calibration is not
    # overridden, only redistributed. We are not claiming to know better than
    # the measurement about the level — only that the level is not the whole
    # story about a player.
    _cell_mults: dict[tuple, list[float]] = {}
    _player_mult: dict[int, float] = {}
    if pe is not None:
        PE, _cal = pe
        for p in players:
            pid_ = str(p["player_id"])
            v_, _w = player_variance(p, metrics.get(pid_) if metrics else None)
            base_v = POSITION_VARIANCE.get(p.get("position") or "", 0.30)
            m_ = (v_ / base_v) if base_v else 1.0
            _player_mult[id(p)] = m_
            _cell_mults.setdefault(
                (p.get("position"), PE.band_of(rank_of.get(id(p)))), []).append(m_)
    _cell_mean = {k: (sum(v) / len(v)) for k, v in _cell_mults.items() if v}

    for p in players:
        pid = str(p["player_id"])
        base = p.pop("_blend_base")
        adj = p.pop("_blend_adj")
        mean_proj = means[id(p)]

        var, var_why = player_variance(p, metrics.get(pid) if metrics else None)
        games = EXPECTED_GAMES.get(p["position"], 15.0)
        # Season sd is mean × the player's own volatility. Keeping this
        # per-player is what stops ceiling - mean collapsing into a constant
        # multiple of the mean, which is what made UpsideBonus inert.
        season_sd = mean_proj * var
        sd_source = "position_variance"
        # REC-1: the measured cell overrides the hand-set constant wherever one
        # was measured. `variance` is re-derived from the applied sd so the
        # board identity proj_sd == proj_mean × variance keeps holding.
        ceiling_m, ceiling_source = None, "gaussian_z"
        floor_m, floor_source = None, "gaussian_z"
        if pe is not None:
            PE, cal = pe
            rank = rank_of.get(id(p))
            sd_m, status = PE.proj_sd_for(cal, p.get("position"), rank, mean_proj)
            if status == "measured" and sd_m is not None and mean_proj > 0:
                band = PE.band_of(rank)
                season_sd = sd_m
                sd_source = "measured-2023-25-error"
                band_why = ("sd level from measured 2023-25 projection error, "
                            f"band {p.get('position')}|{band} (REC-1, applied "
                            "under Cory's ruling; PROJ-SD-DECISION-ARM.md)")
                # COMPOSE, DON'T CLOBBER — Cory's 2026-08-17 fix. Scale the
                # measured band level by this player's own multiplier relative
                # to his cell, so the cell mean is unchanged and the players
                # inside it stop being interchangeable. Gated with the ceiling
                # work: both are ungraded changes to a field engine.js reads.
                rel = None
                if cfg.get("player_spread_in_sd"):
                    cmean = _cell_mean.get((p.get("position"), band))
                    if cmean:
                        rel = _player_mult.get(id(p), 1.0) / cmean
                # THE REASONS SURVIVE UNCONDITIONALLY, and that is separate from
                # whether the sd moves. Clobbering var_why was a pure
                # information loss with no statistical claim attached to it —
                # the war room's Why? panel was left asserting a ceiling with no
                # account of why — so restoring it needs no measurement and is
                # not gated. The MAGNITUDES are a different question and they
                # are gated, because they are a claim.
                #
                # The wording distinguishes the two states on purpose. With the
                # flag off these traits are TRUE OF THE PLAYER but NOT IN THE
                # NUMBER, and a bare "spread: rookie" beside an unchanged sd
                # would imply otherwise.
                player_why = list(var_why)
                if rel:
                    season_sd = sd_m * rel
                    sd_source = "measured-band-x-player-spread"
                    var_why = [band_why] + [f"spread: {w}" for w in player_why]
                else:
                    var_why = [band_why] + [
                        f"not in the sd (modifier unmeasured): {w}"
                        for w in player_why]
                var = season_sd / mean_proj
            # THE OTHER HALF OF REC-1, WHICH WAS NEVER WIRED (found 2026-08-17).
            # `proj_sd_for` was applied above the day REC-1 landed; its sibling
            # `proj_ceiling_for` — measured, shipped, and carrying a docstring
            # that states this exact defect — was left uncalled, so the ceiling
            # went on being `mean + 1.036*sd`. That is a SYMMETRIC Gaussian over
            # a distribution the same calibration measures as violently skewed,
            # and the skew runs the opposite way in the deep bands: QB|33+ has
            # p50 0.165 and p90 1.094, so a big sd manufactures a huge ceiling
            # for players whose realized outcomes pile up near zero.
            #
            # MEASURED CONSEQUENCE of wiring it, on this board (533 rows move):
            #     band 1-3    median  +16.7      band 17-32  median  +14.7
            #     band 4-8    median  +29.6      band 33+    median   -7.5
            # The Gaussian was INVENTING upside for deep players and hiding it
            # in the early ones — which independently reproduces the barbell
            # pass's finding that anchors out-ceiling swings with zero overlap,
            # and supplies the mechanism for it.
            #
            # NONE OF THIS MOVES A RECOMMENDATION TODAY: engine.js ships
            # `ceiling: 0.0`. It is a correctness fix to the field, and the
            # question of whether the weight should come off zero is Cory's,
            # gated on the harness arm — deliberately kept separate, because
            # fixing a number and then acting on it in one step means never
            # learning which of the two did the work.
            # GATED OFF BY DEFAULT, AND NOT OUT OF TIMIDITY — proj_ceiling is
            # NOT an inert field. engine.js's bench branch ranks on
            # `proj_ceiling - proj_mean`, so changing this number changes real
            # bench recommendations even though the composite's `ceiling` WEIGHT
            # is 0.0. Landing it hot would let the nightly rebuild ship a
            # behaviour change five days before the draft with nobody having
            # graded it. Flip `use_measured_ceiling` in league_config.json to
            # turn it on — one value, same reversibility pattern as
            # opportunity_cap.
            if cfg.get("use_measured_ceiling"):
                cm, cstatus = PE.proj_ceiling_for(cal, p.get("position"), rank, mean_proj)
                if cstatus == "measured" and cm is not None and mean_proj > 0:
                    ceiling_m, ceiling_source = cm, "measured-2023-25-p90"
                # THE FLOOR HAS THE SAME DEFECT AND IT IS WORSE. `mean - 0.674*sd`
                # is a symmetric Gaussian over an asymmetric distribution, wrong by
                # more than 0.15 of the projection in 16 of 20 measured cells. The
                # deep bands are not close: WR|33+ is told his floor is 0.656 x
                # projection against a measured 10th percentile of 0.049, and
                # QB|33+ 0.584 against -0.001. Since the same formula also inflated
                # their ceilings, the board flattered deep players on BOTH tails —
                # which is precisely what makes a late flier look like a free roll.
                # Rides the same flag: one construction, one defect, one switch.
                fm, fstatus = PE.proj_floor_for(cal, p.get("position"), rank, mean_proj)
                if fstatus == "measured" and fm is not None and mean_proj > 0:
                    floor_m, floor_source = fm, "measured-2023-25-p10"

        p["proj_baseline"] = round(base, 2)
        p["opportunity_z"] = round(z.get(pid, 0.0), 2)
        p["opportunity_adj"] = round(adj, 4)
        p["proj_mean"] = round(mean_proj, 2)
        # max(0, ...) stays: a negative floor is not a football outcome. Note the
        # measured p10 for QB|33+ is itself -0.001, i.e. the clamp is doing real
        # work rather than decorating.
        p["proj_floor"] = round(max(0.0, floor_m if floor_m is not None
                                    else mean_proj + FLOOR_Z * season_sd), 2)
        p["proj_floor_source"] = floor_source
        # Absent stays absent: an unmeasured band keeps the Gaussian rather than
        # silently receiving a filled-in p90, and `proj_ceiling_source` is how a
        # consumer tells the two apart — the same rule proj_sd_source follows,
        # and the rule whose absence let `0.25 * proj_mean` reach the board once.
        p["proj_ceiling"] = round(
            ceiling_m if ceiling_m is not None else mean_proj + CEILING_Z * season_sd, 2)
        p["proj_ceiling_source"] = ceiling_source
        p["proj_sd"] = round(season_sd, 2)
        p["proj_sd_source"] = sd_source
        p["variance"] = round(var, 4)
        p["variance_why"] = var_why
        p["weekly_sd"] = round(season_sd / (games ** 0.5), 2)
        p["games_expected"] = games
        # EVERY COMPUTED OPPORTUNITY FIELD IS RETAINED (2026-08-17). This block
        # used to write THREE of the NINE that opportunity_metrics computes, so
        # air_yards_share, adot, rz_targets, carries, gl_carries and rz_share
        # were derived from play-by-play, consumed inside composite_z, and then
        # dropped at the board's edge — 0 of 682 rows.
        #
        # The most expensive one is rz_share. Because it never reached an
        # artifact, opportunity_inheritance_2026-08-17.md had to report that
        # "red-zone vacancy is not measured at all" and drop that arm. It WAS
        # measured. It was not kept. Retaining it costs nothing and is the
        # difference between a study that can run and one that cannot.
        #
        # ABSENT STAYS ABSENT: a player with no play-by-play row gets None on
        # every field rather than 0.0, because a rookie with no NFL snaps and a
        # veteran measured at exactly zero share are different facts. (The three
        # legacy fields keep their 0.0-when-present behaviour so no existing
        # consumer changes; only their absence is now honest.)
        m = metrics.get(pid, {})
        p["wopr"] = round(m.get("wopr", 0.0), 3) if m else None
        p["target_share"] = round(m.get("target_share", 0.0), 3) if m else None
        p["opportunity_share"] = round(m.get("opportunity_share", 0.0), 3) if m else None
        for _k, _nd in (("air_yards_share", 3), ("adot", 2), ("rz_share", 3),
                        ("rz_targets", 2), ("carries", 2), ("gl_carries", 2)):
            _v = m.get(_k) if m else None
            p[_k] = round(float(_v), _nd) if _v is not None else None
    return players


def _rank_fallback(p: dict) -> float:
    """No projection anywhere: decay off ADP so the board still ranks sensibly."""
    adp = p.get("raw_adp") or 200
    base = {"QB": 320, "RB": 270, "WR": 260, "TE": 190, "K": 130, "DEF": 120}.get(p["position"], 200)
    return max(20.0, base * (1.0 - 0.0035 * float(adp)))
