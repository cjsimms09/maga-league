# TERRITORY: A
"""ROOKIE WR DRAFT CAPITAL AS A LATE-ROUND FILTER — EXPLORATORY.

Cory, 2026-08-17: "Still think we should target rookie WR with opportunities
later in the draft. KC Concepcion, Cyrus Allen.. their cost is cheap and upside
is there.. can you find a way to quantify why I think they have upside and look
for similar players."

⚠️ THIS IS EXPLORATORY AND SAYS SO IN ITS OWN FILENAME-LEVEL DOCSTRING.
The numbers below were computed BEFORE any preregistration existed. Every other
study in this repo preregisters first, in an earlier commit, and this one did
not — so it is hypothesis-GENERATING, not confirmatory, and nothing may ship on
it without a preregistered confirmatory pass. Labelling it honestly is cheaper
than pretending the order was different.

WHY IT IS WORTH RUNNING ANYWAY — the blind spot is real and was found first.
Two committed nulls appear to answer Cory already, and neither actually does:

  * `barbell_strategy_2026-08-17.md` found rounds 11-15 dead (-27.8 vs a held
    wire add). Its population DOES include rookies (`universe()` requires only
    >=1 game, not a prior-season row) — but it never SPLIT rookies out, so a
    live subgroup inside a dead band is invisible to it.
  * `opportunity_inheritance_2026-08-17.md` found its pick-61+ cell contains
    ZERO rookies BY CONSTRUCTION (the shared population rule requires a
    prior-season stat row; no rookie has one). That study escalated the point
    itself: 37 rookies were drafted at pick 61+ across three seasons and the
    graded cell could not see one of them.

And a structural reason the veteran null need not transfer: that study's null
was explained by MEAN REVERSION — `own_share_y1` predicts decline, and "volume
above you" is its arithmetic complement. **For a rookie `own_share_y1` is zero
by definition**, so that confound cannot operate on this population.

THE INSTRUMENT. NFL draft capital, from `nflverse_draft_picks.json`, which is
period-correct by construction (the source's career-outcome columns are dropped
at build time — what remains is what was knowable on NFL draft night, months
before any fantasy draft). The comparison bar is the WR waiver wire from
`wire_level.json`, the same bar the barbell study used, because the honest
alternative to spending a late pick is streaming that roster spot.

Run:  python3 draft/backtest/rookie_wr_capital.py
"""
from __future__ import annotations

import json
import random
import statistics as st
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

SEASONS = (2023, 2024, 2025)
BOOTSTRAP = 5000
SEED = 20260817
#: The tail Cory is actually buying. "Upside" is a claim about the top of the
#: distribution, not the mean, so the mean alone cannot confirm or refute it.
TAIL_PTS = 150.0


def _tier(rd: int) -> str:
    return "rd1" if rd == 1 else "rd2" if rd == 2 else "rd3" if rd == 3 else "rd4-7"


def capital_rows(path: str = "nflverse_draft_picks.json") -> list[dict]:
    doc = json.loads((HERE / path).read_text())
    picks = doc["picks"]
    return picks if isinstance(picks, list) else list(picks.values())


def rookie_wr_outcomes() -> dict:
    """{tier: [ {points, played, season, name, nfl_pick} ]} for every NFL rookie
    WR of the graded seasons — NOT only the ones our league drafted.

    ABSENT IS ZERO HERE, AND THAT IS A DELIBERATE DEPARTURE from this repo's
    usual rule, stated so it cannot be mistaken for an oversight. Everywhere
    else, a missing weekly row means "we do not know what he did" and the player
    is dropped. Here the question is what a ROSTER SPOT returned, and a drafted
    player who never took a snap returned zero to that spot — it is an outcome,
    not missing data. `played_only_mean` is reported beside every tier so the
    other convention is one glance away, and for rd1 the two are IDENTICAL
    (15 of 15 played), so the choice cannot be driving that row.
    """
    from empirical_draft_value import season_totals

    out: dict[str, list] = {}
    for r in capital_rows():
        season = int(r["season"])
        if season not in SEASONS or r.get("position") != "WR":
            continue
        totals, games = season_totals(season)
        sid = str(r.get("sleeper_id") or "")
        played = bool(sid and games.get(sid, 0) > 0)
        out.setdefault(_tier(int(r["round"])), []).append({
            "points": float(totals.get(sid, 0.0)) if played else 0.0,
            "played": played, "season": season,
            "name": r.get("name"), "nfl_pick": r.get("pick"),
        })
    return out


def wire_bar() -> float:
    import barbell_middle as BM
    return float(BM.wire_levels()["held_season"]["WR"])


