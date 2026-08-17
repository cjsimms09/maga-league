# TERRITORY: A
"""OPPORTUNITY INHERITANCE — does inherited volume predict the breakout?

Preregistration: draft/audit/opportunity_inheritance_2026-08-17.md, commit
f4ed0c05, committed BEFORE this module existed. Every constant, arm, threshold
and bar below is quoted from it.

Two mechanisms, deliberately kept apart:

  REALIZED VACANCY  — a player left; the volume is on the table (sections 3-4
                      of the prereg).
  CONTINGENT VACANCY — the starter is still there; if he misses time someone
                      inherits (section 5). Cory's "injury opportunity".

Nothing here reimplements conditional_value.py's handcuff premium or
tiered_outcome_model.py's cell, labels, market ordering or hits@k machinery —
both are imported read-only.

Run:  python3 draft/backtest/opportunity_inheritance.py
"""
from __future__ import annotations

import collections
import json
import math
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

import tiered_outcome_model as T  # noqa: E402  (the cell, labels, market, hits@k)
import conditional_value as CV    # noqa: E402  (handcuff_premium, read-only)

OUT = HERE / "opportunity_inheritance.json"

# ── PREREGISTERED CONSTANTS (prereg sections 3, 4, 5, 6) ────────────────────
POSITIONS = T.POSITIONS
LAST_WEEK = T.LAST_SCORED_WEEK                 # 17
TEST_SEASONS = T.TEST_SEASONS                  # (2023, 2024, 2025)
LATE_ROUND_FIRST_PICK = T.LATE_ROUND_FIRST_PICK  # 61
BOOTSTRAP_DRAWS = 2000
SEED = 20260817
FDR_Q = 0.10
YOUNG_MAX_EXP = 2            # prereg 4.3: young = 1[nfl_exp <= 2]
MISS_THRESHOLD = 4           # prereg 5.1 / 5.2: "missed >= 4 team games"
LOW_MISS_MAX = 1             # prereg 5.1: the "missed 0-1" comparison arm
INSEASON_GAP = 4             # prereg 3.2: V-INSEASON's ">= 4 team games before"
VACANCY_ARMS = ("V_ALL", "V_MOVED", "V_INSEASON")
PRIMARY_ARM = "V_ALL"
QUARANTINED_ARMS = ("V_ALL", "V_MOVED")        # prereg GAP C

# The bar (prereg 6.2). Reproduced here so the module states it, not just the doc.
BAR_CHANCE_AT_10 = 3.71
BAR_MARKET_AT_10 = 7


# ── store access ────────────────────────────────────────────────────────────
_STORES: dict = {}


def _comp(season: int) -> dict:
    key = ("comp", season)
    if key not in _STORES:
        _STORES[key] = json.loads(
            (HERE / f"component_stats_{season}.json").read_text())
    return _STORES[key]


def _adv(season: int) -> dict:
    key = ("adv", season)
    if key not in _STORES:
        _STORES[key] = json.loads(
            (HERE / f"advanced_stats_{season}.json").read_text())
    return _STORES[key]


def season_shape(season: int) -> dict:
    """Everything one season's stores say about WHO played WHERE, WHEN and HOW
    MUCH.  Presence is taken from the component store for every season, never
    from nflverse_weekly_points (prereg GAP E)."""
    key = ("shape", season)
    if key in _STORES:
        return _STORES[key]

    air: dict = {}
    for w in _adv(season)["weeks"]:
        if int(w["week"]) > LAST_WEEK:
            continue
        for pid, row in w["players"].items():
            air[(pid, int(w["week"]))] = float(row.get("rec_air_yd", 0.0) or 0.0)

    vol: dict = collections.defaultdict(lambda: collections.Counter())
    weeks_on_team: dict = collections.defaultdict(set)
    team_weeks: dict = collections.defaultdict(set)
    pos_votes: dict = collections.defaultdict(collections.Counter)
    team_votes: dict = collections.defaultdict(collections.Counter)

    for w in _comp(season)["weeks"]:
        week = int(w["week"])
        if week > LAST_WEEK:
            continue
        for pid, row in w["players"].items():
            team = row.get("team")
            if not team:
                continue
            k = (pid, team)
            vol[k]["tgt"] += float(row.get("tgt", 0.0) or 0.0)
            vol[k]["rush_att"] += float(row.get("rush_att", 0.0) or 0.0)
            vol[k]["pass_att"] += float(row.get("pass_att", 0.0) or 0.0)
            vol[k]["air_yd"] += air.get((pid, week), 0.0)
            vol[k]["games"] += 1
            weeks_on_team[k].add(week)
            team_weeks[team].add(week)
            if row.get("pos") in POSITIONS:
                pos_votes[pid][row["pos"]] += 1
            team_votes[pid][team] += 1

    shape = {
        "season": season,
        "vol": {k: dict(v) for k, v in vol.items()},
        "weeks_on_team": {k: sorted(v) for k, v in weeks_on_team.items()},
        "team_weeks": {t: sorted(v) for t, v in team_weeks.items()},
        "pos": {pid: max(sorted(c), key=lambda p: (c[p], p))
                for pid, c in pos_votes.items()},
        "modal_team": {pid: max(sorted(c), key=lambda t: (c[t], t))
                       for pid, c in team_votes.items()},
        "pids": set(team_votes),
    }
    _STORES[key] = shape
    return shape


def games_played(shape: dict, pid: str) -> int:
    return len({w for (p, _t), ws in shape["weeks_on_team"].items() if p == pid
                for w in ws})


def team_game_count(shape: dict, team: str) -> int:
    return len(shape["team_weeks"].get(team, []))


# ── prereg 3.1 / 3.2 — THE DEPARTURE INFERENCE RULE, three arms ─────────────
def departures(season: int, arm: str) -> set:
    """{(pid, team)} pairs whose season Y-1 volume for that team is VACATED
    going into season Y, under one of the three preregistered arms.

    THE RULE (prereg 3.1): q departed T for Y iff q recorded >=1 component row
    for T in weeks 1-17 of Y-1 AND zero component rows for T in weeks 1-17 of Y.

    Its failure modes are the reason there are three arms (prereg 3.2):
      V_ALL      — every clause counts.  Most complete, most exposed to the
                   "missed all of season Y through injury" leak.  QUARANTINED.
      V_MOVED    — only a player who appears in season Y for a DIFFERENT team.
                   Removes the injury leak entirely; under-counts retirements.
                   QUARANTINED.
      V_INSEASON — no season-Y byte is read at all.  q's Y-1 volume for T is
                   vacated iff his last row for T came >= INSEASON_GAP team
                   games before T's last Y-1 game.  Blind to every offseason
                   departure, which is most of them.
    """
    if arm not in VACANCY_ARMS:
        raise ValueError(f"unknown vacancy arm {arm!r}; expected {VACANCY_ARMS}")
    prev = season_shape(season - 1)

    if arm == "V_INSEASON":
        out = set()
        for (pid, team), weeks in prev["weeks_on_team"].items():
            tw = prev["team_weeks"].get(team, [])
            if not tw:
                continue
            last_team_week = max(tw)
            remaining = [w for w in tw if w > max(weeks)]
            if len(remaining) >= INSEASON_GAP and max(weeks) < last_team_week:
                out.add((pid, team))
        return out

    cur = season_shape(season)
    out = set()
    for (pid, team) in prev["weeks_on_team"]:
        still_here = (pid, team) in cur["weeks_on_team"]
        if still_here:
            continue
        anywhere = pid in cur["pids"]
        if arm == "V_ALL" or anywhere:
            out.add((pid, team))
    return out


