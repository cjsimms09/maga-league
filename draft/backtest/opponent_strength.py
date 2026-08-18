#!/usr/bin/env python3
# TERRITORY: relay — the GATE on P56, run before anyone builds the arm.
"""DOES DEFENSIVE STRENGTH PERSIST? IF NOT, THE OPPONENT ARM IS DEAD AS A PRIOR.

**P56 is the strongest remaining new-axis candidate**, and the reason is negative:
tonight's prior-art sweep killed the others because they were **already in the
champion**. `own_model_v5.py`'s shipped config carries usage `volume: "share"` and
`pace_lam` at WR/TE, plus xFP efficiency and a Vegas tilt — which is why `pace_arm.json`
and `advanced_efficiency_study.json` both came back `clears: false`. **You cannot beat a
model by handing it what it already has.** There is no opponent term anywhere in it.

── THIS FILE IS THE GATE, NOT THE ARM ─────────────────────────────────────────

C's pace study is the template and its lesson is the whole reason this runs first.
Pace turned out to carry real within-band information — residual ρ 0.15-0.22, 17 of 18
bands positive — **and was still ruled out as a draft-day input on ONE number:
persistence.** Team pace correlates year-over-year at ρ **0.194** then **0.024**, so
last season's pace *"is using a number that will not describe the team being drafted."*

**Defensive strength has to clear that same bar before anyone wires it.** A defense
that was stingy last year and average this year is a prior that misleads, however real
the effect was in-sample.

── WHY THE OPPONENT-ADJUSTED VIEW, NOT RAW POINTS ALLOWED ─────────────────────

A defense's raw points-allowed is contaminated by **who it played**. A unit that faced
six elite offences looks worse than one that faced six bad ones, and ranking on the raw
number partly ranks schedules. So `allowed_vs_expected` credits each defense with the
gap between what the position actually scored on it and what those same players scored
in their OTHER games that season — a same-player, different-defence comparison that
cancels the offence's own quality.

**Same discipline as `nflverse_pace.py`'s raw-vs-neutral split**, and for the same
reason: reporting one blended number hides which half is doing the work.
"""
from __future__ import annotations

import json
import statistics as st
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "data"

# THE THIRD SOURCE OF TEAM CODES, AND IT DISAGREES WITH THE OTHER TWO.
# BDL says WSH/LAR; `component_stats` says WAS/LA. Joining them raw silently drops
# Washington and the Rams as OFFENCES — 311 player-games in 2024, 303 in 2025 — while
# leaving all 32 defences rated, so nothing looks broken. Two whole teams' players
# rate no defence at all, and not at random: those two schedules' opponents are
# systematically under-sampled.
#
# `draft/adp.py` already owns this crosswalk and has since C measured 956 spurious
# team disagreements caused by exactly this. It is imported, never re-typed — a
# fourth copy is how these tables drift. `test_opponent_strength.py` asserts the
# identity, so a private copy cannot reappear.
import sys
sys.path.insert(0, str(HERE.parent))
from adp import NFL_TEAMS, TEAM_ALIASES, _norm_team   # noqa: E402

FANTASY_WEEKS = range(1, 18)
POSITIONS = ("QB", "RB", "WR", "TE")
#: Below this many player-games a defence's number is noise, not a rating.
MIN_GAMES = 6


def spearman(a, b):
    n = len(a)
    if n < 3:
        return None

    def rk(x):
        order = sorted(range(len(x)), key=lambda i: x[i])
        r = [0] * len(x)
        for j, i in enumerate(order):
            r[i] = j
        return r

    ra, rb = rk(a), rk(b)
    ma, mb = st.mean(ra), st.mean(rb)
    num = sum((ra[i] - ma) * (rb[i] - mb) for i in range(n))
    den = (sum((v - ma) ** 2 for v in ra) * sum((v - mb) ** 2 for v in rb)) ** 0.5
    return round(num / den, 4) if den else None


