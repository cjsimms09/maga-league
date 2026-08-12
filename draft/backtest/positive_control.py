# TERRITORY: C
"""A NEGATIVE IS ONLY A FINDING IF THE INSTRUMENT COULD HAVE SEEN A POSITIVE.

Four times in one day this lane produced a confident wrong answer, and every one
was the same shape: a NEGATIVE (or a failure) reported by an instrument nobody
had shown could produce a POSITIVE.

    the JS suite read 60+ suites RED         -> a git worktree has no node_modules;
                                                every suite failed to LOAD
    a second run read 17 suites RED          -> two full suite runs were racing each
                                                other for ports
    a rehearsal read "REBASE CONFLICT"       -> my harness wrote $GITHUB_OUTPUT inside
                                                the repo, so the tree was dirty
    a fast-forward reproduction "proved"     -> `git init` without `-b main`, so the
    a rollback bug on the wrong target          merge was feat-into-feat

None of those was a wrong ANSWER from a working instrument. Each was a working
instrument pointed at a broken setup, and in every case the output was
indistinguishable from the real finding it imitated.

── THE RULE, AND IT IS ONE LINE ────────────────────────────────────────────────

An empty observation has TWO causes and they must never share a name:

    ABSENT      I looked, the instrument works, and the thing is not there.
    UNCOUNTED   I could not look. This is a statement about the RUN.

`verdict()` refuses to say ABSENT unless a control — a case where the answer is
known to be positive — actually came back positive. Same three-way discipline as
`field_population`'s present/null/missing, applied to a probe rather than a field.

── WHY A SCAFFOLD RATHER THAN A HABIT ──────────────────────────────────────────

The habit is what failed. I HELD the habit — this lane wrote rule 13f — and still
shipped four of these in a day, because the discipline lives at the moment you
read a result, which is exactly when you are least sceptical. A function makes
the control a PARAMETER: you cannot call it without deciding what a positive
would look like, and forgetting to pass one produces UNCOUNTED rather than a
clean negative.

NOT A DASHBOARD (rule 9). It computes nothing, stores nothing, and reports
nothing on its own. It is called at the point a probe decides what it found.
"""
from __future__ import annotations

FOUND = "FOUND"
ABSENT = "ABSENT"
UNCOUNTED = "UNCOUNTED"

CONTROL_VERSION = "positive-control/v1"


def _size(x):
    """How much did we observe. `None` is not zero — it is 'no observation'."""
    if x is None:
        return None
    if isinstance(x, bool):
        return 1 if x else 0
    if isinstance(x, (int, float)):
        return int(x)
    try:
        return len(x)
    except TypeError:
        return 1


def verdict(observed, control, *, what="the thing", control_is="a known-positive case"):
    """Classify an observation that came back empty.

    `observed` is what the probe found. `control` is what the SAME probe found on
    a case where the answer is known positive.

    Returns {"state", "n", "control_n", "why"}.

    THE ONE ASYMMETRY THAT MATTERS: a non-empty `observed` is FOUND regardless of
    the control, because finding the thing proves the instrument works. Only an
    EMPTY observation needs the control, and that is the whole point — the control
    is not a general quality bar, it is the specific guard against reading "I saw
    nothing" as "there is nothing".
    """
    n = _size(observed)
    cn = _size(control)
    if n:
        return {"state": FOUND, "n": n, "control_n": cn,
                "why": "%s observed (%s) — the instrument saw, so the control is moot"
                       % (what, n)}
    if cn:
        return {"state": ABSENT, "n": 0, "control_n": cn,
                "why": "%s not present, AND the instrument found %s on %s — "
                       "so this is a real negative" % (what, cn, control_is)}
    return {"state": UNCOUNTED, "n": n or 0, "control_n": cn,
            "why": "COULD NOT LOOK: the control (%s) returned %s, so an empty result "
                   "here is a statement about THIS RUN and not about %s"
                   % (control_is, "nothing" if cn == 0 else "no observation", what)}


def line(v) -> str:
    """One line for a summary. UNCOUNTED is loud on purpose."""
    if v["state"] == UNCOUNTED:
        return "UNCOUNTED — %s" % v["why"]
    return "%s (n=%s, control=%s)" % (v["state"], v["n"], v["control_n"])


def is_reportable_negative(v) -> bool:
    """True only for ABSENT. The predicate a caller should gate a FINDING on.

    Written as its own function because `state != FOUND` is the mistake this
    module exists to prevent, and it is the natural thing to type.
    """
    return v["state"] == ABSENT
