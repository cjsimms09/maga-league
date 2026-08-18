# TERRITORY: A
"""EXP-WEEKLY-ENV — do pace and scoring-environment features sharpen a
strictly-prior weekly projection? Preregistered in EXP-WEEKLY-ENV-PREREG.md
(committed before any numbers existed); results land in exp_weekly_env.json.

RESEARCH ONLY. Writes its own results file and (optionally) a committed
team-week feature artifact. Touches no projection, no board, no production
surface; nothing here is read by anything that puts a number in front of Cory.

THE LEAK DISCIPLINE, STATED WHERE THE CODE IS: every projection input for
week w is computed from weeks 1..w-1 of the SAME season. The one deliberate
exception is the ORACLE-TOTAL arm, which reads the actual week-w game total —
it exists as a positive control and as the CEILING on what a perfect
game-totals line could add, is labeled "oracle" in every output row, and is
never shippable. The mechanics test (test_exp_weekly_env.py) proves the
strictly-prior property structurally: perturbing week w data must not move any
non-oracle week-w projection.

Run:  python3 draft/backtest/exp_weekly_env.py \
          [--cache-dir DIR] [--permutations 200] [--write-features]
Needs nfl_data_py egress (weekly + pbp for 2023, 2024) unless --cache-dir
holds weekly_{yr}.parquet / pbp_{yr}.parquet already.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

import grade          # noqa: E402  — house scoring translation (certified path)
import scoring        # noqa: E402  — house scoring engine

# ── preregistered constants (EXP-WEEKLY-ENV-PREREG.md) ──────────────────────
SEASONS = (2023, 2024)
POSITIONS = ("QB", "RB", "WR", "TE")
FIRST_EVAL_WEEK = 5
LAST_EVAL_WEEK = 18
MIN_PRIOR_APPEARANCES = 3
RELEVANCE_FLOOR = 5.0          # prior running mean must reach this
MIN_TEAM_GAMES = 4             # nflverse_pace.py convention: below this, m = 1
NEUTRAL_MARGIN = 14            # |score differential| ≤ this counts as neutral
DAMPENING = (1.0, 0.5)         # both reported, neither tuned
# ⚠ 18b (D, 2026-08-18): 0.5 was this grid's own MINIMUM, so the published
# "+0.228 ceiling" was a floor on the ceiling. D's finer preregistered sweep
# (no egress, six-check reproduction control) found λ*=0.60 both seasons
# (+0.2379, a +4.3% refinement) and the real finding: the optimum is
# ASYMMETRIC — dud games want λ≈0.80 and carry 2.3-7.2× the value of
# shootouts (λ 0.25-0.50; the raw 5-10× shrank under D's own 40-draw
# placebo, register 33b — the shootout-side placebo is exactly 0.0000, so
# the free lunch exists only in the shrink direction). This tuple stays
# as-is so the historical run reproduces; the asymmetric arm is
# preregistered separately, post-draft. Bounding fact from the same row:
# a PERFECT oracle at +0.2379 is 77% of the all-seats replay's ±0.310
# detection floor — this channel's best case is smaller than the smallest
# effect that instrument can resolve.
PERMUTATIONS = 200

ARMS = ("pace_raw", "pace_neutral", "env_points", "oracle_total")
ORACLE_ARMS = {"oracle_total"}   # leaked by design; ceiling + positive control


# ── team-week features from pbp ─────────────────────────────────────────────

def team_game_rows(pbp_records):
    """Collapse pbp rows into one row per (team, game): plays, neutral plays,
    points for/against, week. Conventions from nflverse_pace.py: scrimmage
    plays are play_type in {pass, run} minus kneels and spikes; the team is
    `posteam` (home_team would credit road drives to the wrong offence)."""
    games = {}
    for r in pbp_records:
        team = r.get("posteam")
        gid = r.get("game_id")
        if not team or not gid or team != team:   # NaN guard
            continue
        key = (gid, team)
        g = games.get(key)
        if g is None:
            pf, pa = _final_score(r, team)
            g = games[key] = {
                "game_id": gid, "team": team, "opp": r.get("defteam"),
                "week": int(r.get("week")), "plays": 0, "neutral_plays": 0,
                "points_for": pf, "points_against": pa,
            }
        if r.get("play_type") in ("pass", "run") and not _truthy(r.get("qb_kneel")) \
                and not _truthy(r.get("qb_spike")):
            g["plays"] += 1
            sd = r.get("score_differential")
            if sd is not None and sd == sd and abs(sd) <= NEUTRAL_MARGIN:
                g["neutral_plays"] += 1
    return sorted(games.values(), key=lambda g: (g["week"], g["game_id"], g["team"]))


def _final_score(row, team):
    home = row.get("home_team")
    hs, as_ = row.get("home_score"), row.get("away_score")
    if hs is None or as_ is None or hs != hs or as_ != as_:
        return (None, None)
    return (float(hs), float(as_)) if team == home else (float(as_), float(hs))


def _truthy(v):
    try:
        return float(v) == 1.0
    except (TypeError, ValueError):
        return False


def team_features_before_week(rows, week):
    """Per-team prior-week averages from team-game rows with week < `week`.
    Returns {team: {games, plays_pg, neutral_pg, pf_pg, pa_pg, faced_pg,
    neutral_faced_pg}} plus league means. Teams with < MIN_TEAM_GAMES prior
    games are EXCLUDED (the caller treats a missing team as multiplier 1)."""
    acc = {}
    faced = {}
    for g in rows:
        if g["week"] >= week:
            continue
        t = acc.setdefault(g["team"], {"games": 0, "plays": 0.0, "neutral": 0.0,
                                       "pf": 0.0, "pa": 0.0})
        t["games"] += 1
        t["plays"] += g["plays"]
        t["neutral"] += g["neutral_plays"]
        if g["points_for"] is not None:
            t["pf"] += g["points_for"]
            t["pa"] += g["points_against"]
        # what the OPPONENT's defense faced in this game
        o = faced.setdefault(g["opp"], {"games": 0, "plays": 0.0, "neutral": 0.0})
        o["games"] += 1
        o["plays"] += g["plays"]
        o["neutral"] += g["neutral_plays"]
    out = {}
    for team, t in acc.items():
        if t["games"] < MIN_TEAM_GAMES:
            continue
        f = faced.get(team, {"games": 0, "plays": 0.0, "neutral": 0.0})
        out[team] = {
            "games": t["games"],
            "plays_pg": t["plays"] / t["games"],
            "neutral_pg": t["neutral"] / t["games"],
            "pf_pg": t["pf"] / t["games"],
            "pa_pg": t["pa"] / t["games"],
            "faced_pg": (f["plays"] / f["games"]) if f["games"] >= MIN_TEAM_GAMES else None,
            "neutral_faced_pg": (f["neutral"] / f["games"]) if f["games"] >= MIN_TEAM_GAMES else None,
        }
    return out


def _league_mean(feats, key):
    vals = [v[key] for v in feats.values() if v.get(key) is not None]
    return (sum(vals) / len(vals)) if vals else None


def multipliers_for_week(rows, week):
    """{team: {arm: m}} for week `week`, non-oracle arms strictly prior.
    A team missing a feature gets m = 1 for that arm (declared in the prereg).
    ORACLE arm reads the ACTUAL week-`week` game total — leaked by design."""
    feats = team_features_before_week(rows, week)
    means = {k: _league_mean(feats, k) for k in
             ("plays_pg", "neutral_pg", "pf_pg", "pa_pg", "faced_pg", "neutral_faced_pg")}
    # opponent map + oracle totals from THIS week's games
    week_games = [g for g in rows if g["week"] == week]
    opp = {g["team"]: g["opp"] for g in week_games}
    totals = {g["team"]: (g["points_for"] + g["points_against"])
              for g in week_games
              if g["points_for"] is not None}
    mean_total = (sum(totals.values()) / len(totals)) if totals else None

    out = {}
    for team in opp:
        o = opp.get(team)
        tf, of = feats.get(team), feats.get(o)
        m = {}

        def rel(f, key, mean_key=None):
            mk = mean_key or key
            if f is None or f.get(key) is None or not means.get(mk):
                return None
            return f[key] / means[mk]

        pair = (rel(tf, "plays_pg"), rel(of, "faced_pg"))
        m["pace_raw"] = _avg_or_one(pair)
        pair = (rel(tf, "neutral_pg"), rel(of, "neutral_faced_pg"))
        m["pace_neutral"] = _avg_or_one(pair)
        pair = (rel(tf, "pf_pg"), rel(of, "pa_pg"))
        m["env_points"] = _avg_or_one(pair)
        m["oracle_total"] = (totals[team] / mean_total) \
            if (team in totals and mean_total) else 1.0
        out[team] = m
    return out


def _avg_or_one(pair):
    vals = [p for p in pair if p is not None]
    return (sum(vals) / len(vals)) if vals else 1.0


# ── player-week table under OUR scoring ─────────────────────────────────────

def player_weeks(weekly_records, scoring_cfg):
    """[{player_id, name, position, team, week, points}] under OUR scoring,
    via the same grade.nflverse_weekly_to_scoring path the certified graders
    use. Positions filtered to the preregistered universe."""
    out = []
    for r in weekly_records:
        if r.get("position") not in POSITIONS:
            continue
        wk = r.get("week")
        if wk is None:
            continue
        line = grade.nflverse_weekly_to_scoring(r)
        pts = scoring.score_stat_line(line, scoring_cfg)
        out.append({
            "player_id": str(r.get("player_id")),
            "name": r.get("player_display_name") or r.get("player_name"),
            "position": r.get("position"),
            "team": r.get("recent_team"),
            "week": int(wk),
            "points": round(pts, 2),
        })
    return out


def running_average(history):
    """Strictly-prior running mean: {(player, week): (mean, n_prior)} where the
    mean covers that player's appearances in weeks < week."""
    by_player = {}
    for row in history:
        by_player.setdefault(row["player_id"], []).append(row)
    out = {}
    for pid, rows in by_player.items():
        rows = sorted(rows, key=lambda r: r["week"])
        total, n = 0.0, 0
        for r in rows:
            out[(pid, r["week"])] = (total / n if n else None, n)
            total += r["points"]
            n += 1
    return out


