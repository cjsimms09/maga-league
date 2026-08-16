# TERRITORY: A
"""EXP-TIEBREAK-SIGNALS — two candidate tie-break signals, measured.

Feeds Mission B of draft/audit/roster_construction_audit_2026-08-15.md.

PART 1 — CEILING (the SHIPPED tiebreak's input), structural.
  applyCeilingTiebreak leans same-position/same-tier near-ties toward higher
  proj_ceiling. The board builds ceiling = proj_mean + 1.036 * proj_sd with
  proj_sd = proj_mean * variance — so ceiling only says something proj_mean
  does not where `variance` actually varies WITHIN a position/tier group.
  PREREGISTERED metrics (before computing): per position — count of distinct
  `variance` values; Spearman rank correlation of (proj_ceiling, proj_mean);
  per (position, tier) group — fraction of player PAIRS whose ceiling order
  disagrees with their mean order (the only pairs where the tiebreak can add
  information). Verdict rule: if <10% of within-tier pairs can invert, the
  shipped tiebreak is mostly re-ranking by projection and its "upside" label
  overstates it; if variance is a per-position constant, it is fully
  decorative. HISTORICAL PREDICTIVE VALIDATION of proj_ceiling (did high-
  ceiling players realize more boom weeks 2023-25?) is UNMEASURABLE OFFLINE:
  no pre-2026 board ever archived a ceiling (proj_series freeze began
  2026-08-09, preseason only). Where it CAN be measured: January 2027, from
  the daily freeze, under EXP-CEILING-REPLICATE's room-sim harness.

PART 2 — AGE / EXPERIENCE, historical, 2023-2024 drafts.
  Question: among players of the same position drafted in the same round
  bucket (the market's own statement of near-equal value), did younger /
  less-experienced players deliver (a) more realized points that season, or
  (b) more NEXT-season realized points (the keeper-relevant quantity)?
  PREREGISTERED design: population = 2023+2024 main-draft picks, QB/RB/WR/TE,
  with years_exp derivable from the 2026 board (years_exp_at = 2026 value
  minus season offset; coverage reported — survivor-biased toward players
  still rostered in 2026, stated). Cells = (position, round bucket 1-3/4-6/
  7-9/10-12/13-15). Effect = mean of (realized − cell mean) per experience
  bucket (rookie-2yr / 3-5yr / 6+yr), same-season and next-season, weekly
  stores weeks 1-17 (our scoring; missing store rows = 0 points is WRONG, so
  missing rows are EXCLUDED and counted). Verdict rule: a bucket effect
  smaller than half its own bootstrap-free rough SE (sd/sqrt n) is a NULL;
  direction is only reported with n >= 30 per bucket.

Run: python3 draft/backtest/exp_tiebreak_signals.py
Writes: draft/backtest/exp_tiebreak_signals.json
"""
from __future__ import annotations

import json
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BOARD = ROOT / "public" / "draft_data.json"
HIST = ROOT / "draft" / "data" / "league_history.json"
POSFILE = ROOT / "draft" / "data" / "player_positions.json"
OUT = ROOT / "draft" / "backtest" / "exp_tiebreak_signals.json"

WEEK_CAP = 17


