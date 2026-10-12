"""EVERY PLAYED WEEK MUST BE ON DISK — and the audit that says so must be able to fail.

Cory, 2026-10-07: *"Every week going forward needs to work!"*

The two 2027-gradeable captures failed loudly on EVERY run for seven weeks and
it still cost four weeks of the Sleeper comparator, because a red workflow
sitting among red workflows is invisible while a missed week is unrecoverable.
`weekly_capture_audit.py` watches artifacts instead of jobs, which is the only
thing that settles it: a job can go green and bank nothing, or go red having
already banked.

This file exists because an alarm nobody can trust is worse than no alarm, and
the audit proved that on its first run twice over — it reported the odds
capture as 24 days stale off a wrong glob (the live fetcher writes `sgo_*`, it
looked for `odds_*`), and then reported `newest: sgo_latest.json`, a pointer
file that says nothing about freshness. Both were caught before they reached
anyone. So: the detector is tested for its ability to FIRE, its patterns are
tested against reality, and its freshness line is tested for actually being a
date.

Run: python3 -m pytest draft/tests/test_weekly_capture_audit.py -q
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tools"))

import weekly_capture_audit as A  # noqa: E402


# ── the patterns must describe reality (rule 3e) ────────────────────────────

def test_CONTROL_every_weekly_pattern_matches_something_real():
    """A glob that matches nothing produces the same output as a dead capture.

    This is the check that would have caught the odds row before it cried wolf:
    if a directory has files in it and the pattern matches none of them, the
    PATTERN is the defect, not the season.
    """
    problems = A._pattern_control("2026")
    assert not problems, "\n".join(problems)


def test_CONTROL_the_weekly_globs_find_the_weeks_we_know_are_there():
    """Anchored to artifacts committed on main, so a rename breaks this loudly
    rather than silently reporting every week missing."""
    own = A.present_weeks("draft/data/weekly_own/own_weekly_{season}_w{week}.json", "2026")
    assert {1, 2, 3, 4}.issubset(own), f"own weekly projections found: {sorted(own)}"


def test_a_SUNDAY_sibling_is_not_counted_as_the_week():
    """props writes weekly_props_2026_w4.json AND ..._w4_sun.json (a closing-line
    snapshot). Counting the sibling would make a missing week look present —
    and counting FILES instead of WEEKS is exactly how "props: 5 files" got
    reported as healthy when weeks 2 and 5 were missing."""
    weeks = A.present_weeks("draft/data/props/weekly_props_{season}_w{week}.json", "2026")
    assert 2 not in weeks, (
        "week 2 is absent from props on disk but the matcher counted it — it is "
        "probably matching a _sun sibling")
    assert 1 in weeks and 4 in weeks, sorted(weeks)


# ── it must be able to FIRE ─────────────────────────────────────────────────

def test_CONTROL_a_missing_week_IS_detected(tmp_path, monkeypatch):
    """Rule 3e: an alarm that has only ever been quiet has not been tested."""
    monkeypatch.setattr(A, "ROOT", tmp_path)
    (tmp_path / "draft" / "data" / "x").mkdir(parents=True)
    for w in (1, 3):
        (tmp_path / "draft" / "data" / "x" / f"f_2026_w{w}.json").write_text("{}")
    have = A.present_weeks("draft/data/x/f_{season}_w{week}.json", "2026")
    assert have == {1, 3}
    owed = [1, 2, 3]
    missing = [w for w in owed if w not in have]
    assert missing == [2], missing


def test_the_audit_EXITS_NONZERO_while_a_played_week_is_missing():
    """The live state today: the Sleeper+FP archive is missing played weeks, so
    this must be a failure. If it ever passes, either every week is captured
    (good) or the audit stopped looking (bad) — and the controls above are what
    tell those apart."""
    res = A.audit("2026")
    assert res["played_weeks"], "no played weeks detected — the harvest gate is broken"
    any_missing = any(not r["ok"] for r in res["captures"])
    assert A.main(["--season", "2026", "--json"]) == (1 if any_missing else 0)


def test_a_week_is_OWED_only_once_somebody_has_SCORED_in_it():
    """The gate is the harvest, not a clock — a date is a second source that can
    disagree with the scores, and a capture demanded for a week that has not
    happened is a false alarm that trains people to ignore the real ones."""
    owed = A.played_weeks("2026")
    assert owed == sorted(owed)
    assert all(isinstance(w, int) and 1 <= w <= 18 for w in owed), owed
    assert 18 not in owed, "week 18 cannot have been played yet in October"


# ── the freshness line must be a date ───────────────────────────────────────

def test_the_market_rows_report_a_DATED_capture_not_a_pointer_file():
    """`sgo_latest.json` sorts after every date and answers nothing about
    freshness; the first version printed exactly that."""
    res = A.audit("2026")
    for d in res["daily"]:
        if d["newest"] is None:
            continue
        assert re.search(r"\d{4}-\d{2}-\d{2}", d["newest"]), \
            f"{d['key']} reports newest={d['newest']!r}, which carries no date"


def test_every_capture_states_WHAT_IT_SERVES():
    """Cory's framing: each row has to say whether it makes the DRAFT better,
    the in-season MANAGEMENT better, or both. A capture nobody can justify is a
    capture nobody will fix when it breaks."""
    for cap in A.CAPTURES + A.DAILY:
        assert cap.get("serves"), cap["key"]
        assert ("DRAFT" in cap["serves"]) or ("MANAGE" in cap["serves"]), cap["serves"]


def test_the_unbackfillable_rows_are_marked_as_such():
    """The difference between 'retry it' and 'that evidence no longer exists'."""
    keys = {c["key"]: c for c in A.CAPTURES}
    for k in ("sleeper_fp_archive", "own_weekly", "props"):
        assert keys[k].get("unbackfillable") is True, k


# ── REALIZED OUTCOMES: the half of the season we were not banking at all ────

def test_the_realized_stores_are_audited_and_marked_BACKFILLABLE():
    """Every realized store held 2021-2025 and nothing for 2026, so the
    forward captures above had nothing to be graded against all season.

    `unbackfillable: False` is the honest label and it is the reason this
    went unnoticed: nflverse keeps its history, so nothing was LOST and no
    irrecoverable-loss alarm could fire. The cost was five weeks of being
    unable to grade anything, which no existing instrument measured.
    """
    assert A.SEASON_STORES, "the realized stores are not audited at all"
    keys = {c["key"] for c in A.SEASON_STORES}
    assert {"realized_components", "realized_points", "realized_kicker",
            "realized_def", "realized_advanced"} <= keys, sorted(keys)
    for cap in A.SEASON_STORES:
        assert cap.get("unbackfillable") is False, cap["key"]
        assert cap.get("serves"), cap["key"]
        assert "{season}" in cap["path"], cap["key"]


def test_store_weeks_READS_INSIDE_the_file_rather_than_scanning_filenames(tmp_path, monkeypatch):
    """A season store is one file with the weeks inside it, so the glob
    matcher the forward captures use cannot see into it — a present-but-empty
    store would read as full coverage."""
    monkeypatch.setattr(A, "ROOT", tmp_path)
    (tmp_path / "draft" / "backtest").mkdir(parents=True)
    p = tmp_path / "draft" / "backtest" / "s_2026.json"
    p.write_text(json.dumps({"weeks": [
        {"week": 1, "players": {"a": {}, "b": {}}},
        {"week": 2, "players": {}},                 # present but EMPTY
        {"week": 3, "players": {"c": {}}},
    ]}))
    assert A.store_weeks("draft/backtest/s_{season}.json", "2026") == {1, 3}, \
        "an empty week must not count as covered — it reads as 'nobody scored'"
    assert A.store_weeks("draft/backtest/nope_{season}.json", "2026") == set()


def test_store_weeks_handles_the_row_count_shape_too(tmp_path, monkeypatch):
    """`nflverse_weekly_points_*` stores `row_count` rather than a players
    dict. Reading one shape as the other is register 524's defect."""
    monkeypatch.setattr(A, "ROOT", tmp_path)
    (tmp_path / "draft" / "backtest").mkdir(parents=True)
    (tmp_path / "draft" / "backtest" / "s_2026.json").write_text(json.dumps(
        {"weeks": [{"week": 1, "row_count": 300}, {"week": 2, "row_count": 0}]}))
    assert A.store_weeks("draft/backtest/s_{season}.json", "2026") == {1}


