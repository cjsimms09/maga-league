# TERRITORY: C
"""EXTERNAL ADP HISTORICAL — genuine FFC and FantasyPros ADP, 2023/2024/2025 and
a properly-labeled snapshot of today, per A's 08-17 load order (1).

THE DEFECT THIS UNBLOCKS. The probe that justified anchoring the board on
FantasyPros built a lookup it *named* `ffc_rank` out of the board's own
`raw_adp` — which was already FantasyPros — and compared it to a fresh FP
pull. Spearman came back exactly 1.0000 because it compared FP to itself
(register row 19). So "FP beats FFC" was never measured; the anchor rests on
a degenerate comparison. This module gets a GENUINE FFC snapshot, named for
what it holds, plus the per-year historical stores the honest re-run needs.

NOTHING IS GRADED OR ANCHORED HERE. `draft/adp.py`'s `build_adp_table` and
`build_fantasypros_table` already do the fetch, crosswalk, and defect-hardened
accounting (collision detection, an accounting identity that refuses a table
that cannot count itself, a top-150 unmatched guard) — this module calls that
existing, already-tested machinery per year and commits properly-labeled
stores. It does not decide which source anchors the board; that is A's call.

⚠ `build_adp_table` RAISES `SystemExit` ON A DEFECT, NOT JUST `RuntimeError`.
`SystemExit` is a `BaseException`, not an `Exception` — a bare `except
Exception` does not catch it, and it would kill the whole capture run rather
than voiding one year cleanly. Learned from running `external_source_projections
.py`'s real CLI the same way this session: reading a function's contract is
not the same as verifying it, and this module verifies its own catch clause
with a test that raises `SystemExit` on purpose.

CROSS-YEAR DISTINCTNESS IS CHECKED, NOT ASSUMED. A source that ignores the
`year` query parameter and serves today's board regardless would still
"succeed" — same shape `sleeper_hist_proj`'s `post_hoc_season_parameter` gate
exists to catch, applied here to FFC and FantasyPros historical ADP instead of
Sleeper's historical projections.

Both APIs are proxy-blocked from this sandbox and reachable from Actions,
measured 2026-08-17 — same shape as the MFL and Sleeper/FP findings. Runs as a
workflow dispatched FROM `main` for the same reason those do: a feature-branch
dispatch had its answer discarded by the push guard on 08-16.

Run: python3 draft/backtest/external_adp_historical.py [--years 2023 2024 2025 2026]
"""
from __future__ import annotations

import itertools
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

YEARS = (2023, 2024, 2025, 2026)
TEAMS = 10
FMT = "half-ppr"
OUT = HERE / "external_adp_historical.json"

#: A year's two arms agreeing on more than this fraction of shared players'
#: `adp` is suspicious rather than a coincidence of a stable market — the same
#: bar shape `sleeper_hist_proj`'s leak gate uses on identical-value fractions.
#: ⚠ CHOSEN, NOT DERIVED: two real years share SOME players at the same ADP by
#: chance (a consensus #1 overall does not move), so the bar is deliberately
#: loose. It exists to catch "the endpoint ignored `year` entirely" — total or
#: near-total identity — not to flag ordinary market stability.
SUSPECT_IDENTICAL_FRACTION = 0.5


def capture_year(adp_module, players: dict, year: int, *, teams: int = TEAMS,
                 fmt: str = FMT) -> dict:  # pragma: no cover  (egress; CI only)
    """One year's FFC + FantasyPros ADP, or a stated VOID for either half.

    Each half fails independently — a bad FantasyPros fetch must not cost the
    FFC arm for the same year, and vice versa.
    """
    out: dict = {"year": year}

    try:
        ffc = adp_module.build_adp_table(players, fmt=fmt, teams=teams, year=year)
    except (Exception, SystemExit) as exc:                 # noqa: BLE001
        out["ffc"] = {"status": "VOID", "reason": str(exc),
                     "error_type": type(exc).__name__}
    else:
        out["ffc"] = {"status": "captured", "matched": ffc["report"]["matched"],
                     "report": ffc["report"], "rows": ffc["adp"]}

    try:
        table, diag = adp_module.build_fantasypros_table(players, year=year)
    except (Exception, SystemExit) as exc:                 # noqa: BLE001
        out["fantasypros"] = {"status": "VOID", "reason": str(exc),
                             "error_type": type(exc).__name__}
    else:
        if table is None:
            out["fantasypros"] = {"status": "VOID",
                                  "reason": diag.get("reason", "fetch too thin to trust"),
                                  "diag": diag}
        else:
            out["fantasypros"] = {"status": "captured", "matched": len(table),
                                  "diag": diag, "rows": table}
    return out


