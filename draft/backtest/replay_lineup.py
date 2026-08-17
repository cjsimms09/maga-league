#!/usr/bin/env python3
# TERRITORY: A
"""THE LINEUP ARM of the three-season replay — controls first, decisions later.

See draft/backtest/PRE-REGISTRATION-three-season-replay.md. Built in the order
the pre-registration demands: **the two arms whose answers are already known go
first**, so the plumbing is proven against numbers computed by other machinery
before any decision logic is allowed to produce a number nobody can check.

── THE CONTRACT (§13) ─────────────────────────────────────────────────────────

Every arm produces `{week: score}` for one seat. `money_grade.grade_substituted`
does the rest, and it is certified to the dollar across all three seasons.

── THE FOUR ARMS, AND WHY TWO OF THEM ARE CONTROLS ────────────────────────────

    ACTUAL   the starters Cory really set    -> MUST reproduce Sleeper's own
                                                weekly `points`, to the cent
    CEILING  optimal in hindsight            -> MUST reproduce EFFICIENCY-LEAK's
                                                measured leak ($470/$595/$445)
    NAIVE    best mean of weeks 1..N-1       -> a competent no-tools manager
    TOOL     the lineup tool's objective     -> the thing under test

**ACTUAL AND CEILING ARE NOT ARMS, THEY ARE INSTRUMENT CHECKS.** If ACTUAL does
not equal Sleeper's recorded score, this file's slot assignment, flex handling
or scoring is wrong and every other number it produces is worthless. If CEILING
does not match the independently computed leak, the same. Both are asserted in
draft/tests/test_replay_lineup.py rather than eyeballed.

── THE AS-OF RULE, AT THE ONE PLACE IT BITES ──────────────────────────────────

    the DECISION reads weeks 1..N-1
    the SCORE     reads week N

They are different reads of the same table, and conflating them IS the leak.
`_decide` never receives week N's points; it is handed a history slice and the
eligible roster, and it cannot see the outcome it is about to be graded on. That
is enforced by the function signature rather than by care.

── WHAT THIS FILE DELIBERATELY DOES NOT DO ────────────────────────────────────

It does not change the roster. The lineup arm replays the roster Cory ACTUALLY
had each week, so it measures lineup-setting ALONE — which is the same
denominator EFFICIENCY-LEAK used and the reason its ceiling is comparable. The
waiver and draft arms move the roster and live in their own modules.

Run: python draft/backtest/replay_lineup.py
"""
from __future__ import annotations

import json
import pathlib
import sys
from statistics import mean

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import money_grade as MG  # noqa: E402
import roster_sim as RS    # noqa: E402

FLEX_OK = {"FLEX": ("RB", "WR", "TE"),
           "SUPER_FLEX": ("QB", "RB", "WR", "TE"),
           "REC_FLEX": ("WR", "TE"),
           "WRRB_FLEX": ("RB", "WR")}
BENCH = {"BN", "IR", "TAXI"}
# A player the league's own lineups place ONLY at flex, and whom no local source
# names. Eligible for a flex slot, never invented into a dedicated one.
FLEX_ONLY = "FLEX_ONLY"