def test_the_grace_period_forgives_ONLY_the_newest_played_week():
    """⚠️ RULE 3f ON MY OWN MITIGATION. The one-week grace exists because
    nflverse publishes after the final whistle and this fetch runs Tuesday
    14:00Z, hours after Monday night ends — without it the audit would cry
    wolf once a week forever. But a grace period is also a mechanism for
    hiding a real gap, so it must be provably narrow: the newest week only,
    never an older one, and never when the store is simply absent for weeks
    that closed long ago.
    """
    res = A.audit("2026")
    owed = res["played_weeks"]
    newest = owed[-1]
    for r in res["realized"]:
        assert all(w == newest for w in r["pending"]), \
            f"{r['key']} forgave {r['pending']} but only week {newest} is new"
        assert newest not in r["missing"], \
            f"{r['key']} reports the newest week as missing, not pending"
        older = [w for w in owed[:-1] if w not in r["have"]]
        assert r["missing"] == older, \
            f"{r['key']}: every week but the newest must be demanded"


def test_the_EXIT_CODE_tracks_the_realized_rows_too():
    """⚠️ WRITTEN ONE WAY, THEN REWRITTEN. The first version asserted that a
    realized gap EXISTS — true today, and it would have gone red the moment
    the weekly fetch caught up, blocking the board for succeeding. A test must
    never depend on a defect persisting; what belongs here is CONSISTENCY
    between the row states and the exit code, with the ability to fire proved
    on synthetic data (`test_CONTROL_a_realized_gap_IS_detected` below).
    """
    res = A.audit("2026")
    assert res["realized"], "the realized rows vanished from the audit"
    any_missing = any(not r["ok"] for r in res["captures"] + res["realized"])
    assert A.main(["--season", "2026", "--json"]) == (1 if any_missing else 0)


