# TERRITORY: A
"""FIELDS THAT CARRY NO INFORMATION OF THEIR OWN — found by sweep, not by luck.

Cory, 2026-08-17: *"what other data are we missing or calculating off a constant
when we shouldn't be"*

THE DEFECT THIS DETECTS, stated as the thing it actually is. `proj_ceiling` was
`proj_mean + 1.036 x proj_sd`, and `proj_sd` was `proj_mean x (a per-band
constant)`. So the ceiling was the projection wearing a different name —
Spearman 1.0000 against `proj_mean` at every position on the real board. Four
fields shared that construction: `proj_ceiling`, `proj_floor`, `proj_sd`,
`weekly_sd`.

The cost was not cosmetic. A term that is a rescaled copy of another term cannot
be measured against it, so:

  - the composite `ceiling` weight measured collinear with `value` and was zeroed
  - the phase grid could only discover that double-counting the projection hurts,
    and that null was written up as "upside late is REFUTED"
  - the variance modifiers came back unmeasurable

Three dead ends, one cause. **Every one of them was found by accident**, which is
the actual problem — the next instance will not announce itself either.

HOW IT DECIDES, and why the obvious tests do not work. Four earlier attempts
failed on this board:

  1. comparing 6-decimal ratios against 2-decimal stored values — rounding noise
     swamped the signal
  2. exact-equality on ratios — zeros collapse everything to ratio 0 and match
  3. small share / big total — rounds to 0.000 and matches spuriously
  4. correlation alone — a genuinely useful field can correlate strongly with
     the projection without being a copy of it

What works is the COEFFICIENT OF VARIATION OF THE RATIO a/b. It is scale-free,
so it is immune to (1) and (3); it is near zero exactly when a is a fixed
multiple of b, which is the property in question; and it agreed with the known
answer on the fields whose construction was already understood. A field with
cv ~ 0 against another field contributes NOTHING that field does not already
contribute — it cannot be weighted independently, and any study that tries will
return a null it did not earn.

IT SWEEPS WITHIN CELLS, AND THE FIRST VERSION OF THIS FILE DID NOT — WHICH IS
WHY THIS PARAGRAPH EXISTS. Written globally, the sweep reported a clean board
and would have MISSED every field it was built to catch: the ratio
`proj_sd / proj_mean` is constant within a (position, band) cell but DIFFERENT
across cells, so the global cv is 0.22 and the per-position cv 0.10-0.18, both
far above any sane floor. A detector that cannot detect the known instance is
decoration, and shipping one here would have been the same mistake one level up
— an audit that reassures without measuring.

So the cell is `(position, band_of(within-position projection rank))`, taken
from `projection_error` rather than redefined, because a sweep that invents its
own bands is not testing the construction that is actually used.

AND IT CARRIES ITS OWN KNOWN-POSITIVE CONTROL (`--self-test`). It rebuilds the
pre-fix ceiling — `proj_mean x a per-band constant` — injects it as a synthetic
field, and requires the sweep to flag it. If that control ever stops firing, the
sweep is broken and says so instead of printing a reassuring "none". A clean
report is only meaningful from an instrument that has just proven it can fail.

EXACT ALIASES ARE REPORTED SEPARATELY (ratio == 1.0 everywhere). Some are
deliberate — `consensus_rank` is documented as an alias of `raw_adp` — so they
are surfaced as their own category rather than mixed in with the real finding.
An alias is a naming wart; a constant multiple wearing an independent name is a
measurement hazard.

Run:
    python3 draft/backtest/constant_multiple_sweep.py
    python3 draft/backtest/constant_multiple_sweep.py --self-test
    python3 draft/backtest/constant_multiple_sweep.py --board path/to/board.json
"""
from __future__ import annotations

import argparse
import json
import math
import statistics as st
import sys
from pathlib import Path

# Same sibling-import shape the rest of draft/backtest uses (projections.py,
# variance_modifiers.py, the tests): these modules import each other by bare
# name, so the package directory has to be importable.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from projection_error import band_of  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_BOARD = ROOT / "public" / "draft_data.json"

#: A cell needs this many rows before a within-cell cv means anything. Below it
#: a "constant ratio" is as likely to be three players who happen to line up.
MIN_CELL = 12

#: A field must read constant in at least this many cells to be reported. One
#: tight cell is a coincidence; the defect being hunted is constant in EVERY
#: cell by construction, so it clears this easily and a fluke does not.
MIN_CELLS_HIT = 3

#: Below this, the ratio a/b is constant enough that `a` carries no independent
#: information. Chosen against the known-bad fields rather than picked for
#: roundness: the pre-fix proj_ceiling/proj_mean ratio sat at cv ~ 0.0 (exactly
#: constant within band), while genuinely independent field pairs on this board
#: sit two orders of magnitude above it. Nothing on the current board lands
#: between 0.02 and 0.10, so the threshold is not near a boundary.
CV_FLOOR = 0.02

