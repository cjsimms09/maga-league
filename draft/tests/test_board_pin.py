# TERRITORY: C
"""THE 2026 TOOL ARM DEPENDS ON THIS. Every mutation loses a season."""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))
import board_pin as B  # noqa: E402

RAW = json.dumps({"built_at": "2026-08-12T00:00:00Z",
                  "players": [{"player_id": "1"}, {"player_id": "2"}]}).encode()


def test_the_pin_records_HOW_TO_RECOVER_the_board_not_the_board():
    """Git already holds every revision. The gap is IDENTIFICATION — knowing which
    commit, a year later. MUTATION: store the board itself; ~2MB a day of something
    git already has, and rule 9 says that is implemented wrong."""
    p = B.pin(RAW, "abc1234", "2026-08-12")
    assert p["commit"] == "abc1234" and p["n_players"] == 2
    assert p["recover_with"] == "git show abc1234:public/draft_data.json"
    assert "players" not in p


def test_the_digest_is_over_the_EXACT_BYTES_so_recovery_can_be_PROVED():
    """MUTATION: hash the parsed object. The digest then survives a reformat that
    changed the bytes — which sounds harmless and means it no longer proves the
    recovered board is the pinned one."""
    a = B.pin(RAW, "s", "2026-08-12")["sha256"]
    reformatted = json.dumps(json.loads(RAW), indent=2).encode()   # same object, new bytes
    b = B.pin(reformatted, "s", "2026-08-12")["sha256"]
    assert a != b


def test_a_SAME_DAY_pin_replaces_rather_than_doubling():
    doc = B.append(B.pin(RAW, "s1", "2026-08-12"))
    doc = B.append(B.pin(RAW, "s2", "2026-08-12"), doc)
    assert len(doc["series"]) == 1 and doc["series"][0]["commit"] == "s2"


def test_the_tool_arm_reads_the_last_pin_STRICTLY_BEFORE_the_draft():
    """F5's own rule, applied to our board. A board pinned ON draft day may have been
    rebuilt after picks began, so it is not evidence of what the tool saw.

    MUTATION: use <=. A same-day rebuild becomes the pinned board and the 2026 tool
    arm is measured against a board that did not exist when the picks were made."""
    doc = None
    for d, s in (("2026-08-20", "a"), ("2026-08-21", "b"), ("2026-08-22", "c")):
        doc = B.append(B.pin(RAW, s, d), doc)
    got = B.pin_before(doc, "2026-08-22")
    assert got["commit"] == "b", got


# ── OUR ACTUAL SCHEDULE, on which the date-only rule picks the wrong board ──
#
# These exist because the shipped function was run against the real timetable
# before any of them was written, and it returned 08-21's pin for an 08-22 draft:
#
#     draft-data.yml        board rebuilt   08:00 UTC daily
#     external-adp-capture  pin taken       11:20 UTC daily
#     our draft             2026-08-22, picks that evening
#
# The pin is taken HOURS BEFORE the first pick and is genuinely the board the
# tool displayed. `built_at` was in every record all along; only the reader could
# not use it, so pins taken before the fix are selected correctly by it.

def _sched(days, built_h="08:00:00"):
    """Pins on our real schedule: each day's board built at `built_h` UTC."""
    doc = None
    for d in days:
        raw = json.dumps({"built_at": "%sT%sZ" % (d, built_h),
                          "players": [{"player_id": "1"}]}).encode()
        doc = B.append(B.pin(raw, "sha-" + d, d), doc)
    return doc


def test_a_SAME_DAY_pin_built_BEFORE_the_first_pick_IS_the_evidence():
    """THE ONE THIS FIX EXISTS FOR. MUTATION: the shipped function — compare dates
    only. It discards the 08-22 pin and returns 08-21's: a board one day stale, on
    the day boards move most, in the record whose whole purpose is knowing which
    board the tool used."""
    doc = _sched(["2026-08-20", "2026-08-21", "2026-08-22"])
    got = B.pin_before(doc, "2026-08-22", draft_started_at="2026-08-22T23:00:00Z")
    assert got["commit"] == "sha-2026-08-22", got


