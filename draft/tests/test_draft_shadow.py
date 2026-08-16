# TERRITORY: A
"""THE SHADOW LEDGER'S REHEARSAL — the tool's recommendation at EVERY pick,
captured by the SAME --sync that logs the pick, against the real 2025 stream.

Cory's ruling (2026-08-16, "Do 2"): stop grading only my 12 picks. Draft night
is ~150 decisions by ten managers, and each one is a room-vs-tool disagreement
January can grade — IF the tool's recommendation at that moment was written
down while it was still a prediction. draft/tools/draft_shadow.js writes it
down; log_draft_picks.sync() invokes it on every poll with ZERO new operator
steps. This file rehearses that whole path the way test_pick_log_rehearsal.py
rehearses pick capture: against the 2025 draft stored in league_history.json
(150 real Sleeper-shaped picks, 20 keepers), not against a fixture written to
match my own assumptions.

The row ARITHMETIC (gap, rank, top3, seat clock) is pinned by hand in
draft/tests/draft_shadow.test.js. This file proves the operational claims:

    zero-step wiring through sync()           test_1
    idempotence across polls                  test_2
    determinism given (board, freeze, log)    test_3
    keepers are never graded, selections are  test_4
    the gone-set is honest                    test_5
    identity stamps on every row              test_6
    a shadow failure cannot block the pick    test_7

Run: python -m pytest draft/tests/test_draft_shadow.py -q
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))

import freeze_pre_draft as F  # noqa: E402
import log_draft_picks as L  # noqa: E402

pytestmark = pytest.mark.skipif(not F.OUT.exists(), reason="no freeze written")

# 24 picks = a real mix (2025 opens with a run of keepers, then selections)
# while keeping the engine work to ~a second. The FULL 150 are exercised by
# test_pick_log_rehearsal.py on the pick side; the shadow's per-pick machinery
# is identical from pick 25 to pick 150 — same loop, same state accretion.
N = 24


def _real_picks(n: int = N) -> tuple[list, dict]:
    hist = json.loads((ROOT / "draft" / "data" / "league_history.json").read_text())
    season = next(s for s in hist["seasons"] if s["season"] == "2025")
    d = season["drafts"][0]
    return d["picks"][:n], d.get("slot_to_roster_id")


@pytest.fixture()
def log(tmp_path, monkeypatch):
    """Isolation is ONE monkeypatch: the shadow derives its path from LOG at
    call time, so redirecting the pick log redirects the shadow beside it —
    the exact property draft-night-sync.yml's dry_run depends on."""
    p = tmp_path / "rehearsal.jsonl"
    monkeypatch.setattr(L, "LOG", p)
    monkeypatch.delenv("DRAFT_SHADOW_DISABLE", raising=False)
    monkeypatch.delenv("DRAFT_SHADOW_LOG_PATH", raising=False)
    return p


def _shadow_rows_at(log_path: Path) -> list[dict]:
    p = log_path.with_name(log_path.stem + "_shadow" + log_path.suffix)
    if not p.exists():
        return []
    return [json.loads(l) for l in p.read_text().splitlines() if l.strip()]


# ── 1. ZERO-STEP WIRING ─────────────────────────────────────────────────────
def test_1_sync_shadows_every_logged_pick_with_no_extra_call(log):
    picks, s2r = _real_picks()
    r = L.sync(picks, slot_to_roster=s2r)
    assert r["added"] == N
    sh = r["shadow"]
    assert sh["ok"] is True, sh
    assert sh["added"] == N and sh["lag"] == 0, sh
    # The shadow landed BESIDE the redirected log — the isolation guarantee.
    rows = _shadow_rows_at(log)
    assert [x["pick_no"] for x in rows] == list(range(1, N + 1))


# ── 2. IDEMPOTENCE (draft night is a poll loop) ─────────────────────────────
def test_2_a_repeated_poll_adds_no_shadow_rows(log):
    picks, s2r = _real_picks()
    L.sync(picks, slot_to_roster=s2r)
    before = _shadow_rows_at(log)
    r = L.sync(picks, slot_to_roster=s2r)          # same payload again
    assert r["shadow"]["ok"] is True and r["shadow"]["added"] == 0, r["shadow"]
    assert _shadow_rows_at(log) == before
    # And an INCREMENTAL poll shadows only the new picks, with state that
    # matches a from-scratch run (test_3 proves the equality).
    more, _ = _real_picks(N + 4)
    r2 = L.sync(more, slot_to_roster=s2r)
    assert r2["shadow"]["added"] == 4, r2["shadow"]
    assert [x["pick_no"] for x in _shadow_rows_at(log)] == list(range(1, N + 5))


