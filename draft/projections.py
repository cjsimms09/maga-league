"""Module 2 — projection engine.

Projections are not built from scratch. A consensus baseline is converted to
*our* scoring, then nudged by opportunity metrics that consensus reacts to
slowly — target share, air yards, red-zone work, snap share. The nudge is capped
because opportunity is a leading indicator, not a projection.
"""
from __future__ import annotations
from statistics import mean, pstdev

from scoring import score_stat_line

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
    """Convert provider stat-line projections into our league's points."""
    out = {}
    for pid, line in (raw or {}).items():
        stats = line.get("stats") if isinstance(line, dict) and "stats" in line else line
        if not isinstance(stats, dict):
            continue
        out[str(pid)] = score_stat_line(stats, scoring)
    return out


def opportunity_metrics(pbp, weekly, seasons: list[int], weights: list[float]) -> dict[str, dict]:
    """Recency-weighted opportunity composite per player from nflfastR data.

    Returns {player_id: {wopr, target_share, air_yards_share, adot,
                         opportunity_share, rz_share, snap_share, xfp_delta}}.
    Tolerates missing columns — feeds change shape between seasons.
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


def blend(players: list[dict], baseline: dict[str, float], metrics: dict[str, dict],
          cfg: dict) -> list[dict]:
    """Apply the capped opportunity adjustment and derive floor/ceiling."""
    cap = float(cfg.get("opportunity_cap", 0.15))
    z = composite_z(metrics, players) if metrics else {}

    for p in players:
        pid = str(p["player_id"])
        base = baseline.get(pid)
        if base is None:
            base = p.get("proj_mean") or _rank_fallback(p)
        # A z of +2 earns the full cap; linear in between, clamped both ways.
        adj = max(-cap, min(cap, (z.get(pid, 0.0) / 2.0) * cap))
        mean_proj = base * (1 + adj)

        var, var_why = player_variance(p, metrics.get(pid) if metrics else None)
        games = EXPECTED_GAMES.get(p["position"], 15.0)
        # Season sd is mean × the player's own volatility. Keeping this
        # per-player is what stops ceiling - mean collapsing into a constant
        # multiple of the mean, which is what made UpsideBonus inert.
        season_sd = mean_proj * var

        p["proj_baseline"] = round(base, 2)
        p["opportunity_z"] = round(z.get(pid, 0.0), 2)
        p["opportunity_adj"] = round(adj, 4)
        p["proj_mean"] = round(mean_proj, 2)
        p["proj_floor"] = round(max(0.0, mean_proj + FLOOR_Z * season_sd), 2)
        p["proj_ceiling"] = round(mean_proj + CEILING_Z * season_sd, 2)
        p["proj_sd"] = round(season_sd, 2)
        p["variance"] = round(var, 4)
        p["variance_why"] = var_why
        p["weekly_sd"] = round(season_sd / (games ** 0.5), 2)
        p["games_expected"] = games
        m = metrics.get(pid, {})
        p["wopr"] = round(m.get("wopr", 0.0), 3) if m else None
        p["target_share"] = round(m.get("target_share", 0.0), 3) if m else None
        p["opportunity_share"] = round(m.get("opportunity_share", 0.0), 3) if m else None
    return players


def _rank_fallback(p: dict) -> float:
    """No projection anywhere: decay off ADP so the board still ranks sensibly."""
    adp = p.get("raw_adp") or 200
    base = {"QB": 320, "RB": 270, "WR": 260, "TE": 190, "K": 130, "DEF": 120}.get(p["position"], 200)
    return max(20.0, base * (1.0 - 0.0035 * float(adp)))
