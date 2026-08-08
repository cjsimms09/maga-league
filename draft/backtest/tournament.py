#!/usr/bin/env python3
"""THE GATED BATCH — experiments 1, 2, 19, money-graded (LAB-REGISTRY).

Runs behind the BRIDGE GATE in CI (lab.yml replay-bridge job): every tournament
candidate's roster-aware seat rosters (dump-replay.js) are money-graded against
the real field (money_grade.grade_substituted — weekly-high + RS exact; playoff
$ pending the bracket resim), compared to the Balanced-BPA/default control, and
pushed through the pre-registered gates:

  * NULL — the same best-of-K search over outcome-shuffled data (weekly point
    series permuted among players WITHIN POSITION, breaking the skill link while
    preserving positional score shapes). An edge the null's own best-of-K
    reproduces is noise, reported as such.
  * CV — leave-one-season-out (with the seasons the weekly pull could grade).
  * SHIP RULE — beats null p95 AND positive on every held-out season; anything
    else is documented and parked. Nothing here installs itself.

Phase-S pre-registration honored (the shadows' clear-board finding): the report
quantifies HOW MANY decisions per draft actually separated each candidate from
the control — signal vs seasoning is legible in the same table as the dollars.
"""
from __future__ import annotations
import argparse
import json
import random
from pathlib import Path

import money_grade as MG
import roster_sim as RS
import lab_stats as LS

HERE = Path(__file__).resolve().parent
CONTROL = "arch:balanced"     # the unconstrained composite — experiment 19's control
NULL_DRAWS = 200
SEED = 20260808


# --- grading ------------------------------------------------------------------

def load_inputs(bundles_path, records_path, weekly_path):
    bundles = json.loads(Path(bundles_path).read_text())
    dump = json.loads(Path(records_path).read_text())["seasons"]
    weekly = json.loads(Path(weekly_path).read_text())["weekly_points"]
    pos = {}
    for b in bundles.get("bundles", []):
        pos[str(b["season"])] = {str(p["player_id"]): p.get("position")
                                 for p in (b.get("players") or [])}
    return dump, weekly, pos


def seat_roster(sd, cand, rid):
    ids = [str(k["player_id"]) for k in sd.get("keepers", [])
           if int(k["roster_id"]) == int(rid)]
    for pid in (sd.get("roster_aware", {}).get(cand, {}).get(str(rid), [])):
        if str(pid) not in ids:
            ids.append(str(pid))
    return ids


def grade_seat(history, payouts, season, rid, roster_ids, weekly_pts, pos_by_id):
    scores = {}
    for wk, pts in weekly_pts.items():
        scores[int(wk)] = RS.best_lineup_points(pts, pos_by_id, roster_ids)["points"]
    sub = MG.grade_substituted(history, payouts, season, int(rid), scores)
    return sub["graded_total_partial"]


def run_tournament(dump, weekly, pos, history, payouts, *, rng=None):
    """{candidate: {season: {seat: $}}} for every candidate incl. the control."""
    out = {}
    for season, sd in dump.items():
        wk = weekly.get(season) or {}
        if not wk:
            continue
        seats = sorted({int(r["roster_id"]) for r in sd.get("records", [])})
        cands = sorted((sd.get("roster_aware") or {}).keys())
        for cand in cands:
            for rid in seats:
                ids = seat_roster(sd, cand, rid)
                dollars = grade_seat(history, payouts, season, rid, ids, wk, pos[season])
                out.setdefault(cand, {}).setdefault(season, {})[str(rid)] = dollars
    return out


def edges_vs_control(graded):
    """{candidate: {'per_season': {season: mean_edge}, 'pooled': mean}} vs CONTROL."""
    out = {}
    ctrl = graded.get(CONTROL) or {}
    for cand, per_season in graded.items():
        if cand == CONTROL:
            continue
        season_means, all_edges = {}, []
        for season, seats in per_season.items():
            edges = [seats[r] - ctrl.get(season, {}).get(r, 0.0) for r in seats]
            if edges:
                season_means[season] = round(sum(edges) / len(edges), 2)
                all_edges.extend(edges)
        out[cand] = {"per_season": season_means,
                     "pooled": round(sum(all_edges) / len(all_edges), 2) if all_edges else 0.0}
    return out


def divergence_vs_control(dump):
    """How many DECISIONS per draft actually separated a candidate from the
    control — the signal-vs-seasoning number the Phase-S pre-registration
    demands. Mean per seat, per season."""
    out = {}
    for season, sd in dump.items():
        cands = sorted((sd.get("roster_aware") or {}).keys())
        ctrl = sd.get("roster_aware", {}).get(CONTROL, {})
        for cand in cands:
            if cand == CONTROL:
                continue
            diffs = []
            for rid, ids in sd.get("roster_aware", {}).get(cand, {}).items():
                c = set(ctrl.get(rid, []))
                diffs.append(len(set(ids) - c))
            if diffs:
                out.setdefault(cand, {})[season] = round(sum(diffs) / len(diffs), 1)
    return out