def departure_breakdown(season: int) -> dict:
    """The four real events behind clause 'zero rows for T in Y' (prereg 3.2),
    counted so the rule's ambiguity is a number rather than a caveat."""
    prev, cur = season_shape(season - 1), season_shape(season)
    moved = absent = stayed = 0
    for (pid, team) in prev["weeks_on_team"]:
        if (pid, team) in cur["weeks_on_team"]:
            stayed += 1
        elif pid in cur["pids"]:
            moved += 1
        else:
            absent += 1
    return {"stayed": stayed, "moved_teams": moved,
            "absent_from_season_entirely": absent,
            "note": ("absent_from_season_entirely conflates retirement, a "
                     "season-long injury, and never taking an offensive snap. "
                     "A player who missed season Y through injury is NOT a "
                     "departure and this rule cannot tell him apart — which is "
                     "why arm V_MOVED exists.")}


# ── prereg 3.3 — vacated quantities per team ────────────────────────────────
VOL_KEYS = ("tgt", "rush_att", "pass_att", "air_yd")


def team_vacancy(season: int, arm: str) -> dict:
    """{team: {vac_*, tot_*, vac_*_share}} for season Y, from weeks 1-17 of Y-1.

    RED-ZONE VACANCY IS NOT COMPUTED — no committed store carries a red-zone or
    goal-line split (prereg GAP A).  It is absent, not proxied by touchdowns.
    """
    prev = season_shape(season - 1)
    gone = departures(season, arm)
    tot: dict = collections.defaultdict(lambda: collections.Counter())
    vac: dict = collections.defaultdict(lambda: collections.Counter())
    for (pid, team), v in prev["vol"].items():
        for k in VOL_KEYS:
            tot[team][k] += v.get(k, 0.0)
            if (pid, team) in gone:
                vac[team][k] += v.get(k, 0.0)
    out = {}
    for team in sorted(tot):
        row = {f"tot_{k}": round(tot[team][k], 2) for k in VOL_KEYS}
        row.update({f"vac_{k}": round(vac[team][k], 2) for k in VOL_KEYS})
        for k in VOL_KEYS:
            denom = tot[team][k]
            row[f"vac_{k}_share"] = round(vac[team][k] / denom, 4) if denom else 0.0
        opp_t = tot[team]["tgt"] + tot[team]["rush_att"]
        opp_v = vac[team]["tgt"] + vac[team]["rush_att"]
        row["vac_opp"] = round(opp_v, 2)
        row["tot_opp"] = round(opp_t, 2)
        row["vac_opp_share"] = round(opp_v / opp_t, 4) if opp_t else 0.0
        out[team] = row
    return out


# ── prereg 3.4 — the inheritor side ─────────────────────────────────────────
def _pos_currency(pos: str) -> tuple:
    """The volume a position actually consumes."""
    if pos == "QB":
        return ("pass_att",)
    if pos == "RB":
        return ("rush_att", "tgt")
    return ("tgt",)


def depth_table(season_minus_1: int) -> dict:
    """{(team, pos): [(pid, opportunity)] ranked desc} from season Y-1 alone.

    THIS IS A PROXY, NOT A DEPTH CHART (prereg GAP B): no historical NFL depth
    chart is committed to this repo; `depth_chart_order` exists only on the 2026
    board.  Rank 1 = the team's Y-1 volume leader at that position.
    """
    prev = season_shape(season_minus_1)
    buckets: dict = collections.defaultdict(list)
    for (pid, team), v in prev["vol"].items():
        pos = prev["pos"].get(pid)
        if pos not in POSITIONS:
            continue
        opp = sum(v.get(k, 0.0) for k in _pos_currency(pos))
        buckets[(team, pos)].append((pid, opp))
    return {k: sorted(rows, key=lambda r: (-r[1], r[0]))
            for k, rows in buckets.items()}


def draft_capital() -> dict:
    """{sleeper_id: {season, round, overall}} from the period-correct store.
    A player with no record is ABSENT, never imputed (prereg GAP F)."""
    doc = json.loads((HERE / "nflverse_draft_picks.json").read_text())
    out = {}
    for p in doc["picks"]:
        sid = p.get("sleeper_id")
        if sid:
            out[str(sid)] = {"draft_season": int(p["season"]),
                             "draft_round": int(p["round"]),
                             "draft_overall": int(p["pick"]),
                             "name": p.get("name")}
    return out


def inheritance_features(season: int, arm: str, capital: dict) -> dict:
    """{pid: features} for season Y, everything from <= Y-1 except where the
    arm is quarantined (prereg GAP C) — and the team ASSIGNMENT is always the
    leak-free Y-1 modal team (prereg GAP D: wrong for ~29% of players)."""
    prev = season_shape(season - 1)
    vac = team_vacancy(season, arm)
    depth = depth_table(season - 1)
    gone = departures(season, arm)

    feats = {}
    for pid, pos in prev["pos"].items():
        if pos not in POSITIONS:
            continue
        team = prev["modal_team"].get(pid)
        if not team:
            continue
        ranked = depth.get((team, pos), [])
        order = [p for p, _o in ranked]
        rank = order.index(pid) + 1 if pid in order else len(order) + 1
        currency = _pos_currency(pos)

        above_gone = 0.0
        above_present = 0.0
        for other, opp in ranked:
            if other == pid:
                break
            if (other, team) in gone:
                above_gone += opp
            else:
                above_present += opp

        own = sum(prev["vol"].get((pid, team), {}).get(k, 0.0) for k in currency)
        pos_total = sum(o for _p, o in ranked) or 1.0
        cap = capital.get(pid)
        feats[pid] = {
            "pos": pos,
            "team_proxy": team,
            "depth_proxy": rank,
            "own_opp_y1": round(own, 2),
            "own_share_y1": round(own / pos_total, 4),
            "open_above": round(above_gone, 2),
            "open_above_share": round(above_gone / pos_total, 4),
            "open_above_present": round(above_present, 2),
            "vac_opp_share": vac.get(team, {}).get("vac_opp_share", 0.0),
            "vac_tgt_share": vac.get(team, {}).get("vac_tgt_share", 0.0),
            "vac_air_yd_share": vac.get(team, {}).get("vac_air_yd_share", 0.0),
            "games_y1": games_played(prev, pid),
            "team_games_y1": team_game_count(prev, team),
            "nfl_exp": (season - cap["draft_season"]) if cap else None,
            "draft_round": cap["draft_round"] if cap else None,
            "draft_overall": cap["draft_overall"] if cap else None,
        }
        feats[pid]["missed_y1"] = max(
            0, feats[pid]["team_games_y1"] - feats[pid]["games_y1"])
    return feats