def test_a_SAME_DAY_pin_built_AFTER_the_first_pick_is_still_REFUSED():
    """The original reasoning, preserved rather than discarded — it was sound in
    general and wrong only for our schedule. MUTATION: admit any same-day pin. A
    board rebuilt mid-draft becomes 'what the tool showed', and the 2026 tool arm
    is graded against a board that did not exist when the picks were made."""
    doc = _sched(["2026-08-21", "2026-08-22"], built_h="23:30:00")
    got = B.pin_before(doc, "2026-08-22", draft_started_at="2026-08-22T23:00:00Z")
    assert got["commit"] == "sha-2026-08-21", got


def test_a_same_day_pin_with_NO_built_at_is_refused_even_WITH_a_start_time():
    """MUTATION: treat a missing `built_at` as qualifying. An undated board cannot
    be shown to precede the picks, and admitting it assumes exactly the thing the
    argument was added to establish."""
    doc = B.append({"observed_at": "2026-08-21", "commit": "day-before"})
    doc = B.append({"observed_at": "2026-08-22", "commit": "undated"}, doc)
    got = B.pin_before(doc, "2026-08-22", draft_started_at="2026-08-22T23:00:00Z")
    assert got["commit"] == "day-before", got


def test_WITHOUT_a_start_time_the_date_only_rule_is_UNCHANGED():
    """A caller who cannot say when the draft began cannot tell an 11:20 pin from a
    23:00 one, and excluding the day is right then. MUTATION: apply the same-day
    rule regardless — every existing caller silently changes answer."""
    doc = _sched(["2026-08-21", "2026-08-22"])
    assert B.pin_before(doc, "2026-08-22")["commit"] == "sha-2026-08-21"


def test_a_pin_from_AFTER_the_draft_day_never_qualifies():
    """The plain case. Note it does NOT reach the date guard — see below."""
    doc = _sched(["2026-08-21", "2026-08-23", "2026-08-25"])
    got = B.pin_before(doc, "2026-08-22", draft_started_at="2026-08-22T23:00:00Z")
    assert got["commit"] == "sha-2026-08-21", got


def test_a_pin_TAKEN_AFTER_the_draft_of_an_OLD_board_is_still_refused():
    """FOUND BY A SURVIVING MUTATION. The test above claimed to cover the date
    guard and did not: `built_at` carries its own date, so a later pin of a later
    board is rejected by the timestamp compare alone and the guard is never
    reached. It took a record where the two DISAGREE to reach it.

    The scenario is real and is the one this lane just built detection for: the
    capture goes down over the draft and resumes on 08-25, pinning a board that
    was never rebuilt in between. Its `built_at` (08-20) precedes the first pick,
    so on the timestamp alone it qualifies — and being last in the series it would
    be RETURNED, reporting a pin taken three days after the draft as evidence of
    what the tool showed during it.

    MUTATION: drop `if day > draft_date: return False`."""
    doc = B.append({"observed_at": "2026-08-21", "commit": "during",
                    "built_at": "2026-08-21T08:00:00Z"})
    doc = B.append({"observed_at": "2026-08-25", "commit": "after-the-fact",
                    "built_at": "2026-08-20T08:00:00Z"}, doc)
    got = B.pin_before(doc, "2026-08-22", draft_started_at="2026-08-22T23:00:00Z")
    assert got["commit"] == "during", got


def test_the_fix_selects_correctly_for_pins_taken_BEFORE_it_existed():
    """Why this is a fix and not a loss. Every pin already carried `built_at`, so
    the record needs no repair — the 08-12 pin sitting in the real series today is
    read correctly by the new rule."""
    real = json.loads((HERE.parent / "data" / "board_pins.json").read_text())
    row = real["series"][0]
    assert row["built_at"], "the real record must carry built_at for this to hold"
    got = B.pin_before(real, row["observed_at"],
                       draft_started_at=row["built_at"][:11] + "23:00:00Z")
    assert got is not None and got["observed_at"] == row["observed_at"]


