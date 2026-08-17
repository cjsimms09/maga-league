# TERRITORY: A
"""SLEEPER PRESEASON PROJECTION ARCHIVE — capture before it decays further.

Cory's standing principle, stated for Kalshi on 2026-08-16 and applying
identically here: "Make sure we are happy about it 2027 and not upset we
didn't capture something."

WHY THIS IS URGENT AND FREE. `sleeper_hist_proj.py` proved that Sleeper DOES
serve historical projections — retiring a blocking claim four committed
records had repeated without any of them asking the API. In doing so it
measured something worse than the original problem:

    HOLLOW RATE (rows present, stat lines emptied)
        2026   0.0 %
        2025   7.1 %
        2024  17.2 %
        2023  25.4 %

Monotone in age. Sleeper is not deleting seasons, it is EMPTYING them, so a
row count looks healthy while the content bleeds out. A quarter of 2023 is
already gone. Every year we do not capture, every future backtest has
permanently less to work with — and the board's `proj_mean` has ranked on
this source, ungraded, for its whole life.

This costs nothing: Sleeper's API is free, needs no key, and this is a read.
There is no budget question to weigh, only a clock.

WHAT THIS IS NOT. It captures; it does not grade. `sleeper_hist_proj.py`
owns the leak gates and `sleeper_vs_fp_grade.py` owns the comparison — and
their verdict already stands: 2025 is clean, 2023 and 2024 are REFUSED as
ungradeable, and `proj_mean` stays on Sleeper. **A refused season is still
worth archiving**: refusal was about whether a season could be GRADED
leak-free, not about whether the payload is worth keeping. A future pass with
better provenance tooling may be able to use what today's gates could not,
and it can only do that if the bytes still exist.

Stores the SCORED projection (points under the frozen table) alongside the
raw stat line, so a future reader never has to reconstruct which scoring
table was in force.

Run (CI only — this sandbox cannot reach Sleeper):
    python3 draft/backtest/sleeper_proj_archive.py --seasons 2023 2024 2025
Writes draft/backtest/sleeper_proj_archive_<season>.json
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(DRAFT))


def _hollow_rate(rows: dict) -> dict:
    """Rows present vs rows carrying an actual stat line.

    This is the decay measurement itself, recomputed at every capture so the
    archive records the state of the source AT CAPTURE TIME. If a later run
    shows a worse rate, the difference is exactly what was lost in between —
    which is the evidence that would justify capturing again sooner."""
    total = len(rows)
    with_stats = sum(1 for v in rows.values() if isinstance(v, dict) and v)
    return {
        "rows": total,
        "rows_with_stat_line": with_stats,
        "hollow_rows": total - with_stats,
        "hollow_rate": round((total - with_stats) / total, 4) if total else None,
    }


def build_archive(season: int, projections: dict, scoring: dict) -> dict:
    """Pure: raw Sleeper payload + frozen scoring table -> the archive doc.

    Keeps BOTH the raw stat line and the scored total. Storing only the score
    would make the archive unreadable the moment the scoring table changed;
    storing only the raw line would make every future reader re-derive the
    conversion and risk deriving it differently."""
    scored, kept = {}, {}
    for pid, line in (projections or {}).items():
        if not isinstance(line, dict) or not line:
            continue                      # hollow row: absent, never a zero
        pts = 0.0
        for stat, val in line.items():
            rate = scoring.get(stat)
            if rate is None or val is None:
                continue
            try:
                pts += float(val) * float(rate)
            except (TypeError, ValueError):
                continue
        kept[pid] = line
        scored[pid] = round(pts, 3)
    nonzero = sum(1 for v in scored.values() if v)
    return {
        "_territory": "TERRITORY: A — produced by draft/backtest/sleeper_proj_archive.py",
        "_note": ("Sleeper PRESEASON projections, captured because the source "
                  "is hollowing (~7 points of stat-line loss per year of age). "
                  "Raw stat line AND the score under the frozen table are both "
                  "kept, so a future reader never has to guess which scoring "
                  "was in force. CAPTURE ONLY — leak gating lives in "
                  "sleeper_hist_proj.py, grading in sleeper_vs_fp_grade.py. A "
                  "season REFUSED as ungradeable is still archived: refusal "
                  "was about grading leak-free, not about the bytes being "
                  "worthless."),
        "season": season,
        "captured_at": _dt.datetime.now(_dt.timezone.utc).isoformat(),
        "source": "sleeper_import.fetch_projections (free, no key)",
        "decay": _hollow_rate(projections or {}),
        "scored_nonzero": nonzero,
        "scoring_table_fingerprint": sorted(scoring)[:12],
        "projections": kept,
        "scored_points": scored,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons", nargs="+", type=int, required=True)
    ap.add_argument("--out-dir", type=str, default=None)
    args = ap.parse_args()

    import sleeper_import as si
    import fetch_component_stats as FCS

    scoring = FCS.frozen_scoring_table()
    out_dir = Path(args.out_dir) if args.out_dir else HERE
    out_dir.mkdir(parents=True, exist_ok=True)

    rc = 0
    for season in args.seasons:
        proj = si.fetch_projections(str(season))
        if not proj:
            print(f"{season}: NOTHING RETURNED — not archived")
            rc = 1
            continue
        doc = build_archive(season, proj, scoring)
        path = out_dir / f"sleeper_proj_archive_{season}.json"
        path.write_text(json.dumps(doc, indent=1))
        d = doc["decay"]
        print(f"{season}: wrote {path.name} — {d['rows']} rows, "
              f"{d['rows_with_stat_line']} with stat lines "
              f"(hollow {d['hollow_rate']}), {doc['scored_nonzero']} scored nonzero")
    return rc


if __name__ == "__main__":
    sys.exit(main())
