"""config_confirmed single source of truth (item 2 fix 3).

The committed league_config.json is only a CACHE of what the commissioner
confirmed on the live site; the authority is the Blob the site writes. These
tests pin the contract: the build fetches the live flag when it can, and when it
cannot it falls back to the file but says so loudly — it never lets the file
masquerade as authority.

Run: python -m pytest draft/tests/test_config_ssot.py -q
"""
from __future__ import annotations
import json
import sys
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import build as B  # noqa: E402


class _Resp:
    """Minimal urlopen context-manager stub."""
    def __init__(self, payload: dict):
        self._body = json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self):
        return self._body


def test_no_url_falls_back_to_file_and_labels_it_a_cache(monkeypatch):
    monkeypatch.delenv(B.CONFIG_STATUS_URL_ENV, raising=False)
    rec = B.fetch_authoritative_confirmed({"confirmed": True})
    assert rec["value"] is True             # used the file value
    assert rec["source"] == "file-cache"
    assert rec["authoritative"] is False    # ... but never claims authority
    assert rec["warning"]                    # and warns why


def test_live_blob_overrides_a_stale_file(monkeypatch):
    # File says unconfirmed; the site says confirmed. The authority wins.
    monkeypatch.setenv(B.CONFIG_STATUS_URL_ENV, "https://example.test")
    payload = {"confirmed": True, "confirmed_at": "2026-08-07T00:00:00Z",
               "cost_model": "top_picks_flat"}
    with mock.patch("urllib.request.urlopen", return_value=_Resp(payload)):
        rec = B.fetch_authoritative_confirmed({"confirmed": False})
    assert rec["value"] is True
    assert rec["source"] == "blob"
    assert rec["authoritative"] is True
    assert rec["warning"] is None
    assert rec["file_value"] is False       # the drift is recorded, not hidden
    assert rec["cost_model"] == "top_picks_flat"


def test_url_appended_when_missing_path(monkeypatch):
    monkeypatch.setenv(B.CONFIG_STATUS_URL_ENV, "https://site.test/")
    seen = {}

    def _fake_urlopen(url, timeout=0):
        seen["url"] = url
        return _Resp({"confirmed": False})

    with mock.patch("urllib.request.urlopen", _fake_urlopen):
        B.fetch_authoritative_confirmed({"confirmed": False})
    assert seen["url"] == "https://site.test/api/draft-config-status"


def test_unreachable_endpoint_falls_back_loudly(monkeypatch):
    monkeypatch.setenv(B.CONFIG_STATUS_URL_ENV, "https://down.test")

    def _boom(url, timeout=0):
        raise OSError("connection refused")

    with mock.patch("urllib.request.urlopen", _boom):
        rec = B.fetch_authoritative_confirmed({"confirmed": True})
    assert rec["source"] == "file-cache"
    assert rec["authoritative"] is False
    assert "could not reach" in rec["warning"]
    assert rec["value"] is True             # still usable, just not authoritative