#: A pair needs this many shared non-zero rows before a cv means anything.
MIN_SHARED = 50


def _cv(vals: list[float]) -> float:
    m = st.fmean(vals)
    return st.pstdev(vals) / abs(m) if m else float("inf")


def numeric_fields(players: list[dict], min_n: int = MIN_SHARED) -> dict:
    """{field: {row_index: value}} for numeric fields with enough coverage.

    Booleans are excluded deliberately — `is_rookie` is numeric to Python and a
    constant multiple of nothing anyone cares about, and including them buries
    the real findings in flags.
    """
    num: dict = {}
    for i, p in enumerate(players):
        for k, v in p.items():
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                num.setdefault(k, {})[i] = float(v)
    return {k: v for k, v in num.items() if len(v) >= min_n}


def cell_of(players: list[dict]) -> dict:
    """{row_index: (position, band)} using the SAME banding as projection_error.

    The within-position projection rank is recomputed from `proj_mean` here
    rather than read off a similarly-named board field, because `pos_rank` is
    not guaranteed to be a projection rank and a sweep resting on the wrong
    ordering would report against cells that do not exist.
    """
    by_pos: dict = {}
    for i, p in enumerate(players):
        pos, mean = p.get("position"), p.get("proj_mean")
        if pos and isinstance(mean, (int, float)) and mean:
            by_pos.setdefault(pos, []).append((float(mean), i))
    out = {}
    for pos, rows in by_pos.items():
        rows.sort(key=lambda t: -t[0])
        for rank, (_m, i) in enumerate(rows, start=1):
            out[i] = (pos, band_of(rank))
    return out


def sweep(players: list[dict], cv_floor: float = CV_FLOOR,
          min_shared: int = MIN_SHARED, min_cell: int = MIN_CELL,
          min_cells_hit: int = MIN_CELLS_HIT) -> dict:
    """Every ordered pair (a, b) where a is a near-constant multiple of b.

    Reported at TWO scopes, because the two mean different things:

      - `constant_multiples` — constant across the whole board. A field that is
        globally a fixed multiple of another is a pure duplicate.
      - `within_cell_constants` — constant inside (position, band) cells while
        the multiplier CHANGES between them. This is the shape the real defect
        took, and it is invisible to the global test.
    """
    num = numeric_fields(players, min_shared)
    cells = cell_of(players)
    keys = sorted(num)
    constants, aliases, within, seen = [], [], [], set()
    for a in keys:
        for b in keys:
            if a == b or (b, a) in seen:
                continue
            shared = [i for i in num[a] if i in num[b] and num[b][i] != 0]
            if len(shared) < min_shared:
                continue
            ratios = [num[a][i] / num[b][i] for i in shared]
            if not all(math.isfinite(r) for r in ratios):
                continue
            seen.add((a, b))
            cv = _cv(ratios)
            mult = st.fmean(ratios)
            if cv < cv_floor:
                rec = {"field": a, "is_multiple_of": b,
                       "multiplier": round(mult, 6), "cv": round(cv, 8),
                       "n": len(shared)}
                # An exact 1.0 multiple is a rename, not a hidden dependency.
                # Some are deliberate; keeping them apart stops a known alias
                # from drowning a real finding.
                (aliases if abs(mult - 1.0) < 1e-9 and cv < 1e-9
                 else constants).append(rec)
                continue
            # Not globally constant — but is it constant INSIDE each cell?
            per_cell: dict = {}
            for i in shared:
                if i in cells:
                    per_cell.setdefault(cells[i], []).append(num[a][i] / num[b][i])
            # BOTH FIELDS MUST ACTUALLY VARY INSIDE THE CELL. A ratio of two
            # constants is trivially constant and says nothing about
            # dependence: `adp_season` is 2026 for every row and
            # `games_expected` is fixed per cell, so their ratio reads as a
            # perfect "constant multiple" while the two are entirely unrelated.
            # Without this filter a third of the report is that artifact, and a
            # report that is a third noise is one nobody finishes reading.
            varies: dict = {}
            for i in shared:
                if i in cells:
                    varies.setdefault(cells[i], []).append((num[a][i], num[b][i]))
            hits = {}
            for c, v in per_cell.items():
                if len(v) < min_cell or _cv(v) >= cv_floor:
                    continue
                av = [x for x, _ in varies[c]]
                bv = [y for _, y in varies[c]]
                if _cv(av) < cv_floor or _cv(bv) < cv_floor:
                    continue
                hits[c] = v
            if len(hits) < min_cells_hit:
                continue
            mults = sorted(round(st.fmean(v), 4) for v in hits.values())
            within.append({
                "field": a, "is_multiple_of": b,
                "cells_constant": len(hits),
                "cells_examined": sum(1 for v in per_cell.values() if len(v) >= min_cell),
                "multiplier_range": [mults[0], mults[-1]],
                "worst_cell_cv": round(max(_cv(v) for v in hits.values()), 8),
                "global_cv": round(cv, 6),
            })
    return {"constant_multiples": constants, "aliases": aliases,
            "within_cell_constants": within,
            "fields_examined": len(keys), "rows": len(players)}


