"""A DAILY CAPTURE THAT STOPPED MOVING MUST NOT READ AS HEALTHY.

Register 538 ④. Cory, 2026-10-07: *"Every week going forward needs to work!"*

`external_source_prices.json` gains a row every day. Measured 2026-10-07 by
hashing each day's payload: **FantasyPros has been BYTE-IDENTICAL for 28
consecutive days**, since 2026-09-08 — the same ADP value for every one of 365
players, for four weeks — while FFC stopped appearing after 2026-09-13.

Every freshness instrument in the repo read both as healthy: the file is
present, it grows daily, the newest row parses, the counts are stable.
**Stability was the symptom and every check was built to reward it.** So the
board has been priced on a frozen pre-season ADP snapshot since two days before
week 1 kicked off, and nothing said so.

This file holds the two properties that make the new check worth trusting: the
bar comes from the measured distribution rather than from taste, and the
detector can FIRE.

Run: python3 -m pytest draft/tests/test_frozen_series_check.py -q
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tools"))

import frozen_series_check as F  # noqa: E402


# ── the bar must come from the distribution (rule 3i) ───────────────────────

def test_the_BAR_sits_above_every_LIVE_streak_and_far_below_the_dead_one():
    """MEASURED on the committed series, both sources, 84 captured days.

    A live feed's longest identical-content streak is 3 (FFC over 31 days) and
    typically 1 (FantasyPros changed EVERY DAY for the 25 days before
    2026-09-08). The dead streak is 28. If someone later raises the bar past a
    real live streak, or drops it so a dead feed fits under it, this goes red.
    """
    doc = json.loads((ROOT / "draft" / "data" / "external_source_prices.json")
                     .read_text(encoding="utf8"))
    by: dict = {}
    for e in doc["series"]:
        by.setdefault(e["source"], []).append((str(e["observed_at"]),
                                               F._hash(e["rows"])))

    #: every streak, per source, over the PRE-KICKOFF window where both feeds
    #: were demonstrably live
    live_max = 0
    for _src, days in by.items():
        pre = sorted(d for d in days if d[0] < "2026-09-08")
        run, prev = 1, None
        for _day, h in pre:
            if h == prev:
                run += 1
            else:
                live_max = max(live_max, run)
                run, prev = 1, h
        live_max = max(live_max, run)

    assert live_max <= 3, (
        f"a live feed was observed holding identical content for {live_max} "
        "days — the bar below was set against a maximum of 3")
    assert F.MAX_STREAK > live_max, (
        f"the bar {F.MAX_STREAK} is at or below the longest LIVE streak "
        f"({live_max}) — it would fire on a healthy feed")
    assert F.MAX_STREAK < 28, (
        f"the bar {F.MAX_STREAK} is at or above the measured DEAD streak (28) "
        "— a frozen feed would hide under it")


# ── it must FIRE, and on the real thing ─────────────────────────────────────

def test_the_LIVE_series_is_detected_as_frozen_today():
    """The defect that motivated the tool, asserted against the committed data.

    ⚠️ This is allowed to go green later — when the ADP rail is either repaired
    or explicitly retired, FantasyPros stops being frozen-and-read-as-current.
    So it asserts CONSISTENCY between the rows and the exit code rather than
    requiring the defect to persist, which is the trap three of my own tests
    fell into earlier today.
    """
    res = F.audit()
    srcs = [s for r in res["series"] for s in r.get("sources", [])]
    assert srcs, "no sources parsed — the series shape changed"
    frozen = [s for s in srcs if s["frozen"]]
    assert F.main(["--json"]) == (1 if frozen else 0)
    fp = next((s for s in srcs if s["source"] == "fantasypros"), None)
    assert fp is not None
    #: whatever its state, the streak must be computed, not None
    assert isinstance(fp["current_streak"], int) and fp["current_streak"] >= 1


def test_CONTROL_a_frozen_run_IS_detected(tmp_path, monkeypatch):
    """Rule 3e — on synthetic state, so it holds whatever the live file says."""
    monkeypatch.setattr(F, "ROOT", tmp_path)
    (tmp_path / "draft" / "data").mkdir(parents=True)
    rows = {"p1": 1.5, "p2": 2.5}
    series = [{"source": "s", "observed_at": f"2026-10-{d:02d}", "rows": rows}
              for d in range(1, 8)]                      # 7 identical days
    (tmp_path / "draft" / "data" / "external_source_prices.json").write_text(
        json.dumps({"series": series}))
    res = F.audit(max_streak=5)
    s = res["series"][0]["sources"][0]
    assert s["current_streak"] == 7, s
    assert s["frozen"] is True
    assert s["distinct_payloads"] == 1


def test_CONTROL_a_MOVING_run_is_NOT_flagged(tmp_path, monkeypatch):
    """The other direction, or the check is just "always red"."""
    monkeypatch.setattr(F, "ROOT", tmp_path)
    (tmp_path / "draft" / "data").mkdir(parents=True)
    series = [{"source": "s", "observed_at": f"2026-10-{d:02d}",
               "rows": {"p1": float(d)}} for d in range(1, 8)]
    (tmp_path / "draft" / "data" / "external_source_prices.json").write_text(
        json.dumps({"series": series}))
    s = F.audit(max_streak=5)["series"][0]["sources"][0]
    assert s["current_streak"] == 1 and s["frozen"] is False


def test_only_the_CURRENT_streak_counts_not_one_in_the_middle_of_history(tmp_path, monkeypatch):
    """A long identical run that has since RESUMED MOVING is a past event. The
    question is whether the feed is moving now, so a historical freeze must not
    keep the alarm on forever — an alarm that cannot clear becomes wallpaper,
    which is what let the real one run for 28 days."""
    monkeypatch.setattr(F, "ROOT", tmp_path)
    (tmp_path / "draft" / "data").mkdir(parents=True)
    frozen = [{"source": "s", "observed_at": f"2026-09-{d:02d}",
               "rows": {"p1": 1.0}} for d in range(1, 11)]     # 10 identical
    #: offset so no moving day collides with the frozen payload — my first
    #: version started at 1.0, which IS the frozen value, so "4 distinct"
    #: was really 3 and the fixture's intent was ambiguous.
    moving = [{"source": "s", "observed_at": f"2026-10-{d:02d}",
               "rows": {"p1": 100.0 + d}} for d in range(1, 4)]
    (tmp_path / "draft" / "data" / "external_source_prices.json").write_text(
        json.dumps({"series": frozen + moving}))
    s = F.audit(max_streak=5)["series"][0]["sources"][0]
    assert s["current_streak"] == 1, s
    assert s["frozen"] is False
    assert s["distinct_payloads"] == 4   # the frozen one + three moving days


def test_the_answer_does_not_depend_on_the_ORDER_rows_were_written(tmp_path, monkeypatch):
    """An append-only file is usually in order and must not be trusted to be.
    `current_streak` sorts, so a reordered file gives the same verdict."""
    monkeypatch.setattr(F, "ROOT", tmp_path)
    (tmp_path / "draft" / "data").mkdir(parents=True)
    frozen = [{"source": "s", "observed_at": f"2026-09-{d:02d}",
               "rows": {"p1": 1.0}} for d in range(1, 11)]
    moving = [{"source": "s", "observed_at": f"2026-10-{d:02d}",
               "rows": {"p1": 100.0 + d}} for d in range(1, 4)]
    (tmp_path / "draft" / "data" / "external_source_prices.json").write_text(
        json.dumps({"series": moving + frozen}))          # newest FIRST
    s = F.audit(max_streak=5)["series"][0]["sources"][0]
    assert s["current_streak"] == 1 and s["last_day"] == "2026-10-03"


# ── absence is not freshness, and must not wear a tick ──────────────────────

def test_a_source_that_STOPPED_REPORTING_is_not_given_a_tick():
    """⚠️ MY OWN FIRST VERSION DID EXACTLY THAT. FFC's last captured day is
    2026-09-13 and its final payload differed from the day before, so
    `current_streak` was 1 and the row printed ✅ — a green tick beside a
    source that had not reported in over three weeks.

    "Not frozen" and "not there" are different answers and only one is good
    news. Printing the wrong one is how a dead feed keeps passing for a live
    one, which is the entire defect this tool was written for.
    """
    res = F.audit()
    srcs = [s for r in res["series"] for s in r.get("sources", [])]
    ffc = next((s for s in srcs if s["source"] == "ffc"), None)
    if ffc is None:
        pytest.skip("ffc is no longer in the series at all")
    assert ffc["days_behind_newest"] is not None
    if ffc["days_behind_newest"] >= F.MAX_STREAK:
        assert ffc["stopped_reporting"] is True, (
            f"ffc is {ffc['days_behind_newest']} days behind the newest "
            "captured day and is not marked as having stopped reporting")


def test_stopped_reporting_is_REPORTED_and_does_not_set_the_exit_code():
    """The absence belongs to the capture audit and the source probe. Two
    instruments claiming the same defect is register 11, and an exit code that
    means two things cannot be acted on."""
    res = F.audit()
    srcs = [s for r in res["series"] for s in r.get("sources", [])]
    stopped_only = [s for s in srcs if s["stopped_reporting"] and not s["frozen"]]
    frozen = [s for s in srcs if s["frozen"]]
    if stopped_only and not frozen:
        assert F.main(["--json"]) == 0, (
            "a stopped source alone set the exit code — that is the capture "
            "audit's job, and this tool would be crying wolf for it")
    assert all("stopped_reporting" in s for s in srcs)


def test_every_declared_series_resolves_to_a_real_file():
    """Rule 3e where it bites a config list: a path that matches nothing
    produces the same silence as a healthy feed."""
    for spec in F.SERIES:
        p = ROOT / spec["path"]
        assert p.exists(), f"{spec['key']}: {spec['path']} does not exist"
        doc = json.loads(p.read_text(encoding="utf8"))
        assert isinstance(doc.get(spec["list"]), list) and doc[spec["list"]], \
            f"{spec['key']}: '{spec['list']}' is not a non-empty list"
        e = doc[spec["list"]][0]
        for field in ("group", "day", "payload"):
            assert spec[field] in e, \
                f"{spec['key']}: entries carry no '{spec[field]}' field"
        assert spec.get("serves"), spec["key"]