def grade(rng: random.Random) -> dict:
    bar = wire_bar()
    tiers = rookie_wr_outcomes()
    rows = {}
    for tier, arr in tiers.items():
        pts = [a["points"] for a in arr]
        draws = sorted(st.fmean([pts[rng.randrange(len(pts))] for _ in pts]) - bar
                       for _ in range(BOOTSTRAP))
        lo, hi = draws[int(0.025 * BOOTSTRAP)], draws[int(0.975 * BOOTSTRAP) - 1]
        played = [a["points"] for a in arr if a["played"]]
        tail = [a for a in arr if a["points"] >= TAIL_PTS]
        rows[tier] = {
            "n": len(arr), "mean": round(st.fmean(pts), 1),
            "median": round(st.median(pts), 1),
            "vs_wire": round(st.fmean(pts) - bar, 1),
            "ci95_vs_wire": [round(lo, 1), round(hi, 1)],
            # THE CLAUSE THAT DECIDES EACH ROW. "Beats the wire" and "is not
            # measurably worse than the wire" are different findings and the
            # difference is the whole honesty of this table.
            "clearly_below_wire": bool(hi < 0),
            "clearly_above_wire": bool(lo > 0),
            "tail_hits": len(tail), "tail_rate": round(len(tail) / len(arr), 3),
            "played": len(played),
            "played_only_mean": round(st.fmean(played), 1) if played else None,
            "by_season": {str(s): round(st.fmean(
                [a["points"] for a in arr if a["season"] == s]), 1)
                for s in SEASONS},
            "tail_names": sorted((a["name"], round(a["points"], 1)) for a in tail)[:6],
        }
    return {"wire_bar": bar, "tiers": rows}


def board_join(board_path: Path, cap_2026: str = "nflverse_draft_picks_2026.json") -> list[dict]:
    """This year's rookie WRs joined to the live board.

    JOINED BY NAME, WHICH IS A REAL WEAKNESS: every row in the 2026 capital
    store has `sleeper_id: None`, so there is no id to join on. Unmatched rows
    are RETURNED as unmatched rather than dropped — a rookie silently missing
    from this list would read as "no such player", which is the opposite of the
    truth.
    """
    import re

    def norm(s: str) -> str:
        s = re.sub(r"[^a-z ]", "", str(s).lower())
        return re.sub(r"\b(jr|sr|ii|iii|iv)\b", "", s).strip()

    doc = json.loads(Path(board_path).read_text())
    rows = (doc.get("players") or []) + (doc.get("kept_players") or [])
    by_name: dict[str, dict] = {}
    for p in rows:
        by_name.setdefault(norm(p.get("name")), p)

    picks = json.loads((HERE / cap_2026).read_text())["picks"]
    picks = picks if isinstance(picks, list) else list(picks.values())
    out = []
    for c in sorted((c for c in picks if c.get("position") == "WR"),
                    key=lambda r: r["pick"]):
        b = by_name.get(norm(c["name"]))
        out.append({
            "name": c["name"], "team": c["team"], "nfl_round": c["round"],
            "nfl_pick": c["pick"], "tier": _tier(int(c["round"])),
            "matched": b is not None,
            "adp": (b or {}).get("raw_adp"), "proj_mean": (b or {}).get("proj_mean"),
            "overall_rank": (b or {}).get("overall_rank"),
        })
    return out


def run() -> dict:
    rng = random.Random(SEED)
    g = grade(rng)
    board = board_join(HERE.parent.parent / "public" / "draft_data.json")
    return {
        "_territory": "TERRITORY: A",
        "status": "EXPLORATORY — computed before any preregistration existed",
        "cannot_ship": ("Hypothesis-generating only. A confirmatory pass must be "
                        "preregistered in its own earlier commit before any board "
                        "or model change is made on this."),
        "seasons": list(SEASONS), "tail_threshold": TAIL_PTS,
        "bootstrap": BOOTSTRAP, "seed": SEED,
        **g,
        "board_2026": board,
        "unmatched_2026": [b["name"] for b in board if not b["matched"]],
        "limitations": [
            "n=15 for rd1 over three seasons. The rd1 interval SPANS ZERO — "
            "'not measurably worse than the wire' is the finding, NOT 'beats it'.",
            "Absent counted as zero (a roster spot that returned nothing); "
            "played_only_mean is reported beside it, and for rd1 they are equal.",
            "The 2026 join is BY NAME — the capital store carries no sleeper_id "
            "for this class.",
            "Capital is not unpriced: the board's own projections already order "
            "the 2026 rookie WRs roughly monotonically by NFL pick, so this is a "
            "claim about which tier is worth a late spot, not a mispricing.",
            "One hit carries the entire rd4-7 tier (Puka Nacua, 1 of 55) — the "
            "single most-cited late rookie WR outcome in recent memory, which is "
            "exactly the availability trap the base rate corrects.",
        ],
    }


def main() -> int:
    doc = run()
    (HERE / "rookie_wr_capital.json").write_text(json.dumps(doc, indent=1))
    print(f"WR wire bar: {doc['wire_bar']:.1f}/season\n")
    print(f"{'tier':7} {'n':>3} {'mean':>7} {'vs wire':>8} {'95% CI':>18} "
          f"{'>=150':>8}  verdict")
    for t in ("rd1", "rd2", "rd3", "rd4-7"):
        r = doc["tiers"][t]
        v = ("CLEARLY BELOW wire" if r["clearly_below_wire"] else
             "clearly above wire" if r["clearly_above_wire"] else
             "not distinguishable from wire")
        print(f"{t:7} {r['n']:3} {r['mean']:7.1f} {r['vs_wire']:+8.1f} "
              f"[{r['ci95_vs_wire'][0]:+7.1f},{r['ci95_vs_wire'][1]:+7.1f}] "
              f"{r['tail_hits']:3}/{r['n']:<4} {v}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
