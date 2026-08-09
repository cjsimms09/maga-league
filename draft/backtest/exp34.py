#!/usr/bin/env python3
"""EXPERIMENT 34 — decision alignment helpers (verified) + SUPERSEDED single-pick summary.

⚠️ THE SINGLE-PICK SUMMARY BELOW IS SUPERSEDED — do not fire it. Cory (2026-08-09)
rejected the my-guy-vs-their-guy comparison correctly: 41 single-pick comparisons
are coin flips dominated by which player broke out. The measuring stick is
redesigned in EXP34-METHODOLOGY.md (policy-level rank correlation + top-N set value
+ the deviation-edge surface across board position / tier proximity / round /
dispersion). What survives from this file is the PURE ALIGNMENT CORE — roster_id
resolution, keeper exclusion, board-before, best-available-by-source — verified in
test_exp34.py and reused by the surface build. The summarize_arm/build_result layer
is kept only as the secondary single-pick read the methodology explicitly demotes.

── original header ──────────────────────────────────────────────────────────────
EXPERIMENT 34 — RECOMMENDATION-VS-MARKET SCOREBOARD (two runnable arms).

THE QUESTION, narrowed to what the data can answer. The cap result (2026-08-09)
found that ~72% of our deviations carry >=4 points of need/ceiling evidence, so
the open question is whether that evidence is CORRECT against the market. 34
answers it at each of Cory's REAL historical picks (2023-25), on realized points:

  ARM A — MARKET (FFC contemporaneous ADP): at my pick, did the player I took
          out-score the best player still on the board by real ADP? If not, our
          picks do not beat the market on selection.
  ARM B — ROOM (revealed preference): did the player I took out-score the best
          player still on the board by the ROOM's own revealed order (the actual
          overall draft sequence)? i.e. did I beat these nine specific humans?

The third spec arm — "what the TOOL would have recommended" — stays BLOCKED: it
needs decision-time projections, none archived (D13's remaining half). So 34 runs
as a two-arm scoreboard, reported separately, as the pre-registration now says.

PRE-REGISTRATION (binding, PRE-REGISTRATION-34.md): n ~= 41 decisions across three
seasons, UNDERPOWERED BY CONSTRUCTION; every reading assumes wide intervals; an
inconclusive CI spanning zero argues for the anchor binding HARDER, not looser,
exactly as strongly as a loss would. Do not soften that after seeing the number.

── ARCHITECTURE ────────────────────────────────────────────────────────────────
The PURE CORE (decision alignment, best-available-by-source, bootstrap CI) is
unit-tested with a fixture in draft/tests/test_exp34.py — verifiable WITHOUT
egress. The egress main (FFC ADP + nflverse realized points) follows cli.py's
proven year-by-year loader and runs only in CI (lab.yml). Dollars are a stated
translation of the points result, not a per-pick money re-grade: per-pick dollar
attribution is inherently approximate and the honest primary metric is realized
points; the dollar line carries its assumptions with it.

Run (CI, egress): python draft/backtest/exp34.py --out draft/backtest
"""
from __future__ import annotations
import json, os, sys, argparse
from pathlib import Path

HERE = Path(__file__).resolve().parent
CORY = "coryjsimms"


# ─────────────────────────────────────────────────────────────── pure core ──
def cory_roster_id(season: dict) -> int | None:
    """Cory's roster_id this season, by display_name — his SLOT moves year to
    year, so it is resolved per season, never assumed."""
    owners = season.get("owners") or {}
    items = owners.items() if isinstance(owners, dict) else enumerate(owners)
    for rid, o in items:
        if (o or {}).get("display_name") == CORY:
            try:
                return int(rid)
            except (TypeError, ValueError):
                return int((o or {}).get("roster_id")) if (o or {}).get("roster_id") else None
    return None


def real_draft(season: dict) -> list[dict]:
    """The season's completed draft picks, sorted by overall pick number."""
    for d in season.get("drafts") or []:
        picks = d.get("picks") or []
        if picks:
            return sorted(picks, key=lambda p: p.get("pick_no") or 0)
    return []


