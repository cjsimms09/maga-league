# TERRITORY: A
"""IS THE BOARD'S PRICING CONTAMINATED BY FORMAT MIXING? MEASURED, NOT ASSUMED.

C measured two contaminants and routed them as a source-selection decision:

    superflex/2QB   QB median rank delta  -49.8 slots  (threshold -9.7)
    dynasty/keeper  age rho, QB removed   +0.425       (threshold +0.25)

Both were measured against `draft/data/external_adp_series.json` — the MFL
archive. THAT FILE PRICES NOTHING. Grepped across `draft/*.py` and
`public/js/`: zero references. C's own report says so ("The board build never
opens external_adp_series.json"), and then the routing asks which source to
switch to on the strength of it.

The board is priced by two OTHER sources, and this module measures those.

── WHAT EACH PRICING SOURCE ACTUALLY EXPOSES (the lookup, done first) ───────

FFC   `/api/v1/adp/{fmt}?teams={n}&year={y}` — format and league size are
      REQUEST PARAMETERS, and the response CONFIRMS them:
          {"type": "Half-PPR", "teams": 10, "rounds": 15,
           "total_drafts": 2391, "start_date": "2026-08-09"}
      15 rounds is our league exactly. 2QB and dynasty are SEPARATE endpoints,
      so the filter route is already in force here and always was.

FP    `consensus-rankings?type=adp&scoring=HALF` — scoring only. And it is not
      a draft sample at all: `total_drafts: null`, "FantasyPros publishes expert
      consensus, not a draft sample". Format MIXING is not even the right model
      for an expert panel; nobody pooled leagues to build it.

So FFC is format-matched by construction and FP cannot be format-mixed. Neither
is the MFL pool the contamination was measured in.

── THE MEASUREMENT: FP AGAINST A FORMAT-MATCHED REFERENCE ──────────────────

FFC is the clean reference — provider-confirmed Half-PPR, 10 teams, 15 rounds.
Both sides ranked over the shared population, C's method, n=215:

    pos    n   median delta   of board
    QB    25       -13.0       -0.060
    RB    57        -2.0       -0.009
    WR    76       +12.0       +0.056
    TE    21       -28.0       -0.130

    age rho (QBs removed), n=172:  +0.127   against a +0.25 threshold

── WHAT THAT PROVES, AND WHAT IT DOES NOT ─────────────────────────────────

DYNASTY DOES NOT FIRE. +0.127 against +0.25. Between the two sources that
actually price the board there is no detectable dynasty/keeper contamination.

SUPERFLEX IS MISATTRIBUTED. The QB delta clears C's threshold (-13.0 vs -9.7)
and would read as a confirmation on its own. It is not one, because TE fires
MORE THAN TWICE AS HARD (-28.0) and SUPERFLEX CANNOT MOVE TIGHT ENDS. A
2QB-league contaminant shows up at QB and nowhere else; this shows up at TE
worst, QB second, and WR in the opposite direction.

What the pattern actually is: FP is expert opinion and FFC is revealed drafting
behaviour, and they disagree POSITIONALLY. Experts take TEs and QBs earlier
than real drafters do and receivers later. That is a real, measurable
difference between two kinds of source — and it is not contamination, so
filtering or replacing a source does not address it.

Checking the threshold alone would have confirmed the wrong mechanism. The
per-position breakdown is what refutes it, which is why this reports all four
positions rather than the one the hypothesis names.

NOT PROVEN: that FP's positional lean is WRONG. FP is primary because the
2023-24 source grade found it orders realized value best (adp.py:451). A
disagreement with FFC is not evidence FP is the one in error, and nothing here
argues for switching the mean.

NOT PROVEN: anything about MFL. C's -49.8 stands as measured on that pool; this
module says only that the pool it was measured in does not price the board.

── THE AXIS THAT SURVIVES ─────────────────────────────────────────────────

Both sources declare the SAME unmatched axis, and no source selection can fix
it because no public feed serves a parameter for it:

    FP  "passing TD value: our league scores 6.0, the market default is 4.0,
         and this consensus is drawn from 4.0 drafts"
    FFC "passing TD value: ... FFC serves no parameter for it — this source is
         4.0 like every other public source"

Our league scores 6-point passing TDs and -2 INTs; every public ADP is 4/-1.
The exact gap per player is closed-form and needs no fitting:

    delta(p) = 2*passTD(p) - INT(p)

Zero for anyone who does not throw. That is a VALUATION correction, not a
sourcing one, and it is the only format axis left after this measurement.

Run: python3 draft/backtest/lab_source_composition.py
"""
from __future__ import annotations