def opponent_by_team_week(schedule: dict) -> dict:
    """`{(team, week): opponent}` from a committed BDL schedule artifact.

    **POSTSEASON GAMES MUST BE DROPPED, AND THE REASON IS NOT "THEY ARE IRRELEVANT."**
    BDL numbers the playoffs 1..5, NOT 19..22 — `nfl_schedule_2025.json` carries
    `postseason: true` rows at weeks 1, 2, 3 and 5. Writing them into the same
    `(team, week)` map silently OVERWRITES the regular-season opponent for all
    fourteen playoff teams, and a `week in 1..17` filter cannot catch it because the
    collision happens INSIDE that range. The result would look completely healthy: a
    full-sized join, no error, and the best teams — the ones the ratings most depend
    on — silently rated against the wrong defences.

    Found before this file was ever run, by checking which weeks `postseason` uses
    rather than assuming it continued the count.
    """
    out = {}
    for g in schedule.get("rows") or []:
        if g.get("postseason"):
            continue
        w, h, a = g.get("week"), _norm_team(g.get("home")), _norm_team(g.get("away"))
        if w is None or not h or not a:
            continue
        out[(h, int(w))] = a
        out[(a, int(w))] = h
    return out


def player_games(components: dict, weekly_points: dict, opp: dict, weeks=None) -> list:
    """One row per player-game: position, defence faced, and points scored.

    Joined on `player_id` + week — `component_stats` carries the team and position,
    `nflverse_weekly_points` carries the score. A player-game missing either side is
    dropped and counted by the caller, never scored as a zero.

    `weeks` narrows the window (the split-half test passes 1..9 then 10..17).
    """
    weeks = FANTASY_WEEKS if weeks is None else weeks
    pts_by_week = {}
    for wk in (weekly_points.get("weeks") or []):
        w = int(wk.get("week", 0))
        if w in weeks:
            pts_by_week[w] = wk.get("points") or {}

    rows = []
    # Counted SEPARATELY because the two causes are different defects with different
    # owners. Lumping them into one `unjoined` is what hid the team-code break: 311
    # dropped games in 2024 looked like ordinary attrition until the number was split
    # and turned out to be two entire teams.
    lost = {"no_opponent": 0, "no_points": 0, "teams_unmatched": {}}
    for wk in (components.get("weeks") or []):
        w = int(wk.get("week", 0))
        if w not in weeks:
            continue
        pts = pts_by_week.get(w) or {}
        for pid, meta in (wk.get("players") or {}).items():
            pos, team = (meta or {}).get("pos"), _norm_team((meta or {}).get("team"))
            if pos not in POSITIONS or not team:
                continue
            d = opp.get((team, w))
            if d is None:
                lost["no_opponent"] += 1
                lost["teams_unmatched"][team] = lost["teams_unmatched"].get(team, 0) + 1
                continue
            p = pts.get(str(pid))
            if p is None:
                lost["no_points"] += 1
                continue
            rows.append({"pid": str(pid), "week": w, "pos": pos,
                         "team": team, "defense": d, "points": float(p)})
    return rows, lost


def allowed_vs_expected(rows: list, min_games: int = MIN_GAMES) -> dict:
    """`{(defense, pos): mean(points - that player's mean in his OTHER games)}`.

    The subtraction is what removes schedule quality: a defence is credited with how
    much better or worse players did AGAINST IT than those same players did elsewhere
    that season. A raw points-allowed table would partly rank schedules instead.
    """
    by_player = {}
    for r in rows:
        by_player.setdefault(r["pid"], []).append(r)

    diffs = {}
    for r in rows:
        others = [x["points"] for x in by_player[r["pid"]] if x["week"] != r["week"]]
        if len(others) < 2:
            continue          # no personal baseline -> he cannot rate a defence
        diffs.setdefault((r["defense"], r["pos"]), []).append(r["points"] - st.mean(others))

    return {k: {"n": len(v), "vs_expected": round(st.mean(v), 3)}
            for k, v in diffs.items() if len(v) >= min_games}


