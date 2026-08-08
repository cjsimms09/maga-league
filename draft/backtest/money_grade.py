"""THE LAB — shared money-grading layer (E[$] is the grading currency).

Every experiment in `LAB-REGISTRY.md` grades in **dollars under era-correct
per-season payouts**, not roster points. This module is that currency. It turns
a season's weekly scores into the three money components the payout table pays:

    weekly-high $   — post the week's top score, collect the weekly prize
    regular-season $ — the RS standings champ / runner-up prizes
    playoff $        — the bracket finish prizes (1st/2nd/3rd/4th)

It works two ways:
  * grade_actual(...)      — grade the HARVESTED season exactly. The validation
                             anchor: dollars distributed must equal the pot, and
                             the weekly-high / RS / playoff splits must match the
                             era-correct payout table. If this is wrong, nothing
                             downstream can be trusted.
  * grade_substituted(...) — replace ONE seat's weekly scores with a replayed
                             strategy's scores and re-grade weekly-high + RS
                             against the real field. This is what money-grades a
                             Lab candidate. (Playoff re-simulation for a
                             substituted seat is the next harness layer — see
                             substituted_playoff_note.)

Nothing here reads projections or makes a pick. It is pure money math over
scores that already exist, so it can never leak outcome data into a decision.
"""
from __future__ import annotations
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
HIST = HERE.parent / "data" / "league_history.json"
PAYOUTS = HERE.parent / "config" / "payouts.json"


# --- loaders ------------------------------------------------------------------

def load_history(path: Path | None = None) -> dict:
    return json.loads((path or HIST).read_text())


def load_payouts(path: Path | None = None) -> dict:
    return json.loads((path or PAYOUTS).read_text())


def season_of(history: dict, season) -> dict | None:
    s = str(season)
    return next((x for x in history["seasons"] if str(x.get("season")) == s), None)


def season_pay(payouts: dict, season) -> dict:
    """Era-correct payout block for a season, normalized to the fields we grade."""
    raw = (payouts.get("by_season") or {}).get(str(season))
    if raw is None:
        raise KeyError(f"no payout era for season {season} in payouts.by_season")
    wh = raw.get("weekly_high") or {}
    rs = raw.get("regular_season") or {}
    # playoff places -> dollars. The block carries an explicit "total" alongside
    # the numeric place keys; keep only the places for the lookup table and take
    # the total from "total" (never sum it in — that double-counts).
    po_raw = raw.get("playoffs") or {}
    places = {str(k): v for k, v in po_raw.items() if str(k).isdigit()}
    po_total = po_raw.get("total")
    if po_total is None:
        po_total = sum(places.values())
    return {
        "season": str(season),
        "total_pot": raw.get("total_pot"),
        "weekly_high_amount": wh.get("amount"),
        "weekly_high_weeks": wh.get("weeks"),
        "weekly_high_total": wh.get("total"),
        "rs_champ": rs.get("champ"),
        "rs_runner_up": rs.get("runner_up"),
        "rs_total": rs.get("total"),
        "playoffs": places,
        "playoffs_total": po_total,
    }


# --- field extraction ---------------------------------------------------------

def field_weekly_scores(season: dict) -> dict[int, dict[int, float]]:
    """{week: {roster_id: points}} from the harvested weeks."""
    out: dict[int, dict[int, float]] = {}
    for wk, entries in (season.get("weeks") or {}).items():
        w = int(wk)
        out[w] = {}
        for e in entries or []:
            rid = e.get("roster_id")
            if rid is None:
                continue
            out[w][int(rid)] = float(e.get("points") or 0.0)
    return out


def weekly_matchups(season: dict) -> dict[int, dict[int, int]]:
    """{week: {roster_id: opponent_roster_id}} from shared matchup_id."""
    out: dict[int, dict[int, int]] = {}
    for wk, entries in (season.get("weeks") or {}).items():
        w = int(wk)
        by_mid: dict = {}
        for e in entries or []:
            mid = e.get("matchup_id")
            if mid is None:
                continue
            by_mid.setdefault(mid, []).append(int(e["roster_id"]))
        pair: dict[int, int] = {}
        for rids in by_mid.values():
            if len(rids) == 2:
                pair[rids[0]] = rids[1]
                pair[rids[1]] = rids[0]
        out[w] = pair
    return out


def regular_season_weeks(season: dict) -> list[int]:
    pw = int((season.get("settings") or {}).get("playoff_week_start") or 15)
    return sorted(w for w in field_weekly_scores(season) if w < pw)


def playoff_weeks(season: dict) -> list[int]:
    pw = int((season.get("settings") or {}).get("playoff_week_start") or 15)
    return sorted(w for w in field_weekly_scores(season) if w >= pw)


# --- weekly-high --------------------------------------------------------------

def weekly_high_winners(field: dict[int, dict[int, float]], weeks: list[int]) -> dict[int, list[int]]:
    """{week: [roster_id(s) posting the week's top score]}. Ties split the prize."""
    out: dict[int, list[int]] = {}
    for w in weeks:
        scores = field.get(w) or {}
        if not scores:
            continue
        top = max(scores.values())
        out[w] = sorted(rid for rid, pts in scores.items() if pts == top)
    return out


def weekly_high_dollars(field: dict[int, dict[int, float]], weeks: list[int],
                        pay: dict, roster_id: int) -> float:
    """Weekly-high dollars a roster wins across `weeks` (splitting exact ties)."""
    amt = pay["weekly_high_amount"] or 0
    total = 0.0
    for w, winners in weekly_high_winners(field, weeks).items():
        if roster_id in winners:
            total += amt / len(winners)
    return round(total, 2)


