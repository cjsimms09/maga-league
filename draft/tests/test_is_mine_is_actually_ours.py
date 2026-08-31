# TERRITORY: A
"""`is_mine` MUST BE ABLE TO BE TRUE ON THE LIVE PATH.

WHAT HAPPENED. The 2026 draft logged 150 rows and `is_mine` was False on every
one of them, Cory's twelve picks included. `_from_sleeper()` builds a pick entry
from Sleeper's payload and has never set `is_mine`; `record()` wrote
`bool(entry.get("is_mine"))`, which is `bool(None)`, which is False. The field
could not be True on the live path — not "was wrong sometimes", but structurally
incapable — because nothing on that path knew which seat was ours.

WHY NO TEST CAUGHT IT. Every existing test either records entries by hand (and
hand-written entries can set `is_mine` themselves, so they exercised the copy
and never the derivation) or asserted on picks, gaps and refusals rather than on
ownership. `--status` printed `mine: 0 of 12` on screen during the live draft
and its exit code gated nothing. A false that is always false looks exactly like
a false that is correctly false.

RULE 3e, WHICH IS THE WHOLE POINT OF THIS FILE. A flag that only ever reads
False has not been tested, only run. So the load-bearing test here is the
POSITIVE one: an entry arriving the way Sleeper actually delivers it — with a
`team_slot` and NO `is_mine` key — must come back True. A suite that only
checked "someone else's pick is not mine" would have passed against the shipped
defect at every commit for the life of the repo.

Run: python -m pytest draft/tests/test_is_mine_is_actually_ours.py -q
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

MY_SLOT = 3
MY_PICKS = [4, 9]


def _freeze_payload() -> dict:
    """A 9-pick, 3-seat snake whose seat 3 owns overalls 3, 4 and 9 — the same
    shape as the real freeze (pick_order.picks is a list of DICTS carrying
    `overall`, `slot` and `keeper_slot`), because the derivation reads exactly
    those fields.

    The first cut of this fixture declared my_picks [4, 7], which in a 3-seat
    snake belong to two DIFFERENT seats — so my_slot() correctly returned None
    and the control failed on its first run. Worth recording: the control
    caught the test's own geometry, which is the only reason the rest of this
    file means anything.
    """
    picks = []
    for overall in range(1, 10):
        rnd = (overall - 1) // 3 + 1
        pos = (overall - 1) % 3
        slot = pos + 1 if rnd % 2 == 1 else 3 - pos
        picks.append({"overall": overall, "round": rnd, "slot": slot,
                      "keeper_slot": False})
    players = [{"player_id": str(100 + i), "name": "P%d" % i, "position": "RB",
                "vorp": 50.0 - i, "proj_mean": 100.0 - i} for i in range(20)]
    payload = {"players": players, "my_picks": MY_PICKS,
               "availability_by_pick": {}, "pick_order": {"picks": picks}}
    payload["_sha256_of_payload"] = hashlib.sha256(
        json.dumps(payload, sort_keys=True).encode()).hexdigest()
    return payload


@pytest.fixture()
def board(tmp_path, monkeypatch):
    fz = tmp_path / "freeze.json"
    fz.write_text(json.dumps(_freeze_payload()))
    monkeypatch.setattr(L, "FREEZE", fz)
    monkeypatch.setattr(L, "LOG", tmp_path / "log.jsonl")
    return tmp_path


def _sleeper_entry(pick_no: int, slot: int, pid: str, keeper: bool = False) -> dict:
    """Exactly the shape `_from_sleeper()` produces — note there is NO
    `is_mine` key, which is the whole defect."""
    return {"pick": pick_no, "team_slot": slot, "player_id": pid,
            "player_name": "P%s" % pid, "position": "RB", "is_keeper": keeper}


# ── THE CONTROL: the seat derivation itself ─────────────────────────────────
def test_CONTROL_my_slot_reads_our_seat_off_the_freeze(board):
    assert L.my_slot(json.loads(Path(L.FREEZE).read_text())) == MY_SLOT


def test_my_slot_returns_None_rather_than_guessing_on_an_odd_freeze(board):
    """A wrong seat silently relabels another owner's draft as ours, which is
    worse than an absent flag. The chaos drill's synthetic freeze carries
    `pick_order.picks` as plain INTS, and the unguarded form raised
    AttributeError from inside a field derivation."""
    assert L.my_slot({"my_picks": [5], "pick_order": {"picks": [1, 2, 3]}}) is None
    assert L.my_slot({"my_picks": [], "pick_order": {"picks": []}}) is None
    assert L.my_slot({}) is None


# ── THE LOAD-BEARING POSITIVE (Rule 3e) ─────────────────────────────────────
def test_a_live_sleeper_entry_at_our_seat_is_MINE(board):
    """THE TEST THE REPO DID NOT HAVE. This is the exact entry shape that
    produced False 150 times in 2026."""
    row = L.record(_sleeper_entry(4, MY_SLOT, "104"))
    assert row["is_mine"] is True, (
        "a pick at our own seat, arriving the way Sleeper delivers it, must be "
        "ours — this is the 2026 defect and it is the only assertion here that "
        "would have caught it")
    assert row["my_slot_source"] == "pre_draft_freeze my_picks -> pick_order slot"


def test_someone_elses_pick_is_not_ours(board):
    row = L.record(_sleeper_entry(1, 1, "101"))
    assert row["is_mine"] is False


def test_our_keeper_is_ours_too(board):
    """Ownership is a property of the SEAT, not of whether a decision was made.
    Deriving from `my_picks` alone would have missed all three of Cory's
    keepers, which is why the derivation goes through the seat."""
    row = L.record(_sleeper_entry(1, MY_SLOT, "101", keeper=True))
    assert row["is_mine"] is True
    assert row["is_keeper"] is True


def test_an_explicit_flag_on_the_entry_still_wins(board):
    """Hand-recorded rows and tests must be able to state their own truth;
    only the ABSENT case derives."""
    e = _sleeper_entry(4, MY_SLOT, "104")
    e["is_mine"] = False
    row = L.record(e)
    assert row["is_mine"] is False
    assert row["my_slot_source"] == "explicit on the entry"


# ── my_actual_pick: derived, because the row IS the pick ────────────────────
def test_my_actual_pick_is_filled_for_our_own_live_picks(board):
    """None on all 150 rows in 2026. Cory: "the why behind your twelve
    decisions is unrecoverable". The WHAT never needed a human at all."""
    row = L.record(_sleeper_entry(4, MY_SLOT, "104"))
    assert row["my_actual_pick"] == {"player_id": "104", "name": "P104",
                                     "position": "RB", "pick": 4}


