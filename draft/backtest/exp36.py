#!/usr/bin/env python3
"""EXPERIMENT 36 — THE ADP-EFFICIENCY AUDIT (reliability surface by round × position).

Registered because the Anchor Doctrine NAMES it as a dependency and it did not
exist. The doctrine's shrinkage is supposed to bind our deviations toward the
market exactly where the market is measurably right and loosen where it is
measurably wrong — but "where is ADP right" had never been measured. This is that
measurement, and it is the RIGHT instrument for the per-region calibration exp 34
was too thin to provide: exp 34 had 19 of Cory's decisions; this has EVERY pick by
EVERY owner across three drafts — hundreds of players, far more data per cell.

THE QUESTION. Grade consensus ADP as a predictor of realized value, sliced by
(round × position). For each cell: how well did ADP order realized value (rank
correlation), how much value the cell actually returned, and — the output the
doctrine consumes — an EFFICIENCY SCORE that becomes the cell's shrinkage weight.

PRE-REGISTERED POOLING AND FLOOR (declared BEFORE the numbers, per the registry's
honesty clause — 3 seasons × ~15 rounds × 6 positions is far more cells than data,
so most must be reported as thin, not smoothed over):
  * ROUND BANDS: R1-3, R4-7, R8-11, R12+ (same cut as exp 34 so the surfaces align).
  * POSITION GROUPS: QB, RB, WR, TE, K, DEF (the six the registry names).
  * FLOOR: a cell needs n >= 8 gradeable players to be RANKED. Below the floor it is
    reported THIN and contributes NO shrinkage adjustment — it defaults to full
    market anchoring (shrink = 1.0), the conservative direction (we do not deviate
    on a cell we could not measure).

THE EFFICIENCY SCORE → SHRINKAGE (pre-registered mapping, not tuned after):
  * A ranked cell's efficiency = its within-cell Spearman(ADP, realized), clamped
    to [0, 1]. rho near 1 → ADP orders realized value well here → HIGH shrink
    (anchor hard, deviations are expensive). rho near 0 or negative → ADP is not
    predictive here → LOW shrink (deviations are cheap, the market has no edge to
    respect). shrink = 1.0 for thin cells (conservative default above).
  * This is a WEIGHT the doctrine reads, never a hand-set number — the whole point
    of the experiment is that no shrinkage is hand-set anywhere.

FORMAT-MATCH (QB), per the registry: our league scores 6-pt passing TDs; the ADP
sources price a 4-pt-passing-TD world. That systematically UNDERPRICES QBs and
compounds with the late-QB verdict (-$212). So QB cells are graded BOTH ways —
realized under our era-correct 6-pt scoring AND under a 4-pt-passing-TD recompute —
and both are reported, so the mismatch is visible instead of buried.

TIER-MODEL CALIBRATION (bundled, the doctrine's fourth reliability input): per
position, sort by ADP and find where realized value CLIFFS (large adjacent drops)
versus slopes smoothly. A cliff the market prices is a real tier boundary; a smooth
slope the market tiers is a false one. Compact first cut here; deepened later.

PER SOURCE + COMPOSITE (registry's Consensus-Quality upgrade): the audit is built
to run per source (FFC confirmed all 3 seasons · Sleeper board · Underdog iff a
stable public endpoint is confirmed — probed by LOOKING, not assumed) and on the
weighted composite, answering whether the composite beats its best single member.
The pure surface below is source-agnostic; the egress fires whichever sources are
reachable and flags the rest, never inventing a board it does not hold.

DOLLARS, per the standing rule. Per-PLAYER dollars are not a clean quantity (a
pick's dollars depend on the roster it joins, not the player alone — the same
limit the dollar arm states). So this audit LEADS in realized POINTS (the robust
companion the rule allows) and reports the dollar translation only at the coarse
level the grader supports — the value-over-replacement a cell returns — never a
fabricated per-player dollar. The money-graded companion to ADP efficiency is
exp 34's dollar arm and exp 39; 36 is the points-reliability surface those consume.

The PURE core (cell statistics, the surface build, the efficiency→shrink mapping,
the tier-cliff detector) is unit-tested in draft/tests/test_exp36.py WITHOUT egress.
The egress main (FFC ADP + nflverse realized) runs only in CI (lab.yml exp36 job).

Run (CI, egress): python draft/backtest/exp36.py --out draft/backtest
"""
from __future__ import annotations
import json, sys, argparse
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from lab_projections import spearman           # noqa: E402  reused, unit-tested
from exp34_metrics import bootstrap_ci     # noqa: E402  same interval machinery