def persistence(a: dict, b: dict, min_shared: int = 8) -> dict:
    """ρ of one window's defence ratings against another's, per position. THE GATE.

    Used two ways, and the distinction decides where the arm may be wired:

      * **`a`=last season, `b`=this season** — the DRAFT-DAY bar. Pace failed exactly
        here (ρ 0.194 then 0.024) despite carrying real within-band signal.
      * **`a`=weeks 1-9, `b`=weeks 10-17 of the SAME season** — the IN-SEASON bar,
        which is a strictly easier and different question: not "does a defence carry
        over a whole offseason of roster churn" but "does what we have seen through
        Week 9 describe Week 10." A weekly projection only ever needs the second.
    """
    out = {}
    for pos in POSITIONS:
        shared = sorted({d for (d, p) in a if p == pos} & {d for (d, p) in b if p == pos})
        if len(shared) < min_shared:
            out[pos] = {"n": len(shared), "rho": None, "reading": "too few shared defences"}
            continue
        rho = spearman([a[(d, pos)]["vs_expected"] for d in shared],
                       [b[(d, pos)]["vs_expected"] for d in shared])
        out[pos] = {"n": len(shared), "rho": rho, "reading": _read(rho)}
    return out


def _read(rho):
    if rho is None:
        return "not measurable"
    if rho >= 0.30:
        return "PERSISTS — clears the draft-day bar"
    if rho >= 0.10:
        return "WEAK — in-season only, where no offseason has to be survived"
    if rho > -0.10:
        return ("NO PERSISTENCE — the earlier window does not describe the later one, "
                "the same finding that ruled pace out as a draft-day input")
    return "NEGATIVE — mean reversion, not skill"


def shuffle_null(a: dict, b: dict, pos: str, k: int = 400, seed: int = 20260818) -> dict:
    """What ρ does this many defences produce by CHANCE? — reported next to every ρ.

    With 32 defences a Spearman ρ of 0.15 is not obviously different from zero, and
    this project has twice been saved by making a null explicit instead of eyeballing
    a coefficient. The rating vectors are held fixed and one side's LABELS are
    permuted, so the null preserves the real distribution of the ratings and destroys
    only the pairing — the thing under test.
    """
    import random

    shared = sorted({d for (d, p) in a if p == pos} & {d for (d, p) in b if p == pos})
    if len(shared) < 8:
        return {"n": len(shared), "runs": 0}
    xa = [a[(d, pos)]["vs_expected"] for d in shared]
    xb = [b[(d, pos)]["vs_expected"] for d in shared]
    obs = spearman(xa, xb)
    rng = random.Random(seed)
    draws = []
    for _ in range(k):
        y = xb[:]
        rng.shuffle(y)
        r = spearman(xa, y)
        if r is not None:
            draws.append(r)
    if obs is None or not draws:
        return {"n": len(shared), "runs": len(draws)}
    beat = sum(1 for r in draws if r >= obs)
    return {
        "n": len(shared), "runs": len(draws), "observed": obs,
        "null_p95": round(sorted(draws)[int(0.95 * len(draws))], 4),
        "p_value": round((beat + 1) / (len(draws) + 1), 4),
        "beats_null": bool((beat + 1) / (len(draws) + 1) <= 0.05),
    }


def _load(path: Path):
    return json.loads(path.read_text()) if path.exists() else None


def ratings_for(season: int, weeks=None, min_games: int = MIN_GAMES):
    """`(ratings, meta)` for one season/window, or `(None, why)` if inputs are missing."""
    sched = _load(DATA / f"nfl_schedule_{season}.json")
    comp = _load(HERE / f"component_stats_{season}.json")
    pts = _load(HERE / f"nflverse_weekly_points_{season}.json")
    missing = [n for n, d in (("schedule", sched), ("components", comp), ("points", pts))
               if d is None]
    if missing:
        return None, {"season": season, "missing": missing}
    opp = opponent_by_team_week(sched)
    rows, lost = player_games(comp, pts, opp, weeks=weeks)
    r = allowed_vs_expected(rows, min_games=min_games)
    return r, {"season": season, "player_games": len(rows), "rated_cells": len(r),
               "lost": lost}