# ── evaluation ──────────────────────────────────────────────────────────────

def eligible_rows(pweeks, baselines):
    """The preregistered eval set: weeks 5–18, ≥3 prior appearances, prior
    mean ≥ 5.0, appeared this week. Each row carries its baseline projection."""
    out = []
    for r in pweeks:
        if not (FIRST_EVAL_WEEK <= r["week"] <= LAST_EVAL_WEEK):
            continue
        base, n = baselines.get((r["player_id"], r["week"]), (None, 0))
        if base is None or n < MIN_PRIOR_APPEARANCES or base < RELEVANCE_FLOOR:
            continue
        row = dict(r)
        row["baseline"] = base
        out.append(row)
    return out


def project(rows, week_multipliers, arm, lam):
    """proj = baseline × (1 + λ(m − 1)); m = 1 when the player's team has no
    multiplier this week (bye math never applies: the player appeared)."""
    out = []
    for r in rows:
        m = week_multipliers.get(r["week"], {}).get(r["team"], {}).get(arm, 1.0)
        out.append(r["baseline"] * (1.0 + lam * (m - 1.0)))
    return out


def mae(preds, rows):
    return sum(abs(p - r["points"]) for p, r in zip(preds, rows)) / len(rows)


def _rankdata(vals):
    order = sorted(range(len(vals)), key=lambda i: vals[i])
    ranks = [0.0] * len(vals)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and vals[order[j + 1]] == vals[order[i]]:
            j += 1
        avg = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            ranks[order[k]] = avg
        i = j + 1
    return ranks