def test_my_actual_pick_stays_null_for_other_seats_and_for_keepers(board):
    assert L.record(_sleeper_entry(1, 1, "101"))["my_actual_pick"] is None
    assert L.record(_sleeper_entry(2, MY_SLOT, "102",
                                   keeper=True))["my_actual_pick"] is None


def test_my_deviation_reason_is_the_ONE_field_left_for_a_human(board):
    """Everything else on the row is derivable and is now derived. This one is
    not, and pretending otherwise would fabricate a reason."""
    assert L.record(_sleeper_entry(4, MY_SLOT, "104"))["my_deviation_reason"] is None
    e = _sleeper_entry(9, MY_SLOT, "109")
    e["my_deviation_reason"] = "took the handcuff, tool wanted the WR"
    assert L.record(e)["my_deviation_reason"] == "took the handcuff, tool wanted the WR"


# ── --status must FAIL, not merely mention it ──────────────────────────────
def test_status_REFUSES_when_no_logged_pick_is_ours(board, monkeypatch):
    """`mine: 0 of 12` was true, on screen, during the live 2026 draft, and
    exited 0. A count that can be wrong has to be able to fail."""
    L.record(_sleeper_entry(1, 1, "101"))
    L.record(_sleeper_entry(2, 2, "102"))
    monkeypatch.setattr(L, "my_slot", lambda fz: None)   # seat underivable
    buf = io.StringIO()
    with redirect_stdout(buf):
        rc = L.status()
    assert rc == 1
    out = buf.getvalue()
    assert "NOT ONE is" in out and "is_mine" in out