def test_CONTROL_a_realized_gap_IS_detected(tmp_path, monkeypatch):
    """Rule 3e, on synthetic state so it holds whatever the live stores say.

    Three weeks played, the store holds week 1 only: week 2 is a real gap and
    week 3 is the newest, so it is pending. Exactly one row must be not-ok.
    """
    monkeypatch.setattr(A, "ROOT", tmp_path)
    (tmp_path / "draft" / "backtest").mkdir(parents=True)
    (tmp_path / "draft" / "data").mkdir(parents=True)
    (tmp_path / "draft" / "data" / "league_history.json").write_text(json.dumps(
        {"seasons": [{"season": 2026, "weeks": {
            "1": [{"points": 100.0}], "2": [{"points": 90.0}],
            "3": [{"points": 95.0}], "4": [{"points": 0.0}]}}]}))
    monkeypatch.setattr(A, "SEASON_STORES", [
        {"key": "r", "label": "r", "path": "draft/backtest/r_{season}.json",
         "serves": "DRAFT", "unbackfillable": False}])
    (tmp_path / "draft" / "backtest" / "r_2026.json").write_text(json.dumps(
        {"weeks": [{"week": 1, "players": {"a": {}}}]}))

    res = A.audit("2026")
    assert res["played_weeks"] == [1, 2, 3], res["played_weeks"]
    row = res["realized"][0]
    assert row["missing"] == [2], row["missing"]
    assert row["pending"] == [3], row["pending"]
    assert row["ok"] is False


# ── ACCEPTED GAPS: the alarm must be able to CLEAR without going QUIET ──────

def test_the_guard_FAILED_EVERY_RUN_until_a_permanent_gap_could_be_ACCEPTED():
    """⚠️ THIS GUARD BECAME THE DEFECT IT WAS BUILT AGAINST, and this is the
    regression test for that.

    `weekly-capture-guard.yml` failed on EVERY run for its first five days
    (2026-10-07 .. 10-11) and commented on issue #31 four times with
    byte-identical content: archive weeks [2, 3, 4], props week [2]. Those
    weeks cannot be captured — the evidence does not exist later — so the guard
    could never clear. This file's own header says what that means: *"an alarm
    that cannot clear itself becomes wallpaper, and wallpaper is what let seven
    weeks pass."*

    And the harm was not just noise: with the guard already red and #31 already
    open, a NEW loss in week 6 would have been invisible inside the standing
    failure.

    So: with those weeks accepted in writing, the live audit must be GREEN.
    """
    res = A.audit("2026")
    acc = A.accepted_gaps("2026")
    assert acc, "the accepted-gap ledger resolved to nothing"
    arch = next(r for r in res["captures"] if r["key"] == "sleeper_fp_archive")
    assert set(arch["accepted"]) >= {2, 3, 4}, arch
    assert not arch["missing"], arch["missing"]
    assert A.main(["--season", "2026", "--json"]) == 0, (
        "the audit still escalates although every gap is accepted — the guard "
        "cannot clear and is back to being wallpaper")


def test_CONTROL_AN_ACCEPTED_GAP_DOES_NOT_SILENCE_A_NEW_ONE(tmp_path, monkeypatch):
    """⚠️ THE ASSERTION THE WHOLE MECHANISM RESTS ON. If accepting weeks 2-4
    also forgave week 5, this would be a mute button wearing a ledger's name."""
    monkeypatch.setattr(A, "ROOT", tmp_path)
    (tmp_path / "draft" / "data" / "arch").mkdir(parents=True)
    (tmp_path / "draft" / "data" / "league_history.json").write_text(json.dumps(
        {"seasons": [{"season": 2026, "weeks": {
            str(w): [{"roster_id": 1, "points": 100.0}] for w in (1, 2, 3, 4, 5)}}]}))
    # only week 1 on disk; 2-4 accepted; 5 is a NEW loss
    (tmp_path / "draft" / "data" / "arch" / "a_2026_w1.json").write_text("{}")
    (tmp_path / "draft" / "data" / "accepted_capture_gaps.json").write_text(json.dumps(
        {"gaps": [{"capture": "k", "season": "2026", "weeks": [2, 3, 4],
                   "why": "the /v1 surface returned zero projections",
                   "accepted_on": "2026-10-12"}]}))
    monkeypatch.setattr(A, "CAPTURES", [
        {"key": "k", "label": "k", "glob": "draft/data/arch/a_{season}_w{week}.json",
         "serves": "DRAFT", "unbackfillable": True}])
    monkeypatch.setattr(A, "SEASON_STORES", [])

    r = A.audit("2026")["captures"][0]
    assert r["accepted"] == [2, 3, 4], r["accepted"]
    assert r["missing"] == [5], (
        f"week 5 is a NEW unaccepted loss and must escalate; got {r['missing']}")
    assert r["ok"] is False


