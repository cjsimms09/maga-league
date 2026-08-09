#!/usr/bin/env python3
"""DISCOVERABILITY PROBE — can we obtain public leagues at OUR format, at volume?

The gate on the whole external-sample program (Cory, 2026-08-09): the interior-adjuster
question, the source-grade CI, the keeper-need generalization all need real leagues at our
EXACT format (10-team, half-PPR, 6-pt passing TD, 1QB/2RB/2WR/1TE/FLEX/K/DEF, keeper). If
those aren't obtainable at volume, that whole program stays permanently blocked and Cory wants
to know IMMEDIATELY — better a hard "no" than a queue position that never resolves.

Sleeper has NO "search leagues by settings" endpoint. League IDs are 64-bit snowflakes, so
random enumeration is hopeless. The only route to volume is a CRAWL of the social graph:
seed from our league's users → each user's OTHER leagues → keep the ones matching our format →
expand via their users. This probe runs a BOUNDED BFS and measures the YIELD (matching leagues
per API call) and the reachable total, then calls it: obtainable-at-volume or not.

Pure format matcher (format_match) unit-tested in test_discoverability.py; the crawl is egress
(CI only). Reports strict (incl. keeper) and loose (scoring+lineup only) yields — the loose set
still supports the redraft-lineup terms (need/risk/bye) even if keeper is rarer.
"""
from __future__ import annotations
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
SLEEPER = "https://api.sleeper.app/v1"

# our format, read from league_history so a rules change reaches this the same way
def our_spec():
    h = json.loads((HERE.parent / "data" / "league_history.json").read_text())
    s = (h.get("seasons") or [])[-1]
    sc = s.get("scoring_settings") or {}
    return {"teams": len(s.get("owners") or {}) or 10,
            "rec": sc.get("rec", 0.5), "pass_td": sc.get("pass_td", 6.0),
            "roster": _slot_counts(s.get("roster_positions") or []),
            "root_league_id": h.get("root_league_id")}


def _slot_counts(positions):
    c = {}
    for p in positions:
        if p == "BN":
            continue
        c[p] = c.get(p, 0) + 1
    return c


def format_match(league, spec):
    """Does a Sleeper league object match our format? Returns (strict, loose, why).
    loose = scoring + starting lineup (supports need/risk/bye — the redraft-lineup terms).
    strict = loose AND keeper (settings.type==1 or max_keepers>0)."""
    if not isinstance(league, dict):
        return False, False, "not a league"
    sc = league.get("scoring_settings") or {}
    settings = league.get("settings") or {}
    slots = _slot_counts(league.get("roster_positions") or [])
    reasons = []
    teams_ok = (league.get("total_rosters") == spec["teams"])
    rec_ok = abs((sc.get("rec") if sc.get("rec") is not None else -9) - spec["rec"]) < 0.13  # ~half-PPR
    ptd_ok = (sc.get("pass_td") == spec["pass_td"])
    # starting lineup: same skill-slot shape, single-QB (not superflex), K+DEF present
    want = spec["roster"]
    lineup_ok = (slots.get("QB", 0) == want.get("QB", 1) and "SUPER_FLEX" not in slots
                 and slots.get("RB", 0) == want.get("RB", 2) and slots.get("WR", 0) == want.get("WR", 2)
                 and slots.get("TE", 0) == want.get("TE", 1) and slots.get("FLEX", 0) == want.get("FLEX", 1)
                 and slots.get("K", 0) >= 1 and slots.get("DEF", 0) >= 1)
    keeper_ok = (settings.get("type") == 1 or (settings.get("max_keepers") or 0) > 0)
    if not teams_ok: reasons.append("teams")
    if not rec_ok: reasons.append("rec")
    if not ptd_ok: reasons.append("pass_td")
    if not lineup_ok: reasons.append("lineup")
    loose = teams_ok and rec_ok and ptd_ok and lineup_ok
    strict = loose and keeper_ok
    if loose and not keeper_ok:
        reasons.append("no-keeper")
    return strict, loose, ",".join(reasons) or "match"


def _get(url, timeout=20):   # pragma: no cover  (egress, CI only)
    import urllib.request
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "mfga-discoverability"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8", "ignore"))
    except Exception:
        return None


