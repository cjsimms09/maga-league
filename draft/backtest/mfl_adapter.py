#!/usr/bin/env python3
"""MFL EXPORTS -> the shape `ingest_filters.screen()` reads.

Written against the COMMITTED SCHEMA PROBE (mfl_schema_probe.json, runs 1-4), not
against an imagined API. Every non-obvious decision below traces to something the
probe actually observed; the four that would each have produced a confidently-wrong
parser are recorded as P1-P4 in INGEST-PLAN.md.

RULE 11 IS THE SHAPE OF THIS FILE. Every conversion here is a boundary — MFL's
export to our canonical league record — so each one reports what it knows:

  COMPLETENESS  how many records matched or converted (`coverage`)
  VALIDITY      whether the values present are usable (`invalid`)
  APPLICABILITY whether this is the right data for this use (`unusable_reason`)

and ABSENT IS NEVER ZERO. A missing scoring rule is not 0 points per reception; a
missing draft type is not "snake"; an unparseable starter limit is not 1 starter.
Each returns None with a counted reason, because a coerced value is
indistinguishable from a measured one and would silently pass the filters.
"""
from __future__ import annotations

import json

# ── MFL's scalar wrapper ────────────────────────────────────────────────────
def t(v) -> str:
    """Unwrap {"$t": value}. MFL wraps EVERY scalar this way.

    A caller that forgets gets a dict where it expected a string, and it
    stringifies silently rather than raising — that is exactly how the first cut
    of the event-code map came back keyed on "{'$t': 'CC'}" and unusable.
    """
    if isinstance(v, dict):
        v = v.get("$t")
    return "" if v is None else str(v)


def listify(node) -> list:
    """MFL returns a bare dict for one element and a list for many.

    Observed on players, on leagueSearch, and on `positionRules[].rule` (the probe
    records it as types ['array', 'object'] on the same path across leagues).
    `mfl_adp._players_index` already carries the same special case. Anything that
    iterates an MFL collection without this silently processes a single record's
    KEYS instead of the record.
    """
    if node is None:
        return []
    if isinstance(node, dict):
        return [node]
    return list(node)


# ── P1: draft type is a CODE, never the word "snake" ────────────────────────
# Observed: "SFIRSTRANDOM". F1 compares against ("snake",), so a direct comparison
# rejects every league and reports it as F1.draft_type — which reads exactly like
# "no public league matches our format". The codes MFL uses:
#   S…      snake (SFIRST* = round 1 order chosen randomly / by standings)
#   L…      linear (same order every round)
#   3RR     third-round reversal
DRAFT_TYPE_CODES = {
    "SFIRSTRANDOM": "snake", "SFIRSTSTANDINGS": "snake", "SNAKE": "snake", "S": "snake",
    "LINEAR": "linear", "L": "linear",
    "3RR": "third_round_reversal", "TRR": "third_round_reversal",
}


def draft_type(code) -> tuple:
    """(normalised_type | None, reason). An UNRECOGNISED code is not 'snake'.

    Returning None is the point: an unknown code must be counted as its own
    attrition reason, never folded into "not a snake draft", or the report says we
    checked something we did not.
    """
    raw = t(code).strip().upper()
    if not raw:
        return None, "draft_type_absent"
    if raw in DRAFT_TYPE_CODES:
        return DRAFT_TYPE_CODES[raw], "ok"
    for prefix, kind in (("SFIRST", "snake"), ("SNAKE", "snake"), ("LINEAR", "linear")):
        if raw.startswith(prefix):
            return kind, "ok"
    return None, f"draft_type_unrecognised:{raw}"