def test_status_is_green_when_our_picks_are_present(board):
    """The refusal above must be able to NOT fire, or it is just a broken
    build rather than a guard."""
    L.record(_sleeper_entry(1, 1, "101"))
    L.record(_sleeper_entry(4, MY_SLOT, "104"))
    buf = io.StringIO()
    with redirect_stdout(buf):
        rc = L.status()
    assert rc == 0
    assert "1 of 2 live picks" in buf.getvalue()


def test_status_counts_keepers_apart_from_live_picks(board):
    """The first honest run of this fix printed "mine: 15 of 12" against the
    real 2026 log — a ratio above 1, because keepers were being counted into a
    total that means live picks only."""
    L.record(_sleeper_entry(1, MY_SLOT, "101", keeper=True))
    L.record(_sleeper_entry(4, MY_SLOT, "104"))
    buf = io.StringIO()
    with redirect_stdout(buf):
        L.status()
    assert "1 of 2 live picks (+1 keepers)" in buf.getvalue()


# ── the historical log stays readable without being rewritten ──────────────
def test_the_real_2026_log_is_recoverable_without_editing_it():
    """The 2026 rows carry `is_mine: false` forever — the log is append-only
    and a log you rewrite is a log that flatters itself. But `team_slot` was
    captured correctly all along, so ownership is derivable for every past row.
    This is the assertion that the autopsy can be written at all."""
    log = ROOT / "draft" / "data" / "draft_pick_log_2026.jsonl"
    freeze = ROOT / "draft" / "data" / "pre_draft_freeze_2026.json"
    if not log.exists() or not freeze.exists():
        pytest.skip("2026 artifacts not present in this checkout")
    fz = json.loads(freeze.read_text())
    rows = [json.loads(l) for l in log.read_text().splitlines() if l.strip()]
    slot = L.my_slot(fz)
    assert slot is not None, "our seat must be derivable from the shipped freeze"
    ours = [r for r in rows if r.get("team_slot") == slot]
    live = [r for r in ours if not r.get("is_keeper")]
    assert len(live) == len(fz["my_picks"]) == 12
    assert len(ours) - len(live) == 3, "three keepers at our seat"
    # And the record of the defect itself, so it cannot quietly come back as
    # "that was always fine".
    assert not any(r.get("is_mine") for r in rows), (
        "the 2026 log's is_mine is False on all 150 rows — if this ever fails, "
        "the log was rewritten, which the format forbids")


# ── the keeper-name truncation, which hit ONLY our own keepers ─────────────
def test_a_player_missing_from_the_pool_still_gets_a_FULL_name():
    """Three rows of the 2026 log carry "Ja'Marr", "Derrick", "Kenneth" — a
    first name and nothing else. All three are CORY'S keepers, at his seat;
    the other 20 keepers in the draft carry full names, which is why this never
    read as "keepers are broken" and read as nothing at all.

    Mechanism, and it is the `is_mine` mechanism again: OUR keepers are removed
    from the board pool by design, so `players.get(pid)` misses for them and
    only for them, and the fallback fired. The old fallback was `first_name`
    alone. A first name joins to nothing."""
    sleeper_pick = {"pick_no": 8, "player_id": "7564", "draft_slot": 8,
                    "is_keeper": True,
                    "metadata": {"first_name": "Ja'Marr", "last_name": "Chase",
                                 "position": "WR"}}
    row = L._from_sleeper(sleeper_pick, {}, {})     # empty pool — the real case
    assert row["player_name"] == "Ja'Marr Chase"
    assert row["position"] == "WR"


def test_the_pool_still_wins_when_it_has_the_player():
    """The fallback must stay a fallback — this is the 20-of-23 case that was
    working all along and must not change."""
    pool = {"9221": {"name": "Jahmyr Gibbs", "position": "RB"}}
    row = L._from_sleeper({"pick_no": 3, "player_id": "9221", "draft_slot": 1,
                           "metadata": {"first_name": "J", "last_name": "G"}},
                          {}, pool)
    assert row["player_name"] == "Jahmyr Gibbs"


def test_a_first_name_only_payload_still_yields_something():
    """Sleeper serving no last_name must not produce an empty string, which
    would be a silent downgrade from the truncation this fixes."""
    row = L._from_sleeper({"pick_no": 1, "player_id": "X", "draft_slot": 1,
                           "metadata": {"first_name": "Solo"}}, {}, {})
    assert row["player_name"] == "Solo"
