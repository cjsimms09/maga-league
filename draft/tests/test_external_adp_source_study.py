# TERRITORY: C
"""ADP SOURCE STUDY JOIN — offline, and partly against the REAL committed
`league_history.json` since that file needs no network at all.

`fetch_and_build` is `pragma: no cover` (it reads files that could be
missing/stale in a fresh checkout, not because it reaches a network); every
rule lives in `select_draft`, `non_keeper_picks` and `build_population`, all
pure, tested here.

Run: python3 -m pytest draft/tests/test_external_adp_source_study.py -q
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import external_adp_source_study as M  # noqa: E402

LEAGUE_HISTORY = HERE.parent / "data" / "league_history.json"


def _real_seasons():
    doc = json.loads(LEAGUE_HISTORY.read_text())
    return {int(s["season"]): s for s in doc.get("seasons") or []}


# ── select_draft: against the REAL 2023 double-draft ────────────────────────

def test_select_draft_ON_REAL_2023_DATA_PICKS_THE_150_PICK_DRAFT():
    """⚠ THE EXACT TRAP THE PREREG NAMES, on the real committed file, not a
    fixture standing in for it. 2023 carries a 150-pick real draft and a
    30-pick all-keeper startup event; silently taking `drafts[0]` is how a
    season gets graded against the wrong one.

    MUTATION: `min` instead of `max` and this test starts choosing the
    30-pick keeper draft as "the season", which is exactly the defect."""
    seasons = _real_seasons()
    chosen, diag = M.select_draft(seasons[2023]["drafts"])
    assert len(chosen["picks"]) == 150, diag
    assert diag["drafts_seen"] == 2
    assert diag["chosen_picks"] == 150
    assert diag["other_draft_ids"][0]["picks"] == 30


def test_select_draft_ON_A_SINGLE_DRAFT_SEASON_JUST_USES_IT():
    seasons = _real_seasons()
    chosen, diag = M.select_draft(seasons[2024]["drafts"])
    assert len(chosen["picks"]) == 150
    assert diag["drafts_seen"] == 1
    assert diag["other_draft_ids"] == []


def test_select_draft_WITH_NO_DRAFTS_IS_None_not_a_crash():
    chosen, diag = M.select_draft([])
    assert chosen is None
    assert diag["drafts_seen"] == 0
    chosen2, _ = M.select_draft([{"draft_id": "x", "picks": []}])
    assert chosen2 is None, "a draft with zero picks is not a usable draft"


# ── non_keeper_picks: is_keeper is True or None, never False ────────────────

def test_non_keeper_picks_ON_REAL_2025_DATA_DROPS_EXACTLY_THE_KEEPERS():
    seasons = _real_seasons()
    picks = seasons[2025]["drafts"][0]["picks"]
    kept, dropped = M.non_keeper_picks(picks)
    real_keeper_count = sum(1 for p in picks if p.get("is_keeper"))
    assert dropped == real_keeper_count == 20, dropped
    assert len(kept) == 150 - 20
    assert all(not p.get("is_keeper") for p in kept)


def test_non_keeper_picks_TREATS_None_AS_NOT_A_KEEPER():
    """The real data never writes `is_keeper: false` — absence/None IS the
    non-keeper value. A truthiness check that required `is_keeper is False`
    explicitly would drop everyone."""
    picks = [{"player_id": "1", "is_keeper": None},
            {"player_id": "2", "is_keeper": True},
            {"player_id": "3"}]                 # key absent entirely
    kept, dropped = M.non_keeper_picks(picks)
    assert dropped == 1
    assert {p["player_id"] for p in kept} == {"1", "3"}


# ── build_population: the joined artifact ────────────────────────────────────

def _picks(*rows):
    """rows: (pid, pick_no, round, is_keeper)"""
    return [{"player_id": pid, "pick_no": pn, "round": rd, "is_keeper": kp}
           for pid, pn, rd, kp in rows]


def test_build_population_ATTACHES_EVERY_ARM_AND_COMPUTES_BLEND50():
    picks = _picks(("A", 1, 1, None), ("B", 2, 1, None))
    ffc_arm = {"status": "captured", "rows": {"A": {"adp": 3.0}, "B": {"adp": 10.0}}}
    fp_arm = {"status": "captured", "rows": {"A": {"adp": 1.0}}}
    prior = _picks(("A", 5, 1, None))
    pop = M.build_population(2024, picks, ffc_arm, fp_arm, prior)
    assert pop["graded_population"] == 2
    assert pop["players"]["A"]["ffc"] == 3.0
    assert pop["players"]["A"]["fp"] == 1.0
    assert pop["players"]["A"]["blend50"] == 2.0            # mean(3.0, 1.0)
    assert pop["players"]["A"]["last_year"] == 5
    assert pop["players"]["B"]["fp"] is None
    assert pop["players"]["B"]["blend50"] == 10.0            # only ffc available
    assert pop["players"]["B"]["last_year"] is None          # not in prior


def test_build_population_KEEPER_PICKS_ARE_EXCLUDED_AND_COUNTED():
    picks = _picks(("A", 1, 1, True), ("B", 2, 1, None))
    pop = M.build_population(2024, picks, None, None, None)
    assert pop["graded_population"] == 1
    assert pop["keeper_picks_dropped"] == 1
    assert "A" not in pop["players"]


def test_build_population_SLEEPER_IS_UNAVAILABLE_STRUCTURALLY_EVERY_PLAYER():
    """⚠ NEVER `None` FROM A MISSED LOOKUP — a structural absence, so a reader
    cannot mistake it for a fetch that simply did not find this one player."""
    picks = _picks(("A", 1, 1, None))
    pop = M.build_population(2024, picks, None, None, None)
    assert pop["players"]["A"]["sleeper"] is None
    assert pop["coverage"]["sleeper"]["status"] == "UNAVAILABLE"


def test_build_population_LAST_YEAR_IS_UNAVAILABLE_WHEN_NO_PRIOR_SEASON():
    """2023 has no 2022 on record — `prior_picks=None` (not `[]`) must read as
    the whole arm being unavailable for the season, distinct from a prior
    season that existed but happened not to include this player."""
    picks = _picks(("A", 1, 1, None))
    pop = M.build_population(2023, picks, None, None, None)
    assert pop["players"]["A"]["last_year"] is None
    assert pop["coverage"]["last_year"]["status"] == "UNAVAILABLE"
    assert "no prior season" in pop["coverage"]["last_year"]["reason"]


def test_build_population_LAST_YEAR_USES_KEEPER_PICKS_TOO():
    """LAST_YEAR asks 'where did he actually go last time' — a keeper pick is
    still a real historical pick number, even though THIS season's keeper
    slots are excluded from the graded population itself."""
    picks = _picks(("A", 1, 1, None))
    prior = _picks(("A", 4, 1, True))             # A was a KEEPER last year
    pop = M.build_population(2024, picks, None, None, prior)
    assert pop["players"]["A"]["last_year"] == 4


def test_build_population_COVERAGE_BELOW_90_PERCENT_IS_PARTIAL():
    """⚠ THE PREREG'S OWN BAR. FP covering the top of the board but not the
    depth must not be allowed to look accurate on a population it barely
    reaches — an arm under 90% coverage is PARTIAL and the study's decision
    rule (not computed here) cannot let it win."""
    picks = _picks(*[(str(i), i, 1, None) for i in range(1, 11)])   # 10 players
    fp_arm = {"status": "captured", "rows": {"1": {"adp": 1.0}}}    # covers 1 of 10
    pop = M.build_population(2024, picks, None, fp_arm, None)
    assert pop["coverage"]["fp"]["status"] == "PARTIAL"
    assert pop["coverage"]["fp"]["fraction"] == 0.1


def test_build_population_A_VOID_ARM_CONTRIBUTES_NOTHING_not_a_crash():
    picks = _picks(("A", 1, 1, None))
    void_arm = {"status": "VOID", "reason": "egress failed"}
    pop = M.build_population(2024, picks, void_arm, void_arm, None)
    assert pop["players"]["A"]["ffc"] is None
    assert pop["players"]["A"]["blend50"] is None
    assert pop["coverage"]["ffc"]["status"] == "PARTIAL"
    assert pop["coverage"]["ffc"]["covered"] == 0


def test_build_population_NO_GRADED_PLAYERS_REPORTS_ZERO_not_divide_by_zero():
    pop = M.build_population(2024, [], None, None, None)
    assert pop["graded_population"] == 0
    for arm, c in pop["coverage"].items():
        if c.get("status") not in ("UNAVAILABLE",):
            assert c["fraction"] == 0.0
