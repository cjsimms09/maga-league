# TERRITORY: A
"""WHICH COMMITTED NUMBERS CARE THAT `kept_players` STOPPED MEANING "MINE"?

── THE INCIDENT (register 417) ─────────────────────────────────────────────

`public/draft_data.json`'s `kept_players` held CORY'S THREE keepers before the
draft and holds the LEAGUE'S TWENTY-THREE after it. The field did not change
shape and nothing crashed — every reader still gets a list of players, just a
different population.

`applyRehearsalKeepers` in the war room used it as an exemption set, so a
predicted opponent keeper who was ALSO a confirmed one survived a filter meant
for my own. That one was found by reading. MEASURED here instead: 149 code
references across 91 production files, and only `public/js/draft/**` had been
looked at.

── WHY THIS IS A COUNTERFACTUAL AND NOT A GREP ─────────────────────────────

"Does this file mention `team_slot`" is a heuristic, and a bad one: most
readers legitimately want ALL keepers (the board must remove every kept player
from the pool, whoever holds him). Only "wants MINE and does not filter" is a
defect, and no grep can tell those apart.

So ask the question that has an answer: regenerate each registered artifact
twice — once against the real board, once against a board whose
`kept_players` is restricted to Cory's own seat — and see which VALUES move.
An artifact that moves is SENSITIVE to the distinction and a human then
decides which population it wanted. An artifact that does not move cannot
care.

⚠️ SENSITIVE IS NOT A DEFECT. A tool that prices the draft pool SHOULD change
when 20 keepers vanish — that is it working. The verdict this tool exists to
surface is the opposite one: a tool that is sensitive when it claimed to be
reading "my slate".

── REUSE, NOT A THIRD COPY ─────────────────────────────────────────────────

The sandboxing, the determinism control and the comparison are
`ungraded_season_leak.check()`, which already takes two sandboxes and does not
care what makes them differ. Register 408's lesson cost this project a
duplicate-arm guard shipped four times by hand; this is the same machinery
pointed at a different counterfactual, not a copy of it.

Run: python3 draft/tools/kept_players_scope_probe.py [--json PATH] [--id X]
     python3 draft/tools/kept_players_scope_probe.py --self-test
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_artifact_freshness import ROOT, REGISTRY_PATH, Sandbox  # noqa: E402
from ungraded_season_leak import check  # noqa: E402

BOARD_REL = "public/draft_data.json"


def my_seat(board: dict) -> int | None:
    """Cory's LEAGUE seat, taken from the board rather than hardcoded.

    ⚠️ `kept_players.team_slot` is stamped with the LEAGUE seat, which is not
    the room seat in a mock — the distinction that started every rehearsal
    with an empty roster (app.js's own comment). `league.my_draft_slot` is the
    league one.
    """
    slot = (board.get("league") or {}).get("my_draft_slot")
    return int(slot) if slot is not None else None


def restrict_to_my_seat(board: dict, seat: int) -> tuple[dict, int, int]:
    out = json.loads(json.dumps(board))
    before = len(out.get("kept_players") or [])
    out["kept_players"] = [k for k in (out.get("kept_players") or [])
                           if str(k.get("team_slot")) == str(seat)]
    return out, before, len(out["kept_players"])


def reads_kept_players(entry: dict) -> bool:
    """⚠️ Narrows the RUN, never the VERDICT — an entry excluded here is
    reported `not_applicable`, never clean (rule 3e)."""
    try:
        return "kept_players" in (ROOT / entry.get("owner_module", "")).read_text(
            encoding="utf8", errors="replace")
    except OSError:
        return False


def _seed(sb: Sandbox, board: dict) -> None:
    (sb.path() / BOARD_REL).write_text(json.dumps(board, indent=1))


def self_test() -> int:
    passed = failed = 0

    def ck(name, ok, detail=None):
        nonlocal passed, failed
        if ok:
            passed += 1
            print(f"PASS  {name}")
        else:
            failed += 1
            print(f"FAIL  {name}" + (f"\n        {detail!r}"[:280] if detail is not None else ""))

    board = json.loads((ROOT / BOARD_REL).read_text())
    seat = my_seat(board)
    ck("C0 the board names Cory's LEAGUE seat, so the counterfactual is not "
       "hardcoded", seat is not None, seat)

    #: KNOWN POSITIVE for the seat itself: his three keepers are on the record
    #: in DRAFT-WEEK-BRIEF and all carry one slot. If that stops holding, the
    #: probe is restricting to the wrong seat and every verdict below is void.
    named = {"Ja'Marr Chase", "Derrick Henry", "Kenneth Walker"}
    slots = {str(k.get("team_slot")) for k in board["kept_players"]
             if k.get("name") in named}
    ck("C1 KNOWN POSITIVE — Cory's three named keepers all sit on ONE slot, and "
       "it is the seat the board declares",
       len(slots) == 1 and slots == {str(seat)}, (slots, seat))

    small, before, after = restrict_to_my_seat(board, seat)
    ck("C2 the restriction actually removes players — before > after, so the "
       "counterfactual is not a no-op", before > after, (before, after))
    ck("  and what survives is exactly the seat asked for",
       all(str(k.get("team_slot")) == str(seat) for k in small["kept_players"])
       and len(small["kept_players"]) == after)
    ck("  while the rest of the board is untouched",
       len(small["players"]) == len(board["players"]))

    #: C3 END-TO-END, both directions, through the SHARED machinery.
    real, mine = Sandbox(), Sandbox()
    try:
        _seed(mine, small)
        counter = {"regenerate_command": [
            sys.executable, "-c",
            "import json;b=json.load(open('" + BOARD_REL + "'));"
            "print(json.dumps({'n': len(b['kept_players'])}))"]}
        from ungraded_season_leak import regenerate
        a = regenerate(counter, cwd=real.path())
        b = regenerate(counter, cwd=mine.path())
        ck("C3 KNOWN POSITIVE end-to-end — a probe counting kept_players sees "
           f"{before} in the real sandbox and {after} in the restricted one",
           a == {"n": before} and b == {"n": after}, (a, b))
        blind = {"regenerate_command": [sys.executable, "-c",
                                        "import json;print(json.dumps({'n': 1}))"]}
        ck("  KNOWN NEGATIVE — a probe that ignores the board reports the same in "
           "both, so SENSITIVE is not what this says about everything",
           regenerate(blind, cwd=real.path()) == regenerate(blind, cwd=mine.path()))
    finally:
        real.close()
        mine.close()

    print(f"\n{passed}/{passed + failed} self-tests passed")
    return 1 if failed else 0


LABEL = {
    "CLEAN": "✅ indifferent",
    "CONTAMINATED": "🔵 SENSITIVE — its numbers move",
    "NONDETERMINISTIC": "🟣 NOT REPRODUCIBLE — cannot be judged",
    "ERROR": "⚠️  errored",
    "REQUIRES_IT": "🔵 needs the full slate by construction",
    "BY_DESIGN": "🔵 declared intentional",
}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", dest="out")
    ap.add_argument("--id", action="append", dest="ids", default=None)
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args(argv)
    if args.self_test:
        return self_test()

    board = json.loads((ROOT / BOARD_REL).read_text())
    seat = my_seat(board)
    if seat is None:
        print("the board does not declare league.my_draft_slot — REFUSING rather "
              "than guessing a seat (rule 3e: a wrong seat makes every verdict "
              "below meaningless while looking fine)")
        return 2
    small, before, after = restrict_to_my_seat(board, seat)
    if before == after:
        print(f"kept_players already holds only seat {seat} ({after} players) — "
              "there is no distinction to probe today. That is a real answer, "
              "not a clean bill of health.")
        return 0

    entries = json.loads(REGISTRY_PATH.read_text())["entries"]
    if args.ids:
        entries = [e for e in entries if e["id"] in set(args.ids)]

    print("KEPT_PLAYERS SCOPE — which numbers move when the board carries only "
          "MY keepers?\n")
    print(f"  Cory's league seat {seat}  ·  kept_players {before} → {after}\n")

    real, mine = Sandbox(), Sandbox()
    rows = []
    try:
        _seed(mine, small)
        for e in entries:
            if not reads_kept_players(e):
                rows.append({"id": e["id"], "status": "not_applicable"})
                continue
            status, detail = check(e, real, mine)
            rows.append({"id": e["id"], "artifact_path": e.get("artifact_path"),
                         "status": status, "detail": detail})
            print(f"  {LABEL.get(status, status):34} {e['id']}")
            if detail:
                print(f"       {detail[:190]}")
    finally:
        real.close()
        mine.close()

    sens = [r for r in rows if r["status"] == "CONTAMINATED"]
    na = [r for r in rows if r["status"] == "not_applicable"]
    print(f"\n  {len(sens)} sensitive · {len(rows) - len(sens) - len(na)} other "
          f"· {len(na)} not applicable (owner_module never reads kept_players)")
    print("\n  ⚠️  SENSITIVE IS NOT A DEFECT. A tool that prices the draft pool SHOULD")
    print("      move when 20 keepers vanish. The defect is a tool that moves while")
    print("      claiming to read \"my slate\" — read each one before filing.")
    print("  ⚠️  NOT-APPLICABLE IS NOT CLEAN: it means the generator never reads the")
    print("      field, so this instrument cannot speak about it.")

    if args.out:
        Path(args.out).write_text(json.dumps({
            "_territory": "TERRITORY: A — draft/tools/kept_players_scope_probe.py",
            "_answers": "register 417",
            "_note": "REPORT ONLY. Both arms run in throwaway git worktrees.",
            "my_seat": seat, "kept_players_before": before,
            "kept_players_after": after, "rows": rows,
        }, indent=1) + "\n")
        print(f"\n  wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
