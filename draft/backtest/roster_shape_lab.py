# TERRITORY: A
"""WHAT DOES A TOP-3 ROSTER LOOK LIKE IN THIS LEAGUE, AND WHERE DOES THE TOOL SIT?

Prereg: `draft/ROSTER-SHAPE-PREREG-2026-08-19.md`, P120. Cory: *"Roster still not
normal... Need to strive for top 3!"*

Every "too many RBs" claim this project has made — register 59's RB10/WR1,
RB12/WR2, and Cory's own complaint — was measured against somebody's intuition,
because no target existed. This builds the target from the league's own drafts
and finishes, so the claim becomes checkable in either direction.

INPUTS ARE ALL COMMITTED. `draft/data/league_history.json` (drafts[].picks with
roster_id/player_id/is_keeper, standings with rank) and the seat-replay grade
files. No network.

Run:  python3 draft/backtest/roster_shape_lab.py \
        --grades s0=<path> s1=<path> --out draft/data/roster_shape_lab.json
"""
from __future__ import annotations

import json
import random
import statistics as st
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
ROOT = DRAFT.parent
HISTORY = DRAFT / "data" / "league_history.json"
BOARD = ROOT / "public" / "draft_data.json"

POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"]
TOP_N = 3            # Cory's stated goal, not a cut chosen from the data
SEED = 20260819
SHUFFLES = 4000


# ── the one counting function BOTH sides go through (prereg §5 control) ──────
def count_positions(rows: list[tuple[str, bool]], *, include_keepers: bool) -> dict:
    """rows: (position, is_keeper). Nothing else — so a caller cannot slip a
    different universe into one side of the comparison.

    A position outside POSITIONS is counted under 'OTHER' rather than dropped:
    silently discarding rows would make two rosters of different sizes look
    comparable, which is precisely the artifact this control exists to prevent.
    """
    c = {p: 0 for p in POSITIONS}
    c["OTHER"] = 0
    for pos, is_keeper in rows:
        if is_keeper and not include_keepers:
            continue
        key = pos if pos in c else "OTHER"
        c[key] += 1
    c["TOTAL"] = sum(c[p] for p in POSITIONS) + c["OTHER"]
    return c


def _player_positions() -> dict:
    """player_id -> position, from the committed board.

    A player the board does not know is NOT guessed and NOT dropped — he is
    counted as UNKNOWN and reported. An unresolved rate that quietly grows is
    how a shape claim becomes fiction.
    """
    if not BOARD.exists():
        return {}
    b = json.loads(BOARD.read_text())
    out = {}
    for p in b.get("players", []):
        if p.get("player_id") and p.get("position"):
            out[str(p["player_id"])] = p["position"]
    for p in b.get("kept_players", []) or []:
        if p.get("player_id") and p.get("position"):
            out.setdefault(str(p["player_id"]), p["position"])
    return out


def league_shapes(include_keepers: bool = True) -> dict:
    hist = json.loads(HISTORY.read_text())
    pos_of = _player_positions()
    seasons, unresolved, resolved = {}, 0, 0

    for s in hist.get("seasons", []):
        if s.get("status") != "complete":
            continue                      # 2026 has not been drafted
        rank_of = {r["roster_id"]: r["rank"] for r in s.get("standings", [])}
        if not rank_of:
            continue
        by_roster = defaultdict(list)
        for d in s.get("drafts", []):
            for pk in d.get("picks", []):
                rid = pk.get("roster_id")
                pid = str(pk.get("player_id"))
                pos = pos_of.get(pid)
                if pos is None:
                    unresolved += 1
                    pos = "UNKNOWN"
                else:
                    resolved += 1
                by_roster[rid].append((pos, bool(pk.get("is_keeper"))))
        teams = {}
        for rid, rows in by_roster.items():
            if rid not in rank_of:
                continue
            teams[rid] = {"rank": rank_of[rid],
                          "counts": count_positions(rows, include_keepers=include_keepers)}
        if teams:
            seasons[s["season"]] = teams
    return {"seasons": seasons,
            "resolution": {"resolved": resolved, "unresolved": unresolved,
                           "rate": round(resolved / max(1, resolved + unresolved), 4)}}


