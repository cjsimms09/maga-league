# TERRITORY: A
"""CONDITIONAL VALUE (stacks + handcuffs) — the measuring arm's tests.

Every pure function against synthetic rows recomputed by hand; the
missing-vs-zero rule (a player with no history yields None, never 0); the
store-facing paths against the COMMITTED component stores (no network); and
the committed artifact's internal consistency — its premiums must reproduce
from its own inputs, and it must remain GATED (no board/composite/consensus
path imports it).
"""
import json
import math
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
BT = HERE.parent / "backtest"
sys.path.insert(0, str(BT))
sys.path.insert(0, str(HERE.parent))

import conditional_value as CV  # noqa: E402

ARTIFACT = HERE.parent / "data" / "conditional_value_2026.json"


# ── pearson: recomputed by hand on synthetic rows ────────────────────────────

def test_pearson_hand_recomputed():
    xs = [1.0, 2.0, 3.0, 4.0]
    ys = [2.0, 4.0, 5.0, 9.0]
    # by hand: mx=2.5 my=5, sxy=11, sxx=5, syy=26 -> r = 11/sqrt(130)
    assert CV.pearson(xs, ys) == pytest.approx(11 / math.sqrt(130))


def test_pearson_perfect_and_inverse():
    assert CV.pearson([1, 2, 3], [2, 4, 6]) == pytest.approx(1.0)
    assert CV.pearson([1, 2, 3], [6, 4, 2]) == pytest.approx(-1.0)


def test_pearson_absent_not_zero():
    assert CV.pearson([1, 2], [3, 4]) is None          # n < 3
    assert CV.pearson([5, 5, 5], [1, 2, 3]) is None    # constant series
    assert CV.pearson([1, 2, 3], [1, 2]) is None       # length mismatch


# ── mean_sd ──────────────────────────────────────────────────────────────────

def test_mean_sd_hand():
    m, s = CV.mean_sd([2.0, 4.0, 6.0])
    assert m == pytest.approx(4.0)
    assert s == pytest.approx(2.0)      # sample sd, n-1


def test_mean_sd_absent_not_zero():
    assert CV.mean_sd([]) == (None, None)
    m, s = CV.mean_sd([7.0])
    assert m == pytest.approx(7.0)
    assert s is None                     # one row has no spread — absent


# ── fisher pooling ───────────────────────────────────────────────────────────

def test_fisher_pool_single_pair_returns_its_r():
    r, n_pairs, n_weeks = CV.fisher_pool([(0.5, 16)])
    assert r == pytest.approx(0.5, abs=1e-9)
    assert (n_pairs, n_weeks) == (1, 16)


def test_fisher_pool_identical_rs_pool_to_the_same_r():
    r, n_pairs, n_weeks = CV.fisher_pool([(0.4, 10), (0.4, 17), (0.4, 8)])
    assert r == pytest.approx(0.4, abs=1e-9)
    assert (n_pairs, n_weeks) == (3, 35)


def test_fisher_pool_weights_by_n_minus_3():
    # by hand: z(.8)=1.0986, z(0)=0. weights 17-3=14 and 5-3=2.
    # pooled z = (1.0986*14 + 0)/16 -> r = tanh(0.96128) = 0.74486...
    r, _, _ = CV.fisher_pool([(0.8, 17), (0.0, 5)])
    expected = math.tanh(math.atanh(0.8) * 14 / 16)
    assert r == pytest.approx(expected, abs=1e-9)


def test_fisher_pool_absent_not_zero():
    assert CV.fisher_pool([]) == (None, 0, 0)
    assert CV.fisher_pool([(None, 16), (0.5, 3)]) == (None, 0, 0)


def test_fisher_pool_survives_r_of_exactly_one():
    r, _, _ = CV.fisher_pool([(1.0, 10)])
    assert r is not None and 0.999 < r <= 1.0


# ── covariance increment ─────────────────────────────────────────────────────

def test_covariance_increment_hand():
    # 2 * 0.5194 * 10.83 * 10.87 = 122.29 (the Burrow-Chase legs)
    dv = CV.covariance_increment([(0.5194, 10.83, 10.87)])
    assert dv == pytest.approx(2 * 0.5194 * 10.83 * 10.87)


def test_covariance_increment_sums_legs():
    dv = CV.covariance_increment([(0.5, 10, 10), (-0.2, 8, 10)])
    assert dv == pytest.approx(100.0 - 32.0)


def test_covariance_increment_absent_not_zero():
    assert CV.covariance_increment([(None, 10, 10)]) is None
    assert CV.covariance_increment([(0.5, None, 10)]) is None


# ── handcuff premium arithmetic ──────────────────────────────────────────────

def test_handcuff_premium_hand():
    # 0.95 expected missed starts x (12.5 elevated - 7.8 wire) = 4.465
    assert CV.handcuff_premium(0.95, 12.5, 7.8) == pytest.approx(4.465)


