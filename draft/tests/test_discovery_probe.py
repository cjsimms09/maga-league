"""THE CAP TEST — the reasoning D2's implementability rests on, checked offline.

The fetch needs CI. The inference — "two unrelated queries returning the same
count is a ceiling, not a coincidence" — is pure, and it is the part that can be
confidently wrong. A cap read as a true count would send the crawler out believing
it had walked the pool, and the sample would be whatever the provider handed over,
silently.

Run: python3 -m pytest draft/tests/test_discovery_probe.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import discovery_probe as D  # noqa: E402


def row(name, ids, status=200):
    return {"name": name, "status": status,
            "composition": D.search_composition(
                {"leagues": {"league": [{"id": str(i)} for i in ids]}})}


# ── composition: the ID LIST, not just its length ───────────────────────────
def test_composition_keeps_the_ids_because_length_cannot_tell_paging_from_echo():
    """A PAGE=2 returning 65 DIFFERENT leagues is pagination; one returning the
    SAME 65 is a swallowed parameter. Both have length 65."""
    c = D.search_composition({"leagues": {"league": [{"id": "1"}, {"id": "2"}]}})
    assert c["count"] == 2 and c["ids"] == ["1", "2"]
    assert c["first_id"] == "1" and c["last_id"] == "2"


def test_composition_tolerates_the_singleton_league_dict():
    """MFL returns a bare dict for one result and a list for many — the shape that
    silently iterates a record's KEYS if it is not handled."""
    c = D.search_composition({"leagues": {"league": {"id": "10466"}}})
    assert c["count"] == 1 and c["ids"] == ["10466"]


def test_an_empty_search_is_zero_not_an_error():
    assert D.search_composition({"leagues": {}})["count"] == 0
    assert D.search_composition(None)["count"] == 0


# ── the cap signature ───────────────────────────────────────────────────────
def test_THREE_UNRELATED_QUERIES_RETURNING_THE_SAME_COUNT_is_read_as_a_CEILING():
    """THE CENTRAL INFERENCE. Unrelated searches do not match equally many
    leagues by chance, so equal counts are a cap — and a cap means D2's 'walk the
    entire result set' is not implementable as written."""
    rows = [row("baseline", range(65)), row("different_query", range(100, 165)),
            row("third_query", range(200, 265))]
    v = D.cap_verdict(rows)
    assert v["cap_suspected"] is True
    assert "CAP SUSPECTED" in v["reading"] and "65" in v["reading"]
    assert "new dated registration BEFORE the crawl" in v["reading"]


def test_DIFFERENT_counts_are_read_as_a_real_search_not_a_cap():
    """The other branch must be reachable, or the probe can only ever say 'cap'."""
    rows = [row("baseline", range(65)), row("different_query", range(12)),
            row("third_query", range(300))]
    v = D.cap_verdict(rows)
    assert v["cap_suspected"] is False
    assert "No cap signature" in v["reading"] and "remains implementable" in v["reading"]


def test_ONE_query_alone_cannot_establish_a_cap():
    """THE BOUNDARY. A single count is the observation we already had from the
    schema probe, and it is exactly what cannot distinguish the two cases —
    concluding from it is the error this probe exists to avoid."""
    v = D.cap_verdict([row("baseline", range(65))])
    assert v["cap_suspected"] is False, "one query is not evidence of a ceiling"


def test_a_NONSENSE_query_matching_the_same_count_means_SEARCH_IS_IGNORED():
    """Worse than a cap: if the search term does nothing, the returned set is not
    a search result at all, and D1's format-neutral query cannot deliver a
    complete pool by any choice of words."""
    rows = [row("baseline", range(65)), row("different_query", range(100, 165)),
            row("CONTROL_nonsense_query", range(300, 365))]
    v = D.cap_verdict(rows)
    assert v["search_ignored"] is True
    assert "SEARCH ITSELF APPEARS IGNORED" in v["reading"]
    assert "D1 cannot be satisfied by choosing a neutral query" in v["reading"]