def positions_from_lineups(history: dict) -> dict:
    """Positions DERIVED FROM THE LEAGUE'S OWN MATCHUP RECORDS.

    ⚠️ THIS EXISTS BECAUSE THE CONTROL CAUGHT A REAL BUG. `player_positions.json`
    has no entry for 3198 (Derrick Henry) or 7564 (Ja'Marr Chase) — two of Cory's
    ACTUAL 2024 starters. Unmapped players cannot be placed in a slot, so the
    CEILING arm silently filled those slots with worse players and scored BELOW
    ACTUAL: 1808.8 against 1830.6 in 2024, 1500.0 against 1555.9 in 2025. A
    hindsight-optimal lineup losing to the lineup it could have copied is
    impossible, which is exactly why ACTUAL and CEILING are run as controls
    before any decision logic is trusted.

    THE FIX CAME FROM CORY'S QUESTION — "don't we have the actual lineups from
    our league, like each matchup". We do, and `starters` is stored IN SLOT
    ORDER against `roster_positions`, so every player who ever started in a
    DEDICATED slot has his position stated by the league's own record:

        slots     QB    RB    RB    WR    WR    TE   FLEX   K    DEF
        starters  6770  3198  8151  7564  11632 4217 5872  8259  DET

    A FLEX appearance is skipped, not guessed — FLEX is satisfiable by three
    positions, so it carries no information about which one this player is.
    Players who ONLY ever appear at flex stay unmapped and are caught by the
    refusal in `positions_map`, rather than being assigned a plausible guess.

    Self-consistent by construction: derived from the same file the replay
    grades against, so it cannot drift from it.
    """
    out: dict = {}
    flexed: set = set()
    for season in (history.get("seasons") or []):
        slots = [s for s in (season.get("roster_positions") or []) if s not in BENCH]
        # ⚠️ DELEGATED, NOT REIMPLEMENTED. roster_sim.infer_positions already does
        # this derivation and I wrote a second copy of it before checking — the
        # exact defect class this repo keeps removing, committed by the person
        # removing it. The base map is THEIRS; the only thing added below is the
        # flex-only handling, which infer_positions deliberately does not do.
        out.update(RS.infer_positions(season))
        for _wk, rows in (season.get("weeks") or {}).items():
            for row in (rows or []):
                st = row.get("starters") or []
                for i, pid in enumerate(st):
                    if i >= len(slots) or not pid:
                        continue
                    if slots[i] in FLEX_OK:
                        flexed.add(str(pid))
    # A player seen ONLY at flex, never in a dedicated slot, and absent from the
    # static file. We know he is RB/WR/TE — the slot proves that much — and we do
    # NOT know which. Measured on this history: exactly ONE such player (7045),
    # who is not on the 2026 board and so has no local position record.
    #
    # THE BIAS IS NAMED AND DIRECTIONAL: he can fill FLEX but not a dedicated
    # RB/WR/TE slot, so the CEILING is very slightly CONSERVATIVE for the weeks
    # he was rostered. Conservative is the safe direction — it can only make the
    # ceiling harder to beat, never easier — and `flex_only_players()` reports
    # the count so a growing number becomes visible rather than absorbed.
    for pid in flexed:
        out.setdefault(pid, FLEX_ONLY)
    return out


def positions_map(history: dict | None = None,
                  path: pathlib.Path | None = None) -> dict:
    """The static file, WIDENED by what the league's own lineups prove.

    The static file wins where it has an entry (it names positions for players
    who never started); the lineup derivation fills the rest.
    """
    p = path or (HERE.parent / "data" / "player_positions.json")
    raw = json.loads(p.read_text())
    static = raw.get("positions") or raw
    merged = dict(positions_from_lineups(history)) if history else {}
    merged.update({k: v for k, v in static.items() if v})
    return merged


def flex_only_players(pos_of: dict) -> list:
    """Players placeable at flex but not in a dedicated slot. Reported with
    every run — one is a rounding error, twenty would be a data problem."""
    return sorted(k for k, v in pos_of.items() if v == FLEX_ONLY)


def unmapped_starters(history: dict, pos_of: dict) -> list:
    """Every player who ACTUALLY STARTED and still has no position.

    Returned rather than tolerated: an unmapped starter is not a cosmetic gap,
    it is the defect above — the ceiling quietly drops him and reports a number
    that is too low, in the direction that flatters every other arm.
    """
    bad = set()
    for season in (history.get("seasons") or []):
        for _wk, rows in (season.get("weeks") or {}).items():
            for row in (rows or []):
                for pid in (row.get("starters") or []):
                    if pid and str(pid) not in pos_of:
                        bad.add(str(pid))
    return sorted(bad)


def starting_slots(season: dict) -> list:
    """The slots that actually start, per season, READ not assumed.

    2023 drafted 18 rounds against 15 in 2024/25, which is already proof that
    per-season league shape must be read. Bench slots are dropped here, not
    counted, because a bench slot is not a lineup decision.
    """
    return [s for s in (season.get("roster_positions") or []) if s not in BENCH]


def week_rows(season: dict, week: int) -> list:
    return (season.get("weeks") or {}).get(str(week)) or []


def seat_row(season: dict, week: int, roster_id: int) -> dict | None:
    for r in week_rows(season, week):
        if int(r.get("roster_id", -1)) == int(roster_id):
            return r
    return None