def test_handcuff_premium_never_negative():
    # an elevated backup below replacement is worth 0 extra, not negative
    assert CV.handcuff_premium(2.0, 5.0, 7.8) == 0.0


def test_handcuff_premium_absent_not_zero():
    assert CV.handcuff_premium(None, 12.5, 7.8) is None
    assert CV.handcuff_premium(0.95, None, 7.8) is None
    assert CV.handcuff_premium(0.95, 12.5, None) is None


# ── synthetic store rows: the joins recomputed by hand ───────────────────────

@pytest.fixture()
def synth():
    """A tiny two-team world: QB q1 + WR w1/w2 + TE t1 on AAA; RB r1 with
    backup r2 on BBB. r1 misses weeks 3-4 (team plays, he has no row)."""
    week_rows = {
        "q1": {w: {"pos": "QB", "team": "AAA", "pass_att": 30}
               for w in range(1, 11)},
        "w1": {w: {"pos": "WR", "team": "AAA"} for w in range(1, 11)},
        "w2": {w: {"pos": "WR", "team": "AAA"} for w in range(1, 11)},
        "t1": {w: {"pos": "TE", "team": "AAA"} for w in range(1, 11)},
        "r1": {w: {"pos": "RB", "team": "BBB"}
               for w in range(1, 11) if w not in (3, 4)},
        "r2": {w: {"pos": "RB", "team": "BBB"} for w in range(1, 11)},
    }
    points = {
        "q1": {w: 20.0 + w for w in range(1, 11)},
        "w1": {w: 10.0 + 2 * w for w in range(1, 11)},      # r=+1 with q1
        "w2": {w: 30.0 - w for w in range(1, 11)},          # r=-1 with q1
        "t1": {w: 8.0 for w in range(1, 11)},               # constant
        "r1": {w: 15.0 for w in range(1, 11) if w not in (3, 4)},
        "r2": {1: 4.0, 2: 5.0, 3: 14.0, 4: 18.0, 5: 4.0, 6: 5.0,
               7: 4.0, 8: 5.0, 9: 4.0, 10: 5.0},
    }
    return week_rows, points


def test_team_game_weeks_from_rows(synth):
    week_rows, _ = synth
    tg = CV.team_game_weeks(week_rows)
    assert tg["AAA"] == set(range(1, 11))
    assert tg["BBB"] == set(range(1, 11))   # r2's rows keep BBB alive wks 3-4


def test_primary_qb_by_attempts(synth):
    week_rows, _ = synth
    assert CV.primary_qb(week_rows, "AAA") == "q1"
    assert CV.primary_qb(week_rows, "BBB") is None   # no QB — absent, not zero


def test_ranked_catchers_by_scored_points(synth):
    week_rows, points = synth
    # w2 outscores w1 (255 vs 165 over 10 weeks) -> WR1=w2, WR2=w1
    assert CV.ranked_catchers(week_rows, points, "AAA", "WR") == ["w2", "w1"]
    assert CV.ranked_catchers(week_rows, points, "AAA", "TE") == ["t1"]


def test_pair_series_alignment_and_correlation_by_construction(synth):
    week_rows, points = synth
    xs, ys = CV.pair_series(week_rows, points, "AAA", "q1", "w1")
    assert len(xs) == 10
    assert CV.pearson(xs, ys) == pytest.approx(1.0)   # built to correlate +1
    xs, ys = CV.pair_series(week_rows, points, "AAA", "q1", "w2")
    assert CV.pearson(xs, ys) == pytest.approx(-1.0)  # built to correlate -1


def test_pair_series_skips_weeks_either_side_missing(synth):
    week_rows, points = synth
    xs, ys = CV.pair_series(week_rows, points, "BBB", "r1", "r2")
    assert len(xs) == 8                                # r1's missed weeks drop


def test_starter_missed_weeks_team_played_starter_absent(synth):
    week_rows, _ = synth
    missed, played, tg = CV.starter_missed_weeks(week_rows, "BBB", "r1")
    assert missed == [3, 4]
    assert played == [1, 2, 5, 6, 7, 8, 9, 10]
    assert tg == list(range(1, 11))


def test_next_at_position_finds_the_backup(synth):
    week_rows, points = synth
    assert CV._next_at_position(week_rows, points, "BBB", "RB", "r1") == "r2"
    assert CV._next_at_position(week_rows, points, "AAA", "RB", "r1") is None


def test_elevated_weeks_are_exactly_the_starter_absent_weeks(synth):
    week_rows, points = synth
    missed, _, _ = CV.starter_missed_weeks(week_rows, "BBB", "r1")
    bk = CV.player_team_weeks(week_rows, "r2", "BBB")
    elevated = [points["r2"][w] for w in missed if w in bk]
    # by construction r2 scores 14 and 18 in exactly his elevated weeks
    assert elevated == [14.0, 18.0]