def _within_season_permutation(seasons: dict, pos: str) -> tuple:
    """Observed T3-minus-B7 mean difference, and its p under shuffling the RANK
    labels WITHIN each season.

    Within-season, not pooled: each season has its own draft economy and exactly
    3 of 10 teams are top-3. A pooled shuffle would break both and manufacture
    significance out of season-to-season drift.
    """
    obs_t3, obs_b7, blocks = [], [], []
    for _season, teams in seasons.items():
        vals, is_top = [], []
        for _rid, t in teams.items():
            vals.append(t["counts"].get(pos, 0))
            is_top.append(t["rank"] <= TOP_N)
        blocks.append((vals, is_top))
        for v, top in zip(vals, is_top):
            (obs_t3 if top else obs_b7).append(v)
    if len(obs_t3) < 3 or len(obs_b7) < 3:
        return None, None, 1.0, 0, 0
    obs = st.mean(obs_t3) - st.mean(obs_b7)

    rng = random.Random(SEED)
    hits = 0
    for _ in range(SHUFFLES):
        a, b = [], []
        for vals, is_top in blocks:
            flags = is_top[:]
            rng.shuffle(flags)
            for v, top in zip(vals, flags):
                (a if top else b).append(v)
        if abs(st.mean(a) - st.mean(b)) >= abs(obs):
            hits += 1
    return (round(st.mean(obs_t3), 3), round(st.mean(obs_b7), 3),
            hits / SHUFFLES, len(obs_t3), len(obs_b7))


def tool_shapes(grade_path: Path) -> dict:
    """Engine roster counts from a seat-replay grade file.

    The engine's rosters carry no keeper flag, so `include_keepers=True` is the
    only honest setting — and the league side is read the same way for the
    comparison that is actually printed, per the prereg's control.
    """
    doc = json.loads(grade_path.read_text())
    per_seat, by_pos = [], defaultdict(list)
    for _season, y in (doc.get("years") or {}).items():
        for _seat, rec in (y.get("seats") or {}).items():
            rows = [(p.get("pos"), False) for p in (rec.get("engine_roster") or [])]
            if not rows:
                continue
            c = count_positions(rows, include_keepers=True)
            per_seat.append(c)
            for p in POSITIONS:
                by_pos[p].append(c[p])
    return {"n_seat_years": len(per_seat),
            "mean": {p: round(st.mean(by_pos[p]), 2) for p in POSITIONS if by_pos[p]},
            "median": {p: st.median(by_pos[p]) for p in POSITIONS if by_pos[p]},
            "roster_size_mean": round(st.mean([c["TOTAL"] for c in per_seat]), 2)
                                if per_seat else None}


