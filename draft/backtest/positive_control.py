# TERRITORY: C
"""POSITIVE CONTROLS — a probe diagnoses ITSELF before it reports on the world.

A's proposal, and it is this lane's cheapest win by a distance. Every probe here runs
against a world it cannot see, so a zero has two readings — "there is nothing there" and
"my instrument is broken" — and they render identically. FOUR FALSE RESULTS THIS WEEK
CAME FROM THE SECOND BEING REPORTED AS THE FIRST:

  the status filter    `only_200` removed every capture of a page that had started
                       301-redirecting, so a heavily-archived URL read as unarchived.
  the capture walk     `tries=4` examined the newest FOUR DAYS and reported NO BOARD AT
                       THIS URL, while a capture 19 days earlier passed the gate 15/15.
  the shape gate       422KB of navigation menu counted as a board, and ROUTE 1 IS OPEN
                       was reported on site chrome.
  the name pattern     `extract_names` had no CSV path, so every dated CSV in the mirror
                       read 0/0 and the only real lead was invisible.

A POSITIVE CONTROL IS ONE INPUT KNOWN TO BE PRESENT, run through THE SAME CODE PATH, with
a fixed expected answer. If the control fails, the probe is broken and its negatives are
VOID — not "worth checking", void. Twenty minutes of run becomes twenty seconds.

THREE PROPERTIES THIS SCAFFOLD ENFORCES, each because its absence is a real failure mode:

  SAME PATH.  A control that exercises a parallel implementation proves nothing about the
              one that ran. The control is a call to the probe's own function.
  FIXED ANSWER.  The expectation is external and constant. An expectation derived from the
              code always agrees with it — the self-referential-fixture defect, rule 10d.
  NO CONTROLS IS NOT ALL-PASSED.  An empty control set reports UNCONTROLLED, never OK.
              Absent is not zero, here as everywhere in this lane.
"""


def control(name, fn, expect, why="") -> dict:
    """Run one control. `fn()` must exercise the probe's OWN path.

    An exception is a FAILED control, not a crashed run: a probe whose instrument throws
    is exactly as broken as one whose instrument returns the wrong answer, and letting it
    propagate turns a diagnosis into an outage.
    """
    try:
        got = fn()
        ok = (got == expect)
        err = None
    except Exception as e:                                       # noqa: BLE001
        got, ok, err = None, False, "%s: %s" % (type(e).__name__, e)
    return {"name": name, "ok": bool(ok), "got": got, "expect": expect,
            "why": why, "error": err}


def run(controls) -> dict:
    """Run every control and summarise. `controls` is [(name, fn, expect, why), ...]."""
    rows = [control(*c) for c in controls]
    failed = [r for r in rows if not r["ok"]]
    return {"controls": rows, "n": len(rows), "failed": failed,
            "uncontrolled": not rows, "ok": bool(rows) and not failed}


def guard(verdict: str, result: dict) -> str:
    """Put the instrument's own state IN FRONT OF the verdict, always.

    On failure the verdict is REPLACED, not annotated. A broken probe's finding is not a
    finding with a caveat — it is not evidence, and leaving it readable next to a warning
    is how the four results above got reported.

    On success the control line still prints. A reader must be able to see that the
    instrument was checked, not infer it from the absence of a complaint.
    """
    if result.get("uncontrolled"):
        return ("UNCONTROLLED — this probe ran NO positive control, so a zero here cannot "
                "be told apart from a broken instrument. The result below is not void, it "
                "is UNVERIFIED, and that is a defect in the probe rather than a property "
                "of the world || %s" % verdict)
    if not result.get("ok"):
        bad = "; ".join("%s (got %r, expected %r%s)"
                        % (r["name"], r["got"], r["expect"],
                           "; raised %s" % r["error"] if r["error"] else "")
                        for r in result["failed"])
        return ("INSTRUMENT FAILED — %d of %d positive control(s) did not return their "
                "known answer, so THIS PROBE'S RESULTS ARE VOID and are not reported. A "
                "control that fails means the probe cannot see what it is looking for, "
                "which makes every negative meaningless: %s"
                % (len(result["failed"]), result["n"], bad))
    return "controls: %d/%d passed || %s" % (result["n"], result["n"], verdict)
