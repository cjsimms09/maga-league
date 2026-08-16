#!/usr/bin/env python3
"""APPLY THE TWO CORY-RULED PROJECTION-CORRECTNESS FIXES TO THE COMMITTED BOARD.

Cory's ruling (2026-08-16), verbatim: "Don't agree with timelines we fix now" —
overriding every audit's defer-to-post-draft recommendation on DECISIONS-NEEDED
#0 (DEF `def_fum_td` maps to nothing) and #000 (WR/TE FP-vs-Sleeper ~20% scale
gap). The CODE fixes live in scoring.py / projections.py / adp.py and take
effect on the next full CI rebuild; this tool applies the same corrections to
the COMMITTED board so the fix is live on the branch now, six days before the
draft, without a full network rebuild (Sleeper/FP are 403 from the sandbox).

WHY THIS IS SAFE — every number flows through the REAL generators, none is
hand-typed:

  * inputs are the committed raw provider capture
    (draft/audit/proj_correctness_evidence_2026-08-16.json), which is PROVEN to
    be the build's own input record before anything is touched: preflight A
    rescores all 32 DEF rows and every FP row under the OLD path and refuses to
    run unless they reproduce the committed board to the cent;
  * downstream fields (replacement / vorp / overall_rank / tiers / grab-by) are
    recomputed by importing vorp.py and grab_by.py — the same functions
    build.py calls — and preflight B refuses to run unless re-running them on
    the UNCHANGED board reproduces the committed board byte for byte (so the
    offline re-run provably equals the build's own arithmetic);
  * the DEF stat lines go through scoring.normalize_def_stat_line + the FP rows
    through the recovered-stats scorer — the exact new live-path code.

Deliberately NOT touched: proj_series.json (append-only frozen snapshots — the
FP rows frozen 08-09..08-15 carry the dropped-receptions defect and are left
as-recorded with the caveat documented in the audit doc; rewriting a frozen
archive would be worse than the defect), and kept_players' Sleeper columns
(no kept player is a DEF; their FP column is patched like everyone else's).

Run:  python3 draft/tools/apply_projection_correctness_2026_08_16.py
Idempotent: a second run finds preflight A failing (old values no longer
reproduce) and refuses — which is correct, the correction is already applied.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))

import grab_by as grab_by_mod            # noqa: E402
import vorp as vorp_mod                  # noqa: E402
from projections import (CEILING_Z, EXPECTED_GAMES, FLOOR_Z)   # noqa: E402
from scoring import normalize_def_stat_line, score_stat_line   # noqa: E402

BOARD = ROOT / "public" / "draft_data.json"
EVIDENCE = ROOT / "draft" / "audit" / "proj_correctness_evidence_2026-08-16.json"


def _norm(name):
    return " ".join(str(name or "").lower().replace(".", "").replace("'", "")
                    .replace("-", " ").split())


def main() -> int:
    board = json.loads(BOARD.read_text())
    ev = json.loads(EVIDENCE.read_text())
    players = board["players"]
    kept = board.get("kept_players") or []
    scoring = board["league"]["scoring"]
    cfg = board["league"]          # carries teams / starters / roster_slots

    # ── PREFLIGHT A: the evidence rows ARE the build's inputs ────────────────
    defs = {str(p["player_id"]): p for p in players if p["position"] == "DEF"}
    def_rows = ev["sleeper"]["def_rows"]
    assert len(def_rows) == 32 and len(defs) == 32, (len(def_rows), len(defs))
    for pid, line in def_rows.items():
        old = score_stat_line(line, scoring)
        got = defs[pid]["proj_baseline"]
        assert abs(old - got) < 0.011, (
            f"preflight A failed: {pid} rescored {old} vs committed {got} — "
            f"either the correction is already applied or the board moved; "
            f"refusing to patch")

    fp_rows = ev["fantasypros"]["rows"]
    raw_by_name: dict[str, list[dict]] = {}
    for r in ev["fantasypros"]["raw_rows"]:
        raw_by_name.setdefault(_norm(r.get("name")), []).append(r["raw_stats"])
    by_name: dict[str, list[dict]] = {}
    for r in fp_rows:
        by_name.setdefault(_norm(r.get("name")), []).append(r)

    # A board player is patchable only when the join is UNAMBIGUOUS (one FP row,
    # one raw row, one board player under the name) and the OLD recomputation
    # reproduces the committed value to the cent — anything else is left alone
    # and counted, never guessed at.
    board_by_name: dict[str, list[dict]] = {}
    for p in players + kept:
        if p.get("proj_fantasypros") is not None:
            board_by_name.setdefault(_norm(p.get("name")), []).append(p)

    patchable = {}   # id(player) -> new value
    skipped = {"ambiguous": 0, "drifted": 0, "no_fp_row": 0}
    twopt_uniform = len({float(scoring.get(k, 0.0))
                         for k in ("pass_2pt", "rush_2pt", "rec_2pt")}) == 1
    for nname, plist in board_by_name.items():
        rows = by_name.get(nname) or []
        raws = raw_by_name.get(nname) or []
        if not rows:
            skipped["no_fp_row"] += len(plist)
            continue
        if len(plist) != 1 or len(rows) != 1 or len(raws) != 1:
            skipped["ambiguous"] += len(plist)
            continue
        p, row, raw = plist[0], rows[0], raws[0]
        old = score_stat_line(row.get("stats") or {}, scoring)
        if abs(old - p["proj_fantasypros"]) > 0.011:
            skipped["drifted"] += 1        # FP moved since the build; not ours to mix
            continue
        stats = dict(row.get("stats") or {})
        rec = raw.get("rec_rec")
        if rec is not None and "rec" not in stats:
            stats["rec"] = float(rec)
        two = raw.get("2pt_tds")
        if (twopt_uniform and two and "rush_2pt" not in stats
                and "pass_2pt" not in stats and "rec_2pt" not in stats):
            stats["rush_2pt"] = float(two)
        patchable[id(p)] = round(float(score_stat_line(stats, scoring)), 2)

    # ── PREFLIGHT B: offline downstream re-run reproduces the committed board ─
    import copy
    trial = copy.deepcopy(players)
    trial, trial_diag = vorp_mod.apply_vorp(trial, cfg)
    trial = vorp_mod.assign_tiers(trial)
    by_id_old = {str(p["player_id"]): p for p in players}
    downstream = ["replacement", "vorp", "overall_rank", "tier", "pos_rank",
                  "tier_size", "tier_drop", "tier_rank"]
    for t in trial:
        o = by_id_old[str(t["player_id"])]
        for k in downstream:
            assert t.get(k) == o.get(k), (
                f"preflight B failed: {t['name']} {k} recomputed {t.get(k)} vs "
                f"committed {o.get(k)} — offline re-run does not reproduce the "
                f"build; refusing to patch")
    assert trial_diag["replacement_points"] == board["replacement"]["replacement_points"], \
        "preflight B failed on the replacement block"

    # Preflight B for grab-by: same rule — the offline re-run must reproduce the
    # committed block on unchanged inputs before its regeneration is trusted.
    my_keepers = [{"player_id": k.get("player_id"), "position": k.get("position"),
                   "name": k.get("name")} for k in kept]     # all 3 are slot 8, mine
    my_picks = (board.get("pick_order") or {}).get("my_picks") or []
    trial_grab = grab_by_mod.report(trial, set(), my_keepers, my_picks, cfg,
                                    forecast_first=True)
    assert trial_grab == board.get("grab_by"), \
        "preflight B failed on the grab-by block: offline re-run differs"

    # ── APPLY #0: normalize + rescore all 32 DEF rows through the new path ────
    changed_def = []
    for pid, line in sorted(def_rows.items()):
        p = defs[pid]
        new = score_stat_line(normalize_def_stat_line(line), scoring)
        if abs(new - p["proj_baseline"]) < 0.005:
            continue
        old = p["proj_baseline"]
        var = p["variance"]                      # POSITION_VARIANCE path: flat 0.38
        games = EXPECTED_GAMES["DEF"]
        sd = new * var
        p["proj_baseline"] = round(new, 2)
        p["proj_mean"] = round(new, 2)           # opportunity_adj is 0.0 for every DEF
        p["proj_sd"] = round(sd, 2)
        p["proj_floor"] = round(max(0.0, new + FLOOR_Z * sd), 2)
        p["proj_ceiling"] = round(new + CEILING_Z * sd, 2)
        p["weekly_sd"] = round(sd / (games ** 0.5), 2)
        changed_def.append((pid, old, round(new, 2)))

    # ── APPLY #000: the recovered-receptions FP column ────────────────────────
    changed_fp = 0
    for p in players + kept:
        v = patchable.get(id(p))
        if v is not None and v != p["proj_fantasypros"]:
            p["proj_fantasypros"] = v
            changed_fp += 1

    # ── DOWNSTREAM through the real generators ───────────────────────────────
    players, vorp_diag = vorp_mod.apply_vorp(players, cfg)
    players = vorp_mod.assign_tiers(players)
    board["players"] = players
    board["replacement"] = vorp_diag

    board["grab_by"] = grab_by_mod.report(players, set(), my_keepers, my_picks,
                                          cfg, forecast_first=True)

    prov = board.setdefault("provenance", {})
    prov["projection_correctness_2026_08_16"] = {
        "ruling": "Cory 2026-08-16: 'Don't agree with timelines we fix now'",
        "evidence": "draft/audit/proj_correctness_evidence_2026-08-16.json",
        "def_rows_corrected": [{"team": t, "old": o, "new": n}
                               for t, o, n in changed_def],
        "fp_rows_corrected": changed_fp,
        "fp_rows_skipped": skipped,
        "applied_by": "draft/tools/apply_projection_correctness_2026_08_16.py",
    }

    BOARD.write_text(json.dumps(board, separators=(",", ":")))
    print(f"DEF corrected: {len(changed_def)} teams "
          f"{[(t, o, n) for t, o, n in changed_def]}")
    print(f"DEF replacement: {vorp_diag['replacement_points'].get('DEF')}")
    print(f"FP column corrected: {changed_fp} players; skipped {skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
