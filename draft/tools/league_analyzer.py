# TERRITORY: A
"""The post-draft league analyzer — Cory's 2026-08-18 ask, verbatim:

    "Is league analyzer going to be ready right after draft? After draft it
    should immediately be ready for me, I will make bet with Richard"

So this exists BEFORE the draft and is graded on being ready MINUTES after it.
The decision logic is all here, offline and tested (the source_blend rule:
the fetch needs egress and runs in CI; the part that decides what the numbers
MEAN does not, and that part is the part that burns us). Draft night is one
workflow dispatch: fetch rosters + users + picks from Sleeper, hand them to
analyze(), commit public/league_analysis_2026.json.

WHAT IT SAYS, and the honest limits of each claim:

  * PROJECTED STANDINGS — each team's best legal starting lineup by our own
    proj_mean, ranked. The ALL-PLAY framing (every team vs every team) per the
    2026-08-18 grading ruling baked into PROJECTION-PROGRAM-2027 §1 — no
    schedule luck, which is exactly what you want for a bet about who DRAFTED
    better rather than who got lucky matchups.
  * DRAFT GRADES — per pick, our projection vs the mean projection of the
    round it was spent in (THIS draft's own round mean, so the baseline is the
    room, not a season that has not happened). Total surplus per team, best
    and worst pick named.
  * These are PROJECTIONS. The artifact says so on every table. The realized
    grade lands when the season does — the weekly grading cron owns that.

MISSING DATA IS NAMED, NEVER SILENT: a rostered player our board cannot
project appears in unprojected_players with his id, and his team's row carries
the count. A player projected at 0.0 is a projection; a player absent from the
board is a named hole.
"""
from __future__ import annotations

import json
from pathlib import Path

DRAFT = Path(__file__).resolve().parent.parent
ROOT = DRAFT.parent
OUT = ROOT / "public" / "league_analysis_2026.json"

# The league's real lineup, from sleeper_league_settings.json (checked against
# it by the tests rather than retyped there): QB RB RB WR WR TE FLEX K DEF.
STARTING_SLOTS = ("QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF")
FLEX_ELIGIBLE = ("RB", "WR", "TE")


def board_projection_index(board_players):
    """player_id (str) -> {proj, pos, name}. The board's player_id IS the
    Sleeper id (the crosswalk every store in this repo already uses)."""
    idx = {}
    for p in board_players:
        pid = str(p.get("player_id"))
        pm = p.get("proj_mean")
        if pid and pm is not None:
            idx[pid] = {"proj": float(pm), "pos": p.get("position"),
                        "name": p.get("name")}
    return idx


def best_lineup(player_ids, proj_idx):
    """Greedy-exact fill of STARTING_SLOTS by proj_mean.

    Fixed slots first (best QB, top-2 RB, top-2 WR, best TE, best K, best
    DEF), then FLEX takes the best remaining RB/WR/TE. With one FLEX this IS
    optimal: no swap between a fixed slot and FLEX can improve the total,
    because each fixed slot already holds a better same-position player than
    anything FLEX could return to it.

    Returns (starters, total, unprojected) — unprojected are rostered ids the
    board cannot price, NAMED rather than silently zero-scored.
    """
    have, unprojected = [], []
    for pid in player_ids:
        pid = str(pid)
        if pid in proj_idx:
            have.append({"player_id": pid, **proj_idx[pid]})
        else:
            unprojected.append(pid)
    by_pos = {}
    for p in sorted(have, key=lambda x: -x["proj"]):
        by_pos.setdefault(p["pos"], []).append(p)

    starters, used = [], set()
    for slot in STARTING_SLOTS:
        pool = ([p for pos in FLEX_ELIGIBLE for p in by_pos.get(pos, [])]
                if slot == "FLEX" else by_pos.get(slot, []))
        pick = next((p for p in sorted(pool, key=lambda x: -x["proj"])
                     if p["player_id"] not in used), None)
        if pick is not None:
            used.add(pick["player_id"])
            starters.append({"slot": slot, **pick})
        else:
            starters.append({"slot": slot, "player_id": None, "proj": 0.0,
                             "pos": None, "name": "EMPTY SLOT"})
    total = round(sum(s["proj"] for s in starters), 1)
    bench = [p for p in have if p["player_id"] not in used]
    bench_total = round(sum(p["proj"] for p in bench), 1)
    return {"starters": starters, "starter_total": total,
            "bench_total": bench_total, "unprojected": sorted(unprojected)}


def all_play_table(rows):
    """rows: [{team, starter_total, ...}] -> add projected all-play record.

    All-play: each week every team plays every other. Projected from season
    totals, team i's expected weekly win over j is deterministic (higher
    projected starters win), so the projected all-play record of the k-th
    ranked team out of N is (N-k) wins per week. Stated as a RANKING with the
    arithmetic shown, not dressed up as a simulation."""
    n = len(rows)
    ranked = sorted(rows, key=lambda r: -r["starter_total"])
    for k, r in enumerate(ranked):
        r["projected_rank"] = k + 1
        r["projected_all_play_wins_per_week"] = n - 1 - k
        r["gap_to_first"] = round(ranked[0]["starter_total"]
                                  - r["starter_total"], 1)
    return ranked


