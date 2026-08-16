# TERRITORY: A
"""CHAOS DRILL (Cory's ruling, 2026-08-16) — the pick logger under hostile input.

THE BAR, verbatim from the ruling: every failure must be LOUD AND NAMED — a
specific on-screen or logged diagnostic. Never a silent wrong number; never a
crash without a message pointing at the cause.

The rehearsal suite (test_pick_log_rehearsal.py) proved the logger against a
REAL 150-pick stream behaving the way Sleeper behaves when it is healthy. This
file injects the ways Sleeper misbehaves. What the drill FOUND at baseline
(2026-08-16, evidence in draft/audit/chaos_drill_2026-08-16.md):

  A. an error body ({"error": ...} — valid JSON!) crashed as
     `AttributeError: 'str' object has no attribute 'get'`, three calls from
     the cause, naming neither Sleeper nor the payload;
  B. a non-integer pick_no crashed as `ValueError: invalid literal for int()`;
  C. one pick number carried by TWO different players in one payload reported
     a GAP THAT DOES NOT EXIST ("pick 2 arrived while 3 is still missing") and
     returned `skipped: -1` — a negative count out of the tool whose whole job
     is refusing wrong numbers;
  D. Sleeper re-serving an ALREADY-LOGGED pick with a different player
     (undo/redo on their side) was skipped in total silence — the log stayed
     out of step with Sleeper's record forever;
  E. replacing the freeze mid-draft was silent AT APPEND TIME — record() wrote
     mixed-sha rows and only --status (whose exit code nothing on the
     draft-night path enforces) would mention it afterwards;
  F. THE HOUR-STALE POLL LOOP: sleeper_import's 1-hour on-disk cache served
     the FIRST poll's snapshot to every subsequent poll, so the 20s draft-night
     loop would trail the live draft by up to an hour reporting added:0. The
     2026-08-15 dry-run rehearsal could not see this because a COMPLETED
     draft's pick list never changes between polls.

Every test here is deterministic and self-contained: a synthetic freeze in
tmp_path, no network, no repo state.

Run: python -m pytest draft/tests/chaos_drill_pick_log_test.py -q
"""
from __future__ import annotations

import hashlib
import io
import json
import sys
from contextlib import redirect_stdout
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))

import log_draft_picks as L  # noqa: E402
import sleeper_import as si  # noqa: E402


# ── the synthetic board: 20 players, my picks at 5 and 10, 15 total picks ────
def _freeze_payload(prefix: str = "P") -> dict:
    players = [{"player_id": str(100 + i), "name": "%s%d" % (prefix, i),
                "position": "RB", "vorp": 50.0 - i, "proj_mean": 100.0 - i}
               for i in range(20)]
    payload = {"players": players, "my_picks": [5, 10],
               "availability_by_pick": {"105": {"10": 0.4}},
               "pick_order": {"picks": list(range(1, 16))}}
    sha = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    payload["_sha256_of_payload"] = sha
    return payload


@pytest.fixture()
def board(tmp_path, monkeypatch):
    """Fresh freeze + empty log per test — the drill never touches repo state."""
    fz = tmp_path / "freeze.json"
    fz.write_text(json.dumps(_freeze_payload()))
    monkeypatch.setattr(L, "FREEZE", fz)
    monkeypatch.setattr(L, "LOG", tmp_path / "log.jsonl")
    return tmp_path


def pick(no, pid):
    return {"pick_no": no, "player_id": pid, "draft_slot": 1, "metadata": {}}


def test_CONTROL_a_clean_stream_still_logs(board):
    """The drill's own fixture must work under normal conditions, or every
    refusal below could be the fixture failing rather than the injection."""
    r = L.sync([pick(i, str(100 + i)) for i in range(1, 6)])
    assert r["added"] == 5 and r["held_at_gap"] is None and r["contiguous"]
    assert r["pick_conflicts"] == []


# ── INJECTION A: malformed JSON — Sleeper's error body ──────────────────────
def test_A_an_error_object_REFUSES_by_name_instead_of_crashing(board):
    """{"error": "..."} parses as JSON. Before the fix this died mid-expression
    as AttributeError with a traceback naming a dict-iteration accident."""
    with pytest.raises(SystemExit) as e:
        L.sync({"error": "draft not found"})
    msg = str(e.value)
    assert "not a list of picks" in msg          # names the shape
    assert "draft not found" in msg              # quotes the payload itself
    assert "next poll retries" in msg            # names the recovery