# ── pre-registered pooling (module constants so the tests pin them) ──
ROUND_BANDS = [("r1-3", 1, 3), ("r4-7", 4, 7), ("r8-11", 8, 11), ("r12+", 12, 99)]
POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"]
CELL_FLOOR = 8            # n below this -> thin -> no shrinkage -> full market anchor
THIN_SHRINK = 1.0         # conservative default for an unmeasurable cell


def round_band(rnd: int | None) -> str | None:
    if rnd is None:
        return None
    for label, lo, hi in ROUND_BANDS:
        if lo <= rnd <= hi:
            return label
    return None


def clamp01(x: float) -> float:
    return 0.0 if x < 0 else (1.0 if x > 1 else x)


# ─────────────────────────────────────────────────── per-cell statistics ──
def cell_stats(players: list[dict]) -> dict:
    """One (round-band × position) cell. `players`: [{adp, realized, ...}].

    Efficiency = within-cell Spearman(-adp, realized): higher when a BETTER (lower)
    ADP goes with HIGHER realized value, i.e. the market ordered this cell well.
    Ranked only at or above the floor; below it, thin -> full anchor, no rank.
    """
    rows = [p for p in players if p.get("realized") is not None and p.get("adp") is not None]
    n = len(rows)
    realized = [r["realized"] for r in rows]
    mean_realized = round(sum(realized) / n, 2) if n else None
    if n < CELL_FLOOR:
        return {"n": n, "thin": True, "ranked": False,
                "efficiency": None, "efficiency_ci": [float("nan"), float("nan")],
                "shrink": THIN_SHRINK, "mean_realized": mean_realized,
                "note": f"n<{CELL_FLOOR}: thin -> no shrinkage, defaults to full market anchor"}
    rho = spearman([-r["adp"] for r in rows], realized)
    # bootstrap the cell's efficiency by resampling its players (pairs kept intact)
    idx = list(range(n))
    def rho_of(sample_idx):
        a = [-rows[i]["adp"] for i in sample_idx]
        b = [rows[i]["realized"] for i in sample_idx]
        return spearman(a, b)
    boots = _bootstrap_stat(idx, rho_of)
    shrink = round(clamp01(rho), 3)
    return {"n": n, "thin": False, "ranked": True,
            "efficiency": round(rho, 3), "efficiency_ci": boots,
            "shrink": shrink, "mean_realized": mean_realized,
            "verdict": ("efficient" if rho >= 0.5 else
                        ("weak" if rho >= 0.2 else "inefficient"))}


def _bootstrap_stat(idx: list[int], stat, iters: int = 4000, seed: int = 36) -> list[float]:
    """Percentile 95% CI of a statistic over resampled INDEX sets (keeps adp/realized
    paired). Deterministic LCG — no numpy in the pure core."""
    n = len(idx)
    if n < 3:
        return [float("nan"), float("nan")]
    state = seed & 0xFFFFFFFF
    def rnd():
        nonlocal state
        state = (1103515245 * state + 12345) & 0x7FFFFFFF
        return state / 0x7FFFFFFF
    vals = []
    for _ in range(iters):
        sample = [idx[int(rnd() * n)] for _ in range(n)]
        v = stat(sample)
        if v == v:                       # skip nan (degenerate resample)
            vals.append(v)
    if not vals:
        return [float("nan"), float("nan")]
    vals.sort()
    return [round(vals[int(0.025 * len(vals))], 3), round(vals[int(0.975 * len(vals))], 3)]


