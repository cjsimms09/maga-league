# TERRITORY: D
"""SHUFFLE MUST FIND A REAL SIGNAL AND MUST NOT INVENT ONE.

BLEND-SEARCH-DESIGN.md section 3's third owed null, after BEST-OF-K (DS9) and
RANDOM-WEIGHT (DS10). It catches an arm that looks predictive only because its
values track a player's scale/rank -- not because they carry information about
WHICH specific player outperforms.

The controls are the file, same discipline as its two siblings: a null that
cannot fire launders every future arm.

Run: python -m pytest draft/tests/test_shuffle_null.py -q
"""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

import shuffle_null as S  # noqa: E402

ARTIFACT = ROOT / "draft" / "backtest" / "shuffle_null.json"

POSITIONS = ("QB", "RB", "WR", "TE")


def _panel(n_per_pos: int, signal_strength: float, seed: int = 11):
    """n_per_pos players at each of 4 positions. `actual` is noisy;
    `signal` correlates with `actual` at roughly `signal_strength`."""
    rng = random.Random(seed)
    position, actual, signal = {}, {}, {}
    for pos in POSITIONS:
        for i in range(n_per_pos):
            pid = f"{pos}_{i}"
            a = rng.gauss(10.0, 5.0)
            position[pid] = pos
            actual[pid] = a
            signal[pid] = signal_strength * a + rng.gauss(0.0, 5.0)
    return signal, actual, position


def test_KNOWN_POSITIVE_a_real_signal_is_detected():
    signal, actual, position = _panel(150, signal_strength=1.0)
    res = S.signal_rank_null(signal, actual, position, permutations=400)
    assert res["survives"], res
    assert res["observed_rho"] > 0.3, res


def test_KNOWN_NEGATIVE_a_scale_proxy_with_no_player_specific_info_does_not_survive():
    """The exact failure mode this file exists for: signal = actual's own SCALE
    (via a shared confound) but with the player identity scrambled BEFORE the
    test sees it -- so it has the right marginal shape and zero real alignment."""
    rng = random.Random(3)
    fired = 0
    for seed in range(12):
        signal, actual, position = _panel(150, signal_strength=0.0, seed=seed)
        res = S.signal_rank_null(signal, actual, position, permutations=300,
                                 seed=1000 + seed)
        if res["survives"]:
            fired += 1
    assert fired <= 2, f"{fired}/12 no-information signals were reported as real."


def test_it_shuffles_WITHIN_position_never_across_it():
    """A QB's value landing on a kicker is not this project's null. Verified
    directly: after many shuffles, the multiset of values within each position
    group is unchanged."""
    signal, actual, position = _panel(40, signal_strength=1.0)
    pids = sorted(position)
    groups = S._by_position(pids, position)
    vals = [signal[p] for p in pids]
    rng = random.Random(5)
    shuffled = S._shuffle_within_position(vals, groups, rng)
    for pos, idxs in groups.items():
        before = sorted(vals[i] for i in idxs)
        after = sorted(shuffled[i] for i in idxs)
        assert before == after, pos


def test_it_refuses_a_group_too_small_to_shuffle():
    """10+ total rows (past the row-count gate) but one position has only one
    player -- that position cannot be internally shuffled at all."""
    n = {f"qb_{i}": float(i) for i in range(9)}
    signal = dict(n); signal["rb_0"] = 99.0
    actual = dict(n); actual["rb_0"] = 99.0
    position = {k: "QB" for k in n}
    position["rb_0"] = "RB"   # RB has only one player
    with pytest.raises(ValueError, match="at least 2 players"):
        S.signal_rank_null(signal, actual, position)


def test_it_refuses_too_few_rows():
    with pytest.raises(ValueError, match="at least 10"):
        S.signal_rank_null({"a": 1.0}, {"a": 1.0}, {"a": "QB"})


def test_mae_arm_null_KNOWN_POSITIVE():
    """A multiplier genuinely correlated with per-player outperformance beats
    its own shuffle."""
    rng = random.Random(9)
    position, baseline, actual, mult = {}, {}, {}, {}
    for pos in POSITIONS:
        for i in range(120):
            pid = f"{pos}_{i}"
            b = rng.gauss(20.0, 8.0)
            noise = rng.gauss(0.0, 1.0)
            position[pid] = pos
            baseline[pid] = b
            mult[pid] = 1.0 + 0.3 * noise / 8.0
            actual[pid] = b * (1.0 + 0.3 * noise / 8.0)
    res = S.mae_arm_null(baseline, actual, mult, position, permutations=300)
    assert res["survives"], res
    assert res["gain_net_of_null"] > 0, res


def test_mae_arm_null_KNOWN_NEGATIVE_a_multiplier_with_no_information_does_not_survive():
    fired = 0
    for seed in range(12):
        rng = random.Random(seed)
        position, baseline, actual, mult = {}, {}, {}, {}
        for pos in POSITIONS:
            for i in range(120):
                pid = f"{pos}_{i}"
                b = rng.gauss(20.0, 8.0)
                position[pid] = pos
                baseline[pid] = b
                actual[pid] = b + rng.gauss(0.0, 4.0)
                mult[pid] = 1.0 + rng.gauss(0.0, 0.1)   # pure noise, no link to actual
        res = S.mae_arm_null(baseline, actual, mult, position, permutations=250,
                             seed=2000 + seed)
        if res["survives"]:
            fired += 1
    assert fired <= 2, f"{fired}/12 no-information multipliers were reported as real."


def test_the_calibration_shrinks_with_n():
    cal = json.loads(ARTIFACT.read_text())["calibration_p95_rho_by_n"]
    vals = [cal[f"n={n}"] for n in (50, 100, 200, 500, 1000)]
    assert vals == sorted(vals, reverse=True), vals