# --- the null: same search, luck-only outcomes --------------------------------

def shuffled_weekly(weekly_season, pos_by_id, rng):
    """Permute each week's points among players WITHIN POSITION: rosters keep
    their construction, outcomes lose their skill link."""
    out = {}
    for wk, pts in weekly_season.items():
        by_pos = {}
        for pid, v in pts.items():
            by_pos.setdefault(pos_by_id.get(pid) or "?", []).append((pid, v))
        wkout = {}
        for _, rows in by_pos.items():
            ids = [r[0] for r in rows]
            vals = [r[1] for r in rows]
            rng.shuffle(vals)
            for pid, v in zip(ids, vals):
                wkout[pid] = v
        out[wk] = wkout
    return out


def null_best_edge(dump, weekly, pos, history, payouts, rng):
    """One null draw: shuffle outcomes, re-grade everyone on the SAME rosters,
    return the best pooled candidate edge — the best-of-K search under luck."""
    shuffled = {s: shuffled_weekly(weekly[s], pos[s], rng)
                for s in weekly if weekly[s] and s in {k for k in dump}}
    graded = run_tournament(dump, shuffled, pos, history, payouts)
    e = edges_vs_control(graded)
    return max((v["pooled"] for v in e.values()), default=0.0)


# --- verdicts -----------------------------------------------------------------

