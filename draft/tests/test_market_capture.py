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
    """A POSITIVE is always safe — the request demonstrably showed one."""
    r = C.scan_touchdown_markets({"markets": [{"key": "player_anytime_td"}]},
                                 books=["DraftKings"], markets=["player_td"])
    assert r["verdict"] == "present"
    assert "anytime_td" in r["matched_terms"]
    assert "RE-RUN" in r["note"]


def test_a_NEGATIVE_THE_REQUEST_COULD_NOT_HAVE_SHOWN_is_unknown_not_absent():
    """THE DEFECT THIS REPLACES, and it shipped as a finding.

    The published snapshot recorded `touchdown_markets_present: false` from a
    1,225-byte payload fetched with two books I chose and no prop market
    requested. A payload that size cannot carry a touchdown market, so the false
    was manufactured by my own request composition — C's sharper form of rule 13
    (clause 11e): it is not only the path you invented.
    """
    r = C.scan_touchdown_markets({"bookmakers": [{"key": "draftkings"}]},
                                 books=["DraftKings", "FanDuel"])
    assert r["verdict"] == "unknown", "a null the request could not have avoided is NOT absence"
    assert r["could_have_shown_a_positive"] is False
    assert "NOT about the provider" in r["why"]


def test_a_negative_the_request_COULD_have_shown_is_a_real_absence():
    """And the verdict is not uselessly always-unknown: a genuine prop payload
    with no TD terms IS absence."""
    r = C.scan_touchdown_markets({"markets": [{"key": "player_rec_yds", "pad": "z" * 30000}]},
                                 books=["DraftKings"], markets=["player_rec_yds"])
    assert r["verdict"] == "absent"


def test_the_scan_always_reports_its_own_composition():
    """11e's operational diagnostic, applied literally: report the composition,
    not just the verdict. A verdict without it cannot be checked."""
    r = C.scan_touchdown_markets({"x": 1}, books=["DraftKings", "FanDuel"], markets=["p"])
    for k in ("books_requested", "markets_requested", "payload_bytes",
              "could_have_shown_a_positive", "why"):
        assert k in r, f"composition field {k} missing"
    assert r["books_requested"] == ["DraftKings", "FanDuel"]

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

    # ── THIS ASSERTION USED TO BE `== 7`, AND THAT WAS THE SAME DEFECT ──────
    #
    # A test named "the horizon is not a literal" that pins the literal in the
    # TEST goes stale exactly the way the constant did. And it did: the registered
    # value said 7 while `market-capture.yml` passed `--horizon-days 14` for weeks,
    # so the registration documented a run that never happened — and this test was
    # green throughout, because it checked the constant against itself.
    #
    # What has to be true is AGREEMENT between the three places the number lives:
    # the registered filter, the CLI default, and the workflow that actually runs.
    import argparse
    import re
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent.parent
    wf = (root / ".github" / "workflows" / "market-capture.yml").read_text()
    m = re.search(r"horizon_days\s*\|\|\s*'(\d+)'", wf)
    assert m, "could not find the horizon the workflow actually passes"
    assert int(m.group(1)) == F.HORIZON_DAYS, (
        f"the workflow passes --horizon-days {m.group(1)} while the registered "
        f"filter says {F.HORIZON_DAYS}. One of them is documentation of a run "
        f"that does not happen.")

    # And the CLI default must come from the registration too, not a third copy.
    cli = inspect.getsource(C.main)
    assert "default=F.HORIZON_DAYS" in cli, (
        "the CLI default must derive from the registered filter")
    del argparse


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
    # The report must carry the REGISTERED horizon, not a number typed here —
    # this pinned 7 and went stale the moment the registration changed to 14.
    assert r["horizon_days"] == F.HORIZON_DAYS


# ── THE SCHEDULED CAPTURE MUST ASK FOR THE REGULAR SEASON ────────────────────
#
# THE DEFECT, found by C's census 2026-08-14 and fixed the same day: the cron ran
# `--league "${{ inputs.league || 'usa-nfl-preseason' }}"`, so the scheduled
# capture had NEVER once asked for a regular-season game. `market_filters.LEAGUES`
# registered both; the workflow passed one.
#
# The cost was not "we captured less". Preseason ends ~08-29, after which the job
# would have kept running daily, exiting 0, writing a snapshot of an empty slate,
# with every dashboard green, while the entire regular season went unrecorded —
# and those weeks are unrecoverable. A job that succeeds at doing nothing.

def _workflow_text():
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent.parent
    return (root / ".github" / "workflows" / "market-capture.yml").read_text()


def test_the_scheduled_capture_does_not_hardcode_preseason():
    """Checked on the SUBSTITUTIONS, not on the whole file — the word still
    appears legitimately in the header prose and in the dispatch description."""
    wf = _workflow_text()
    import re
    subs = re.findall(r"\$\{\{[^}]*inputs\.league[^}]*\}\}", wf)
    assert subs, "no league substitution found — has the step been renamed?"
    bad = [x for x in subs if "usa-nfl-preseason" in x]
    assert not bad, (
        f"a league substitution still falls back to preseason: {bad}. After "
        "~08-29 that captures an empty slate every day, green, and the regular "
        "season is never requested.")


def test_an_empty_league_argument_means_every_registered_league():
    import inspect
    import market_filters as F
    src = inspect.getsource(C.main)
    assert 'default=""' in src, "an empty default is what lets the cron mean 'all'"
    assert "F.LEAGUES" in src, "the league set must come from the registration"
    # Non-vacuity: the registration must actually contain the regular season, or
    # 'every registered league' is still just preseason under a longer name.
    assert C.REGULAR in F.LEAGUES and C.PRESEASON in F.LEAGUES, F.LEAGUES


def test_the_workflow_passes_an_empty_league_so_the_default_applies():
    wf = _workflow_text()
    assert "--league \"${{ github.event.inputs.league || '' }}\"" in wf, (
        "the workflow must pass an empty league on the scheduled path so the "
        "capture covers every registered league")


def test_a_capture_that_lists_nothing_says_so(capsys):
    """The guard that makes the CLASS visible, since the next way to capture
    nothing will not be this way.

    A WARNING rather than a failure, deliberately: zero events is legitimate right
    now — the nearest regular-season kickoff is 27 days out and the horizon
    correctly holds the slate at zero until 08-27. Failing the job today would
    train everyone to ignore a red market-capture for two weeks, which is exactly
    how a real red becomes invisible.
    """
    import inspect
    src = inspect.getsource(C._capture_one)
    assert 'if not snap.get("events_listed")' in src, (
        "an empty capture must be remarked on, not returned as a plain success")
    assert "::warning::" in src, "it must reach the Actions log, not just stdout"
    assert "::error::" not in src.split('if not snap.get("events_listed")')[1], (
        "an empty slate is legitimate while the horizon is genuinely empty — "
        "failing here would teach everyone to ignore this job for two weeks")