def test_a_BACKFILLABLE_capture_CANNOT_be_accepted(tmp_path, monkeypatch):
    """The realized stores are re-fetchable from nflverse, so accepting one of
    their weeks would hide WORK rather than record a LOSS — and this mechanism
    would become the excuse it exists to avoid needing. Enforced in code, not
    only in the ledger's prose."""
    monkeypatch.setattr(A, "ROOT", tmp_path)
    (tmp_path / "draft" / "data").mkdir(parents=True)
    (tmp_path / "draft" / "data" / "accepted_capture_gaps.json").write_text(json.dumps(
        {"gaps": [{"capture": "realized_points", "season": "2026", "weeks": [3],
                   "why": "we did not feel like fetching it",
                   "accepted_on": "2026-10-12"}]}))
    assert A.accepted_gaps("2026") == {}, (
        "a backfillable capture was accepted — that is a mute button, not a "
        "recorded loss")


@pytest.mark.parametrize("drop", ["why", "accepted_on"])
def test_an_UNDATED_or_UNEXPLAINED_acceptance_does_not_count(tmp_path, monkeypatch, drop):
    """An acceptance with no reason or no date is how a gap gets quietly
    forgiven, which is the thing being prevented rather than performed."""
    monkeypatch.setattr(A, "ROOT", tmp_path)
    (tmp_path / "draft" / "data").mkdir(parents=True)
    entry = {"capture": "sleeper_fp_archive", "season": "2026", "weeks": [2],
             "why": "a stated reason", "accepted_on": "2026-10-12"}
    entry.pop(drop)
    (tmp_path / "draft" / "data" / "accepted_capture_gaps.json").write_text(
        json.dumps({"gaps": [entry]}))
    assert A.accepted_gaps("2026") == {}, f"accepted an entry with no {drop}"


def test_a_MISSING_or_BROKEN_ledger_makes_gaps_ESCALATE_not_vanish(tmp_path, monkeypatch):
    """The failure direction matters: a broken accept-list must be NOISY. If an
    unreadable ledger forgave everything, deleting the file would be the
    quietest way to turn the guard off."""
    monkeypatch.setattr(A, "ROOT", tmp_path)
    (tmp_path / "draft" / "data").mkdir(parents=True)
    assert A.accepted_gaps("2026") == {}          # absent
    (tmp_path / "draft" / "data" / "accepted_capture_gaps.json").write_text("{not json")
    assert A.accepted_gaps("2026") == {}          # unreadable
    #: and with no acceptances, a real gap must be reported as MISSING
    (tmp_path / "draft" / "data" / "arch").mkdir(parents=True)
    (tmp_path / "draft" / "data" / "league_history.json").write_text(json.dumps(
        {"seasons": [{"season": 2026, "weeks": {
            "1": [{"roster_id": 1, "points": 50.0}],
            "2": [{"roster_id": 1, "points": 50.0}]}}]}))
    monkeypatch.setattr(A, "CAPTURES", [
        {"key": "k", "label": "k", "glob": "draft/data/arch/a_{season}_w{week}.json",
         "serves": "DRAFT", "unbackfillable": True}])
    monkeypatch.setattr(A, "SEASON_STORES", [])
    r = A.audit("2026")["captures"][0]
    assert r["missing"] == [1, 2] and r["accepted"] == []


def test_the_LEDGER_only_names_captures_that_actually_EXIST():
    """Rule 3e on a config list: an entry whose `capture` key matches no row
    silently accepts nothing, and reads as if it accepted something."""
    doc = json.loads((ROOT / "draft" / "data" / "accepted_capture_gaps.json")
                     .read_text(encoding="utf8"))
    keys = {c["key"] for c in A.CAPTURES} | {c["key"] for c in A.SEASON_STORES}
    for g in doc["gaps"]:
        assert g["capture"] in keys, (
            f"{g['capture']} is not a capture in this audit — the entry accepts "
            "nothing while looking like it does")
        assert g.get("cost"), f"{g['capture']}: no stated COST of the loss"
        assert g.get("register"), f"{g['capture']}: not tied to a register row"
