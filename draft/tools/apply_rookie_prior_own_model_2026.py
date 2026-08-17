#!/usr/bin/env python3
# TERRITORY: A
"""PREPARED, GATED — NOT APPLIED: rookie draft-capital prior for the live
board's OWN-MODEL column. Prepared 2026-08-16 under the league benchmark
(draft/audit/league_benchmark_2026-08-16.md §4); queued in
DECISIONS-NEEDED.md. CORY RULES — nothing here runs against the board
without his word, and the script refuses to apply without the flag that
records it.

WHAT CLEARED. The rookie-capital prior was preregistered and graded through
the all-seats replay: pooled optimal-arm Cory gap −65.7 → −40.5/season
(+25.1, 38% of the gap — clears the preregistered 25% bar), realistic-arm
pooled league position 2/10 → 4/10 owners beaten, with the help concentrated
in the 2025 replay (+86 Cory-seat optimal) and 2024 slightly NEGATIVE
(−10.6) — the concentration is named, not hidden.

WHAT THIS WOULD CHANGE, EXACTLY. The live 2026 board's market columns
already price rookies (153 rookies carry proj_mean; the market arm is where
the live engine's rookie knowledge comes from). The OWN-MODEL column
(`proj_ownmodel`) is walk-forward and carries NO rookie — 0 of 153. This
script fills exactly that hole: `Prior(pos, capital bucket)` fit on classes
2021-2025 (all strictly prior to the 2026 season — the same preregistered
form, one more class than the 2025 replay fit), written to `proj_ownmodel`
for board players with `years_exp == 0` whose `proj_ownmodel` is null.

DELIBERATELY NOT TOUCHED: `proj_mean` (the blend), replacement, VORP, ranks,
tiers — the drafting engine reads the blend, and re-weighting the blend to
CONSUME the own-model rookie column is a build-pipeline decision for A's
lane, separately gated. This patch makes the own-model column honest
(a capital-based expectation instead of a silent absence) and gives the
draft-night surfaces an own-model opinion on rookies; it moves no pick
recommendation by itself.

MODES
  python3 draft/tools/apply_rookie_prior_own_model_2026.py fetch-2026
      writes draft/backtest/nflverse_draft_picks_2026.json (network; same
      trimmed period-correct schema as the committed 2021-25 store).
  python3 draft/tools/apply_rookie_prior_own_model_2026.py
      DRY RUN (default): prints the would-be values; the board is not
      opened for writing.
  python3 draft/tools/apply_rookie_prior_own_model_2026.py apply \
      --cory-approved "<his words>"
      applies, with preflights: every target row must currently carry
      proj_ownmodel null; refuses otherwise (idempotence: a second run
      finds nothing null and writes nothing).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
ROOT = DRAFT.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(DRAFT / "backtest"))
sys.path.insert(0, str(DRAFT))

from rookie_prior import SKILL, bucket_of, fit_rookie_prior  # noqa: E402

BOARD = ROOT / "public" / "draft_data.json"
STORE_2026 = DRAFT / "backtest" / "nflverse_draft_picks_2026.json"
STORE_URL = ("https://github.com/nflverse/nflverse-data/releases/download/"
             "draft_picks/draft_picks.csv")


def _norm(name: str) -> str:
    return " ".join(str(name or "").lower().replace(".", "")
                    .replace("'", "").replace("-", " ")
                    .replace(" jr", "").replace(" iii", "")
                    .replace(" ii", "").split())


def fetch_2026() -> dict:
    import csv
    import io
    import urllib.request
    from datetime import date

    raw = urllib.request.urlopen(STORE_URL, timeout=120).read()
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8"))))
    try:
        import nfl_data_py as nfl
        ids = nfl.import_ids()
        sub = ids[["gsis_id", "sleeper_id"]].dropna()
        xw = {}
        for g, s in zip(sub["gsis_id"], sub["sleeper_id"]):
            xw.setdefault(str(g), str(int(float(s))))
    except Exception as e:                                   # noqa: BLE001
        print(f"  ! import_ids unavailable ({e}) — sleeper_id left null, "
              f"name-matching will carry the join")
        xw = {}
    picks = []
    for r in rows:
        if r["season"] != "2026" or r["position"] not in SKILL:
            continue
        picks.append({
            "season": 2026, "round": int(r["round"]), "pick": int(r["pick"]),
            "team": r["team"], "position": r["position"],
            "name": r["pfr_player_name"], "gsis_id": r["gsis_id"] or None,
            "sleeper_id": xw.get(r["gsis_id"]) if r["gsis_id"] else None,
        })
    picks.sort(key=lambda p: p["pick"])
    return {
        "_territory": ("TERRITORY: A — produced by "
                       "apply_rookie_prior_own_model_2026.py fetch-2026"),
        "_note": ("NFL draft class 2026, QB/RB/WR/TE, same trimmed "
                  "period-correct schema as nflverse_draft_picks.json "
                  "(career columns dropped). Input to the PREPARED, GATED "
                  "own-model rookie patch — see that script's docstring; "
                  "applying is Cory's call."),
        "provenance": {"url": STORE_URL, "fetched": str(date.today()),
                       "rows_kept": len(picks)},
        "picks": picks,
    }


def targets() -> tuple[list, dict, list]:
    """(rows to patch, the fit, unmatched board rookies). Pure read."""
    board = json.loads(BOARD.read_text())
    if not STORE_2026.exists():
        raise SystemExit("run `fetch-2026` first — the 2026 class store "
                         "is not committed")
    cls = json.loads(STORE_2026.read_text())["picks"]
    fit = fit_rookie_prior(2026)   # classes 2021-2025, all strictly prior
    by_sleeper = {r["sleeper_id"]: r for r in cls if r["sleeper_id"]}
    by_name = {}
    for r in cls:
        by_name.setdefault((_norm(r["name"]), r["position"]), r)

    rows, unmatched = [], []
    for p in board["players"]:
        if p.get("years_exp") != 0 or p.get("proj_ownmodel") is not None:
            continue
        if p.get("position") not in SKILL:
            continue
        r = by_sleeper.get(str(p.get("player_id"))) or \
            by_name.get((_norm(p.get("name")), p.get("position")))
        if r is None:
            unmatched.append(p["name"])
            continue
        cell = fit["cells"][f"{r['position']}|{bucket_of(r['pick'])}"]
        rows.append({"player_id": str(p["player_id"]), "name": p["name"],
                     "position": p["position"], "nfl_pick": r["pick"],
                     "own_model_value": cell["mean_pts"],
                     "cell_n": cell["n"], "fallback": cell["fallback"]})
    return rows, fit, sorted(unmatched)


def main(argv: list) -> int:
    if argv[:1] == ["fetch-2026"]:
        doc = fetch_2026()
        STORE_2026.write_text(json.dumps(doc, indent=1))
        print(f"wrote {STORE_2026.relative_to(ROOT)} "
              f"({doc['provenance']['rows_kept']} picks)")
        return 0

    apply_mode = argv[:1] == ["apply"]
    if apply_mode and ("--cory-approved" not in argv
                       or argv.index("--cory-approved") + 1 >= len(argv)):
        print("REFUSING: apply requires --cory-approved \"<his words>\" — "
              "this diff is PREPARED, not ruled on. See DECISIONS-NEEDED.md.")
        return 2

    rows, fit, unmatched = targets()
    print(f"own-model rookie prior (fit classes {fit['fit_classes']}, "
          f"{fit['fit_rows']} rows): {len(rows)} board rookies would gain "
          f"a proj_ownmodel value; {len(unmatched)} unmatched (UDFAs and "
          f"non-NFL-drafted board rookies keep null — the prior prices "
          f"draft capital only): {unmatched}")
    for r in rows:
        fb = " (pooled fallback)" if r["fallback"] else ""
        print(f"  {r['name']:28s} {r['position']}  NFL pick "
              f"{r['nfl_pick']:>3}  -> {r['own_model_value']:7.2f}"
              f"  n={r['cell_n']}{fb}")
    if not apply_mode:
        print("DRY RUN — board untouched.")
        return 0

    board = json.loads(BOARD.read_text())
    by_pid = {str(p.get("player_id")): p for p in board["players"]}
    for r in rows:
        row = by_pid[r["player_id"]]
        assert row.get("proj_ownmodel") is None, (
            f"preflight failed: {r['name']} already carries proj_ownmodel "
            f"{row['proj_ownmodel']} — refusing (already applied?)")
    approval = argv[argv.index("--cory-approved") + 1]
    for r in rows:
        by_pid[r["player_id"]]["proj_ownmodel"] = r["own_model_value"]
        by_pid[r["player_id"]]["proj_ownmodel_source"] = (
            "rookie_capital_prior_2026")
    board.setdefault("notes", []).append(
        {"applied": "rookie_capital_prior_own_model",
         "cory_approval_verbatim": approval,
         "players_patched": len(rows)})
    BOARD.write_text(json.dumps(board, indent=1))
    print(f"APPLIED to {len(rows)} rookies under recorded approval.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