# ── statistics ──────────────────────────────────────────────────────────────
def _rng():
    return np.random.default_rng(SEED)


def spearman_clustered(pairs_by_season: dict, draws: int = BOOTSTRAP_DRAWS):
    """Pooled Spearman with a SEASON-CLUSTERED bootstrap 95% interval: resample
    seasons with replacement, then players within season (prereg 4, inheriting
    empirical_draft_value section 2.3)."""
    seasons = sorted(pairs_by_season)
    xs, ys = [], []
    for s in seasons:
        a, b = pairs_by_season[s]
        xs.extend(a)
        ys.extend(b)
    n = len(xs)
    if n < 12:
        return {"status": "insufficient_n", "n": n}
    point = T.spearman(xs, ys)
    arrs = {s: (np.asarray(pairs_by_season[s][0], dtype=float),
                np.asarray(pairs_by_season[s][1], dtype=float))
            for s in seasons}
    rng = _rng()
    vals = np.empty(draws)
    for d in range(draws):
        pick = rng.integers(0, len(seasons), len(seasons))
        ax, ay = [], []
        for i in pick:
            a, b = arrs[seasons[i]]
            m = len(a)
            idx = rng.integers(0, m, m)
            ax.append(a[idx])
            ay.append(b[idx])
        vals[d] = T.spearman(np.concatenate(ax), np.concatenate(ay))
    lo, hi = np.percentile(vals[~np.isnan(vals)], [2.5, 97.5])
    per_season = {s: T.spearman(*pairs_by_season[s])
                  if len(pairs_by_season[s][0]) >= 8 else None
                  for s in seasons}
    signs = [np.sign(v) for v in per_season.values() if v is not None and v == v]
    stable = bool(signs) and max(signs.count(1.0), signs.count(-1.0)) >= 2
    return {"status": "measured", "n": n, "rho": round(float(point), 4),
            "ci95": [round(float(lo), 4), round(float(hi), 4)],
            "excludes_zero": bool(lo > 0 or hi < 0),
            "per_season": {str(s): (round(float(v), 4) if v is not None and v == v
                                    else None) for s, v in per_season.items()},
            "same_sign_in_2of3": stable,
            "finding": bool((lo > 0 or hi < 0) and stable)}


def benjamini_hochberg(pvals: dict, q: float = FDR_Q) -> dict:
    """BH FDR across the whole family of univariate tests (prereg 4)."""
    items = [(k, v) for k, v in pvals.items() if v is not None and v == v]
    m = len(items)
    if not m:
        return {}
    items.sort(key=lambda kv: kv[1])
    passed = set()
    for i, (k, p) in enumerate(items, start=1):
        if p <= q * i / m:
            passed = {kk for kk, _ in items[:i]}
    return {k: (k in passed) for k, _ in items}


def spearman_pvalue(rho: float, n: int) -> float:
    """Two-sided p from the t approximation; used ONLY to order the BH family."""
    if n < 4 or rho is None or rho != rho or abs(rho) >= 1.0:
        return float("nan")
    t = rho * math.sqrt((n - 2) / max(1e-12, 1 - rho * rho))
    # survival of |t| under t_{n-2}, via the normal approximation for n >= 30
    # and an exact-enough incomplete-beta otherwise.
    df = n - 2
    x = df / (df + t * t)
    return _betainc(df / 2.0, 0.5, x)


def _betainc(a: float, b: float, x: float) -> float:
    """Regularised incomplete beta I_x(a, b) by continued fraction (Lentz)."""
    if x <= 0:
        return 0.0
    if x >= 1:
        return 1.0
    lbeta = (math.lgamma(a) + math.lgamma(b) - math.lgamma(a + b))
    front = math.exp(math.log(x) * a + math.log(1 - x) * b - lbeta) / a
    if x > (a + 1) / (a + b + 2):
        return 1.0 - _betainc(b, a, 1 - x)
    f, c, d = 1.0, 1.0, 0.0
    for i in range(0, 300):
        m = i // 2
        if i == 0:
            num = 1.0
        elif i % 2 == 0:
            num = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m))
        else:
            num = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1))
        d = 1.0 + num * d
        d = 1e-30 if abs(d) < 1e-30 else d
        d = 1.0 / d
        c = 1.0 + num / c
        c = 1e-30 if abs(c) < 1e-30 else c
        f *= c * d
        if abs(1.0 - c * d) < 1e-10:
            break
    return front * (f - 1.0)


def wilson(k: int, n: int):
    if n <= 0:
        return None
    lo, hi = T.wilson(k, n, z=1.96)
    return {"k": int(k), "n": int(n), "rate": round(k / n, 4),
            "ci95": [round(lo, 4), round(hi, 4)]}


def ols_standardized(rows: list, xnames: list, yname: str,
                     draws: int = BOOTSTRAP_DRAWS):
    """Standardized-coefficient OLS with a season-clustered bootstrap CI."""
    usable = [r for r in rows
              if all(r.get(n) is not None and r[n] == r[n] for n in xnames + [yname])]
    if len(usable) < 5 * (len(xnames) + 1):
        return {"status": "insufficient_n", "n": len(usable)}

    def fit(sample):
        X = np.array([[float(r[n]) for n in xnames] for r in sample], dtype=float)
        y = np.array([float(r[yname]) for r in sample], dtype=float)
        mu, sd = X.mean(0), X.std(0)
        sd[sd == 0] = 1.0
        Xs = np.hstack([np.ones((len(X), 1)), (X - mu) / sd])
        beta, *_ = np.linalg.lstsq(Xs, y, rcond=None)
        return beta[1:]

    point = fit(usable)
    by_season: dict = collections.defaultdict(list)
    for r in usable:
        by_season[r["season"]].append(r)
    seasons = sorted(by_season)
    rng = _rng()
    boot = np.empty((draws, len(xnames)))
    boot[:] = np.nan
    for d in range(draws):
        pick = rng.integers(0, len(seasons), len(seasons))
        sample = []
        for i in pick:
            pool = by_season[seasons[i]]
            idx = rng.integers(0, len(pool), len(pool))
            sample.extend(pool[j] for j in idx)
        try:
            boot[d] = fit(sample)
        except np.linalg.LinAlgError:
            continue
    out = {"status": "measured", "n": len(usable), "coefficients": {}}
    for j, name in enumerate(xnames):
        col = boot[:, j]
        col = col[~np.isnan(col)]
        if col.size < draws // 10:
            out["coefficients"][name] = {"status": "unstable"}
            continue
        lo, hi = np.percentile(col, [2.5, 97.5])
        out["coefficients"][name] = {
            "beta": round(float(point[j]), 4),
            "ci95": [round(float(lo), 4), round(float(hi), 4)],
            "excludes_zero": bool(lo > 0 or hi < 0)}
    return out


