# TERRITORY: A
"""PRE-DRAFT PREFLIGHT — what is this board actually built on?

Built 2026-08-16 because its absence cost a real detour. Asked "what is the
board built on", the relay session read `projection_provenance` — a key that
does not exist; the real one is `provenance.projections` — got `{}`, and told
Cory his board might silently be running on last season's actuals six days
before his draft. It was not: source `sleeper_projections`, season 2026, 633
nonzero rows, fallback never fired. The data was fine and the LOOKUP was
wrong.

The lesson is not "be more careful with keys". It is that the answer to "what
am I drafting off" lived only in a nested JSON blob nobody could read at a
glance, so every attempt to answer it was a fresh chance to get it wrong.
This makes it one command.

Deliberately READ-ONLY and DEPENDENCY-FREE: it opens the published artifact
and prints. It never rebuilds, never fetches, never writes. A preflight that
can change the thing it inspects is not a preflight.

Exit code is the summary: 0 = clean, 1 = at least one RED. Reds are things
that would make you draft off the wrong numbers; ambers are things worth
knowing that do not invalidate the board.

Run:
    python3 draft/tools/board_preflight.py [--board public/draft_data.json]
"""
from __future__ import annotations

import argparse
import collections
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
DEFAULT_BOARD = ROOT / "public" / "draft_data.json"

#: Below this many nonzero projection rows, build.py abandons the upcoming
#: season and scores the board on the PRIOR season's actuals instead. That is
#: a legitimate fallback with a real cost — its own warning says "rookies and
#: players whose role changed are undervalued" — and it must never be
#: invisible. Mirrors build.PROJECTION_MIN_NONZERO; asserted equal by a test
#: so the two cannot drift apart silently.
PROJECTION_MIN_NONZERO = 100

#: Positions whose value the draft actually turns on. K/DEF are Sleeper-only
#: by design and their per-source gaps are expected, not defects.
SKILL = ("QB", "RB", "WR", "TE")


def _pos(p: dict) -> str | None:
    return p.get("position") or p.get("pos")


def check(board: dict) -> dict:
    """Board artifact -> {reds, ambers, facts}. Pure: no I/O, no rebuild."""
    reds: list[str] = []
    ambers: list[str] = []
    facts: dict = {}

    prov = (board.get("provenance") or {}).get("projections") or {}
    players = board.get("players") or []

    # ── what the value side is actually built on ─────────────────────────
    source = prov.get("source")
    season = prov.get("season")
    nonzero = prov.get("nonzero")
    facts["source"] = source
    facts["season"] = season
    facts["rows"] = prov.get("rows")
    facts["nonzero"] = nonzero
    facts["built_at"] = board.get("built_at")

    if not source:
        reds.append("No projection source recorded — cannot tell what this "
                    "board is built on.")
    elif "stats_" in str(source) or prov.get("warning"):
        # The fallback fired: this is LAST SEASON'S SCORING, not a forecast.
        reds.append(f"FALLBACK ACTIVE — value side is built on {source}, not a "
                    f"projection. Rookies and role-changers are undervalued.")
    if nonzero is not None and nonzero < PROJECTION_MIN_NONZERO:
        reds.append(f"Only {nonzero} rows carry nonzero projections "
                    f"(threshold {PROJECTION_MIN_NONZERO}) — the value side is "
                    f"at or past the fallback trigger.")

    # ── per-source coverage: what each column actually reaches ───────────
    cov = {}
    for key in ("proj_mean", "proj_sleeper", "proj_fantasypros", "proj_ownmodel"):
        cov[key] = sum(1 for p in players if p.get(key) is not None)
    facts["players"] = len(players)
    facts["coverage"] = cov

    # A row carrying a blended/derived value but no source number underneath
    # cannot be explained to the person drafting off it. K/DEF are expected
    # (Sleeper-only by design); skill positions are not.
    orphan = [p for p in players
              if p.get("proj_mean") and p.get("proj_sleeper") is None]
    orphan_skill = [p for p in orphan if _pos(p) in SKILL]
    facts["rows_missing_source_number"] = len(orphan)
    facts["skill_rows_missing_source_number"] = len(orphan_skill)
    facts["missing_by_position"] = dict(collections.Counter(
        _pos(p) for p in orphan))
    if orphan_skill:
        ambers.append(f"{len(orphan_skill)} skill-position rows carry "
                      f"proj_mean with no proj_sleeper — their per-source "
                      f"column is blank on the war room.")

    # ── the composition question Cory kept asking ────────────────────────
    # State plainly which sources the VALUE side uses, as opposed to which
    # ones merely appear next to it. Conflating those two is what made
    # "is our board an aggregate of ours and FantasyPros?" hard to answer.
    facts["proj_mean_composition"] = prov.get("composition") or source
    facts["display_only_sources"] = [
        k for k in ("proj_fantasypros", "proj_ownmodel") if cov.get(k)]

    # ── scoring vs the market that set ADP ───────────────────────────────
    gap = prov.get("scoring_gap_vs_adp_market") or {}
    if gap.get("measured"):
        pos_gaps = {k: v.get("mean_gap_points")
                    for k, v in (gap.get("positions") or {}).items()}
        facts["scoring_gap_vs_market"] = pos_gaps
        facts["market_overrides"] = gap.get("market_overrides")
        top12 = gap.get("top12_qb") or {}
        if top12.get("mean_gap_points"):
            # Not a defect — an EDGE. ADP is priced under different scoring,
            # so surfacing it is the point.
            facts["top12_qb_edge_points"] = top12["mean_gap_points"]
    else:
        ambers.append("Scoring gap vs the ADP market was not measured on this "
                      "board — the QB edge cannot be quantified.")

    return {"reds": reds, "ambers": ambers, "facts": facts}