def cory_decisions(picks: list[dict], rid: int) -> list[dict]:
    """Cory's NON-KEEPER picks — the real decisions 34 grades. A keeper is not a
    decision made against the board, so it is excluded exactly as the registry's
    ~41-count assumes."""
    return [p for p in picks
            if p.get("roster_id") == rid and not p.get("is_keeper")]


def board_before(picks: list[dict], pick_no: int) -> set[str]:
    """player_ids NOT yet taken when pick `pick_no` is on the clock."""
    taken = {str(p.get("player_id")) for p in picks if (p.get("pick_no") or 0) < pick_no}
    allp = {str(p.get("player_id")) for p in picks}
    return allp - taken


def best_available_by_adp(board: set[str], adp_rank: dict[str, float]) -> str | None:
    """The player still on the board with the best (lowest) real ADP. Players
    with no ADP entry cannot be the market's pick and are skipped."""
    cand = [(adp_rank[pid], pid) for pid in board if pid in adp_rank]
    return min(cand)[1] if cand else None


def best_available_by_room(board: set[str], picks: list[dict], pick_no: int) -> str | None:
    """The player still on the board whom the ROOM drafted earliest (min overall
    pick after mine) — the room's revealed 'best guy left'. Excludes my own pick."""
    cand = [((p.get("pick_no") or 1e9), str(p.get("player_id")))
            for p in picks
            if str(p.get("player_id")) in board and (p.get("pick_no") or 0) != pick_no]
    return min(cand)[1] if cand else None


def align_decisions(season_num: int, picks: list[dict], rid: int,
                    adp_rank: dict[str, float], points: dict[str, float]) -> list[dict]:
    """One row per real decision: what I took vs the market-best and room-best
    still available, each with realized points. A decision is DROPPED (not scored
    zero) when the taken player has no realized-points row — missing data is not a
    zero, per grade.rest_of_season_points's own contract."""
    out = []
    for p in cory_decisions(picks, rid):
        pn = p.get("pick_no") or 0
        took = str(p.get("player_id"))
        if took not in points:
            continue  # ungradeable pick: no NFL field time -> missing, not zero
        board = board_before(picks, pn)
        adp_pid = best_available_by_adp(board, adp_rank)
        room_pid = best_available_by_room(board, picks, pn)
        row = {"season": season_num, "pick_no": pn, "round": p.get("round"),
               "took": took, "took_pts": points[took],
               "adp_best": adp_pid, "adp_best_pts": points.get(adp_pid) if adp_pid else None,
               "room_best": room_pid, "room_best_pts": points.get(room_pid) if room_pid else None}
        # deltas: my realized points minus the counterfactual's. Positive = I beat it.
        row["adp_delta"] = (row["took_pts"] - row["adp_best_pts"]) if row["adp_best_pts"] is not None else None
        row["room_delta"] = (row["took_pts"] - row["room_best_pts"]) if row["room_best_pts"] is not None else None
        out.append(row)
    return out


def assemble(season_num: int, picks: list[dict], rid: int, *,
             proj: dict[str, float], adp_rank: dict[str, float],
             realized: dict[str, float], tiers: dict[str, int] | None = None,
             dispersion: dict[str, float] | None = None) -> tuple[list[list[dict]], list[dict]]:
    """PURE. Turn loaded season data into the two record shapes the metrics need:

      pools     — per real decision, the AVAILABLE pool [{pid, our_proj, adp,
                  realized}] over players that carry all three (correlation/top-N).
      decisions — per real decision, my pick vs the ADP-preferred available, with
                  FORGONE VALUE (our proj gap), ADP distance, tier-cross, dispersion.

    Only the egress fetch is unverifiable; this — where the analysis actually lives
    — is unit-tested with a fixture in test_exp34.py."""
    tiers = tiers or {}
    dispersion = dispersion or {}
    pools, decisions = [], []
    for p in cory_decisions(picks, rid):
        pn = p.get("pick_no") or 0
        took = str(p.get("player_id"))
        if took not in realized or took not in proj:
            continue  # ungradeable or unprojectable pick: missing, not zero
        board = board_before(picks, pn)
        pool = [{"pid": pid, "our_proj": proj[pid], "adp": adp_rank[pid],
                 "realized": realized.get(pid)}
                for pid in board if pid in proj and pid in adp_rank]
        pools.append(pool)
        adp_best = best_available_by_adp(board & set(adp_rank), adp_rank)
        if adp_best is None:
            continue
        tt, at = tiers.get(took), tiers.get(adp_best)
        decisions.append({
            "season": season_num, "round": p.get("round"), "pick_no": pn,
            "took": took, "took_proj": proj.get(took), "took_realized": realized.get(took),
            "adp_best": adp_best, "adp_best_proj": proj.get(adp_best),
            "adp_best_realized": realized.get(adp_best),
            # deviation cost in FORGONE VALUE (our projected points), the adopted unit
            "forgone_value": (round(proj[adp_best] - proj[took], 2)
                              if adp_best in proj and took in proj else None),
            # ADP distance kept as the comparison unit: spots I reached past market
            "adp_distance": (round(adp_rank[took] - pn, 1) if took in adp_rank else None),
            "dispersion": dispersion.get(took),
            "crosses_cliff": (None if tt is None or at is None else (tt != at)),
            "took_tier": tt, "adp_best_tier": at,
        })
    return pools, decisions