def test_NO_pin_before_the_draft_returns_NOTHING_rather_than_the_nearest():
    """Absent is not 'close enough'. MUTATION: fall back to the nearest pin in either
    direction — the same defect that made the Wayback availability API unusable for
    Route 1, reproduced on our own archive."""
    doc = B.append(B.pin(RAW, "late", "2026-08-25"))
    assert B.pin_before(doc, "2026-08-22") is None


def test_THE_RECOVERY_PATH_ACTUALLY_REPRODUCES_THE_PINNED_BYTES():
    """THE ONLY PROPERTY THAT MATTERS, and the one I nearly shipped untested.

    Every other test here checks that `pin()` PRODUCES a digest. None checked that
    following the pin's own `recover_with` instruction REPRODUCES it. A pin whose
    recovery path does not work is worthless in exactly the way that is invisible until
    the year someone needs it — which is 2027, when nothing can be done about it.

    So this runs `git show <sha>:<path>` for real, against the live repository, and
    hashes what comes back.

    MEASURED 2026-08-12: 1,410,454 bytes, digest 8f1f4549… both ways.

    MUTATION: hash anything other than the exact bytes git returns — the parsed object,
    a re-serialisation, the file on disk instead of the blob — and this passes locally
    while the 2027 recovery silently fails to verify."""
    import hashlib
    import subprocess
    root = Path(__file__).resolve().parent.parent.parent
    path = "public/draft_data.json"
    if not (root / path).exists():
        return                                    # nothing to pin in this checkout
    sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=root,
                         capture_output=True, text=True).stdout.strip()
    if not sha:
        return                                    # not a git checkout — nothing to recover FROM
    raw = (root / path).read_bytes()
    pinned = B.pin(raw, sha, "2026-08-12", path=path)
    rec = subprocess.run(["git", "show", "%s:%s" % (sha, path)], cwd=root,
                         capture_output=True)
    assert rec.returncode == 0, rec.stderr[:200]

    # THE PREMISE, CHECKED INSTEAD OF ASSUMED — fixed 2026-08-15. This test
    # blocked the nightly board rebuild twice (runs 39 and 40) and got filed
    # as "needs live data to diagnose". It didn't. The acceptance gate runs
    # pytest AFTER build.py rewrites public/draft_data.json and BEFORE the
    # commit step, so on every night the live fetch actually changed the
    # board, the working-tree bytes pinned here did not exist at HEAD yet —
    # and recovery from HEAD "failed" precisely because the rebuild
    # SUCCEEDED. The CI evidence names the mechanism exactly: the recovered
    # digest was byte-identical across both failing runs (HEAD's committed
    # board, unchanged on main) while the pinned digest differed per run
    # (each night's fresh build). A pin naming HEAD for bytes HEAD does not
    # contain is a lie, and asserting the recovery of a lie proves nothing
    # about the recovery path.
    dirty = subprocess.run(["git", "hash-object", "--", path], cwd=root,
                           capture_output=True, text=True).stdout.strip() != \
        subprocess.run(["git", "rev-parse", "%s:%s" % (sha, path)], cwd=root,
                       capture_output=True, text=True).stdout.strip()
    if not dirty:
        # CLEAN TREE — the real contract, unchanged from the original: the
        # pin's own recover_with instruction reproduces the pinned bytes.
        assert hashlib.sha256(rec.stdout).hexdigest() == pinned["sha256"], (
            "the pin's own recover_with does not reproduce the pinned bytes")
        assert len(rec.stdout) == len(raw)
    else:
        # MID-REBUILD (the nightly gate's normal state on a data-refresh
        # night): the equality contract is untestable, but the run is NOT
        # vacuous — assert the digest DISCRIMINATES: a pin of bytes that are
        # genuinely not at HEAD must fail verification against HEAD. That is
        # the pin system's tamper-evidence doing its job, demonstrated on a
        # real divergence rather than a synthetic one.
        assert hashlib.sha256(rec.stdout).hexdigest() != pinned["sha256"], (
            "the working tree differs from HEAD (hash-object says so) yet the "
            "recovered bytes hash equal to the pin — the digest is not "
            "discriminating and the pin proves nothing")
        print("UNCHECKED (equality contract): %s differs from HEAD — a freshly "
              "rebuilt board cannot be recovered from history until committed. "
              "Discrimination arm ran instead." % path)


