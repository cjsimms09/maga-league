"""THE ONE IRREVERSIBLE EVENT OF THE YEAR MUST NOT DEPEND ON SOMEONE TYPING AN ID.

`draft-night-sync.yml` calls `log_draft_picks.py --sync <draft_id>`, and until
2026-08-21 that id had to be looked up on Sleeper and pasted by hand, under time
pressure, on draft night. If nobody did it, the draft was simply not captured —
and a draft cannot be re-run. Everything Cory wants to simulate next year (every
pick, every counterfactual, the opponent models) rests on that one file existing.

`discover_draft_id()` removes the human. This file is why it can be trusted.

⚠️ RULE 3e IS THE WHOLE POINT HERE. Discovery returns a single string, and a
WRONG string looks exactly like a right one — the sync would poll a real draft
that is not ours, log nothing, exit clean, and nobody would know until the draft
was over. So the function is built to REFUSE rather than guess, and these tests
exist to prove the refusals actually fire rather than being decoration.

Run: python3 -m pytest draft/tests/test_draft_id_discovery.py -q
"""
from __future__ import annotations

import json
import sys
import types
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))

import log_draft_picks as L  # noqa: E402


@pytest.fixture
def fake_sleeper(monkeypatch):
    """Install a stub `sleeper_import` whose fetch_drafts we control."""
    def install(drafts):
        mod = types.ModuleType("sleeper_import")
        mod.fetch_drafts = lambda lid: drafts
        monkeypatch.setitem(sys.modules, "sleeper_import", mod)
        return mod
    return install


# ── THE PREMISE: the config really does carry a league id ────────────────────

def test_the_league_id_comes_from_the_committed_config_not_a_literal():
    lid = L._league_id()
    cfg = json.loads((ROOT / "draft" / "config" / "league_config.json").read_text())
    assert lid == str(cfg["league_id"]), "discovery must read the same id the rest of the build reads"
    assert lid.isdigit() and len(lid) > 10, lid


# ── KNOWN POSITIVE: it resolves the ordinary case ────────────────────────────

def test_KNOWN_POSITIVE_one_draft_this_season_resolves(fake_sleeper):
    season = str(json.loads(
        (ROOT / "draft" / "config" / "league_config.json").read_text())["season"])
    fake_sleeper([{"draft_id": "999000111", "season": season}])
    assert L.discover_draft_id() == "999000111"


def test_it_picks_THIS_season_when_the_league_carries_prior_drafts(fake_sleeper):
    """A Sleeper league keeps its history. Returning last year's draft_id would
    poll a completed draft, log nothing, and exit clean — the silent failure."""
    season = str(json.loads(
        (ROOT / "draft" / "config" / "league_config.json").read_text())["season"])
    fake_sleeper([
        {"draft_id": "aaa_2024", "season": "2024"},
        {"draft_id": "bbb_2025", "season": "2025"},
        {"draft_id": "ccc_now", "season": season},
    ])
    assert L.discover_draft_id() == "ccc_now"


# ── KNOWN NEGATIVES: every refusal must actually fire ────────────────────────

def test_it_REFUSES_when_the_league_reports_no_drafts(fake_sleeper):
    fake_sleeper([])
    with pytest.raises(RuntimeError, match="NO drafts"):
        L.discover_draft_id()


def test_it_REFUSES_rather_than_choose_between_two_candidates(fake_sleeper):
    """Two drafts for this season is ambiguous. Guessing here is exactly the
    failure this function exists to prevent, so it must raise and SAY what it
    saw — a refusal a human can act on beats a coin flip nobody sees."""
    season = str(json.loads(
        (ROOT / "draft" / "config" / "league_config.json").read_text())["season"])
    fake_sleeper([{"draft_id": "one", "season": season},
                  {"draft_id": "two", "season": season}])
    with pytest.raises(RuntimeError) as e:
        L.discover_draft_id()
    msg = str(e.value)
    assert "one" in msg and "two" in msg, "the refusal must name what it saw: " + msg


def test_it_REFUSES_when_a_draft_row_carries_no_id(fake_sleeper):
    season = str(json.loads(
        (ROOT / "draft" / "config" / "league_config.json").read_text())["season"])
    fake_sleeper([{"season": season}])
    with pytest.raises(RuntimeError):
        L.discover_draft_id()


def test_a_season_mismatch_FALLS_BACK_rather_than_returning_nothing(fake_sleeper):
    """If Sleeper stops stamping `season`, matching on it would find zero rows.
    Returning nothing on draft night is worse than falling back to the league's
    only draft — so the fallback exists, and it is asserted rather than assumed.
    It still refuses when the fallback is itself ambiguous (test above)."""
    fake_sleeper([{"draft_id": "unstamped"}])
    assert L.discover_draft_id() == "unstamped"


# ── THE WIRING: --sync with no argument must reach discovery ─────────────────

def test_sync_with_NO_argument_discovers_instead_of_crashing(monkeypatch, capsys):
    """The old code did `sys.argv[index+1]` unguarded, so a bare `--sync` was an
    IndexError. Now it discovers. This pins the wiring, not just the function."""
    called = {}
    monkeypatch.setattr(L, "discover_draft_id", lambda: "DISCOVERED")
    monkeypatch.setattr(L, "sync_live", lambda did: called.setdefault("did", did) or {"ok": True})
    monkeypatch.setattr(sys, "argv", ["log_draft_picks.py", "--sync"])
    assert L.main() == 0
    assert called["did"] == "DISCOVERED"


def test_an_EXPLICIT_draft_id_still_wins_over_discovery(monkeypatch):
    """Discovery is the default, never a hijack: if a human passes an id — the
    override that exists for the ambiguous case — it must be used verbatim."""
    called = {}
    monkeypatch.setattr(L, "discover_draft_id",
                        lambda: pytest.fail("discovery must not run when an id is given"))
    monkeypatch.setattr(L, "sync_live", lambda did: called.setdefault("did", did) or {"ok": True})
    monkeypatch.setattr(sys, "argv", ["log_draft_picks.py", "--sync", "EXPLICIT"])
    assert L.main() == 0
    assert called["did"] == "EXPLICIT"
