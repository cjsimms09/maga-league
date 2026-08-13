# TERRITORY: C
"""THE SEPTEMBER COMMITMENT, AS A CHECK THAT CAN FAIL ON EACH CONDITION ALONE.

Cory, 2026-08-13, recorded three conditions and one requirement about them:

    1. INGEST EMITS projected / absent / imputed PER FIELD.
    2. DERIVED VALUES ARE NULL WHEN AN INPUT IS ABSENT — never a fabricated numeric.
    3. THE ENGINE READS STATUS rather than inferring missingness from value.

    "Not 'improve status handling'. All three must hold, and A CHECK MUST BE ABLE TO
     FAIL ON EACH ONE ALONE."

That clause is the specification, and it is why this ships in August rather than in
September. **A commitment with a check that currently reports RED is a commitment; a
commitment without a check is a note.** Nothing here fixes anything — conditions 2
and 3 live in A's board build and A's engine. This states the conditions in a form
that can be run, and reports the honest starting state.

THE HAZARD, WHICH IS NOT A FOURTH CONDITION BUT A PROPERTY OF THE PAIR. The engine
reads `p.vorp || 0` at engine.js:572, :981 and :992. `null || 0` is `0`, and 0 is
ABOVE the -172.67 the unprojected players carry today. So condition 2 satisfied
WITHOUT condition 3 does not partially fix the tie block — it PROMOTES all 1,183 of
them above every real negative-VORP player on the board. Two-thirds done is the worst
state this system can occupy, and a checker that reported the three independently
would score it as progress. So the pair is reported explicitly.

RULE 13F: IT CANNOT GO GREEN ON NOTHING. Handed no board, or no engine source, every
affected condition reports `uncounted` and `ok` is False. A check that can only say
"nothing yet" has not looked, and vacuous green is the failure mode this whole
program keeps finding.

NOT A DASHBOARD (rule 9). One call, one verdict, fit to gate a workflow step.
"""
from __future__ import annotations

import re

#: The statuses a field-level marker may carry. `derived` is included because a
#: computed field's status is a fact about the computation, not about ingest.
VALID_STATUS = ("projected", "absent", "imputed", "derived", "measured")

#: Fields that are DERIVED — their value is a function of other fields, so an absent
#: input must produce a null here rather than a number.
DERIVED_FIELDS = ("vorp", "proj_sd", "proj_ceiling", "score")

#: The inputs those derivations consume. Absent input + numeric output = condition 2
#: violated, which is the 1,181-player tie block in one sentence.
DERIVED_INPUTS = ("proj_mean",)

#: Value-coalescing patterns that infer missingness from VALUE. `?? ` is fine — it
#: distinguishes null from 0 — so only `||` and explicit falsy tests are flagged.
COALESCE = (
    re.compile(r"\.(?:vorp|proj_mean|proj_sd|proj_ceiling|score)\s*\|\|"),
    re.compile(r"\|\|\s*0\b"),
)

STATUS_SUFFIX = "_status"


def _status_of(p, field):
    return p.get(field + STATUS_SUFFIX)


def _c(status, why):
    return {"status": status, "why": why}


def condition_1(players) -> dict:
    """Every value-bearing field carries a status of its own."""
    if not players:
        return _c("uncounted", "no board — a rate needs a denominator (rule 13f)")
    missing = []
    for p in players:
        for f in list(DERIVED_INPUTS) + list(DERIVED_FIELDS):
            if f in p and _status_of(p, f) is None:
                missing.append("%s.%s" % (p.get("player_id"), f))
    if missing:
        return _c("fail",
                  "%d field(s) carry a value with no %s beside it, e.g. %s. "
                  "field_population/v1 is a report ABOUT the data; this condition "
                  "asks for a status ON each field."
                  % (len(missing), STATUS_SUFFIX, ", ".join(missing[:4])))
    # ONLY FIELDS THAT ACTUALLY CARRY A STATUS. Without this guard a field with NO
    # status also lands here, which made the branch above unreachable in effect —
    # its test passed on this branch's verdict rather than its own. Found by
    # mutation: deleting the missing-status check killed nothing.
    bad = [("%s.%s" % (p.get("player_id"), f), _status_of(p, f))
           for p in players for f in list(DERIVED_INPUTS) + list(DERIVED_FIELDS)
           if f in p and _status_of(p, f) is not None
           and _status_of(p, f) not in VALID_STATUS]
    if bad:
        return _c("fail", "status values outside %s: %s" % (list(VALID_STATUS), bad[:4]))
    return _c("pass", "every value-bearing field on %d player(s) carries a status"
                      % len(players))