def test_the_pin_series_carries_its_own_field_population():
    """A pin without `sha256` proves nothing about the board it names."""
    rec = {"observed_at": "2026-08-12", "commit": "abc", "path": "public/draft_data.json",
           "sha256": "d" * 64, "n_players": 3, "built_at": None, "recover_with": "git show"}
    doc = B.append(rec)
    pop = doc["population"]
    assert pop["rows"] == 1
    assert pop["fields"]["sha256"]["pct"] == 100.0
    assert "built_at" in pop["empty"]        # null is reported, not hidden


def test_the_declared_pin_fields_cannot_drift_from_pin():
    """The enforcement half. The constant alone is redundant with what `population()`
    already unions from the rows; this is what gives it teeth.

    MUTATION: add or rename a key in `pin()` without touching `PIN_FIELDS`. A new
    field would enter the archive unrecorded, and a renamed one would leave the
    declared list pointing at something the writer no longer emits."""
    assert list(B.pin(RAW, "abc", "2026-08-12")) == B.PIN_FIELDS


def test_a_pin_field_that_NEVER_ARRIVES_is_still_named():
    """The case the declared list exists for, and the only one the derived list
    could not see. A field that DROPS OUT is caught by the union over rows; a field
    no row ever carried is invisible unless it is declared.

    `built_at` is the one that matters: `pin_before()` refuses a same-day pin
    without it, so if `pin()` quietly stopped emitting it, the tool arm would go
    back to selecting the previous day's board and the archive would report a clean
    100% on everything it happened to contain.

    MUTATION: `fields=list(record)`, the shipped version before this test."""
    def pin_without_built_at(sha, day):
        r = B.pin(RAW, sha, day)
        r.pop("built_at")
        return r
    doc = B.append(pin_without_built_at("s1", "2026-08-11"))
    doc = B.append(pin_without_built_at("s2", "2026-08-12"), doc)
    assert "built_at" in doc["population"]["fields"]
    assert doc["population"]["fields"]["built_at"]["missing"] == 2
    assert "built_at" in doc["population"]["empty"]


# ── IS THE BOARD STALE, AND WAS IT REBUILT OR ONLY EDITED? ───────────────────
#
# Proven from git on 2026-08-14: three commits to public/draft_data.json with
# sha256 25b10172 / 2814c6de / 7fa64ad7 — 1,679,767 then 1,648,204 then
# 1,647,977 bytes — and `built_at` identical at 2026-08-13T23:13:18Z on all
# three. The board is rebuilt once and then EDITED IN PLACE, so `built_at` alone
# cannot answer "is this board fresh" and sha256 alone cannot answer "has the
# pipeline run". The pin already carries both; nothing read them together.

def _pin(day, sha, built_at="2026-08-13T09:20:18Z"):
    return {"observed_at": day, "sha256": sha, "built_at": built_at,
            "commit": "c" + sha[:6], "path": "public/draft_data.json"}