# ── store-facing paths against the COMMITTED stores ──────────────────────────

def test_burrow_chase_2024_correlation_matches_hand_recompute():
    week_rows, points = CV.season_data(2024)
    xs, ys = CV.pair_series(week_rows, points, "CIN", "6770", "7564")
    assert len(xs) == 16
    assert CV.pearson(xs, ys) == pytest.approx(0.564, abs=0.001)


def test_named_pair_history_absent_pair_is_none():
    # two ids that never shared a team (a QB and a different team's WR)
    assert CV.named_pair_history("zzz_nobody", "7564", seasons=(2024,)) is None


def test_named_backup_history_absent_is_none_not_zero():
    assert CV.named_backup_elevated_history("zzz_nobody", "3198",
                                            seasons=(2024,)) is None


def test_stack_classes_have_n_stated_and_sane_ranges():
    classes = CV.stack_correlation_classes(seasons=(2024,))
    for cls in ("QB-WR1", "QB-TE1", "WR1-WR2"):
        assert cls in classes
        row = classes[cls]
        assert row["n_pairs"] > 10          # a class, not an anecdote
        assert row["n_weeks"] >= row["n_pairs"] * CV.MIN_PAIR_WEEKS
        assert -1.0 <= row["r_pooled"] <= 1.0


def test_qb_wr1_correlation_is_positive_where_wr1_wr2_is_not():
    classes = CV.stack_correlation_classes(seasons=(2024,))
    assert classes["QB-WR1"]["r_pooled"] > 0.2      # the stack is real
    assert abs(classes["WR1-WR2"]["r_pooled"]) < 0.2  # the WR pair is not


# ── the committed artifact: territory, self-consistency, gating ──────────────

@pytest.fixture(scope="module")
def artifact():
    return json.loads(ARTIFACT.read_text())


def test_artifact_territory_first_and_gated(artifact):
    assert next(iter(artifact)) == "_territory"
    assert "conditional_value.py" in artifact["_territory"]
    assert "gated" in artifact["_territory"].lower()


def test_artifact_stack_dollars_reproduce_from_own_inputs(artifact):
    for st in artifact["stacks_for_cory"]:
        if st.get("sim_pair_rho") is None:
            continue
        want = round(st["sim_pair_rho"]["dHigh"] * 100
                     * st["co_active_weeks_15"], 2)
        # co_active_weeks_15 is stored rounded to 0.1 — reproduce within that
        assert st["premium_dollars_season"] == pytest.approx(want, abs=0.02)
        want_pts = round(st["sim_pair_rho"]["pointEquivalentWeekly"]
                         * st["co_active_weeks_15"], 1)
        assert st["composite_pts_equiv_season"] == pytest.approx(want_pts,
                                                                 abs=0.1)


def test_artifact_bust_tail_is_reported_not_netted(artifact):
    for st in artifact["stacks_for_cory"]:
        if st.get("sim_pair_rho") is None:
            continue
        assert "bust_tail" in st
        assert st["bust_tail"]["dLow"] == st["sim_pair_rho"]["dLow"]


def test_artifact_handcuff_premiums_reproduce(artifact):
    wire_rb = artifact["replacement"]["wire_per_week"]["RB"]
    for entry in artifact["handcuffs_for_cory"]:
        cls_missed = entry["starter"]["class_availability"][
            "expected_missed_starts_15wk"]
        for b in entry["backups"]:
            want = CV.handcuff_premium(cls_missed, b["class_elevated_ppw"],
                                       wire_rb)
            assert b["premium_pts_to_cory"] == pytest.approx(want, abs=0.05)
            # the field's premium can never exceed the owner's — the
            # asymmetry IS the finding
            assert b["premium_pts_to_field"] <= b["premium_pts_to_cory"]


def test_artifact_every_correlation_block_carries_n(artifact):
    for cls, row in artifact["stack_correlation_classes"].items():
        assert row["n_pairs"] > 0 and row["n_weeks"] > 0, cls
    for st in artifact["stacks_for_cory"]:
        if st.get("history"):
            assert st["history"]["n_weeks"] > 0
            for ps in st["history"]["per_season"]:
                assert "n_weeks" in ps


def test_gated_by_construction_nothing_on_the_board_reads_this():
    """The layer ships OFF: no build/board/composite/consensus/recommendation
    path may import or read the conditional-value module or artifact."""
    roots = [HERE.parent / "build.py", HERE.parent / "adp.py",
             HERE.parent / "vorp.py", HERE.parent / "projections.py",
             HERE.parent / "own_projections.py"]
    src = HERE.parent.parent / "src"
    roots.extend(src.rglob("*.js"))
    for f in roots:
        if not f.exists():
            continue
        text = f.read_text(errors="replace")
        assert "conditional_value" not in text, (
            f"{f} references conditional_value — the layer is gated OFF "
            "until Cory rules on wiring it in")
