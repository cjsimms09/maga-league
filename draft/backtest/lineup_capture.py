#!/usr/bin/env python3
# TERRITORY: A
"""EXP-35 — THE LINEUP CAPTURE-RATE INSTRUMENT (LAB-REGISTRY.md row 35).

L0 measured the prize: $520 / $637.50 / $520 per team per season left on the
table by lineup decisions (lab-results.json, L0-lineup-ceiling-money). L0's
ceiling is hindsight and UNREACHABLE BY CONSTRUCTION — it knows the outcomes.
This module measures what fraction of the reachable, lineup-only ceiling a
decision-time policy actually captures, and whether the LIVE tool's shipped
logic captures more of it than a naive PPG ranking. It is an instrument, not a
search: nothing here tunes anything.

── PRE-REGISTRATION — fixed BEFORE this module produced its first number ──────

THE ARMS (each produces {week: score} for one seat — the §13 contract):

    ACTUAL   the starters really set     — certified: reproduces Sleeper's own
                                           recorded weekly points to the cent
                                           (replay_lineup, instrument check)
    CEILING  per-week hindsight optimum  — certified replay_lineup CEILING: the
                                           best legal lineup from THAT WEEK'S
                                           roster. NOT L0's season-pool ceiling,
                                           which includes acquisition timing and
                                           would hand every arm 65-70% more
                                           headroom than a lineup decision can
                                           use (the two-ceilings finding,
                                           test_replay_lineup.py)
    NAIVE    highest season-to-date PPG  — certified replay_lineup NAIVE arm:
                                           rank by mean points over weeks
                                           1..N-1, this seat's players only
    TOOL     the LIVE lineup tool        — src/routes/lineup.js optimize(),
                                           E[$] = P(win)·$110 + P(clear the
                                           weekly-high band)·$100, driven via
                                           node (lineup_capture_runner.js) with
                                           walk-forward inputs. THE REAL MODULE,
                                           not a Python port — a re-implementation
                                           graded instead of the shipped tool is
                                           the defect class this repo keeps
                                           catching. Shipped parameters
                                           untouched (matchupValue $110,
                                           weeklyHigh $100, defaults).

THE METRIC, fixed in advance, per season-seat over regular-season weeks:

    CAPTURE RATE(arm) = (arm_points − NAIVE_points) / (CEILING_points − NAIVE_points)

so NAIVE = 0 and CEILING = 1 by construction, and dollars through the certified
money_grade.grade_substituted (weekly-high + regular-season, the same L0 basis;
playoff $ is withheld by the grader when the replay does not cover bracket
weeks). The dollar headline is mean per-seat (TOOL$ − NAIVE$) per season with a
95% t-interval over the 10 seats.

THE AS-OF RULE, enforced by signature: the TOOL's projections for week N are
replay_lineup._history_means(season, seat, N) — weeks strictly before N — and
every contextual input (weekly-high band, position sigmas, typical-opponent
score, the opponent's estimated mean) is assembled by _asof_context /
_opponent_asof_mean from prior completed seasons plus current-season weeks
< N only. The runner receives those numbers and nothing else; week N's
players_points never reach a decision.

THE LEAK DETECTOR (§3c of the three-season-replay pre-registration), armed on
every run: any arm scoring ABOVE the per-week ceiling in any week is not a good
result, it is a broken harness — SystemExit, no artifact.

THE READING, fixed in advance (registry row 35 + replay prereg §5):
  * TOOL mean $ > NAIVE mean $ in 3/3 seasons  -> the tool's logic captures
    more of the ceiling than naive PPG ranking; strongest claim at n=3 seasons.
  * 2/3 -> suggestive, reported as suggestive.
  * 1/3 or 0/3 -> not demonstrated, and that is the finding.
  * Capture near 100% of the ceiling -> treated as lookahead contamination,
    not a triumph (30-50% would be a strong honest result). Flagged, never
    celebrated.
  * n = 3 seasons is the clustering unit; no CI is computed over seasons.
    The per-season CI is over 10 seats, which share a schedule and compete for
    the same weekly-high dollars — stated as a limit, not hidden.

NO TUNING: no constant, weight or threshold of the live tool changes on this
measurement (no_fit_guard: configs_tried=1, promotable=False). If the tool
loses, the number is reported and the tool still does not get fitted here.

WHAT THIS DOES NOT ESTABLISH: the walk-forward projections (trailing per-seat
means) are almost certainly weaker than a live projection feed, so the measured
capture is a FLOOR for what the tool could capture with 2026-quality inputs —
the registry's own framing. And 2023-25 hold no as-of injury/bye flags, so the
tool's active-projection guard cannot fire; NAIVE is equally blind, so the
comparison stays fair while both arms are worse than a live manager would be.

Run: python3 draft/backtest/lineup_capture.py
Artifact: draft/data/lineup_capture_2023_25.json (registered in
draft/data/artifact_registry.json; regeneration needs node on PATH).
"""
from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import tempfile
from statistics import mean, stdev

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import lab                     # noqa: E402 — _git_head, the one provenance stamp
import money_grade as MG       # noqa: E402
import no_fit_guard as NFG     # noqa: E402
import replay_lineup as RL     # noqa: E402