FIRST_HALF, SECOND_HALF = range(1, 10), range(10, 18)


def run(seasons=(2024, 2025)) -> dict:
    """Both bars, every season we have. Writes nothing — `main` owns the artifact."""
    full, meta = {}, {}
    for s in seasons:
        r, m = ratings_for(s)
        meta[s] = m
        if r is not None:
            full[s] = r

    # ── BAR 1: draft-day. Last season's rating vs this season's. ──────────────
    yoy = {}
    have = sorted(full)
    for a, b in zip(have, have[1:]):
        if b - a != 1:
            continue
        yoy[f"{a}->{b}"] = {
            "persistence": persistence(full[a], full[b]),
            "null": {p: shuffle_null(full[a], full[b], p) for p in POSITIONS},
        }

    # ── BAR 2: in-season. Weeks 1-9 vs 10-17 of the SAME season. ──────────────
    # A weekly projection never has to survive an offseason, so this is the bar the
    # weekly loop actually faces — and it is a different question, not a weaker one.
    split = {}
    for s in have:
        h1, m1 = ratings_for(s, weeks=FIRST_HALF, min_games=4)
        h2, m2 = ratings_for(s, weeks=SECOND_HALF, min_games=4)
        if h1 is None or h2 is None:
            continue
        split[str(s)] = {
            "persistence": persistence(h1, h2),
            "null": {p: shuffle_null(h1, h2, p) for p in POSITIONS},
            "coverage": {"first_half": m1, "second_half": m2},
        }

    def _pooled(block, key):
        out = {}
        for pos in POSITIONS:
            rs = [v[key][pos]["rho"] for v in block.values()
                  if v[key][pos].get("rho") is not None]
            out[pos] = {"pairs": len(rs), "rhos": rs,
                        "median": round(st.median(rs), 4) if rs else None,
                        "reading": _read(st.median(rs)) if rs else "not measurable"}
        return out

    return {
        "seasons_loaded": have, "coverage": {str(k): v for k, v in meta.items()},
        "draft_day": {"pairs": yoy, "pooled": _pooled(yoy, "persistence")},
        "in_season": {"seasons": split, "pooled": _pooled(split, "persistence")},
    }


def by_position(res: dict) -> dict:
    """Per-position rulings, because the pooled median HIDES the one real result.

    Pooled across positions the draft-day bar fails — and it should, three of the four
    positions are flat. But RB is not flat, and averaging it against QB/WR/TE is the
    same mistake as reading a raw points-allowed table: a real effect disappears into
    a number that describes nobody. Each position gets its own ruling and its own
    count of how many pairs agreed on the SIGN, which is what separates a stable
    finding from one loud season.
    """
    out = {}
    for pos in POSITIONS:
        d = res["draft_day"]["pooled"][pos]
        i = res["in_season"]["pooled"][pos]
        pos_signs = sum(1 for r in d["rhos"] if r > 0)
        out[pos] = {
            "draft_day": {"median": d["median"], "pairs": d["pairs"],
                          "positive_pairs": pos_signs, "rhos": d["rhos"]},
            "in_season": {"median": i["median"], "pairs": i["pairs"],
                          "positive_pairs": sum(1 for r in i["rhos"] if r > 0),
                          "rhos": i["rhos"]},
            "ruling": _position_ruling(d, i, pos_signs),
        }
    return out


def _position_ruling(d, i, pos_signs) -> str:
    dm, im = d["median"], i["median"]
    if dm is not None and dm >= 0.30 and pos_signs == d["pairs"] and d["pairs"] >= 3:
        return ("DRAFT-DAY ADMISSIBLE — persists year over year at every pair measured. "
                "Still needs an arm graded against the champion before it ships.")
    if im is not None and im >= 0.10:
        return "IN-SEASON ONLY — usable in the weekly projection, not on the board."
    return "NO — does not describe the next window at either bar."