# ── 3. DETERMINISM — capture equals recompute, byte for byte, minus the stamp ─
def test_3_the_same_inputs_reproduce_every_row_except_captured_at(log):
    picks, s2r = _real_picks()
    L.sync(picks, slot_to_roster=s2r)
    first = _shadow_rows_at(log)

    out2 = log.with_name("independent_shadow.jsonl")
    r = subprocess.run(
        ["node", str(ROOT / "draft" / "tools" / "draft_shadow.js"), "--sync",
         "--pick-log", str(log), "--out", str(out2)],
        capture_output=True, text=True, timeout=300, cwd=str(ROOT))
    assert r.returncode == 0, r.stderr
    second = [json.loads(l) for l in out2.read_text().splitlines()]

    def strip(rows):
        return [{k: v for k, v in row.items() if k != "captured_at"} for row in rows]

    assert strip(first) == strip(second)
    # captured_at exists on every row and is the ONLY difference — it is the
    # forward guarantee, not decoration.
    assert all(row.get("captured_at") for row in first)


# ── 4. KEEPERS ARE NOT DECISIONS; SELECTIONS ALL GET A RECOMMENDATION ───────
def test_4_keepers_null_with_reason_selections_recommended(log):
    picks, s2r = _real_picks()
    L.sync(picks, slot_to_roster=s2r)
    rows = _shadow_rows_at(log)
    keepers = [x for x in rows if x["is_keeper"]]
    selections = [x for x in rows if x["is_selection"]]
    assert keepers and selections, "the 2025 opening must contain both"
    for k in keepers:
        assert k["tool_recommendation"] is None
        assert "keeper" in k["tool_recommendation_reason"]
        assert k["composite_gap"] is None
    for s in selections:
        assert s["tool_recommendation"] is not None, s["pick_no"]
        assert len(s["top3"]) == 3
        assert s["seat"] is not None            # freeze snake-geometry fallback
        assert "freeze" in s["seat_source"]     # (the 2025 stream has no slots)
        if s["actual_rank_in_tool"] == 1:
            assert s["composite_gap"] == 0


# ── 5. THE GONE-SET IS HONEST ───────────────────────────────────────────────
def test_5_no_recommendation_names_an_already_drafted_player(log):
    picks, s2r = _real_picks()
    L.sync(picks, slot_to_roster=s2r)
    gone: set[str] = set()
    for row, pick in zip(_shadow_rows_at(log), picks):
        for cand in (row["top3"] or []):
            assert cand["player_id"] not in gone, (
                "pick %d recommends %s, drafted earlier" % (row["pick_no"], cand))
        gone.add(str(pick["player_id"]))


# ── 6. IDENTITY — a row joined to the wrong board looks exactly like a good one
def test_6_every_row_is_stamped_with_freeze_and_board_identity(log):
    picks, s2r = _real_picks(8)
    L.sync(picks, slot_to_roster=s2r)
    fz = json.loads(F.OUT.read_text())
    board_sha = hashlib.sha256(
        (ROOT / "public" / "draft_data.json").read_bytes()).hexdigest()
    for row in _shadow_rows_at(log):
        assert row["freeze_sha256"] == fz["_sha256_of_payload"]
        assert row["board_sha256"] == board_sha
        assert row["board_matches_freeze_source"] == (
            board_sha == fz["source_artifact_sha256"])


# ── 7. A SHADOW FAILURE IS REPORTED, NEVER A LOST PICK ──────────────────────
def test_7_a_broken_shadow_tool_cannot_block_pick_capture(log, monkeypatch):
    monkeypatch.setattr(L, "SHADOW_TOOL", ROOT / "draft" / "tools"
                        / "does_not_exist.js")
    picks, s2r = _real_picks(4)
    r = L.sync(picks, slot_to_roster=s2r)
    assert r["added"] == 4                      # the pick log is intact…
    assert r["shadow"]["ok"] is False           # …and the failure is IN the
    assert r["shadow"]["error"]                 # result, not swallowed.


def test_7b_the_kill_switch_is_explicit_and_says_so(log, monkeypatch):
    monkeypatch.setenv("DRAFT_SHADOW_DISABLE", "1")
    picks, s2r = _real_picks(4)
    r = L.sync(picks, slot_to_roster=s2r)
    assert r["shadow"] == {"ok": True, "disabled": True,
                           "why": r["shadow"]["why"]}
    assert _shadow_rows_at(log) == []
