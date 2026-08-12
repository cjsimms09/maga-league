# TERRITORY: C
"""PIN THE BOARD SO NEXT YEAR CAN FIND IT — a few bytes, not a copy.

WHY THIS EXISTS. The oracle-capture series gets a TOOL ARM from 2026 onward, and only
if the board the tool used is recoverable. It is not recoverable for 2023-25: the
repository's first commit is 2026-08-08, ADP and projection series are 2026-only, and
Route 1 established that historical boards are not retrievable from anywhere else.

WHY A PIN AND NOT A SNAPSHOT. Git ALREADY holds every revision of the board — it is
committed daily. The gap is not storage, it is IDENTIFICATION: a reader in 2027 has to
know WHICH commit held the board used on draft day, and "find the right commit from the
right day, a year later" is archaeology, not an archive.

So this records the commit sha and a content digest. `git show <sha>:public/draft_data.json`
reconstructs the board exactly, and the digest PROVES the recovered bytes are the ones
that were pinned. A copy would be ~2MB a day of something git already has.

AND IT PINS DAILY, NOT ON DRAFT DAY. Nobody has to remember to run it at the right
moment — the draft date can move, the capture cannot be re-run afterwards, and a
mechanism that depends on someone acting on one specific day is the intention-with-no-
trigger failure this program keeps finding. The 2027 reader takes the LAST pin STRICTLY
BEFORE the draft, which is F5's own rule applied to our own board.

NOT A COPY, NOT A SCAN, NOT AN ANALYSIS. One record a day. Rule 9.
"""
import hashlib
import json
from pathlib import Path

import field_population as FP

SERIES = "draft/data/board_pins.json"
PIN_VERSION = "board-pin/v1"


def digest(raw: bytes) -> str:
    """SHA-256 of the exact bytes, so a recovered board can be PROVED identical.

    Hashing the parsed object instead would make the pin survive a reformat that
    changed the bytes — which sounds harmless and means the digest no longer proves
    what it claims.
    """
    return hashlib.sha256(raw if isinstance(raw, (bytes, bytearray))
                          else str(raw).encode("utf-8")).hexdigest()


def pin(raw: bytes, sha: str, observed_at: str, path: str = "public/draft_data.json") -> dict:
    """One pin: what board, at which commit, on what date, and how to prove it."""
    board = json.loads(raw.decode("utf-8") if isinstance(raw, (bytes, bytearray)) else raw)
    players = board.get("players") or []
    return {
        "observed_at": observed_at,
        "commit": sha,
        "path": path,
        "sha256": digest(raw),
        "n_players": len(players),
        "built_at": board.get("built_at"),
        "recover_with": "git show %s:%s" % (sha, path),
    }


def append(record: dict, existing: dict = None) -> dict:
    """Append, deduped by observed_at. Same day twice is one observation."""
    doc = existing or {"_note": ("Pins for `public/draft_data.json`, one per day. The "
                                 "board itself lives in git; this says WHICH COMMIT held "
                                 "the board on each day, and proves it with a digest. The "
                                 "tool arm of the oracle-capture series reads the last pin "
                                 "STRICTLY BEFORE a draft — F5's rule, applied to our own "
                                 "board."),
                       "version": PIN_VERSION, "series": []}
    doc.setdefault("series", [])
    doc["series"] = [r for r in doc["series"]
                     if str(r.get("observed_at")) != str(record.get("observed_at"))]
    doc["series"].append(record)
    doc["series"].sort(key=lambda r: str(r.get("observed_at")))
    # POPULATION TRAVELS WITH THE ARCHIVE (Cory, 2026-08-12). The pin that matters is
    # `sha256` — a pin without it proves nothing about the board it names — so a day
    # where the digest went empty must be visible in the record, not inferable only by
    # someone who tries to verify a recovery a year later.
    doc["population"] = FP.of_records(doc["series"], fields=list(record))
    return doc


def pin_before(doc: dict, draft_date: str, draft_started_at: str = None):
    """The last pin that is EVIDENCE of what the tool showed when it recommended.

    F5's rule, applied to our own board. The date-only form was wrong for our
    actual schedule and would have discarded the right pin on 2026-08-22:

        draft-data.yml        board rebuilt   08:00 UTC daily
        external-adp-capture  pin taken       11:20 UTC daily
        our draft             2026-08-22, picks that evening

    Comparing dates alone, the 08-22 pin — taken at 11:20 UTC, hours BEFORE any
    pick, and genuinely the board the tool displayed — is discarded, and 08-21's
    is returned instead. A board one day stale, on the day boards move most, in
    the record whose entire purpose is knowing which board the tool used.

    THE OLD REASONING WAS SOUND IN GENERAL AND WRONG FOR THIS SCHEDULE: "a board
    pinned ON draft day may have been rebuilt after picks began". MAY have been.
    Date-only comparison cannot tell, so it excluded the whole day to be safe —
    and being safe cost the correct answer every time the pin precedes the draft.

    `built_at` was already in every pin record, so the information that resolves
    the ambiguity was captured all along; only the reader could not use it. That
    is why this is a fix and not a loss: pins taken before this change are
    selected correctly by it.

    ── THE RULE ────────────────────────────────────────────────────────────────

    With `draft_started_at`, a pin qualifies when the BOARD IT PINS was built
    strictly before the first pick — which is the question actually being asked.
    Without it, the date-only rule is kept unchanged, because a caller who cannot
    say when the draft began cannot distinguish a same-day pin taken at 11:20
    from one taken at 23:00, and excluding the day is the right answer then.

    A same-day pin with NO `built_at` is excluded even when `draft_started_at` is
    supplied: an undated board cannot be shown to precede the picks, and
    admitting it would be assuming the thing the argument exists to establish.

    ── WHERE `draft_started_at` COMES FROM, because a parameter with no named ───
    ── source is how a correct function stays unused ───────────────────────────

        draft/data/sleeper_league_settings.json  ->  .draft.start_time

    Sleeper populates it when the draft starts; it is null while `.draft.status`
    is "pre_draft", which is what it reads today. It is an epoch in MILLISECONDS
    — convert before passing, this function compares ISO-8601 strings.

    It is also recoverable from Sleeper's draft endpoint long after the fact
    (that is how prior seasons reached `league_history.json`), so a reader in
    2027 who finds it null in our archive is not stuck. NOTHING HERE IS
    PERISHABLE, which is why this was a fix to make and not a capture to rush.
    """
    series = (doc or {}).get("series") or []
    if not draft_started_at:
        usable = [r for r in series if str(r.get("observed_at")) < str(draft_date)]
        return usable[-1] if usable else None

    def qualifies(r):
        day = str(r.get("observed_at"))
        if day < str(draft_date):
            return True
        if day > str(draft_date):
            return False
        # SAME DAY: admit it only on evidence, never by default.
        built = r.get("built_at")
        return bool(built) and str(built) < str(draft_started_at)

    usable = [r for r in series if qualifies(r)]
    return usable[-1] if usable else None