def cross_year_distinctness(captures: dict) -> dict:
    """PURE. Pairwise, per source: how much do two years' `adp` values agree,
    restricted to players present in both? -> {"2023_vs_2024_ffc": {...}, ...}.

    A source whose `year` parameter does nothing would still report `captured`
    — this is the check that would catch it, by comparing what was actually
    returned rather than trusting that a 200 means the request was honored.
    """
    years = sorted(int(y) for y in captures)
    out: dict = {}
    for a, b in itertools.combinations(years, 2):
        for src in ("ffc", "fantasypros"):
            ca = (captures.get(a) or captures.get(str(a)) or {}).get(src) or {}
            cb = (captures.get(b) or captures.get(str(b)) or {}).get(src) or {}
            key = "%d_vs_%d_%s" % (a, b, src)
            if ca.get("status") != "captured" or cb.get("status") != "captured":
                out[key] = {"status": "unmeasured",
                           "why": "at least one side did not capture"}
                continue
            ra, rb = ca.get("rows") or {}, cb.get("rows") or {}
            shared = sorted(set(ra) & set(rb))
            if not shared:
                out[key] = {"status": "unmeasured", "shared": 0,
                           "why": "no player appears in both years' tables"}
                continue
            identical = sum(1 for p in shared
                            if abs(float(ra[p]["adp"]) - float(rb[p]["adp"])) < 1e-9)
            frac = identical / len(shared)
            out[key] = {
                "status": ("suspect_identical" if frac > SUSPECT_IDENTICAL_FRACTION
                          else "distinct"),
                "shared": len(shared), "identical": identical,
                "identical_fraction": round(frac, 4),
            }
    return out


def fetch_all(years=YEARS) -> dict:  # pragma: no cover  (egress; CI only)
    """The impure half: fetch every requested year, then the pure distinctness
    check above. -> the document written to disk."""
    import adp as ADP
    import sleeper_import as SL

    try:
        players = SL.fetch_players()
    except Exception as exc:                              # noqa: BLE001
        return {"status": "VOID",
               "reason": "Sleeper player index unreachable — a fact about "
                         "the runner, not about either ADP source",
               "error": "%s: %s" % (type(exc).__name__, exc)}
    if not players:
        return {"status": "VOID",
               "reason": "Sleeper player index unreachable — a fact about "
                         "the runner, not about either ADP source"}

    captures = {}
    for year in years:
        captures[str(year)] = capture_year(ADP, players, int(year))

    return {
        "status": "captured",
        "_territory": "TERRITORY: C — produced by "
                       "draft/backtest/external_adp_historical.py",
        "_note": ("FFC is named `ffc`, FantasyPros is named `fantasypros` — "
                  "neither is stored under the other's name. Nothing here "
                  "anchors the board or grades one source against another; "
                  "that is A's call. See draft/backtest/"
                  "ADP-SOURCE-2026-PREREG.md for the study this feeds."),
        "as_of": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "years": captures,
        "cross_year_distinctness": cross_year_distinctness(captures),
    }


def main() -> int:  # pragma: no cover  (egress; CI only)
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=int, nargs="*", default=list(YEARS))
    args = ap.parse_args()

    doc = fetch_all(tuple(args.years))
    OUT.write_text(json.dumps(doc, indent=1) + "\n")
    if doc.get("status") == "VOID":
        print("VOID — %s" % doc["reason"], file=sys.stderr)
        return 1
    def _summary(arm: dict) -> str:
        if arm["status"] == "captured":
            return "captured(%d matched)" % arm["matched"]
        return "VOID(%s)" % str(arm.get("reason", ""))[:70]

    for year, cap in sorted(doc["years"].items(), key=lambda kv: int(kv[0])):
        print("%s: ffc=%s  fp=%s" % (year, _summary(cap["ffc"]), _summary(cap["fantasypros"])))
    suspect = [k for k, v in doc["cross_year_distinctness"].items()
              if v.get("status") == "suspect_identical"]
    if suspect:
        print("⚠ SUSPECT IDENTICAL across years (check `year` is honored): %s"
             % suspect, file=sys.stderr)
    print("wrote %s" % OUT.name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
