# TERRITORY: A
"""The weekly archive must land where the GRADER reads — register 223.

`weekly_own_grade.provider_weeklies()` reads `draft/data/proj_series.json` and
keeps rows where `source == "<provider>_weekly"` AND `week == <week>`. The
archive module was emitting `fantasypros_weekly` only into its own archive file,
which that reader never opens — so `cory_bar_startsit()`, which refuses unless
BOTH providers are present, would have returned NOT RUN every week of the season
while every job involved ran green.

That is the 2027 programme's headline question — *our published weekly projection
beats BOTH Sleeper and FantasyPros* — failing to a shrug, first grade 09-15.

⚠️ AND THE HALF THAT "WORKS" HAS NEVER PRODUCED A ROW EITHER. The proposal said
"the sleeper half worked"; measured on the committed store today, `proj_series`
holds 25 snapshots, sources `sleeper` and `fantasypros`, and **every one carries
`week: None`** — those are PRESEASON rows. There are zero `sleeper_weekly` and
zero `fantasypros_weekly` rows, because the season has not started. So the
sleeper half is WIRED, not demonstrated, and this file tests the wire rather than
trusting either claim (rule 3e: a null from a path that has never returned a
positive is a bug report).
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT / "draft"))
sys.path.insert(0, str(ROOT / "draft" / "tools"))

import weekly_projection_archive as WPA  # noqa: E402
import weekly_own_grade as WOG  # noqa: E402


def _doc():
    """The archive's own payload shape: {pid: {raw, scored}}."""
    return {
        "captured_at": "2026-09-15T12:00:00Z",
        "sleeper_weekly": {"101": {"raw": {}, "scored": 18.5},
                           "102": {"raw": {}, "scored": 9.0}},
        "fantasypros_weekly": {"101": {"raw": {}, "scored": 17.0},
                               "103": {"raw": {}, "scored": 12.25}},
    }


def test_scored_by_id_takes_the_points_out_of_the_payload():
    got = WPA.scored_by_id(_doc()["sleeper_weekly"])
    assert got == {"101": 18.5, "102": 9.0}


@pytest.mark.parametrize("payload,why", [
    ({}, "empty"),
    (None, "absent"),
    ({"101": {"raw": {}}}, "no scored key"),
    ({"101": {"raw": {}, "scored": None}}, "scored is null"),
    ({"101": 18.5}, "already flat — NOT this module's shape"),
])
def test_scored_by_id_drops_what_it_cannot_price(payload, why):
    """A row with no usable number must vanish rather than become 0.0 — a
    projection of zero is a claim, and absence is not zero."""
    assert WPA.scored_by_id(payload) == {}, why


def test_the_mirror_puts_BOTH_providers_where_the_grader_looks(tmp_path):
    """THE WHOLE POINT. Not "the file was written" — the actual reader, called on
    the actual file, must come back with both arms."""
    series_path = tmp_path / "proj_series.json"
    written = WPA.mirror_to_proj_series(_doc(), 2, "2026-09-15", series_path)
    assert written == {"sleeper_weekly": 2, "fantasypros_weekly": 2}, written

    series = json.loads(series_path.read_text())["series"]
    got = WOG.provider_weeklies(series, week=2)

    assert "sleeper" in got and "fantasypros" in got, (
        f"the grader's own reader does not see both providers: {sorted(got)}"
    )
    assert got["sleeper"] == {"101": 18.5, "102": 9.0}
    assert got["fantasypros"] == {"101": 17.0, "103": 12.25}


def test_WITHOUT_the_mirror_the_grader_sees_NOTHING_KNOWN_POSITIVE(tmp_path):
    """RULE 3e. The arm above is a `yes`; this is the `no` it is measured
    against. Write the archive file exactly as the module did before register
    223 — to its own path, and nowhere else — and ask the grader the same
    question. It must come back empty, because that is the defect: every job
    green, every week, and no provider columns."""
    archive = tmp_path / "weekly_projection_archive_2026_w2.json"
    archive.write_text(json.dumps(_doc(), indent=1))

    series_path = tmp_path / "proj_series.json"
    assert not series_path.exists()
    series = json.loads(series_path.read_text())["series"] if series_path.exists() else []

    assert WOG.provider_weeklies(series, week=2) == {}, (
        "the pre-fix arrangement is supposed to leave the grader with nothing — "
        "if it does not, register 223's diagnosis is wrong and the fix is "
        "unnecessary"
    )


def test_the_week_key_is_what_separates_the_rows(tmp_path):
    """`provider_weeklies` filters on `week`, and the committed store's 25
    preseason snapshots all carry `week: None`. A mirror that forgot the `week=`
    argument would write rows that look right in the file and are invisible to
    the reader — the exact failure register 223 describes, one layer down."""
    series_path = tmp_path / "proj_series.json"
    WPA.mirror_to_proj_series(_doc(), 2, "2026-09-15", series_path)
    series = json.loads(series_path.read_text())["series"]

    assert all(s.get("week") == 2 for s in series), [s.get("week") for s in series]
    assert WOG.provider_weeklies(series, week=3) == {}, (
        "week 3 must see nothing — if the filter does not bite, every week of "
        "the season would grade against every other week's projections"
    )


def test_a_re_run_of_the_same_week_REPLACES_rather_than_doubles(tmp_path):
    """The archive job can re-run. `append_snapshot` dedupes on
    (date, source, week); this pins that the mirror actually passes all three."""
    series_path = tmp_path / "proj_series.json"
    WPA.mirror_to_proj_series(_doc(), 2, "2026-09-15", series_path)
    first = len(json.loads(series_path.read_text())["series"])

    WPA.mirror_to_proj_series(_doc(), 2, "2026-09-15", series_path)
    assert len(json.loads(series_path.read_text())["series"]) == first, (
        "a same-day re-run doubled the snapshots"
    )


def test_the_mirror_never_takes_the_archive_down_with_it(tmp_path):
    """The archive file is the durable record; the mirror is additive. A corrupt
    series file must be REPORTED, not raised — losing the week's capture because
    a secondary write failed would trade the recoverable problem for the
    unrecoverable one."""
    series_path = tmp_path / "proj_series.json"
    series_path.write_text("{ this is not json")

    got = WPA.mirror_to_proj_series(_doc(), 2, "2026-09-15", series_path)
    assert "_error" in got, got
    assert series_path.read_text() == "{ this is not json", (
        "a corrupt series file was overwritten rather than left for a human"
    )


def test_it_preserves_what_the_series_file_already_held(tmp_path):
    """The preseason rows are the only record of what the providers said before
    week 1 and cannot be re-fetched — providers overwrite in place. The mirror
    appends; it must not rewrite the file from its own view of it."""
    series_path = tmp_path / "proj_series.json"
    series_path.write_text(json.dumps({
        "_note": "PRESEASON — irrecoverable",
        "series": [{"date": "2026-08-01", "source": "sleeper",
                    "week": None, "proj": {"999": 200.0}}],
    }, indent=1))

    WPA.mirror_to_proj_series(_doc(), 2, "2026-09-15", series_path)
    after = json.loads(series_path.read_text())

    assert after["_note"] == "PRESEASON — irrecoverable"
    assert any(s.get("source") == "sleeper" and s.get("week") is None
               and s.get("proj", {}).get("999") == 200.0
               for s in after["series"]), "the preseason snapshot was dropped"