def test_A2_a_half_garbage_list_REFUSES_naming_the_entry(board):
    with pytest.raises(SystemExit) as e:
        L.sync([pick(1, "101"), "<<html garbage>>"])
    msg = str(e.value)
    assert "not pick objects" in msg and "html garbage" in msg


# ── INJECTION B: malformed pick_no ──────────────────────────────────────────
def test_B_a_non_integer_pick_no_REFUSES_naming_the_pick(board):
    """Before: ValueError: invalid literal for int() with base 10: 'abc' —
    true, and useless at 8pm on draft night."""
    with pytest.raises(SystemExit) as e:
        L.sync([pick("abc", "101")])
    msg = str(e.value)
    assert "pick_no='abc'" in msg and "player_id='101'" in msg
    assert "next poll retries" in msg


def test_B2_a_string_digit_pick_no_still_works(board):
    """Sleeper serves numbers as strings in places. int('7') is not malformed."""
    r = L.sync([pick("1", "101"), pick("2", "102")])
    assert r["added"] == 2


# ── INJECTION C: duplicate pick numbers ─────────────────────────────────────
def test_C_two_players_on_one_pick_number_HOLDS_and_names_the_DUPLICATE(board):
    """Before the fix this reported a phantom gap ("pick 2 arrived while 3 is
    still missing" — 3 was right there in the payload) and skipped:-1."""
    r = L.sync([pick(1, "101"), pick(2, "102"), pick(2, "103"), pick(3, "104")])
    assert r["held_at_gap"] == 2
    assert "TWICE" in r["held_reason"]
    assert "102" in r["held_reason"] and "103" in r["held_reason"]
    assert "missing" not in r["held_reason"], "still blaming a gap that does not exist"
    assert r["skipped"] >= 0, "a negative count is a silent wrong number"
    # nothing at or after the corrupt number was logged
    assert [x["pick"] for x in L._rows()] == [1]


def test_C2_the_same_event_twice_in_one_payload_is_skipped_quietly(board):
    """A repeated event (same pick, same player) is the reconnect-normal case,
    not corruption — it must not hold the log."""
    r = L.sync([pick(1, "101"), pick(1, "101"), pick(2, "102")])
    assert r["added"] == 2 and r["held_at_gap"] is None
    assert r["skipped"] == 1


def test_C3_and_a_clean_payload_on_the_next_poll_RESUMES(board):
    L.sync([pick(1, "101"), pick(2, "102"), pick(2, "103"), pick(3, "104")])
    r = L.sync([pick(1, "101"), pick(2, "102"), pick(3, "104")])
    assert r["added"] == 2 and r["held_at_gap"] is None
    assert [x["pick"] for x in L._rows()] == [1, 2, 3]


# ── INJECTION D: Sleeper contradicting the already-written log ──────────────
def test_D_a_relogged_pick_with_a_DIFFERENT_player_is_REPORTED_not_swallowed(board):
    """Commissioner undo/redo: pick 2 was logged as 102, Sleeper now says 103.
    Append-only means nothing is rewritten — but before the fix the
    disagreement vanished into a `continue` and nobody would ever know."""
    L.sync([pick(1, "101"), pick(2, "102")])
    r = L.sync([pick(1, "101"), pick(2, "103"), pick(3, "104")])
    assert len(r["pick_conflicts"]) == 1
    c = r["pick_conflicts"][0]
    assert c["pick"] == 2
    assert c["logged_player_id"] == "102" and c["sleeper_player_id"] == "103"
    assert "supersedes" in c["note"], "the report must say what the operator does about it"
    # and the log itself was NOT rewritten — append-only survives the conflict
    assert [x["player_id"] for x in L._rows()] == ["101", "102", "104"]


def test_D2_normal_repolling_reports_ZERO_conflicts(board):
    """The stale-repeated payload is draft night's NORMAL case — five identical
    polls must stay conflict-free or the warning becomes noise."""
    payload = [pick(i, str(100 + i)) for i in range(1, 6)]
    for _ in range(5):
        r = L.sync(payload)
    assert r["added"] == 0 and r["pick_conflicts"] == [] and r["held_at_gap"] is None
    assert len(L._rows()) == 5