def _verdict(res: dict) -> str:
    d = res["draft_day"]["pooled"]
    i = res["in_season"]["pooled"]
    dm = [v["median"] for v in d.values() if v["median"] is not None]
    im = [v["median"] for v in i.values() if v["median"] is not None]
    if not im:
        return "NOT MEASURABLE — inputs missing; see `coverage`."
    draft_ok = bool(dm) and st.median(dm) >= 0.30
    in_ok = st.median(im) >= 0.10
    if draft_ok and in_ok:
        return ("PERSISTS AT BOTH BARS — an opponent term is admissible as a draft-day "
                "prior AND in the weekly loop.")
    if in_ok:
        return ("IN-SEASON ONLY. Year-over-year persistence does not clear the draft-day "
                "bar (the pace finding again), but the first-half rating DOES describe the "
                "second half — so the opponent term belongs in the WEEKLY projection, "
                "which never has to survive an offseason. Do not wire it into the board.")
    return ("DOES NOT PERSIST AT EITHER BAR — an opponent rating built this way does not "
            "describe the next window. Arm dead as specified; see `null` before retrying.")


def main(argv=None) -> int:
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons", default="2021,2022,2023,2024,2025")
    ap.add_argument("--out", default=str(HERE / "opponent_strength.json"))
    a = ap.parse_args(argv)

    res = run(tuple(int(s) for s in a.seasons.split(",") if s.strip()))
    res["_territory"] = "TERRITORY: relay — the P56 gate, run before anyone builds the arm."
    res["_question"] = ("Does a defence's positional strength persist? Draft-day bar rho>=0.30 "
                        "year-over-year; in-season bar rho>=0.10 first half -> second half.")
    res["by_position"] = by_position(res)
    res["verdict"] = _verdict(res)

    print("=" * 78)
    print("P56 GATE — DOES DEFENSIVE STRENGTH PERSIST?")
    print("=" * 78)
    for label, block in (("DRAFT-DAY (season -> next season)", res["draft_day"]["pairs"]),
                         ("IN-SEASON (weeks 1-9 -> 10-17)", res["in_season"]["seasons"])):
        print(f"\n{label}")
        for k, v in sorted(block.items()):
            cells = "  ".join(
                f"{p} {v['persistence'][p]['rho']!s:>7}"
                f"{'*' if (v['null'][p] or {}).get('beats_null') else ' '}"
                f"(n={v['persistence'][p]['n']})" for p in POSITIONS)
            print(f"  {k:>12}  {cells}")
    print("\n  * = beats a 400-run label-shuffle null at p<=0.05\n")
    for label, pooled in (("draft-day", res["draft_day"]["pooled"]),
                          ("in-season", res["in_season"]["pooled"])):
        print(f"  pooled {label}: " + ", ".join(
            f"{p}={pooled[p]['median']}" for p in POSITIONS))
    print("\n  PER POSITION — the pooled line above hides these:")
    for pos in POSITIONS:
        b = res["by_position"][pos]
        print(f"    {pos}  draft-day {b['draft_day']['median']!s:>7} "
              f"({b['draft_day']['positive_pairs']}/{b['draft_day']['pairs']} pairs positive)"
              f"   in-season {b['in_season']['median']!s:>7}"
              f" ({b['in_season']['positive_pairs']}/{b['in_season']['pairs']})")
        print(f"        {b['ruling']}")

    print("\n" + "=" * 78)
    print(res["verdict"])
    print("=" * 78)

    Path(a.out).write_text(json.dumps(res, indent=1))
    print(f"\nwrote {a.out}")
    return 0


if __name__ == "__main__":   # pragma: no cover
    raise SystemExit(main())
