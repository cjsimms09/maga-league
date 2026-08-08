#!/usr/bin/env python3
"""THE LAB — the registry runner.

Standing infrastructure per docs/queued/the-lab.md + LAB-REGISTRY.md. Runs the
registered experiments that are wired to the shared harness (money_grade +
roster_sim + lab_stats), grades them in E[$] under era-correct payouts, and
writes an append-only results file plus a one-table Lab report for the Sunday
self-audit.

Two experiment kinds:
  * measurement — a descriptive number (no selection, so no null gate); labeled
    as measurement so it is never read as a shipped edge.
  * gated — a champion-challenger selection; ships only through lab_stats.ship_rule
    (beats null p95 AND survives leave-one-season-out).

Run: python draft/backtest/lab.py [--out draft/backtest]
"""
from __future__ import annotations
import argparse
import json
import subprocess
from pathlib import Path

import money_grade as MG
import roster_sim as RS

HERE = Path(__file__).resolve().parent
COMPLETED_SEASONS = ["2023", "2024", "2025"]


def _git_head() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=HERE.parent.parent,
                                       text=True).strip()
    except Exception:
        return "UNAVAILABLE"


# --- Experiment L0 (measurement): weekly-high + RS money left on the table -----
# Fully wired to the harness NOW (no draft replay needed): for each real roster,
# compare the dollars its REALIZED season earned (weekly-high + RS) against the
# dollars its hindsight-OPTIMAL lineup would have earned. The gap is money the
# league left on the table through lineup decisions — the in-season lineup
# experiments' headline, measured directly. Proves the roster->scores->dollars
# pipeline end to end. (Playoff $ excluded until the substituted-seat bracket
# resim lands; weekly-high + RS are exact.)
def exp_lineup_ceiling_money(history, payouts) -> dict:
    per_season = []
    for season in COMPLETED_SEASONS:
        s = MG.season_of(history, season)
        pos = RS.infer_positions(s)
        actual = MG.grade_actual(history, payouts, season)
        rs_weeks = MG.regular_season_weeks(s)
        deltas = []
        for e0 in (s["weeks"][str(rs_weeks[0])]):
            rid = int(e0["roster_id"])
            # realized weekly-high + RS for this seat (from the exact grade).
            realized = actual["per_roster"][rid]["weekly_high"] + actual["per_roster"][rid]["regular_season"]
            # hindsight ceiling: best legal lineup every week from actual players.
            players = _season_players(s, rid)
            ceiling_scores = RS.roster_weekly_scores(s, players, pos)
            sub = MG.grade_substituted(history, payouts, season, rid, ceiling_scores)
            deltas.append(sub["graded_total_partial"] - realized)
        mean_delta = round(sum(deltas) / len(deltas), 2)
        per_season.append({"season": season, "mean_dollars_left_on_table": mean_delta,
                           "max_seat": round(max(deltas), 2)})
    return {
        "id": "L0-lineup-ceiling-money",
        "title": "Weekly-high + RS dollars left on the table by lineup decisions",
        "kind": "measurement",
        "metric": "E[$] (weekly-high + regular-season), era-correct per season",
        "per_season": per_season,
        "summary": "mean $/team the optimal-in-hindsight lineup would have added: "
                   + ", ".join(f"{p['season']} +${p['mean_dollars_left_on_table']}" for p in per_season),
        "verdict": "measurement — quantifies the lineup-decision prize the in-season "
                   "experiments (13/14) will chase; not a shipped edge.",
    }


def _season_players(season: dict, roster_id: int) -> list[str]:
    """Union of a roster's players across the season (roster churns weekly)."""
    ids = set()
    for entries in (season.get("weeks") or {}).values():
        for e in entries or []:
            if int(e["roster_id"]) == roster_id:
                ids.update(str(p) for p in (e.get("players") or []))
    return sorted(ids)


# --- registry -----------------------------------------------------------------
# runnable=True experiments execute here. Everything else is registered in
# LAB-REGISTRY.md and runs once its harness bridge lands (draft replay -> money).
EXPERIMENTS = [
    {"id": "L0-lineup-ceiling-money", "runnable": True, "fn": exp_lineup_ceiling_money},
]