def test_AN_EDIT_IN_PLACE_IS_NOT_A_REBUILD():
    """THE CASE THAT WAS MEASURED. Content moved — 136 of 400 player rows, the
    field being `adp_unordered` — while `built_at` stayed frozen. Reading only
    `built_at` calls that board unchanged; reading only the digest calls it
    rebuilt. Neither is true and the difference matters: an edit means somebody
    changed the artifact, a rebuild means the pipeline ran.

    MUTATION: report `rebuilt` whenever the digest moves — a stalled nightly build
    reads as healthy for as long as anyone keeps hand-editing the file, which is
    precisely the morning this was found on."""
    ser = [_pin("2026-08-12", "aaa"), _pin("2026-08-13", "bbb")]
    r = B.staleness(ser, today="2026-08-13")
    assert r["state"] == "edited", r
    assert r["days_since_rebuild"] is not None
    assert r["days_since_content_change"] == 0


def test_A_REBUILD_IS_RECOGNISED_BY_built_at_ADVANCING():
    """MUTATION: compare `built_at` for inequality only — a board rebuilt from an
    older snapshot, or a clock that goes backwards, counts as progress."""
    ser = [_pin("2026-08-12", "aaa", "2026-08-12T09:00:00Z"),
           _pin("2026-08-13", "bbb", "2026-08-13T09:20:18Z")]
    r = B.staleness(ser, today="2026-08-13")
    assert r["state"] == "rebuilt"
    assert r["days_since_rebuild"] == 0
    ser_back = [_pin("2026-08-12", "aaa", "2026-08-13T09:20:18Z"),
                _pin("2026-08-13", "bbb", "2026-08-12T09:00:00Z")]
    back = B.staleness(ser_back, today="2026-08-13")
    assert back["state"] != "rebuilt"
    # AND THE REBUILD DATE MUST NOT ADVANCE EITHER. The gate caught this: the
    # state line and the last_rebuild walk are two separate comparisons, and I had
    # only asserted the first. Mutating the walk to `!=` left the state correct
    # while the reported rebuild DATE jumped forward on a clock that went
    # backwards — a survived mutation is a missing assertion, not a spare one.
    assert back["last_rebuild"] == "2026-08-12", back


def test_A_FROZEN_BOARD_REPORTS_ITS_TRUE_AGE():
    """MUTATION: measure staleness from the last PIN rather than the last CHANGE —
    the pin runs daily, so `days_since` is always 0 and a board frozen for a week
    reads as captured this morning. The instrument would then be reporting that
    itself ran."""
    ser = [_pin("2026-08-08", "aaa"), _pin("2026-08-09", "aaa"),
           _pin("2026-08-13", "aaa")]
    r = B.staleness(ser, today="2026-08-14")
    assert r["state"] == "frozen"
    assert r["days_since_content_change"] == 6      # last CHANGE was before 08-08
    assert r["days_since_rebuild"] == 6


def test_ONE_PIN_IS_UNMEASURED_not_zero_days_stale():
    """A single pin has nothing to compare against. Reporting 0 days would make a
    brand-new archive indistinguishable from a board that changed this morning.

    MUTATION: return zeroes for a one-pin series — the first run of this check
    always reports perfect freshness, which is the reading it can least afford."""
    r = B.staleness([_pin("2026-08-13", "aaa")], today="2026-08-14")
    assert r["state"] == "unmeasured"
    assert r["days_since_content_change"] is None
    assert B.staleness([], today="2026-08-14")["state"] == "unmeasured"


def test_A_MISSING_built_at_IS_UNKNOWN_not_unrebuilt():
    """`population()`'s docstring already anticipates a board that stops carrying
    `built_at` — it yields an explicit null. A null must not be read as "no
    rebuild happened", which would report a stalled pipeline that is in fact
    unobserved.

    MUTATION: treat a missing `built_at` as no change — the day the field
    disappears, this check starts reporting a rebuild failure that nobody can
    reproduce because the evidence is absent rather than negative."""
    ser = [_pin("2026-08-12", "aaa", None), _pin("2026-08-13", "bbb", None)]
    r = B.staleness(ser, today="2026-08-13")
    assert r["rebuild_measurable"] is False
    assert r["days_since_rebuild"] is None
    assert "built_at" in r["note"]
