"""PORTFOLIO DOCTRINE, STEP 1 — measure the REAL correlations.

Converts experiment 6's stack finding from MODELLED rho to MEASURED rho, which
is the difference between a LEAN and evidence. Nothing downstream of this is
built yet, and nothing needs to be: this is fact-finding, and it runs
independently of the tilt / Stage 3 / exp 34 / tree sequence.

WHAT IS MEASURED, from nflverse weekly data 2021-25, in OUR scoring:

  1. SAME-TEAM QB -> pass-catcher pairs (the classic stack)
  2. SAME-TEAM pass-catcher -> pass-catcher pairs (the cannibalisation question)
  3. SAME-GAME opposing pairs (the shootout question) — via a schedule join
  4. A BASELINE of unrelated pairs, so a correlation has something to be
     compared against — without it, "rho = 0.31" is a number, not a finding

⚠️ WHY THIS RUNS IN CI AND NOT IN THE SANDBOX: nflverse egress is blocked
locally. The script is written to fail LOUDLY on an unreachable source rather
than silently reporting on whatever subset it managed to fetch.

⚠️ SCORING MUST BE OURS. nflverse ships its own fantasy_points columns using
STANDARD scoring. This league is half-PPR with 6-point passing TDs, and passing
TDs are exactly where a QB/receiver stack correlates — grading a stack study in
4-point-passing-TD scoring would understate the very effect it is measuring.
Points are therefore recomputed from raw stats against draft/config's scoring
table, and the script asserts it did so.
"""
from __future__ import annotations

import itertools
import json
import pathlib
import statistics
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
CONFIG = ROOT / "draft" / "config" / "league_config.json"
OUT = ROOT / "draft" / "backtest" / "covariance.json"
REPORT = ROOT / "draft" / "backtest" / "COVARIANCE.md"

SEASONS = [2021, 2022, 2023, 2024, 2025]
MIN_WEEKS = 6          # a pair needs this many shared weeks to be counted at all
CATCHERS = {"WR", "TE", "RB"}


def load_scoring() -> dict:
    cfg = json.loads(CONFIG.read_text())
    sc = cfg.get("scoring") or {}
    if not sc:
        raise SystemExit("league_config.json has no scoring table — refusing to guess")
    return sc


def score_row(row, sc: dict) -> float:
    """OUR points for one player-week, from raw stats."""
    g = lambda k: float(row.get(k) or 0.0)          # noqa: E731
    return (
        g("passing_yards") * sc.get("pass_yd", 0.0)
        + g("passing_tds") * sc.get("pass_td", 0.0)
        + g("interceptions") * sc.get("pass_int", 0.0)
        + g("rushing_yards") * sc.get("rush_yd", 0.0)
        + g("rushing_tds") * sc.get("rush_td", 0.0)
        + g("receiving_yards") * sc.get("rec_yd", 0.0)
        + g("receiving_tds") * sc.get("rec_td", 0.0)
        + g("receptions") * sc.get("rec", 0.0)
        + g("rushing_fumbles_lost") * sc.get("fum_lost", 0.0)
        + g("receiving_fumbles_lost") * sc.get("fum_lost", 0.0)
    )


def fetch_schedules(seasons):
    """week -> {team: opponent}, per season. Needed for the same-game arm.

    The first cut of this script skipped same-game pairs because weekly data
    carries a player's team but not his weekly opponent. The spec names them
    explicitly (§1: "players in the same game (positive via game script/pace)"),
    so the join is done rather than the arm dropped.
    """
    import nfl_data_py as nfl
    opp = {}
    for s in seasons:
        try:
            sched = nfl.import_schedules([s])
        except Exception as e:                      # noqa: BLE001
            raise SystemExit(
                f"could not fetch schedules for {s}: {type(e).__name__} {e}. "
                "The same-game arm needs this join; refusing to silently drop it."
            ) from e
        for row in sched.to_dict("records"):
            if row.get("game_type") not in (None, "REG"):
                continue
            wk, home, away = row.get("week"), row.get("home_team"), row.get("away_team")
            if not (wk and home and away):
                continue
            opp.setdefault((s, wk), {})[home] = away
            opp[(s, wk)][away] = home
    return opp


def fetch(seasons):
    try:
        import nfl_data_py as nfl
    except ImportError as e:                        # pragma: no cover
        raise SystemExit(f"nfl_data_py unavailable: {e}. This script runs in CI.") from e
    frames = []
    for s in seasons:
        try:
            df = nfl.import_weekly_data([s])
        except Exception as e:                      # noqa: BLE001
            # LOUD. A partial study reported as a full one is the failure mode.
            raise SystemExit(
                f"could not fetch weekly data for {s}: {type(e).__name__} {e}. "
                "Refusing to report a correlation study on a partial sample."
            ) from e
        frames.append((s, df))
    return frames


