# TERRITORY: C
"""THE BOARD'S OPPORTUNITY PRIOR RESTS ON THE SEASONS IT IS SUPPOSED TO.

`build.py` asks for pbp seasons `[year-1, year-2]` and records only the resulting
ROW COUNT. Which seasons came back is not written anywhere — and this is not a
theoretical gap: `import_weekly_data` 404s for 2025 in this environment, so a
neighbouring nfl_data_py call has demonstrably failed for one of the seasons the
priors need. A prior that quietly falls back a year still prints as a current
number in every surface that shows it.

Season row counts are large and distinct, so a sum identifies its season set.
`identify` does that against a published census; `audit` compares the answer to
what the board's own league year implies.

THE INTERESTING TESTS HERE ARE THE ONES WHERE IT REFUSES TO ANSWER. A checker
that always produces a season list is worse than none, because "unmatched" and
"ambiguous" both read as an answer when printed. Unknown must not be a pass, so
`ok` stays None rather than becoming True.

Run: python3 -m pytest draft/tests/test_nflverse_pbp_census.py -q
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import nflverse_pbp_census as C  # noqa: E402

BOARD = ROOT / "public" / "draft_data.json"

#: A stand-in census with the same shape and comfortably separated sums, so the
#: logic tests do not depend on what nflverse published this week.
FAKE = {"seasons": {"2022": {"rows": 1000}, "2023": {"rows": 2000},
                    "2024": {"rows": 4000}, "2025": {"rows": 8000}}}


def board():
    if not BOARD.exists():
        pytest.skip("UNCHECKED: %s is not present — this says nothing about the "
                    "seasons the board rests on" % BOARD)
    return json.loads(BOARD.read_text())


# ── the census itself ──────────────────────────────────────────────────────
def test_the_CENSUS_IS_PRESENT_and_the_seasons_are_distinguishable():
    """The whole method rests on season sums being distinct. If two pairs ever
    collided, `identify` would return `ambiguous` and this file would stop being
    able to answer — so the property is asserted rather than assumed."""
    rows = C.season_rows()
    assert len(rows) >= 3, "census covers too few seasons to identify a pair: %s" % rows
    from itertools import combinations
    sums = [sum(rows[y] for y in c) for c in combinations(sorted(rows), 2)]
    assert len(sums) == len(set(sums)), (
        "two season pairs have identical row sums — a count can no longer "
        "identify its seasons: %s" % rows)

    # THE MARGIN IS THIN AND SAYING SO IS THE POINT. Exact matching needs only
    # that the sums differ, and they do. But the closest pair of sums is 58 rows
    # apart, so a season revision of that size could make a count identify the
    # WRONG pair rather than failing to match — the check would then be confident
    # and wrong instead of silent. Recorded here so the number is on the record
    # and moves when nflverse moves, rather than living in a docstring that
    # nobody re-derives. My first version asserted a 100-row margin and was
    # simply mistaken about the data.
    ordered = sorted(sums)
    gap = min(b - a for a, b in zip(ordered, ordered[1:]))
    assert gap > 0, "identical sums: %s" % ordered
    assert gap >= 50, (
        "the closest two season-pair sums are %d rows apart — thin enough that a "
        "routine nflverse revision could re-label which seasons a board used. "
        "Sums: %s" % (gap, ordered))


# ── refusing to answer, which is most of the value ─────────────────────────
def test_AMBIGUOUS_is_not_an_answer():
    """Two sets summing to the same count is a coin flip. Reporting either one as
    the season set would present a guess as a measurement.

    MUTATION: return the first hit — the caller gets a confident wrong answer."""
    census = {"seasons": {"2022": {"rows": 100}, "2023": {"rows": 200},
                          "2024": {"rows": 250}, "2025": {"rows": 150}}}
    got = C.identify(350, census)          # 2022+2024 and 2023+2025 both = 350
    assert got["status"] == "ambiguous", got
    assert got["seasons"] is None
    assert len(got["candidates"]) >= 2, got


def test_UNMATCHED_names_the_nearest_and_says_RE_VERIFY():
    """nflverse revises completed seasons. A census that has gone stale must not
    read as "the board is wrong" — the fix in that case is to re-measure, and the
    message has to say so or the check gets ignored the first time it cries wolf.

    MUTATION: report the nearest pair as the match — a revision of a few hundred
    rows silently re-labels which seasons the board used."""
    got = C.identify(12345, FAKE)
    assert got["status"] == "unmatched", got
    assert got["seasons"] is None
    assert got["nearest"] and len(got["nearest"][0]) == 2
    assert "RE-VERIFY" in got["note"]


def test_NO_CENSUS_is_unmeasured_rather_than_clean():
    """The empty-input case, and it has bitten this project repeatedly: a checker
    that returns an empty finding when it could not look reads downstream exactly
    like a checker that looked and found nothing."""
    got = C.identify(98263, {"seasons": {}})
    assert got["status"] == "unmeasured", got
    assert got["seasons"] is None
    got2 = C.identify(None, FAKE)
    assert got2["status"] == "unmeasured", got2


def test_an_UNKNOWN_season_set_does_not_pass_the_audit():
    """`ok` is a three-state answer and the third state is the point. When the
    seasons cannot be identified, `ok` must stay None — not True.

    MUTATION: `ok = seasons == expected`, evaluated unconditionally. With
    `seasons` None that is False, which at least fails; with a truthy default it
    would PASS an audit that identified nothing."""
    b = {"provenance": {"opportunity_detail": {"pbp_rows": 999999}},
         "league": {"year": "2026"}}
    got = C.audit(b, FAKE)
    assert got["status"] == "unmatched"
    assert got["ok"] is None, "unknown is not a pass"


def test_EXACT_matching_admits_no_tolerance():
    """The nearest competing pair for a 2026 board is 58 rows away (2022+2025 =
    98205 against 2024+2025 = 98263). Any tolerance at all starts admitting the
    wrong season set, and 'close enough' is precisely how a stale season would be
    accepted."""
    assert C.EXACT == 0
    rows = C.season_rows()
    if 2024 in rows and 2025 in rows:
        assert C.identify(rows[2024] + rows[2025] + 1)["status"] == "unmatched"


# ── the assertion about the board that shipped ─────────────────────────────
def test_the_AUDIT_CATCHES_a_board_built_on_last_years_seasons():
    """Proved before the real board is asserted clean. This is the failure the
    file exists for: the fetch falls back a season, everything still builds, and
    every surface prints a stale prior as a current number.

    MUTATION: compare only that the seasons were identified, not that they are
    the RIGHT ones — the audit then passes for any board that used any two
    seasons at all."""
    b = {"provenance": {"opportunity_detail": {"rows": 0, "pbp_rows": 3000}},
         "league": {"year": "2026"}}          # 1000+2000 = 2022+2023, a year+ stale
    got = C.audit(b, FAKE)
    assert got["status"] == "matched" and got["seasons"] == [2022, 2023], got
    assert got["expected"] == [2024, 2025]
    assert got["ok"] is False, got
    assert "still prints as a current number" in got["note"]


def test_THE_SHIPPED_BOARD_RESTS_ON_THE_TWO_MOST_RECENT_SEASONS():
    """The real artifact, against the real census.

    2024 + 2025 = 98263 and the board records 98263 — delta zero, with the next
    nearest pair (2022+2025 = 98205) 58 rows away. So the opportunity priors are
    current, and the 2025-shaped failure that hit `import_weekly_data` did not
    hit this path."""
    got = C.audit(board())
    assert got["status"] == "matched", (
        "cannot identify which seasons the board's opportunity prior rests on: "
        "%s" % got)
    assert got["ok"] is True, got
    assert got["seasons"] == [2024, 2025], got
