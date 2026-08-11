"""THE CRAWL — a failed term must never look like a term that matched nothing.

Both give you no leagues. One means the pool is smaller than D1 v2 claims,
silently, and the union reads as an honest count. That is the attrition seam in a
third place, and it is the mutation this file is built around.

Run: python3 -m pytest draft/tests/test_external_discovery.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import external_discovery as X  # noqa: E402


def fake(results, errors=None):
    """An injected fetch: {term: [league dicts]} plus {term: error}."""
    errors = errors or {}
    def fetch(term, year):
        if term in errors:
            return {"error": errors[term]}
        return {"leagues": results.get(term, [])}
    return fetch


def lg(i, name=None):
    return {"id": str(i), "name": name or "League %s" % i, "year": "2025"}


# ── the union, and what a league found twice keeps ──────────────────────────
def test_a_league_found_by_TWO_terms_is_ONE_league_that_remembers_BOTH():
    """Dedupe by id, but never lose which term found it — that is the covariate
    D1 v2 registers so term-correlated bias is measurable."""
    f = fake({"league": [lg(1), lg(2)], "football": [lg(2), lg(3)]})
    c = X.crawl(f, 2025, terms=("league", "football"))
    assert set(c["leagues"]) == {"1", "2", "3"}
    assert [x["term"] for x in c["leagues"]["2"]["found_by"]] == ["league", "football"]


def test_the_providers_RANK_is_recorded_per_term():
    """D2 requires ordering recorded, so any order-dependence is measurable rather
    than invisible."""
    f = fake({"league": [lg(9), lg(8), lg(7)]})
    c = X.crawl(f, 2025, terms=("league",))
    assert c["leagues"]["9"]["found_by"][0]["rank"] == 0
    assert c["leagues"]["7"]["found_by"][0]["rank"] == 2


def test_EVERY_registered_term_runs_even_after_the_pool_is_large():
    """D2: no early stop. Stopping when a count looks sufficient makes the sample
    a function of TERM ORDER — optional stopping wearing a target's clothes."""
    seen = []
    def fetch(term, year):
        seen.append(term)
        return {"leagues": [lg(i) for i in range(500)]}
    X.crawl(fetch, 2025, terms=("a", "b", "c", "d"))
    assert seen == ["a", "b", "c", "d"]


# ── THE CENTRAL DISTINCTION ─────────────────────────────────────────────────
def test_a_FAILED_term_is_not_a_term_that_matched_NOTHING():
    """MUTATION: record a failed fetch as `per_term[term] = 0`. The union would be
    a smaller pool reported as a complete one, with nothing to show it."""
    f = fake({"league": [lg(1)]}, errors={"football": "http 500"})
    c = X.crawl(f, 2025, terms=("league", "football"))
    assert c["per_term"]["football"] is None, "a failed term must not read as zero"
    assert c["failed_terms"]["football"] == "http 500"
    rep = X.pool_report(c)
    assert rep["terms_failed"] == 1 and rep["complete"] is False
    assert "COULD NOT BE FETCHED" in rep["verdict"]
    assert "a floor, not a count" in rep["verdict"]


def test_a_term_that_GENUINELY_matched_nothing_is_zero_and_says_so_differently():
    """The other side: zero is a real answer and must not be reported as a
    failure. It IS worth flagging against the measured minimum term length —
    `"a"` returned zero because SEARCH is token-based, not because MFL broke."""
    f = fake({"league": [lg(1)], "zzz": []})
    rep = X.pool_report(X.crawl(f, 2025, terms=("league", "zzz")))
    assert rep["terms_failed"] == 0 and rep["complete"] is True
    assert "returned ZERO leagues" in rep["verdict"] and "zzz" in rep["verdict"]
    assert "COULD NOT BE FETCHED" not in rep["verdict"]


def test_a_clean_complete_crawl_carries_NO_warning():
    """A verdict that always warns is one nobody reads."""
    rep = X.pool_report(X.crawl(fake({"league": [lg(1), lg(2)]}), 2025, terms=("league",)))
    assert rep["complete"] is True
    assert "COULD NOT" not in rep["verdict"] and "ZERO" not in rep["verdict"]