def build_series(frames, sc):
    """{(season, player, pos): {week: our_points}}, plus team-by-week."""
    series, teams, team_week = {}, {}, {}
    for season, df in frames:
        for row in df.to_dict("records"):
            pos = row.get("position")
            if pos not in {"QB"} | CATCHERS:
                continue
            wk = row.get("week")
            if row.get("season_type") not in (None, "REG"):
                continue
            key = (season, row.get("player_display_name"), pos)
            series.setdefault(key, {})[wk] = score_row(row, sc)
            teams.setdefault(key, row.get("recent_team"))
            # PER-WEEK team, so the same-game join is correct for mid-season
            # movers rather than using the end-of-season club for every week.
            team_week.setdefault(key, {})[wk] = row.get("recent_team")
    return series, teams, team_week


def pearson(xs, ys):
    if len(xs) < MIN_WEEKS:
        return None
    try:
        return statistics.correlation(xs, ys)
    except Exception:                               # noqa: BLE001
        return None


def pair_rhos(series, teams, predicate):
    out = []
    keys = list(series)
    for a, b in itertools.combinations(keys, 2):
        if a[0] != b[0]:                            # same season only
            continue
        if not predicate(a, b, teams):
            continue
        shared = sorted(set(series[a]) & set(series[b]))
        if len(shared) < MIN_WEEKS:
            continue
        r = pearson([series[a][w] for w in shared], [series[b][w] for w in shared])
        if r is not None:
            out.append(r)
    return out


