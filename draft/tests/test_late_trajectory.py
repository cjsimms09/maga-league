# TERRITORY: A
"""THE late_trajectory BOARD COLUMN — F7 arithmetic, additive attach, wiring.

The column exists because edge_hunt_2026-08-16 §3 measured exactly one
predictive 50/50 tie-breaker (hotter prior-season finish: 58.0% of 176
near-ties, Wilson 95% CI [.506, .650]) and A's 2026-08-17 ruling applied the
prepared diff — the verdict.js fact half is PREPARED at
draft/patches/tiebreak_facts_bake.patch; this suite pins the data half.

What is pinned, and why each pin exists:
  1. the F7 ARITHMETIC on a synthetic fixture (late-window ppg minus season
     ppg; < LATE_MIN_GAMES late rows ⇒ ABSENT, not 0.0);
  2. the CONSTANTS come from backtest/own_model_v2.py — retyping 10 and 3
     here would be the exact drift the no-retype audit exists for;
  3. the STORE parity — a value recomputed by independent arithmetic straight
     from the committed component store matches the module (and the module
     reads the COMPONENT store, not the 2025 weekly-points store the study
     itself read, because that store drops zero-point rows and A's 2026-08-17
     ruling routed every games/rate consumer to the component stores);
  4. the ATTACH is ADDITIVE — no existing key changes, absence stays absence
     (no key, not None) — the draft_capital contract, proved not promised;
  5. build.py is WIRED to attach it (source pin, same style as
     test_prune_wired.py) inside a try/except so the column stays an upgrade,
     never a dependency.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

DRAFT = Path(__file__).resolve().parent.parent
ROOT = DRAFT.parent
for p in (str(DRAFT),):
    if p not in sys.path:
        sys.path.insert(0, p)

import late_trajectory as LT  # noqa: E402
from backtest.own_model_v2 import LATE_FROM, LATE_MIN_GAMES  # noqa: E402


# ── 1. the F7 arithmetic, on a fixture small enough to hand-check ───────────

def test_f7_is_late_window_rate_minus_season_rate():
    weekly = {
        # 4 games, ppg = (10+10+20+20)/4 = 15; late (wks 10,17) = 20 ⇒ +5
        "hot": {1: 10.0, 2: 10.0, 10: 20.0, 17: 20.0},
        # mirror image ⇒ −5
        "cold": {1: 20.0, 2: 20.0, 10: 10.0, 17: 10.0},
        # uniform ⇒ exactly 0.0 — PRESENT (a flat finish is a fact, not absence)
        "flat": {1: 12.0, 9: 12.0, 10: 12.0, 11: 12.0, 12: 12.0},
    }
    out = LT.late_trajectory_from_weekly(
        weekly, late_from=10, late_min_games=2)
    assert out["hot"] == 5.0
    assert out["cold"] == -5.0
    assert out["flat"] == 0.0


def test_thin_late_window_is_absent_not_zero():
    weekly = {
        "thin": {1: 9.0, 2: 9.0, 15: 30.0},          # 1 late game < 3
        "empty": {},                                  # no rows at all
        "week18": {18: 40.0},                         # outside 1..17 entirely
    }
    out = LT.late_trajectory_from_weekly(
        weekly, late_from=LATE_FROM, late_min_games=LATE_MIN_GAMES)
    assert out == {}, (
        "a player the window cannot measure must be ABSENT — a key of 0.0 "
        f"would claim a flat finish that was never observed: {out}")


def test_week_18_rows_are_outside_the_season_window():
    # Week 18 exists in the component stores; the study's window ends at 17.
    weekly = {"p": {16: 10.0, 17: 10.0, 12: 10.0, 18: 999.0, 1: 10.0}}
    out = LT.late_trajectory_from_weekly(
        weekly, late_from=LATE_FROM, late_min_games=LATE_MIN_GAMES)
    assert out["p"] == 0.0, out


# ── 2. constants have ONE home ──────────────────────────────────────────────

def test_constants_are_imported_from_own_model_v2_not_retyped():
    src = (DRAFT / "late_trajectory.py").read_text()
    assert "from backtest.own_model_v2 import LATE_FROM, LATE_MIN_GAMES" in src
    # and the module's season window is the study's
    assert LT.LAST_SCORED_WEEK == 17


# ── 3. store parity — independent arithmetic against the committed store ────

def test_real_2025_value_matches_independent_arithmetic_from_the_component_store():
    values = LT.compute_late_trajectory(2026)
    assert len(values) > 300, (
        "the 2025 component store carries ~600 scored players; a collapse "
        f"here means the store read broke silently: {len(values)}")

    from backtest import fetch_component_stats as FCS
    import scoring as scoring_mod
    table = FCS.frozen_scoring_table()
    doc = json.loads((DRAFT / "backtest" / "component_stats_2025.json").read_text())
    # rebuild one player's weekly points with NO shared code beyond the scorer
    checked = 0
    for pid in list(values)[:25]:
        rows: dict[int, float] = {}
        for wk in doc["weeks"]:
            w = int(wk["week"])
            if not (1 <= w <= 17):
                continue
            line = wk["players"].get(pid)
            if line is None:
                continue
            stat = {k: line[k] for k in line if k not in ("pos", "team")}
            rows[w] = round(scoring_mod.score_stat_line(stat, table), 2)
        ppg = sum(rows.values()) / len(rows)
        late = [v for w, v in rows.items() if LATE_FROM <= w <= 17]
        assert len(late) >= LATE_MIN_GAMES
        expected = (sum(late) / len(late)) - ppg
        assert abs(values[pid] - expected) < 1e-9, (pid, values[pid], expected)
        checked += 1
    assert checked == 25


def test_the_module_reads_the_component_store_not_the_2025_weekly_store():
    """The ruled store choice, pinned. The 2025 weekly-points store drops
    zero-point rows (54 whole skill players; its own pinning test), so a
    rate/games consumer reading it inherits a wrong denominator. The module
    must therefore cover players the weekly store cannot see."""
    values = LT.compute_late_trajectory(2026)
    store = json.loads(
        (DRAFT / "backtest" / "nflverse_weekly_points_2025.json").read_text())
    weekly_pids = set()
    for w in store["weeks"]:
        if 1 <= int(w["week"]) <= 17:
            weekly_pids.update(str(p) for p in w["points"])
    only_here = set(values) - weekly_pids
    # Re-pinned 2026-08-18 (register 5d): the discriminator (coverage BEYOND
    # the weekly store proved the module read components) died the day the
    # weekly store was rebuilt FROM the component store — the populations
    # now coincide by construction, the healed state row 33 asked for. The
    # residual claim: coverage must stay component-sized, not collapse.
    assert len(set(values) & weekly_pids) > 300, (
        "late_trajectory coverage collapsed against the unified store")


# ── 4. the attach is additive ───────────────────────────────────────────────

def test_attach_is_additive_and_absence_stays_absence():
    board = [
        {"player_id": "a1", "name": "Hot Player", "proj_mean": 200.0},
        {"player_id": "zz", "name": "No Prior Season", "proj_mean": 100.0},
    ]
    before = [dict(p) for p in board]
    diag = LT.attach_late_trajectory(board, {"a1": 3.14159})
    assert board[0]["late_trajectory"] == 3.14
    # every pre-existing key is byte-identical
    for prev, now in zip(before, board):
        for k, v in prev.items():
            assert now[k] == v, (k, v, now[k])
    # the unmatched player gained NO key — absent, not None
    assert "late_trajectory" not in board[1]
    assert diag["attached"] == 1
    assert diag["changes_projection_or_ranking"] is False
    # the diagnostic carries the measured evidence, n and CI included
    assert "176" in diag["evidence"] and "[.506, .650]" in diag["evidence"]


# ── 5. build.py is wired ────────────────────────────────────────────────────

def test_build_py_attaches_the_column_as_an_upgrade_never_a_dependency():
    src = (DRAFT / "build.py").read_text()
    assert "attach_late_trajectory(board, compute_late_trajectory(year_n))" in src
    i = src.index("attach_late_trajectory")
    window = src[max(0, i - 2000):i + 2000]
    assert "except Exception" in window, (
        "the attach must be wrapped — a data column must never be able to "
        "kill the board build")
    assert 'PROJECTION_PROVENANCE["late_trajectory"]' in src, (
        "the column must record provenance (including its error arm) like "
        "every other attached source")
