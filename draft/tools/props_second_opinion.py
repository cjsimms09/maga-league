#!/usr/bin/env python3
# TERRITORY: A
"""THE PROPS SECOND OPINION ON CORY'S ROSTER — where the market and the champion disagree, before Sunday.

Cory, 2026-09-02: "Keep making my model better, smarter, faster learning.
Constantly looking for edge!" The sharpest measured edge we hold is the
props arm: it beat the champion on start/sit at all four positions in BOTH
backtest folds (registers 463/471; QB .643/.611 · RB .805/.753 · WR .765/.709
· TE .766/.737 in 2024), and its week file now exists every Wednesday and
Thursday (fetch_free_props.py). But it is graded as a STUDY arm and reaches
no surface Cory reads — the only place its opinion existed was a JSON file.

This puts it beside the champion on HIS roster (THIS-WEEK.md — the roster
rule: live Sleeper, fresh within 3 days) and names the players the two would
start differently. REPORT ONLY: it moves no projection and no lineup. The
blend rule it uses for the second lineup — props where a line exists, the
champion elsewhere — is `blend_props_pull`, the arm preregistered for 10-08
(P357); this is its prior art made visible one roster at a time, not the arm
entering the grader early.

Controls (rule 3e): every rostered starter must resolve to a board id or be
NAMED as unmatched; the champion column must equal the committed snapshot's
projection when one exists (else the doc is stamped BUILT LOCALLY, not the
Thursday snapshot); at least one rostered skill player must carry a props
line, or the run says the props file did not cover his roster.

Run: python3 draft/tools/props_second_opinion.py [--week N] [--season 2026] [--json]
Writes draft/data/weekly_own/second_opinion_<season>_w<week>.json.
"""
from __future__ import annotations

import datetime as _dt
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
for p in (ROOT / "draft", ROOT / "draft" / "tools", ROOT / "draft" / "backtest"):
    sys.path.insert(0, str(p))

from fetch_weekly_props import board_index, match_player          # noqa: E402  one crosswalk (rule 11)
from weekly_props_arm import load_props_arm                        # noqa: E402  the arm's own reader
import weekly_own_projection as WP                                  # noqa: E402

SKILL = ("QB", "RB", "WR", "TE")


def parse_this_week(text: str) -> dict:
    """{"week", "season", "generated", "roster": [{st, name, pos, team}]} from THIS-WEEK.md."""
    m = re.search(r"week (\d+) \((\d{4})\)", text)
    week = int(m.group(1)) if m else None
    season = int(m.group(2)) if m else None
    g = re.search(r"\*\*Generated (\S+)", text)
    opp = re.search(r"## Opponent: (.+)", text)

    def table(header):
        rows = []
        sec = text.split(header, 1)
        if len(sec) == 2:
            body = sec[1].split("\n## ", 1)[0]
            for line in body.splitlines():
                if not line.startswith("|") or line.startswith("|---") or "| player |" in line:
                    continue
                cells = [c.strip() for c in line.strip().strip("|").split("|")]
                if len(cells) < 4:
                    continue
                rows.append({"st": cells[0] == "S", "name": cells[1], "pos": cells[2], "team": cells[3],
                             "injury": cells[5] if len(cells) > 5 else ""})
        return rows
    return {"week": week, "season": season, "generated": g.group(1) if g else None,
            "opponent": opp.group(1).strip() if opp else None,
            "roster": table("## My roster"), "opponent_roster": table("## Opponent's roster")}


def resolve_roster(roster: list, board_players: list) -> tuple[list, list]:
    """(rows with player_id, unmatched) via the props crosswalk: normalized name,
    disambiguated by the player's team. K/DEF are carried without an id lookup
    when the board lacks them (the arms do not price them)."""
    idx = board_index(board_players)
    out, unmatched = [], []
    for r in roster:
        match, reason = match_player(r["name"], r["team"], r["team"], idx)
        if not match:
            # a second try without the team filter, but only if unambiguous
            match, reason2 = match_player(r["name"], None, None, idx)
            reason = reason if not match else None
        if match:
            out.append({**r, "player_id": match[0]})
        else:
            out.append({**r, "player_id": None})
            if r["pos"] in SKILL:
                unmatched.append({"name": r["name"], "pos": r["pos"], "team": r["team"], "reason": reason})
    return out, unmatched


def best_lineup(rows: list, proj: dict, slots: dict) -> list:
    """Greedy-by-slot best legal lineup by `proj` over the resolved roster rows;
    K/DEF are filled by roster position when present (no arm prices them).
    Returns the chosen player_ids (or names for K/DEF without an id).
    Players without a projection are ineligible — an opinion that cannot
    price a man cannot start him (the backtest's rule)."""
    key = lambda r: r["player_id"] or r["name"]  # noqa: E731
    skill = [r for r in rows if r["pos"] in SKILL and r["player_id"] in proj]
    skill.sort(key=lambda r: -proj[r["player_id"]])
    chosen, used = [], set()
    for pos in ("QB", "RB", "WR", "TE"):
        n = slots.get(pos, 0)
        for r in skill:
            if n <= 0:
                break
            if r["pos"] == pos and key(r) not in used:
                chosen.append(key(r)); used.add(key(r)); n -= 1
    n = slots.get("FLEX", 0)
    for r in skill:
        if n <= 0:
            break
        if r["pos"] in ("RB", "WR", "TE") and key(r) not in used:
            chosen.append(key(r)); used.add(key(r)); n -= 1
    for pos in ("K", "DEF"):
        n = slots.get(pos, 0)
        for r in rows:
            if n <= 0:
                break
            if r["pos"] == pos and key(r) not in used:
                chosen.append(key(r)); used.add(key(r)); n -= 1
    return chosen


