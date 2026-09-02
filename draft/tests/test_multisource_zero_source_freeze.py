"""A USABLE source with zero rows: REFUSE before the draft, FREEZE after it.

Register 442 made the refusal honest (no artifact written, exit 1). This is the
other half, A 2026-09-02: from the day after the draft the same null exits clean
and still writes nothing, because the seasonal blend is frozen for the season
and a job red every night until August is a job nobody reads.

Diagnosed on the probe logs, not the CSV: CBS 442 / ESPN 416 season-total rows
on 08-19 (run 7) and 0 / 0 on 08-20 (run 9), same ffanalytics commit 1955daa.
The sites stopped serving season totals; the scraper did not break.
"""
import csv
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "tools"))
sys.path.insert(0, str(HERE.parent))

import multisource_projections as M  # noqa: E402

DRAFT = "2026-08-22"


def test_the_verdict_is_a_freeze_only_strictly_after_a_KNOWN_draft_date():
    """MUTATION: `>=` instead of `>` — draft morning itself would freeze, and the
    one day the alarm is worth the most is the day it goes quiet."""
    assert M.zero_source_verdict(["CBS"], today="2026-09-02", draft_date=DRAFT)["frozen"] is True
    assert M.zero_source_verdict(["CBS"], today="2026-08-22", draft_date=DRAFT)["frozen"] is False
    assert M.zero_source_verdict(["CBS"], today="2026-08-20", draft_date=DRAFT)["frozen"] is False


def test_an_UNREADABLE_draft_date_never_freezes():
    """Rule 3e: cannot-say does not skip. A missing config must not become a
    silent season-long freeze of the alarm.

    MUTATION: treat '' as 'no draft, so post-draft' — the refusal disappears the
    day the config key is renamed."""
    v = M.zero_source_verdict(["CBS", "ESPN"], today="2026-09-02", draft_date="")
    assert v["frozen"] is False and "undated" in v["note"]
    assert M.zero_source_verdict(["CBS"], today="", draft_date=DRAFT)["frozen"] is False


def test_the_note_names_the_sources_and_the_dates():
    v = M.zero_source_verdict(["CBS", "ESPN"], today="2026-09-02", draft_date=DRAFT)
    assert "CBS, ESPN" in v["note"] and DRAFT in v["note"] and "2026-09-02" in v["note"]
    assert v["missing"] == ["CBS", "ESPN"]


def test_today_comes_from_the_flag_when_given():
    assert M._today_arg(["--today=2026-09-02"]) == "2026-09-02"
    real = M._today_arg([])
    assert len(real) == 10 and real[4] == "-" and real[7] == "-"


def test_the_league_config_carries_the_draft_date_the_gate_reads():
    """The gate is only as good as the key it reads; pin the key so a config
    rename fails HERE rather than turning into a silent refusal-forever."""
    assert M._draft_date() == DRAFT


def _fftoday_only_csv(path: Path):
    cols = ["player", "team", "pos", "source", "position_asked", "pass_yds",
            "pass_tds", "rush_yds", "rush_tds", "rec", "rec_yds", "rec_tds"]
    with path.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerow({"player": "Josh Allen", "team": "BUF", "pos": "QB",
                    "source": "FFToday", "position_asked": "QB",
                    "pass_yds": 4000, "pass_tds": 30, "rush_yds": 500, "rush_tds": 8,
                    "rec": "", "rec_yds": "", "rec_tds": ""})
        # the excluded leaderboards are present, as in the live capture
        w.writerow({"player": "Josh Allen", "team": "BUF", "pos": "QB",
                    "source": "FantasyPros", "position_asked": "QB",
                    "pass_yds": 3900, "pass_tds": 28, "rush_yds": 520, "rush_tds": 9,
                    "rec": "", "rec_yds": "", "rec_tds": ""})