def crawl(seed_league_id, season, spec, budget=800):   # pragma: no cover  (CI only)
    """Bounded BFS over users↔leagues from the seed. Returns yield stats. `budget` caps API
    calls so CI stays fast and we stay polite to Sleeper."""
    calls = 0
    seen_leagues, seen_users = set(), set()
    strict_ids, loose_ids = set(), set()
    league_frontier = [str(seed_league_id)]
    user_frontier = []
    checked = 0

    def check_league(lid):
        nonlocal calls, checked
        if lid in seen_leagues or calls >= budget:
            return
        seen_leagues.add(lid)
        lg = _get(f"{SLEEPER}/league/{lid}"); calls += 1
        if not lg:
            return
        checked += 1
        st, lo, _why = format_match(lg, spec)
        if lo:
            loose_ids.add(lid)
        if st:
            strict_ids.add(lid)
        if lo:  # only expand via ON-FORMAT leagues — that's where more of them cluster
            us = _get(f"{SLEEPER}/league/{lid}/users"); calls += 1
            for u in (us or []):
                uid = u.get("user_id")
                if uid and uid not in seen_users:
                    user_frontier.append(uid)

    def expand_user(uid):
        nonlocal calls
        if uid in seen_users or calls >= budget:
            return
        seen_users.add(uid)
        lgs = _get(f"{SLEEPER}/user/{uid}/leagues/nfl/{season}"); calls += 1
        for lg in (lgs or []):
            lid = lg.get("league_id")
            if lid and lid not in seen_leagues:
                league_frontier.append(lid)

    # seed
    seed_users = _get(f"{SLEEPER}/league/{seed_league_id}/users"); calls += 1
    for u in (seed_users or []):
        if u.get("user_id"):
            user_frontier.append(u["user_id"])
    # BFS alternating layers until budget spent
    while calls < budget and (league_frontier or user_frontier):
        while user_frontier and calls < budget:
            expand_user(user_frontier.pop(0))
        while league_frontier and calls < budget:
            check_league(league_frontier.pop(0))
    return {"api_calls": calls, "leagues_checked": checked, "users_seen": len(seen_users),
            "loose_matches": len(loose_ids), "strict_matches": len(strict_ids)}


def _verdict(stats, budget):
    """Yield-based call — BUT first distinguish 'the format is sparse' (spent the budget, found
    few) from 'the seed graph ran dry' (crawl exhausted far below budget). The second is a
    METHOD limitation, not evidence about the world: a private league's members mostly play in
    each other's leagues, so crawling from our seed cannot reach the public-league space at all.
    Reporting that as 'not obtainable' would be a null of the wrong instrument."""
    lo = stats["loose_matches"]
    checked = stats["leagues_checked"] or 1
    hit_rate = lo / checked
    per_match_calls = (stats["api_calls"] / lo) if lo else None
    reach_500 = round(per_match_calls * 500) if per_match_calls else None
    exhausted = stats["api_calls"] < 0.5 * budget      # frontier dried up before the budget

    if lo >= 40 and hit_rate >= 0.05:
        return (f"OBTAINABLE — {lo} on-format leagues in {stats['api_calls']} calls "
                f"({hit_rate*100:.0f}% of leagues checked); ~{reach_500:,} calls to reach 500. "
                f"The external-sample program is viable — the crawl scales.")
    if exhausted:
        return (f"INCONCLUSIVE (method, not answer) — the crawl EXHAUSTED at {stats['api_calls']} "
                f"calls (budget {budget}), reaching only {stats['users_seen']} users and {lo} "
                f"on-format leagues. Crawling from OUR league's members is a dead end: they mostly "
                f"play in each other's leagues, so this route never enters the public-league space. "
                f"This is NOT evidence the format is sparse — it's evidence the SEED is too small. "
                f"A real volume test needs a different entry into Sleeper's public leagues (there is "
                f"no settings-search API), which is a bigger build. TELL CORY: cheap path is a dead "
                f"end; obtainability is still OPEN, not proven-negative.")
    if lo >= 5:
        return (f"THIN — {lo} on-format in {stats['api_calls']} calls ({hit_rate*100:.0f}%); "
                f"~{reach_500:,} calls to reach 500 — possibly viable but expensive. FLAG to Cory.")
    return (f"NOT OBTAINABLE at volume — spent {stats['api_calls']} of {budget} calls and found only "
            f"{lo} on-format leagues ({hit_rate*100:.0f}%). The format is genuinely sparse in the "
            f"reachable graph; the external-sample program stays BLOCKED. TELL CORY IMMEDIATELY.")


def egress_main():   # pragma: no cover  (CI only)
    spec = our_spec()
    season = str((json.loads((HERE.parent / "data" / "league_history.json").read_text())
                  .get("seasons") or [{}])[-1].get("season") or "2024")
    budget = int(sys.argv[sys.argv.index("--budget") + 1]) if "--budget" in sys.argv else 800
    stats = crawl(spec["root_league_id"], season, spec, budget)
    out = {"experiment": "discoverability — public leagues at our format, obtainable at volume?",
           "our_format": {k: spec[k] for k in ("teams", "rec", "pass_td", "roster")},
           "season_crawled": season, "budget": budget, "stats": stats,
           "verdict": _verdict(stats, budget),
           "caveat": "graph crawl from our league's users; Sleeper has no settings-search, so "
                     "this is the only route. loose = scoring+lineup (supports need/risk/bye); "
                     "strict adds keeper. A THIN/NOT-OBTAINABLE verdict is the gate: it means the "
                     "interior-adjuster question stays permanently open, not queued."}
    (HERE / "exp_discoverability.json").write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":   # pragma: no cover
    raise SystemExit(egress_main())
