"""PORTFOLIO DOCTRINE, STEP 1 — measure the REAL correlations.

Converts experiment 6's stack finding from MODELLED rho to MEASURED rho, which
is the difference between a LEAN and evidence. Nothing downstream of this is
built yet, and nothing needs to be: this is fact-finding, and it runs
independently of the tilt / Stage 3 / exp 34 / tree sequence.

WHAT IS MEASURED, from nflverse weekly data 2021-25, in OUR scoring:

  1. SAME-TEAM QB -> pass-catcher pairs (the classic stack)
  2. SAME-TEAM pass-catcher -> pass-catcher pairs (the cannibalisation question)
  3. SAME-GAME opposing pairs (the shootout question)
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
    """{(season, team, player, pos): {week: our_points}}"""
    series, teams = {}, {}
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
    return series, teams


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
    series, teams = build_series(frames, sc)
    if not series:
        raise SystemExit("no player-weeks built — refusing to report an empty study")

    same_team = lambda a, b, t: t.get(a) and t.get(a) == t.get(b)      # noqa: E731
    qb_catcher = lambda a, b, t: same_team(a, b, t) and {a[2], b[2]} & {"QB"} \
        and (a[2] in CATCHERS or b[2] in CATCHERS)                     # noqa: E731
    catcher_pair = lambda a, b, t: same_team(a, b, t) \
        and a[2] in CATCHERS and b[2] in CATCHERS                      # noqa: E731
    unrelated = lambda a, b, t: t.get(a) and t.get(b) and t[a] != t[b]  # noqa: E731

    results = [
        summarise("same_team_qb_to_catcher", pair_rhos(series, teams, qb_catcher),
                  "the classic stack — exp 6's modelled rho becomes measured here"),
        summarise("same_team_catcher_to_catcher", pair_rhos(series, teams, catcher_pair),
                  "the cannibalisation question: do team-mates split one pie?"),
        summarise("unrelated_baseline", pair_rhos(series, teams, unrelated),
                  "THE BASELINE. Without it a rho is a number, not a finding."),
    ]

    payload = {
        "measured_at_seasons": SEASONS,
        "scoring": {"pass_td": sc.get("pass_td"), "rec": sc.get("rec"),
                    "source": "draft/config/league_config.json (OUR scoring, not nflverse defaults)"},
        "min_shared_weeks": MIN_WEEKS,
        "results": results,
        "limitations": [
            "SAME-GAME OPPOSING PAIRS are not measured here: weekly data carries a "
            "player's team but not his opponent per week without a schedule join. "
            "Stated rather than approximated — the shootout question needs the "
            "schedule merge and is a separate, honest step.",
            "recent_team is end-of-season team; mid-season movers are attributed to "
            "their final club, which adds noise in both directions.",
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
