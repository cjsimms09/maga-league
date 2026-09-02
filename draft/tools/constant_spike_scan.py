#!/usr/bin/env python3
"""CONSTANT-SPIKE + RATIO-LOCK SCAN — the 08-17 defect class, watched. REPORT ONLY.

THE CLASS, from this project's own history: every dispersion field on the board
was `proj_mean × a per-band constant` for WEEKS — zero player-specific
information wearing per-player names — and it silently caused three wrong
conclusions before anyone noticed. The same shape recurred at least four more
times: `adp_sd` at two values across 94.6% of the board · `proj_ceiling` at a
flat 1.35 × proj_mean · the Why? panel's entry/RS ratio at exactly 1.600 for
every player · `rookie_affinity` at 0.0 for all ten managers. Nobody was ever
looking for the SHAPE — each instance was found by accident, late.

TWO DETECTORS, one pass over the live board:

  CONSTANT SPIKE  a numeric per-player field whose top value covers ≥ SPIKE
                  of its non-null rows (a "measurement" that is mostly one
                  number is a constant wearing a column name);
  RATIO LOCK      a field pair whose per-player ratio has coefficient of
                  variation < LOCK_CV across ≥ MIN_N rows (field B is field A
                  in a trench coat — per-player information is an illusion).

REPORT ONLY, by design and permanently: ~some spikes are legitimate (a weight
column, a boolean-ish flag, a cohort statistic that SAYS it is one). This
prints findings for a human; `intervention-rate` already wrote the epitaph
for guards that cry wolf. The one mechanical pin lives in the test: the
KNOWN-LEGITIMATE list below must stay annotated, so a new spike is a new
finding rather than noise, and the scan itself is proven able to fire.

Run: python3 draft/tools/constant_spike_scan.py [--board public/draft_data.json]
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

SPIKE = 0.60          # top value covering >=60% of non-null rows
LOCK_CV = 0.02        # ratio CV under 2% == locked
MIN_N = 50

# Spikes that are TRUE of the model and documented — each carries its reason.
# An entry here without a reason is itself a finding.
KNOWN_LEGITIMATE = {
    "adp_season": "one draft season, by definition",
    "raw_adp_season": "one draft season, by definition",
    "consensus_rank_season": "season stamp, same class as adp_season "
                             "(season_stamp.py marks it 'derived')",
    "bye": "byes cluster on a handful of weeks — a spike is the schedule, not a defect",
    "opportunity_adj": "0.0 by Cory's opportunity_cap=0.0 ruling; the pin is "
                       "GUARDED by opportunity_adj_stays_off.test.js — a spike "
                       "at any value but 0.0 would be that guard failing first",
}
KNOWN_LOCKED_PAIRS = {
    # All three are ONE fact: proj_mean = proj_baseline × (1 + opportunity_adj)
    # (build.py ~:2013) with adj pinned at 0.0 by ruling, and proj_sleeper is
    # the baseline source. If the opportunity ruling ever changes, DELETE these
    # three entries — the locks would then be real findings again.
    ("proj_baseline", "proj_mean"): "identity while opportunity_adj==0.0 (ruled)",
    ("proj_baseline", "proj_sleeper"): "sleeper IS the baseline source",
    ("proj_mean", "proj_sleeper"): "transitive: both equal proj_baseline today",
}


#: Spellings of ONE Draft Sharks field (attach_draftsharks.py writes both; the
#: alt-source ranker reads one). A copy is not a lock.
_DS_SPELLINGS = [{"proj_ds", "proj_draftsharks"}, {"proj_ds_floor", "proj_floor_ds"},
                 {"proj_ds_ceiling", "proj_ceiling_ds"}]


def copy_by_construction(a, b, mean_ratio):
    """A reason when field b is a COPY of field a by construction (or the
    reverse), so a ratio lock at exactly 1.0 is an alias, not the 08-17
    class. Added 2026-09-02 after the scan reported sixteen 1.0× locks on the
    live board and every one was a copy: alt_source_rankings.py writes
    `proj_used_<src>` = that source's own `proj_mean` for covered rows
    (`row["proj_used"] = sp.get("proj_mean")`, :99), attach_draftsharks.py
    writes `proj_ds` and `proj_draftsharks` from one `ds_proj`, and
    `proj_mean_sleeper_only`/`proj_sleeper` are the baseline source. A rule,
    not a list, so a new source's `proj_used_` column is explained the day it
    lands — and ONLY at ratio 1.0: a copy that is not 1.0× is not a copy, and
    a 1.35× lock is exactly what this scan exists to catch (tested)."""
    if abs(float(mean_ratio) - 1.0) > 1e-3:
        return None
    x, y = sorted((a, b))
    fam = lambda n: n[len("proj_used_"):] if n.startswith("proj_used_") else None  # noqa: E731
    for used, other in ((a, b), (b, a)):
        k = fam(used)
        if k is None:
            continue
        if other in ("proj_" + k, "proj_mean_" + k + "_only") or other.startswith("proj_used_"):
            return f"proj_used_{k} is the {k} source's own projection on covered rows (alt_source_rankings.py:99)"
        if k == "sleeper" and other in ("proj_baseline", "proj_sleeper", "proj_mean_sleeper_only"):
            return "sleeper is the baseline source; proj_used_sleeper copies it"
        if k == "ds" and other in ("proj_ds", "proj_draftsharks"):
            return "proj_used_ds copies Draft Sharks' own projection (one ds_proj, two spellings)"
    if {x, y} in _DS_SPELLINGS:
        return "two spellings of one Draft Sharks field (attach_draftsharks.py:182-186)"
    if {x, y} <= {"proj_mean_sleeper_only", "proj_sleeper", "proj_baseline"}:
        return "sleeper IS the baseline source (three spellings of it)"
    return None


def numeric_fields(players):
    fields = set()
    for p in players[:200]:
        for k, v in p.items():
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                fields.add(k)
    return sorted(fields)


def scan(players):
    findings = {"constant_spikes": [], "ratio_locks": [],
                "known_legitimate_hits": [], "known_locked_hits": []}
    fields = numeric_fields(players)

    for f in fields:
        vals = [round(float(p[f]), 6) for p in players
                if isinstance(p.get(f), (int, float)) and not isinstance(p.get(f), bool)]
        if len(vals) < MIN_N:
            continue
        top, n_top = Counter(vals).most_common(1)[0]
        share = n_top / len(vals)
        if share >= SPIKE:
            hit = {"field": f, "top_value": top,
                   "share": round(share, 3), "n": len(vals)}
            if f in KNOWN_LEGITIMATE:
                hit["legitimate_because"] = KNOWN_LEGITIMATE[f]
                findings["known_legitimate_hits"].append(hit)
            else:
                findings["constant_spikes"].append(hit)

    # ratio locks over the projection-family pairs where the class has bitten
    pairs = [(a, b) for i, a in enumerate(fields) for b in fields[i + 1:]
             if a.startswith("proj") and b.startswith("proj")]
    for a, b in pairs:
        ratios = []
        for p in players:
            va, vb = p.get(a), p.get(b)
            if (isinstance(va, (int, float)) and isinstance(vb, (int, float))
                    and not isinstance(va, bool) and not isinstance(vb, bool) and va):
                ratios.append(vb / va)
        if len(ratios) < MIN_N:
            continue
        m = sum(ratios) / len(ratios)
        if not m:
            continue
        sd = (sum((r - m) ** 2 for r in ratios) / len(ratios)) ** 0.5
        cv = abs(sd / m)
        if cv < LOCK_CV:
            hit = {"pair": [a, b], "mean_ratio": round(m, 4),
                   "cv": round(cv, 5), "n": len(ratios)}
            why = KNOWN_LOCKED_PAIRS.get((a, b)) or copy_by_construction(a, b, m)
            if why:
                hit["legitimate_because"] = why
                findings["known_locked_hits"].append(hit)
            else:
                findings["ratio_locks"].append(hit)
    return findings


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--board", default=str(ROOT / "public" / "draft_data.json"))
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    args = ap.parse_args(argv)
    board = json.loads(Path(args.board).read_text())
    players = [p for p in board.get("players", []) if p.get("proj_mean")]
    f = scan(players)
    if args.json:
        print(json.dumps(f, indent=1))
    else:
        print(f"constant-spike scan over {len(players)} players")
        for h in f["constant_spikes"]:
            print(f"  ⚠ SPIKE  {h['field']}: value {h['top_value']} covers "
                  f"{h['share']:.0%} of {h['n']} rows")
        for h in f["ratio_locks"]:
            print(f"  ⚠ LOCK   {h['pair'][1]} ≈ {h['mean_ratio']} × {h['pair'][0]} "
                  f"(cv {h['cv']}, n {h['n']})")
        for h in f["known_legitimate_hits"]:
            print(f"  · known  {h['field']} ({h['legitimate_because']})")
        for h in f["known_locked_hits"]:
            print(f"  · known  {h['pair'][1]} ≈ {h['pair'][0]} ({h['legitimate_because']})")
        if not f["constant_spikes"] and not f["ratio_locks"]:
            print("  no unexplained spikes or locks — the 08-17 class is not "
                  "currently present on the board")
    # REPORT ONLY: exit 0 regardless. The findings are for a human.
    return 0


if __name__ == "__main__":
    sys.exit(main())