def spearman(xs, ys):
    def rank(v):
        order = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and v[order[j + 1]] == v[order[i]]:
                j += 1
            avg = (i + j) / 2 + 1
            for k in range(i, j + 1):
                r[order[k]] = avg
            i = j + 1
        return r
    rx, ry = rank(xs), rank(ys)
    mx, my = statistics.mean(rx), statistics.mean(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    dx = sum((a - mx) ** 2 for a in rx) ** 0.5
    dy = sum((b - my) ** 2 for b in ry) ** 0.5
    return num / (dx * dy) if dx and dy else None


def part1(board):
    players = [p for p in board["players"]
               if p.get("proj_mean") and p.get("proj_ceiling")
               and p["position"] in ("QB", "RB", "WR", "TE")]
    out = {}
    for pos in ("QB", "RB", "WR", "TE"):
        rows = [p for p in players if p["position"] == pos]
        variances = sorted({round(p.get("variance") or 0, 4) for p in rows})
        rho = spearman([p["proj_mean"] for p in rows],
                       [p["proj_ceiling"] for p in rows])
        # Within-tier pair inversions: ceiling order vs mean order.
        tiers = {}
        for p in rows:
            tiers.setdefault(p.get("tier") or 0, []).append(p)
        pairs = invert = 0
        for grp in tiers.values():
            for i in range(len(grp)):
                for j in range(i + 1, len(grp)):
                    a, b = grp[i], grp[j]
                    dm = a["proj_mean"] - b["proj_mean"]
                    dc = a["proj_ceiling"] - b["proj_ceiling"]
                    if dm == 0 or dc == 0:
                        continue
                    pairs += 1
                    if (dm > 0) != (dc > 0):
                        invert += 1
        out[pos] = {
            "n": len(rows),
            "distinct_variance_values": len(variances),
            "spearman_ceiling_vs_mean": round(rho, 4) if rho is not None else None,
            "within_tier_pairs": pairs,
            "pair_inversion_pct": round(100 * invert / pairs, 2) if pairs else None,
        }
    return out


def part2(board, hist, positions):
    def store(season):
        path = ROOT / "draft" / "backtest" / f"nflverse_weekly_points_{season}.json"
        data = json.loads(path.read_text())
        totals = {}
        for row in data["weeks"]:
            if 1 <= int(row["week"]) <= WEEK_CAP:
                for pid, pts in row["points"].items():
                    totals[pid] = totals.get(pid, 0.0) + float(pts)
        return totals

    stores = {yr: store(yr) for yr in ("2023", "2024", "2025")}
    yexp = {}
    for key in ("players", "kept_players"):
        for p in board.get(key) or []:
            if p.get("years_exp") is not None:
                yexp[str(p["player_id"])] = int(p["years_exp"])

    def bucket(rnd):
        return "1-3" if rnd <= 3 else "4-6" if rnd <= 6 else \
               "7-9" if rnd <= 9 else "10-12" if rnd <= 12 else "13-15"

    def exp_bucket(e):
        return "rookie-2yr" if e <= 2 else ("3-5yr" if e <= 5 else "6+yr")

    rows = []
    missing_yexp = missing_store = 0
    for yr, nxt in (("2023", "2024"), ("2024", "2025")):
        s = next(x for x in hist["seasons"] if x["season"] == yr)
        picks = max(s["drafts"], key=lambda d: len(d.get("picks") or []))["picks"]
        for p in picks:
            pid = str(p["player_id"])
            pos = positions.get(pid)
            if pos not in ("QB", "RB", "WR", "TE"):
                continue
            if pid not in yexp:
                missing_yexp += 1
                continue
            if pid not in stores[yr]:
                missing_store += 1
                continue
            rows.append({
                "cell": (pos, bucket(int(p["round"]))),
                "exp_bucket": exp_bucket(yexp[pid] - (2026 - int(yr))),
                "same": stores[yr][pid],
                "next": stores[nxt].get(pid),  # None = out of the league / no rows
            })

    def effects(field):
        cells = {}
        for r in rows:
            if r[field] is None:
                continue
            cells.setdefault(r["cell"], []).append(r)
        eff = {}
        for cell, rs in cells.items():
            m = statistics.mean(x[field] for x in rs)
            for r in rs:
                eff.setdefault(r["exp_bucket"], []).append(r[field] - m)
        table = {}
        for b, v in sorted(eff.items()):
            mean = statistics.mean(v)
            sd = statistics.pstdev(v) if len(v) > 1 else 0.0
            se = sd / (len(v) ** 0.5) if v else None
            table[b] = {"n": len(v), "mean_effect_pts": round(mean, 1),
                        "rough_se": round(se, 1) if se is not None else None,
                        "null": bool(se is not None and abs(mean) < 0.5 * se) or None}
        return table

    return {
        "population": len(rows),
        "excluded_missing_years_exp": missing_yexp,
        "excluded_missing_store_row": missing_store,
        "coverage_note": "years_exp derived from the 2026 board — survivor-biased toward players still rostered in 2026",
        "same_season_effect_by_exp": effects("same"),
        "next_season_effect_by_exp": effects("next"),
    }


def main():
    board = json.loads(BOARD.read_text())
    hist = json.loads(HIST.read_text())
    positions = dict(json.loads(POSFILE.read_text())["positions"])
    for key in ("players", "kept_players"):
        for p in board.get(key) or []:
            positions.setdefault(str(p["player_id"]), p.get("position"))

    out = {
        "_territory": "TERRITORY: A — research artifact, no production reader",
        "experiment": "EXP-TIEBREAK-SIGNALS — ceiling structure (live board) + age/experience effects (2023-2024 drafts)",
        "prereg": "header of draft/backtest/exp_tiebreak_signals.py",
        "part1_ceiling_structure": part1(board),
        "part2_age_experience": part2(board, hist, positions),
    }
    OUT.write_text(json.dumps(out, indent=1))
    print(json.dumps(out, indent=1))
    print("wrote", OUT)
    return out


if __name__ == "__main__":
    main()