def test_a_nonsense_query_returning_FEW_results_is_a_working_search():
    rows = [row("baseline", range(65)), row("different_query", range(12)),
            row("CONTROL_nonsense_query", [])]
    v = D.cap_verdict(rows)
    assert v["search_ignored"] is False


def test_rows_that_never_returned_a_composition_are_not_counted_as_zero():
    """Absent is not zero: a failed request must not enter the cap comparison as
    a count of 0, which would manufacture 'different counts' and hide a cap."""
    rows = [row("baseline", range(65)),
            {"name": "different_query", "status": None, "composition": None},
            row("third_query", range(65))]
    v = D.cap_verdict(rows)
    assert "different_query" not in v["counts"]
    assert v["cap_suspected"] is True, "the two rows we DID get still agree at 65"


# ── the did-this-parameter-do-anything logic is NOT re-implemented ───────────
def test_classify_and_verdict_are_IMPORTED_not_copied():
    """One owner for one piece of reasoning. A second copy of 'a 200 with the
    baseline's composition means ignored' is the dual-maintenance disease."""
    import adp_asof_probe
    assert D.classify is adp_asof_probe.classify
    assert D.verdict is adp_asof_probe.verdict
    assert D.USER_AGENT is adp_asof_probe.USER_AGENT


def test_the_registered_queries_are_FORMAT_NEUTRAL():
    """D1: no term selecting on team count or scoring. A pool discovered with
    'half ppr 10 team' would make format-match prevalence unmeasurable and the
    attrition report a tautology."""
    banned = ("ppr", "half", "10-team", "12-team", "superflex", "redraft", "keeper", "dynasty")
    for name, search, _ in D.CANDIDATES:
        low = search.lower()
        assert not any(b in low for b in banned), \
            "%s uses a format-selecting search term %r" % (name, search)


# ── is the set PAGED, or does it arrive whole? ──────────────────────────────
def _ov(**kw):
    return {k: {"returned": v[0], "new_vs_baseline": v[1], "identical_to_baseline": v[2]}
            for k, v in kw.items()}


def test_LARGE_VARIED_NONROUND_counts_are_direct_evidence_of_NO_PAGE_SIZE():
    """THE INFERENCE THAT DOES NOT DEPEND ON GUESSING A PARAMETER NAME. A
    paginated endpoint has a page size, so first pages come back at a fixed
    number. 11056 / 5029 / 3328 are none of those things.

    Measured 2026-08-11, run 31494552085, year 2025."""
    v = D.paging_verdict(
        _ov(page_2=(11056, 0, True), offset_65=(11056, 0, True)),
        {"baseline": 11056, "different_query": 5029, "third_query": 3328})
    assert v["paged"] is False
    assert "NO PAGE SIZE IS BEING APPLIED" in v["reading"]
    assert "satisfied by a single request" in v["reading"]


def test_ROUND_EQUAL_counts_do_NOT_license_the_arrives_whole_conclusion():
    """THE BOUNDARY. Three queries all returning 100 is exactly what a page size
    looks like, and the paging params being ignored then tells us nothing about
    whether paging exists under a name we did not try."""
    v = D.paging_verdict(_ov(page_2=(100, 0, True)),
                         {"baseline": 100, "different_query": 100, "third_query": 100})
    assert v["paged"] is None
    assert "Cannot distinguish" in v["reading"] and "rule 13" in v["reading"]


def test_a_paging_candidate_returning_DIFFERENT_leagues_means_pagination_exists():
    v = D.paging_verdict(_ov(page_2=(65, 65, False)), {"baseline": 65, "different_query": 40})
    assert v["paged"] is True and "pagination exists" in v["reading"]


def test_the_universe_query_candidates_are_registered():
    """SEARCH filters, so the pool is a function of the WORD and no word is
    obviously the universe. Asking for nothing is the cheapest way to find out."""
    names = {n for n, _, _ in D.CANDIDATES}
    assert {"empty_search", "single_letter"} <= names
