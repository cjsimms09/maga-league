# TERRITORY: E
"""opponent_need_model.py — pure core, offline (no egress; real-data pins are
marked repo_parity and excluded from the CI lane, same split as the rest of the
suite — see conftest.py).

The four things the work order says a test must hold:
  1. need-state derivation on known fixtures,
  2. the as-of rule (a tendency for season Y counts ONLY seasons < Y),
  3. calibration reproduction (determinism + internal consistency + the
     committed artifact reproducing from the module, repo_parity),
  4. a FAIL-ARM proving the backtest DETECTS a planted future-info tendency —
     both the refusal (FutureInfoTendency) and the metric's sensitivity when
     the leak is explicitly let through.
Plus the no-retype pin: the module's mirrored engine constants must match
survival.js CFG, read from the file, not believed from a comment.
"""
import copy
import json
import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))
import opponent_need_model as ONM  # noqa: E402
import draft_behavior as DB        # noqa: E402

ROOT = Path(__file__).resolve().parents[2]


# ── 1. need state on known fixtures ─────────────────────────────────────────

def test_need_state_fixtures():
    empty = ONM.need_state({})
    assert all(v == "open" for v in empty.values())
    assert set(empty) == set(ONM.POSITIONS)

    s = ONM.need_state({"RB": 1, "TE": 1, "QB": 0})
    assert s["RB"] == "open"      # 1 of 2 dedicated slots
    assert s["TE"] == "filled"    # 1 of 1
    assert s["QB"] == "open"
    assert s["K"] == "open"

    s2 = ONM.need_state({"RB": 2, "WR": 3, "QB": 1, "TE": 1, "K": 1, "DEF": 1})
    assert all(v == "filled" for v in s2.values())


def test_cond_floor_is_the_work_orders_rule():
    # "never invent a conditional from n<5" — the constant is that rule.
    assert ONM.COND_FLOOR == 5


# ── shared fixture: a two-owner league whose star owner FLIPS behavior ──────
# Owner A drafts 25 RBs then 25 QBs in 2023, and 25 QBs then 25 RBs in 2024.
# Owner B drafts the same 50 WRs in the same order both years. So a tendency
# fitted on 2023 is WRONG about A's 2024 opening — and a tendency that has
# seen 2024 is right about it, which is exactly what the fail-arm must detect.

def _flip_history():
    # 51 rounds x 2 owners = 102 picks: build_rows takes only a >100-pick
    # draft as the season's main draft, the same shape the real data has
    a_2023 = [f"R{i}" for i in range(25)] + [f"Q{i}" for i in range(26)]
    a_2024 = [f"Q{i}" for i in range(26)] + [f"R{i}" for i in range(25)]
    b_seq = [f"W{i}" for i in range(51)]

    def season(year, a_seq):
        picks = []
        for i in range(51):
            rnd = i + 1
            picks.append({"round": rnd, "pick_no": 2 * i + 1, "roster_id": 1,
                          "player_id": a_seq[i], "is_keeper": False})
            picks.append({"round": rnd, "pick_no": 2 * i + 2, "roster_id": 2,
                          "player_id": b_seq[i], "is_keeper": False})
        return {"season": year,
                "owners": {"1": {"display_name": "flipper"},
                           "2": {"display_name": "steady"}},
                "drafts": [{"picks": picks}]}
    return {"seasons": [season("2023", a_2023), season("2024", a_2024)]}


def _flip_positions():
    pos = {}
    for i in range(25):
        pos[f"R{i}"] = "RB"
    for i in range(26):
        pos[f"Q{i}"] = "QB"
    for i in range(51):
        pos[f"W{i}"] = "WR"
    return pos


def _flip_rows():
    rows, unresolved = DB.build_rows(_flip_history(), _flip_positions())
    assert not unresolved
    return rows


# ── 2. the as-of rule ───────────────────────────────────────────────────────

