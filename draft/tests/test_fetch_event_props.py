"""The props capture must WRITE on priced events, REFUSE on the silent-empty
shape, and NO-OP for free outside the window — all three arms driven through
the real main() with a faked transport (rule 3e: the live endpoint positive
is the census's 200; these pin what THIS tool does with each response)."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import fetch_event_props as M  # noqa: E402


def _fake(events, event_odds, remaining="437"):
    def get(url):
        if "/events?" in url:
            return 200, json.dumps(events), {}
        return 200, json.dumps(event_odds), {"x-requests-remaining": remaining}
    return get


def _event(days_out=3):
    t = datetime.now(timezone.utc) + timedelta(days=days_out)
    return {"id": "ev1", "commence_time": t.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "home_team": "Seattle Seahawks", "away_team": "New England Patriots"}


PRICED = {"bookmakers": [{"key": "draftkings", "markets": [
    {"key": "player_pass_yds", "outcomes": [
        {"name": "Over", "description": "D Maye", "price": 1.87, "point": 245.5},
        {"name": "Under", "description": "D Maye", "price": 1.95, "point": 245.5}]}]}]}
EMPTY = {"bookmakers": []}


def test_priced_event_writes_snapshot(tmp_path, monkeypatch):
    monkeypatch.setenv("ODDS_API_KEY", "k")
    monkeypatch.setenv("ODDS_OUT_DIR", str(tmp_path))
    monkeypatch.setattr(M, "get", _fake([_event()], PRICED))
    assert M.main() == 0
    files = list(tmp_path.glob("event_props_*.json"))
    assert len(files) == 1
    snap = json.loads(files[0].read_text())
    assert snap["events"][0]["n_priced_outcomes"] == 2
    assert snap["credits_remaining_last"] == "437"


def test_FAIL_ARM_events_but_zero_priced_refuses(tmp_path, monkeypatch):
    """The five-false-negatives shape: a clean 200 with an empty book must
    not become a committed 'no props' snapshot."""
    monkeypatch.setenv("ODDS_API_KEY", "k")
    monkeypatch.setenv("ODDS_OUT_DIR", str(tmp_path))
    monkeypatch.setattr(M, "get", _fake([_event()], EMPTY))
    assert M.main() == 1
    assert list(tmp_path.glob("*.json")) == []


def test_no_events_in_window_is_a_free_stated_noop(tmp_path, monkeypatch):
    monkeypatch.setenv("ODDS_API_KEY", "k")
    monkeypatch.setenv("ODDS_OUT_DIR", str(tmp_path))
    calls = []
    real = _fake([_event(days_out=20)], PRICED)

    def counting(url):
        calls.append(url)
        return real(url)
    monkeypatch.setattr(M, "get", counting)
    assert M.main() == 0
    assert list(tmp_path.glob("*.json")) == []
    assert len(calls) == 1, "only the free events list may be called"


def test_FAIL_ARM_missing_key_refuses(monkeypatch):
    monkeypatch.delenv("ODDS_API_KEY", raising=False)
    assert M.main() == 1
