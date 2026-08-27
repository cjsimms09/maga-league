"""KNOWN-POSITIVE for the pytest path of the contamination sweep.

Deliberately NOT under draft/tests/: pytest would collect it in the normal
suite, where it asserts something false about the shipped store and would
turn main red. The sweep passes it to pytest by path, which does not care
what the file is called. Original docstring:

KNOWN-POSITIVE for the pytest path of the contamination sweep: this test's
RESULT depends on the unplayed season. If the sweep reports it insensitive,
the sweep is not really running tests and every 'insensitive' it prints for a
test file is meaningless."""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]


def test_seasons_are_only_the_played_ones():
    d = json.load(open(ROOT / "draft/data/league_history.json"))
    assert sorted(v.get("season") for v in d["seasons"]) == ["2023", "2024", "2025"]
