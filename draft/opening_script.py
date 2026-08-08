#!/usr/bin/env python3
"""OPENING-SCRIPT MACHINERY — the first-picks script, generated, never typed.

The script I read on draft night for my early live picks: for each pick, the
primary target, the fallbacks with survival percentages, and the NAMED
contingency branches per keeper-scenario (keeper-intel-scenarios.md §2/§2b —
the both-TEs-gone branch is PRIMARY while Marian/Bowers + Richard's full slate
stand predicted; Bowers-available demotes to the contingency).

MACHINERY, not prose: everything derives from the inputs (the board artifact,
the predicted keeper slates, my slot), so ANY input rebuild regenerates the
script — that IS the regeneration hook. The output stamps a PROVENANCE
FINGERPRINT (board built_at, slot + its provenance, keeper-slate hashes); the
staleness check compares fingerprints, so a script generated against an old
board or a superseded slate announces itself instead of impersonating fresh
advice. Real-event hooks per spec: slot assignment (Sleeper draft order),
keeper designations landing via keeper-watch, and every artifact rebuild all
change a fingerprint → regenerate (draft-data workflow runs this after build).

Doctrine framing: the tournament's first CI verdicts parked every doctrine
(edges under the null; the clear-board finding) — so the enrolled plan is
Balanced Value (the control) until experiment 19's Cory-conditional race says
otherwise, and the script says so honestly rather than inventing a conviction.

Run: python draft/opening_script.py   → draft/data/opening_script.{md,json}
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
BOARD = HERE.parent / "public" / "draft_data.json"
PREDICTED = HERE / "data" / "predicted_keepers.json"
OUT_MD = HERE / "data" / "opening_script.md"
OUT_JSON = HERE / "data" / "opening_script.json"

import sys
sys.path.insert(0, str(HERE))
from keepers import survival_probability  # noqa: E402

PICKS_TO_SCRIPT = 3          # my first N live picks get full treatment
CANDIDATES_PER_PICK = 5
SURVIVAL_FLOOR = 0.25        # below this a name is a prayer, not a plan


def _hash(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True).encode()).hexdigest()[:12]


def fingerprint(board: dict, predicted: dict) -> dict:
    """What the script was generated FROM. Any change here = regenerate."""
    return {
        "board_built_at": board.get("built_at"),
        "my_slot": (board.get("league") or {}).get("my_draft_slot"),
        "my_keepers_hash": _hash(sorted(str(k.get("player_id"))
                                        for k in board.get("kept_players", []))),
        "predicted_slates_hash": _hash({
            o: sorted(str(k.get("player_id")) for k in v.get("predicted_keepers", []))
            for o, v in (predicted.get("predictions") or {}).items()}),
    }


def is_stale(script_meta: dict, current: dict) -> list[str]:
    """Which fingerprint fields moved since generation. Empty = fresh."""
    old = (script_meta or {}).get("fingerprint") or {}
    return [k for k in current if old.get(k) != current[k]]


def predicted_kept_ids(predicted: dict) -> set[str]:
    out = set()
    for v in (predicted.get("predictions") or {}).values():
        for k in v.get("predicted_keepers", []):
            if k.get("player_id") is not None:
                out.add(str(k["player_id"]))
    return out


def scripted_candidates(board: dict, removed_ids: set[str], my_picks: list[int]) -> list[dict]:
    """Per scripted pick: the survival-ranked candidate slate on that board."""
    pool = [p for p in board.get("players", [])
            if str(p.get("player_id")) not in removed_ids and (p.get("proj_mean") or 0) > 0]
    picks_out = []
    for pick in my_picks[:PICKS_TO_SCRIPT]:
        cands = []
        for p in pool:
            adp = p.get("adjusted_adp") or p.get("raw_adp")
            if adp is None:
                continue
            surv = survival_probability(float(adp), pick)
            if surv < SURVIVAL_FLOOR:
                continue
            cands.append({"player_id": str(p["player_id"]), "name": p.get("name"),
                          "position": p.get("position"), "vorp": round(p.get("vorp") or 0, 1),
                          "survival": round(surv, 2)})
        cands.sort(key=lambda c: (-c["vorp"], -c["survival"]))
        picks_out.append({"pick": pick, "candidates": cands[:CANDIDATES_PER_PICK]})
    return picks_out


def generate(board: dict, predicted: dict) -> dict:
    my_picks = (board.get("pick_order") or {}).get("my_picks") or []
    my_kept = {str(k.get("player_id")) for k in board.get("kept_players", [])}
    pred_ids = predicted_kept_ids(predicted)

    # PRIMARY branch: the predicted board — all predicted opponent keepers gone
    # (incl. Bowers to Marian + Richard's certain slate) plus my own three.
    primary = scripted_candidates(board, pred_ids | my_kept, my_picks)
    # CONTINGENCY: Bowers slips (Marian keeps someone else) — the old Branch A.
    bowers = next((str(p["player_id"]) for p in board.get("players", [])
                   if p.get("name") == "Brock Bowers"), None)
    contingency = scripted_candidates(
        board, (pred_ids - {bowers}) | my_kept if bowers else pred_ids | my_kept, my_picks)

    meta = {
        "generated_from": "opening_script.py — derives from board + predicted slates; regenerate on any input change",
        "fingerprint": fingerprint(board, predicted),
        "slot_provenance": "site-claimed — Sleeper draft order pending (regenerates on assignment)",
        "doctrine": {
            "enrolled": "Balanced Value (the control)",
            "why": "first tournament verdicts parked every doctrine under the null "
                   "(clear-board finding); enrollment updates when experiment 19's "
                   "Cory-conditional race lands",
        },
    }
    return {"meta": meta, "my_picks": my_picks,
            "branches": {
                "primary_both_tes_gone": primary,
                "contingency_bowers_available": contingency,
            }}


def render_md(script: dict) -> str:
    m = script["meta"]
    fp = m["fingerprint"]
    L = ["# OPENING SCRIPT — generated, never typed", "",
         f"_board `{fp['board_built_at']}` · slot **{fp['my_slot']}** "
         f"({m['slot_provenance']}) · doctrine: **{m['doctrine']['enrolled']}** "
         f"({m['doctrine']['why']})_", "",
         f"My live picks: **{', '.join(str(p) for p in script['my_picks'][:6])}…**", ""]

    def branch(title, note, picks):
        L.append(f"## {title}")
        L.append(f"_{note}_")
        L.append("")
        for entry in picks:
            L.append(f"### Pick {entry['pick']}")
            for i, c in enumerate(entry["candidates"]):
                tag = "**TARGET**" if i == 0 else f"fallback {i}"
                L.append(f"- {tag}: {c['name']} ({c['position']}, VORP {c['vorp']}, "
                         f"{int(c['survival'] * 100)}% survives)")
            L.append("")

    branch("PRIMARY — both TEs gone (the predicted board)",
           "Marian keeps Bowers (high, intel) + Richard keeps Bijan/McBride/Nico "
           "(certain, intel): TE de-anchors — take one whenever; WR-feast and "
           "Early-QB gained the probability mass.",
           script["branches"]["primary_both_tes_gone"])
    branch("CONTINGENCY — Bowers available (Marian keeps someone else)",
           "The elite-TE-anchor question returns: watch the TE room's panic — "
           "survival to my next pick collapses if his ADP jumps on scarcity.",
           script["branches"]["contingency_bowers_available"])

    L.append("_Regenerates on: slot assignment · keeper designations landing "
             "(keeper-watch) · every board rebuild. A stale fingerprint announces "
             "itself — never trust a script whose board hash is old._")
    return "\n".join(L)


def main():
    board = json.loads(BOARD.read_text())
    predicted = json.loads(PREDICTED.read_text())
    script = generate(board, predicted)
    OUT_JSON.write_text(json.dumps(script, indent=1))
    OUT_MD.write_text(render_md(script))
    print(f"opening script: picks {script['my_picks'][:3]} scripted, "
          f"2 branches, fingerprint {script['meta']['fingerprint']['board_built_at']}")
    print(f"wrote {OUT_MD} + {OUT_JSON}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
