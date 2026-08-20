#!/usr/bin/env python3
"""BOARD-GATE TRIAGE — does this suite failure mean THE BOARD is bad?

Register 55, fixed on Cory's call ("Let's just fix it now", 2026-08-19)
rather than deferred past the draft.

THE PROBLEM, measured: `draft-data.yml`'s acceptance gate runs the whole
python suite against the freshly built board and refuses to publish on
ANY failure. On 08-19 that refused Cory's board FOUR TIMES the night
before keeper lock, and of the six distinct failures across those runs
**exactly one was about the board** (real input drift from the vegas
refresh — the gate working). The other five were repo hygiene and
tooling: an artifact-consumer detector whose founding case had gained a
real reader, a store row count pinned to an exact number while nflverse
published more lines, a census one nightly stale, an enrollment test
pinning the live winner rather than the rule, and a git-history-dependent
pairing guard that cannot run under `fetch-depth: 2`. Every false refusal
spends the alarm the real one needs.

THE DESIGN, and why it is this way round: **everything blocks by
default.** Only an explicitly ADVISORY test — named here, with a reason —
can fail without stopping the publish. An unclassified failure is a
BLOCKING failure, so a new board defect can never become advisory by
omission. That is the safe direction three days before a draft.

TWO SELF-CHECKS, because an allowlist is exactly the thing that rots:
  * an advisory file that READS THE BOARD is refused at runtime (it would
    be classifying a board test as hygiene — the one mistake that matters);
  * an advisory entry whose file no longer exists is refused, so the list
    cannot quietly accumulate dead names.

Usage (in the gate, after pytest has written its output):
    python3 draft/tools/gate_triage.py /tmp/board_gate_output.txt
    exit 0 -> every failure is advisory; publish, with a warning
    exit 1 -> at least one BLOCKING failure; refuse to publish
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#: Tests that CANNOT indict the board: they audit the repo's own tooling
#: and artifacts. Each entry states why it cannot be about the board.
ADVISORY = {
    "draft/tests/test_stale_blockers.py":
        "repo hygiene: pairs a refusal artifact with later artifacts to find "
        "stale blockers. Depends on git history (git log per path), so it is "
        "unmeasurable under the gate's fetch-depth: 2 — it says nothing about "
        "the board's contents in either direction.",
    "draft/tests/test_unread_artifacts.py":
        "repo hygiene: detects committed artifacts with no consumer. Scans "
        "source files for readers; a pass or fail is a statement about "
        "wiring, never about a player row.",
}

#: A THIRD CATEGORY, ADDED 2026-08-20 AND OFF BY DEFAULT.
#:
#: ADVISORY above means "this failure cannot be about the board". These are
#: different: they ARE about the board, and what they are saying is that THE
#: WORLD IS NOT SETTLED YET — not that the board is wrong.
#:
#: The case that forced it. `test_freeze_staleness_alarm.py` escalates while the
#: keeper lock reads passed and the pre-draft freeze is still PROVISIONAL. On
#: 2026-08-20 six of Cory's ten teams had keepers PLACED on the Sleeper draft, so
#: the lock read passed a day early via the derived path, the freeze could not
#: seal (sealing needs teams_placed == teams_expected), and the alarm escalated.
#: The publish gate runs a blanket `pytest draft/tests`, so a monitoring signal
#: about the LEAGUE blocked publication of the BOARD. Five refusals; 4640 passed,
#: 3 failed, and all three were this one alarm.
#:
#: Blocking the rebuild does not settle the world. It leaves Cory drafting off an
#: ever-staler board, which is strictly worse than the exposure the alarm exists
#: to flag. But waving it through silently is worse still, so:
#:
#:   * DEFAULT IS OFF. With the flag unset, a world-state failure BLOCKS exactly
#:     as it does today — behaviour is byte-identical, asserted in the tests.
#:   * Turning it on is a deliberate act by Cory, one environment variable, not
#:     a code edit under Friday-night pressure.
#:   * When on, the board still only publishes if EVERY other failure is clear.
#:     One real board defect alongside a world-state alarm still refuses.
#:   * When on, the tool writes a stamp naming what was overridden, so a board
#:     published this way can never look like a clean one.
#:
#: Each entry must name the external condition and how it CLEARS — an override
#: with no exit condition is a permanent bypass wearing a reason.
WORLD_STATE = {
    "draft/tests/test_freeze_staleness_alarm.py": {
        "condition":
            "the pre-draft freeze is PROVISIONAL while the keeper lock reads "
            "passed. This is a fact about Cory's LEAGUE (how many teams have "
            "placed keepers on the Sleeper draft), not about the board's "
            "contents: the same board passes 4640 other tests.",
        "clears_when":
            "all ten teams have keepers PLACED on the draft, which makes "
            "assess_slate report confirmed=True, which lets a freeze re-take "
            "return CONFIRMED and quiets the alarm by itself.",
        "cost_of_overriding":
            "the board is built on a freeze validated against PREDICTED "
            "opponent keepers. The board's PLAYER data is unaffected; what is "
            "provisional is the season-grading baseline and the availability "
            "model's assumption about which players opponents remove.",
    },
}

#: The env var Cory flips. Any value other than the exact string "1" leaves the
#: override OFF — a typo must fail closed, not open.
OVERRIDE_ENV = "ALLOW_WORLD_STATE_PUBLISH"
STAMP_PATH = ROOT / "public" / "world_state_override.json"

BOARD_MARKERS = ("draft_data.json", "public/draft", "load_board", "BOARD =")
FAILED = re.compile(r"^FAILED\s+([^\s:]+)")


def advisory_is_still_honest():
    """Refuse the whole triage if the allowlist has rotted (rule 3f)."""
    problems = []
    for rel, reason in ADVISORY.items():
        p = ROOT / rel
        if not p.exists():
            problems.append(f"{rel}: listed as advisory but does not exist")
            continue
        if len(reason.strip()) < 40:
            problems.append(f"{rel}: advisory entry has no real reason")
        text = p.read_text()
        hits = [m for m in BOARD_MARKERS if m in text]
        if hits:
            problems.append(
                f"{rel}: READS THE BOARD ({', '.join(hits)}) — it must not be "
                "advisory; a board-reading test has to be able to refuse")
    return problems


def world_state_is_still_honest():
    """The world-state list has to survive the same scrutiny as the advisory one,
    with one deliberate difference: a world-state test IS ALLOWED to read the
    board. That is the whole point — it reads the board to learn about the world.
    So the board-marker check does not apply, and in its place every entry must
    name the condition, how it CLEARS, and what overriding it costs. An override
    with no exit condition is a permanent bypass wearing a reason."""
    problems = []
    for rel, meta in WORLD_STATE.items():
        p = ROOT / rel
        if not p.exists():
            problems.append(f"{rel}: listed as world-state but does not exist")
            continue
        for key in ("condition", "clears_when", "cost_of_overriding"):
            if len(str(meta.get(key, "")).strip()) < 40:
                problems.append(f"{rel}: world-state entry has no real '{key}'")
        if rel in ADVISORY:
            problems.append(
                f"{rel}: listed BOTH advisory and world-state — pick one; they "
                "mean different things and the overlap hides which applies")
    return problems


def override_enabled(env=None):
    """OFF unless the env var is exactly '1'. A typo fails CLOSED."""
    import os
    return (env if env is not None else os.environ).get(OVERRIDE_ENV) == "1"


def classify(output_text, allow_world_state=False):
    """Returns (blocking, advisory, world_state).

    With allow_world_state False — the default, and what runs today — a
    world-state failure lands in `blocking`, so behaviour is identical to before
    this category existed. That equivalence is asserted in the tests rather than
    claimed here."""
    blocking, advisory, world = [], [], []
    for line in output_text.splitlines():
        m = FAILED.match(line.strip())
        if not m:
            continue
        nodeid = m.group(1)
        path = nodeid.split("::")[0]
        if path in ADVISORY:
            advisory.append(nodeid)
        elif path in WORLD_STATE and allow_world_state:
            world.append(nodeid)
        else:
            blocking.append(nodeid)
    return blocking, advisory, world


def main(argv=None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    if not argv:
        print("gate-triage: no pytest output file given")
        return 1
    rot = advisory_is_still_honest() + world_state_is_still_honest()
    if rot:
        print("gate-triage: REFUSING — the advisory list itself is unsound:")
        for r in rot:
            print("  ✗ " + r)
        return 1

    allow = override_enabled()
    text = Path(argv[0]).read_text(errors="replace")
    blocking, advisory, world = classify(text, allow_world_state=allow)

    if not blocking and not advisory and not world:
        print("gate-triage: no FAILED lines parsed from the pytest output — "
              "treating as BLOCKING, because a gate that cannot read its own "
              "evidence must not wave a board through")
        return 1

    for n in advisory:
        print(f"  · ADVISORY  {n}\n      {ADVISORY[n.split('::')[0]]}")
    for n in world:
        meta = WORLD_STATE[n.split("::")[0]]
        print(f"  ⚠ WORLD-STATE OVERRIDDEN  {n}\n"
              f"      condition : {meta['condition']}\n"
              f"      clears    : {meta['clears_when']}\n"
              f"      cost      : {meta['cost_of_overriding']}")
    for n in blocking:
        print(f"  ✗ BLOCKING  {n}")

    if blocking:
        print(f"gate-triage: {len(blocking)} blocking failure(s) — "
              "REFUSING to publish this board.")
        if world:
            print("  (a world-state override was active, and it changed "
                  "nothing: a real board failure still refuses.)")
        return 1

    if world:
        _write_stamp(world)
        print(f"gate-triage: {len(world)} WORLD-STATE failure(s) overridden by "
              f"{OVERRIDE_ENV}=1, {len(advisory)} advisory, ZERO board "
              "failures — publishing. ⚠️ This board is NOT clean: it is a good "
              "board published while the world is unsettled, and "
              "public/world_state_override.json records exactly what was "
              "waived. Unset the variable the moment the condition clears.")
        return 0

    print(f"gate-triage: {len(advisory)} failure(s), ALL advisory (repo "
          "hygiene, not the board) — publishing. These still need fixing; "
          "they just do not get to hold Cory's board hostage.")
    return 0


def _write_stamp(world):
    """A board published over a world-state alarm must never be indistinguishable
    from a clean one. The war room and draft_ready can both read this."""
    import json
    import time
    STAMP_PATH.parent.mkdir(parents=True, exist_ok=True)
    STAMP_PATH.write_text(json.dumps({
        "_what": "This board was published while a WORLD-STATE alarm was "
                 "firing. The alarm was overridden deliberately, by setting "
                 f"{OVERRIDE_ENV}=1. It is not a clean build.",
        "overridden_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "tests": sorted(world),
        "details": {n.split("::")[0]: WORLD_STATE[n.split("::")[0]]
                    for n in world},
    }, indent=2))


if __name__ == "__main__":
    sys.exit(main())