def self_test(players: list[dict]) -> dict:
    """KNOWN-POSITIVE CONTROL: rebuild the pre-fix ceiling and demand it is caught.

    `proj_ceiling` used to be `proj_mean + 1.036 x proj_sd` with `proj_sd` equal
    to `proj_mean x (a per-band constant)` — i.e. the projection rescaled, with
    a multiplier that varied by cell. This injects exactly that field and
    requires the sweep to flag it. A sweep that reports "none" without having
    passed this is an instrument nobody has checked.
    """
    band_mult = {"1-3": 1.24, "4-8": 1.31, "9-16": 1.42, "17-32": 1.55, "33+": 1.69}
    cells = cell_of(players)
    probe = []
    for i, p in enumerate(players):
        q = dict(p)
        mean = p.get("proj_mean")
        if i in cells and isinstance(mean, (int, float)) and mean:
            q["_synthetic_prefix_ceiling"] = float(mean) * band_mult.get(cells[i][1], 1.4)
        probe.append(q)
    out = sweep(probe)
    caught = [r for r in out["within_cell_constants"]
              if r["field"] == "_synthetic_prefix_ceiling"
              and r["is_multiple_of"] == "proj_mean"]
    return {"caught": bool(caught), "detail": caught[0] if caught else None}


def load_board(path: Path) -> list[dict]:
    doc = json.loads(path.read_text())
    return doc["players"] if isinstance(doc, dict) else doc


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--board", type=Path, default=DEFAULT_BOARD)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--self-test", action="store_true",
                    help="run only the known-positive control and report")
    args = ap.parse_args()

    players = load_board(args.board)

    # THE CONTROL RUNS FIRST, ALWAYS. A clean sweep is only evidence if the
    # instrument has just demonstrated it can fail; otherwise "none found" and
    # "nothing works" print the same thing.
    control = self_test(players)
    if not control["caught"]:
        print("SELF-TEST FAILED: the sweep did not catch a KNOWN constant "
              "multiple (a rebuilt pre-fix proj_ceiling). Every result below "
              "would be meaningless, so nothing is reported.", file=sys.stderr)
        return 2
    d = control["detail"]
    print(f"self-test OK — known-positive caught in {d['cells_constant']} cells "
          f"(multiplier {d['multiplier_range'][0]}..{d['multiplier_range'][1]}, "
          f"global cv {d['global_cv']:.4f} would have HIDDEN it)\n")
    if args.self_test:
        return 0

    out = sweep(players)
    if args.json:
        print(json.dumps(out, indent=1))
        return 0

    print(f"{out['rows']} rows, {out['fields_examined']} numeric fields examined\n")
    print("CONSTANT MULTIPLES — a field that is another field rescaled, boardwide")
    print("(these cannot be weighted independently; a study that tries returns "
          "a null it did not earn)\n")
    if out["constant_multiples"]:
        for r in out["constant_multiples"]:
            print(f"  {r['field']} = {r['multiplier']:.4f} x {r['is_multiple_of']}"
                  f"   cv={r['cv']:.6f}  n={r['n']}")
    else:
        print("  none")

    print("\nWITHIN-CELL CONSTANTS — constant inside (position, band), varying "
          "between cells")
    print("(THE SHAPE THE REAL DEFECT TOOK; invisible to the boardwide test above)\n")
    if out["within_cell_constants"]:
        for r in out["within_cell_constants"]:
            print(f"  {r['field']} = c x {r['is_multiple_of']} in "
                  f"{r['cells_constant']}/{r['cells_examined']} cells, "
                  f"c in {r['multiplier_range']}, worst cell cv "
                  f"{r['worst_cell_cv']:.6f}")
    else:
        print("  none")

    print("\nEXACT ALIASES — same values under two names (often deliberate)\n")
    for r in out["aliases"]:
        print(f"  {r['field']} == {r['is_multiple_of']}  (n={r['n']})")
    return 1 if (out["constant_multiples"] or out["within_cell_constants"]) else 0


if __name__ == "__main__":
    sys.exit(main())