def test_as_of_rule_counts_only_prior_seasons():
    rows = _flip_rows()
    t24 = ONM.build_tendencies(rows, "2024")
    assert t24["seasons_used"] == ["2023"]
    t25 = ONM.build_tendencies(rows, "2025")
    assert t25["seasons_used"] == ["2023", "2024"]

    # deleting the 2024 season entirely must leave the 2024 table IDENTICAL —
    # season Y's own picks contribute nothing to the table that grades Y
    rows_2023_only = [r for r in rows if r["season"] == "2023"]
    assert ONM.build_tendencies(rows_2023_only, "2024") == t24

    # and the 2023-fitted table knows A as an early-RB man (his 2023 truth),
    # not the early-QB man 2024 actually saw
    early = t24["owners"]["flipper"]["early"]
    assert early["RB"]["uncond"]["take"] > 0
    assert early["QB"]["uncond"]["take"] == 0


def test_conditional_floor_and_fallback_chain():
    # hand-built table: conditional cell at n=4 must NOT be used (floor is 5)
    table = {"target": "2025", "seasons_used": ["2023", "2024"],
             "owners": {"o": {"mid": {"_n": 10,
                 "RB": {"uncond": {"take": 6, "n": 10},
                        "open": {"take": 4, "n": 4},        # n<5: refuse
                        "filled": {"take": 2, "n": 6}}}}},
             "league": {"mid": {"_n": 40, "RB": {"take": 10, "n": 40}}}}
    rate, n, src = ONM.tendency_rate(table, "o", "mid", "RB", "open")
    assert src == "owner_unconditioned" and n == 10 and rate == 0.6

    # at n=5 the conditional IS used
    table["owners"]["o"]["mid"]["RB"]["open"] = {"take": 5, "n": 5}
    rate, n, src = ONM.tendency_rate(table, "o", "mid", "RB", "open")
    assert src == "owner_conditional_open" and n == 5 and rate == 1.0

    # unknown owner falls through to the league bucket rate, n stated
    rate, n, src = ONM.tendency_rate(table, "nobody", "mid", "RB", "filled")
    assert src == "league_bucket" and n == 40 and rate == 0.25


# ── 3. calibration reproduction ─────────────────────────────────────────────

def test_backtest_deterministic_and_calibration_consistent():
    rows = _flip_rows()
    r1 = ONM.backtest(rows, seasons=("2024",), boot=50)
    r2 = ONM.backtest(rows, seasons=("2024",), boot=50)
    assert r1 == r2                      # same rows, same seed -> same numbers

    assert r1["n_gaps"] > 0 and r1["n_obs"] > 0
    for arm in ("base", "need"):
        bands = r1["calibration"][arm]
        assert sum(b["n"] for b in bands) == r1["n_obs"]
        for i, b in enumerate(bands):
            if b["n"]:
                assert i / 10 <= b["mean_pred"] <= (i + 1) / 10 + 1e-9
                assert 0.0 <= b["mean_actual"] <= 1.0
    # pooled Brier reproduces from the per-season blocks
    blk = r1["per_season"]["2024"]
    assert blk["n_obs"] == r1["n_obs"]
    assert abs(blk["brier_base"] - r1["brier_base"]) < 1e-9
    assert abs(blk["brier_need"] - r1["brier_need"]) < 1e-9