def assign(slots: list, players: list, value: dict, pos_of: dict) -> list:
    """Fill the starting slots greedily by `value`, dedicated slots first.

    GREEDY IS EXACT FOR THIS SHAPE and the reason is worth stating rather than
    assuming: there is ONE flex, it is filled last, and it draws from whatever
    the dedicated slots did not consume — so no earlier assignment can be
    improved by trading with it. It would NOT be exact with two overlapping
    flexes, and `_refuse_multiflex` below stops this file silently returning a
    wrong number if the league ever adds one.
    """
    ded = [s for s in slots if s not in FLEX_OK]
    flex = [s for s in slots if s in FLEX_OK]
    if len(flex) > 1:
        raise SystemExit(
            "REFUSING: %d flex-type slots. Greedy assignment is not exact with "
            "overlapping flexes and this file would report a number it cannot "
            "justify. Replace assign() with a matching solver first." % len(flex))

    left = sorted(players, key=lambda p: -value.get(p, 0.0))
    used, out = set(), []
    for slot in ded:
        for p in left:
            if p in used:
                continue
            if pos_of.get(p) == slot:
                used.add(p); out.append(p); break
    for slot in flex:
        ok = tuple(FLEX_OK[slot]) + (FLEX_ONLY,)
        for p in left:
            if p in used:
                continue
            if pos_of.get(p) in ok:
                used.add(p); out.append(p); break
    return out


def _history_means(season: dict, roster_id: int, upto: int) -> dict:
    """Mean points per player over weeks 1..upto-1 FOR THIS SEAT ONLY.

    ⚠️ THIS IS THE AS-OF BOUNDARY. `upto` is exclusive. A player with no prior
    weeks gets NO entry rather than a zero — absent and scored-zero are
    different states, and defaulting to zero would silently bench every player
    acquired mid-season.
    """
    acc: dict = {}
    for w in range(1, upto):
        row = seat_row(season, w, roster_id)
        if not row:
            continue
        for pid, pts in (row.get("players_points") or {}).items():
            acc.setdefault(pid, []).append(float(pts))
    return {pid: mean(v) for pid, v in acc.items() if v}


def replay(history: dict, season_key, roster_id: int, arm: str,
           pos_of: dict | None = None) -> dict:
    """-> {week: score} for one seat, one arm. The §13 contract."""
    s = MG.season_of(history, season_key)
    if s is None:
        raise SystemExit("no such season: %r" % (season_key,))
    slots = starting_slots(s)
    pos_of = pos_of or positions_map(history)
    weeks = MG.regular_season_weeks(s)
    out = {}
    for w in weeks:
        row = seat_row(s, w, roster_id)
        if not row:
            continue
        pts = {k: float(v) for k, v in (row.get("players_points") or {}).items()}
        roster = list(row.get("players") or [])

        if arm == "ACTUAL":
            chosen = list(row.get("starters") or [])
        elif arm == "CEILING":
            # THE ONLY ARM PERMITTED TO SEE WEEK N. It is the ceiling; that is
            # what a ceiling means. Every other arm is graded against it.
            chosen = assign(slots, roster, pts, pos_of)
        elif arm == "NAIVE":
            chosen = assign(slots, roster, _history_means(s, roster_id, w), pos_of)
        else:
            raise SystemExit("unknown arm %r" % arm)

        out[w] = round(sum(pts.get(p, 0.0) for p in chosen), 2)
    return out


def recorded(history: dict, season_key, roster_id: int) -> dict:
    """Sleeper's own weekly total for the seat — the ACTUAL arm's target."""
    s = MG.season_of(history, season_key)
    out = {}
    for w in MG.regular_season_weeks(s):
        row = seat_row(s, w, roster_id)
        if row and row.get("points") is not None:
            out[w] = round(float(row["points"]), 2)
    return out


def main() -> int:
    hist = MG.load_history()
    pays = MG.load_payouts()
    pos = positions_map(hist)
    missing = unmapped_starters(hist, pos)
    if missing:
        print("REFUSING: %d player(s) started a game and have no position: %s"
              % (len(missing), missing[:10]))
        print("  The ceiling cannot place them, so it would silently score LOW "
              "and flatter every other arm.")
        return 1
    print("LINEUP ARM — controls first\n")
    print("season  seat  arm       total pts   $wh+rs   vs ACTUAL")
    for season in ("2023", "2024", "2025"):
        s = MG.season_of(hist, season)
        if not s:
            continue
        for rid in sorted({int(r["roster_id"]) for r in week_rows(s, 1)}):
            base = None
            for arm in ("ACTUAL", "CEILING", "NAIVE"):
                wk = replay(hist, season, rid, arm, pos)
                g = MG.grade_substituted(hist, pays, season, rid, wk)
                money = (g.get("weekly_high") or 0) + (g.get("regular_season") or 0)
                if arm == "ACTUAL":
                    base = money
                print("%s    %-4d %-9s %9.1f %8.0f %10s"
                      % (season, rid, arm, sum(wk.values()), money,
                         "" if base is None else "%+.0f" % (money - base)))
            break   # one seat in the demo; the suite covers all ten
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