def summarise(name, rhos, note=""):
    if not rhos:
        return {"pair_type": name, "n_pairs": 0, "note": "no qualifying pairs"}
    rhos = sorted(rhos)
    return {
        "pair_type": name,
        "n_pairs": len(rhos),
        "mean_rho": round(statistics.fmean(rhos), 4),
        "median_rho": round(rhos[len(rhos) // 2], 4),
        "p10": round(rhos[int(len(rhos) * 0.10)], 4),
        "p90": round(rhos[int(len(rhos) * 0.90)], 4),
        "note": note,
    }


def main() -> int:
    sc = load_scoring()
    if abs(float(sc.get("pass_td", 0)) - 6.0) > 1e-9:
        print(f"NOTE: pass_td is {sc.get('pass_td')} — expected 6.0 for this league")
    if abs(float(sc.get("rec", 0)) - 0.5) > 1e-9:
        print(f"NOTE: rec is {sc.get('rec')} — expected 0.5 (half-PPR)")

    frames = fetch(SEASONS)
    series, teams, team_week = build_series(frames, sc)
    opp = fetch_schedules(SEASONS)
    if not series:
        raise SystemExit("no player-weeks built — refusing to report an empty study")

    same_team = lambda a, b, t: t.get(a) and t.get(a) == t.get(b)      # noqa: E731
    qb_catcher = lambda a, b, t: same_team(a, b, t) and {a[2], b[2]} & {"QB"} \
        and (a[2] in CATCHERS or b[2] in CATCHERS)                     # noqa: E731
    catcher_pair = lambda a, b, t: same_team(a, b, t) \
        and a[2] in CATCHERS and b[2] in CATCHERS                      # noqa: E731
    unrelated = lambda a, b, t: t.get(a) and t.get(b) and t[a] != t[b]  # noqa: E731

    def same_game(a, b, t):
        """Different teams, but facing each other — the shootout question."""
        if not (t.get(a) and t.get(b)) or t[a] == t[b]:
            return False
        season = a[0]
        shared = set(series[a]) & set(series[b])
        # Count as same-game only if they actually met in most shared weeks.
        met = 0
        for w in shared:
            ta = (team_week.get(a) or {}).get(w)
            tb = (team_week.get(b) or {}).get(w)
            if ta and tb and (opp.get((season, w)) or {}).get(ta) == tb:
                met += 1
        return met >= MIN_WEEKS

    results = [
        summarise("same_team_qb_to_catcher", pair_rhos(series, teams, qb_catcher),
                  "the classic stack — exp 6's modelled rho becomes measured here"),
        summarise("same_team_catcher_to_catcher", pair_rhos(series, teams, catcher_pair),
                  "the cannibalisation question: do team-mates split one pie?"),
        summarise("same_game_opposing", pair_rhos(series, teams, same_game),
                  "the shootout question (spec §1) — positive via game script/pace"),
        summarise("unrelated_baseline", pair_rhos(series, teams, unrelated),
                  "THE BASELINE. Without it a rho is a number, not a finding."),
    ]

    # THE NUMBER THE SPEC NAMES. Experiment 6 priced the stack family against a
    # MODELLED rho = 0.35 and was flagged LEAN for exactly that reason. This is
    # the comparison that converts the family from lean to evidence — reported
    # explicitly rather than left for a reader to compute.
    stack = next((r for r in results if r["pair_type"] == "same_team_qb_to_catcher"), {})
    base = next((r for r in results if r["pair_type"] == "unrelated_baseline"), {})
    verdict = None
    if stack.get("n_pairs") and base.get("n_pairs"):
        excess = round(stack["mean_rho"] - base["mean_rho"], 4)
        verdict = {
            "modelled_rho_exp6": 0.35,
            "measured_mean_rho": stack["mean_rho"],
            "baseline_mean_rho": base["mean_rho"],
            "excess_over_baseline": excess,
            "reading": (
                "MODEL OVERSTATED the stack" if stack["mean_rho"] < 0.35 - 0.05 else
                "MODEL UNDERSTATED the stack" if stack["mean_rho"] > 0.35 + 0.05 else
                "measured rho is consistent with the modelled 0.35"),
        }

    payload = {
        "measured_at_seasons": SEASONS,
        "scoring": {"pass_td": sc.get("pass_td"), "rec": sc.get("rec"),
                    "source": "draft/config/league_config.json (OUR scoring, not nflverse defaults)"},
        "min_shared_weeks": MIN_WEEKS,
        "results": results,
        "exp6_rho_check": verdict,
        "limitations": [
            "A PLAYER-vs-OPPOSING-DST arm (spec §1) is NOT measured: nflverse weekly "
            "data does not carry team-defence scoring in the same table, so it needs "
            "a separate DST source. Named rather than approximated.",
            "SAME-BYE (spec §1's degenerate perfect correlation to zero) is not "
            "measured because it is not an empirical question — a bye is a "
            "structural zero, already handled by the bye term.",
            "Pair classification uses end-of-season team; the SAME-GAME arm uses "
            "per-week team so its join is correct for mid-season movers, but the "
            "same-team arms attribute a mover to his final club.",
            "Correlation of weekly POINTS is not the same as correlation of the "
            "quantity a portfolio cares about (weekly-high capture). This measures "
            "the input; pricing it is step 2.",
        ],
    }
    OUT.write_text(json.dumps(payload, indent=2) + "\n")

    lines = ["# MEASURED COVARIANCE — Portfolio Doctrine, step 1", "",
             f"_Seasons {SEASONS[0]}-{SEASONS[-1]} · our scoring (6-pt pass TD, half-PPR) · "
             f"min {MIN_WEEKS} shared weeks_", "",
             "| pair type | n | mean rho | median | p10 | p90 |", "|---|---|---|---|---|---|"]
    for r in results:
        if not r.get("n_pairs"):
            lines.append(f"| {r['pair_type']} | 0 | — | — | — | — |")
            continue
        lines.append(f"| {r['pair_type']} | {r['n_pairs']} | {r['mean_rho']} | "
                     f"{r['median_rho']} | {r['p10']} | {r['p90']} |")
    lines += ["", "## What each row is for", ""]
    for r in results:
        lines.append(f"- **{r['pair_type']}** — {r.get('note', '')}")
    if verdict:
        lines += ["", "## THE NUMBER EXPERIMENT 6 ASSUMED", "",
                  f"- exp 6 priced the stack family against a **modelled rho = "
                  f"{verdict['modelled_rho_exp6']}**",
                  f"- measured same-team QB->catcher rho: **{verdict['measured_mean_rho']}**",
                  f"- unrelated baseline: {verdict['baseline_mean_rho']}  "
                  f"(excess over baseline: **{verdict['excess_over_baseline']}**)",
                  f"- **reading: {verdict['reading']}**", "",
                  "This is the comparison that converts the stack family from LEAN to "
                  "evidence — or that shows the lean was priced off a rho the data "
                  "does not support."]
    lines += ["", "## Limitations, stated with the result", ""]
    lines += [f"- {x}" for x in payload["limitations"]]
    lines += ["", "**The comparison that matters:** the stack rows mean nothing except "
              "against `unrelated_baseline`. A same-team rho of 0.30 is only a finding "
              "if unrelated pairs sit near zero.", ""]
    REPORT.write_text("\n".join(lines))
    print(f"wrote {OUT.name} + {REPORT.name}")
    for r in results:
        print(f"  {r['pair_type']:32s} n={r.get('n_pairs')} mean_rho={r.get('mean_rho')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