def second_opinion(rows: list, champion: dict, props: dict, blend_arm: dict | None, slots: dict) -> dict:
    """The comparison. `champion`/`props`/`blend_arm`: {pid: points}."""
    table = []
    covered_skill = 0
    for r in rows:
        pid = r["player_id"]
        c = champion.get(pid) if pid else None
        p = props.get(pid) if pid else None
        b = blend_arm.get(pid) if (pid and blend_arm) else None
        if p is not None and r["pos"] in SKILL:
            covered_skill += 1
        table.append({**r, "champion": c, "blend_prior": b, "props": p,
                      "props_minus_champion": round(p - c, 2) if (p is not None and c is not None) else None})
    second = {r["player_id"]: (props.get(r["player_id"]) if props.get(r["player_id"]) is not None else champion.get(r["player_id"]))
              for r in rows if r["player_id"] and (r["player_id"] in props or r["player_id"] in champion)}
    line_c = best_lineup(rows, champion, slots)
    line_p = best_lineup(rows, second, slots)
    name_of = {(r["player_id"] or r["name"]): r["name"] for r in rows}
    swaps = [{"props_starts": name_of.get(x, x), "champion_starts": None} for x in line_p if x not in line_c]
    outs = [name_of.get(x, x) for x in line_c if x not in line_p]
    for i, s in enumerate(swaps):
        s["champion_starts"] = outs[i] if i < len(outs) else None

    def total(line, proj):
        return round(sum(proj.get(x, 0.0) for x in line if x in proj), 2)
    return {
        "table": table,
        "lineup_champion": [name_of.get(x, x) for x in line_c],
        "lineup_props_blend": [name_of.get(x, x) for x in line_p],
        "swaps": swaps,
        "valuation": {
            "champion_lineup": {"by_champion": total(line_c, champion), "by_props_blend": total(line_c, second)},
            "props_blend_lineup": {"by_champion": total(line_p, champion), "by_props_blend": total(line_p, second)},
        },
        "skill_players_with_a_props_line": covered_skill,
        "skill_players_rostered": sum(1 for r in rows if r["pos"] in SKILL),
    }


