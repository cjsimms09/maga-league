#!/usr/bin/env python3
# TERRITORY: D. CONTROLS FOR THE DRAFT SHARKS CROSSWALK ABSENCE EXEMPTION.
"""`test_crosswalk_matches_every_player_uniquely` was GREEN in every sandbox
and RED in CI for five days, because the sandbox reads the board published on
2026-08-26 and CI builds a fresh one. A test that cannot fail where you are
looking at it is a test you cannot fix where you are looking at it, so this
file makes CI's board reproducible offline: it deletes the two players Sleeper
dropped on 08-27 and runs the real parser against the result.

WHY THIS FILE EXISTS AT ALL (rule 3e): the fix loosens a gate. A loosened gate
that has only ever been run on the case it was built to permit has not been
tested, only run. Four controls:

  C1 KNOWN-POSITIVE — reproduce CI exactly. Remove 4988 (Nick Chubb) and 11589
     (Trey Benson) and assert the OLD invariant fails (`n_unmatched == 2`, which
     is the literal `assert 2 == 0` in run 33324724843) while the NEW one holds,
     both rows classified `absent-from-board`, the `first-initial+pos` bucket
     dropping 198 -> 196 exactly as CI's own stdout reported, and both players
     named on stderr.
  C2 NON-MASKING — break the MATCHER for a player who is still on the board, and
     assert the exemption refuses to cover it: `unexplained`, gate still red.
     This is the control that matters, because it is the failure the loosening
     could have hidden.
  C3 BASELINE — unmodified board still matches all 250.
  C4 THE BOUND BITES — remove seven players and assert the <= 5 cap fails, so
     the cap is not decorative.

⭐ THIS HARNESS FOUND A SECOND DEFECT THE MOMENT IT EXISTED (register 436).
C's independent fix for the same gate — a 0.95 match-rate floor, on
`claude/external-ingest-program-1xfinj`, 13/13 green and marked ready to merge —
passes its floor at 248/250 and then fails on the very next line, because
`sleeper_id` is None on an unmatched row and two of those Nones make the
untouched uniqueness check report `two Draft Sharks rows matched the same
player`. Nobody could have seen that from a sandbox, where the board still
carries both players and no None ever enters the list. Point C1's board at any
candidate fix for this gate before believing it.

Nothing here is written back: the board and the parser's own artifact are
restored from bytes captured before the first mutation, on every exit path
including a signal. `git checkout` is deliberately NOT used — a reset tool that
reaches for git once reverted this author's own uncommitted fix mid-run.

    python3 draft/tools/_ds_crosswalk_absence_controls.py     # exit 0 = all pass
"""
from __future__ import annotations

import atexit
import contextlib
import io
import json
import signal
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
BOARD = ROOT / "public" / "draft_data.json"
ARTIFACT = ROOT / "draft" / "data" / "draftsharks_projections_2026.json"
sys.path.insert(0, str(ROOT / "draft" / "tools"))

_ORIGINALS: dict[Path, bytes] = {}


def _snapshot() -> None:
    for p in (BOARD, ARTIFACT):
        if p.exists() and p not in _ORIGINALS:
            _ORIGINALS[p] = p.read_bytes()


def _restore() -> None:
    for p, b in _ORIGINALS.items():
        if p.read_bytes() != b:
            p.write_bytes(b)


atexit.register(_restore)
for _sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
    signal.signal(_sig, lambda *_a: (_restore(), sys.exit(130)))


def run_against(mutate) -> tuple[dict, str]:
    """Apply `mutate` to the board in memory, write it, run the real parser,
    and hand back the doc plus everything it said on stderr."""
    _snapshot()
    board = json.loads(_ORIGINALS[BOARD].decode())
    mutate(board)
    BOARD.write_text(json.dumps(board))
    import draftsharks_parse as D
    err, out = io.StringIO(), io.StringIO()
    try:
        with contextlib.redirect_stderr(err), contextlib.redirect_stdout(out):
            doc = D.main()
    finally:
        _restore()
    return doc, err.getvalue()


def drop(*pids):
    def _m(board):
        keep = set(pids)
        for k in ("players", "kept_players"):
            board[k] = [p for p in board.get(k, []) if p.get("player_id") not in keep]
    return _m


