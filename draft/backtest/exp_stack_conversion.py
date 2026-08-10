"""STACK CONVERSION (D3) — does the realized correlation turn into MONEY?

THE GAP THIS CLOSES, and it is the highest-EVSI item on the program because three
open questions rest on the same unclosed link:

  1. the stack weight (ships at 0.5),
  2. the correlated-variance gap in the optimiser,
  3. the proxy->dollars link that every continuous-proxy reading depends on.

WHAT WE ALREADY KNEW, AND WHY IT WAS NOT ENOUGH.
  * exp_stack_correlation MEASURED the real thing: realized same-team QB-WR1
    weekly correlation rho = 0.357 (n=61 pairs, 4 seasons), worth ~2.34 ceiling
    points a week. That is a genuine empirical finding.
  * stack_sweep priced a dose curve and crowned 0.5 a WINNER at +$179 — but its
    own caveat says it plainly: "the sweep prices a benefit it actually
    simulates". It ASSUMED rho=0.35, then measured the value of the correlation it
    had assumed. That is circular, and it is exactly why the participation arm
    came back INSTRUMENT-LIMITED: grade_room carries no within-team weekly
    correlation, so the mechanism is absent from the instrument.

So we have a measured CAUSE and a simulated EFFECT, and nothing joining them on
real outcomes. This experiment is the join.

THE DESIGN — WITHIN-ROSTER, which is what makes it honest. Stacked lineups might
simply belong to better teams; comparing stacked rosters against unstacked ones
would mostly measure roster quality. So every comparison is INSIDE one
roster-season: the same manager's weeks where he happened to start his QB
alongside a same-team WR/TE, against his own weeks where he did not. Team strength,
manager skill and schedule are held fixed by construction.

THE OUTCOME IS THE CHANNEL THAT PAYS. Weekly points is the readable number, but
the $100 weekly high is the only dollar channel that ever activated for this seat,
so the headline is WEEKLY-HIGH WIN RATE — plus the continuous proxy (smoothed win
probability), because dollars are threshold-lumpy and 540 roster-weeks is not
enough to resolve a rare event on the hard indicator alone.

TEAM RESOLUTION, and its honest limit:
  --teams=current  (default, runs anywhere) uses today's player->team map. A
                   player who changed teams is then mis-labelled for older
                   seasons. That misclassification is toward the NULL: it puts
                   genuine stacks in the unstacked bucket and vice versa, which
                   ATTENUATES any real effect. So a positive result here survives
                   the flaw; a null here is ambiguous and must not be recorded as
                   a finding.
  --teams=nflverse (CI, needs egress) uses per-season historical teams, the same
                   source exp_stack_correlation already uses. This is the
                   authoritative arm.

Run: python3 draft/backtest/exp_stack_conversion.py [--teams=current|nflverse]
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
HISTORY = HERE.parent / "data" / "league_history.json"
ARTIFACT = ROOT / "public" / "draft_data.json"

sys.path.insert(0, str(HERE))
try:
    import grade_proxy as GP
except Exception:  # pragma: no cover - proxy is optional for the raw arm
    GP = None

MIN_WEEKS_EACH_SIDE = 3   # a roster-season only informs if it has both kinds of week


def current_team_map() -> tuple[dict, dict]:
    d = json.loads(ARTIFACT.read_text())
    team = {str(p["player_id"]): (p.get("team") or "") for p in d["players"]}
    pos = {str(p["player_id"]): (p.get("position") or "") for p in d["players"]}
    return team, pos


def nflverse_team_map(seasons: list[int]) -> tuple[dict, dict]:  # pragma: no cover - CI only
    """Per-season historical teams, keyed (season, sleeper_id). Falls back to the
    current map for anything the crosswalk cannot resolve, and SAYS how many."""
    import nfl_data_py as nfl  # noqa
    import pandas as pd  # noqa
    team, pos = {}, {}
    for y in seasons:
        df = nfl.import_weekly_data([y])
        col = "recent_team" if "recent_team" in df.columns else "team"
        for row in df.to_dict("records"):
            pid = str(row.get("player_id") or "")
            if not pid:
                continue
            team[(y, pid)] = str(row.get(col) or "")
            pos[(y, pid)] = str(row.get("position") or "")
    return team, pos


def is_stacked(starters: list, season: int, team: dict, pos: dict, seasonal: bool) -> bool:
    """Did this lineup start a QB alongside a same-team WR/TE?"""
    def T(pid):
        return team.get((season, str(pid)), "") if seasonal else team.get(str(pid), "")

    def P(pid):
        return pos.get((season, str(pid)), "") if seasonal else pos.get(str(pid), "")

    qb_teams = {T(s) for s in starters if P(s) == "QB" and T(s)}
    if not qb_teams:
        return False
    for s in starters:
        if P(s) in ("WR", "TE") and T(s) in qb_teams:
            return True
    return False


def mean(xs):
    return sum(xs) / len(xs) if xs else None


def _sd(xs):
    if len(xs) < 2:
        return None
    m = sum(xs) / len(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))


def welch(a: list, b: list) -> dict:
    """Difference in means with a Welch interval — unequal variances, unequal n,
    which is exactly this design (a roster has more unstacked weeks than stacked)."""
    if len(a) < 2 or len(b) < 2:
        return {"diff": None, "ci95": None, "separable": False}
    ma, mb = mean(a), mean(b)
    va = sum((x - ma) ** 2 for x in a) / (len(a) - 1)
    vb = sum((x - mb) ** 2 for x in b) / (len(b) - 1)
    se = math.sqrt(va / len(a) + vb / len(b))
    d = ma - mb
    lo, hi = d - 1.96 * se, d + 1.96 * se
    return {"diff": round(d, 4), "ci95": [round(lo, 4), round(hi, 4)],
            "separable": (lo > 0 or hi < 0)}


def run(mode: str = "current") -> dict:
    history = json.loads(HISTORY.read_text())
    seasons = [s for s in history["seasons"] if s.get("weeks")]
    years = sorted(int(s["season"]) for s in seasons)

    seasonal = mode == "nflverse"
    if seasonal:
        team, pos = nflverse_team_map(years)
    else:
        team, pos = current_team_map()

    # Per (season, roster): weekly rows tagged stacked / not, plus the week's field
    # so weekly-high is computed against who he actually played that week.
    rows: list[dict] = []
    for s in seasons:
        year = int(s["season"])
        for wk, entries in (s.get("weeks") or {}).items():
            field = {int(e["roster_id"]): float(e.get("points") or 0.0) for e in entries}
            if len(field) < 4:
                continue
            top = max(field.values())
            for e in entries:
                st = e.get("starters") or []
                if not st:
                    continue
                rid = int(e["roster_id"])
                pts = float(e.get("points") or 0.0)
                others = [v for k, v in field.items() if k != rid]
                rows.append({
                    "season": year, "week": int(wk), "roster_id": rid, "points": pts,
                    "stacked": is_stacked(st, year, team, pos, seasonal),
                    "weekly_high": 1.0 if (others and pts > max(others)) else 0.0,
                    "others": others,
                })

    # WITHIN-ROSTER: each roster-season contributes its own stacked-minus-unstacked
    # difference. Roster quality, manager and schedule are held fixed.
    by_seat: dict = {}
    for r in rows:
        by_seat.setdefault((r["season"], r["roster_id"]), []).append(r)

    paired_pts, paired_high, contributing = [], [], 0
    sigma_all = None
    if GP:
        field_by_week = {}
        for r in rows:
            field_by_week.setdefault(r["week"], {})[r["roster_id"]] = r["points"]
        sigma_all = GP.residual_weekly_sigma(field_by_week, sorted(field_by_week))

    paired_prob, paired_sd, paired_tail = [], [], []
    for _seat, rs in by_seat.items():
        on = [r for r in rs if r["stacked"]]
        off = [r for r in rs if not r["stacked"]]
        if len(on) < MIN_WEEKS_EACH_SIDE or len(off) < MIN_WEEKS_EACH_SIDE:
            continue
        contributing += 1
        paired_pts.append(mean([r["points"] for r in on]) - mean([r["points"] for r in off]))
        paired_high.append(mean([r["weekly_high"] for r in on]) - mean([r["weekly_high"] for r in off]))
        if GP and sigma_all:
            p_on = mean([GP.week_win_prob(r["points"], r["others"], sigma_all) for r in on])
            p_off = mean([GP.week_win_prob(r["points"], r["others"], sigma_all) for r in off])
            paired_prob.append(p_on - p_off)

        # THE MOMENT THE MECHANISM ACTUALLY MOVES — and testing the mean was my own
        # design error, caught before recording a null. Correlation between a QB and
        # his receiver does not raise the EXPECTED lineup total: their means are
        # whatever they are. It raises the VARIANCE of the sum, which fattens the
        # upper tail — and the upper tail is precisely where the $100 weekly high
        # lives. exp_stack_correlation says so in its own words: "~2.34 CEILING
        # pts/week ... Ceiling effect only; the projection is never touched."
        # So the mean test is the wrong test, and a null on it is not evidence
        # against the mechanism. These two are the right ones.
        sd_on = _sd([r["points"] for r in on])
        sd_off = _sd([r["points"] for r in off])
        if sd_on is not None and sd_off is not None:
            paired_sd.append(sd_on - sd_off)
        # Upper tail against the roster's OWN distribution, so "a big week" means
        # big for him rather than big for the league.
        allp = sorted(r["points"] for r in rs)
        if len(allp) >= 4:
            p75 = allp[int(0.75 * (len(allp) - 1))]
            t_on = mean([1.0 if r["points"] > p75 else 0.0 for r in on])
            t_off = mean([1.0 if r["points"] > p75 else 0.0 for r in off])
            paired_tail.append(t_on - t_off)

    def summarise(xs, label):
        if len(xs) < 2:
            return {"n": len(xs), "mean": None, "ci95": None, "separable": False,
                    "label": label}
        m = mean(xs)
        v = sum((x - m) ** 2 for x in xs) / (len(xs) - 1)
        se = math.sqrt(v / len(xs))
        lo, hi = m - 1.96 * se, m + 1.96 * se
        return {"n": len(xs), "mean": round(m, 4), "ci95": [round(lo, 4), round(hi, 4)],
                "separable": (lo > 0 or hi < 0), "label": label}

    pts = summarise(paired_pts, "stacked minus unstacked weekly points, within roster")
    high = summarise(paired_high, "stacked minus unstacked weekly-HIGH rate, within roster")
    prob = summarise(paired_prob, "stacked minus unstacked smoothed win PROBABILITY (proxy)")
    sd = summarise(paired_sd, "stacked minus unstacked weekly SD (the moment stacking moves)")
    tail = summarise(paired_tail, "stacked minus unstacked rate of a top-quartile week (own p75)")

    stacked_n = sum(1 for r in rows if r["stacked"])
    weekly_high_value = 100.0
    dollars = None
    if high["mean"] is not None:
        # A weekly-high RATE difference converts to dollars at $100 a hit over a
        # 14-week regular season. Reported as an ILLUSTRATION of magnitude, never as
        # an earned figure — the CI is what decides whether it is real at all.
        dollars = round(high["mean"] * 14 * weekly_high_value, 1)

    # POWER — the difference between "no effect" and "could not see one", and the
    # only thing that makes a null here reportable at all. exp_stack_correlation
    # predicts a ~2.34 pt/week CEILING premium for a WR1 stack. If our CI half-width
    # is wider than the effect we are hunting, the instrument cannot resolve it and
    # "spans zero" says nothing about the mechanism.
    PREDICTED_CEILING_PREMIUM = 2.343
    def half(r):
        return None if not r.get("ci95") else (r["ci95"][1] - r["ci95"][0]) / 2.0
    powered = {}
    for name, r in (("weekly_points", pts), ("weekly_sd", sd), ("upper_tail_rate", tail)):
        h = half(r)
        powered[name] = {
            "ci_half_width": None if h is None else round(h, 3),
            "can_resolve_predicted_effect": (h is not None and h <= PREDICTED_CEILING_PREMIUM)
            if name != "upper_tail_rate" else None,
        }
    underpowered = [k for k, v in powered.items()
                    if v["can_resolve_predicted_effect"] is False]

    verdict_bits = []
    if not contributing:
        verdict_bits.append("NO ROSTER-SEASON had >=%d weeks on BOTH sides — the within-roster "
                            "design cannot run on this sample." % MIN_WEEKS_EACH_SIDE)
    else:
        for r in (pts, high, prob, sd, tail):
            if r["mean"] is None:
                continue
            verdict_bits.append("%s: %+.4f %s (n=%d roster-seasons)"
                                % (r["label"], r["mean"],
                                   "SEPARABLE from zero" if r["separable"] else "CI spans zero",
                                   r["n"]))
    return {
        "power": {
            "predicted_effect_pts_per_week": PREDICTED_CEILING_PREMIUM,
            "by_channel": powered,
            "underpowered_channels": underpowered,
            "reading": ("UNDERPOWERED — the CI is wider than the effect being hunted, so "
                        "'spans zero' is CANNOT-RESOLVE, not evidence against stacking. Do "
                        "not record this as a null." if underpowered else
                        "powered to resolve an effect of the predicted size"),
        },
        "experiment": "stack conversion — does realized same-team correlation convert to money?",
        "closes": ["stack weight (ships 0.5)", "correlated-variance gap",
                   "proxy->dollars link"],
        "design": ("WITHIN-ROSTER: each roster-season compares its own stacked weeks against "
                   "its own unstacked weeks, so roster quality, manager and schedule are held "
                   "fixed. Outcome is the weekly-HIGH channel (the only dollar channel this "
                   "seat ever activated) plus the continuous proxy."),
        "team_resolution": mode,
        "team_resolution_caveat": (
            "current-team labels mis-tag players who changed teams in older seasons; that "
            "misclassification is toward the NULL (real stacks land in the unstacked bucket), "
            "so a POSITIVE result survives it and a NULL here is ambiguous, not a finding."
            if mode == "current" else "per-season historical teams from nflverse (authoritative)"),
        "seasons": years,
        "roster_weeks": len(rows),
        "stacked_roster_weeks": stacked_n,
        "contributing_roster_seasons": contributing,
        "weekly_points": pts,
        "weekly_high_rate": high,
        "proxy_win_probability": prob,
        "weekly_sd": sd,
        "upper_tail_rate": tail,
        "illustrative_dollars_per_season": dollars,
        "verdict": " | ".join(verdict_bits) if verdict_bits else "no result",
        "installs": "NOTHING. This is evidence for the graduation gate, not a weight change.",
    }


if __name__ == "__main__":
    mode = "current"
    for a in sys.argv[1:]:
        if a.startswith("--teams="):
            mode = a.split("=", 1)[1]
    out = run(mode)
    (HERE / ("exp_stack_conversion_%s.json" % mode)).write_text(json.dumps(out, indent=2))
    print(json.dumps({k: out[k] for k in
                      ("team_resolution", "seasons", "roster_weeks", "stacked_roster_weeks",
                       "contributing_roster_seasons", "weekly_points", "weekly_high_rate",
                       "proxy_win_probability", "weekly_sd", "upper_tail_rate",
                       "illustrative_dollars_per_season", "verdict")},
                     indent=2))