# --- regular-season standings -------------------------------------------------

def standings_from_scores(field: dict[int, dict[int, float]], matchups: dict[int, dict[int, int]],
                          weeks: list[int]) -> list[dict]:
    """Rebuild the RS table (record, points) from weekly scores + the schedule.

    Rank by wins, then total points-for (the league tiebreak = total_points).
    Returns [{roster_id, wins, losses, ties, points_for, rank}] rank 1 = best.
    """
    rosters = set()
    for w in weeks:
        rosters.update((field.get(w) or {}).keys())
    rec = {r: {"roster_id": r, "wins": 0, "losses": 0, "ties": 0, "points_for": 0.0}
           for r in rosters}
    for w in weeks:
        scores = field.get(w) or {}
        pair = matchups.get(w) or {}
        for r, pts in scores.items():
            rec[r]["points_for"] += pts
            opp = pair.get(r)
            if opp is None or opp not in scores:
                continue
            if pts > scores[opp]:
                rec[r]["wins"] += 1
            elif pts < scores[opp]:
                rec[r]["losses"] += 1
            else:
                rec[r]["ties"] += 1
    table = sorted(rec.values(), key=lambda x: (-x["wins"], -round(x["points_for"], 2)))
    for i, row in enumerate(table, start=1):
        row["rank"] = i
        row["points_for"] = round(row["points_for"], 2)
    return table


def regular_season_dollars(standings: list[dict], pay: dict, roster_id: int) -> float:
    """RS champ / runner-up prize for a roster, by standings rank."""
    rank = next((r["rank"] for r in standings if r["roster_id"] == roster_id), None)
    if rank == 1:
        return float(pay["rs_champ"] or 0)
    if rank == 2:
        return float(pay["rs_runner_up"] or 0)
    return 0.0


# --- playoffs (actual bracket) ------------------------------------------------

def playoff_placements(season: dict) -> dict[int, int]:
    """{roster_id: finishing place} from the winners bracket's placement games.

    A bracket entry with `p` is a placement game: p=1 → 1st/2nd, p=3 → 3rd/4th.
    `w` is the winner roster, `l` the loser.
    """
    placements: dict[int, int] = {}
    winners = ((season.get("brackets") or {}).get("winners")) or []
    for g in winners:
        p = g.get("p")
        if p is None:
            continue
        w, l = g.get("w"), g.get("l")
        if w is not None:
            placements[int(w)] = int(p)
        if l is not None:
            placements[int(l)] = int(p) + 1
    return placements


def playoff_dollars(placements: dict[int, int], pay: dict, roster_id: int) -> float:
    place = placements.get(roster_id)
    if place is None:
        return 0.0
    return float(pay["playoffs"].get(str(place), 0) or 0)


# --- full-season grade --------------------------------------------------------

def grade_actual(history: dict, payouts: dict, season) -> dict:
    """Grade the HARVESTED season exactly, per roster, decomposed. The anchor."""
    s = season_of(history, season)
    if s is None:
        raise KeyError(f"no season {season} in history")
    pay = season_pay(payouts, season)
    field = field_weekly_scores(s)
    matchups = weekly_matchups(s)
    rs_weeks = regular_season_weeks(s)
    standings = standings_from_scores(field, matchups, rs_weeks)
    placements = playoff_placements(s)

    rosters = sorted({r for wk in field.values() for r in wk})
    per = {}
    for rid in rosters:
        wh = weekly_high_dollars(field, rs_weeks, pay, rid)
        rs = regular_season_dollars(standings, pay, rid)
        po = playoff_dollars(placements, pay, rid)
        per[rid] = {"weekly_high": wh, "regular_season": rs, "playoff": po,
                    "total": round(wh + rs + po, 2)}
    return {"season": str(season), "pay": pay, "standings": standings,
            "placements": placements, "per_roster": per,
            "distributed": round(sum(v["total"] for v in per.values()), 2)}


def grade_substituted(history: dict, payouts: dict, season, roster_id: int,
                      my_weekly: dict[int, float]) -> dict:
    """Re-grade weekly-high + RS with ONE seat's weekly scores replaced.

    `my_weekly`: {week: score} for the replayed strategy in `roster_id`'s seat.
    Weeks absent from my_weekly keep the harvested score (so a partial series
    still grades). Playoff dollars for a substituted seat require a bracket
    re-simulation (reseed + resim) — the next harness layer; reported as None
    here with a note rather than a wrong number.
    """
    s = season_of(history, season)
    pay = season_pay(payouts, season)
    field = field_weekly_scores(s)
    matchups = weekly_matchups(s)
    rs_weeks = regular_season_weeks(s)

    # Substitute the seat's scores in a copy of the field.
    sub = {w: dict(scores) for w, scores in field.items()}
    for w, pts in my_weekly.items():
        if int(w) in sub and roster_id in sub[int(w)]:
            sub[int(w)][roster_id] = float(pts)

    standings = standings_from_scores(sub, matchups, rs_weeks)
    wh = weekly_high_dollars(sub, rs_weeks, pay, roster_id)
    rs = regular_season_dollars(standings, pay, roster_id)
    return {
        "season": str(season), "roster_id": roster_id,
        "weekly_high": wh, "regular_season": rs,
        "playoff": None,
        "substituted_playoff_note": "playoff $ for a substituted seat needs "
        "reseed + bracket resim (next harness layer); weekly-high and RS are exact",
        "graded_total_partial": round(wh + rs, 2),
        "standings_rank": next((r["rank"] for r in standings if r["roster_id"] == roster_id), None),
    }