# ─────────────────────────────────────────────────────── the surface ──
def build_surface(picks: list[dict]) -> dict:
    """The reliability surface: a cell per (round-band × position).

    `picks`: [{round, position, adp, realized}] — every drafted player that carries
    a round, a position, an ADP and a realized value, across all seasons/owners.
    Returns {cells: {band: {pos: cell_stats}}, ranked, thin, totals}.
    """
    cells: dict[str, dict[str, dict]] = {}
    ranked = thin = 0
    for label, _lo, _hi in ROUND_BANDS:
        cells[label] = {}
        for pos in POSITIONS:
            members = [p for p in picks if round_band(p.get("round")) == label
                       and p.get("position") == pos]
            st = cell_stats(members)
            cells[label][pos] = st
            if st["ranked"]:
                ranked += 1
            elif st["n"] > 0:
                thin += 1
    return {"cells": cells, "n_cells_ranked": ranked, "n_cells_thin": thin,
            "n_picks": len([p for p in picks if p.get("realized") is not None])}


def position_group_pooling(picks: list[dict]) -> dict:
    """Declared FALLBACK pooling: when the (band × position) cell is thin, pool by
    POSITION across all rounds (still a declared axis, more data per cell). Reported
    alongside the fine grid so a thin fine cell can still inform via its coarse
    parent — but the coarse number never silently overrides a ranked fine cell."""
    out = {}
    for pos in POSITIONS:
        members = [p for p in picks if p.get("position") == pos]
        out[pos] = cell_stats(members)
    return out


# ─────────────────────────────────────────── tier-model calibration ──
def tier_cliffs(picks: list[dict], position: str, top: int = 40) -> dict:
    """Per-position tier-cliff detector: sort the position by ADP, look at the
    realized-value drop between adjacent ADP ranks, and flag the largest gaps as
    candidate tier boundaries. A cliff the market prices (a big realized drop at an
    ADP boundary) is a real tier; a smooth slope is not. Compact first cut."""
    rows = sorted([p for p in picks if p.get("position") == position
                   and p.get("realized") is not None and p.get("adp") is not None],
                  key=lambda p: p["adp"])[:top]
    if len(rows) < 4:
        return {"position": position, "n": len(rows), "thin": True, "cliffs": []}
    realized = [r["realized"] for r in rows]
    gaps = [(realized[i] - realized[i + 1], i) for i in range(len(realized) - 1)]
    mean_gap = sum(g for g, _ in gaps) / len(gaps)
    sd = (sum((g - mean_gap) ** 2 for g, _ in gaps) / len(gaps)) ** 0.5
    cliffs = [{"after_adp_rank": i + 1, "drop": round(g, 2),
               "z": round((g - mean_gap) / sd, 2) if sd else 0.0}
              for g, i in sorted(gaps, reverse=True)[:5] if sd and (g - mean_gap) / sd >= 1.0]
    return {"position": position, "n": len(rows), "thin": False,
            "mean_adjacent_drop": round(mean_gap, 2), "drop_sd": round(sd, 2),
            "cliffs": cliffs}


