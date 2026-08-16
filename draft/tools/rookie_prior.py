# TERRITORY: A
"""ROOKIE PRIOR FROM NFL DRAFT CAPITAL — candidate layer A of the league
benchmark (draft/audit/league_benchmark_2026-08-16.md). Built 2026-08-16.

WHY. The draft replay (draft/tools/draft_replay_2025.py) named "no rookies
exist on a walk-forward stats board" as the tool's single largest measured
mechanism of loss to Cory's real drafting (2024: five of his picks — 1044
actual points — were literally invisible to the tool's board). Cory's ruling
question ("We need to make this model better... how do we do that?") makes
that mechanism the first candidate layer: the standard draft-capital prior —
NFL draft position + position → rookie-season fantasy-point expectation.

THE FORM IS PREREGISTERED. The exact bucket boundaries, fallback rule,
outcome definition and fit windows below were written into the audit doc and
committed BEFORE any replay grade of this layer was computed (the house
discipline). Changing the form after seeing grades is a new layer, not a fix.

── THE COMMITTED STORE ────────────────────────────────────────────────────────

`draft/backtest/nflverse_draft_picks.json` — NFL draft picks 2021-2025,
QB/RB/WR/TE only, fetched from the nflverse draft_picks release
(github.com/nflverse/nflverse-data, the same egress path as the component
stores) and committed with provenance. PERIOD-CORRECTNESS BY CONSTRUCTION:
the nflverse file carries career-outcome columns (games, career yards, w_av,
`to` — the player's last season); every one of those is DROPPED at build
time. What is kept is exactly what was public on NFL-draft night of the
class year — season, round, overall pick, team, position, name, gsis_id —
plus the gsis→sleeper crosswalk column (nfl_data_py.import_ids(), the same
source the component stores' crosswalk used; a pick the crosswalk cannot map
keeps sleeper_id null and is COUNTED, never silently dropped).

── THE PRIOR (preregistered form) ─────────────────────────────────────────────

Fit for replay season Y uses ONLY classes C ∈ {2021, …, Y−1}:

  · outcome of a class-C pick = his TOTAL scored fantasy points in season C
    (weeks 1-17) from the committed stores — weekly stores for C ≥ 2023,
    component stores scored under the frozen table for 2021/2022 (the
    parity-pinned substrate, read through draft_replay_2025.season_totals_of)
    — and 0.0 when he has no scored row (busts count; that IS the base rate);
  · capital buckets by overall pick: 1-10, 11-32 (rest of R1), 33-64 (R2),
    65-105 (R3), 106+ (day 3);
  · Prior(pos, bucket) = mean outcome over fit rows in the cell;
  · fallback: a cell with n < 4 uses the position's pooled mean over ALL
    that position's fit rows (cells and fallbacks are reported with their n);
  · picks with sleeper_id null are excluded from the fit and counted.

Walk-forward guard: `fit_rookie_prior(Y)` asserts every fit class < Y, and
the leakage test traces every file open — no season-≥Y store is touched.

── APPLICATION IN THE REPLAY ──────────────────────────────────────────────────

For replay season Y, every class-Y pick with a sleeper_id that is NOT
already on the walk-forward board enters the board at Prior(pos, bucket).
Position comes from the committed store. Replacement levels are recomputed
over the widened pool. Nothing else about the replay changes.

Run:  python3 draft/tools/rookie_prior.py            # print fitted priors
      python3 draft/tools/rookie_prior.py fetch      # (re)build the store
                                                     #  — network + pandas
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent            # draft/tools
DRAFT = HERE.parent
BT = DRAFT / "backtest"
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(BT))
sys.path.insert(0, str(DRAFT))

STORE = BT / "nflverse_draft_picks.json"
STORE_URL = ("https://github.com/nflverse/nflverse-data/releases/download/"
             "draft_picks/draft_picks.csv")
CLASSES = (2021, 2022, 2023, 2024, 2025)
SKILL = ("QB", "RB", "WR", "TE")

# ── preregistered constants (mirrored verbatim in the audit doc) ─────────────
BUCKETS = ((1, 10), (11, 32), (33, 64), (65, 105), (106, 10 ** 6))
MIN_CELL_N = 4
OUTCOME_LAST_WEEK = 17


def bucket_of(pick: int) -> str:
    for lo, hi in BUCKETS:
        if lo <= pick <= hi:
            return f"{lo}-{hi}" if hi < 10 ** 6 else f"{lo}+"
    raise ValueError(f"pick {pick} outside every bucket")


def load_store() -> dict:
    return json.loads(STORE.read_text())


def class_rows(store: dict, season: int) -> list:
    return [r for r in store["picks"] if r["season"] == season]


def fit_rookie_prior(replay_season: int, store: dict | None = None) -> dict:
    """Prior(pos, bucket) fit on classes strictly before `replay_season`.
    Returns cells, fallbacks and counts — everything the artifact reports."""
    import draft_replay_2025 as R  # late import: keeps `fetch` path light

    store = store or load_store()
    fit_classes = [c for c in CLASSES if c < replay_season]
    assert fit_classes and all(c < replay_season for c in fit_classes), (
        "walk-forward violation: a fit class is not strictly prior")

    rows = []          # (pos, bucket, outcome)
    unmapped = 0
    for c in fit_classes:
        totals = R.season_totals_of(c)[0]
        for r in class_rows(store, c):
            if not r["sleeper_id"]:
                unmapped += 1
                continue
            rows.append((r["position"], bucket_of(r["pick"]),
                         float(totals.get(r["sleeper_id"], 0.0))))

    pos_pool: dict[str, list] = {p: [] for p in SKILL}
    cells: dict[tuple, list] = {}
    for pos, b, out in rows:
        pos_pool[pos].append(out)
        cells.setdefault((pos, b), []).append(out)

    prior = {}
    for pos in SKILL:
        pool_mean = (round(sum(pos_pool[pos]) / len(pos_pool[pos]), 2)
                     if pos_pool[pos] else 0.0)
        for lo, hi in BUCKETS:
            b = f"{lo}-{hi}" if hi < 10 ** 6 else f"{lo}+"
            got = cells.get((pos, b), [])
            if len(got) >= MIN_CELL_N:
                prior[f"{pos}|{b}"] = {
                    "mean_pts": round(sum(got) / len(got), 2),
                    "n": len(got), "fallback": False}
            else:
                prior[f"{pos}|{b}"] = {
                    "mean_pts": pool_mean, "n": len(got), "fallback": True,
                    "pooled_n": len(pos_pool[pos])}
    return {"replay_season": replay_season,
            "fit_classes": fit_classes,
            "fit_rows": len(rows),
            "unmapped_excluded": unmapped,
            "cells": {k: prior[k] for k in sorted(prior)}}


def rookie_overlay(replay_season: int, baseline_proj: dict,
                   store: dict | None = None,
                   fit: dict | None = None) -> dict:
    """The layer: {pid: {proj, pos, name, pick}} for every class-Y pick with
    a sleeper_id not already on the walk-forward board."""
    store = store or load_store()
    fit = fit or fit_rookie_prior(replay_season, store)
    out = {}
    for r in class_rows(store, replay_season):
        pid = r["sleeper_id"]
        if not pid or pid in baseline_proj:
            continue
        cell = fit["cells"][f"{r['position']}|{bucket_of(r['pick'])}"]
        out[pid] = {"proj": cell["mean_pts"], "pos": r["position"],
                    "name": r["name"], "pick": r["pick"]}
    return out


# ── store build (network path — run once, committed) ─────────────────────────

def fetch_store() -> dict:
    import csv
    import io
    import urllib.request
    from datetime import date

    import nfl_data_py as nfl

    raw = urllib.request.urlopen(STORE_URL, timeout=120).read()
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8"))))

    ids = nfl.import_ids()
    sub = ids[["gsis_id", "sleeper_id"]].dropna()
    xw = {}
    for g, s in zip(sub["gsis_id"], sub["sleeper_id"]):
        xw.setdefault(str(g), str(int(float(s))))

    picks = []
    unmapped = 0
    for r in rows:
        if r["season"] not in {str(c) for c in CLASSES}:
            continue
        if r["position"] not in SKILL:
            continue
        sleeper = xw.get(r["gsis_id"]) if r["gsis_id"] else None
        if sleeper is None:
            unmapped += 1
        picks.append({
            "season": int(r["season"]), "round": int(r["round"]),
            "pick": int(r["pick"]), "team": r["team"],
            "position": r["position"], "name": r["pfr_player_name"],
            "gsis_id": r["gsis_id"] or None, "sleeper_id": sleeper,
        })
    picks.sort(key=lambda p: (p["season"], p["pick"]))

    return {
        "_territory": ("TERRITORY: A — produced by "
                       "draft/tools/rookie_prior.py fetch"),
        "_note": ("NFL draft picks 2021-2025, QB/RB/WR/TE only, from the "
                  "nflverse draft_picks release. PERIOD-CORRECT BY "
                  "CONSTRUCTION: the source's career-outcome columns "
                  "(games, career yards, w_av, `to`, pro bowls, ...) are "
                  "deliberately DROPPED at build time — what remains is "
                  "exactly the NFL-draft-night information set of each "
                  "class year, plus the gsis→sleeper crosswalk column. A "
                  "pick the crosswalk cannot map keeps sleeper_id null and "
                  "is counted, never silently dropped. Consumed by the "
                  "rookie-capital prior (this file) and the year-2 "
                  "escalator; the prior's form is preregistered in "
                  "draft/audit/league_benchmark_2026-08-16.md."),
        "provenance": {
            "url": STORE_URL,
            "crosswalk": ("nfl_data_py.import_ids() gsis_id -> sleeper_id — "
                          "the same source the component stores used"),
            "fetched": str(date.today()),
            "seasons": list(CLASSES),
            "positions": list(SKILL),
            "rows_kept": len(picks),
            "sleeper_unmapped": unmapped,
            "columns_dropped_for_period_correctness": [
                "hof", "category", "side", "college", "age", "to", "allpro",
                "probowls", "seasons_started", "w_av", "car_av", "dr_av",
                "games", "pass_*", "rush_*", "rec_*", "def_*",
                "pfr_player_id", "cfb_player_id"],
        },
        "picks": picks,
    }


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "fetch":
        doc = fetch_store()
        STORE.write_text(json.dumps(doc, indent=1))
        print(f"wrote {STORE} ({doc['provenance']['rows_kept']} picks, "
              f"{doc['provenance']['sleeper_unmapped']} unmapped)")
        return
    store = load_store()
    for y in (2023, 2024, 2025):
        fit = fit_rookie_prior(y, store)
        print(f"replay {y}: fit classes {fit['fit_classes']}, "
              f"{fit['fit_rows']} rows ({fit['unmapped_excluded']} unmapped "
              f"excluded)")
        for k, v in fit["cells"].items():
            fb = " (fallback)" if v["fallback"] else ""
            print(f"  {k:12s} {v['mean_pts']:7.2f}  n={v['n']}{fb}")


if __name__ == "__main__":
    main()
