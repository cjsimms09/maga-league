# TERRITORY: relay
"""THIS-WEEK.md carries the props second opinion (ROUTES A → relay, 09-02):
the section is READ from A's second_opinion_<season>_w<week>.json, never
recomputed. Known positive: the committed week-1 file renders Cory's roster
with the three extra columns and the swap. Known negative: a week with no
file renders the one-line placeholder rather than a crash or a fake table.
The Sleeper-backed main() cannot run in the sandbox, so the section builder
is the unit under test."""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("build_week_brief", ROOT / "draft" / "tools" / "build_week_brief.py")
BWB = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BWB)


def test_known_positive_week1_file_renders_table_and_swaps():
    path = ROOT / "draft" / "data" / "weekly_own" / "second_opinion_2026_w1.json"
    assert path.exists(), "the week-1 second opinion is committed; if it moved, update SECOND_OPINION"
    so = json.loads(path.read_text())
    md = BWB.second_opinion_section(2026, 1, root=ROOT)
    assert md.startswith("## Second opinion (props vs champion)")
    assert "| st | player | pos | champion | props | props − champion |" in md
    for r in so["table"]:
        assert f"| {r['name']} |" in md
    for s in so["swaps"]:
        assert s["props_starts"] in md and s["champion_starts"] in md
    assert "REPORT ONLY" in md          # the arm is a challenger, not the grader's input
    assert "Matchup vs" in md          # the per-opinion matchup gap is carried


def test_known_negative_missing_week_is_a_placeholder_not_a_crash():
    md = BWB.second_opinion_section(2026, 99, root=ROOT)
    assert md.startswith("## Second opinion (props vs champion)")
    assert "not written yet for week 99" in md
    assert "|---|" not in md


def test_the_what_stuck_line_is_in_the_brief_template():
    src = (ROOT / "draft" / "tools" / "build_week_brief.py").read_text()
    assert "What stuck so far: `WHAT-STUCK.md`" in src
    assert "second_opinion_section(season, week)" in src
