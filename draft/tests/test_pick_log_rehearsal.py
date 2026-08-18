# TERRITORY: A
"""DRAFT-NIGHT REHEARSAL — against a REAL 150-pick Sleeper draft, not a fixture.

Cory: "The freeze has proven the capture machinery against synthetic inputs. The
remaining question is operational: can the logger consume the actual Sleeper
event stream, preserve the frozen-board identity, record each pick exactly once,
and survive the conditions of draft night?"

Sleeper is BLOCKED from this sandbox — `curl api.sleeper.app` returns HTTP 000
through the proxy, and per the standing rule that is reported rather than
retried. So the rehearsal runs against the 2025 draft stored in
league_history.json: 150 real picks in Sleeper's real shape, 20 of them keepers.
That is the actual event stream, one year old, which is stronger than a fixture
I would have written to match my own assumptions.

── THE SEVEN CONDITIONS, EACH ITS OWN TEST ─────────────────────────────────

    normal sequential picks          test_1
    duplicate event                  test_2
    out-of-order event               test_3
    player unavailable at that pick  test_4
    reconnect / repeated payload     test_5
    keeper-adjusted pick clock       test_6
    final-row / write behaviour      test_7

── THE CRITICAL PROPERTY ───────────────────────────────────────────────────

"Live sync must not mutate the frozen inputs. It should append observations
against the immutable baseline."

Asserted directly: the freeze's sha256 is recomputed after the full 150-pick
stream has been logged, and the file's mtime is checked. A logger that adjusted
the baseline as it went would produce a beautifully calibrated curve about
nothing.

Run: python -m pytest draft/tests/test_pick_log_rehearsal.py -q
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))

import freeze_pre_draft as F  # noqa: E402
import log_draft_picks as L  # noqa: E402

pytestmark = pytest.mark.skipif(not F.OUT.exists(), reason="no freeze written")


def _real_draft() -> dict:
    hist = json.loads((ROOT / "draft" / "data" / "league_history.json").read_text())
    season = next(s for s in hist["seasons"] if s["season"] == "2025")
    return season["drafts"][0]


@pytest.fixture()
def log(tmp_path, monkeypatch):
    """A rehearsal NEVER touches the real log. Pointing the module at a tmp file
    is the whole isolation, so it is done in one place rather than remembered.

    The SHADOW ledger (draft_shadow.js, wired into sync() 2026-08-16) already
    follows a redirected LOG to a _shadow file beside it, so isolation holds
    without another line here. It is DISABLED for these seven conditions
    because they are the PICK path's rehearsal and each sync() would spend
    seconds recomputing engine recommendations that test_draft_shadow.py
    rehearses on purpose — a deliberate scope cut, not an isolation need."""
    p = tmp_path / "rehearsal.jsonl"
    monkeypatch.setattr(L, "LOG", p)
    monkeypatch.setenv("DRAFT_SHADOW_DISABLE", "1")
    return p


DRAFT = _real_draft()
PICKS = DRAFT["picks"]
S2R = DRAFT.get("slot_to_roster_id")


def test_CONTROL_the_rehearsal_corpus_is_a_real_draft():
    """A rehearsal against three invented picks proves nothing about 150."""
    assert len(PICKS) == 150, len(PICKS)
    assert sum(1 for p in PICKS if p.get("is_keeper")) == 20
    assert all("pick_no" in p and "player_id" in p for p in PICKS)


# ── 1. NORMAL SEQUENTIAL PICKS ──────────────────────────────────────────────
def test_1_the_whole_stream_logs_once_each_in_order(log):
    r = L.sync(PICKS, slot_to_roster=S2R)
    assert r["added"] == 150, r
    assert r["held_at_gap"] is None
    assert r["contiguous"] is True
    rows = L._rows()
    assert [x["pick"] for x in rows] == list(range(1, 151))
    assert len({x["pick"] for x in rows}) == 150


# ── 2. DUPLICATE EVENT ──────────────────────────────────────────────────────
def test_2_a_duplicate_event_is_skipped_not_doubled(log):
    L.sync(PICKS[:20], slot_to_roster=S2R)
    before = len(L._rows())
    r = L.sync(PICKS[:20], slot_to_roster=S2R)          # the same payload again
    assert r["added"] == 0
    assert len(L._rows()) == before
    # And `record` still REFUSES a duplicate — the two meanings stay apart.
    with pytest.raises(SystemExit) as e:
        L.record({"pick": 1, "player_id": "x"})
    assert "append-only" in str(e.value)


# ── 3. OUT-OF-ORDER EVENT ───────────────────────────────────────────────────
def test_3_a_payload_missing_an_earlier_pick_HOLDS_rather_than_logging_past_it(log):
    L.sync(PICKS[:10], slot_to_roster=S2R)
    # pick 11 never arrives; 12..20 do. Logging 12 would make the gone-set wrong
    # for it and for every row after it.
    truncated = [p for p in PICKS[10:20] if p["pick_no"] != 11]
    r = L.sync(truncated, slot_to_roster=S2R)
    assert r["added"] == 0, "logged past a hole"
    assert r["held_at_gap"] == 12
    assert "gone-set" in r["held_reason"]
    assert [x["pick"] for x in L._rows()] == list(range(1, 11))


def test_3b_and_it_RESUMES_the_moment_the_hole_is_filled(log):
    L.sync(PICKS[:10], slot_to_roster=S2R)
    L.sync([p for p in PICKS[10:20] if p["pick_no"] != 11], slot_to_roster=S2R)
    r = L.sync(PICKS[:20], slot_to_roster=S2R)          # full payload returns
    assert r["added"] == 10 and r["held_at_gap"] is None
    assert [x["pick"] for x in L._rows()] == list(range(1, 21))


# ── 4. PLAYER UNAVAILABLE AT THE RECORDED PICK ──────────────────────────────
def test_4_a_player_absent_from_the_frozen_board_still_logs(log):
    """2025's draft contains players who are not on the 2026 board at all. A
    logger that dropped them would silently shrink the gone-set and inflate
    every downstream recommendation; one that crashed would stop the capture
    mid-draft. It must log the pick and record the absence."""
    fz = json.loads(F.OUT.read_text())
    known = {str(p["player_id"]) for p in fz["players"]}
    unknown = [p for p in PICKS if str(p["player_id"]) not in known]
    assert unknown, "the corpus has no unknown players — this test is vacuous"
    L.sync(PICKS, slot_to_roster=S2R)
    rows = {r["pick"]: r for r in L._rows()}
    for p in unknown[:5]:
        row = rows[p["pick_no"]]
        assert row["player_id"] == str(p["player_id"])
        # No frozen curve exists for him, and that reads as null rather than 0.
        assert row["availability_at_my_next_pick"] is None
    assert len(rows) == 150, "unknown players were dropped from the log"


# ── 5. RECONNECT / REPEATED PAYLOAD ─────────────────────────────────────────
def test_5_repeated_polls_across_a_reconnect_converge_to_exactly_150(log):
    """The draft-night loop: overlapping payloads, some replayed from the start
    after a reconnect. The log must be the same either way."""
    for cut in (7, 7, 30, 12, 30, 90, 90, 150, 150):
        L.sync(PICKS[:cut], slot_to_roster=S2R)
    rows = L._rows()
    assert [x["pick"] for x in rows] == list(range(1, 151))
    assert len(rows) == 150


# ── 6. KEEPER-ADJUSTED PICK CLOCK ───────────────────────────────────────────
def test_6_keepers_occupy_picks_and_are_marked_NOT_selections(log):
    """150 picks, 20 keepers. Both remove a player from the pool; only one is a
    decision. Collapsing them is the `picks` versus `live_picks` defect that put
    the board on pick 8, so the log keeps them apart per row."""
    L.sync(PICKS, slot_to_roster=S2R)
    rows = L._rows()
    keepers = [r for r in rows if r.get("is_keeper")]
    assert len(keepers) == 20, len(keepers)
    assert len(rows) == 150, "keepers were removed from the pick sequence"
    # They still consume board slots, so the numbering stays uncompressed.
    assert max(r["pick"] for r in rows) == 150
    # And a keeper still counts as gone: later recommendations must not offer him.
    kept_ids = {r["player_id"] for r in keepers}
    last = rows[-1]
    assert not (kept_ids & {c["player_id"] for c in last["old_path_recommendation"]}), \
        "a kept player is still being recommended after his slot passed"


# ── 7. FINAL-ROW / WRITE BEHAVIOUR ──────────────────────────────────────────
def test_7_every_row_is_complete_newline_terminated_and_reparseable(log):
    L.sync(PICKS, slot_to_roster=S2R)
    raw = log.read_text()
    assert raw.endswith("\n"), "last row not newline-terminated — a truncated " \
                               "final write is how the last pick goes missing"
    lines = [l for l in raw.splitlines() if l.strip()]
    assert len(lines) == 150
    for l in lines:
        json.loads(l)                      # every line independently parseable
    last = json.loads(lines[-1])
    assert last["pick"] == 150
    assert last["my_next_pick"] is None, \
        "there is no pick of mine after 150; this must be null, not a wrap-around"


# ── THE CRITICAL PROPERTY ───────────────────────────────────────────────────
def test_THE_LIVE_SYNC_DOES_NOT_MUTATE_THE_FROZEN_BASELINE(log):
    """Append observations against an immutable baseline. A logger that adjusted
    the freeze as it went would yield a beautifully calibrated curve about
    nothing, and nothing else here would notice."""
    before_bytes = F.OUT.read_bytes()
    before_mtime = F.OUT.stat().st_mtime
    L.sync(PICKS, slot_to_roster=S2R)
    assert F.OUT.read_bytes() == before_bytes, "the freeze file CHANGED"
    assert F.OUT.stat().st_mtime == before_mtime, "the freeze was rewritten"
    doc = json.loads(F.OUT.read_text())
    assert doc["_sha256_of_payload"] == F._sha(
        {k: v for k, v in doc.items() if k != "_sha256_of_payload"})


def test_every_row_names_the_board_that_made_its_predictions(log):
    """A log joined to a different freeze than produced its numbers is worthless
    and looks fine. The sha travels per row, not per file."""
    L.sync(PICKS[:40], slot_to_roster=S2R)
    fz_sha = json.loads(F.OUT.read_text())["_sha256_of_payload"]
    assert all(r["freeze_sha256"] == fz_sha for r in L._rows())
    assert len(fz_sha) == 64


def test_an_empty_sleeper_read_REFUSES_rather_than_logging_an_untouched_board():
    """`or []` again: an empty response is a broken read, not an empty draft."""
    class _SI:
        @staticmethod
        def fetch_draft_picks(_, **kw):     # accepts live=True like the real one
            return []
    sys.modules["sleeper_import"] = _SI
    try:
        with pytest.raises(SystemExit) as e:
            L.sync_live("whatever")
        assert "not an empty draft" in str(e.value)
    finally:
        del sys.modules["sleeper_import"]