def render(result: dict) -> str:
    f = result["facts"]
    L = []
    L.append("=" * 66)
    L.append("PRE-DRAFT PREFLIGHT — what this board is built on")
    L.append("=" * 66)
    L.append(f"  built at        {f.get('built_at')}")
    L.append(f"  VALUE SIDE      {f.get('source')}  season {f.get('season')}")
    L.append(f"  rows            {f.get('rows')} fetched, {f.get('nonzero')} with points")
    L.append(f"  players on board{f.get('players'):>6}")
    L.append("")
    L.append("  proj_mean (drives VORP, dollars, ordering) comes from:")
    L.append(f"      {f.get('proj_mean_composition')}")
    disp = f.get("display_only_sources") or []
    L.append(f"  shown alongside but NOT in the value: {disp or 'none'}")
    L.append("")
    L.append("  per-source coverage:")
    for k, v in (f.get("coverage") or {}).items():
        L.append(f"      {k:<20} {v:>5} players")
    if f.get("skill_rows_missing_source_number"):
        L.append(f"      ! {f['skill_rows_missing_source_number']} skill rows "
                 f"have no proj_sleeper  {f.get('missing_by_position')}")
    if f.get("scoring_gap_vs_market") is not None:
        L.append("")
        L.append(f"  our scoring vs the ADP market {f.get('market_overrides')}:")
        for pos, g in sorted((f.get("scoring_gap_vs_market") or {}).items()):
            flag = "  <-- ADP is priced differently" if g else ""
            L.append(f"      {pos:<5} mean gap {g} pts{flag}")
        if f.get("top12_qb_edge_points"):
            L.append(f"      top-12 QBs are worth {f['top12_qb_edge_points']} "
                     f"more points under OUR scoring than under ADP's")
    L.append("")
    for r in result["reds"]:
        L.append(f"  RED    {r}")
    for a in result["ambers"]:
        L.append(f"  AMBER  {a}")
    if not result["reds"] and not result["ambers"]:
        L.append("  CLEAN — no reds, no ambers.")
    elif not result["reds"]:
        L.append("  No reds. The value side is sound.")
    L.append("=" * 66)
    return "\n".join(L)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--board", type=str, default=str(DEFAULT_BOARD))
    ap.add_argument("--json", action="store_true", help="machine-readable")
    args = ap.parse_args()

    path = Path(args.board)
    if not path.exists():
        print(f"board not found: {path}", file=sys.stderr)
        return 1
    result = check(json.loads(path.read_text()))
    print(json.dumps(result, indent=1) if args.json else render(result))
    return 1 if result["reds"] else 0


if __name__ == "__main__":
    sys.exit(main())