def _run(monkeypatch, tmp_path, today):
    raw = tmp_path / "raw.csv"
    _fftoday_only_csv(raw)
    out = tmp_path / "multisource_projections.json"
    out.write_text(json.dumps({"sources_used": ["CBS", "ESPN", "FFToday"], "players": {}}))
    monkeypatch.setattr(M, "RAW", raw)
    monkeypatch.setattr(M, "OUT", out)
    monkeypatch.setattr(sys, "argv", ["multisource_projections.py", f"--today={today}"])
    rc = M.main()
    return rc, json.loads(out.read_text())


def test_END_TO_END_post_draft_exits_clean_and_writes_nothing(monkeypatch, tmp_path, capsys):
    """The known positive for the freeze arm: the live shape (FFToday only among
    USABLE, CBS/ESPN absent) on a post-draft day.

    MUTATION: return 0 AFTER `OUT.write_text` — the artifact would claim three
    sources while carrying one, which is the exact thing register 442 stopped."""
    rc, doc = _run(monkeypatch, tmp_path, "2026-09-02")
    assert rc == 0
    assert doc["sources_used"] == ["CBS", "ESPN", "FFToday"] and doc["players"] == {}
    out = capsys.readouterr().out
    assert "FROZEN FOR THE SEASON" in out and "CBS, ESPN" in out


def _full_csv(path: Path):
    """All three USABLE sources present — the shape of the 09-02 capture."""
    cols = ["player", "team", "pos", "source", "position_asked", "pass_yds",
            "pass_tds", "rush_yds", "rush_tds", "rec", "rec_yds", "rec_tds"]
    with path.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        for src, yds in (("CBS", 4000), ("ESPN", 3900), ("FFToday", 4100)):
            w.writerow({"player": "Josh Allen", "team": "BUF", "pos": "QB",
                        "source": src, "position_asked": "QB",
                        "pass_yds": yds, "pass_tds": 30, "rush_yds": 500, "rush_tds": 8,
                        "rec": "", "rec_yds": "", "rec_tds": ""})


def test_POST_DRAFT_A_FULL_CAPTURE_IS_FROZEN_TOO_unless_allowed(monkeypatch, tmp_path, capsys):
    """Register 480: CBS/ESPN season totals came back on 09-02 and a nightly
    would have re-scored proj_mean — the board's blend and a live challenger's
    prior — mid-season. Post-draft the tool writes nothing whatever arrives;
    `--allow-post-draft` on a dispatch is the deliberate path.

    MUTATION: freeze only on a missing source — the first full capture after
    the draft silently rewrites the season's blend."""
    raw = tmp_path / "raw.csv"
    _full_csv(raw)
    out = tmp_path / "multisource_projections.json"
    out.write_text(json.dumps({"sources_used": ["CBS", "ESPN", "FFToday"], "players": {}}))
    monkeypatch.setattr(M, "RAW", raw)
    monkeypatch.setattr(M, "OUT", out)
    monkeypatch.setattr(sys, "argv", ["multisource_projections.py", "--today=2026-09-02"])
    assert M.main() == 0
    assert json.loads(out.read_text())["players"] == {}
    assert "FULL capture arrived" in capsys.readouterr().out
    # the deliberate path writes
    monkeypatch.setattr(sys, "argv", ["multisource_projections.py", "--today=2026-09-02", "--allow-post-draft"])
    assert M.main() == 0
    assert json.loads(out.read_text())["players"], "allowed post-draft re-score writes"
    # and pre-draft a full capture always writes (the 2027 nightly path)
    out.write_text(json.dumps({"players": {}}))
    monkeypatch.setattr(sys, "argv", ["multisource_projections.py", "--today=2026-08-10"])
    assert M.main() == 0
    assert json.loads(out.read_text())["players"]


def test_END_TO_END_pre_draft_still_refuses_with_exit_1(monkeypatch, tmp_path, capsys):
    """The control: the same capture dated before the draft is the register-442
    refusal, unchanged."""
    rc, doc = _run(monkeypatch, tmp_path, "2026-08-20")
    assert rc == 1
    assert doc["players"] == {}
    assert "REFUSING TO WRITE" in capsys.readouterr().err
