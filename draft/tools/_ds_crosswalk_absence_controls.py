#!/usr/bin/env python3
# TERRITORY: D. MAKE CI'S BOARD REPRODUCIBLE OFFLINE FOR THE DRAFT SHARKS CROSSWALK.
"""`test_crosswalk_matches_every_player_uniquely` was GREEN in every sandbox and
RED in CI for five days. A test that cannot fail where you are looking at it is
a test you cannot fix where you are looking at it — so this makes the failure
reproducible on a developer's machine, by mutating a copy of the board and
running the REAL parser against it.

── WHAT HAPPENED, AND WHY THE SHAPE MATTERS MORE THAN THE NAMES ──────────────

On 2026-08-27 the board stopped carrying Nick Chubb (`4988`) and Trey Benson
(`11589`) — both unsigned free agents — and their two Draft Sharks rows had
nothing left to match. `n_unmatched == 0` was an invariant on a frozen 250-row
PDF joined to a LIVE board, so it could only hold until the world moved.
Registers 435 and 436; A's ruling replaced it with a 0.95 match-RATE floor plus
a uniqueness check taken over MATCHED rows only.

⚠️ THOSE TWO PLAYERS ARE NOW GONE FROM THE BOARD FOR GOOD, so the live baseline
is 248/250 rather than 250/250 and dropping them proves nothing any more. Every
control below therefore picks its victims BY RULE from whatever board is on disk
— never by name. Pinning the names would have made this file describe 2026-08-27
forever, which is the defect it exists to catch (register 382, and this file's
sibling `source_universe_drift.py` shipped with exactly that bug).

── WHY IT IS NOT A COPY OF A'S TEST (rule 3e, and register 436) ──────────────

The fail-arm shipped with the FIRST attempt at this fix could not fail: it built
`broken = dict(doc, n_unmatched=n)` and asserted `1 - n/n < 0.95`, which is
`0 < 0.95` — a constant-true comparison that never touched the matcher, the
board, or the parser. Every arm here runs the real `D.main()` against a real
mutated board, so it exercises the thing rather than the arithmetic.

  C1  the 08-27 SHAPE — two matched players leave the board; unmatched rises by
      exactly two, the rate still clears the floor, and uniqueness still passes.
      That last clause is register 436: unmatched rows carry `sleeper_id = None`,
      and counting them made the untouched uniqueness check report "two Draft
      Sharks rows matched the same player" when no two rows matched anything.
  C2  a REAL duplicate must still fire the uniqueness check.
  C3  the store is internally consistent — board-independent, catches a miscount.
  C4  the floor BITES: drop enough matched players and the rate goes under 0.95.

Nothing is written back: the board and the parser's own artifact are restored
from bytes captured before the first mutation, on every exit path including a
signal. `git checkout` is deliberately NOT used — a reset tool that reached for
git once reverted this author's own uncommitted fix mid-run.

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
FLOOR = 0.95           # A's shipped floor; mirrored, not redefined
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


def run_against(mutate):
    """Apply `mutate` to the board in memory, write it, run the real parser."""
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
    return doc


def rate(doc) -> float:
    matched = [r["sleeper_id"] for r in doc["players"] if r["sleeper_id"] is not None]
    return len(matched) / len(doc["players"])


def unique_over_matched(doc) -> bool:
    m = [r["sleeper_id"] for r in doc["players"] if r["sleeper_id"] is not None]
    return len(m) == len(set(m))


def ds_matched_on_board(board, n):
    """The `n` LOWEST-PROJECTION players that both sit on the board and carry a
    Draft Sharks row. Chosen by rule so this file never pins a board vintage;
    lowest-projection because those are the ones a live board actually sheds."""
    ids = {p["player_id"]: (p.get("proj_baseline") or 0)
           for p in board.get("players", []) + board.get("kept_players", [])
           if p.get("player_id")}
    ds = {r["sleeper_id"] for r in json.loads(ARTIFACT.read_text())["players"]
          if r.get("sleeper_id")}
    return [pid for _, pid in sorted((v, k) for k, v in ids.items() if k in ds)][:n]


def drop_lowest_ds(n):
    def _m(board):
        victims = set(ds_matched_on_board(board, n))
        for k in ("players", "kept_players"):
            board[k] = [p for p in board.get(k, []) if p.get("player_id") not in victims]
    return _m


def main() -> int:
    ok = True

    def check(label, cond, detail=""):
        nonlocal ok
        print(f"  {'PASS' if cond else 'FAIL'}  {label}"
              + (f" — {detail}" if detail and not cond else ""))
        ok = ok and bool(cond)

    base = run_against(lambda b: None)
    n = len(base["players"])
    print(f"BASELINE — {n - base['n_unmatched']}/{n} matched, rate {rate(base):.4f}")
    check("C3 the store is internally consistent (board-independent)",
          base["n_unmatched"] == sum(1 for r in base["players"] if r["sleeper_id"] is None)
          and base["n_matched"] + base["n_unmatched"] == n,
          f"n_matched={base['n_matched']} n_unmatched={base['n_unmatched']} total={n}")
    check("C3 today's board clears the shipped floor",
          rate(base) >= FLOOR, f"rate {rate(base):.4f} < {FLOOR}")

    print("C1 THE 08-27 SHAPE — two matched players leave the board")
    d1 = run_against(drop_lowest_ds(2))
    check("unmatched rises by exactly two",
          d1["n_unmatched"] == base["n_unmatched"] + 2,
          f"{base['n_unmatched']} -> {d1['n_unmatched']}")
    check("the rate still clears the floor, so the board still publishes",
          rate(d1) >= FLOOR, f"rate {rate(d1):.4f}")
    check("and uniqueness still PASSES — register 436, the None rows are excluded",
          unique_over_matched(d1),
          "two unmatched rows are being read as a duplicate match again")
    naive = [r["sleeper_id"] for r in d1["players"]]
    check("CONTROL — counting the None rows WOULD have failed it, so that "
          "exclusion is load-bearing and not decoration",
          len(naive) != len(set(naive)))

    print("C2 A REAL DUPLICATE must still fire")
    rows = [dict(r) for r in base["players"]]
    donor = next(r for r in rows if r["sleeper_id"] is not None)
    victim = next(r for r in rows if r["sleeper_id"] is not None and r is not donor)
    victim["sleeper_id"] = donor["sleeper_id"]
    check("two rows resolving to the same board player is caught",
          not unique_over_matched({"players": rows}))

    print("C4 THE FLOOR BITES — a whole slice of matched players leaves")
    need = int(n * (1 - FLOOR)) + base["n_unmatched"] + 2
    d4 = run_against(drop_lowest_ds(need))
    check("the rate goes under the floor, so the floor is not decorative",
          rate(d4) < FLOOR, f"dropped {need}, rate {rate(d4):.4f}")

    print("\nCONTROLS " + ("ALL PASS" if ok else "FAILED"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