def verdicts(edges, null_dist, seasons):
    p95 = LS.percentile(sorted(null_dist), 0.95)
    out = {}
    enough_seasons = len(seasons) >= 2
    for cand, e in edges.items():
        beats_null = e["pooled"] > p95
        holdout_ok = enough_seasons and all(e["per_season"].get(s, 0.0) > 0 for s in seasons)
        ship = beats_null and holdout_ok
        if ship:
            verdict = "CANDIDATE (clears gates — flag for Phase-H shadows)"
        elif not beats_null:
            verdict = "parked: edge %.2f <= null p95 %.2f" % (e["pooled"], p95)
        elif not enough_seasons:
            verdict = "parked: <2 graded seasons — no held-out check possible"
        else:
            verdict = "parked: not positive on every graded season"
        out[cand] = {
            "pooled_edge": e["pooled"], "per_season": e["per_season"],
            "beats_null_p95": beats_null, "all_seasons_positive": holdout_ok,
            "verdict": verdict,
        }
    return out, p95


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bundles", default=str(HERE / "bundles.json"))
    ap.add_argument("--records", default=str(HERE / "replay-records.json"))
    ap.add_argument("--weekly", default=str(HERE / "weekly_points.json"))
    ap.add_argument("--out", default=str(HERE / "tournament-results.json"))
    ap.add_argument("--report", default=str(HERE / "LAB-TOURNAMENT.md"))
    ap.add_argument("--null-draws", type=int, default=NULL_DRAWS)
    args = ap.parse_args()

    dump, weekly, pos = load_inputs(args.bundles, args.records, args.weekly)
    history, payouts = MG.load_history(), MG.load_payouts()
    graded_seasons = [s for s in dump if weekly.get(s)]

    graded = run_tournament(dump, weekly, pos, history, payouts)
    edges = edges_vs_control(graded)
    diverg = divergence_vs_control(dump)

    rng = random.Random(SEED)
    null_dist = sorted(null_best_edge(dump, weekly, pos, history, payouts, rng)
                       for _ in range(args.null_draws))
    verd, p95 = verdicts(edges, null_dist, graded_seasons)

    def null_pctile(x):
        below = sum(1 for v in null_dist if v < x)
        return round(100.0 * below / len(null_dist), 0) if null_dist else 0

    # Sub-threshold structure: WHERE each candidate diverges from the control —
    # the position mix of its divergent picks, per season, so "did the same
    # close-call types recur" is answerable from the report.
    div_positions = {}
    for season, sd in dump.items():
        posmap = pos.get(season) or {}
        ctrl_ra = (sd.get("roster_aware") or {}).get(CONTROL, {})
        for cand, ra in (sd.get("roster_aware") or {}).items():
            if cand == CONTROL:
                continue
            mix = {}
            for rid, ids in ra.items():
                for pid in set(ids) - set(ctrl_ra.get(rid, [])):
                    pp = posmap.get(str(pid)) or "?"
                    mix[pp] = mix.get(pp, 0) + 1
            div_positions.setdefault(cand, {})[season] = mix

    result = {
        "control": CONTROL, "graded_seasons": graded_seasons,
        "null_distribution_pctiles": {str(q): LS.percentile(null_dist, q / 100.0)
                                      for q in (50, 75, 90, 95, 99)},
        "divergent_pick_positions": div_positions,
        "null_draws": args.null_draws, "null_p95": round(p95, 2), "seed": SEED,
        "verdicts": verd, "divergence_vs_control": diverg,
        "caveats": [
            "weekly-high + RS dollars only; playoff $ pending the bracket resim (lower bound)",
            "seasons graded = those the weekly pull could serve (2025 weekly is 404 upstream)",
            "rough v1 dollar model; quantile-V re-run pre-registered for September",
            "ghost replay vs a fixed room: the room does not react to the counterfactual",
        ],
    }
    Path(args.out).write_text(json.dumps(result, indent=1))

    # --- the report ---
    L = ["# THE LAB — TOURNAMENT (experiments 1, 2, 19)", "",
         f"_control: `{CONTROL}` · seasons {', '.join(graded_seasons)} · "
         f"null p95 **${p95:.2f}** ({args.null_draws} outcome-shuffle draws, seed {SEED})_", "",
         "| candidate | pooled edge $ | per-season | decisions ≠ control /draft | verdict |",
         "|---|---|---|---|---|"]
    ranked = sorted(verd.items(), key=lambda kv: -kv[1]["pooled_edge"])
    for cand, v in ranked:
        ps = " · ".join(f"{s}:{v['per_season'].get(s, 0):+.0f}" for s in graded_seasons)
        dv = " · ".join(f"{s}:{diverg.get(cand, {}).get(s, 0)}" for s in graded_seasons)
        L.append(f"| {cand} | {v['pooled_edge']:+.2f} | {ps} | {dv} | {v['verdict']} |")
    # --- SUB-THRESHOLD STRUCTURE REPORT (descriptive addendum — NOT a verdict change) ---
    L += ["", "## Sub-threshold structure (descriptive — verdicts unchanged)", "",
          "| candidate | pooled $ | null pctile | both seasons + ? | divergent-pick mix | flag |",
          "|---|---|---|---|---|---|"]
    watch = []
    for cand, v in ranked:
        both_pos = (len(graded_seasons) >= 2
                    and all(v["per_season"].get(s2, 0.0) > 0 for s2 in graded_seasons))
        pct = null_pctile(v["pooled_edge"])
        mixes = div_positions.get(cand, {})
        mix_txt = " · ".join(
            f"{s2}:" + ",".join(f"{p2}×{n2}" for p2, n2 in sorted(m.items(), key=lambda x: -x[1])[:3])
            for s2, m in mixes.items() if m) or "—"
        # A repeatable pattern = divergence in BOTH seasons with a shared top position.
        tops = [max(m, key=m.get) for m in mixes.values() if m]
        repeatable = len(tops) >= 2 and len(set(tops)) == 1
        flagged = both_pos and repeatable and not v["verdict"].startswith("CANDIDATE")
        if flagged:
            watch.append(cand)
        L.append(f"| {cand} | {v['pooled_edge']:+.2f} | {pct:.0f}th | "
                 f"{'YES' if both_pos else 'no'} | {mix_txt} | "
                 f"{'**WATCH → Phase-H shadows**' if flagged else ('CANDIDATE' if v['verdict'].startswith('CANDIDATE') else '—')} |")
    L += ["",
          f"**WATCH flags ({len(watch)}):** " + (", ".join(watch) if watch else "none") + " — "
          "a WATCH buys a Phase-H shadow seat, never weights; the live 2026 season is the "
          "legitimate tiebreaker for sub-threshold leans (new data, not re-tortured old data). "
          "**The install rule is untouched: nothing enters the engine below the pre-registered bar.**", "",
          f"**Honesty line:** {len(ranked)} candidates × 2 seasons means ~{len(ranked) // 4} "
          "would show both-season-positive sign by PURE CHANCE (independent coin-flip signs "
          "under the null → 25% each); several candidates also tie the control exactly "
          "(zero divergence), shrinking the effective field. Read the YES column with that base rate.", ""]
    result["watch_flags"] = watch
    L += ["",
          "**Reading the divergence column (pre-registered from the shadows' clear-board "
          "finding):** edges live in the handful of contested decisions per draft — a "
          "candidate whose rosters differ from the control by only 1–3 players is being "
          "graded on seasoning-sized samples, and its dollar edge should be read "
          "accordingly. The null p95 is the floor either way.", "",
          "**Caveats:** " + " · ".join(result["caveats"]), ""]
    Path(args.report).write_text("\n".join(L))

    for cand, v in ranked[:6]:
        print(f"{cand:22s} {v['pooled_edge']:+8.2f}  {v['verdict']}")
    print(f"null p95 ${p95:.2f} · wrote {args.out} + {args.report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
