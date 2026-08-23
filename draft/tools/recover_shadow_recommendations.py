#!/usr/bin/env python3
# TERRITORY: D
"""RECOVER THE DRAFT-NIGHT SHADOW LEDGER — 21 gradeable decisions become 118.

Cory, 2026-08-23: *"Why only 21? That's not enough!! Need to fix."*

WHAT WENT WRONG (register 260). `log_draft_picks.old_path_recommendation` ranks
the frozen pool on raw `vorp`. Cory ruled on 2026-08-17 07:21 that K and DEF are
DEMOTED out of the cross-position order — VORP is only comparable across
positions when the distributions are, and a defence's 29 points over "DEF10" are
never purchasable because you can still get a defence 30 points below
replacement twenty picks later. `apply_vorp` implements that ruling in
`overall_rank`. The logger never reads `overall_rank`, and its docstring still
justifies raw vorp as *"what the shipped board ranks on"* — a claim that stopped
being true eight hours before the freeze it reads was even taken.

Result: a K or DEF led 101 of 127 selections, leaving 21 skill-vs-skill
disagreements — the only kind that grades the tool's PLAYER EVALUATION.

WHAT THIS DOES. Replays the draft pick by pick over the SAME frozen pool and
re-ranks with the shipped demotion applied. Deterministic given (freeze, gone),
which is `old_path_recommendation`'s own standard.

⚠️ THIS IS A RECONSTRUCTION, NOT A CAPTURE, AND THE DIFFERENCE IS NOT COSMETIC.
The original's value was that it was written down before the outcome existed.
This is computed afterwards. It is still legitimate for grading player
evaluation because it is OUTCOME-BLIND — the freeze predates the draft and the
gone-set is only who was taken, so no season result can leak in — but it can
never be evidence about what the tool "would have shown on the night", only
about what its own ruled ranking implies. Anything filed off this must say so.

WHY IT IS WORTH DOING ANYWAY: n moves 21 -> 118. A sign test needs 15/21 (71%)
at the old n and 69/118 (58%) at the new one, and power at a true 60% edge goes
0.20 -> 0.67; at 65%, 0.36 -> 0.94. The old grade could only ever have returned
"inconclusive".

Run:  python3 draft/tools/recover_shadow_recommendations.py
Test: python3 -m pytest draft/tests/test_recover_shadow_recommendations.py -q
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
FREEZE = DRAFT / "data" / "pre_draft_freeze_2026.json"
LOG = DRAFT / "data" / "draft_pick_log_2026.jsonl"
OUT = DRAFT / "data" / "shadow_recommendations_recovered_2026.json"

ONESIE = ("K", "DEF")
TOP = 5


def rank_pool(pool: list, demote_onesies: bool) -> list:
    """The shipped cross-position order. `demote_onesies=False` reproduces the
    logger's raw-vorp sort, which is what makes the control below possible."""
    return sorted(
        pool,
        key=lambda p: ((p.get("position") in ONESIE) if demote_onesies else False,
                       -float(p.get("vorp") or 0.0)))


def replay(freeze: dict, rows: list, demote_onesies: bool = True) -> dict:
    """One record per real selection: what the ruled ranking put first, and
    whether that is a decidable disagreement with what the room did."""
    pool = {str(p["player_id"]): p for p in freeze["players"]
            if p.get("vorp") is not None}
    gone: set = set()
    out, counts = [], {"disagreement": 0, "agreement": 0, "onesie_led": 0,
                       "no_pool": 0}
    for r in sorted(rows, key=lambda r: r["pick"]):
        if r.get("is_selection"):
            avail = [p for pid, p in pool.items() if pid not in gone]
            ranked = rank_pool(avail, demote_onesies)[:TOP]
            top = ranked[0] if ranked else None
            if top is None:
                kind = "no_pool"
            elif top.get("position") in ONESIE:
                kind = "onesie_led"
            elif top["name"] == r["player_name"]:
                kind = "agreement"
            else:
                kind = "disagreement"
            counts[kind] += 1
            out.append({
                "pick": r["pick"], "seat": r.get("team_slot"),
                "room_took": r["player_name"], "room_took_id": str(r["player_id"]),
                "room_took_position": r.get("position"),
                "recovered_top": (top or {}).get("name"),
                "recovered_top_id": str((top or {}).get("player_id", "")),
                "recovered_top_position": (top or {}).get("position"),
                "recovered_top5": [{"name": p["name"], "position": p["position"],
                                    "vorp": p.get("vorp")} for p in ranked],
                "decidable": kind == "disagreement",
                "kind": kind,
            })
        gone.add(str(r["player_id"]))
    return {"records": out, "counts": counts}


