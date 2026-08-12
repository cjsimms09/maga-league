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


def pin_before(doc: dict, draft_date: str):
    """The last pin STRICTLY BEFORE a draft date. F5's rule, on our own board.

    A board pinned ON draft day may have been rebuilt after picks began, so it is not
    evidence of what the tool saw when it recommended. Strictly before, or nothing.
    """
    usable = [r for r in ((doc or {}).get("series") or [])
              if str(r.get("observed_at")) < str(draft_date)]
    return usable[-1] if usable else None
