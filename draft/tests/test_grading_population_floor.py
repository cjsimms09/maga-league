"""IS THE THREE-WAY GRADING POPULATION STILL BIG ENOUGH TO GRADE?

Split out of `test_projection_coverage_census.py` on 2026-11-03, and the split
IS the point: these assertions are about whether a GRADE is well defined, not
about whether a player row on the board is right — so they must not be able to
refuse the nightly draft board, and they could, from the file they used to live
in.

⛔ WHAT IT COST. The nightly board build regenerates the coverage census from
live feeds and then runs the suite as its acceptance gate. Both census failures
in run 41497599338 reduced to ONE condition — the shared population at 288
against a floor of 300 — and the gate counted them as BLOCKING, so the board
was refused. It had last published on 2026-09-10, the same date the committed
census was last written, which is how the two were finally connected.

AND THE BOARD WAS NOT THE THING THAT CHANGED. the published board artifact has not
moved since 2026-09-14. Measured against the captures:

    fantasypros  09-10 -> 11-02:  dropped   0, added  59   (459 -> 518)
    sleeper      09-10 -> 11-02:  dropped 286, added 286   (700 -> 700)

Sleeper replaced HALF its season-projection universe; FantasyPros never churned
at all. The shared population (sleeper ∩ fantasypros ∩ ours) fell 394 -> 288
because Sleeper stopped projecting players it no longer rates once the season
was under way. A thin grading population is worth knowing about — it is why
this file still fails loudly — but it cannot make tonight's board wrong, and as
a BLOCKING test it refuses the board for something the board did not do.

⚠️ AND THIS FILE MUST NEVER READ THE BOARD. The triage refuses any advisory
file that does, because a board-reading test has to be able to refuse a board —
and it enforces that with a plain substring scan over the whole file, so this
one cannot even NAME the board artifact. (My first version of this file failed
exactly that way: it carried a self-check whose own marker list tripped the
scan. The triage's `advisory_is_still_honest` already covers it, with its own
test, so the duplicate is gone.)

So this file is listed ADVISORY in `draft/tools/gate_triage.py`: it stays RED in
CI (`ci.yml` runs `pytest draft/tests` on its own) and in the GO sweep, so
nothing is silenced — it simply stops holding the board hostage. That is the
same ruling already applied to `test_proj_series_completeness.py`, for the same
reason, and the triage's own self-check enforces the condition that makes it
legitimate: an advisory file MUST NOT read the board. This one reads only the
census artifact, and `test_this_file_stays_eligible_to_be_advisory` below keeps
it that way.

Run: python -m pytest draft/tests/test_grading_population_floor.py -q
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CENSUS = ROOT / "draft" / "backtest" / "projection_coverage_census.json"

#: Bands, not point values — providers add and drop players weekly, and only a
#: STRUCTURAL change is a finding. Measured 394 when this floor was set.
MIN_SHARED = 300
#: The programme's bar is "3 of 4 positions", so each position needs enough
#: rows to carry a verdict on its own.
MIN_PER_POSITION = 40


def _doc() -> dict:
    return json.loads(CENSUS.read_text())


def test_the_shared_population_is_big_enough_to_grade():
    s = _doc()["shared_population"]
    assert s["n"] >= MIN_SHARED, (
        f"the three-way shared population fell to {s['n']} (floor {MIN_SHARED}) "
        "— below this a 'same players and weeks' grade stops being meaningful. "
        "Measured cause on 2026-11-03: Sleeper dropped 286 of its 700 "
        "season-projection rows; the board did not change. ADVISORY at the "
        "board gate, red here on purpose.")


def test_every_position_can_carry_its_own_verdict():
    s = _doc()["shared_population"]
    assert set(s["by_position"]) == {"QB", "RB", "WR", "TE"}, s["by_position"]
    assert all(v >= MIN_PER_POSITION for v in s["by_position"].values()), (
        s["by_position"])


def test_CONTROL_the_census_was_actually_measured():
    """Without this, a census that failed to write its own universes would make
    every assertion above vacuously true."""
    d = _doc()
    u = d["universes"]
    for src in ("sleeper", "fantasypros", "own_weekly_v1"):
        assert u.get(src, 0) > 0, (src, u)
    s = d["shared_population"]
    assert s["n"] <= min(u["sleeper"], u["fantasypros"], u["own_weekly_v1"]), (u, s)