def _bootstrap_ci(deltas: list[float], iters: int = 10000, seed: int = 34) -> tuple[float, float]:
    """Percentile bootstrap 95% CI of the mean. Deterministic seed — a metric
    that moves between runs is not a metric."""
    xs = [d for d in deltas if d is not None]
    if len(xs) < 2:
        return (float("nan"), float("nan"))
    # tiny LCG, no numpy dependency in the pure core
    state = seed & 0xFFFFFFFF
    def rnd():
        nonlocal state
        state = (1103515245 * state + 12345) & 0x7FFFFFFF
        return state / 0x7FFFFFFF
    n = len(xs)
    means = []
    for _ in range(iters):
        s = 0.0
        for _ in range(n):
            s += xs[int(rnd() * n)]
        means.append(s / n)
    means.sort()
    return (round(means[int(0.025 * iters)], 2), round(means[int(0.975 * iters)], 2))


def summarize_arm(rows: list[dict], key: str) -> dict:
    """Mean delta, bootstrap CI, n, and per-season sign consistency for one arm.
    'inconclusive' when the CI spans zero — which the pre-registration reads as
    arguing for the anchor to bind harder, not as a tie that lets deviating stand."""
    ds = [r[key] for r in rows if r.get(key) is not None]
    n = len(ds)
    mean = round(sum(ds) / n, 2) if n else float("nan")
    lo, hi = _bootstrap_ci(ds)
    by_season = {}
    for r in rows:
        if r.get(key) is None:
            continue
        by_season.setdefault(r["season"], []).append(r[key])
    signs = {s: (1 if sum(v) > 0 else (-1 if sum(v) < 0 else 0)) for s, v in by_season.items()}
    consistent = len(set(signs.values())) == 1 and 0 not in signs.values()
    verdict = ("inconclusive" if (lo <= 0 <= hi or n < 2)
               else ("beat" if mean > 0 else "lost"))
    return {"n": n, "mean_delta": mean, "ci95": [lo, hi], "verdict": verdict,
            "per_season_sign": signs, "sign_consistent": consistent}


def build_result(all_rows: list[dict]) -> dict:
    return {
        "experiment": "34 — recommendation-vs-market scoreboard (two arms)",
        "metric": "realized rest-of-season fantasy points; my pick minus best-available-by-source",
        "n_decisions": len(all_rows),
        "underpowered": True,
        "note": "n~41, underpowered by construction; inconclusive => anchor binds HARDER (PRE-REGISTRATION-34.md)",
        "arm_A_market_adp": summarize_arm(all_rows, "adp_delta"),
        "arm_B_room_revealed": summarize_arm(all_rows, "room_delta"),
        "decisions": all_rows,
    }