import json
import statistics as st
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#: C's thresholds, quoted so a reader can see what is being cleared or not.
SUPERFLEX_THRESHOLD = -9.7
DYNASTY_THRESHOLD = 0.25


def load():
    prices = json.loads((ROOT / "draft" / "data" / "external_source_prices.json").read_text())
    by_src = {e["source"]: e["rows"] for e in prices["series"]}
    art = json.loads((ROOT / "public" / "draft_data.json").read_text())
    meta = {str(p["player_id"]): p for p in art["players"]}
    return by_src, meta


def _pearson(xs, ys):
    mx, my = st.mean(xs), st.mean(ys)
    num = sum((a - mx) * (b - my) for a, b in zip(xs, ys))
    den = (sum((a - mx) ** 2 for a in xs) * sum((b - my) ** 2 for b in ys)) ** 0.5
    return num / den if den else 0.0


def compose(primary: str = "fantasypros", reference: str = "ffc") -> dict:
    """Rank `primary` against a FORMAT-MATCHED `reference` over shared players.

    Both sides are ranked over the SHARED population only. Ranking each source
    over its own full board and then intersecting would let a player missing
    from one side shift every rank below him on the other.
    """
    by_src, meta = load()
    a, b = by_src[primary], by_src[reference]
    shared = [pid for pid in a if pid in b and pid in meta]
    ar = {pid: i + 1 for i, pid in enumerate(sorted(shared, key=lambda p: a[p]))}
    br = {pid: i + 1 for i, pid in enumerate(sorted(shared, key=lambda p: b[p]))}
    n = len(shared)

    per_pos = {}
    for pos in ("QB", "RB", "WR", "TE"):
        g = [p for p in shared if meta[p].get("position") == pos]
        if len(g) < 5:
            continue
        d = [ar[p] - br[p] for p in g]
        per_pos[pos] = {"n": len(g), "median_delta": st.median(d),
                        "of_board": st.median(d) / n}

    ages = [p for p in shared
            if meta[p].get("position") != "QB" and meta[p].get("age")]
    rho = _pearson([meta[p]["age"] for p in ages], [ar[p] - br[p] for p in ages])

    inside = [p for p in shared if a[p] <= 150]
    gap = sorted(abs(a[p] - b[p]) for p in inside)

    qb = per_pos.get("QB", {}).get("median_delta", 0.0)
    worst = min(per_pos, key=lambda k: per_pos[k]["median_delta"]) if per_pos else None
    return {
        "n_shared": n, "per_pos": per_pos,
        "age_rho_qb_removed": rho, "age_rho_n": len(ages),
        "qb_delta": qb,
        "qb_clears_superflex_threshold": qb < SUPERFLEX_THRESHOLD,
        "dynasty_fires": rho > DYNASTY_THRESHOLD,
        # THE DISCRIMINATOR. Superflex moves QUARTERBACKS. If some other
        # position moved further, the QB number is not measuring superflex
        # however cleanly it clears the threshold.
        "worst_position": worst,
        "superflex_signature_holds": worst == "QB",
        "centre_gap_inside_150": {
            "n": len(gap),
            "median": st.median(gap) if gap else None,
            "p90": gap[int(0.9 * len(gap))] if gap else None,
            "max": max(gap) if gap else None,
        },
    }


def main():
    r = compose()
    print(f"crosswalked players: {r['n_shared']}")
    print("\n%-4s %4s %13s %10s" % ("pos", "n", "median delta", "of board"))
    for pos, v in r["per_pos"].items():
        print("%-4s %4d %13.1f %10.3f" % (pos, v["n"], v["median_delta"], v["of_board"]))
    print(f"\nQB delta {r['qb_delta']:+.1f} vs threshold {SUPERFLEX_THRESHOLD} -> "
          f"clears: {r['qb_clears_superflex_threshold']}")
    print(f"worst position is {r['worst_position']} -> superflex signature holds: "
          f"{r['superflex_signature_holds']}")
    print(f"age rho (QB removed, n={r['age_rho_n']}): {r['age_rho_qb_removed']:+.3f} "
          f"vs {DYNASTY_THRESHOLD} -> fires: {r['dynasty_fires']}")
    g = r["centre_gap_inside_150"]
    print(f"\ncentre gap inside 150: n={g['n']} median {g['median']:.1f} "
          f"p90 {g['p90']:.1f} max {g['max']:.1f}")


if __name__ == "__main__":
    main()