def main(argv=None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    tw = parse_this_week((ROOT / "THIS-WEEK.md").read_text())
    week = int(args[args.index("--week") + 1]) if "--week" in args else tw["week"]
    season = int(args[args.index("--season") + 1]) if "--season" in args else (tw["season"] or WP.SEASON)
    if week is None:
        print("THIS-WEEK.md carries no week; pass --week"); return 1
    board = WP._board_players(Path(os.environ.get("OWN_WEEKLY_BOARD") or ROOT / "public" / "draft_data.json"))  # players + kept (register 476)
    snap_path = WP.snapshot_path(ROOT / "draft" / "data" / "weekly_own", season, week)
    if snap_path.exists():
        snap = json.loads(snap_path.read_text()); snap_source = f"committed snapshot {snap_path.name}"
    else:
        implied, src = WP.implied_for_week(week, season, ROOT / "draft" / "data" / "odds" / "sgo_latest.json",
                                           ROOT / "draft" / "backtest" / "vegas_lines_2021_2026.json")
        ledger = ROOT / "draft" / "data" / "weekly_own" / f"grades_{season}.json"
        champion, arms = WP.ledger_state(ledger)
        champion, _ = WP.apply_override(champion, arms, WP.read_controls(ROOT / "draft" / "data" / "weekly_own" / "controls.json"))
        snap = WP.build_snapshot(board, week, season, implied, src, _dt.date.today().isoformat(),
                                 champion, arms, WP.realized_from_ledger(ledger, week))
        snap_source = "BUILT LOCALLY from the board and lines — not the Thursday snapshot"
    champion = {pid: v["mean"] for pid, v in snap["projections"].items()}
    blend_arm = (snap.get("challengers") or {}).get("v1_blend_pull3")
    props = load_props_arm(ROOT / "draft" / "data" / "props", season, week) or {}
    rows, unmatched = resolve_roster(tw["roster"], board)
    slots = json.loads((ROOT / "draft" / "config" / "league_config.json").read_text())["starters"]
    so = second_opinion(rows, champion, props, blend_arm, slots)
    # THE MATCHUP under both opinions (the opponent's roster from the same
    # brief): the gap Cory is actually playing for this week, read twice.
    opp_rows, opp_unmatched = resolve_roster(tw.get("opponent_roster") or [], board)
    opp = second_opinion(opp_rows, champion, props, blend_arm, slots) if opp_rows else None
    matchup = None
    if opp:
        mine_c = so["valuation"]["champion_lineup"]["by_champion"]
        mine_p = so["valuation"]["props_blend_lineup"]["by_props_blend"]
        theirs_c = opp["valuation"]["champion_lineup"]["by_champion"]
        theirs_p = opp["valuation"]["props_blend_lineup"]["by_props_blend"]
        matchup = {"opponent": tw.get("opponent"),
                   "by_champion": {"mine": mine_c, "theirs": theirs_c, "gap": round(mine_c - theirs_c, 2)},
                   "by_props_blend": {"mine": mine_p, "theirs": theirs_p, "gap": round(mine_p - theirs_p, 2)},
                   "note": "each side's best lineup under that opinion; K/DEF unpriced by both, so the gap is skill slots only"}
    controls = [
        {"id": "S1", "what": "every rostered skill player resolves to a board id, or is named", "ok": not unmatched, "unmatched": unmatched},
        {"id": "S2", "what": "the props file covers at least one rostered skill player", "ok": so["skill_players_with_a_props_line"] > 0,
         "covered": so["skill_players_with_a_props_line"], "of": so["skill_players_rostered"]},
        {"id": "S3", "what": "THIS-WEEK.md is fresh (<= 3 days) — the roster rule", "generated": tw["generated"],
         "ok": bool(tw["generated"]) and (_dt.datetime.now(_dt.timezone.utc) - _dt.datetime.fromisoformat(tw["generated"])).days <= 3},
    ]
    doc = {"_territory": "TERRITORY: A — produced by draft/tools/props_second_opinion.py",
           "_what": "REPORT ONLY. The champion weekly projection beside the props-implied points on Cory's live roster, and the lineup each would start. The second lineup uses P357's blend rule (props where a line exists, champion elsewhere) — its prior art made visible, not the arm entering the grader early.",
           "season": season, "week": week, "generated": _dt.datetime.now(_dt.timezone.utc).isoformat(),
           "roster_source": f"THIS-WEEK.md generated {tw['generated']}", "champion_source": snap_source,
           "champion_arm": snap["diagnostics"]["champion_arm"], "props_source": f"weekly_props_{season}_w{week}.json ({len(props)} players)",
           "controls": controls, **so,
           "opponent": ({"name": tw.get("opponent"), "unmatched": opp_unmatched, **opp} if opp else None),
           "matchup": matchup}
    out = ROOT / "draft" / "data" / "weekly_own" / f"second_opinion_{season}_w{week}.json"
    out.write_text(json.dumps(doc, indent=1))
    if "--json" in args:
        print(json.dumps(doc, indent=1)); return 0
    print(f"PROPS SECOND OPINION — week {week} {season} — champion {doc['champion_arm']} ({snap_source}); props {len(props)} players")
    for c in controls:
        print(f"  {'OK ' if c['ok'] else '***'} {c['id']} {c['what']}" + ("" if c["ok"] else f"  {c}"))
    print(f"\n  {'st':<3}{'player':<20}{'pos':<4}{'champ':>7}{'blend':>7}{'props':>7}{'delta':>7}")
    for r in so["table"]:
        f = lambda v: f"{v:7.2f}" if isinstance(v, (int, float)) else f"{'—':>7}"  # noqa: E731
        print(f"  {'S' if r['st'] else ' ':<3}{r['name'][:19]:<20}{r['pos']:<4}{f(r['champion'])}{f(r['blend_prior'])}{f(r['props'])}{f(r['props_minus_champion'])}")
    v = so["valuation"]
    print(f"\n  champion's lineup:    {', '.join(so['lineup_champion'])}")
    print(f"  props-blend lineup:   {', '.join(so['lineup_props_blend'])}")
    print(f"  valued by champion:   {v['champion_lineup']['by_champion']} vs {v['props_blend_lineup']['by_champion']}   valued by props-blend: {v['champion_lineup']['by_props_blend']} vs {v['props_blend_lineup']['by_props_blend']}")
    if so["swaps"]:
        for s in so["swaps"]:
            print(f"  SWAP: props would start {s['props_starts']} over {s['champion_starts']}")
    else:
        print("  the two opinions start the SAME lineup this week")
    if matchup:
        print(f"\n  MATCHUP vs {matchup['opponent']} (skill slots, each side's best lineup under that opinion)")
        print(f"   by champion:    {matchup['by_champion']['mine']} vs {matchup['by_champion']['theirs']}   gap {matchup['by_champion']['gap']:+.2f}")
        print(f"   by props-blend: {matchup['by_props_blend']['mine']} vs {matchup['by_props_blend']['theirs']}   gap {matchup['by_props_blend']['gap']:+.2f}")
        if opp and opp["swaps"]:
            for s in opp["swaps"]:
                print(f"   their side — props would start {s['props_starts']} over {s['champion_starts']}")
    print(f"\n  wrote {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