# ── P2: starter limits are RANGE STRINGS, and superflex has no slot name ────
def starter_slots(league: dict) -> tuple:
    """MFL starters -> ({POS: count}, superflex_bool, invalid[]).

    Observed: `starters.position[].limit` is "1-2" or "1" — a RANGE, not an int.
    F1 does `int(slots.get("QB"))`, which RAISES on "1-2", and separately looks for
    a SUPER_FLEX key that MFL DOES NOT HAVE: superflex is expressed AS a QB limit
    whose maximum exceeds its minimum. So F1's superflex exclusion could never
    fire, and superflex is the one thing F1 says would "swamp every positional
    finding."

    The MINIMUM is taken as the required count (that is what "must start" means)
    and a max above the min at QB is what marks superflex.
    """
    slots, invalid = {}, []
    superflex = False
    for pos in listify(((league or {}).get("starters") or {}).get("position")):
        name = t(pos.get("name")).strip().upper()
        lim = t(pos.get("limit")).strip()
        if not name or not lim:
            invalid.append({"position": name or "(unnamed)", "limit": lim, "why": "missing"})
            continue
        try:
            lo, hi = (lim.split("-", 1) + [lim])[:2] if "-" in lim else (lim, lim)
            lo_i, hi_i = int(lo), int(hi)
        except ValueError:
            # ABSENT IS NOT ZERO: an unparseable limit is not "no starters here".
            invalid.append({"position": name, "limit": lim, "why": "unparseable"})
            continue
        slots[name] = lo_i
        if name == "QB" and hi_i > lo_i:
            superflex = True
    return slots, superflex, invalid


# ── P3/P4: scoring is PER-POSITION, and often absent entirely ───────────────
# CC = "This is the number of receptions in a game." Taken from MFL's own
# TYPE=allRules dictionary (probe run 4, 153 codes), not inferred from the letters.
RECEPTION_EVENT = "CC"
SKILL_POSITIONS = ("RB", "WR", "TE")


def _points_per_event(expr: str):
    """MFL points expressions: "*1", "*0.5", "=3". Returns a float or None.

    None, not 0.0 — a rule we cannot read is not a rule worth zero points, and
    coercing it would let a league pass the PPR band by looking like 0.
    """
    e = (expr or "").strip()
    if not e:
        return None
    if e[0] in "*=":
        e = e[1:]
    try:
        return float(e)
    except ValueError:
        return None


def reception_points_by_position(rules_json) -> tuple:
    """({POS: points_per_reception}, reason).

    P3: TYPE=league carries NO scoring at all; it lives here. And this export
    returns {"error": "Error - No League Scoring Rules"} for part of the sample, so
    `$.rules` is not always present — a league whose scoring cannot be retrieved is
    its own exclusion reason, never folded into "did not match half-PPR".

    P4: scoring is PER-POSITION, so "half-PPR" is not one number. A league can be
    0.5/reception for WR and 1.0 for TE — TE premium, which our league is not, and
    which F1 v1 would have admitted by reading a scalar that does not exist.
    """
    d = json.loads(rules_json) if isinstance(rules_json, str) else (rules_json or {})
    if d.get("error"):
        return {}, "no_scoring_rules"
    node = (d.get("rules") or {}).get("positionRules")
    if node is None:
        return {}, "no_scoring_rules"

    out: dict = {}
    for pr in listify(node):
        # `positions` is a delimited list ("QB|RB", "TE", "Def"), case-inconsistent.
        names = [p.strip().upper() for p in t(pr.get("positions")).replace(",", "|").split("|") if p.strip()]
        for rule in listify(pr.get("rule")):
            if t(rule.get("event")).strip().upper() != RECEPTION_EVENT:
                continue
            pts = _points_per_event(t(rule.get("points")))
            if pts is None:
                continue
            for n in names:
                # Keep the LARGEST reception value seen for a position. MFL can
                # express scoring in banded ranges; taking the max is the
                # conservative read for a filter that excludes TE premium.
                out[n] = max(out.get(n, pts), pts)
    return out, ("ok" if out else "no_reception_rule")