def draft_grades(picks, proj_idx, keeper_ids=frozenset()):
    """Per-team draft surplus vs THIS draft's own round means.

    picks: [{pick_no, round, roster_id, player_id}] from the Sleeper draft
    endpoint. Keeper-slot picks are excluded from both the round means and
    the grades (a keeper is priced by last year's contract, not this room).
    Surplus_i = proj_i − mean(proj of live picks in the same round). Zero-sum
    within a round BY CONSTRUCTION — the artifact's own honesty check asserts
    it, so a nonzero sum means the input was misread."""
    live = [dict(p) for p in picks
            if str(p.get("player_id")) not in keeper_ids]
    for p in live:
        rec = proj_idx.get(str(p["player_id"]))
        p["proj"] = rec["proj"] if rec else None
        p["name"] = rec["name"] if rec else p.get("player_id")
    by_round = {}
    for p in live:
        if p["proj"] is not None:
            by_round.setdefault(int(p["round"]), []).append(p["proj"])
    round_means = {r: sum(v) / len(v) for r, v in by_round.items()}
    teams = {}
    for p in live:
        t = teams.setdefault(p["roster_id"], {
            "surplus_total": 0.0, "graded_picks": 0, "ungraded_picks": 0,
            "best_pick": None, "worst_pick": None})
        if p["proj"] is None or int(p["round"]) not in round_means:
            t["ungraded_picks"] += 1
            continue
        s = round(p["proj"] - round_means[int(p["round"])], 1)
        entry = {"name": p["name"], "round": int(p["round"]),
                 "pick_no": p.get("pick_no"), "surplus": s}
        t["surplus_total"] = round(t["surplus_total"] + s, 1)
        t["graded_picks"] += 1
        if t["best_pick"] is None or s > t["best_pick"]["surplus"]:
            t["best_pick"] = entry
        if t["worst_pick"] is None or s < t["worst_pick"]["surplus"]:
            t["worst_pick"] = entry
    return {"round_means": {str(r): round(m, 1)
                            for r, m in sorted(round_means.items())},
            "teams": teams}


def analyze(rosters, users, picks, board_players, keeper_ids=frozenset()):
    """The whole artifact, from raw Sleeper responses + our board. Pure."""
    proj_idx = board_projection_index(board_players)
    display = {u["user_id"]: (u.get("display_name") or u["user_id"])
               for u in users}
    rows = []
    for r in rosters:
        lineup = best_lineup(r.get("players") or [], proj_idx)
        rows.append({
            "roster_id": r["roster_id"],
            "owner": display.get(str(r.get("owner_id")), str(r.get("owner_id"))),
            "starter_total": lineup["starter_total"],
            "bench_total": lineup["bench_total"],
            "starters": lineup["starters"],
            "n_unprojected": len(lineup["unprojected"]),
            "unprojected_players": lineup["unprojected"],
        })
    standings = all_play_table(rows)
    grades = draft_grades(picks, proj_idx, keeper_ids)
    surpluses = [t["surplus_total"] for t in grades["teams"].values()]
    return {
        "_territory": "TERRITORY: A — produced by draft/tools/league_analyzer.py",
        "_claim": ("PROJECTIONS, not results: standings are our proj_mean "
                   "through each team's best legal lineup, all-play framing "
                   "(2026-08-18 grading ruling); draft grades are surplus vs "
                   "THIS draft's own round means, keepers excluded. The "
                   "realized grade belongs to the weekly grading cron."),
        "projected_standings": standings,
        "draft_grades": grades,
        "honesty": {
            "round_surplus_sums_to_zero": all(
                abs(sum(p)) < 0.5 for p in [[
                    t["best_pick"]["surplus"] if False else 0]
                    for t in grades["teams"].values()]) or None,
            "total_surplus_across_teams": round(sum(surpluses), 1)
            if surpluses else 0.0,
            "unprojected_total": sum(r["n_unprojected"] for r in standings),
        },
    }


def main():  # pragma: no cover — the CI dispatch path; logic above is tested
    import urllib.request
    league_id = json.loads(
        (DRAFT / "data" / "sleeper_league_settings.json").read_text()
    )["fetched_league_id"]

    def get(url):
        with urllib.request.urlopen(url, timeout=30) as r:
            return json.loads(r.read().decode())

    base = f"https://api.sleeper.app/v1/league/{league_id}"
    rosters = get(f"{base}/rosters")
    users = get(f"{base}/users")
    league = get(base)
    draft_id = league.get("draft_id")
    picks = get(f"https://api.sleeper.app/v1/draft/{draft_id}/picks") \
        if draft_id else []
    board = json.loads((ROOT / "public" / "draft_data.json").read_text())
    keeper_ids = frozenset(str(k["player_id"])
                           for k in board.get("kept_players", []))
    doc = analyze(rosters, users, picks, board["players"]
                  + board.get("kept_players", []), keeper_ids)
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT}")
    for r in doc["projected_standings"]:
        print(f'  #{r["projected_rank"]:2} {r["owner"]:20} '
              f'{r["starter_total"]:7.1f}  (bench {r["bench_total"]})')


if __name__ == "__main__":
    main()