# ── overlap: ten terms is not ten times a pool ──────────────────────────────
def test_overlap_is_reported_so_the_union_can_be_judged():
    """Sum-of-terms over union. Two terms returning the same 2 leagues is an
    overlap factor of 2.0 and a union of 2 — the number that says whether the
    registered terms bought breadth or repetition."""
    f = fake({"league": [lg(1), lg(2)], "football": [lg(1), lg(2)]})
    rep = X.pool_report(X.crawl(f, 2025, terms=("league", "football")))
    assert rep["union"] == 2 and rep["sum_of_terms"] == 4
    assert rep["overlap_factor"] == 2.0
    assert rep["found_by_multiple_terms"] == 2 and rep["found_by_exactly_one_term"] == 0


def test_DISJOINT_terms_report_an_overlap_factor_of_one():
    """THE BOUNDARY. Disjoint terms give union == sum, factor exactly 1.0 — any
    value above it is genuine repetition, and confusing the two would make ten
    overlapping terms look like ten separate pools."""
    f = fake({"league": [lg(1), lg(2)], "football": [lg(3), lg(4)]})
    rep = X.pool_report(X.crawl(f, 2025, terms=("league", "football")))
    assert rep["union"] == 4 and rep["sum_of_terms"] == 4 and rep["overlap_factor"] == 1.0
    assert rep["found_by_exactly_one_term"] == 4


def test_an_empty_pool_reports_None_overlap_rather_than_dividing_by_zero():
    rep = X.pool_report(X.crawl(fake({}), 2025, terms=("league",)))
    assert rep["union"] == 0 and rep["overlap_factor"] is None


# ── the crawl runs the REGISTERED terms by default ──────────────────────────
def test_the_default_term_set_IS_the_registered_one():
    """Not a copy. The registration is the source, and the doc-drift test in
    test_discovery_probe keeps that in step with INGEST-PLAN."""
    import discovery_probe
    assert X.REGISTERED_TERMS is discovery_probe.REGISTERED_TERMS
    seen = []
    X.crawl(lambda t, y: seen.append(t) or {"leagues": []}, 2025)
    assert tuple(seen) == tuple(X.REGISTERED_TERMS)


def test_a_row_with_no_id_is_skipped_rather_than_pooled_as_None():
    """A league with no id cannot be fetched later; pooling it under the string
    'None' would put a phantom in the denominator."""
    f = fake({"league": [{"name": "no id here"}, lg(1)]})
    c = X.crawl(f, 2025, terms=("league",))
    assert set(c["leagues"]) == {"1"}


# ── D6: which leagues of a 21,323-league pool actually get fetched ──────────
def pool(n):
    return {str(i): {"league_id": str(i)} for i in range(n)}


def test_the_sample_is_NESTED_so_a_bigger_n_is_a_SUPERSET():
    """THE PROPERTY THAT MAKES TWO RUNS COMPARABLE. MUTATION: shuffle, or salt with
    n. The first 200 would stop being the first 500's prefix, an earlier result
    would stop being a subset of a later one, and a disappointing attrition rate
    could be re-rolled by asking for a different size."""
    p = pool(500)
    small, big = X.sample_pool(p, 50), X.sample_pool(p, 200)
    assert small == big[:50]
    assert set(small) < set(big)


def test_the_sample_is_REPRODUCIBLE_so_a_rerun_is_a_rerun():
    p = pool(300)
    assert X.sample_pool(p, 40) == X.sample_pool(p, 40)


def test_the_sample_is_BLIND_to_the_order_leagueSearch_returned():
    """`found_by[].rank` is kept as a COVARIATE so order-correlation is measurable —
    which only works if the sample is not itself built from that order. MUTATION:
    `return ids[:n]`. Reversing the pool would then change the sample entirely."""
    ids = [str(i) for i in range(400)]
    assert X.sample_pool(ids, 60) == X.sample_pool(list(reversed(ids)), 60)


def test_a_DIFFERENT_SALT_is_a_DIFFERENT_SAMPLE_and_that_is_the_point():
    """The salt is versioned so a reshuffle cannot happen quietly."""
    p = pool(400)
    assert X.sample_pool(p, 50) != X.sample_pool(p, 50, salt="something-else")


def test_asking_for_more_than_the_pool_returns_the_pool_not_an_error():
    assert len(X.sample_pool(pool(7), 50)) == 7
    assert X.sample_pool(pool(7), 0) == [] and X.sample_pool(pool(7), -3) == []


def test_the_sample_report_states_the_DENOMINATOR_it_is_not():
    """200 of 21,323 with no denominator invites '12 matched' to be read as a rate
    over the pool."""
    r = X.sample_report(pool(21323), X.sample_pool(pool(21323), 200))
    assert r["pool"] == 21323 and r["sampled"] == 200
    assert "over the SAMPLE" in r["verdict"]
    assert "which this run does not test" in r["verdict"]