# ─────────────────────────────────────────────────────── egress main ──
def _egress_main(out_dir: Path) -> int:
    sys.path.insert(0, str(HERE.parent))          # draft/ on path
    sys.path.insert(0, str(HERE.parent.parent))   # repo root
    import adp as ADP
    import sleeper_import as SL
    from backtest import grade as GR
    import nfl_data_py as nfl
    import pandas as pd

    history = json.loads((HERE.parent / "data" / "league_history.json").read_text())
    seasons = [s for s in history["seasons"] if _real_draft(s)]
    print("exp36 seasons:", sorted({int(s["season"]) for s in seasons}))

    players_raw = SL.fetch_players()
    index = ADP.build_index(players_raw)
    positions = {str(pid): p.get("position") for pid, p in players_raw.items()}
    players_meta = [{"player_id": str(pid), "name": p.get("full_name"),
                     "position": p.get("position"), "team": p.get("team"),
                     "gsis_id": p.get("gsis_id")}
                    for pid, p in players_raw.items() if p.get("position")]
    try:
        ids_df = nfl.import_ids()
    except Exception as e:
        print("  ! import_ids unavailable:", e); ids_df = None
    crosswalk = GR.crosswalk_gsis_to_sleeper(players_meta, ids_df)

    years = sorted({int(s["season"]) for s in seasons})
    caveats, sources_reached = [], ["ffc"]
    frames, missing = [], []
    for y in years:
        try:
            df = nfl.import_weekly_data([y]); frames.append(df); print(f"  weekly {y}: {len(df)} rows")
        except Exception as e:
            missing.append(y); print(f"  weekly {y} UNAVAILABLE ({type(e).__name__})")
    weekly = pd.concat(frames, ignore_index=True) if frames else None
    # pbp fallback for a 404 season (cli.py's recovery), cross-validated first.
    if missing and weekly is not None:
        have = sorted(set(years) - set(missing)); control = have[-1] if have else None
        try:
            pbp = nfl.import_pbp_data(sorted(set(missing) | ({control} if control else set())), downcast=True)
        except Exception as e:
            pbp = None; caveats.append(f"pbp unavailable for {missing} ({type(e).__name__})")
        if pbp is not None and control:
            scfg = next((s.get("scoring_settings") for s in seasons if int(s["season"]) == control), {}) or {}
            xval = GR.cross_validate(pbp, weekly, control, scfg, crosswalk)
            if xval.get("agrees"):
                rebuilt = GR.weekly_from_pbp(pbp, missing)
                if rebuilt:
                    weekly = pd.concat([weekly, pd.DataFrame(rebuilt)], ignore_index=True)
                    caveats.append(f"{missing} weekly REBUILT from pbp, cross-validated on {control}")
                    missing = []
            else:
                caveats.append(f"{missing} NOT recovered: pbp disagreed with the library on {control}")
    have_years = (set(int(y) for y in weekly["season"].unique())
                  if weekly is not None and "season" in weekly.columns else set())

    all_picks: list[dict] = []       # every drafted player, all owners, all seasons
    qb_format: list[dict] = []       # QB rows carrying both scoring variants
    for s in seasons:
        yr = int(s["season"])
        if yr not in have_years:
            caveats.append(f"{yr}: realized weekly unavailable; season SKIPPED"); continue
        scoring_cfg = s.get("scoring_settings") or {}
        teams = ((s.get("settings") or {}).get("teams")) or 10
        realized = GR.rest_of_season_points(weekly, yr, scoring_cfg, crosswalk, from_week=1)
        # a 4-pt-passing-TD variant of the SAME season, for the QB format-match check
        realized_4pt = GR.rest_of_season_points(weekly, yr, {**scoring_cfg, "pass_td": 4.0},
                                                 crosswalk, from_week=1)
        try:
            payload = ADP.fetch_adp("half-ppr", teams, yr)
        except Exception as e:
            caveats.append(f"{yr}: FFC ADP unavailable ({type(e).__name__}); season SKIPPED"); continue
        adp_rank = {}
        for entry in payload.get("players") or []:
            sid, _how = ADP.match_player(entry, index)
            if sid and entry.get("adp") is not None:
                adp_rank[str(sid)] = float(entry["adp"])
        for p in _real_draft(s):
            pid = str(p.get("player_id"))
            if pid not in adp_rank or pid not in realized:
                continue
            pos = positions.get(pid)
            if not pos:
                continue
            owners = s.get("owners") or {}
            rid = p.get("roster_id")
            row = {"season": yr, "player_id": pid, "round": p.get("round"),
                   "position": pos, "adp": adp_rank[pid], "realized": realized[pid],
                   # exp43 (full-board pick audit) fields — additive, ignored by the
                   # cell-grading below which reads only adp/realized/round/position:
                   "pick_no": p.get("pick_no"), "roster_id": rid,
                   "owner": (owners.get(str(rid)) or {}).get("display_name") if rid is not None else None,
                   "is_keeper": bool(p.get("is_keeper"))}
            all_picks.append(row)
            if pos == "QB":
                qb_format.append({**row, "realized_6pt": realized[pid],
                                  "realized_4pt": realized_4pt.get(pid)})
        print(f"  {yr}: {sum(1 for p in all_picks if p['season']==yr)} gradeable board picks")

    surface = build_surface(all_picks)
    by_position = position_group_pooling(all_picks)
    tiers = {pos: tier_cliffs(all_picks, pos) for pos in POSITIONS}
    qb_fmt = _qb_format_summary(qb_format)

    result = {
        "experiment": "36 — ADP-efficiency audit (reliability surface by round × position)",
        "sources_reached": sources_reached,
        "n_board_picks": surface["n_picks"],
        "pre_registered": {"round_bands": [b[0] for b in ROUND_BANDS], "positions": POSITIONS,
                           "cell_floor": CELL_FLOOR, "thin_shrink": THIN_SHRINK,
                           "efficiency": "within-cell Spearman(-adp, realized), clamped [0,1] = shrink"},
        "surface": surface,
        "by_position_pooled": by_position,
        "tier_cliffs": tiers,
        "qb_format_match": qb_fmt,
        "caveats": caveats,
        "note": ("Points-reliability surface (per-player dollars are not a clean quantity; "
                 "the money-graded companion is exp 34's dollar arm + exp 39). Efficiency = "
                 "within-cell Spearman; thin cells (n<floor) contribute no shrinkage and "
                 "default to full market anchoring. Multi-source + composite pending a second "
                 "reachable board (FFC confirmed; Sleeper/Underdog probed, not assumed)."),
    }
    (out_dir / "exp36.json").write_text(json.dumps(result, indent=2, default=str) + "\n")
    (out_dir / "EXP36.md").write_text(_report(result))
    # Sidecar for exp43 (full-board pick audit): the richer per-pick rows, plus
    # Cory's stable owner identity and the seat->name map. Non-keeper decisions only.
    decisions = [p for p in all_picks if not p.get("is_keeper")]
    name_by_seat = {}
    for s in seasons:
        for rid, own in (s.get("owners") or {}).items():
            name_by_seat.setdefault(str(rid), (own or {}).get("display_name"))
    (out_dir / "exp36_picks.json").write_text(json.dumps(
        {"picks": decisions, "cory_seat": "coryjsimms",
         "cory_note": "grouped by owner display_name (stable across seasons); Cory = coryjsimms (seat 1)",
         "name_by_seat": name_by_seat}, indent=2, default=str) + "\n")
    print("\n" + _report(result))
    return 0


