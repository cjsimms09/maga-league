# TERRITORY: A
"""EXP-KEEPER-OPTION — what a late pick's keeper option was actually worth in
THIS league, measured from the league's own 450 real picks and real keeper
designations, 2023-2025, under our scoring.

PREREGISTRATION (written before any number below was computed; the runner
prints whatever comes back, including nulls):

  Q1 (RETURN): under top_picks_flat (keeping k players forfeits rounds 1..k
      FLAT), did the league's actual keepers out-produce the pick they cost?
      Metric: keeper's realized season points (weekly store, our scoring,
      weeks 1-17) minus the MEDIAN realized points of same-season NON-keeper
      picks in the round the keeper occupied (his flat cost round). Reported
      per season and pooled, with the distribution, not just the mean.
  Q2 (SIGNALS): which draft-time facts about a season-Y pick predicted "kept
      in season Y+1"? Population: every Y-draft pick, transitions 2023-2024
      and 2024-2025. Signals declared in advance: draft round bucket (1-3 /
      4-6 / 7-9 / 10-12 / 13-15), position, years_exp at Y (derived as the
      2026 board's years_exp minus (2026-Y); coverage reported, missing rows
      excluded and counted). Metric: P(kept next year | bucket), n per cell.
  Q3 (OPTION VALUE): per round bucket, option value = P(kept next year)
      x E[return over forfeit | kept] (Q1's metric restricted to keepers
      that came from that bucket). This is the number a draft-time tiebreak
      would lean on, and it is compared against the shipped KOV ramp
      (composite.js: zero through round 6, full weight by round 12) —
      agreement or disagreement is the finding.

HONEST LIMITS, declared up front: K/DEF are absent from the weekly stores
(realized points unmeasurable offline) — no K/DEF was ever kept, so Q1 is
unaffected; they are excluded from Q2's population with a count. years_exp
is only derivable for players still on the 2026 board — survivor-biased
coverage, reported per cell, verdict withheld if coverage < 60%. Two
transitions and ~40 keep events is a small sample; cells under n=10 are
reported but not trusted, and the writeup must say so.

Run: python3 draft/backtest/exp_keeper_option.py
Writes: draft/backtest/exp_keeper_option.json (research artifact; no
production reader).
"""
from __future__ import annotations

import json
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HIST = ROOT / "draft" / "data" / "league_history.json"
BOARD = ROOT / "public" / "draft_data.json"
POSFILE = ROOT / "draft" / "data" / "player_positions.json"
OUT = ROOT / "draft" / "backtest" / "exp_keeper_option.json"

SEASONS = ("2023", "2024", "2025")
WEEK_CAP = 17  # regular season under our playoff config; store rows past 17 ignored


def load_store(season: str) -> dict[str, float]:
    """player_id -> realized season points, weeks 1..WEEK_CAP, our scoring."""
    path = ROOT / "draft" / "backtest" / f"nflverse_weekly_points_{season}.json"
    store = json.loads(path.read_text())
    totals: dict[str, float] = {}
    weeks_seen = []
    for row in store["weeks"]:
        wk = int(row["week"])
        if wk < 1 or wk > WEEK_CAP:
            continue
        weeks_seen.append(wk)
        for pid, pts in row["points"].items():
            totals[pid] = totals.get(pid, 0.0) + float(pts)
    if len(set(weeks_seen)) < 15:
        raise SystemExit(f"store {season} covers only weeks {sorted(set(weeks_seen))} — refusing")
    return totals


def season_draft(hist: dict, season: str):
    """One normalized pick list per season.

    2023 STRUCTURAL FACT, verified before this was written: the season carries
    TWO drafts — a 30-pick keeper draft (rounds 1-3, all is_keeper) and a
    150-pick main draft whose rounds 1-3 are THE SAME 30 PLAYERS with
    is_keeper=false (29/30 id overlap; every team kept 3). Concatenating both
    double-counts every 2023 keeper and poisons the round-1..3 "non-keeper"
    benchmark with keepers. So: use the MAIN draft only, and derive the keeper
    flag on its rounds 1-3 from membership in the keeper draft's id set.
    2024/2025 have one draft each with honest is_keeper flags (23 and 20,
    all in rounds 1-3, alongside 7 and 10 genuine live picks there)."""
    s = next(x for x in hist["seasons"] if x["season"] == season)
    drafts = s.get("drafts") or []
    if len(drafts) == 1:
        return list(drafts[0].get("picks") or [])
    main = max(drafts, key=lambda d: len(d.get("picks") or []))
    keeper_round = {}
    for d in drafts:
        if d is main:
            continue
        for p in d.get("picks") or []:
            keeper_round[str(p["player_id"])] = int(p["round"])
    out = []
    for p in main.get("picks") or []:
        q = dict(p)
        pid = str(q["player_id"])
        if pid in keeper_round:
            # Flag by MEMBERSHIP, not by round: one 2023 keeper (7528, keeper
            # draft round 3) sits at main-draft round 4 pick 32. His COST under
            # the flat model is the keeper draft's round, so that round wins.
            q["is_keeper"] = True
            q["round"] = keeper_round[pid]
        out.append(q)
    return out


