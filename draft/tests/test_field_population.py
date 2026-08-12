# TERRITORY: C
"""The population record, tested against the file that actually fooled us.

Every fixture here is shaped like the real BBM case rather than like a convenient
abstraction, because the abstraction is what hid it: a column list looks identical
whether the column is full or empty, and that is the whole bug.
"""
import gzip
import sys

import pytest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))

import field_population as FP  # noqa: E402

# ── Underdog's ROUND 4: the schema declares the fields, the rows carry nothing.
ROUND4 = [{"player_id": "p%d" % i, "position_name": "WR",
           "projection_adp": "NA", "draft_time": "", "pick_points": "12.4"}
          for i in range(50)]

# ── OUR SUBSET of it: draft_time was never selected, so the key is not there at all.
OUR_SUBSET = [{"player_id": "p%d" % i, "position_name": "WR",
               "projection_adp": "NA", "pick_points": "12.4"}
              for i in range(50)]

# ── Underdog's ROUND 1: the same schema, delivered.
ROUND1 = [{"player_id": "p%d" % i, "position_name": "WR",
           "projection_adp": "%.2f" % (i + 1), "draft_time": "2023-06-01T00:00:00Z",
           "pick_points": "12.4"}
          for i in range(50)]


def test_a_column_of_NA_reports_zero_not_full():
    """The instance Cory ruled on: 'NA' is what an empty numeric cell contains."""
    pop = FP.population(ROUND4)
    assert pop["fields"]["projection_adp"]["pct"] == 0.0
    assert pop["fields"]["projection_adp"]["present"] == 0
    assert pop["fields"]["projection_adp"]["null"] == 50


def test_the_empty_columns_are_NAMED_in_the_record():
    """Listing only the full fields would rebuild the hole this closes."""
    pop = FP.population(ROUND4)
    assert set(pop["empty"]) == {"projection_adp", "draft_time"}
    # and they are still present in the per-field table, not filtered out
    assert "projection_adp" in pop["fields"] and "draft_time" in pop["fields"]


def test_null_and_missing_are_DIFFERENT_states():
    """A declared-but-empty column claims the field exists. An absent key does not."""
    r4 = FP.population(ROUND4)["fields"]["draft_time"]
    ours = FP.population(OUR_SUBSET, fields=["player_id", "position_name",
                                             "projection_adp", "pick_points",
                                             "draft_time"])["fields"]["draft_time"]
    assert (r4["null"], r4["missing"]) == (50, 0)
    assert (ours["null"], ours["missing"]) == (0, 50)
    # both are 0% populated, and the record still distinguishes WHY
    assert r4["pct"] == ours["pct"] == 0.0


def test_a_declared_field_never_delivered_is_visible():
    """Without the declared header this field mentions itself in no row and vanishes."""
    pop = FP.population(OUR_SUBSET, fields=["player_id", "draft_time"])
    assert "draft_time" in pop["fields"]
    assert "draft_time" in pop["absent_fields"]


def test_a_field_no_row_declares_is_not_invented():
    pop = FP.population(OUR_SUBSET)
    assert "draft_time" not in pop["fields"]


def test_the_round_that_delivers_reads_full():
    pop = FP.population(ROUND1)
    assert pop["empty"] == [] and pop["partial"] == []
    assert all(f["pct"] == 100.0 for f in pop["fields"].values())


def test_zero_is_a_value_not_an_absence():
    """Truthiness would drop a legitimate 0.0 ADP and report the column as empty."""
    rows = [{"adp": 0}, {"adp": 0.0}, {"adp": False}]
    pop = FP.population(rows)
    assert pop["fields"]["adp"]["present"] == 3
    assert pop["fields"]["adp"]["pct"] == 100.0


def test_whitespace_only_is_absent():
    pop = FP.population([{"a": "   "}, {"a": "x"}])
    assert pop["fields"]["a"]["present"] == 1