def ambiguous_and_unranked(pid, clone_team):
    """Leave the player ON the board, at their own position, and make the
    matcher unable to resolve them anyway — the shape of a REAL past defect,
    not an invented one. Register 332 is exactly this: the keeper lock nulled
    `overall_rank`, the closest-rank tie-breaker filters to candidates that
    have a rank, and two same-key candidates with no rank between them leave it
    nothing to choose from. Reproduced here by cloning the player onto another
    team and stripping the prominence fields from both.

    ⚠️ THE FIRST VERSION OF THIS CONTROL SIMPLY REPOSITIONED THE PLAYER, AND IT
    PROVED NOTHING — the row still matched. `same_pos` is written
    `[c for c in cands if c["pos"] == pos] or cands`, so when no candidate has
    the row's position the filter FALLS BACK to all of them and the single
    remaining candidate wins. A control has to defeat the matcher that exists,
    not the one you pictured.
    """
    def _m(board):
        src = None
        for p in board.get("players", []):
            if p.get("player_id") == pid:
                src = p
                break
        assert src is not None, pid
        clone = dict(src)
        clone["player_id"] = pid + "-clone"
        clone["team"] = clone_team
        for q in (src, clone):
            q["proj_mean"] = None
            q["overall_rank"] = None
        board["players"].append(clone)
    return _m


def main() -> int:
    ok = True

    def check(label, cond, detail=""):
        nonlocal ok
        print(f"  {'PASS' if cond else 'FAIL'}  {label}" + (f" — {detail}" if detail and not cond else ""))
        ok = ok and bool(cond)

    print("C1 KNOWN-POSITIVE — the CI board: Sleeper dropped 4988/11589 on 2026-08-27")
    doc, err = run_against(drop("4988", "11589"))
    check("the OLD invariant fails here, exactly as CI reported it",
          doc["n_unmatched"] == 2, f"n_unmatched={doc['n_unmatched']}, CI said 2")
    check("both rows classified absent-from-board",
          doc["n_unmatched_absent_from_board"] == 2, str(doc["unmatched"]))
    check("nothing unexplained, so the NEW invariant holds",
          doc["n_unmatched_unexplained"] == 0, str(doc["unmatched"]))
    check("the two rows are the two free agents, by name",
          sorted(u["name"] for u in doc["unmatched"]) == ["N Chubb", "T Benson"],
          str([u["name"] for u in doc["unmatched"]]))
    check("first-initial+pos falls 198 -> 196, matching CI's own stdout",
          doc["match_methods"].get("first-initial+pos") == 196,
          str(doc["match_methods"]))
    check("both skips disclosed on stderr, by name",
          "N Chubb" in err and "T Benson" in err, err.strip()[:200])

    print("C2 NON-MASKING — a player still ON the board that the matcher cannot reach")
    # Trey Benson, RB: cloned onto NYJ and both copies stripped of the fields the
    # tie-breaker needs. Still on the board, still an RB, still unmatchable.
    doc2, _ = run_against(ambiguous_and_unranked("11589", "NYJ"))
    check("the row does go unmatched", doc2["n_unmatched"] >= 1, str(doc2["unmatched"]))
    check("and the exemption REFUSES to cover it",
          doc2["n_unmatched_unexplained"] >= 1,
          f"absent={doc2['n_unmatched_absent_from_board']} unexplained={doc2['n_unmatched_unexplained']}")
    check("so the gate is still red on a real matcher defect",
          any(u["reason"] == "unexplained" for u in doc2["unmatched"]),
          str(doc2["unmatched"]))

    print("C3 BASELINE — the unmodified board")
    doc3, _ = run_against(lambda b: None)
    check("still 250/250, so the change moves nothing on today's board",
          doc3["n_unmatched"] == 0, str(doc3["unmatched"]))

    print("C4 THE BOUND BITES — a whole slice of the board leaves, not two players")
    # The board players behind Draft Sharks ranks 200-250, read off the artifact
    # as it stands rather than hand-picked: choosing the ids that happen to make
    # a control pass is how a control stops being one. Not every dropped player
    # yields an ABSENCE (a same-position namesake can remain), which is exactly
    # why this drops a slice instead of counting out a threshold's worth.
    _snapshot()
    committed = json.loads(_ORIGINALS[ARTIFACT].decode())
    slice_ids = [r["sleeper_id"] for r in committed["players"]
                 if r.get("sleeper_id") and 200 <= r["rank"] <= 250]
    doc4, _ = run_against(drop(*slice_ids))
    check("more than five absences is out of bounds, so the cap is not decorative",
          doc4["n_unmatched_absent_from_board"] > 5,
          f"absent={doc4['n_unmatched_absent_from_board']} of {len(slice_ids)} dropped")

    print("\nCONTROLS " + ("ALL PASS" if ok else "FAILED"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