def test_committed_artifact_static_shape():
    """Committed-artifact == regeneration lives in draft/data/
    artifact_registry.json (id: opponent_need_2026) per the registry's own
    pattern — NOT as a repo_parity pytest pin (test_gate_selection.py pins
    that marker set closed). What stays here is the always-true static shape:
    the claims a consumer of the artifact would read first."""
    art_path = ROOT / "draft" / "data" / "opponent_need_2026.json"
    if not art_path.exists():
        pytest.skip("no artifact committed (null verdict) — nothing to check")
    art = json.loads(art_path.read_text())
    cd = art["calibration_delta"]
    # the artifact is only ever written on an improvement verdict, and the
    # verdict must be consistent with its own numbers and rule
    assert cd["improved"] is True
    assert cd["delta_brier_need_minus_base"] < 0
    assert cd["delta_ci95"]["hi"] < 0
    assert cd["delta_ci95"]["clustered_by"] == "gap"
    # n everywhere: every tendency cell in the 2026 count table carries take<=n
    for owner, buckets in art["owner_tendency_counts_2026"].items():
        for bucket, cells in buckets.items():
            for pos, cell in cells.items():
                if pos == "_n":
                    continue
                for tier in ("uncond", "open", "filled"):
                    assert 0 <= cell[tier]["take"] <= cell[tier]["n"]
    assert art["cond_floor"] == ONM.COND_FLOOR
    # every seat labels its keeper provenance — predicted is never a fact
    for name, o in art["opponents"].items():
        assert o["keeper_provenance"].startswith(("confirmed", "PREDICTED"))
        assert set(o["need_state_at_draft_open"]) == set(ONM.POSITIONS)

    reg = json.loads((ROOT / "draft" / "data" / "artifact_registry.json").read_text())
    assert any(e["id"] == "opponent_need_2026" for e in reg["entries"]), (
        "the artifact must be registered for freshness checking — the "
        "registry, not a repo_parity pin, is where regeneration parity lives")


# ── 4. the fail-arm: a planted future-info tendency is DETECTED ─────────────

def test_fail_arm_refuses_planted_future_tendency():
    rows = _flip_rows()
    planted = ONM.build_tendencies(rows, "2025")   # seasons_used includes 2024
    with pytest.raises(ONM.FutureInfoTendency):
        ONM.backtest(rows, seasons=("2024",), tendencies_for={"2024": planted},
                     boot=50)


def test_fail_arm_leak_moves_the_metric():
    """Sensitivity: when the leak is EXPLICITLY let through (allow_leak, the
    labeled diagnostic), the planted table scores strictly better on the very
    picks it has seen — the improvement a leak fabricates is visible, which is
    what makes the guard worth having."""
    rows = _flip_rows()
    honest = ONM.backtest(rows, seasons=("2024",), boot=50)
    planted = ONM.build_tendencies(rows, "2025")
    leak = ONM.backtest(rows, seasons=("2024",), tendencies_for={"2024": planted},
                        allow_leak=True, boot=50)
    assert leak["leak_arm"] is True and honest["leak_arm"] is False
    assert leak["brier_need"] < honest["brier_need"], (
        f"leak {leak['brier_need']} should beat honest {honest['brier_need']} "
        "on a behavior-flip fixture; if it does not, the backtest cannot "
        "detect future information and no verdict from it is trustworthy")


# ── the no-retype pin: mirrored engine constants match survival.js ──────────

def test_engine_mirror_matches_survival_js():
    src = (ROOT / "public" / "js" / "draft" / "survival.js").read_text()

    def cfg(name):
        m = re.search(rf"{name}:\s*([0-9.]+)", src)
        assert m, f"survival.js CFG.{name} not found"
        return float(m.group(1))

    assert ONM.ADP_SD_FLOOR == cfg("ADP_SD_FLOOR")
    assert ONM.ADP_SD_RATE == cfg("ADP_SD_RATE")
    assert ONM.ADP_SD_CAP == cfg("ADP_SD_CAP")
    assert ONM.DRIFT_MIN_PICKS == cfg("DRIFT_MIN_PICKS")
    assert ONM.DRIFT_DAMPING == cfg("DRIFT_DAMPING")
    assert ONM.DRIFT_MAX_OFFSET == cfg("DRIFT_MAX_OFFSET")
    assert ONM.DRIFT_MAX_SD_SCALE == cfg("DRIFT_MAX_SD_SCALE")
    assert ONM.DRIFT_EXPECTED_MAD == cfg("DRIFT_EXPECTED_MAD")
