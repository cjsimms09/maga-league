"""The MFL schema probe's pure half.

Only `probe()` needs egress; `describe()` and `merge_shapes()` are the parts an
adapter author will actually rely on, so they are the parts tested. Rule 10: each
assertion below was checked to fail when the behaviour it names is removed.

The property that matters most is `always_present`. An adapter author reads it to
decide whether a field can be relied on or must be defaulted, so a bug that
reports a sometimes-field as always-present would produce exactly the confident,
silently-wrong parser this probe exists to prevent.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import mfl_schema_probe as P  # noqa: E402


# ── describe: shape, not data ───────────────────────────────────────────────
def test_records_nesting_as_paths():
    sh = P.describe({"league": {"id": "123", "name": "Test"}})
    assert sh["$.league.id"]["type"] == "str"
    assert sh["$.league"]["type"] == "object"


def test_records_array_cardinality():
    """MFL returns a bare dict for a single element and a list otherwise —
    mfl_adp already carries a special case for it. Recording length is what makes
    that trap visible in the artifact instead of at parse time."""
    sh = P.describe({"players": {"player": [{"id": "1"}, {"id": "2"}]}})
    assert sh["$.players.player"]["len"] == 2
    assert sh["$.players.player[0].id"]["type"] == "str"


def test_a_singleton_dict_is_distinguishable_from_a_list():
    one = P.describe({"players": {"player": {"id": "1"}}})
    many = P.describe({"players": {"player": [{"id": "1"}]}})
    assert one["$.players.player"]["type"] == "object"
    assert many["$.players.player"]["type"] == "array"


def test_values_are_truncated_so_the_artifact_is_a_schema_not_a_copy():
    sh = P.describe({"note": "x" * 500})
    assert len(sh["$.note"]["sample"]) <= P._SAMPLE_CHARS + 1


def test_recursion_is_bounded():
    node = cur = {}
    for _ in range(50):
        cur["deeper"] = {}
        cur = cur["deeper"]
    sh = P.describe(node)          # must not blow the stack
    assert any(v.get("note") == "max depth" for v in sh.values())


def test_none_is_recorded_without_crashing():
    sh = P.describe({"team": None})
    assert sh["$.team"]["type"] == "NoneType"


# ── merge_shapes: what an adapter can rely on ───────────────────────────────
def test_a_field_in_every_sample_is_always_present():
    m = P.merge_shapes([P.describe({"a": 1}), P.describe({"a": 2})])
    assert m["$.a"]["always_present"] is True
    assert m["$.a"]["seen_in"] == 2 and m["$.a"]["of"] == 2


def test_a_field_in_only_SOME_samples_is_not_always_present():
    """The whole point. One league is one league — a field that happened to be
    there would otherwise be recorded as though it were the rule."""
    m = P.merge_shapes([P.describe({"a": 1, "b": 2}), P.describe({"a": 1})])
    assert m["$.a"]["always_present"] is True
    assert m["$.b"]["always_present"] is False
    assert m["$.b"]["seen_in"] == 1 and m["$.b"]["of"] == 2


def test_conflicting_types_are_both_recorded_rather_than_last_wins():
    """A field that is a string in one league and an object in another is a real
    hazard; collapsing to one type would hide it."""
    m = P.merge_shapes([P.describe({"a": "1"}), P.describe({"a": {"x": 1}})])
    assert m["$.a"]["types"] == ["object", "str"]


def test_length_range_spans_all_observations():
    m = P.merge_shapes([P.describe({"p": [1]}), P.describe({"p": [1, 2, 3]})])
    assert m["$.p"]["len_range"] == [1, 3]


def test_merging_nothing_claims_nothing():
    """An empty probe must not report fields as always-present by vacuous truth."""
    assert P.merge_shapes([]) == {}


def test_keys_are_unioned_across_samples():
    m = P.merge_shapes([P.describe({"o": {"a": 1}}), P.describe({"o": {"b": 2}})])
    assert m["$.o"]["keys"] == ["a", "b"]


# ── the endpoints are declared, so coverage is reviewable ───────────────────
def test_the_three_unseen_endpoints_are_the_ones_probed():
    """These are exactly the exports the ingest needs and this repo has never
    seen. adp/players are NOT here — they already have real fixtures."""
    assert set(P.ENDPOINTS) == {"leagueSearch", "league", "draftResults"}