def main() -> dict:
    hist = json.loads(HIST.read_text())
    board = json.loads(BOARD.read_text())
    # player_positions.json overlaid with the board's players AND kept_players:
    # the three current keepers (7564/3198/8151) are missing from the file
    # (mechanism unresolved offline — see the audit's data-defect section)
    # yet are round-1..3 picks in every historical draft here. Same fix as
    # exp_bench_mix.py.
    positions = dict(json.loads(POSFILE.read_text())["positions"])
    for key in ("players", "kept_players"):
        for p in board.get(key) or []:
            positions.setdefault(str(p["player_id"]), p.get("position"))
    yexp_2026 = {str(p["player_id"]): p.get("years_exp")
                 for p in (board["players"] + (board.get("kept_players") or []))}

    stores = {yr: load_store(yr) for yr in SEASONS}
    picks_by_season = {yr: season_draft(hist, yr) for yr in SEASONS}

    # ---- Q1: keeper return over the forfeited round --------------------------
    q1_rows = []
    for yr in SEASONS:
        pts = stores[yr]
        picks = picks_by_season[yr]
        keepers = [p for p in picks if p.get("is_keeper")]
        nonkeep_by_round: dict[int, list[float]] = {}
        for p in picks:
            if p.get("is_keeper"):
                continue
            pid = str(p["player_id"])
            if positions.get(pid) in ("K", "DEF"):
                continue
            if pid in pts:
                nonkeep_by_round.setdefault(int(p["round"]), []).append(pts[pid])
        for k in keepers:
            pid = str(k["player_id"])
            rnd = int(k["round"])
            # Benchmark: same-round live picks; if a round has NO live picks
            # (2023, where every round-1..3 slot was a keeper), walk DOWN to
            # the first round that has any, and say so — a later-round
            # benchmark UNDERSTATES the forfeited pick's value, so returns
            # computed against it are upper bounds, flagged per row.
            bench_round = rnd
            bench = nonkeep_by_round.get(bench_round) or []
            while not bench and bench_round < 15:
                bench_round += 1
                bench = nonkeep_by_round.get(bench_round) or []
            realized = pts.get(pid)
            q1_rows.append({
                "season": yr, "player_id": pid, "pos": positions.get(pid),
                "cost_round": rnd, "benchmark_round": bench_round if bench else None,
                "benchmark_degraded": bool(bench) and bench_round != rnd,
                "realized": None if realized is None else round(realized, 1),
                "round_median": round(statistics.median(bench), 1) if bench else None,
                "return_over_forfeit": (
                    None if realized is None or not bench
                    else round(realized - statistics.median(bench), 1)),
            })
    q1_valid = [r for r in q1_rows if r["return_over_forfeit"] is not None]
    rets = sorted(r["return_over_forfeit"] for r in q1_valid)
    q1_summary = {
        "n_keeper_seasons": len(q1_rows),
        "n_measurable": len(q1_valid),
        "n_degraded_benchmark": sum(1 for r in q1_valid if r.get("benchmark_degraded")),
        "mean_return_over_forfeit": round(statistics.mean(rets), 1) if rets else None,
        "median_return_over_forfeit": round(statistics.median(rets), 1) if rets else None,
        "pct_positive": round(100 * sum(1 for r in rets if r > 0) / len(rets), 1) if rets else None,
        "p10": rets[int(0.10 * len(rets))] if rets else None,
        "p90": rets[int(0.90 * len(rets))] if rets else None,
        "by_cost_round": {},
    }
    for rnd in (1, 2, 3):
        sub = [r["return_over_forfeit"] for r in q1_valid if r["cost_round"] == rnd]
        if sub:
            q1_summary["by_cost_round"][str(rnd)] = {
                "n": len(sub), "mean": round(statistics.mean(sub), 1),
                "median": round(statistics.median(sub), 1),
                "pct_positive": round(100 * sum(1 for x in sub if x > 0) / len(sub), 1),
            }

    # ---- Q2: what predicted "kept next year" ---------------------------------
    transitions = [("2023", "2024"), ("2024", "2025")]
    def bucket(rnd: int) -> str:
        if rnd <= 3:
            return "1-3 (kept)"
        if rnd <= 6:
            return "4-6"
        if rnd <= 9:
            return "7-9"
        if rnd <= 12:
            return "10-12"
        return "13-15"

    by_bucket: dict[str, list[int]] = {}
    by_pos: dict[str, list[int]] = {}
    by_yexp: dict[str, list[int]] = {}
    kdef_excluded = 0
    yexp_missing = 0
    pick_rows = []
    for y0, y1 in transitions:
        kept_next = {str(p["player_id"]) for p in picks_by_season[y1] if p.get("is_keeper")}
        for p in picks_by_season[y0]:
            pid = str(p["player_id"])
            pos = positions.get(pid)
            if pos in ("K", "DEF"):
                kdef_excluded += 1
                continue
            kept = 1 if pid in kept_next else 0
            b = bucket(int(p["round"]))
            by_bucket.setdefault(b, []).append(kept)
            by_pos.setdefault(pos or "?", []).append(kept)
            ye = yexp_2026.get(pid)
            if ye is None:
                yexp_missing += 1
            else:
                ye_at = int(ye) - (2026 - int(y0))
                yb = "rookie-2yr" if ye_at <= 2 else ("3-5yr" if ye_at <= 5 else "6+yr")
                by_yexp.setdefault(yb, []).append(kept)
            pick_rows.append({"season": y0, "player_id": pid, "pos": pos,
                              "round": int(p["round"]), "kept_next": kept})

    def rate_table(d: dict[str, list[int]]) -> dict:
        return {k: {"n": len(v), "kept": sum(v),
                    "p_kept_pct": round(100 * sum(v) / len(v), 1)}
                for k, v in sorted(d.items())}

    n_pop = sum(len(v) for v in by_bucket.values())
    q2 = {
        "population": n_pop,
        "kdef_excluded": kdef_excluded,
        "by_round_bucket": rate_table(by_bucket),
        "by_position": rate_table(by_pos),
        "by_years_exp_at_draft": rate_table(by_yexp),
        "years_exp_coverage_pct": round(100 * (1 - yexp_missing / max(1, n_pop)), 1),
    }

    # ---- Q3: option value per bucket, vs the shipped KOV ramp ----------------
    # Return-over-forfeit for keepers traced back to the round they were
    # DRAFTED in the prior season (the option's strike bucket).
    q3_cells: dict[str, dict] = {}
    for y0, y1 in transitions:
        prior_round = {str(p["player_id"]): int(p["round"]) for p in picks_by_season[y0]}
        for r in q1_rows:
            if r["season"] != y1 or r["return_over_forfeit"] is None:
                continue
            src = prior_round.get(r["player_id"])
            b = "undrafted (rd10 rule)" if src is None else bucket(src)
            cell = q3_cells.setdefault(b, {"returns": []})
            cell["returns"].append(r["return_over_forfeit"])
    q3 = {}
    for b, votes in by_bucket.items():
        kept_returns = q3_cells.get(b, {}).get("returns", [])
        p_kept = sum(votes) / len(votes) if votes else 0.0
        e_ret = statistics.mean(kept_returns) if kept_returns else None
        q3[b] = {
            "p_kept_next": round(p_kept, 3),
            "n_kept_with_return": len(kept_returns),
            "mean_return_if_kept": round(e_ret, 1) if e_ret is not None else None,
            "option_value_pts": (round(p_kept * e_ret, 1) if e_ret is not None else None),
        }
    for b, cell in q3_cells.items():
        if b not in q3:
            q3[b] = {"p_kept_next": None,
                     "n_kept_with_return": len(cell["returns"]),
                     "mean_return_if_kept": round(statistics.mean(cell["returns"]), 1),
                     "option_value_pts": None}

    out = {
        "_territory": "TERRITORY: A — research artifact, no production reader",
        "experiment": "EXP-KEEPER-OPTION — keeper returns and draft-time keeper signals, 2023-2025 real league history",
        "prereg": "header of draft/backtest/exp_keeper_option.py",
        "scoring": "weekly stores (our table, fingerprint-stamped), weeks 1-17",
        "q1_keeper_return_over_forfeit": {"summary": q1_summary, "rows": q1_rows},
        "q2_kept_next_predictors": q2,
        "q3_option_value_by_source_bucket": q3,
        "shipped_kov_ramp": "composite.js CFG: 0 through round 6, linear to full at round 12",
    }
    OUT.write_text(json.dumps(out, indent=1))
    print(json.dumps({k: v for k, v in out.items() if k != "q1_keeper_return_over_forfeit"}, indent=1))
    print("Q1 summary:", json.dumps(q1_summary, indent=1))
    print("wrote", OUT)
    return out


if __name__ == "__main__":
    main()