def _qb_format_summary(qb_rows: list[dict]) -> dict:
    """How much the 6-pt vs 4-pt passing-TD mismatch moves the QB efficiency read."""
    rows = [r for r in qb_rows if r.get("realized_4pt") is not None and r.get("adp") is not None]
    if len(rows) < 4:
        return {"n": len(rows), "thin": True}
    rho6 = spearman([-r["adp"] for r in rows], [r["realized_6pt"] for r in rows])
    rho4 = spearman([-r["adp"] for r in rows], [r["realized_4pt"] for r in rows])
    return {"n": len(rows),
            "efficiency_6pt_our_league": round(rho6, 3),
            "efficiency_4pt_adp_source": round(rho4, 3),
            "delta": round(rho6 - rho4, 3),
            "note": ("6-pt is our era-correct scoring; 4-pt is the ADP source's world. A gap "
                     "means the market's QB order is being judged against a different currency "
                     "than it was set in — the underpricing the late-QB verdict compounds.")}


def _real_draft(season: dict) -> list[dict]:
    for d in season.get("drafts") or []:
        picks = d.get("picks") or []
        if picks:
            return sorted(picks, key=lambda p: p.get("pick_no") or 0)
    return []


def _report(r: dict) -> str:
    L = ["# EXPERIMENT 36 — ADP-efficiency audit (reliability surface)", "",
         f"_{r['n_board_picks']} gradeable board picks (every owner, all seasons) — far more",
         "data per cell than exp 34's 19 decisions. Efficiency = within-cell",
         "Spearman(-adp, realized), clamped [0,1] = the shrinkage weight the Anchor",
         f"Doctrine reads. Floor n>={CELL_FLOOR} to rank; thin cells default to full market",
         "anchor (shrink 1.0), the conservative direction. Sources reached: "
         f"{', '.join(r['sources_reached'])}._", "",
         f"Cells ranked: {r['surface']['n_cells_ranked']} · thin (n>0, <floor): "
         f"{r['surface']['n_cells_thin']}", "",
         "## THE SURFACE — efficiency (shrink) by round-band × position", "",
         "_cell = efficiency [shrink] (n); `·` = no players; `thin` = below floor -> shrink 1.0_", ""]
    header = "| round | " + " | ".join(POSITIONS) + " |"
    L += [header, "|" + "---|" * (len(POSITIONS) + 1)]
    for label, _lo, _hi in ROUND_BANDS:
        cells = r["surface"]["cells"][label]
        row = [label]
        for pos in POSITIONS:
            c = cells[pos]
            if c["n"] == 0:
                row.append("·")
            elif not c["ranked"]:
                row.append(f"thin (n={c['n']})")
            else:
                row.append(f"{c['efficiency']} [{c['shrink']}] (n={c['n']})")
        L.append("| " + " | ".join(row) + " |")
    L += ["", "## Pooled by position (fallback axis, all rounds)", ""]
    for pos in POSITIONS:
        c = r["by_position_pooled"][pos]
        if c["ranked"]:
            L.append(f"- **{pos}**: efficiency {c['efficiency']} CI {c['efficiency_ci']} "
                     f"[shrink {c['shrink']}] (n={c['n']}, mean realized {c['mean_realized']}) — {c.get('verdict')}")
        else:
            L.append(f"- **{pos}**: thin (n={c['n']}) -> full market anchor")
    qf = r["qb_format_match"]
    L += ["", "## QB FORMAT-MATCH (6-pt our league vs 4-pt ADP source)", ""]
    if qf.get("thin"):
        L.append(f"- thin (n={qf.get('n')}) — QB board too small to read the format gap")
    else:
        L += [f"- efficiency under 6-pt (our league): {qf['efficiency_6pt_our_league']}",
              f"- efficiency under 4-pt (ADP source): {qf['efficiency_4pt_adp_source']}",
              f"- **delta {qf['delta']}** — {qf['note']}"]
    L += ["", "## Tier-model calibration (per-position realized cliffs by ADP order)", ""]
    for pos in POSITIONS:
        t = r["tier_cliffs"][pos]
        if t.get("thin"):
            L.append(f"- {pos}: thin (n={t['n']})")
        else:
            cl = ", ".join(f"after ADP-rank {c['after_adp_rank']} (drop {c['drop']}, z {c['z']})"
                           for c in t["cliffs"]) or "no cliff clears z>=1 (smooth slope)"
            L.append(f"- {pos}: mean adjacent drop {t['mean_adjacent_drop']} (sd {t['drop_sd']}) — cliffs: {cl}")
    if r.get("caveats"):
        L += ["", "## Caveats", ""] + [f"- {c}" for c in r["caveats"]]
    L += ["", "## What this feeds", "",
          "Each ranked cell's shrink weight is the Anchor Doctrine's per-region calibration: "
          "hard anchor where ADP is measurably efficient, loosened where it is measurably wrong, "
          "and full anchor (never a blind deviation) where the cell was too thin to measure. "
          "The multi-source + composite extension and the money-graded companion (exp 34 dollar "
          "arm + exp 39) attach here; this is the points-reliability spine they build on.", ""]
    return "\n".join(L)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE))
    args = ap.parse_args()
    raise SystemExit(_egress_main(Path(args.out)))