RUNNER = HERE / "lineup_capture_runner.js"
OUT_PATH = HERE.parent / "data" / "lineup_capture_2023_25.json"
SEASONS = ("2023", "2024", "2025")
DEDICATED = ("QB", "RB", "WR", "TE", "K", "DEF")
EPS = 1e-6
T95_DF9 = 2.262   # two-sided 95% t critical value, df = 9 (10 seats)


# ── the leak detector — §3c, mechanical ──────────────────────────────────────

def assert_no_leak(arm: str, arm_weekly: dict, ceiling_weekly: dict,
                   season=None, roster_id=None) -> None:
    """Any arm above the per-week hindsight ceiling in ANY week is a broken
    harness, not a good week. SystemExit rather than a warning, so a
    contaminated run cannot produce an artifact at all."""
    for w, v in arm_weekly.items():
        c = ceiling_weekly.get(w)
        if c is None:
            raise SystemExit(
                "LEAK DETECTOR: arm %s has week %s but the ceiling does not "
                "(season %s seat %s) — the arms are not on the same weeks."
                % (arm, w, season, roster_id))
        if v > c + EPS:
            raise SystemExit(
                "LEAK DETECTOR FIRED: arm %s scored %.2f in week %s, above the "
                "per-week hindsight ceiling %.2f (season %s seat %s). A "
                "decision-time arm beating perfect hindsight means it saw the "
                "future; the harness is broken and no artifact is written."
                % (arm, v, w, c, season, roster_id))


# ── the as-of window — everything the tool is allowed to know ────────────────

def _chronology(history: dict) -> list:
    """[(season_str, week, top_score, [team_scores], {pos: [player_pts]})] for
    every regular-season week of every completed season, in season order. Built
    once; _asof_context slices it. Positions come from the certified merged map
    (static file widened by the league's own lineups)."""
    pos_of = RL.positions_map(history)
    out = []
    for s in (history.get("seasons") or []):
        if not (s.get("weeks") or {}):
            continue
        yr = str(s.get("season"))
        field = MG.field_weekly_scores(s)
        for w in MG.regular_season_weeks(s):
            scores = field.get(w) or {}
            if not scores:
                continue
            by_pos: dict = {}
            for row in RL.week_rows(s, w):
                for pid, pts in (row.get("players_points") or {}).items():
                    p = pos_of.get(str(pid))
                    if p:
                        by_pos.setdefault(p, []).append(float(pts))
            out.append((yr, w, round(max(scores.values()), 2),
                        [round(v, 2) for v in scores.values() if v > 0], by_pos))
    return out