# ── INJECTION E: the freeze replaced mid-draft ──────────────────────────────
def test_E_a_swapped_freeze_REFUSES_AT_APPEND_naming_both_shas(board, monkeypatch):
    """A log spanning two boards looks exactly like a good one. Before the fix
    the mix was silent at append time; only --status would mention it, and
    nothing on the draft-night path enforces status's exit code."""
    L.sync([pick(1, "101"), pick(2, "102")])
    old_sha = json.loads(L.FREEZE.read_text())["_sha256_of_payload"]
    fz2 = board / "freeze2.json"
    fz2.write_text(json.dumps(_freeze_payload(prefix="Q")))
    new_sha = json.loads(fz2.read_text())["_sha256_of_payload"]
    monkeypatch.setattr(L, "FREEZE", fz2)
    with pytest.raises(SystemExit) as e:
        L.sync([pick(1, "101"), pick(2, "102"), pick(3, "104")])
    msg = str(e.value)
    assert old_sha[:12] in msg and new_sha[:12] in msg, "must name BOTH boards"
    assert "freeze changed mid-draft" in msg.lower() or "changed mid-draft" in msg
    assert len(L._rows()) == 2, "refusal must leave the log untouched"


def test_E2_status_on_a_mixed_log_is_loud_and_exits_nonzero(board, capsys):
    """The guard above stops NEW mixes; --status remains the detector for a log
    that already carries one (written before the guard, or by hand)."""
    fz_sha = json.loads(L.FREEZE.read_text())["_sha256_of_payload"]
    rows = [
        {"pick": 1, "player_id": "101", "is_mine": False,
         "availability_at_my_next_pick": None, "freeze_sha256": fz_sha},
        {"pick": 2, "player_id": "102", "is_mine": False,
         "availability_at_my_next_pick": None, "freeze_sha256": "beef" * 16},
    ]
    L.LOG.write_text("".join(json.dumps(r) + "\n" for r in rows))
    rc = L.status()
    out = capsys.readouterr().out
    assert rc == 1, "a mixed log must not exit 0"
    assert "DIFFERENT freeze" in out and "[2]" in out


# ── INJECTION F: the hour-stale poll loop ───────────────────────────────────
class _Resp:
    def __init__(self, body): self._b = body
    def read(self): return self._b
    def __enter__(self): return self
    def __exit__(self, *a): return False


def test_F_live_polling_BYPASSES_the_one_hour_cache(tmp_path, monkeypatch):
    """Draft night polls every 20s; the cache served poll 1's snapshot to every
    poll for an hour. live=True must hit the network every time."""
    monkeypatch.setattr(si, "CACHE", tmp_path / "cache")
    calls = {"n": 0}

    def fake_urlopen(url, timeout=None):
        calls["n"] += 1
        return _Resp(json.dumps(
            [{"pick_no": i + 1} for i in range(calls["n"])]).encode())

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    first = si.fetch_draft_picks("999", live=True)
    second = si.fetch_draft_picks("999", live=True)   # 20 seconds later
    assert len(first) == 1 and len(second) == 2, \
        "the second poll served the on-disk cache — the live draft is invisible"
    assert calls["n"] == 2

    # CONTROL: the default (historical/completed drafts) still caches —
    # build.py and history_export re-read the same finished drafts and Sleeper
    # is a free API; politeness there is the point of the cache.
    third = si.fetch_draft_picks("999")
    assert calls["n"] == 2, "default callers must keep the cache"
    assert len(third) == 2


def test_F2_sync_live_asks_for_the_live_read(board, monkeypatch):
    """The bypass only matters if the draft-night entry point USES it — pin the
    plumbing, not just the capability."""
    seen = {}

    class _SI:
        @staticmethod
        def fetch_draft_picks(_id, **kw):
            seen.update(kw)
            return [pick(1, "101")]

    monkeypatch.setitem(sys.modules, "sleeper_import", _SI)
    r = L.sync_live("whatever")
    assert seen.get("live") is True, \
        "sync_live took the cached path — the hour-stale loop is back"
    assert r["added"] == 1


# ── the boring case that must stay boring ───────────────────────────────────
def test_an_unknown_player_id_still_logs_with_a_null_prediction(board):
    """Not on the frozen board at all: the pick logs (it is gone from the pool
    either way), the prediction reads null rather than a fabricated zero."""
    r = L.sync([pick(1, "999999")])
    assert r["added"] == 1
    row = L._rows()[0]
    assert row["player_id"] == "999999"
    assert row["availability_at_my_next_pick"] is None