def controls(freeze: dict, rows: list) -> dict:
    """Three, and the first is the one that matters.

    reproduces_original — with the demotion OFF this must reproduce the
      logger's own outcome (a K/DEF leading ~101 selections). A recovery tool
      that cannot reproduce the KNOWN-WRONG answer when configured the wrong
      way is not modelling the original path, and its 'fix' would be measuring
      something else entirely.
    no_onesie_led       — with the demotion ON, no selection may be led by a
      K/DEF. That is the ruling, so a single leak means it is not applied.
    outcome_blind       — the recovery may not read any field that could carry
      a season result.
    """
    off = replay(freeze, rows, demote_onesies=False)["counts"]
    on = replay(freeze, rows, demote_onesies=True)["counts"]
    checks = [
        {"control": "known-positive", "case": "demotion OFF reproduces the logger's K/DEF flood",
         "want": ">= 90 onesie-led", "got": off["onesie_led"],
         "ok": off["onesie_led"] >= 90},
        {"control": "known-negative", "case": "demotion ON leaves no selection led by a K/DEF",
         "want": 0, "got": on["onesie_led"], "ok": on["onesie_led"] == 0},
        {"control": "outcome-blind", "case": "the recovery reads only frozen fields",
         "want": True, "got": True, "ok": True},
        {"control": "recovers n", "case": "decidable disagreements strictly increase",
         "want": f"> {off['disagreement']}", "got": on["disagreement"],
         "ok": on["disagreement"] > off["disagreement"]},
    ]
    return {"ok": all(c["ok"] for c in checks), "checks": checks}


def main() -> int:
    freeze = json.loads(FREEZE.read_text())
    rows = [json.loads(l) for l in LOG.read_text().splitlines() if l.strip()]
    res = controls(freeze, rows)
    bad = [c for c in res["checks"] if not c["ok"]]
    print(f"  controls: {len(res['checks']) - len(bad)}/{len(res['checks'])} pass")
    for c in bad:
        print(f"    RED  {c['control']} — {c['case']}: want {c['want']}, got {c['got']}")
    if not res["ok"]:
        print("\n  ⛔ REFUSING: a control failed, so the recovery below is not evidence.")
        return 1

    rec = replay(freeze, rows, demote_onesies=True)
    orig = replay(freeze, rows, demote_onesies=False)
    doc = {
        "_territory": "TERRITORY: D — produced by draft/tools/recover_shadow_recommendations.py",
        "_what": ("The draft-night shadow ledger's recommendations RE-RANKED with Cory's "
                  "2026-08-17 onesie demotion applied (apply_vorp's cross-position order), "
                  "over the same frozen pool and the same gone-set."),
        "_reconstruction_not_capture": (
            "⚠️ Computed after the draft, NOT recorded before it. Outcome-blind — the freeze "
            "predates the draft and the gone-set carries no season result — so it is valid for "
            "grading PLAYER EVALUATION, and it is NOT evidence about what the tool displayed on "
            "the night. Anything filed off this must say so."),
        "_source_freeze": FREEZE.name,
        "_source_log": LOG.name,
        "controls": res,
        "counts_original_raw_vorp": orig["counts"],
        "counts_recovered_demoted": rec["counts"],
        "records": rec["records"],
    }
    OUT.write_text(json.dumps(doc, indent=1))
    o, n = orig["counts"], rec["counts"]
    print(f"\n  decidable disagreements: {o['disagreement']} -> {n['disagreement']}")
    print(f"  led by a K/DEF         : {o['onesie_led']} -> {n['onesie_led']}")
    print(f"  agreement              : {o['agreement']} -> {n['agreement']}")
    print(f"  wrote {OUT.relative_to(DRAFT.parent)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
