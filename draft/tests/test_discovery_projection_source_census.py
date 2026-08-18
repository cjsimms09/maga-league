# TERRITORY: C
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))

import discovery_projection_source_census as D  # noqa: E402


class _FakeResp:
    def __init__(self, status_code=200, content=b"x" * 5000, content_type="text/html"):
        self.status_code = status_code
        self.content = content
        self.headers = {"content-type": content_type}


def test_probe_one_REACHABLE_and_PLAUSIBLE(monkeypatch):
    with patch("requests.get", return_value=_FakeResp(200, b"y" * 5000)):
        r = D._probe_one("x", "https://x.example/")
    assert r["reachable"] is True
    assert r["plausible_content"] is True
    assert r["status_code"] == 200


def test_probe_one_REACHABLE_BUT_TOO_SHORT_is_not_plausible():
    """MUTATION: drop the size floor and a 12-byte captcha/landing page would
    read identically to a real projection table -- exactly the 'no silent
    nulls' failure this project's own discovery probes keep naming."""
    with patch("requests.get", return_value=_FakeResp(200, b"nope")):
        r = D._probe_one("x", "https://x.example/")
    assert r["reachable"] is True
    assert r["plausible_content"] is False


def test_probe_one_403_IS_NOT_REACHABLE():
    with patch("requests.get", return_value=_FakeResp(403, b"y" * 5000)):
        r = D._probe_one("x", "https://x.example/")
    assert r["reachable"] is False


def test_probe_one_A_LARGE_403_BLOCK_PAGE_IS_NOT_PLAUSIBLE():
    """REGRESSION — the real first run of this census got this wrong: three
    of ten candidates (fantasysharks, rtsports, fantasydata) came back 403/
    404 with a styled error page big enough to clear the size floor on its
    own (5-132KB), and `plausible_content` read True for all three despite
    `reachable` being False. Caught by reading the actual output. MUTATION:
    drop the `reachable and` guard and a blocked source with a large error
    page reads as usable again -- stage 2 would burn effort building a
    parser against a page that was never real content."""
    with patch("requests.get", return_value=_FakeResp(403, b"z" * 50000)):
        r = D._probe_one("x", "https://x.example/")
    assert r["reachable"] is False
    assert r["plausible_content"] is False, (
        "a large body behind a 403/404 is a block page, not real content")


def test_probe_one_NEVER_RAISES_on_a_network_exception():
    """MUTATION: let the exception propagate and one dead host would crash
    the whole census instead of just recording that one result -- a probe
    across ten independent hosts must survive any single one failing."""
    def _raise(*a, **k):
        raise ConnectionError("refused")
    with patch("requests.get", side_effect=_raise):
        r = D._probe_one("x", "https://x.example/")
    assert r["reachable"] is False
    assert "ConnectionError" in r["error"]


def test_census_VOIDS_if_the_KNOWN_POSITIVE_CONTROL_fails(monkeypatch):
    """If the control itself is unreachable, the run says so about EGRESS,
    not about the ten candidates -- a blocked control makes every candidate
    result meaningless, and reporting them anyway would misattribute a
    runner problem to the sources themselves. MUTATION: skip the control
    check and a fully-blocked CI run would report '0/10 reachable' as if it
    were a finding about the sources."""
    def _fake_probe(name, url, timeout=20):
        if name == D.CONTROL_NAME:
            return {"source": name, "url": url, "reachable": False,
                   "status_code": 403, "plausible_content": False}
        raise AssertionError("candidates must not be probed when the control fails")
    with patch.object(D, "_probe_one", side_effect=_fake_probe):
        out = D.census()
    assert out["status"] == "VOID"
    assert "control" in out["reason"].lower() or "egress" in out["reason"].lower()


def test_census_REPORTS_reachable_and_plausible_separately(monkeypatch):
    """A source can be REACHABLE (200) but not carry plausible content
    (redirected to a login wall, say) -- the two counts must not collapse
    into one, or a source that 200s on a blank page would look usable."""
    def _fake_probe(name, url, timeout=20):
        if name == D.CONTROL_NAME:
            return {"source": name, "url": url, "reachable": True,
                   "status_code": 200, "plausible_content": True}
        if name in ("cbs", "espn", "numberfire"):
            return {"source": name, "url": url, "reachable": True,
                   "status_code": 200, "plausible_content": True}
        if name == "fftoday":
            return {"source": name, "url": url, "reachable": True,
                   "status_code": 200, "plausible_content": False}
        return {"source": name, "url": url, "reachable": False,
               "status_code": 403, "plausible_content": False}
    with patch.object(D, "_probe_one", side_effect=_fake_probe):
        out = D.census()
    assert set(out["reachable_sources"]) == {"cbs", "espn", "numberfire", "fftoday"}
    assert set(out["plausible_sources"]) == {"cbs", "espn", "numberfire"}
    assert out["clears_3_source_bar"] is True


def test_census_3_SOURCE_BAR_is_on_PLAUSIBLE_not_just_reachable(monkeypatch):
    """MUTATION: gate `clears_3_source_bar` on `reachable_count` instead of
    `plausible_sources` and a run where every host 200s with a captcha page
    would falsely clear the bar A's ask sets for stage 2."""
    def _fake_probe(name, url, timeout=20):
        if name == D.CONTROL_NAME:
            return {"source": name, "url": url, "reachable": True, "plausible_content": True}
        return {"source": name, "url": url, "reachable": True, "plausible_content": False}
    with patch.object(D, "_probe_one", side_effect=_fake_probe):
        out = D.census()
    assert out["reachable_count"] == len(D.CANDIDATE_SOURCES)
    assert out["plausible_sources"] == []
    assert out["clears_3_source_bar"] is False


def test_CANDIDATE_SOURCES_are_the_ten_named_in_the_ask():
    """MUTATION: quietly drop or rename a source and stage 1 would census
    fewer sources than A's ask actually named, with nothing saying so."""
    assert set(D.CANDIDATE_SOURCES) == {
        "cbs", "espn", "numberfire", "fftoday", "fantasysharks",
        "fantasyfootballnerd", "nfl", "rtsports", "walterfootball", "fantasydata"}
    assert len(D.CANDIDATE_SOURCES) == 10