def run(grades: dict) -> dict:
    lg = league_shapes(include_keepers=True)
    seasons = lg["seasons"]

    sizes = {s: sorted({t["counts"]["TOTAL"] for t in teams.values()})
             for s, teams in seasons.items()}

    def _perms(subset):
        out = {}
        for p in POSITIONS:
            t3, b7, pv, n3, n7 = _within_season_permutation(subset, p)
            out[p] = {"top3_mean": t3, "rest_mean": b7,
                      "diff": (None if t3 is None else round(t3 - b7, 3)),
                      "permutation_p": round(pv, 4), "n_top3": n3, "n_rest": n7}
        return out

    perms = _perms(seasons)

    # ── DRAFT-LENGTH MATCHING, AND IT REVERSES THE POOLED HEADLINE ───────────
    # 2023 drafted EIGHTEEN players per team; 2024, 2025 and 2026 draft FIFTEEN.
    # (All four seasons carry 15 roster_positions — the difference is draft
    # LENGTH, not roster size, and pooling them mixes two different economies:
    # three extra picks per team have to go somewhere, and in 2023 they went to
    # running backs — top-3 teams drafted 5.67 of them.)
    #
    # 2026 is a 15-pick draft, so the matched subset is the comparison that
    # applies to Saturday and the pooled one is contaminated. Reported side by
    # side rather than replacing it, because n falls to 6 top-3 team-seasons and
    # neither cut is strong enough to stand alone.
    matched_seasons = {s: t for s, t in seasons.items()
                       if sorted({v["counts"]["TOTAL"] for v in t.values()})
                       == sorted({v["counts"]["TOTAL"]
                                  for v in seasons[max(seasons)].values()})}
    perms_matched = _perms(matched_seasons) if len(matched_seasons) >= 2 else {}

    tools = {name: tool_shapes(Path(path)) for name, path in grades.items()}

    signif = [p for p in POSITIONS if perms[p]["permutation_p"] < 0.05]
    return {
        "_territory": "TERRITORY: A — draft/backtest/roster_shape_lab.py",
        "_prereg": "draft/ROSTER-SHAPE-PREREG-2026-08-19.md (P120)",
        "_note": ("Drafted position counts per team-season, keepers INCLUDED, "
                  "joined to finishing rank. Both sides go through one counting "
                  "function so a 'skew' cannot come from counting two different "
                  "universes. n is 3 seasons x 10 teams — small and "
                  "non-independent within a season."),
        "seed": SEED, "shuffles": SHUFFLES, "top_n": TOP_N,
        "player_position_resolution": lg["resolution"],
        "roster_sizes_seen": sizes,
        "seasons_used": sorted(seasons),
        "league": perms,
        "league_draft_length_matched": perms_matched,
        "draft_length_matched_seasons": sorted(matched_seasons),
        "draft_length_note": (
            "2023 drafted 18 players per team; 2024/2025/2026 draft 15. All four "
            "carry 15 roster_positions, so this is draft LENGTH, not roster size. "
            "2026 is a 15-pick draft, so the MATCHED cut is the one that applies "
            "and the pooled cut mixes two economies."),
        "positions_differing_at_p05": signif,
        "tool": tools,
        "verdict": ("NO POSITION SEPARATES TOP-3 FROM THE REST — roster shape is "
                    "not a measurable lever in this league's history"
                    if not signif else
                    "separates on: " + ", ".join(signif)),
    }


def main() -> int:
    argv = sys.argv[1:]
    grades = {}
    if "--grades" in argv:
        i = argv.index("--grades") + 1
        while i < len(argv) and not argv[i].startswith("--"):
            name, _, path = argv[i].partition("=")
            grades[name] = path
            i += 1
    out = None
    if "--out" in argv:
        out = Path(argv[argv.index("--out") + 1])

    doc = run(grades)
    r = doc["player_position_resolution"]
    print(f"ROSTER SHAPE — seasons {doc['seasons_used']}, "
          f"player positions resolved {r['rate']:.1%} "
          f"({r['unresolved']} unresolved)")
    print(f"  roster sizes seen: {doc['roster_sizes_seen']}")
    print("\n  LEAGUE — drafted counts, top-3 vs rest (within-season permutation)")
    print("    pos    top3    rest    diff       p")
    for p in POSITIONS:
        v = doc["league"][p]
        if v["top3_mean"] is None:
            continue
        print(f"    {p:5} {v['top3_mean']:6.2f}  {v['rest_mean']:6.2f}  "
              f"{v['diff']:+6.2f}   {v['permutation_p']:.4f}"
              + ("  *" if v["permutation_p"] < 0.05 else ""))
    if doc.get("league_draft_length_matched"):
        print(f"\n  DRAFT-LENGTH MATCHED — {doc['draft_length_matched_seasons']} only "
              f"(2026 is a 15-pick draft; 2023 was 18)")
        print("    pos    top3    rest    diff       p")
        for p in POSITIONS:
            v = doc["league_draft_length_matched"][p]
            if v["top3_mean"] is None:
                continue
            print(f"    {p:5} {v['top3_mean']:6.2f}  {v['rest_mean']:6.2f}  "
                  f"{v['diff']:+6.2f}   {v['permutation_p']:.4f}"
                  + ("  *" if v["permutation_p"] < 0.05 else ""))
    print("\n  THE TOOL — mean drafted counts per seat-year")
    for name, t in doc["tool"].items():
        print(f"    {name} (n={t['n_seat_years']}, roster {t['roster_size_mean']}): "
              + json.dumps(t["mean"]))
    print("\n  VERDICT: " + doc["verdict"])

    if out:
        out.write_text(json.dumps(doc, indent=1))
        print(f"  wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
