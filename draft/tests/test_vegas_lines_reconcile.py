# TERRITORY: D
"""THE VEGAS LINES STORE — validated against known reality, and a reconciler
waiting on its second copy.

DEFECT REGISTER ROW 16: there are said to be TWO copies of the same quantity —
`vegas_lines_2021_2026.json` (nflverse *schedules*, 6 seasons, 1,426 games,
REG only) and the `spread_line`/`total_line` columns inside the pbp pull
(reported by C as 3 seasons, 854 games, incl. post). Nobody has checked they
agree, and a disagreement would mean one copy feeding something is wrong.

WHY THE DIFF IS NOT RUN HERE: the second copy was never committed. It exists
only inside a live `import_pbp_data()` call, and fetching is C's lane, not D's.
So this file ships the RECONCILER and proves it works — on synthetic fixtures
with seeded disagreements, and on the real 1,426-row store via a
one-row-perturbed control — and the real cross-copy diff runs the moment a
second copy lands at SECOND_COPY. That is the honest split: the machinery is
evidence, the missing input is named rather than papered over.

The nflverse pbp release was probed 2026-08-17 and returns HTTP 200, so this is
NOT a data-availability gap. See ROUTES.md -> TO: C for the exact fetch spec.

WHAT `reconcile` REFUSES TO DO: silently inner-join. Rows present on one side
only are REPORTED as `only_a` / `only_b`, never dropped — that is the failure
mode that turned register row 18's oracle into an unanswerable question, and a
reconciler that committed it would hide exactly the coverage difference we
already expect here (this store is REG-only; the pbp copy includes postseason).

Run: python -m pytest draft/tests/test_vegas_lines_reconcile.py -q
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
STORE = ROOT / "draft" / "backtest" / "vegas_lines_2021_2026.json"
# Where a committed pbp-derived copy would land. Absent today (row 16).
SECOND_COPY = ROOT / "draft" / "backtest" / "vegas_lines_pbp.json"

FIELDS = ("spread_line", "total_line")


def load_store() -> dict:
    return json.loads(STORE.read_text())


def flatten(seasons: dict) -> dict:
    """{(season, week, home, away): {spread_line, total_line}} — the join key
    register row 16 names. Season is a str on both sides by construction."""
    out = {}
    for season, games in seasons.items():
        for g in games:
            out[(str(season), int(g["week"]), g["home"], g["away"])] = {
                f: g.get(f) for f in FIELDS
            }
    return out


def reconcile(a: dict, b: dict) -> dict:
    """Diff two flattened line maps. Reports coverage differences as their own
    buckets rather than dropping them — see the module docstring."""
    ka, kb = set(a), set(b)
    disagreements = []
    for k in sorted(ka & kb):
        for f in FIELDS:
            if a[k][f] != b[k][f]:
                disagreements.append({"key": k, "field": f,
                                      "a": a[k][f], "b": b[k][f]})
    return {
        "matched": len(ka & kb),
        "only_a": sorted(ka - kb),
        "only_b": sorted(kb - ka),
        "disagreements": disagreements,
    }


# ── the reconciler itself, proven on fixtures ───────────────────────────────

_A = {"2024": [{"week": 1, "home": "KC", "away": "BAL",
                "spread_line": 3.0, "total_line": 46.5}]}


def test_identical_copies_reconcile_clean():
    """Plumbing only. This assertion CANNOT fail in an interesting way, and is
    here solely so the controls below have a baseline to differ from."""
    r = reconcile(flatten(_A), flatten(_A))
    assert r == {"matched": 1, "only_a": [], "only_b": [], "disagreements": []}


def test_KNOWN_POSITIVE_a_seeded_disagreement_is_detected():
    """CONTROL — the load-bearing one. A reconciler that reports 'no
    disagreements' is worthless unless it can find one that is really there.
    Half a point of spread is the smallest revision a book actually makes.
    """
    b = {"2024": [dict(_A["2024"][0], spread_line=3.5)]}
    r = reconcile(flatten(_A), flatten(b))
    assert r["matched"] == 1 and not r["only_a"] and not r["only_b"]
    assert len(r["disagreements"]) == 1
    d = r["disagreements"][0]
    assert d["field"] == "spread_line" and d["a"] == 3.0 and d["b"] == 3.5
    assert d["key"] == ("2024", 1, "KC", "BAL")


def test_KNOWN_POSITIVE_coverage_differences_are_reported_not_dropped():
    """CONTROL for the silent-inner-join defect (register row 18's question 2).

    The two copies are KNOWN to differ in coverage: this store is REG-only,
    the pbp copy includes postseason. A reconciler that quietly intersected
    would report a clean diff over a shrunken population and hide precisely
    that. Extra rows on either side must surface by name.
    """
    b = {"2024": [_A["2024"][0],
                  {"week": 19, "home": "KC", "away": "HOU",
                   "spread_line": -1.0, "total_line": 44.0}]}
    r = reconcile(flatten(_A), flatten(b))
    assert r["matched"] == 1
    assert r["only_b"] == [("2024", 19, "KC", "HOU")]
    assert not r["disagreements"], "a coverage gap must not masquerade as a disagreement"


def test_KNOWN_POSITIVE_the_reconciler_works_on_the_REAL_store():
    """CONTROL on real rows, not fixtures. Perturb exactly one committed game
    and require the reconciler to find exactly that one.

    A self-join alone would be true by construction and prove nothing; the
    perturbation is what makes this able to fail, and it exercises real key
    construction over every season rather than a hand-built row.

    The count is a FLOOR, not a pin: the 2026 season legitimately grows as
    nflverse publishes lines (1,426 at first write; 1,471 after the 08-18
    refresh took 2026 from 67 to 112 games). Pinning the exact total made
    correct data growth read as a defect — the stale-pin class A -> all
    lanes flagged on 08-18. The floor still catches the real failures:
    a truncated store or a flatten() that drops seasons."""
    seasons = load_store()["seasons"]
    a = flatten(seasons)
    assert len(a) >= 1426, f"store shrank below the founding count: {len(a)}"
    assert len(a) == sum(len(v) for v in seasons.values()), \
        "flatten() lost or invented games against the store's own count"

    b = dict(a)
    victim = sorted(b)[len(b) // 2]
    b[victim] = dict(b[victim], total_line=b[victim]["total_line"] + 0.5)

    r = reconcile(a, b)
    assert r["matched"] == len(a) and not r["only_a"] and not r["only_b"]
    assert len(r["disagreements"]) == 1
    assert r["disagreements"][0]["key"] == victim
    assert r["disagreements"][0]["field"] == "total_line"


def test_the_cross_copy_diff_row_16_asks_for():
    """The actual row-16 check. SKIPS while the second copy is uncommitted —
    and the skip message is the finding, not an excuse: the pbp release
    returned HTTP 200 on 2026-08-17, so this is a lane boundary (fetching is
    C's), not a data gap. Fetch spec is in ROUTES.md -> TO: C.
    """
    if not SECOND_COPY.exists():
        pytest.skip(
            "register row 16 BLOCKED on its input: no committed pbp-derived copy "
            f"at {SECOND_COPY.relative_to(ROOT)}. The reconciler above is proven; "
            "only the second copy is missing. nflverse pbp probed 2026-08-17 -> "
            "HTTP 200, so this is a lane boundary, not availability."
        )
    b = json.loads(SECOND_COPY.read_text())["seasons"]
    r = reconcile(flatten(load_store()["seasons"]), flatten(b))
    assert not r["disagreements"], (
        f"{len(r['disagreements'])} line disagreements between the schedules store "
        f"and the pbp copy, e.g. {r['disagreements'][:3]}. One copy is wrong; "
        f"whichever feeds a number Cory sees is the urgent one."
    )


# ── the committed store, validated against reality ──────────────────────────

def test_stored_counts_match_the_provenance_block():
    """A store whose own provenance disagrees with its contents has already
    failed; every downstream count would inherit the discrepancy."""
    d = load_store()
    per = d["provenance"]["games_per_season"]
    for season, games in d["seasons"].items():
        assert len(games) == per[season], (
            f"{season}: {len(games)} stored, provenance claims {per[season]}")


def test_every_dropped_game_is_a_2026_fixture_with_no_line_yet():
    """`games_without_lines_dropped: 205` is the store's only unexplained
    number until this is checked. 2026 is mid-fetch (67 of 272 lined), and
    272 - 67 = 205 accounts for ALL of them — so no 2021-25 game was silently
    lost. If this fails, real historical games went missing behind a figure
    that looked like housekeeping.
    """
    d = load_store()
    dropped = d["provenance"]["games_without_lines_dropped"]
    assert 272 - len(d["seasons"]["2026"]) == dropped, (
        f"{dropped} games dropped but 2026 only accounts for "
        f"{272 - len(d['seasons']['2026'])} — the remainder is unexplained loss")


def test_no_duplicate_fixtures_and_no_team_plays_twice_in_a_week():
    """Both CAN fail, unlike the constant-within-game check that prompted this
    row. A duplicated fixture double-counts a game in any season aggregate; a
    team appearing twice in one week means the key is wrong."""
    for season, games in load_store()["seasons"].items():
        keys = [(g["week"], g["home"], g["away"]) for g in games]
        assert len(keys) == len(set(keys)), f"{season}: duplicate fixtures"
        per_week: dict[int, list[str]] = {}
        for g in games:
            per_week.setdefault(g["week"], []).extend([g["home"], g["away"]])
        for week, teams in per_week.items():
            assert len(teams) == len(set(teams)), (
                f"{season} week {week}: a team appears twice")


def test_the_store_is_regular_season_only_as_its_note_claims():
    """The REG-only property is load-bearing: it is half of why the pbp copy
    (which includes postseason) is expected to differ in COVERAGE, and a
    postseason row leaking in would be read as a disagreement instead."""
    for season, games in load_store()["seasons"].items():
        worst = max(g["week"] for g in games)
        assert worst <= 18, f"{season}: week {worst} present, store claims REG only"


def test_the_sign_convention_control_the_note_cites_still_holds():
    """The `_note` asserts spread_line is the expected HOME margin and cites
    2021 wk1 TB (home, -10 favourite) stored as +10.0. If that inverts, every
    implied_home = total/2 + spread/2 flips to the wrong team silently."""
    tb = [g for g in load_store()["seasons"]["2021"]
          if g["week"] == 1 and {g["home"], g["away"]} == {"TB", "DAL"}]
    assert len(tb) == 1, "the cited control fixture is missing"
    assert tb[0]["home"] == "TB" and tb[0]["spread_line"] == 10.0


def test_2022_has_271_games_because_of_the_cancelled_bills_bengals_fixture():
    """VALIDATED AGAINST KNOWN REALITY, not just shape — the standard the
    routes rebuild set. 2022 stores 271 games where every other full season
    stores 272, and a naive "272 per season" assertion would call that a
    defect. It is not: BUF@CIN, week 17, was abandoned after Damar Hamlin's
    cardiac arrest and never replayed. The store should show exactly two teams
    at 16 games and no such fixture.
    """
    games = load_store()["seasons"]["2022"]
    assert len(games) == 271
    played: dict[str, int] = {}
    for g in games:
        for t in (g["home"], g["away"]):
            played[t] = played.get(t, 0) + 1
    short = sorted(t for t, n in played.items() if n < 17)
    assert short == ["BUF", "CIN"], f"expected BUF/CIN short a game, got {short}"
    assert not [g for g in games
                if g["week"] == 17 and {g["home"], g["away"]} == {"BUF", "CIN"}]


def test_absent_is_absent_no_line_is_ever_stored_as_zero():
    """The store's `_note` promises "a game with no line is ABSENT, never
    stored as zeros". A 0.0 total_line would read as a measurement — a
    pick'em game with no scoring expected — and is the exact absent-vs-zero
    defect D's lane exists to catch."""
    for season, games in load_store()["seasons"].items():
        for g in games:
            for f in FIELDS:
                assert g.get(f) is not None, f"{season} {g}: null {f} stored"
            assert g["total_line"] != 0, f"{season} {g}: total_line stored as 0"
