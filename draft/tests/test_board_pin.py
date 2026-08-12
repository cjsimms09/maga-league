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
    raw = (root / path).read_bytes()
    pinned = B.pin(raw, sha, "2026-08-12", path=path)
    rec = subprocess.run(["git", "show", "%s:%s" % (sha, path)], cwd=root,
                         capture_output=True)
    assert rec.returncode == 0, rec.stderr[:200]
    assert hashlib.sha256(rec.stdout).hexdigest() == pinned["sha256"], (
        "the pin's own recover_with does not reproduce the pinned bytes")
    assert len(rec.stdout) == len(raw)