# Registry cross-reference: gated draft-side experiments awaiting the
# draft-replay -> money bridge (the last harness piece). Listed so the report is
# honest about what is NOT yet running.
PENDING = [
    ("1", "Strategy tournament (money-graded, per-slot)"),
    ("2", "Auto-adjuster policy tournament"),
    ("19", "Archetype tournament (Cory-conditional + league-general)"),
]


# External truth anchors (Cory, from the master sheet) — the certification order:
# the grader must reproduce these before any experiment consumes it.
CERT_ANCHORS = [("2023", "434915673219526656", 400), ("2025", "458507445241638912", 1325)]


def certify_grader(history, payouts) -> None:
    """Reproduce-history certification, in-process. Raises if the grader does not
    match the external anchors or conserve each era's pot — so run_all cannot
    grade a single experiment on an un-certified grader (Cory's gate)."""
    def owner_total(season, uid):
        s = MG.season_of(history, season)
        g = MG.grade_actual(history, payouts, season)
        total = 0
        for rid, v in g["per_roster"].items():
            r = next((r for r in s.get("final_rosters", []) if r.get("roster_id") == rid), None)
            if r and str(r.get("owner_id")) == uid:
                total += v["total"]
        return total, g["distributed"], g["pay"]["total_pot"]
    for season, uid, want in CERT_ANCHORS:
        got, distributed, pot = owner_total(season, uid)
        if round(got, 2) != want:
            raise AssertionError(f"CERTIFICATION FAILED: {season} owner {uid} = ${got}, known ${want}")
        if round(distributed, 2) != pot:
            raise AssertionError(f"CERTIFICATION FAILED: {season} distributed ${distributed} != pot ${pot}")


def run_all(out_dir: Path) -> dict:
    history = MG.load_history()
    payouts = MG.load_payouts()
    # GATE: no experiment runs until the grader reproduces history to the dollar.
    certify_grader(history, payouts)
    results = []
    for spec in EXPERIMENTS:
        if not spec.get("runnable"):
            continue
        results.append(spec["fn"](history, payouts))

    report = {
        "git_head": _git_head(),
        "seasons": COMPLETED_SEASONS,
        "grading_currency": "E[$] under payouts.json.by_season (era-correct)",
        "results": results,
        "pending_gated_experiments": [{"registry": n, "title": t} for n, t in PENDING],
    }
    (out_dir / "lab-results.json").write_text(json.dumps(report, indent=2))
    _write_report_md(out_dir / "LAB-REPORT.md", report)
    return report


def _write_report_md(path: Path, report: dict) -> None:
    L = ["# THE LAB — report", "",
         f"_git HEAD `{report['git_head']}` · seasons {', '.join(report['seasons'])} · "
         f"currency: {report['grading_currency']}_", ""]
    L.append("## Experiments run")
    L.append("")
    L.append("| id | kind | headline |")
    L.append("|---|---|---|")
    for r in report["results"]:
        L.append(f"| {r['id']} | {r['kind']} | {r['summary']} |")
    L.append("")
    for r in report["results"]:
        if r.get("per_season"):
            L.append(f"### {r['id']} — {r['title']}")
            L.append("")
            L.append("| season | mean $/team | best seat |")
            L.append("|---|---|---|")
            for p in r["per_season"]:
                L.append(f"| {p['season']} | +${p['mean_dollars_left_on_table']} | +${p['max_seat']} |")
            L.append("")
            L.append(f"_{r['verdict']}_")
            L.append("")
    L.append("## Registered, awaiting the draft-replay → money bridge")
    L.append("")
    for p in report["pending_gated_experiments"]:
        L.append(f"- **#{p['registry']}** {p['title']} — harness-ready; gated by "
                 "`lab_stats.ship_rule` once the replay produces per-season rosters to money-grade.")
    L.append("")
    path.write_text("\n".join(L))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE))
    args = ap.parse_args()
    report = run_all(Path(args.out))
    for r in report["results"]:
        print(f"[{r['kind']}] {r['id']}: {r['summary']}")
    print(f"\nwrote lab-results.json + LAB-REPORT.md to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
