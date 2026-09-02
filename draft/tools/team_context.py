#!/usr/bin/env python3
# TERRITORY: relay (C owns the rows once the coaching half lands)
"""TEAM CONTEXT — the situational facts a good drafter carries in his head,
written to disk (FUTURE-PROOF-2027 Layer 1; ROUTES relay → C, 2026-09-02,
the pace + implied-total half built by the relay as that row's default).

Per NFL team, `draft/data/team_context_2026.json` carries:
  • THIS WEEK'S IMPLIED TEAM TOTAL from OUR OWN Bovada capture
    (`draft/data/bovada_lines_2026.jsonl`, Thu open + Sun close): for a game
    total T and the home side's spread h (negative = home favoured),
    home = T/2 − h/2 and away = T/2 + h/2. The latest capture per game wins,
    stamped with when it was captured, so a Sunday re-run moves the number.
  • PACE, from `draft/backtest/nflverse_pace.json` (2024-25 scrimmage plays;
    raw and neutral-situation plays per game, neutral pass rate) — a PRIOR,
    labelled as such; the 2026 in-season pace is the Wednesday snap job's
    business once the season has weeks.
  • THE COACHING HALF — head coach, offensive coordinator, whether either
    changed since 2025, O-line continuity — is NOT CAPTURED and is written as
    `null` under a named gap, never as an empty string that reads as "no
    change". That half is C's (register the source when it exists).

Which NFL week a game belongs to comes from the committed schedule store
(`draft/data/nfl_schedule_2026.json`): the two team codes plus the nearest
kickoff. A Bovada game whose teams or date match nothing is listed under
`unmatched`, never silently dropped.

CONTROLS (Rule 3e — a store that cannot fail is not a measurement):
  C1 the two implied totals of every priced game sum to its game total
     (to 0.01) and the favourite's total exceeds the underdog's.
  C2 known positive: week 1's opener (NE @ SEA, captured 08-21) prices SEA
     as the favourite — Seattle's implied total exceeds New England's.
  C3 every team that appears in a priced game carries a pace prior, and
     every pace team code is a real NFL code.

Run:  python3 draft/tools/team_context.py [--write] [--json]
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))
from weekly_own_projection import TEAM_NAME_TO_CODE  # noqa: E402
from adp import NFL_TEAMS  # noqa: E402

LINES = ROOT / "draft" / "data" / "bovada_lines_2026.jsonl"
SCHEDULE = ROOT / "draft" / "data" / "nfl_schedule_2026.json"
PACE = ROOT / "draft" / "backtest" / "nflverse_pace.json"
OUT = ROOT / "draft" / "data" / "team_context_2026.json"
ALIAS = {"WSH": "WAS"}
# nflverse writes the Rams as "LA"; our code is "LAR". C3 caught this on the first run.
PACE_ALIAS = {"LAR": "LA"}
SEASON = 2026


def _num(x):
    try:
        return float(str(x).replace("+", ""))
    except (TypeError, ValueError):
        return None


def parse_game(row):
    """(away_code, home_code, total, home_spread, start_ms, ts) or None."""
    g = row.get("game") or ""
    if " @ " not in g:
        return None
    away_name, home_name = [s.strip() for s in g.split(" @ ", 1)]
    away, home = TEAM_NAME_TO_CODE.get(away_name), TEAM_NAME_TO_CODE.get(home_name)
    if not away or not home:
        return None
    m = row.get("markets") or {}
    total = None
    for o in m.get("Total") or []:
        if str(o.get("o", "")).lower() == "over":
            total = _num(o.get("h"))
    home_spread = None
    for o in m.get("Point Spread") or []:
        if o.get("o") == home_name:
            home_spread = _num(o.get("h"))
    if total is None or home_spread is None:
        return None
    return {"away": away, "home": home, "total": total, "home_spread": home_spread,
            "start_ms": row.get("start"), "ts": row.get("ts")}


def week_of(game, sched_rows):
    """The schedule row with the same two teams nearest the kickoff, or None."""
    best = None
    for r in sched_rows:
        h, a = ALIAS.get(r["home"], r["home"]), ALIAS.get(r["away"], r["away"])
        if {h, a} != {game["home"], game["away"]}:
            continue
        try:
            d = abs(datetime.fromisoformat(r["date"].replace("Z", "+00:00")).timestamp() * 1000 - float(game["start_ms"] or 0))
        except (TypeError, ValueError):
            d = float("inf")
        if best is None or d < best[0]:
            best = (d, r)
    if best is None or best[0] > 3 * 86400 * 1000:      # within three days of a scheduled meeting
        return None
    return int(best[1]["week"])


def build():
    sched = json.loads(SCHEDULE.read_text())
    sched_rows = [r for r in sched.get("rows", []) if not r.get("postseason")]
    pace = json.loads(PACE.read_text()).get("teams", {})
    latest = {}                      # (week, home, away) -> game (latest ts wins)
    unmatched = []
    n_rows = 0
    for line in LINES.read_text().splitlines():
        if not line.strip():
            continue
        n_rows += 1
        row = json.loads(line)
        g = parse_game(row)
        if not g:
            if row.get("game") and ("Total" in (row.get("markets") or {})):
                unmatched.append({"game": row.get("game"), "why": "team name not in crosswalk"})
            continue
        wk = week_of(g, sched_rows)
        if wk is None:
            unmatched.append({"game": row.get("game"), "why": "no scheduled meeting within 3 days"})
            continue
        key = (wk, g["home"], g["away"])
        if key not in latest or (g["ts"] or "") > (latest[key]["ts"] or ""):
            latest[key] = g
    teams = {}
    for code in sorted(NFL_TEAMS):
        p = pace.get(code) or pace.get(PACE_ALIAS.get(code, ""), {}) or {}
        teams[code] = {
            "pace_prior": ({"plays_per_game": p.get("plays_per_game"), "neutral_plays_per_game": p.get("neutral_plays_per_game"),
                            "neutral_pass_rate": p.get("neutral_pass_rate"), "basis": p.get("basis"),
                            "seasons": "2024-25 (a prior, not this season)"} if p else None),
            "head_coach": None, "offensive_coordinator": None, "hc_changed_since_2025": None,
            "oc_changed_since_2025": None, "oline_starters_returning": None,
            "weeks": {},
        }
    for (wk, home, away), g in sorted(latest.items()):
        T, h = g["total"], g["home_spread"]
        home_tot = round(T / 2 - h / 2, 2)
        away_tot = round(T / 2 + h / 2, 2)
        for code, opp, is_home, tot, spread in ((home, away, True, home_tot, h), (away, home, False, away_tot, -h)):
            teams[code]["weeks"][str(wk)] = {"opp": opp, "home": is_home, "implied_total": tot, "spread": spread,
                                             "game_total": T, "captured_at": g["ts"]}
    doc = {
        "_territory": "TERRITORY: C — produced by draft/tools/team_context.py (relay built the pace + implied-total half, 2026-09-02)",
        "_what": ("Per-team situational context: this week's implied team total from OUR Bovada capture (latest capture per game), "
                  "a 2024-25 pace prior from nflverse, and the coaching/O-line fields the store is waiting for (null = NOT CAPTURED)."),
        "_gaps": ["head_coach / offensive_coordinator / *_changed_since_2025 / oline_starters_returning: no free source wired yet (C); "
                  "null is the honest value — a blank string would read as 'no change'",
                  "pace is the 2024-25 prior until the Wednesday snap job has 2026 weeks"],
        "season": SEASON, "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source_rows": n_rows, "priced_games": len(latest), "unmatched": unmatched,
        "controls": controls(teams, latest, pace),
        "teams": teams,
    }
    return doc


def controls(teams, latest, pace):
    out = []
    bad = []
    for (wk, home, away), g in latest.items():
        a, b = teams[home]["weeks"][str(wk)], teams[away]["weeks"][str(wk)]
        if abs(a["implied_total"] + b["implied_total"] - g["total"]) > 0.011:
            bad.append((wk, home, away, "sum"))
        fav, dog = (a, b) if g["home_spread"] < 0 else (b, a)
        if g["home_spread"] != 0 and fav["implied_total"] <= dog["implied_total"]:
            bad.append((wk, home, away, "favourite"))
    out.append({"id": "C1", "what": "implied totals sum to the game total and the favourite's exceeds the underdog's",
                "games": len(latest), "ok": len(latest) > 0 and not bad, "violations": bad[:5]})
    sea = teams.get("SEA", {}).get("weeks", {}).get("1")
    ne = teams.get("NE", {}).get("weeks", {}).get("1")
    out.append({"id": "C2", "what": "known positive: week 1 NE @ SEA priced, Seattle favoured",
                "sea": sea and sea["implied_total"], "ne": ne and ne["implied_total"],
                "ok": bool(sea and ne and sea["opp"] == "NE" and sea["implied_total"] > ne["implied_total"])})
    priced_teams = {c for c, t in teams.items() if t["weeks"]}
    no_pace = sorted(c for c in priced_teams if not teams[c]["pace_prior"])
    known = set(NFL_TEAMS) | set(PACE_ALIAS.values())
    foreign = sorted(c for c in pace if c not in known)
    out.append({"id": "C3", "what": "every priced team carries a pace prior; every pace code is an NFL code",
                "priced_teams": len(priced_teams), "missing_pace": no_pace, "foreign_pace_codes": foreign,
                "ok": not no_pace and not foreign})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    doc = build()
    if a.json:
        print(json.dumps(doc, indent=1))
    else:
        print(f"TEAM CONTEXT {doc['season']} — {doc['source_rows']} capture rows → {doc['priced_games']} priced games, "
              f"{len(doc['unmatched'])} unmatched")
        for c in doc["controls"]:
            extra = {k: v for k, v in c.items() if k not in ("id", "what", "ok")}
            print(f"  {'✅' if c['ok'] else '🔴'} {c['id']} {c['what']} {extra if not c['ok'] or c['id'] == 'C2' else ''}")
        weeks = sorted({w for t in doc["teams"].values() for w in t["weeks"]}, key=int)
        for w in weeks:
            rows = sorted(((t["weeks"][w]["implied_total"], c) for c, t in doc["teams"].items() if w in t["weeks"]), reverse=True)
            print(f"  week {w}: {len(rows)} teams priced — top {rows[0][1]} {rows[0][0]}, bottom {rows[-1][1]} {rows[-1][0]}")
    if not all(c["ok"] for c in doc["controls"]):
        print("🔴 a control failed — nothing written")
        return 1
    if a.write:
        OUT.write_text(json.dumps(doc, indent=1) + "\n")
        print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
