# TERRITORY: relay
"""THE WEEK-1 EMISSION, PRICED OFF THE REAL COMMITTED BOARD.

WHY THIS EXISTS (Rule 3e — a probe that has never returned a positive has not
been tested, only run). `test_weekly_own_projection.py` is 36 tests deep and
excellent on the arithmetic, but EVERY one of its end-to-end tests prices a
2-3 player synthetic fixture written by `_write_fixtures(tmp_path)`. The real
board is 883 players with real team codes, real odds and real names.

Measured 2026-09-05, five days before kickoff: the scheduled emission had run
four times and "succeeded" four times, and `own_weekly_2026_w1.json` did not
exist — every firing was a preseason clean skip. The commit that says "Own
weekly projection 2026-09-03" touched only the second-opinion file. So the
snapshot-writing path, on the real board, had NEVER produced a positive. It
does: 516 players, Allen 23.0 / Gibbs 20.1 / St. Brown 16.8 / Bowers 11.5.
This test is that proof made durable, so a board change that breaks the
emission is caught here rather than at 20:00Z on a Wednesday in September.

WHAT IT ASSERTS, and deliberately what it does not: shape and plausibility,
never a specific player. The board rebuilds nightly, so "Josh Allen is QB1"
would be a test of today's news. Bands are set from the measured run with real
headroom — but not so wide that nothing can fail, which is the threshold
mistake `top1_concentration.py` names.

NEVER WRITES INTO THE REPO. `OWN_WEEKLY_OUT_DIR` points at tmp_path — register
489 is the standing lesson that a suite run which rewrites a committed
artifact gets that artifact swept into the next commit.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MODULE = ROOT / "draft" / "weekly_own_projection.py"
BOARD = ROOT / "public" / "draft_data.json"
CONTROLS = ROOT / "draft" / "data" / "weekly_own" / "controls.json"

#: The four the formula prices. K/DEF are absent from `proj_ownmodel` upstream
#: — a coverage fact with an owner (projection_coverage_census.py), not a bug,
#: and the lineup tool prices them from proj_mean instead.
PRICED_POSITIONS = {"QB", "RB", "WR", "TE"}

#: Plausibility bands for one week of this league's scoring. Measured week 1:
#: QB 22.98 · RB 20.08 · WR 16.84 · TE 11.52. A position leader outside these
#: means the board, the odds join or the scoring changed under us.
LEADER_BAND = {"QB": (12.0, 45.0), "RB": (10.0, 40.0), "WR": (9.0, 35.0), "TE": (5.0, 25.0)}
MIN_PRICED_PER_POSITION = {"QB": 40, "RB": 60, "WR": 100, "TE": 55}


@pytest.fixture(scope="module")
def snapshot(tmp_path_factory):
    """Price week 1 off the REAL board, into a throwaway directory."""
    if not BOARD.exists():
        pytest.skip(f"the committed board is absent: {BOARD}")
    out = tmp_path_factory.mktemp("own_weekly_real")
    env = {**os.environ, "OWN_WEEKLY_OUT_DIR": str(out)}
    r = subprocess.run([sys.executable, str(MODULE), "--week", "1"],
                       cwd=ROOT, env=env, capture_output=True, text=True)
    assert r.returncode == 0, f"the real-board emission FAILED:\n{r.stdout}\n{r.stderr}"
    written = out / "own_weekly_2026_w1.json"
    assert written.exists(), f"exit 0 but no snapshot written. stdout:\n{r.stdout}"
    return json.loads(written.read_text())


def test_the_real_board_prices_a_full_week_not_a_handful(snapshot):
    """The known positive: the real board yields a real slate, not a fixture."""
    pr = snapshot["projections"]
    assert len(pr) >= 400, f"only {len(pr)} players priced off the real board"
    assert snapshot["week"] == 1 and snapshot["season"] == 2026


def test_every_priced_position_is_present_and_deep(snapshot):
    """A position silently dropping out is the failure a fixture cannot show."""
    counts = {}
    for row in snapshot["projections"].values():
        counts[row["pos"]] = counts.get(row["pos"], 0) + 1
    assert set(counts) == PRICED_POSITIONS, f"positions priced: {sorted(counts)}"
    for pos, floor in MIN_PRICED_PER_POSITION.items():
        assert counts[pos] >= floor, f"{pos}: only {counts[pos]} priced (want >={floor})"


def test_each_position_leader_is_football_shaped(snapshot):
    """Catches a broken odds join or a scoring change: the numbers stay sane."""
    best = {}
    for pid, row in snapshot["projections"].items():
        pos, mean = row["pos"], row["mean"]
        if pos not in best or mean > best[pos][0]:
            best[pos] = (mean, snapshot["names"].get(pid, pid))
    for pos, (lo, hi) in LEADER_BAND.items():
        mean, who = best[pos]
        assert lo <= mean <= hi, f"{pos} leader {who} at {mean}, outside [{lo}, {hi}]"


def test_no_projection_is_negative_or_non_finite(snapshot):
    import math
    bad = [(pid, r["mean"]) for pid, r in snapshot["projections"].items()
           if not isinstance(r["mean"], (int, float))
           or not math.isfinite(r["mean"]) or r["mean"] < 0]
    assert not bad, f"non-finite or negative projections: {bad[:5]}"


def test_the_shipped_champion_arm_is_the_one_controls_json_names(snapshot):
    """The kill switch is only a kill switch if the snapshot honors it."""
    declared = json.loads(CONTROLS.read_text()).get("champion_override")
    if not declared:
        pytest.skip("no champion_override set — nothing to enforce")
    assert snapshot["diagnostics"]["champion_arm"] == declared
    assert declared in snapshot["diagnostics"]["formula"]


def test_the_real_board_run_is_deterministic(tmp_path):
    """Two runs, same bytes. A snapshot that moves without an input moving
    cannot be a forward guarantee."""
    if not BOARD.exists():
        pytest.skip("the committed board is absent")
    outs = []
    for i in range(2):
        d = tmp_path / f"run{i}"
        env = {**os.environ, "OWN_WEEKLY_OUT_DIR": str(d)}
        r = subprocess.run([sys.executable, str(MODULE), "--week", "1"],
                           cwd=ROOT, env=env, capture_output=True, text=True)
        assert r.returncode == 0, r.stderr
        outs.append((d / "own_weekly_2026_w1.json").read_bytes())
    assert outs[0] == outs[1], "the real-board emission is not byte-for-byte deterministic"


def test_CONTROL_the_bands_can_actually_fail(snapshot):
    """A gate nothing can fail is not a gate (top1_concentration.py's lesson).
    Assert the measured leaders sit INSIDE their bands with the band's edges
    close enough to bite: a band 10x the observed value proves nothing."""
    best = {}
    for row in snapshot["projections"].values():
        best[row["pos"]] = max(best.get(row["pos"], 0), row["mean"])
    for pos, (lo, hi) in LEADER_BAND.items():
        assert hi < best[pos] * 4, f"{pos} upper band {hi} is too loose against {best[pos]}"
        assert lo > best[pos] / 4, f"{pos} lower band {lo} is too loose against {best[pos]}"