# ── the population ──────────────────────────────────────────────────────────
def population(season: int, arm: str, capital: dict) -> tuple:
    """The shared population (tiered_outcome_model's, so the graded cell is
    identical), joined to the inheritance features."""
    rows, diag = T._rows_for_season(season, T.K_SLOTS, survivorship_zero=False)
    feats = inheritance_features(season, arm, capital)
    market = T._market(season)
    out = []
    for r in rows:
        f = feats.get(r["pid"])
        if f is None:
            continue
        rec = dict(r)
        rec.update({k: v for k, v in f.items() if k != "pos"})
        rec["open_above_total"] = f["open_above"] + f["open_above_present"]
        rec["market_pick"] = market.get(r["pid"])
        rec["is_winner"] = bool(r["tier"] == T.LEAGUE_WINNER)
        rec["resid_vs_naive"] = r["realized"] - r["pts_y1"]
        rec["young"] = (1.0 if (f["nfl_exp"] is not None
                                and f["nfl_exp"] <= YOUNG_MAX_EXP) else
                        (0.0 if f["nfl_exp"] is not None else None))
        out.append(rec)
    diag["joined_to_inheritance_features"] = len(out)
    return out, diag


# ── section 4 — does inherited opportunity predict the breakout? ─────────────
H1_FEATURES = ("open_above", "open_above_share", "vac_opp_share",
               "vac_tgt_share", "vac_air_yd_share", "own_share_y1",
               # THE NEGATIVE CONTROLS.  open_above is mechanically large
               # exactly when the player had little volume himself, and
               # own_share_y1 predicts DECLINE (mean reversion).  If
               # open_above_PRESENT -- the volume above him held by men who
               # STAYED -- predicts the residual just as well, then the word
               # "vacated" is doing no work and the effect is nothing but
               # "buried players regress upward".
               "open_above_present", "open_above_total")
H1_OUTCOMES = ("realized", "resid_vs_naive")


def h1_screen(rows_by_season: dict) -> dict:
    """Univariate Spearman screen, per position, both outcome arms, under BH."""
    cells, pvals = {}, {}
    for pos in POSITIONS:
        for feat in H1_FEATURES:
            for outcome in H1_OUTCOMES:
                pairs = {}
                for s, rows in rows_by_season.items():
                    xs, ys = [], []
                    for r in rows:
                        if r["pos"] != pos:
                            continue
                        v = r.get(feat)
                        if v is None or v != v:
                            continue
                        xs.append(float(v))
                        ys.append(float(r[outcome]))
                    if xs:
                        pairs[s] = (xs, ys)
                res = spearman_clustered(pairs)
                key = f"{pos}|{feat}|{outcome}"
                cells[key] = res
                if res.get("status") == "measured":
                    pvals[key] = spearman_pvalue(res["rho"], res["n"])
    bh = benjamini_hochberg(pvals)
    for key, ok in bh.items():
        cells[key]["survives_fdr_q10"] = bool(ok)
    return cells