def ppr_verdict(by_pos: dict, band=(0.4, 0.6)) -> tuple:
    """F1 v2: EVERY skill position independently inside the band.

    Returns (ok, reason). A position with no reception rule is NOT treated as 0 —
    that is the absent-is-not-zero requirement, and a 0 would read as "not PPR"
    when the truth is "we could not tell."
    """
    missing = [p for p in SKILL_POSITIONS if p not in by_pos]
    if missing:
        return False, "F4.no_scoring_rules:" + ",".join(missing)
    outside = [p for p in SKILL_POSITIONS if not (band[0] <= by_pos[p] <= band[1])]
    if outside:
        return False, "F1.te_premium_or_split_ppr:" + ",".join(
            f"{p}={by_pos[p]}" for p in outside)
    return True, "ok"


# ── the draft ───────────────────────────────────────────────────────────────
def draft_picks(draft_json) -> tuple:
    """(picks, meta). Picks as {overall, round, team, player, timestamp}.

    Observed fields: franchise, pick, round, player, timestamp, comments — all
    always present. `timestamp` is a per-pick unix epoch, which gives F5 a real
    draft time rather than a league-level guess.

    TWO THINGS ARE NOT AVAILABLE AND ARE REPORTED AS SUCH, not silently passed:
      * COMPLETENESS — draftResults carries no `status`. F2 wants
        status == "complete", so it is INFERRED (picks == franchises x rounds) and
        the inference is stated in meta.
      * AUTOPICK — there is no autopick flag anywhere in this export, only a free
        text `comments`. F2's autopick clause ("an abandoned team is not an
        opponent; it is noise wearing a seat") is therefore UNENFORCEABLE, and
        meta says so rather than every league quietly passing it.
    """
    d = json.loads(draft_json) if isinstance(draft_json, str) else (draft_json or {})
    unit = (d.get("draftResults") or {}).get("draftUnit") or {}
    rows, invalid = [], []
    for i, p in enumerate(listify(unit.get("draftPick"))):
        rnd, pick = t(p.get("round")).strip(), t(p.get("pick")).strip()
        player, team = t(p.get("player")).strip(), t(p.get("franchise")).strip()
        ts = t(p.get("timestamp")).strip()
        if not player or not team or not rnd:
            invalid.append({"index": i, "why": "missing player/franchise/round"})
            continue
        try:
            rows.append({
                "overall": i + 1, "round": int(rnd), "pick_in_round": int(pick or 0),
                "team": team, "player": player,
                # ABSENT IS NOT ZERO: no timestamp is None, not epoch 0 (1970),
                # which would silently satisfy "strictly before the draft".
                "timestamp": int(ts) if ts.isdigit() else None,
            })
        except ValueError:
            invalid.append({"index": i, "why": f"unparseable round/pick {rnd!r}/{pick!r}"})

    stamps = [r["timestamp"] for r in rows if r["timestamp"]]
    meta = {
        "picks": len(rows),
        "invalid": invalid,
        "coverage": (len(rows) / (len(rows) + len(invalid))) if (rows or invalid) else 0.0,
        "draft_type_raw": t(unit.get("draftType")),
        "round1_order": [s for s in t(unit.get("round1DraftOrder")).split(",") if s],
        "first_pick_at": min(stamps) if stamps else None,
        "last_pick_at": max(stamps) if stamps else None,
        "timestamp_coverage": (len(stamps) / len(rows)) if rows else 0.0,
        # Stated, not assumed — see the docstring.
        "completeness_source": "inferred (no status field in draftResults)",
        "autopick_enforceable": False,
        "autopick_note": "F2 autopick clause UNENFORCED — no autopick flag in this export",
    }
    return rows, meta


def draft_is_complete(meta: dict, franchises: int, rounds: int) -> tuple:
    """F2 completeness, INFERRED. Returns (ok, reason) and never guesses silently."""
    if not franchises or not rounds:
        return False, "F2.shape_unknown"
    expected = franchises * rounds
    got = meta.get("picks") or 0
    if got == expected:
        return True, "ok"
    return False, f"F2.draft_incomplete:{got}/{expected}"