def condition_2(players) -> dict:
    """A derived field is null whenever an input it needs is absent."""
    if not players:
        return _c("uncounted", "no board — a rate needs a denominator (rule 13f)")
    offenders, with_absent = [], 0
    for p in players:
        inputs_absent = [f for f in DERIVED_INPUTS
                         if p.get(f) is None or _status_of(p, f) == "absent"]
        if not inputs_absent:
            continue
        with_absent += 1
        for d in DERIVED_FIELDS:
            if d in p and isinstance(p.get(d), (int, float)) and not isinstance(p.get(d), bool):
                offenders.append("%s.%s=%s (input %s absent)"
                                 % (p.get("player_id"), d, p.get(d), inputs_absent[0]))
    if offenders:
        return _c("fail",
                  "%d derived value(s) are NUMBERS while an input is absent: %s. "
                  "A number means a number; null means the thing needed to calculate "
                  "it does not exist." % (len(offenders), "; ".join(offenders[:3])))
    if not with_absent:
        # NOTHING TO JUDGE IS NOT A PASS (rule 13f). On the 2026 board `proj_mean`
        # is 100% populated because the unprojected players carry 0.0 rather than
        # None — so this condition has no absent input to test against, and a
        # "pass" here would be the checker saying "nothing yet" in a voice that
        # sounds like success, on the board whose defining defect is exactly that
        # absence is stored as zero.
        return _c("uncounted",
                  "no player has an absent input to test against — on this board "
                  "absence is encoded as 0.0 rather than null, so condition 2 "
                  "cannot fail here and its pass would carry no evidence")
    return _c("pass",
              "no derived field carries a number off an absent input, across %d "
              "player(s) that HAVE an absent input" % with_absent)


def condition_3(engine_src) -> dict:
    """The engine distinguishes null from zero rather than coalescing on value."""
    if engine_src is None:
        # A claim about the engine, with no engine read. UNKNOWN, not clean.
        return _c("uncounted",
                  "no engine source supplied — condition 3 is a claim about what the "
                  "engine does, and nothing was examined")
    hits = []
    for pat in COALESCE:
        hits += pat.findall(engine_src)
    if hits:
        return _c("fail",
                  "%d value-coalescing site(s) found (e.g. `|| 0`): null and zero are "
                  "indistinguishable there, and `null || 0` is 0 — which outranks "
                  "every real negative VORP on the board" % len(hits))
    return _c("pass", "no value-coalescing on the status-bearing fields")


def check(players, engine_src=None) -> dict:
    """All three conditions, each judged alone, plus the pair that is a hazard."""
    c1, c2, c3 = condition_1(players), condition_2(players), condition_3(engine_src)
    conditions = {"1": c1, "2": c2, "3": c3}

    # THE PAIR. Condition 2 satisfied while 3 is not does not half-fix the tie
    # block; it inverts it. Reported as its own flag so "2 of 3 green" can never
    # read as progress.
    hazard = (c2["status"] == "pass" and c3["status"] == "fail")
    hazard_why = (
        "CONDITION 2 HOLDS AND CONDITION 3 DOES NOT. Derived values are now null, and "
        "the engine still reads `p.vorp || 0` — so `null || 0` is 0, which is ABOVE "
        "the -172.67 the unprojected players carried. This does not partially fix the "
        "tie block, it PROMOTES all of them above every real negative-VORP player. "
        "Ship 2 and 3 together or neither." if hazard else "")

    return {
        "version": "september-conditions/v1",
        "conditions": conditions,
        "ok": all(c["status"] == "pass" for c in conditions.values()),
        "uncounted": [k for k, c in conditions.items() if c["status"] == "uncounted"],
        "hazard": hazard, "hazard_why": hazard_why,
        "note": "Each condition is judged ALONE, per Cory's requirement that a check "
                "must be able to fail on each one separately. `ok` is True only when "
                "all three PASS — an uncounted condition is never a pass.",
    }