def asof_context(chronology: list, season_key, week: int) -> dict:
    """Band samples, typical-team score and per-position sigmas from prior
    completed seasons PLUS current-season weeks < `week`. THE AS-OF WINDOW:
    the current week and everything after it are excluded, which is why 2023
    week 1 returns an empty band — no prior season exists in the harvest and
    no current week has been played. The live tool reads the same quantities
    from completed seasons (weeklyHighBand / typicalTeamScore /
    positionSigmas); this is the walk-forward reconstruction of those inputs
    for a moment when today's three completed seasons did not yet exist."""
    yr = str(season_key)
    wins, team, by_pos = [], [], {}
    for (y, w, top, scores, pos_pts) in chronology:
        if y > yr or (y == yr and w >= week):
            continue
        wins.append(top)
        team.extend(scores)
        for p, pts in pos_pts.items():
            by_pos.setdefault(p, []).extend(pts)
    sigmas = {p: round(stdev(v), 2) for p, v in by_pos.items() if len(v) >= 2}
    team_sorted = sorted(team)
    n = len(team_sorted)
    return {
        "bandSamples": sorted(wins),
        "typicalMedian": team_sorted[n // 2] if n else None,
        "typicalSd": round(stdev(team_sorted), 2) if n >= 2 else None,
        "sigmaByPos": sigmas,
    }


def _opponent_asof_mean(recorded_by_rid: dict, opp_rid, week: int) -> float | None:
    """The opponent's mean recorded team score over weeks 1..week-1. As-of by
    construction — the slice ends strictly before the week under decision.
    None when no history exists yet (week 1)."""
    if opp_rid is None:
        return None
    hist = [v for w, v in (recorded_by_rid.get(opp_rid) or {}).items() if w < week]
    return round(mean(hist), 2) if hist else None


# ── the TOOL arm's decision requests — as-of enforced by signature ───────────

def decision_request(season: dict, roster_id: int, week: int, pos_of: dict,
                     ctx: dict, opp_mean: float | None) -> dict | None:
    """One request for the live optimizer. The ONLY per-player number it
    carries is the walk-forward projection — RL._history_means(season, seat,
    week), weeks strictly before `week`, the SAME input NAIVE ranks by — so
    TOOL vs NAIVE isolates the tool's E[$] objective, not an information edge.

    Players the live tool itself could not place (no dedicated-slot position —
    the FLEX_ONLY case) are excluded here because the live module excludes
    them too: its inferPositions falls back to player_positions.json, which
    lacks exactly these ids, and bestLineup drops unmapped players. Excluding
    them reproduces the shipped behaviour; the certified NAIVE/CEILING arms
    CAN flex such a player, so the named bias is conservative AGAINST the
    tool (one such player on this history)."""
    row = RL.seat_row(season, week, roster_id)
    if not row:
        return None
    means = RL._history_means(season, roster_id, week)   # the as-of boundary
    roster = []
    for pid in (row.get("players") or []):
        pid = str(pid)
        p = pos_of.get(pid)
        if p not in DEDICATED:
            continue
        roster.append({"id": pid, "name": pid, "pos": p,
                       "proj": round(means.get(pid, 0.0), 4)})
    slots: dict = {}
    for slot in RL.starting_slots(season):
        slots[slot] = slots.get(slot, 0) + 1
    req = {
        "key": "%s:%s:%s" % (season.get("season"), roster_id, week),
        "roster": roster,
        "slots": slots,
        "sigmaByPos": ctx["sigmaByPos"],
        # No opponent history and no prior season -> 0, which optimize() treats
        # as "no opponent": the matchup term is disabled, exactly the live
        # behaviour with nothing to feed it.
        "oppMean": opp_mean if opp_mean is not None else (ctx["typicalMedian"] or 0),
        "bandSamples": ctx["bandSamples"],
    }
    if ctx["typicalSd"] is not None:
        req["oppSd"] = ctx["typicalSd"]
    return req


def run_tool(decisions: list) -> dict:
    """Drive the LIVE src/routes/lineup.js through node, one process for the
    whole batch. Returns {key: {starters, why}}."""
    payload = json.dumps({"decisions": decisions})
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        f.write(payload)
        req_path = f.name
    try:
        proc = subprocess.run(["node", str(RUNNER), req_path],
                              capture_output=True, text=True, timeout=600)
    finally:
        pathlib.Path(req_path).unlink(missing_ok=True)
    if proc.returncode != 0:
        raise SystemExit("TOOL runner failed (%s): %s"
                         % (proc.returncode, proc.stderr[:2000]))
    return json.loads(proc.stdout)["decisions"]


# ── grading ──────────────────────────────────────────────────────────────────

def _money(g: dict) -> float:
    """Weekly-high + regular-season dollars — the L0 basis. Playoff $ is
    withheld by the grader for arms that stop at the regular season and is
    deliberately NOT summed here."""
    return round((g.get("weekly_high") or 0) + (g.get("regular_season") or 0), 2)


def _capture(arm_pts: float, naive_pts: float, ceiling_pts: float) -> float | None:
    denom = ceiling_pts - naive_pts
    if denom <= EPS:
        return None
    return round((arm_pts - naive_pts) / denom, 4)


def _ci95_over_seats(deltas: list) -> dict:
    m = mean(deltas)
    if len(deltas) < 2:
        return {"mean": round(m, 2), "lo": None, "hi": None, "n": len(deltas)}
    half = T95_DF9 * stdev(deltas) / (len(deltas) ** 0.5)
    return {"mean": round(m, 2), "lo": round(m - half, 2),
            "hi": round(m + half, 2), "n": len(deltas)}


# ── the run ──────────────────────────────────────────────────────────────────

def run() -> dict:
    """The whole instrument, no arguments (artifact-registry pattern). Prints
    nothing to stdout — the freshness checker json-parses a caller's print."""
    history = MG.load_history()
    payouts = MG.load_payouts()
    pos_of = RL.positions_map(history)
    missing = RL.unmapped_starters(history, pos_of)
    if missing:
        raise SystemExit("REFUSING: %d starter(s) with no position: %s — the "
                         "ceiling would read LOW and flatter every arm."
                         % (len(missing), missing[:10]))

    chron = _chronology(history)

    # Build every TOOL decision first, then one node call for the whole batch.
    decisions, seats_by_season = [], {}
    for season_key in SEASONS:
        s = MG.season_of(history, season_key)
        if not s:
            continue
        rids = sorted({int(r["roster_id"]) for r in RL.week_rows(s, 1)})
        seats_by_season[season_key] = rids
        matchups = MG.weekly_matchups(s)
        recorded = {rid: RL.recorded(history, season_key, rid) for rid in rids}
        for w in MG.regular_season_weeks(s):
            ctx = asof_context(chron, season_key, w)
            for rid in rids:
                opp = (matchups.get(w) or {}).get(rid)
                opp_mean = _opponent_asof_mean(recorded, opp, w)
                req = decision_request(s, rid, w, pos_of, ctx, opp_mean)
                if req:
                    decisions.append(req)
    tool_out = run_tool(decisions)

    rows = []
    for season_key in SEASONS:
        s = MG.season_of(history, season_key)
        if not s:
            continue
        for rid in seats_by_season[season_key]:
            actual = RL.replay(history, season_key, rid, "ACTUAL", pos_of)
            ceiling = RL.replay(history, season_key, rid, "CEILING", pos_of)
            naive = RL.replay(history, season_key, rid, "NAIVE", pos_of)

            tool_weekly, tool_why = {}, []
            for w in MG.regular_season_weeks(s):
                key = "%s:%s:%s" % (season_key, rid, w)
                dec = tool_out.get(key)
                row = RL.seat_row(s, w, rid)
                if not dec or not row:
                    continue
                pts = {k: float(v) for k, v in (row.get("players_points") or {}).items()}
                score = round(sum(pts.get(p, 0.0) for p in dec["starters"]), 2)
                tool_weekly[w] = score
                tool_why.append({"week": w, "starters": dec["starters"],
                                 **dec["why"]})

            # THE HARD INVARIANT, per §3c: every decision-time arm bounded by
            # the per-week hindsight ceiling, every week. ACTUAL included — it
            # is an instrument check and a violation means the ceiling itself
            # is broken (the Henry/Chase defect class).
            for arm_name, arm_weekly in (("TOOL", tool_weekly), ("NAIVE", naive),
                                         ("ACTUAL", actual)):
                assert_no_leak(arm_name, arm_weekly, ceiling, season_key, rid)

            graded = {name: MG.grade_substituted(history, payouts, season_key, rid, wk)
                      for name, wk in (("actual", actual), ("ceiling", ceiling),
                                       ("naive", naive), ("tool", tool_weekly))}
            pts_of = {name: round(sum(wk.values()), 2)
                      for name, wk in (("actual", actual), ("ceiling", ceiling),
                                       ("naive", naive), ("tool", tool_weekly))}
            dollars = {name: _money(g) for name, g in graded.items()}
            d_denom = dollars["ceiling"] - dollars["naive"]
            owner = (s.get("owners") or {}).get(str(rid)) or {}
            rows.append({
                "season": season_key, "roster_id": rid,
                "owner": owner.get("display_name"),
                "points": pts_of,
                "capture_rate_points": {
                    "tool": _capture(pts_of["tool"], pts_of["naive"], pts_of["ceiling"]),
                    "actual": _capture(pts_of["actual"], pts_of["naive"], pts_of["ceiling"]),
                },
                "dollars": dollars,
                "dollar_delta": {
                    "tool_vs_naive": round(dollars["tool"] - dollars["naive"], 2),
                    "tool_vs_actual": round(dollars["tool"] - dollars["actual"], 2),
                    "naive_vs_actual": round(dollars["naive"] - dollars["actual"], 2),
                    "ceiling_vs_naive": round(d_denom, 2),
                },
                "capture_rate_dollars": {
                    "tool": round((dollars["tool"] - dollars["naive"]) / d_denom, 4)
                            if abs(d_denom) > 0.01 else None,
                },
                "weekly": {"actual": actual, "ceiling": ceiling,
                           "naive": naive, "tool": tool_weekly},
                "tool_weekly_why": tool_why,
            })

    # ── per-season aggregation + the honest CI ───────────────────────────────
    per_season = []
    for season_key in SEASONS:
        srows = [r for r in rows if r["season"] == season_key]
        if not srows:
            continue
        deltas = [r["dollar_delta"]["tool_vs_naive"] for r in srows]
        crs = [r["capture_rate_points"]["tool"] for r in srows
               if r["capture_rate_points"]["tool"] is not None]
        cra = [r["capture_rate_points"]["actual"] for r in srows
               if r["capture_rate_points"]["actual"] is not None]
        per_season.append({
            "season": season_key,
            "n_seats": len(srows),
            "tool_minus_naive_dollars": _ci95_over_seats(deltas),
            "seats_tool_above_naive": sum(1 for d in deltas if d > 0),
            "seats_tool_below_naive": sum(1 for d in deltas if d < 0),
            "mean_capture_rate_points_tool": round(mean(crs), 4) if crs else None,
            "mean_capture_rate_points_actual": round(mean(cra), 4) if cra else None,
            "mean_tool_minus_naive_points": round(
                mean(r["points"]["tool"] - r["points"]["naive"] for r in srows), 2),
            "mean_ceiling_minus_naive_dollars": round(
                mean(r["dollar_delta"]["ceiling_vs_naive"] for r in srows), 2),
        })

    seasons_tool_wins = sum(
        1 for p in per_season if p["tool_minus_naive_dollars"]["mean"] > 0)
    pooled_cr = [r["capture_rate_points"]["tool"] for r in rows
                 if r["capture_rate_points"]["tool"] is not None]
    mean_cr = round(mean(pooled_cr), 4) if pooled_cr else None
    contamination_flag = mean_cr is not None and mean_cr > 0.9

    # The pre-registered reading, applied mechanically.
    if contamination_flag:
        reading = ("SUSPECT LEAK: mean capture %.0f%% of the hindsight ceiling. "
                   "Per the pre-registration this is treated as lookahead "
                   "contamination, not a triumph, until the path is named."
                   % (100 * mean_cr))
    elif seasons_tool_wins == 3:
        reading = ("TOOL captures more of the ceiling than naive PPG ranking in "
                   "3/3 seasons (mean seat dollars). Strongest claim this design "
                   "supports at n=3 seasons; not a promotion.")
    elif seasons_tool_wins == 2:
        reading = "TOOL above NAIVE in 2/3 seasons — suggestive, no more."
    else:
        reading = ("TOOL above NAIVE in %d/3 seasons — advantage over naive PPG "
                   "ranking NOT demonstrated, and that is the finding."
                   % seasons_tool_wins)

    headline = NFG.record(NFG.ReplayResult(
        label="EXP-35 lineup capture rate",
        arm="TOOL (live lineup.js) vs NAIVE (season-to-date PPG)",
        seasons=list(SEASONS),
        value={"per_season_tool_minus_naive_dollars":
               {p["season"]: p["tool_minus_naive_dollars"] for p in per_season},
               "seasons_tool_above_naive": seasons_tool_wins,
               "pooled_mean_capture_rate_points": mean_cr,
               "reading": reading},
        configs_tried=1,           # the shipped tool, measured once — no sweep
        selected_from_search=False,
        promotable=False,          # an instrument reading, never an install
    ))

    node_v = subprocess.run(["node", "--version"], capture_output=True,
                            text=True).stdout.strip()
    return {
        "id": "EXP-35-lineup-capture-rate",
        "registry": "LAB-REGISTRY.md row 35 — LINEUP-POLICY CAPTURE RATE",
        "preregistration": "module docstring of draft/backtest/lineup_capture.py; "
                           "arms, metric, reading and no-tuning rule fixed before "
                           "the first result was computed",
        "provenance": {
            "git_head": lab._git_head(),
            "history": "draft/data/league_history.json (provenance.complete=%s)"
                       % bool((history.get("provenance") or {}).get("complete")),
            "payouts": "draft/config/payouts.json (era-correct by_season)",
            "tool": "src/routes/lineup.js#optimize via "
                    "draft/backtest/lineup_capture_runner.js (node %s)" % node_v,
            "grader": "money_grade.grade_substituted (certified to the dollar)",
            "plumbing": "replay_lineup ACTUAL/CEILING/NAIVE (certified: ACTUAL "
                        "reproduces Sleeper's recorded scores; ceiling is the "
                        "per-week, lineup-only bound)",
        },
        "arms_why": {
            "ACTUAL": "the starters really set — Sleeper's own record, replayed "
                      "by the certified plumbing (instrument check).",
            "CEILING": "per-week hindsight optimum over that week's actual "
                       "roster — bounds lineup-only decisions. NOT the L0 "
                       "season-pool ceiling (which adds acquisition timing).",
            "NAIVE": "rank this seat's players by mean points over weeks 1..N-1 "
                     "and fill the slots — a competent no-tools manager.",
            "TOOL": "the LIVE optimizer's E[$] objective, shipped parameters, "
                    "fed the SAME walk-forward means NAIVE ranks by, plus as-of "
                    "band/sigma/opponent context — so TOOL vs NAIVE isolates "
                    "the objective, not an information edge. Per-week WHY "
                    "records (pWin, pHigh, edge, calls) ride in each row.",
        },
        "invariants": {
            "leak_detector": "armed: any arm > per-week ceiling in any week => "
                             "SystemExit before any artifact is written",
            "violations": 0,
            "arms_checked_per_week": ["TOOL", "NAIVE", "ACTUAL"],
        },
        "rows": rows,
        "per_season": per_season,
        "headline": headline,
        "limits": [
            "no as-of injury/bye flags exist for 2023-25, so the tool's "
            "active-projection guard cannot fire; NAIVE is equally blind — "
            "fair comparison, both arms below a live manager's information.",
            "walk-forward projections are trailing per-seat means — weaker than "
            "a live projection feed, so measured capture is a FLOOR "
            "(registry row 35's own framing).",
            "2023 has no prior completed season in the harvest: the band, "
            "sigmas and typical-opponent inputs warm up in-season; week 1 of "
            "every season is uninformed for both decision arms (all-zero "
            "projections, deterministic tie-breaking).",
            "the 10 seats of a season share a schedule and compete for the "
            "same weekly-high dollars, so per-seat deltas are not independent; "
            "the per-season CI over seats is reported with that caveat and no "
            "CI is computed over the 3 seasons.",
            "one flex-only player (no dedicated-slot record anywhere) is "
            "startable by NAIVE/CEILING but not by the live tool — a named, "
            "conservative bias against TOOL.",
            "weekly-high $ is quantised at $100/week, so dollar deltas are "
            "lumpy; the points capture rate is the smooth companion metric.",
        ],
    }


def main() -> int:
    art = run()
    OUT_PATH.write_text(json.dumps(art, indent=1))
    print("EXP-35 — LINEUP CAPTURE RATE (per-week ceiling, certified grader)\n")
    print("season  mean TOOL−NAIVE $ [95% CI over 10 seats]   seats>0  "
          "capture(tool)  capture(actual)")
    for p in art["per_season"]:
        ci = p["tool_minus_naive_dollars"]
        print("%s    %+8.2f  [%s, %s]                 %d/10     %s          %s"
              % (p["season"], ci["mean"], ci["lo"], ci["hi"],
                 p["seats_tool_above_naive"],
                 p["mean_capture_rate_points_tool"],
                 p["mean_capture_rate_points_actual"]))
    print("\n" + art["headline"]["value"]["reading"])
    print("\nwrote %s" % OUT_PATH)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
