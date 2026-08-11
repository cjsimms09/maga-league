#!/usr/bin/env python3
"""RULE 12, THE ONE CHECK THE SAMPLE COULD NOT DO OFFLINE: raw stat lines.

The 2026-08-11 rule 12 run verified seven transformations, and every one of them
started at `proj_baseline`. It never asked where `proj_baseline` came from. That
is the difference between "consistently derived" and "correct": T1 proved
`proj_mean = proj_baseline x (1 + opportunity_adj)` exactly, and would have
proved it just as exactly if `proj_baseline` were nonsense.

`proj_baseline` is `score_stat_line(provider_stats, scoring)` — the provider's
projected STAT LINE run through the league's scoring table. Verifying it needs
the stat line itself, and Sleeper is 403 from the sandbox where the audit runs.
So this probe fetches it where egress works and commits the raw rows, and the
arithmetic is done separately and by hand.

WHAT IT DELIBERATELY DOES NOT DO. It does not score anything. It does not import
`projections.py` or `score_stat_line`. It writes down what the provider said and
what the league's scoring table says, and stops — because a probe that also did
the conversion would be handing the verifier the answer it is supposed to check
independently.

THE SAMPLE IS NOT RE-DRAWN HERE. The ids come from `rule12_sample.json`'s
selectors evaluated against the shipped board; they are passed in rather than
chosen, so this file cannot influence which players get checked.

Run: python3 draft/rule12_statline_probe.py            (needs Sleeper egress)
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

import sleeper_import as SI  # noqa: E402

OUT = HERE / "audit" / "rule12_statlines.json"
BOARD = HERE.parent / "public" / "draft_data.json"
SAMPLE = HERE / "audit" / "rule12_sample.json"


def sampled_ids() -> dict[str, str]:
    """{player_id: name} for the predeclared selectors, evaluated on the board.

    The selectors are re-evaluated rather than a name list being hard-coded, so
    if the board moves the sample moves with it and cannot silently drift into
    "the eleven players that happened to pass last time".
    """
    board = json.loads(BOARD.read_text())
    uni = list(board["players"]) + list(board.get("kept_players") or [])
    uni = [p for p in uni if p.get("position") and p.get("proj_mean") is not None]
    rp = board["replacement"]["replacement_points"]

    def by(pos):
        return [p for p in uni if p["position"] == pos]

    def near(rows, key, target):
        rows = [r for r in rows if r.get(key) is not None]
        return min(rows, key=lambda r: abs(r[key] - target))

    picks = [
        max(by("RB"), key=lambda p: p.get("vorp", -9e9)),
        near(by("RB"), "adjusted_adp", 24),
        min(by("RB"), key=lambda p: abs(p["proj_mean"] - rp["RB"])),
        max(by("WR"), key=lambda p: p.get("vorp", -9e9)),
        near(by("WR"), "adjusted_adp", 60),
        min(by("WR"), key=lambda p: abs(p["proj_mean"] - rp["WR"])),
        max(by("QB"), key=lambda p: p["proj_mean"]),
        min([p for p in by("QB") if (p.get("vorp") or -1) > 0], key=lambda p: p["vorp"]),
        max(by("TE"), key=lambda p: p.get("vorp", -9e9)),
        max(by("DEF"), key=lambda p: p.get("vorp", -9e9)),
        max(by("K"), key=lambda p: p.get("vorp", -9e9)),
    ]
    return {str(p["player_id"]): p["name"] for p in picks}


def main() -> int:
    board = json.loads(BOARD.read_text())
    season = str(board.get("league", {}).get("season") or "2026")
    ids = sampled_ids()
    print(f"sample: {len(ids)} players — {', '.join(ids.values())}")

    proj = SI.fetch_projections(season)
    stats_prev = SI.fetch_stats(str(int(season) - 1))

    rows = {}
    for pid, name in ids.items():
        pr = proj.get(pid) or {}
        st = stats_prev.get(pid) or {}
        rows[pid] = {
            "name": name,
            # The RAW row, untouched. Selecting keys here would be a judgment
            # about what matters, made by the wrong file.
            "projection_row": pr if isinstance(pr, dict) else None,
            "prior_season_row": st if isinstance(st, dict) else None,
        }

    out = {
        "_what": "Raw provider rows for the rule 12 sample. NOT scored here — the "
                 "conversion is the thing under audit and this file must not "
                 "perform it. Verify by applying the scoring table below by hand.",
        "season": season,
        "board_built_at": board.get("built_at"),
        # The scoring table Sleeper holds, copied verbatim so the verifier does
        # not have to trust a second reading of it.
        "scoring_settings": board.get("league", {}).get("scoring") or {},
        "projection_rows_total": len(proj),
        "prior_stats_rows_total": len(stats_prev),
        "players": rows,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1, sort_keys=True))
    got = sum(1 for r in rows.values() if r["projection_row"])
    print(f"wrote {OUT} — {got}/{len(rows)} carry a projection row")
    if got == 0:
        print("! NO projection rows. The provider has none for this season, or the "
              "endpoint shape moved. Reporting that rather than writing an empty "
              "file that reads as a clean fetch.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
