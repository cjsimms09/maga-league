"""Preseason capture: the guards that keep an unrecoverable snapshot trustworthy."""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import market_capture as C  # noqa: E402
import market_request as R  # noqa: E402


# ── rule 13, made operational ───────────────────────────────────────────────
def test_an_unregistered_endpoint_is_refused_before_sending():
    """A 404 from an invented path is evidence about the query. Refuse locally."""
    with pytest.raises(R.UnvalidatedRequest):
        R.build("https://h", "sports_guessed", {"apiKey": "k"})


def test_a_missing_required_parameter_is_refused_locally():
    """/v3/odds needs eventId; discovering that by spending a call is the cost
    this removes."""
    with pytest.raises(R.UnvalidatedRequest) as e:
        R.build("https://h", "odds", {"apiKey": "k"})
    assert "eventId" in str(e.value)


def test_discovery_is_allowed_but_must_state_a_reason():
    with pytest.raises(R.UnvalidatedRequest):
        R.build("https://h", "/v3/whatever", {"apiKey": "k"}, discovery=True)
    url = R.build("https://h", "/v3/whatever", {"apiKey": "k"},
                  discovery=True, reason="probing an undocumented path")
    assert url.startswith("https://h/v3/whatever?")


def test_unverified_book_names_are_refused():
    """'draftkings' was rejected by the API; sharp books 403'd. Both were facts
    about the input."""
    with pytest.raises(R.UnvalidatedRequest):
        R.check_books(["draftkings"])
    with pytest.raises(R.UnvalidatedRequest):
        R.check_books(["10BET"])
    assert R.check_books(["DraftKings", "FanDuel"]) == ["DraftKings", "FanDuel"]


def test_values_are_url_encoded():
    """An unencoded space produced an exception that leaked the API key into a
    committed artifact."""
    url = R.build("https://h", "odds", {"apiKey": "k", "eventId": 1,
                                        "bookmakers": "bet365 NJ"}, )
    assert " " not in url


# ── dispersion is a FIELD, and ships with its book count ────────────────────
def test_dispersion_reports_the_book_count_beside_the_spread():
    """A spread over two books and one over ninety are different claims wearing
    the same number."""
    d = C.dispersion([-3.5, -3.0, -4.0])
    assert d["books"] == 3 and d["spread"] == 1.0
    assert C.dispersion([])["books"] == 0 and C.dispersion([])["spread"] is None


# ── the touchdown finding, reported not absorbed ────────────────────────────
def test_a_touchdown_market_is_detected_and_flagged_for_recomputation():
    f = C.scan_touchdown_markets({"markets": [{"name": "Anytime TD Scorer"}]})
    assert f["touchdown_markets_present"] is True
    assert f["matched_terms"] and "RE-RUN" in f["note"]


def test_absence_of_touchdown_markets_is_also_recorded():
    f = C.scan_touchdown_markets({"markets": [{"name": "Total Points"}]})
    assert f["touchdown_markets_present"] is False
    assert f["payload_bytes"] > 0          # the number behind the verdict


# ── verdicts ship with their numbers ────────────────────────────────────────
def test_health_counts_consecutive_failures(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "OUT_DIR", tmp_path)
    monkeypatch.setattr(C, "HEALTH", tmp_path / "capture_health.json")
    bad = {"finished_at": "t1", "league": "x", "events_captured": 0, "coverage": 0.0}
    h1 = C.write_health(bad)
    assert h1["consecutive_failures"] == 1 and h1["last_success_at"] is None
    h2 = C.write_health(bad)
    assert h2["consecutive_failures"] == 2
    good = {"finished_at": "t3", "league": "x", "events_captured": 5, "coverage": 1.0}
    h3 = C.write_health(good)
    assert h3["consecutive_failures"] == 0 and h3["last_success_at"] == "t3"


def test_health_declares_its_staleness_threshold(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "OUT_DIR", tmp_path)
    monkeypatch.setattr(C, "HEALTH", tmp_path / "h.json")
    h = C.write_health({"finished_at": "t", "league": "x", "events_captured": 1,
                        "coverage": 1.0})
    assert h["stale_after_days"] == 7


# ── partial capture: allowed, but never silent ──────────────────────────────
def test_a_refusal_still_writes_health(tmp_path, monkeypatch):
    """A refusal is an OUTCOME, not an absence. Without this the health gate
    reports 'the capture did not run' for a run that ran and declined —
    indistinguishable from the job never firing."""
    monkeypatch.setattr(C, "OUT_DIR", tmp_path)
    monkeypatch.setattr(C, "HEALTH", tmp_path / "h.json")
    h = C.write_health({"finished_at": "t", "league": "x", "events_captured": 0,
                        "coverage": 0.0, "refused": "budget"})
    assert (tmp_path / "h.json").exists()
    assert h["consecutive_failures"] == 1


# ── the horizon filter ──────────────────────────────────────────────────────
def test_undated_events_are_KEPT_not_dropped(monkeypatch):
    """Absent is not 'far away'. A game we cannot date is exactly the one not to
    silently skip."""
    import datetime as dt
    events = [{"id": 1, "date": None}, {"id": 2, "date": "2099-01-01T00:00:00Z"}]
    cutoff = dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=14)
    def starts(e):
        t = str(e.get("date") or "")[:19]
        try:
            return dt.datetime.strptime(t, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=dt.timezone.utc)
        except ValueError:
            return None
    kept = [e for e in events if starts(e) is None or starts(e) <= cutoff]
    assert [e["id"] for e in kept] == [1]      # undated kept, far-future dropped


# ── RULE 4: the filters are REGISTERED, and their effect is recorded ────────
def test_the_horizon_is_not_a_literal_in_the_capture():
    """It defaulted to 14 — a number chosen AFTER seeing that usa-nfl returns 134
    events, which is post-hoc filtering on the axis Signal C runs along."""
    import inspect
    import market_filters as F
    src = inspect.getsource(C.capture)
    assert "horizon_days: int = 14" not in src, "the un-registered literal is back"
    assert "F.HORIZON_DAYS" in src, "the horizon must come from the registered filters"
    assert F.HORIZON_DAYS == 7


def test_the_registration_declares_what_had_already_been_seen():
    """A pre-registration written after first contact is only honest if it says
    what contact had already happened."""
    import market_filters as F
    assert F.MARKET_FILTER_VERSION.startswith("v1")
    assert "UNREGISTERED" in F.MARKET_FILTER_VERSION, \
        "the superseded filter must be named, not quietly replaced"
    assert len(F.ALREADY_SEEN) >= 5
    assert any("134" in s for s in F.ALREADY_SEEN), \
        "the event count that drove the bad boundary must be declared as seen"


def test_the_horizon_records_what_it_dropped():
    """A filter whose attrition is invisible cannot be audited. The first horizon
    dropped events and recorded nothing, so a cut slate and a small slate looked
    identical in the artifact."""
    import market_filters as F
    events = [{"id": 1}, {"id": 2}, {"id": 3}]
    kept = [{"id": 1}]
    r = F.horizon_report(events, kept, "2026-08-18T00:00:00Z")
    assert r["events_before_horizon"] == 3
    assert r["events_after_horizon"] == 1
    assert r["dropped_beyond_horizon"] == 2
    assert r["filter_version"].startswith("v1")
    assert r["horizon_days"] == 7