def spearman(a, b):
    if len(a) < 3:
        return None
    ra, rb = _rankdata(a), _rankdata(b)
    ma, mb = sum(ra) / len(ra), sum(rb) / len(rb)
    num = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    da = math.sqrt(sum((x - ma) ** 2 for x in ra))
    db = math.sqrt(sum((y - mb) ** 2 for y in rb))
    return (num / (da * db)) if da and db else None


def weekly_metrics(preds, rows):
    """Mean within-week Spearman + mean within-week top-decile hit rate."""
    by_week = {}
    for p, r in zip(preds, rows):
        by_week.setdefault(r["week"], []).append((p, r["points"]))
    sps, hits = [], []
    for wk, pairs in by_week.items():
        pv = [p for p, _ in pairs]
        rv = [a for _, a in pairs]
        sp = spearman(pv, rv)
        if sp is not None:
            sps.append(sp)
        k = max(1, len(pairs) // 10)
        top_pred = set(sorted(range(len(pairs)), key=lambda i: -pv[i])[:k])
        top_real = set(sorted(range(len(pairs)), key=lambda i: -rv[i])[:k])
        hits.append(len(top_pred & top_real) / k)
    return (sum(sps) / len(sps) if sps else None,
            sum(hits) / len(hits) if hits else None)


def permutation_null(rows, week_multipliers, arm, lam, n_perm, seed=20260815):
    """ΔMAE distribution when the team→multiplier map is shuffled within each
    week. The null faces the SAME construction as the real arm (LAB-REGISTRY
    §6 parity rule); returns the list of ΔMAE values (baseline − permuted)."""
    rng = random.Random(seed)
    base_mae = mae([r["baseline"] for r in rows], rows)
    deltas = []
    for _ in range(n_perm):
        permuted = {}
        for wk, teams in week_multipliers.items():
            names = list(teams.keys())
            shuffled = names[:]
            rng.shuffle(shuffled)
            permuted[wk] = {t: teams[s] for t, s in zip(names, shuffled)}
        preds = project(rows, permuted, arm, lam)
        deltas.append(base_mae - mae(preds, rows))
    return deltas


def percentile(vals, q):
    s = sorted(vals)
    idx = min(len(s) - 1, max(0, int(math.ceil(q * len(s))) - 1))
    return s[idx]


# ── driver ──────────────────────────────────────────────────────────────────

def load_frames(cache_dir):
    import pandas as pd  # local import: pure-math paths above need no pandas
    frames = {}
    for yr in SEASONS:
        wp = Path(cache_dir) / f"weekly_{yr}.parquet"
        pp = Path(cache_dir) / f"pbp_{yr}.parquet"
        if wp.exists() and pp.exists():
            frames[yr] = (pd.read_parquet(wp), pd.read_parquet(pp))
            continue
        import nfl_data_py as nfl
        w = nfl.import_weekly_data([yr])
        cols = ["game_id", "week", "season_type", "posteam", "defteam", "play_type",
                "qb_kneel", "qb_spike", "score_differential", "home_team",
                "away_team", "home_score", "away_score"]
        p = nfl.import_pbp_data([yr], columns=cols, cache=False)
        p = p[p["season_type"] == "REG"]
        if "season_type" in w.columns:
            w = w[w["season_type"] == "REG"]
        w.to_parquet(wp)
        p.to_parquet(pp)
        frames[yr] = (w, p)
    return frames


def run_season(weekly_df, pbp_df, scoring_cfg, n_perm):
    pweeks = player_weeks(weekly_df.to_dict("records"), scoring_cfg)
    rows_tg = team_game_rows(pbp_df.to_dict("records"))
    baselines = running_average(pweeks)
    rows = eligible_rows(pweeks, baselines)
    weeks = sorted({r["week"] for r in rows})
    wm = {wk: multipliers_for_week(rows_tg, wk) for wk in weeks}

    base_preds = [r["baseline"] for r in rows]
    base_mae = mae(base_preds, rows)
    base_sp, base_td = weekly_metrics(base_preds, rows)
    season = {
        "n_player_weeks": len(rows),
        "eval_weeks": [weeks[0], weeks[-1]],
        "baseline": {"mae": round(base_mae, 4), "spearman": round(base_sp, 4),
                     "top_decile": round(base_td, 4)},
        "arms": {},
    }
    for arm in ARMS:
        for lam in DAMPENING:
            preds = project(rows, wm, arm, lam)
            a_mae = mae(preds, rows)
            sp, td = weekly_metrics(preds, rows)
            entry = {
                "lambda": lam,
                "oracle": arm in ORACLE_ARMS,
                "mae": round(a_mae, 4),
                "delta_mae": round(base_mae - a_mae, 4),
                "spearman": round(sp, 4),
                "top_decile": round(td, 4),
                "delta_top_decile": round(td - base_td, 4),
            }
            if arm not in ORACLE_ARMS:
                null = permutation_null(rows, wm, arm, lam, n_perm)
                entry["null_p95_delta_mae"] = round(percentile(null, 0.95), 4)
                entry["beats_null_p95"] = (base_mae - a_mae) > percentile(null, 0.95)
            season["arms"][f"{arm}@{lam}"] = entry
    # multiplier spread, for the report: how much did each arm actually move?
    spread = {}
    for arm in ARMS:
        vals = [m[arm] for wk in wm.values() for m in wk.values()]
        if vals:
            spread[arm] = {"min": round(min(vals), 3), "max": round(max(vals), 3),
                           "mean": round(sum(vals) / len(vals), 3)}
    season["multiplier_spread"] = spread
    return season, rows_tg


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache-dir", default=os.environ.get("EXP_WEEKLY_ENV_CACHE", "."))
    ap.add_argument("--permutations", type=int, default=PERMUTATIONS)
    ap.add_argument("--write-features", action="store_true",
                    help="also write exp_weekly_env_features.json (team-game rows)")
    args = ap.parse_args(argv)

    cfg = json.load(open(HERE.parent / "config" / "league_config.json"))
    scoring_cfg = cfg["scoring"]
    frames = load_frames(args.cache_dir)

    result = {
        "_territory": "TERRITORY: A — research artifact, produced by draft/backtest/exp_weekly_env.py",
        "experiment": "EXP-WEEKLY-ENV",
        "prereg": "draft/backtest/EXP-WEEKLY-ENV-PREREG.md",
        "seasons": {},
    }
    features_out = {}
    for yr in SEASONS:
        w, p = frames[yr]
        season, rows_tg = run_season(w, p, scoring_cfg, args.permutations)
        result["seasons"][str(yr)] = season
        features_out[str(yr)] = rows_tg

    # ship-rule verdicts, pooled across seasons (both must be individually positive)
    verdicts = {}
    for arm in ARMS:
        for lam in DAMPENING:
            key = f"{arm}@{lam}"
            per = [result["seasons"][str(yr)]["arms"][key] for yr in SEASONS]
            pooled_delta = sum(e["delta_mae"] for e in per)
            v = {
                "oracle": arm in ORACLE_ARMS,
                "delta_mae_by_season": {str(yr): e["delta_mae"]
                                        for yr, e in zip(SEASONS, per)},
                "positive_both_seasons": all(e["delta_mae"] > 0 for e in per),
            }
            if arm not in ORACLE_ARMS:
                v["beats_null_p95_both"] = all(e["beats_null_p95"] for e in per)
                v["top_decile_not_degraded"] = all(e["delta_top_decile"] >= 0 for e in per)
                v["signal"] = (v["positive_both_seasons"] and v["beats_null_p95_both"]
                               and v["top_decile_not_degraded"])
            else:
                v["positive_control_passed"] = v["positive_both_seasons"]
            v["pooled_delta_mae"] = round(pooled_delta / len(per), 4)
            verdicts[key] = v
    result["verdicts"] = verdicts

    out_path = HERE / "exp_weekly_env.json"
    json.dump(result, open(out_path, "w"), indent=1)
    print(f"wrote {out_path}")
    if args.write_features:
        feat = {"_territory": "TERRITORY: A — research artifact (team-game features), "
                              "produced by draft/backtest/exp_weekly_env.py",
                "note": "one row per (team, game): scrimmage plays, neutral-script "
                        "plays, points for/against. Conventions per nflverse_pace.py.",
                "seasons": features_out}
        fp = HERE / "exp_weekly_env_features.json"
        json.dump(feat, open(fp, "w"), indent=1)
        print(f"wrote {fp}")
    for k, v in verdicts.items():
        tag = "ORACLE" if v["oracle"] else ("SIGNAL" if v.get("signal") else "null")
        print(f"{k:22s} pooled ΔMAE {v['pooled_delta_mae']:+.4f}  {tag}")
    return result


if __name__ == "__main__":
    main()
