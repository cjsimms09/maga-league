# TERRITORY: C
"""THE ASSEMBLY STEP OF THE PICK-PREDICTION RUN — the part that is not egress.

`external_pick_prediction` is pure arithmetic and `external_source_run` already
owns the fetches. What sits between them is the step that turns a list of
per-source `result` dicts into the `sources` and `depth` maps `compare` reads —
and that step decides which sources are IN the comparison, which is the whole
question.

It is tested because of one property of `compare`: it grades on the INTERSECTION
of every source it is handed. A source that produced nothing therefore does not
merely go missing — it takes the entire season's comparison with it, and the
report comes back "unmeasured" with no indication that one bad fetch caused it.

Run: python3 -m pytest draft/tests/test_external_pick_run.py -q
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import external_pick_run as R  # noqa: E402


def _res(name, rows=None, params=None, error=None):
    return {"source": name, "rows": rows, "sd": None,
            "params": dict(params or {}), "note": None, "error": error}


def test_A_SOURCE_THAT_FAILED_IS_DROPPED_AND_NAMED_not_passed_through_empty():
    """`compare` intersects across every source it is given, so handing it an
    empty table makes the shared set empty and the season reports `unmeasured`.
    One failed fetch would silently delete the comparison for that year, and the
    report would say the players did not overlap.

    MUTATION: pass every result through — 2023 comes back unmeasured with
    `shared_n: 0`, which reads as "the sources cover different players" rather
    than "FantasyPros 404'd"."""
    out = R.sources_from([
        _res("ffc", rows={"a": 1.0, "b": 2.0}, params={"total_drafts": 800}),
        _res("fantasypros", error="HTTPError: 404"),
    ])
    assert list(out["sources"]) == ["ffc"]
    assert out["dropped"] == [{"source": "fantasypros", "reason": "HTTPError: 404"}]


def test_A_SOURCE_THAT_FETCHED_NOTHING_IS_DROPPED_TOO():
    """A 200 with an empty board is not a working source. Same consequence as a
    404 and a different cause, so it is named differently.

    MUTATION: keep it because it did not raise — identical silent deletion of the
    intersection, with nothing in the log that even looks like a failure."""
    out = R.sources_from([
        _res("ffc", rows={"a": 1.0}, params={"total_drafts": 800}),
        _res("mfl", rows={}, params={"total_drafts": 5011}),
    ])
    assert list(out["sources"]) == ["ffc"]
    assert out["dropped"][0]["source"] == "mfl"
    assert "no priced players" in out["dropped"][0]["reason"]


def test_A_SOURCE_THAT_PUBLISHES_NO_DEPTH_CARRIES_NONE_and_never_zero():
    """FantasyPros publishes an expert consensus, not a draft count. Zero would
    put it at the bottom of any depth ordering and make the contamination caveat
    read as "this source is the least contaminated", which is the opposite of
    what an unpublished count means.

    MUTATION: default the depth to 0 — the shallowest-looking source in the table
    becomes the one that never said how deep it was."""
    out = R.sources_from([
        _res("ffc", rows={"a": 1.0}, params={"total_drafts": 844}),
        _res("fantasypros", rows={"a": 2.0}, params={"total_drafts": None}),
    ])
    assert out["depth"] == {"ffc": 844, "fantasypros": None}


def test_AN_UNPRICED_PLAYER_IS_STRIPPED_rather_than_compared_as_a_None():
    """A row whose adp is None is a player the source listed and did not price.
    Left in, it enters the intersection and `compare` casts it with `float()`.

    MUTATION: keep the Nones — the shared set grows by players nobody priced, and
    the coefficient is computed over a population larger than the evidence."""
    out = R.sources_from([
        _res("ffc", rows={"a": 1.0, "b": None}, params={"total_drafts": 844}),
        _res("fantasypros", rows={"a": 2.0, "b": 3.0}, params={}),
    ])
    assert out["sources"]["ffc"] == {"a": 1.0}


def test_ONE_SURVIVING_SOURCE_IS_NOT_A_COMPARISON_and_the_run_says_so():
    """The question is which source predicted our room best. With one source
    there is no "which", and a lone rho of 0.72 reads as an answer.

    MUTATION: report it like any other run — a number appears under a heading
    asking which source won, computed from the only one that showed up."""
    out = R.sources_from([
        _res("ffc", rows={"a": 1.0, "b": 2.0}, params={"total_drafts": 844}),
        _res("fantasypros", error="HTTPError: 404"),
    ])
    assert out["comparable"] is False
    assert "1 source" in out["note"] or "one source" in out["note"]

    both = R.sources_from([
        _res("ffc", rows={"a": 1.0}, params={}),
        _res("fantasypros", rows={"a": 2.0}, params={}),
    ])
    assert both["comparable"] is True and both["note"] is None
