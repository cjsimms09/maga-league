# TERRITORY: A
"""`gen_keepers_json` — the three ways it could destroy the keeper file.

Register 319. Every scheduled board publish since 2026-08-22 died in this
script, and the whole cascade behind it — history export, board build,
acceptance gate, commit, deploy — was skipped with it. Runs 111, 112 and 113,
all the same line, read verbatim out of the run-113 log:

    gen_keepers_json: read ZERO designating teams, but the last board's
    keeper_slate says 9 team(s) had designated. ... Refusing.

The guard was right for the window it was written in and was given no expiry.
Sleeper CONSUMES keeper designations when the draft starts, so from 2026-08-22
23:00Z a zero reading is the truth rather than a broken read — and the refusal
kept firing. It is the same shape as `build.py:1963` ruling the keeper-pool
effect immaterial "at about 1.8 points, ~2-3%": a judgement correct under a
condition nobody attached an expiry to, still being applied after the condition
ended.

TWO MORE DEFECTS WERE FOUND WHILE FIXING IT, both measured rather than reviewed:

  * THE FILE WAS WRITTEN BEFORE THE ASSERTION RAN. The guard whose message reads
    "a keeper file with no teams silently returns every kept player to the
    draftable pool. Refusing." had already written that file to disk. On a CI
    runner the workspace is discarded so nothing reaches the repo; run by hand it
    destroys the real keepers.json and exits 1. A refusal that fires after the
    damage is a report, not a guard.

  * A STALE FALLBACK OVERWROTE A GOOD FILE ON A GREEN RUN. With Sleeper
    unreachable the history fallback reports 2 designating teams against the
    board's 9, wrote that over keepers.json, and exited 0 — seven teams' keepers
    returned to the draftable pool with nothing going red. `designations()`'s own
    docstring already describes this ("2 designating teams against 4 ... the
    disagreement was structural rather than a timing race"); it was diagnosed and
    left as a print.

WHY THESE ARMS EXIST RATHER THAN THE FIX ALONE. Until today the only way to
exercise this control flow was to run the whole generator against live Sleeper,
so the arms that decide whether the real keeper file is overwritten had never
been run at all. `main()` now takes its inputs, which is what makes the file
below possible.
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT / "draft"))

import gen_keepers_json as G  # noqa: E402

import datetime  # noqa: E402

UTC = datetime.timezone.utc
BEFORE_DRAFT = datetime.datetime(2026, 8, 22, 12, 0, tzinfo=UTC)   # draft-day morning
AFTER_DRAFT = datetime.datetime(2026, 8, 24, 8, 56, tzinfo=UTC)    # run 113


def _cfg():
    return {
        "teams": 10,
        "my_draft_slot": 8,
        # Cory's ruling, 2026-08-18. 6:00 PM CDT on 08-22 == 23:00Z.
        "draft": {"start_date": "2026-08-22", "start_time": "6:00 PM", "tz": "CDT"},
    }


def _art(teams_designated=9):
    return {
        "players": [{"player_id": "1", "name": "A Back", "position": "RB"}],
        "kept_players": [],
        "keeper_slate": {"teams_designated": teams_designated},
    }


def _hist(n=0):
    """`n` owners with a designation, in the shape `designations()` reads."""
    return {"seasons": [{"season": "2025", "final_rosters": [
        {"owner_id": str(900 + i), "keepers": ["1"]} for i in range(n)]}]}


# ── when does the draft count as started ────────────────────────────────────

@pytest.mark.parametrize("when,want,why", [
    (datetime.datetime(2026, 8, 22, 22, 59, tzinfo=UTC), False, "one minute before"),
    (datetime.datetime(2026, 8, 22, 23, 0, tzinfo=UTC), True, "exactly at the start"),
    (datetime.datetime(2026, 8, 22, 12, 0, tzinfo=UTC), False,
     "DRAFT-DAY MORNING — reading start_date alone would call this started, and "
     "would switch the guard off eighteen hours before the draft"),
    (datetime.datetime(2026, 8, 21, 18, 0, tzinfo=UTC), False, "the day before"),
    (AFTER_DRAFT, True, "run 113, which failed"),
])
def test_draft_start_is_read_to_the_minute(when, want, why):
    assert G.draft_has_started(_cfg(), now=when) is want, why


@pytest.mark.parametrize("cfg,why", [
    ({}, "no draft block"),
    ({"draft": {}}, "no start_date"),
    ({"draft": {"start_date": "2026-08-22", "tz": "MARS"}}, "unrecognised tz"),
])
def test_an_absent_answer_is_None_and_never_False(cfg, why):
    """None means DO NOT KNOW, and the caller treats it as "not started" — so an
    unreadable config leaves the refusal ARMED. If this ever returned False the
    guard would quietly switch itself off on a malformed config, which is the
    failure mode that is impossible to notice."""
    assert G.draft_has_started(cfg, now=datetime.datetime(2027, 1, 1, tzinfo=UTC)) is None, why


# ── the post-draft zero ─────────────────────────────────────────────────────

def test_post_draft_zero_leaves_the_file_alone_and_exits_clean(tmp_path):
    """THE ARM THAT UNBLOCKS THE BOARD. Sleeper reports nothing because the draft
    consumed the designations; that is the truth. Do not refuse, and do not
    regenerate the file from an empty source either — post-draft keepers.json is
    a RECORD of what was kept."""
    dest = tmp_path / "keepers.json"
    dest.write_text('{"teams": "THE REAL RECORD"}')

    G.main(cfg=_cfg(), art=_art(9), hist=_hist(0), rosters=[],
           dest=str(dest), now=AFTER_DRAFT)

    assert json.loads(dest.read_text()) == {"teams": "THE REAL RECORD"}, (
        "the post-draft run rewrote the keeper record from a source that no "
        "longer carries designations"
    )


def test_the_same_call_BEFORE_the_draft_still_refuses_KNOWN_POSITIVE(tmp_path):
    """RULE 3e. The arm above is a `no` — nothing happened, nothing was written —
    and a `no` from a check that has never said `yes` is not evidence. Identical
    inputs, clock moved back to draft-day morning: the original refusal must
    still fire, because before the draft a zero reading can only mean the read
    broke. If this stops failing, the fix above did not add an expiry, it deleted
    a guard."""
    dest = tmp_path / "keepers.json"
    dest.write_text('{"teams": "THE REAL RECORD"}')

    with pytest.raises(SystemExit) as e:
        G.main(cfg=_cfg(), art=_art(9), hist=_hist(0), rosters=[],
               dest=str(dest), now=BEFORE_DRAFT)
    assert "ZERO designating teams" in str(e.value)
    assert json.loads(dest.read_text()) == {"teams": "THE REAL RECORD"}, (
        "REFUSED AND WROTE ANYWAY — this is the assert-after-write defect"
    )


def test_an_unreadable_draft_config_keeps_the_refusal_armed(tmp_path):
    """`draft_has_started` returns None here, and None must not read as "started".
    A config this script cannot parse is the moment to be MORE careful, not less."""
    cfg = dict(_cfg(), draft={})
    dest = tmp_path / "keepers.json"
    dest.write_text("{}")
    with pytest.raises(SystemExit) as e:
        G.main(cfg=cfg, art=_art(9), hist=_hist(0), rosters=[],
               dest=str(dest), now=AFTER_DRAFT)
    assert "ZERO designating teams" in str(e.value)


# ── the stale fallback ──────────────────────────────────────────────────────

def test_a_stale_fallback_that_disagrees_with_the_board_refuses(tmp_path, monkeypatch):
    """MEASURED, not hypothetical: this is what the generator does on this machine
    right now, where Sleeper is unreachable — 2 designating teams against the
    board's 9. Before today it wrote that and exited 0."""
    monkeypatch.setattr(G, "designations",
                        lambda h, r=None: ([("901", ["1"]), ("902", ["1"])],
                                           "history (sleeper unreachable)"))
    dest = tmp_path / "keepers.json"
    dest.write_text('{"teams": "THE REAL RECORD"}')

    with pytest.raises(SystemExit) as e:
        G.main(cfg=_cfg(), art=_art(9), hist=_hist(2), rosters=None,
               dest=str(dest), now=BEFORE_DRAFT)
    msg = str(e.value)
    assert "STALE FALLBACK" in msg
    assert "7 team(s)" in msg, f"the message must name what would be lost: {msg}"
    assert json.loads(dest.read_text()) == {"teams": "THE REAL RECORD"}