def test_no_rows_reports_UNCOUNTED_rather_than_a_rate():
    """Vacuous green: 0 rows must not read as 'measured, and full' or 'measured, empty'."""
    pop = FP.population([], fields=["a", "b"])
    assert pop["uncounted"] is True
    assert pop["rows"] == 0
    assert pop["fields"]["a"]["pct"] is None
    assert pop["empty"] == []          # nothing was MEASURED to be empty
    assert "UNCOUNTED" in FP.line(pop)


def test_partial_population_is_reported_as_partial():
    rows = [{"a": "x"}] * 3 + [{"a": ""}] * 1
    pop = FP.population(rows)
    assert pop["fields"]["a"]["pct"] == 75.0
    assert pop["partial"] == ["a"] and pop["empty"] == []


def test_the_one_line_NAMES_the_empty_fields():
    """'2 empty' is a statistic; naming them is what makes a reader ask why."""
    s = FP.line(FP.population(ROUND4))
    assert "projection_adp" in s and "draft_time" in s
    assert "EMPTY" in s


def test_the_one_line_on_a_full_artifact_says_so():
    assert "all 5 fields 100%" in FP.line(FP.population(ROUND1))


def test_of_csv_measures_the_BYTES_ON_DISK(tmp_path):
    """The record must describe what landed, not what the writer believed it wrote."""
    p = tmp_path / "board.csv.gz"
    with gzip.open(p, "wt", newline="") as fh:
        fh.write("draft_date,player_id,projection_adp,draft_time\n")
        fh.write("2023-06-01,p1,4.2,\n")
        fh.write("2023-06-01,p2,NA,\n")
    pop = FP.of_csv(str(p))
    assert pop["rows"] == 2
    assert pop["fields"]["projection_adp"]["pct"] == 50.0
    assert pop["fields"]["draft_time"]["pct"] == 0.0
    assert "draft_time" in pop["empty"]


def test_of_csv_carries_the_header_so_a_dead_column_stays_visible(tmp_path):
    """A header column with no data in any row must not disappear from the record."""
    p = tmp_path / "b.csv"
    p.write_text("a,dead\n1,\n2,\n")
    pop = FP.of_csv(str(p))
    assert "dead" in pop["fields"] and "dead" in pop["empty"]


def test_of_csv_names_the_declared_fields_of_an_EMPTY_artifact(tmp_path):
    """A header with no rows is the case where the declared list is the only evidence.

    Found by a surviving mutation: with data rows present, DictReader fills every
    declared key on every row, so dropping the header changes nothing and the earlier
    test could not see it. With zero rows the header is ALL there is — and an empty
    artifact that reports 'no fields' instead of 'these fields, uncounted' is exactly
    the silent hole this module exists to close.
    """
    p = tmp_path / "empty.csv"
    p.write_text("draft_date,player_id,projection_adp\n")
    pop = FP.of_csv(str(p))
    assert pop["uncounted"] is True
    assert set(pop["fields"]) == {"draft_date", "player_id", "projection_adp"}


def test_the_partition_holds_on_ragged_rows():
    """present + null + missing == rows, for every field, or the counts are wrong."""
    rows = [{"a": "x", "b": "y"}, {"a": ""}, {"b": "z"}, {}]
    pop = FP.population(rows, fields=["a", "b", "c"])
    for name, f in pop["fields"].items():
        assert f["present"] + f["null"] + f["missing"] == pop["rows"], name


def test_a_non_dict_row_is_REFUSED_with_a_useful_message():
    """Found by calling it on a real archive: a list of strings crashed with

        AttributeError: 'str' object has no attribute 'get'

    from inside the counting loop. This module is called AT WRITE TIME by archive
    writers, so an opaque crash inside a writer is worse than a bad report — it can
    take down the append that was supposed to save the row. It must say what it got.
    """
    import pytest
    with pytest.raises(TypeError) as e:
        FP.population(["not-a-record", "also-not"])
    assert "row 0" in str(e.value) and "str" in str(e.value)


def test_a_non_dict_row_is_refused_even_when_it_is_not_the_first():
    with pytest.raises(TypeError) as e:
        FP.population([{"a": 1}, "oops"])
    assert "row 1" in str(e.value)