def h2_interaction(rows_by_season: dict) -> dict:
    """THE HYPOTHESIS (prereg 4.3): is a young player entering VACATED volume
    different from a young player who is not?

    Two operationalisations, both preregistered, both reported.  The bar: the
    interaction's CI must EXCLUDE zero AND the youth main effect's CI must
    COVER zero.
    """
    rows = [dict(r, season=s) for s, rr in rows_by_season.items() for r in rr]
    with_cap = [r for r in rows if r["young"] is not None]

    # (a) regression, per position and pooled
    reg = {}
    for pos in list(POSITIONS) + ["ALL"]:
        sub = [r for r in with_cap if pos == "ALL" or r["pos"] == pos]
        for r in sub:
            r["young_x_vac"] = r["young"] * r["open_above"]
        reg[pos] = ols_standardized(
            sub, ["pts_y1", "opp_pg", "young", "open_above", "young_x_vac"],
            "resid_vs_naive")

    # (b) 2x2 contingency on LEAGUE-WINNER rate
    vals = sorted(r["open_above"] for r in with_cap)
    median = vals[len(vals) // 2] if vals else 0.0
    cells = {}
    for yg in (1.0, 0.0):
        for hi in (True, False):
            sub = [r for r in with_cap
                   if r["young"] == yg and ((r["open_above"] > median) == hi)]
            cells[f"young={int(yg)}|high_vac={int(hi)}"] = wilson(
                sum(1 for r in sub if r["is_winner"]), len(sub))

    def rate(yg, hi):
        c = cells[f"young={int(yg)}|high_vac={int(hi)}"]
        return c["rate"] if c else None

    did_point = None
    if all(rate(y, h) is not None for y in (1.0, 0.0) for h in (True, False)):
        did_point = ((rate(1.0, True) - rate(1.0, False))
                     - (rate(0.0, True) - rate(0.0, False)))

    # season-clustered bootstrap of the difference-in-differences
    by_season: dict = collections.defaultdict(list)
    for r in with_cap:
        by_season[r["season"]].append(r)
    seasons = sorted(by_season)
    rng = _rng()
    diffs = []
    for _ in range(BOOTSTRAP_DRAWS):
        pick = rng.integers(0, len(seasons), len(seasons))
        sample = []
        for i in pick:
            pool = by_season[seasons[i]]
            idx = rng.integers(0, len(pool), len(pool))
            sample.extend(pool[j] for j in idx)

        def r2(yg, hi):
            sub = [r for r in sample
                   if r["young"] == yg and ((r["open_above"] > median) == hi)]
            return (sum(1 for r in sub if r["is_winner"]) / len(sub)) if sub else None
        a, b, c, d = r2(1.0, True), r2(1.0, False), r2(0.0, True), r2(0.0, False)
        if None in (a, b, c, d):
            continue
        diffs.append((a - b) - (c - d))
    did = {"status": "unmeasurable"}
    if len(diffs) >= BOOTSTRAP_DRAWS // 10:
        lo, hi = np.percentile(diffs, [2.5, 97.5])
        did = {"status": "measured",
               "difference_in_differences": round(float(did_point), 4),
               "ci95": [round(float(lo), 4), round(float(hi), 4)],
               "excludes_zero": bool(lo > 0 or hi < 0),
               "draws_used": len(diffs)}

    verdict = _h2_verdict(reg)
    return {"regression": reg, "contingency": {
        "median_open_above": round(float(median), 2), "cells": cells,
        "difference_in_differences": did},
        "interaction_beats_youth_alone": verdict}


def _h2_verdict(reg: dict) -> dict:
    """The preregistered bar, applied mechanically."""
    out = {}
    for pos, res in reg.items():
        if res.get("status") != "measured":
            out[pos] = {"verdict": "unmeasurable", "why": res.get("status")}
            continue
        inter = res["coefficients"].get("young_x_vac", {})
        youth = res["coefficients"].get("young", {})
        if inter.get("status") == "unstable" or youth.get("status") == "unstable":
            out[pos] = {"verdict": "unmeasurable", "why": "unstable fit"}
            continue
        i_ok = bool(inter.get("excludes_zero"))
        y_ok = bool(youth.get("excludes_zero"))
        if i_ok and not y_ok:
            v = "INTERACTION BEATS YOUTH ALONE"
        elif i_ok and y_ok:
            v = "both fire — must be reconciled with the two prior nulls"
        else:
            v = "NULL — the interaction is not distinguishable from zero"
        out[pos] = {"verdict": v,
                    "interaction": inter, "youth_main_effect": youth}
    return out


def negative_control(h1: dict) -> dict:
    """Does the word "VACATED" do any work?

    open_above (volume above him held by men who LEFT) is compared against
    open_above_present (held by men who STAYED) and open_above_total (all of it,
    departure-blind).  If the departure-blind version predicts the residual at
    least as well, then nothing is being learned about vacancy — only that
    buried players regress upward, which own_share_y1's negative rho already
    says.  Verdict is mechanical, not narrated.
    """
    out = {}
    for arm, cells in h1.items():
        for pos in POSITIONS:
            def rho(feat):
                c = cells.get(f"{pos}|{feat}|resid_vs_naive", {})
                return c.get("rho") if c.get("status") == "measured" else None
            dep, stay, tot = (rho("open_above"), rho("open_above_present"),
                              rho("open_above_total"))
            if None in (dep, stay, tot):
                out[f"{arm}|{pos}"] = {"status": "unmeasurable"}
                continue
            beaten = tot >= dep
            out[f"{arm}|{pos}"] = {
                "departed_volume_above_him": dep,
                "PRESENT_volume_above_him": stay,
                "all_volume_above_him_departure_blind": tot,
                "departure_blind_matches_or_beats_it": bool(beaten),
                "verdict": ("VACANCY ADDS NOTHING — the departure-blind measure "
                            "predicts at least as well" if beaten else
                            "vacancy carries something the departure-blind "
                            "measure does not")}
    n = sum(1 for v in out.values() if v.get("departure_blind_matches_or_beats_it"))
    m = sum(1 for v in out.values() if v.get("status") != "unmeasurable")
    out["_summary"] = {
        "cells_where_departure_blind_wins_or_ties": n, "cells_measured": m,
        "verdict": ("THE WORD 'VACATED' DOES NO WORK" if n == m else
                    "vacancy survives its own negative control in some cells")}
    return out


# ── section 5 — CONTINGENT VACANCY ──────────────────────────────────────────
def b1_absence_forecastable(capital: dict) -> dict:
    """Is a STARTER's absence risk forecastable at draft time? (prereg 5.1)

    Not a re-derivation of empirical_draft_value's availability persistence
    (RB .274 / WR .243 / TE .310 / QB noise) — this is the decision-relevant
    form a Spearman does not give you: the conditional probability of missing
    >= 4 games next season given last season's absence.
    """
    out = {}
    for pos in POSITIONS:
        hi_k = hi_n = lo_k = lo_n = 0
        per_season = {}
        rows = []
        for season in TEST_SEASONS:
            prev, cur = season_shape(season - 1), season_shape(season)
            feats = inheritance_features(season, PRIMARY_ARM, capital)
            s_hi_k = s_hi_n = s_lo_k = s_lo_n = 0
            for pid, f in feats.items():
                if f["pos"] != pos or f["depth_proxy"] != 1:
                    continue
                if pid not in cur["pids"]:
                    continue           # absent != zero: no season-Y row at all
                team_y = cur["modal_team"].get(pid)
                tg = team_game_count(cur, team_y) if team_y else 0
                if tg == 0:
                    continue
                missed_y = max(0, tg - games_played(cur, pid))
                rows.append((f["missed_y1"], missed_y))
                if f["missed_y1"] >= MISS_THRESHOLD:
                    s_hi_n += 1
                    s_hi_k += int(missed_y >= MISS_THRESHOLD)
                elif f["missed_y1"] <= LOW_MISS_MAX:
                    s_lo_n += 1
                    s_lo_k += int(missed_y >= MISS_THRESHOLD)
            per_season[str(season)] = {
                "high_prior_absence": wilson(s_hi_k, s_hi_n),
                "low_prior_absence": wilson(s_lo_k, s_lo_n)}
            hi_k += s_hi_k; hi_n += s_hi_n; lo_k += s_lo_k; lo_n += s_lo_n
        hi, lo = wilson(hi_k, hi_n), wilson(lo_k, lo_n)
        diff = None
        if hi and lo:
            rng = _rng()
            draws = []
            for _ in range(BOOTSTRAP_DRAWS):
                a = rng.binomial(hi_n, hi_k / hi_n) / hi_n if hi_n else None
                b = rng.binomial(lo_n, lo_k / lo_n) / lo_n if lo_n else None
                if a is not None and b is not None:
                    draws.append(a - b)
            if draws:
                l95, h95 = np.percentile(draws, [2.5, 97.5])
                diff = {"difference": round(hi["rate"] - lo["rate"], 4),
                        "ci95": [round(float(l95), 4), round(float(h95), 4)],
                        "excludes_zero": bool(l95 > 0 or h95 < 0)}
        out[pos] = {
            "P_miss4_given_missed4_last_year": hi,
            "P_miss4_given_missed_0or1_last_year": lo,
            "difference": diff,
            "per_season": per_season,
            "forecastable": bool(diff and diff["excludes_zero"]),
            "rule": ("prereg 5.1: where the difference's CI covers zero, "
                     "absence is NOT forecastable at that position and no "
                     "contingent-opportunity model can be built there."),
        }
    return out


def b1_benching_confound(capital: dict) -> dict:
    """B1's QB arm is the only one that fires, and QB is exactly where "missed
    games" most likely means BENCHED rather than injured.  The stores cannot
    tell them apart (prereg GAP: DATA-INVENTORY's injuries/snap-counts are not
    committed), but they CAN say whether another quarterback on the same team
    covered every missed week — which is what a benching looks like and what a
    mid-season injury usually also looks like at other positions only partly.

    Reported so the QB result is read with it, not without it.
    """
    out = {}
    for season in TEST_SEASONS:
        cur = season_shape(season)
        feats = inheritance_features(season, PRIMARY_ARM, capital)
        covered = partial = 0
        for pid, f in feats.items():
            if f["pos"] != "QB" or f["depth_proxy"] != 1 or pid not in cur["pids"]:
                continue
            team = cur["modal_team"].get(pid)
            tg = team_game_count(cur, team) if team else 0
            if tg == 0:
                continue
            missed = tg - games_played(cur, pid)
            if missed < MISS_THRESHOLD:
                continue
            mine = set(cur["weeks_on_team"].get((pid, team), []))
            others = [p for (p, t), _w in cur["weeks_on_team"].items()
                      if t == team and p != pid and cur["pos"].get(p) == "QB"]
            cover = max((len(set(cur["weeks_on_team"][(p, team)]) - mine)
                         for p in others), default=0)
            if cover >= missed:
                covered += 1
            else:
                partial += 1
        out[str(season)] = {"another_qb_covered_every_missed_week": covered,
                            "partial_or_no_cover": partial}
    tot_c = sum(v["another_qb_covered_every_missed_week"] for v in out.values())
    tot_p = sum(v["partial_or_no_cover"] for v in out.values())
    out["pooled"] = {
        "another_qb_covered_every_missed_week": tot_c,
        "partial_or_no_cover": tot_p,
        "share_fully_covered": round(tot_c / (tot_c + tot_p), 4) if tot_c + tot_p else None,
        "reading": ("a fully-covered absence is indistinguishable from a "
                    "BENCHING. Where that share is large, B1's QB result is a "
                    "performance signal wearing an availability costume, and "
                    "is NOT evidence that injury risk is forecastable."),
    }
    return out


def r1_team_concentration(capital: dict, arm: str) -> dict:
    """R1 scores a TEAM, so every player on the same team ties.  Taking its top
    10 is therefore a bet on a handful of teams, not a ranking of ten players —
    stated with the count so its hits@10 is read for what it is."""
    out = {}
    for season in TEST_SEASONS:
        rows, _ = population(season, arm, capital)
        cell = [r for r in rows if r["market_pick"]
                and r["market_pick"] >= LATE_ROUND_FIRST_PICK]
        top = sorted(cell, key=lambda r: -r["vac_opp_share"])[:10]
        teams = collections.Counter(r["team_proxy"] for r in top)
        out[str(season)] = {"distinct_teams_in_top_10": len(teams),
                            "teams": dict(teams),
                            "hits": sum(1 for r in top if r["is_winner"])}
    return out


def b2_inheritor_identifiable(capital: dict) -> dict:
    """Is the INHERITOR identifiable in advance? (prereg 5.2)

    For every (team, position, season) whose Y-1 leader missed >= 4 of his
    team's Y games, was the man who actually absorbed the volume the one the
    Y-1 depth proxy named at rank 2?  Chance is computed per cell from the real
    number of eligible bodies, never assumed.
    """
    out = {}
    for pos in POSITIONS:
        hit2 = hit_top3 = n = 0
        chance_terms = []
        cases = []
        for season in TEST_SEASONS:
            prev, cur = season_shape(season - 1), season_shape(season)
            depth = depth_table(season - 1)
            for (team, p), ranked in depth.items():
                if p != pos or len(ranked) < 2:
                    continue
                leader = ranked[0][0]
                if leader not in cur["pids"]:
                    continue
                tg = team_game_count(cur, team)
                leader_weeks = set(cur["weeks_on_team"].get((leader, team), []))
                missed = [w for w in cur["team_weeks"].get(team, [])
                          if w not in leader_weeks]
                if tg == 0 or len(missed) < MISS_THRESHOLD:
                    continue
                # who actually absorbed it, in exactly those weeks
                currency = _pos_currency(pos)
                gained = collections.Counter()
                for w in missed:
                    for wk in _comp(season)["weeks"]:
                        if int(wk["week"]) != w:
                            continue
                        for pid, row in wk["players"].items():
                            if row.get("team") != team or row.get("pos") != pos:
                                continue
                            if pid == leader:
                                continue
                            gained[pid] += sum(float(row.get(k, 0.0) or 0.0)
                                               for k in currency)
                if not gained:
                    continue
                actual = max(sorted(gained), key=lambda k: (gained[k], k))
                eligible = [pid for pid in gained]
                predicted2 = ranked[1][0]
                top3 = {p2 for p2, _o in ranked[1:3]}
                n += 1
                hit2 += int(actual == predicted2)
                hit_top3 += int(actual in top3)
                chance_terms.append(1.0 / max(1, len(eligible)))
                cases.append({"season": season, "team": team, "pos": pos,
                              "leader": leader, "leader_missed": len(missed),
                              "predicted_depth2": predicted2, "actual": actual,
                              "eligible_bodies": len(eligible),
                              "hit": bool(actual == predicted2)})
        chance = round(float(np.mean(chance_terms)), 4) if chance_terms else None
        w2 = wilson(hit2, n)
        beats = bool(w2 and chance is not None and w2["ci95"][0] > chance)
        out[pos] = {
            "cases": n,
            "depth2_hit_rate": w2,
            "actual_in_depth_2or3": wilson(hit_top3, n),
            "chance_rate_from_eligible_bodies": chance,
            "identifiable": beats,
            "rule": ("prereg 5.2: if the depth-2 hit rate's Wilson interval "
                     "covers the chance rate, the inheritor is NOT identifiable "
                     "in advance and the contingent arm is unbuyable at the "
                     "draft, however large the premium."),
            "case_list": cases[:40],
        }
    return out


def contingent_score(row: dict, b1: dict, b2: dict) -> float:
    """prereg 5.3.  Fully leak-free: Y-1 volume above him held by men who are
    STILL THERE, x P(that starter misses time), x P(he is the one who inherits).
    """
    pos = row["pos"]
    p_miss = _class_miss_rate(pos, b1)
    ident = b2.get(pos, {})
    hit = ident.get("depth2_hit_rate")
    p_inh = hit["rate"] if (ident.get("identifiable") and hit) else (
        ident.get("chance_rate_from_eligible_bodies") or 0.0)
    weight = p_inh if row["depth_proxy"] == 2 else (
        p_inh * 0.5 if row["depth_proxy"] == 3 else 0.0)
    return float(row["open_above_present"]) * p_miss * weight


def _class_miss_rate(pos: str, b1: dict) -> float:
    """P(a starter at this position misses >= 4 games), measured, pooled."""
    cell = b1.get(pos, {})
    hi, lo = cell.get("P_miss4_given_missed4_last_year"), \
        cell.get("P_miss4_given_missed_0or1_last_year")
    ks = sum(c["k"] for c in (hi, lo) if c)
    ns = sum(c["n"] for c in (hi, lo) if c)
    return (ks / ns) if ns else 0.0


# ── section 6 — GRADING ─────────────────────────────────────────────────────
def _rank_scores(cell_rows: list, b1: dict, b2: dict) -> dict:
    """Every preregistered ranking, higher = better."""
    def g(r, k):
        v = r.get(k)
        return 0.0 if v is None or v != v else float(v)

    scores = {
        "R1_vac_opp_share": [g(r, "vac_opp_share") for r in cell_rows],
        "R2_open_above": [g(r, "open_above") for r in cell_rows],
        "R3_young_x_open_above": [
            (g(r, "open_above") if r.get("young") == 1.0 else 0.0)
            for r in cell_rows],
        "R5_contingent": [contingent_score(r, b1, b2) for r in cell_rows],
    }
    # overlays: the practical board form — the mean, nudged by inheritance.
    naive = np.array([g(r, "pts_y1") for r in cell_rows], dtype=float)
    def z(v):
        v = np.asarray(v, dtype=float)
        s = v.std()
        return (v - v.mean()) / s if s > 0 else v * 0.0
    sd_naive = naive.std() or 1.0
    scores["R4_naive_plus_vacated"] = list(
        naive + 0.5 * sd_naive * z(scores["R2_open_above"]))
    scores["R6_naive_plus_contingent"] = list(
        naive + 0.5 * sd_naive * z(scores["R5_contingent"]))
    scores["R7_combined"] = list(
        naive + 0.35 * sd_naive * z(scores["R2_open_above"])
        + 0.35 * sd_naive * z(scores["R5_contingent"]))
    # rivals, from the module that set the bar
    scores["market"] = [-float(r["market_pick"]) for r in cell_rows]
    scores["naive_prev"] = list(naive)
    return scores


def grade_cell(arm: str, capital: dict, b1: dict, b2: dict) -> dict:
    by_season, members = {}, []
    for season in TEST_SEASONS:
        rows, _d = population(season, arm, capital)
        cell = [r for r in rows if r["market_pick"]
                and r["market_pick"] >= LATE_ROUND_FIRST_PICK]
        for r in cell:
            r["season"] = season
        members.extend(cell)
        by_season[season] = {"scores": _rank_scores(cell, b1, b2),
                             "is_winner": [r["is_winner"] for r in cell],
                             "n": len(cell),
                             "winners": sum(1 for r in cell if r["is_winner"])}
    n = len(members)
    winners = sum(1 for r in members if r["is_winner"])
    chance10 = round(sum(10.0 * by_season[s]["winners"] / by_season[s]["n"]
                         for s in by_season), 2)
    chance20 = round(sum(20.0 * by_season[s]["winners"] / by_season[s]["n"]
                         for s in by_season), 2)
    out = {"arm": arm, "quarantined": arm in QUARANTINED_ARMS,
           "n": n, "league_winners": winners,
           "base_rate": round(winners / n, 4) if n else None,
           "chance_at_10": chance10, "chance_at_20": chance20,
           "per_season_n": {str(s): by_season[s]["n"] for s in by_season},
           "rankings": {}}
    names = list(by_season[TEST_SEASONS[0]]["scores"])
    for name in names:
        h10 = T._hits_summed(by_season, name, 10)
        h20 = T._hits_summed(by_season, name, 20)
        row = {"hits_at_10": h10, "hits_at_20": h20,
               "per_season_hits_at_10": {
                   str(s): T._hits_at(by_season[s]["scores"][name],
                                      by_season[s]["is_winner"], 10)
                   for s in by_season}}
        if name != "market":
            row["vs_market"] = T._bootstrap_diff_summed(
                by_season, name, "market", 10)
        row["verdict"] = _grade_verdict(h10, chance10, row.get("vs_market"))
        out["rankings"][name] = row
    return out


def _grade_verdict(h10: int, chance10: float, vs_market: dict | None) -> str:
    """The preregistered bar (prereg 6.2), applied mechanically."""
    if vs_market is None:
        return "reference (the bar itself)"
    if h10 <= chance10:
        return "NULL — does not beat chance"
    if h10 <= BAR_MARKET_AT_10:
        return "beats chance, loses to the room — ships nothing"
    if vs_market.get("excludes_zero"):
        return "FINDING — beats the market with a CI excluding zero"
    return ("beats the market's count but the paired CI covers zero — "
            "NULL under the preregistered bar")


# ── section 6.3 — the rookie cell ───────────────────────────────────────────
def rookie_cell(capital: dict, arm: str = PRIMARY_ARM) -> dict:
    """Declared separately because the primary cell contains ZERO rookies
    (prereg 2.3), and PRE-DECLARED UNDERPOWERED (prereg 6.3)."""
    by_season, members = {}, []
    for season in TEST_SEASONS:
        market = T._market(season)
        labels, _d = T.tier_labels(season, T.K_SLOTS)
        cur = season_shape(season)
        vac = team_vacancy(season, arm)
        rows = []
        for pid, cap in capital.items():
            if cap["draft_season"] != season:
                continue
            pick = market.get(pid)
            if not pick or pick < LATE_ROUND_FIRST_PICK:
                continue
            team = cur["modal_team"].get(pid)
            rows.append({
                "pid": pid, "name": cap.get("name"), "season": season,
                "pick": pick, "draft_overall": cap["draft_overall"],
                "team": team,
                "vac_opp_share": vac.get(team, {}).get("vac_opp_share", 0.0)
                if team else 0.0,
                "is_winner": bool(labels.get(pid) == T.LEAGUE_WINNER),
                "in_season_store": pid in cur["pids"]})
        members.extend(rows)
        by_season[season] = rows
    n = len(members)
    winners = sum(1 for r in members if r["is_winner"])
    out = {"arm": arm, "n": n, "league_winners": winners,
           "per_season_n": {str(s): len(by_season[s]) for s in by_season},
           "per_season_winners": {str(s): sum(1 for r in by_season[s]
                                              if r["is_winner"])
                                  for s in by_season},
           "base_rate": round(winners / n, 4) if n else None,
           "winner_names": [r["name"] for r in members if r["is_winner"]],
           "predeclared": "UNDERPOWERED — no result here can be a FINDING"}
    if winners < 5:
        out["verdict"] = ("UNGRADEABLE — fewer than 5 rookie LEAGUE-WINNERs in "
                          "the whole population (prereg 6.3 stopping rule)")
        return out
    scored = {}
    for name, key, sign in (("capital", "draft_overall", -1.0),
                            ("vacancy", "vac_opp_share", 1.0),
                            ("capital_x_vacancy", None, 1.0),
                            ("market", "pick", -1.0)):
        cells = {}
        for s, rows in by_season.items():
            if key is None:
                sc = [(1.0 / max(1.0, r["draft_overall"])) * r["vac_opp_share"]
                      for r in rows]
            else:
                sc = [sign * float(r[key]) for r in rows]
            cells[s] = {"scores": {name: sc},
                        "is_winner": [r["is_winner"] for r in rows]}
        scored[name] = {"hits_at_5": T._hits_summed(cells, name, 5),
                        "hits_at_10": T._hits_summed(cells, name, 10)}
    out["rankings"] = scored
    out["chance_at_5"] = round(sum(5.0 * out["per_season_winners"][str(s)]
                                   / max(1, len(by_season[s]))
                                   for s in by_season), 2)
    out["chance_at_10"] = round(sum(10.0 * out["per_season_winners"][str(s)]
                                    / max(1, len(by_season[s]))
                                    for s in by_season), 2)
    return out


# ── driver ──────────────────────────────────────────────────────────────────
def run() -> dict:
    capital = draft_capital()
    result = {
        # JSON has no comment syntax, so the lane marker rides in the first
        # value — the convention tiered_outcome_model.json already uses, and
        # what scripts/territory-check.sh greps for in the first five lines.
        "_territory": "TERRITORY: A — produced by "
                      "draft/backtest/opportunity_inheritance.py",
        "_preregistration": "draft/audit/opportunity_inheritance_2026-08-17.md "
                            "sections 0-6, commit f4ed0c05",
        "_stores": "presence from component_stats_{Y} for every season "
                   "(prereg GAP E); red-zone vacancy NOT MEASURED (GAP A); "
                   "depth is a Y-1 volume PROXY, not an NFL depth chart (GAP B)",
        "departure_rule": {
            "statement": ("q DEPARTED T for Y iff q recorded >=1 component row "
                          "for T in weeks 1-17 of Y-1 AND zero component rows "
                          "for T in weeks 1-17 of Y"),
            "per_season_breakdown": {str(s): departure_breakdown(s)
                                     for s in TEST_SEASONS},
            "arms": {a: {"quarantined": a in QUARANTINED_ARMS} for a in VACANCY_ARMS},
        },
        "team_assignment_cost": {},
        "vacancy_by_arm": {},
    }

    for season in TEST_SEASONS:
        prev, cur = season_shape(season - 1), season_shape(season)
        both = [p for p in prev["modal_team"] if p in cur["modal_team"]]
        same = sum(1 for p in both
                   if prev["modal_team"][p] == cur["modal_team"][p])
        result["team_assignment_cost"][str(season)] = {
            "players_in_both_seasons": len(both),
            "same_modal_team": round(same / len(both), 4) if both else None,
            "leak_free_misassignment_rate":
                round(1 - same / len(both), 4) if both else None}

    for arm in VACANCY_ARMS:
        tv = {str(s): team_vacancy(s, arm) for s in TEST_SEASONS}
        shares = {s: [t["vac_opp_share"] for t in tv[s].values()] for s in tv}
        result["vacancy_by_arm"][arm] = {
            "mean_vac_opp_share": {s: round(float(np.mean(v)), 4)
                                   for s, v in shares.items()},
            "max_vac_opp_share": {s: round(float(np.max(v)), 4)
                                  for s, v in shares.items()},
            "most_vacated_teams": {
                s: sorted(tv[s], key=lambda t: -tv[s][t]["vac_opp_share"])[:3]
                for s in tv}}

    # section 4 — realized vacancy, primary arm plus the injury-clean bracket
    result["h1_screen"] = {}
    result["h2_interaction"] = {}
    for arm in VACANCY_ARMS:
        rows_by_season = {}
        for season in TEST_SEASONS:
            rows, diag = population(season, arm, capital)
            for r in rows:
                r["season"] = season
            rows_by_season[season] = rows
            result.setdefault("population_diag", {})[f"{arm}|{season}"] = {
                k: diag[k] for k in ("population", "joined_to_inheritance_features",
                                     "excluded_no_season_row")}
        result["h1_screen"][arm] = h1_screen(rows_by_season)
        result["h2_interaction"][arm] = h2_interaction(rows_by_season)

    # section 5 — contingent vacancy
    result["conditional_value_already_established"] = {
        "source": "draft/audit/conditional_value_2026-08-16.md",
        "P_rb1_misses_at_least_one_game": 0.44,
        "expected_missed_starts_15wk": 0.95,
        "backup_ppw_when_starter_absent": 12.5,
        "backup_ppw_when_starter_present": 6.7,
        "wire_rb_ppw": 7.8, "startable_bar_rb28_ppw": 11.5,
        "handcuff_premium_season_points_to_owner": round(
            CV.handcuff_premium(0.95, 12.5, 11.5), 2),
        "handcuff_premium_to_the_field": round(
            CV.handcuff_premium(0.95, 12.5, 12.5 - 0.0) or 0.0, 2),
        "wr_handcuff": "premium ~0 — elevated WR2s 10.5/wk vs a WR wire of 11.1",
        "not_reimplemented": "handcuff_premium imported from conditional_value.py",
    }
    b1 = b1_absence_forecastable(capital)
    b2 = b2_inheritor_identifiable(capital)
    result["b1_absence_forecastable"] = b1
    result["b1_benching_confound"] = b1_benching_confound(capital)
    result["b2_inheritor_identifiable"] = b2

    result["negative_control"] = negative_control(result["h1_screen"])
    result["r1_team_concentration"] = {
        arm: r1_team_concentration(capital, arm) for arm in ("V_ALL", "V_MOVED")}

    # section 6 — grading
    result["graded_cell"] = {arm: grade_cell(arm, capital, b1, b2)
                             for arm in VACANCY_ARMS}
    result["rookie_cell"] = rookie_cell(capital)
    result["bar"] = {
        "cell": "pick >= 61 in the league's own 2023/24/25 drafts",
        "chance_at_10": BAR_CHANCE_AT_10,
        "market_at_10": BAR_MARKET_AT_10,
        "tiered_model_expected_points_at_10": 5,
        "tiered_model_p_league_winner_at_10": 3,
        "rule": ("FINDING requires hits@10 > 7 AND a paired season-clustered "
                 "bootstrap CI against the market excluding zero (prereg 6.2)"),
    }
    return result


def main() -> None:
    res = run()
    OUT.write_text(json.dumps(res, indent=1, sort_keys=False, default=str) + "\n")
    cell = res["graded_cell"][PRIMARY_ARM]
    print(f"cell n={cell['n']} winners={cell['league_winners']} "
          f"chance@10={cell['chance_at_10']} market@10="
          f"{cell['rankings']['market']['hits_at_10']}")
    for name, row in cell["rankings"].items():
        print(f"  {name:28s} hits@10={row['hits_at_10']:2d} "
              f"hits@20={row['hits_at_20']:2d}  {row['verdict']}")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