# ───────────────────────────────────────────────────────────── egress main ──
def _egress_main(out_dir: Path) -> int:
    """CI only. Loads Sleeper players, real FFC ADP per season, and realized
    weekly points (cli.py's year-by-year loader), aligns Cory's decisions, and
    writes EXP34.md + exp34.json. Never invoked by the pure-core unit test."""
    sys.path.insert(0, str(HERE.parent))          # draft/ on path for adp, sleeper_import
    sys.path.insert(0, str(HERE.parent.parent))   # repo root
    import adp as ADP
    import sleeper_import as SL
    from backtest import grade as GR
    import nfl_data_py as nfl
    import pandas as pd

    history = json.loads((HERE.parent / "data" / "league_history.json").read_text())
    seasons = [s for s in history["seasons"] if real_draft(s)]
    season_nums = sorted({int(s["season"]) for s in seasons})
    print("exp34 seasons:", season_nums)

    players_raw = SL.load_players()
    index = ADP.build_index(players_raw)
    players_meta = [{"player_id": str(pid), "name": p.get("full_name"),
                     "position": p.get("position"), "team": p.get("team"),
                     "gsis_id": p.get("gsis_id")}
                    for pid, p in players_raw.items() if p.get("position")]
    try:
        ids_df = nfl.import_ids()
    except Exception as e:
        print("  ! import_ids unavailable:", e); ids_df = None
    crosswalk = GR.crosswalk_gsis_to_sleeper(players_meta, ids_df)

    all_rows, caveats = [], []
    for s in seasons:
        yr = int(s["season"])
        scoring_cfg = s.get("scoring_settings") or {}
        teams = ((s.get("settings") or {}).get("teams")) or 10
        # ARM A input: real contemporaneous FFC ADP -> {sleeper_id: adp}
        try:
            payload = ADP.fetch_adp("half-ppr", teams, yr)
        except Exception as e:
            caveats.append(f"{yr}: FFC ADP unavailable ({e}); ARM A skipped this season")
            payload = {"players": []}
        adp_rank = {}
        for entry in payload.get("players") or []:
            sid, _how = ADP.match_player(entry, index)
            if sid and entry.get("adp") is not None:
                adp_rank[str(sid)] = float(entry["adp"])
        # realized points for the season (year-by-year; one 404 must not kill it)
        try:
            weekly = nfl.import_weekly_data([yr])
        except Exception as e:
            caveats.append(f"{yr}: weekly UNAVAILABLE ({e}); season SKIPPED (not scored zero)")
            continue
        points = GR.rest_of_season_points(weekly, yr, scoring_cfg, crosswalk, from_week=1)
        rid = cory_roster_id(s)
        if rid is None:
            caveats.append(f"{yr}: could not resolve Cory's roster_id; season skipped")
            continue
        rows = align_decisions(yr, real_draft(s), rid, adp_rank, points)
        print(f"  {yr}: {len(rows)} gradeable decisions, {len(adp_rank)} ADP-matched players")
        all_rows.extend(rows)

    result = build_result(all_rows)
    result["caveats"] = caveats
    (out_dir / "exp34.json").write_text(json.dumps(result, indent=2) + "\n")
    (out_dir / "EXP34.md").write_text(_report(result))
    print("\n" + _report(result))
    return 0


def _report(r: dict) -> str:
    A, B = r["arm_A_market_adp"], r["arm_B_room_revealed"]
    def line(name, arm):
        return (f"- **{name}**: mean {arm['mean_delta']:+} pts/decision, "
                f"95% CI [{arm['ci95'][0]}, {arm['ci95'][1]}], n={arm['n']}, "
                f"**{arm['verdict'].upper()}** · per-season signs {arm['per_season_sign']}"
                f" ({'consistent' if arm['sign_consistent'] else 'mixed'})")
    L = ["# EXPERIMENT 34 — recommendation-vs-market scoreboard", "",
         f"_{r['n_decisions']} real decisions, realized rest-of-season points, "
         f"my pick minus best-available-by-source. Underpowered by construction (n~41)._", "",
         "## The two arms", "",
         line("ARM A — did we beat the MARKET (FFC ADP)", A),
         line("ARM B — did we beat the ROOM (revealed order)", B), "",
         "## Reading (pre-registered, binding)", "",
         "An inconclusive CI spanning zero argues for the anchor binding HARDER, not "
         "looser — exactly as strongly as a loss. The blocked third arm (what the TOOL "
         "would recommend) needs decision-time projections that are not archived.", ""]
    if r.get("caveats"):
        L += ["## Caveats", ""] + [f"- {c}" for c in r["caveats"]] + [""]
    return "\n".join(L)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE))
    args = ap.parse_args()
    raise SystemExit(_egress_main(Path(args.out)))