def test_the_SAME_disagreement_from_LIVE_sleeper_only_warns(tmp_path, monkeypatch, capsys):
    """THE OTHER HALF, and the reason the guard is split by source rather than
    applied to every disagreement. Read live, a difference can be a team
    designating between the two reads — a real race, and refusing would block
    builds for it. Read from a cache of unknown age, it cannot be a race.

    Same counts as the arm above; only the source differs. If both refused, the
    split would be decorative."""
    monkeypatch.setattr(G, "designations",
                        lambda h, r=None: ([("901", ["1"]), ("902", ["1"])], "sleeper"))
    dest = tmp_path / "keepers.json"

    G.main(cfg=_cfg(), art=_art(9), hist=_hist(2), rosters=None,
           dest=str(dest), now=BEFORE_DRAFT)

    assert dest.exists(), "a live-read disagreement must still produce a file"
    assert json.loads(dest.read_text())["_designating_teams"] == 2
    assert "worth a look" in capsys.readouterr().out


def test_the_source_predicate_is_not_a_substring_match():
    """RULE 3f, and this one was caught by running it. The first version asked
    `"sleeper" not in source` — and the fallback label is literally
    "history (sleeper unreachable)", so the stale read tested as LIVE and sailed
    through the guard written to stop it. The check is now exact."""
    def from_fallback(src):
        return str(src or "").strip() != "sleeper"

    assert from_fallback("history (sleeper unreachable)") is True, (
        "the fallback label CONTAINS the word sleeper — a substring test passes "
        "for the wrong reason here"
    )
    assert from_fallback("sleeper") is False
    assert from_fallback("injected") is True, (
        "an injected source must not be able to claim a live read it did not make"
    )
    assert from_fallback(None) is True and from_fallback("") is True


# ── assert before write, on the other refusal too ───────────────────────────

def test_the_accounting_refusal_also_leaves_the_file_alone(tmp_path, monkeypatch):
    """The conservation arm is a different refusal reaching the same write. Both
    must now fail BEFORE it, not after — the ordering fix is in `main`, so it has
    to hold for every path through `_assert_accounting`, not just the one that
    prompted it."""
    monkeypatch.setattr(G, "_assert_accounting",
                        lambda out, art: (_ for _ in ()).throw(SystemExit("boom")))
    dest = tmp_path / "keepers.json"
    dest.write_text('{"teams": "THE REAL RECORD"}')

    with pytest.raises(SystemExit):
        G.main(cfg=_cfg(), art=_art(2), hist=_hist(2), rosters=None,
               dest=str(dest), now=BEFORE_DRAFT)
    assert json.loads(dest.read_text()) == {"teams": "THE REAL RECORD"}
