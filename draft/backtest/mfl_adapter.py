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
import sys
from datetime import datetime, timezone
from pathlib import Path

# `draft/adp.py` holds the authoritative matcher and lives one directory UP from
# this one. Put it on the path HERE rather than relying on every caller to do it:
# the crosswalk imported it lazily and worked only when the caller happened to
# have arranged the path, which is a dependency that fails at the worst moment
# (in CI, in a fresh process) rather than at import.
_DRAFT = Path(__file__).resolve().parent.parent
if str(_DRAFT) not in sys.path:
    sys.path.insert(0, str(_DRAFT))

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


# `ppr_verdict` LIVED HERE AND IS GONE (2026-08-11). It made F1's reception-value
# decision a second time and gave a different answer — a uniform full-PPR league
# came back `F1.te_premium_or_split_ppr`, which is false — and it had no caller
# outside its own test, so the two could disagree indefinitely without anything
# going red. The decision now has exactly one implementation,
# `ingest_filters.ppr_reason`, which `screen()` calls.


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


def infer_rounds(rows: list, franchises: int) -> tuple:
    """(rounds, detail) — "all rounds present" when nothing states the round count.

    `detail` is 'ok' or a bare human detail. It is deliberately NOT a reason code:
    `ingest_filters.screen()` owns the vocabulary, and a code minted here as well
    would be the same string produced in two places — the disease the crosswalk
    and the policy fingerprint both exist to avoid.

    F2 wants "the draft is complete (status complete, all rounds present)" and MFL
    supplies neither half. There is no round-count field anywhere in the probe, and
    the league export's only candidate is `rosterSize` — the WHOLE roster including
    the bench, which for a keeper or dynasty league is far more than the number of
    rounds actually drafted. Using it would reject completed keeper drafts as
    "F2.draft_incomplete", which is exactly the lie this seam exists to stop.

    So the round count is TAKEN FROM THE DATA and what gets checked is the property
    that is genuinely observable: every round we received is FULL (`franchises`
    picks), and the rounds run 1..N with no gaps.

    THE LIMIT OF THIS INFERENCE, STATED RATHER THAN PAPERED OVER: a draft abandoned
    exactly ON a round boundary is indistinguishable from a shorter completed one.
    A draft abandoned mid-round — much the commoner shape, and the one an eight-hour
    email draft dies in — leaves a short final round and IS caught. If a round-count
    source is ever found, pass it to `to_league_record(rounds=...)` and this is not
    used.
    """
    if not franchises:
        return None, "league size unknown, so no round could be checked"
    if not rows:
        return None, "no picks received"
    counts: dict = {}
    for r in rows:
        counts[r["round"]] = counts.get(r["round"], 0) + 1
    rounds = max(counts)
    if sorted(counts) != list(range(1, rounds + 1)):
        missing = [n for n in range(1, rounds + 1) if n not in counts]
        return None, "rounds missing %s" % (",".join(map(str, missing)),)
    short = [(n, counts[n]) for n in sorted(counts) if counts[n] != franchises]
    if short:
        n, got = short[0]
        return None, "round %d has %d of %d picks" % (n, got, franchises)
    return rounds, "ok"


# ── the crosswalk, at scale ─────────────────────────────────────────────────
def crosswalk_picks(picks: list, mfl_players, sleeper_index) -> tuple:
    """MFL draft picks -> our board's sleeper ids. (rows, report).

    NO NEW MATCHING LOGIC. `draft/adp.py:match_player` is the authoritative
    matcher and already returns HOW it matched, so a later mismatch is traceable
    to a method rather than just to "it matched". Writing a second matcher here
    would be the multi-derivation failure rule 11 exists for — and a crosswalk is
    precisely where it would hide, because a wrong-but-plausible match produces a
    real player and never errors.

    Two hops, and each is reported separately because they fail for different
    reasons and F4 requires exclusions counted BY REASON:
      1. MFL player id -> {name, position, team}, via MFL's own players export.
         A pick whose id is absent from that export is `unknown_mfl_id`.
      2. that record -> a sleeper id, via match_player. A miss here is
         `no_sleeper_match` — the player exists in MFL and not on our board.

    Conflating the two would report "our board is missing players" when the truth
    is "MFL gave us an id we never fetched".
    """
    from collections import Counter

    rows, unknown_id, unmatched, conflicts = [], [], [], []
    methods = Counter()
    board = _board_by_id(sleeper_index)
    for p in picks:
        meta = (mfl_players or {}).get(str(p.get("player")))
        if not meta:
            unknown_id.append(p.get("player"))
            continue
        sid, how = match_player_shared(meta, sleeper_index)
        if not sid:
            unmatched.append({"mfl_id": p.get("player"), "name": meta.get("name"),
                              "pos": meta.get("position"), "team": meta.get("team")})
            continue
        methods[how or "unknown"] += 1
        # BOTH SIDES OF THE MATCH, RETAINED. A bare rate cannot be audited: 447 of
        # 702 says nothing about whether any of the 447 is the right player, and a
        # wrong-but-plausible match produces a real player and never errors. The
        # pair is what a human can check, so the pair is what gets kept.
        theirs = board.get(str(sid)) or {}
        pair = {"mfl_id": str(p.get("player")), "mfl_name": meta.get("name"),
                "mfl_pos": meta.get("position"), "mfl_team": meta.get("team"),
                "sleeper_id": str(sid), "board_name": theirs.get("name"),
                "board_pos": theirs.get("pos"), "board_team": theirs.get("team"),
                "method": how}
        # CROSS-SOURCE DISAGREEMENT ON A MATCHED PAIR. The two sources agreeing on
        # a name while disagreeing on POSITION is the signature of the wrong
        # player, and it passes every completeness check ever written — the rate
        # goes UP when a bad match lands. Counted separately and never silently.
        if theirs:
            bad = [f for f, a, b in (("position", meta.get("position"), theirs.get("pos")),
                                     ("team", meta.get("team"), theirs.get("team")))
                   if a and b and str(a).upper() != str(b).upper()]
            if bad:
                conflicts.append(dict(pair, disagrees_on=bad))
        rows.append(dict(p, player_id=sid, matched_by=how,
                         name=meta.get("name"), position=meta.get("position")))

    n = len(picks or [])
    report = {
        "picks": n,
        "crosswalked": len(rows),
        # COMPLETENESS. F2's bar is >= 0.90; below that "the replay is guessing".
        "crosswalk_rate": (len(rows) / n) if n else 0.0,
        "unknown_mfl_id": len(unknown_id),
        "no_sleeper_match": len(unmatched),
        # VALIDITY / APPLICABILITY: how each match was made, so a systematic
        # wrong-match (e.g. everything landing via loose initials) is visible as a
        # distribution rather than discovered player by player.
        "methods": dict(methods),
        "unmatched_sample": unmatched[:10],
        # THE EVIDENCE BEHIND THE RATE. `matched_sample` is what makes 72% an
        # auditable claim instead of a number nobody can check; `conflicts` is
        # the part that must never be a sample — a matched pair whose sources
        # disagree is counted in full.
        "matched_sample": _sample_pairs(rows, board, mfl_players),
        "conflicts": len(conflicts),
        "conflict_rows": conflicts,
        "board_side_resolved": sum(1 for r in rows if board.get(str(r["player_id"]))),
    }
    return rows, report


def _board_by_id(index) -> dict:
    """{sleeper_id: record} derived from THE SAME index the matcher searched.

    Not a second lookup into the board. A separate read could disagree with what
    matching actually saw, and then the "both sides" evidence would be reporting
    a pair that never existed — a second derivation path for the one quantity
    this report exists to make checkable.
    """
    out = {}
    for bucket in ("by_name", "by_initials"):
        for recs in ((index or {}).get(bucket) or {}).values():
            for rec in recs:
                out.setdefault(str(rec.get("id")), rec)
    return out


def _sample_pairs(rows, board, mfl_players, n=10):
    """A spread of matched pairs, both sides, for hand-checking.

    Spread across the DRAFT ORDER rather than the first n: the first ten picks
    are the ten most famous players in football and will match under any
    implementation, so a sample of them proves nothing. The late rounds are
    where a matcher fails.
    """
    if not rows:
        return []
    step = max(1, len(rows) // n)
    out = []
    for r in rows[::step][:n]:
        meta = (mfl_players or {}).get(str(r.get("player"))) or {}
        theirs = board.get(str(r.get("player_id"))) or {}
        out.append({"overall": r.get("overall"), "mfl_id": str(r.get("player")),
                    "mfl_name": meta.get("name"), "mfl_pos": meta.get("position"),
                    "mfl_team": meta.get("team"), "sleeper_id": str(r.get("player_id")),
                    "board_name": theirs.get("name"), "board_pos": theirs.get("pos"),
                    "board_team": theirs.get("team"), "method": r.get("matched_by")})
    return out


def match_player_shared(meta: dict, sleeper_index):
    """Thin seam onto draft/adp.py's matcher, so tests can inject a fake index."""
    from adp import match_player
    return match_player({"name": meta.get("name"), "position": meta.get("position"),
                         "team": meta.get("team")}, sleeper_index)


def crosswalk_verdict(report: dict, minimum: float = 0.90) -> tuple:
    """F2's crosswalk bar. Returns (ok, reason), inclusive at the bar."""
    rate = report.get("crosswalk_rate") or 0.0
    if rate >= minimum:
        return True, "ok"
    return False, f"F2.crosswalk_below_90pct:{rate:.3f}"


# ── THE SEAM: MFL's exports -> the one record `screen()` reads ──────────────
def to_league_record(league_json, rules_json, draft_json, *,
                     league_id=None, rounds=None, pre_draft_adp=None,
                     adp_observed_at=None, has_weekly_outcomes=None,
                     crosswalk=None) -> dict:
    """The three MFL exports, converted ONCE, into `ingest_filters.screen()`'s shape.

    THIS FUNCTION IS THE POINT. Everything above computes a precise reason for
    every way a field can fail to parse — `draft_type()` returns
    `draft_type_unrecognised:SFIRSTFOO` rather than pretending it saw a non-snake
    draft, `starter_slots()` accumulates per-position `invalid[]`, `draft_picks()`
    counts malformed rows — and until this existed, every one of those reasons was
    COMPUTED, WRITTEN DOWN, AND READ BY NOTHING. `screen()` received a bare string
    and a bare dict and reported `F1.draft_type` / `F1.qb_slots`, so the adapter's
    care evaporated at the one boundary where it mattered. (Rule 14: name the
    caller. This module's only caller was its own test.)

    Every unparseable field arrives as None PLUS its reason in `unreadable`, so
    the reason survives into `screen_all()`'s attrition table verbatim.

    WHAT MFL DOES NOT SUPPLY IS TAKEN AS AN ARGUMENT, NEVER INVENTED:
      `pre_draft_adp` / `adp_observed_at` come from the ADP snapshot store,
      `has_weekly_outcomes` from the outcomes ingest, and `crosswalk` is the
      `(rows, report)` pair `crosswalk_picks()` returns. Omit any of them and the
      league is rejected with a reason that says we lack that data — F4 —
      rather than one claiming the league failed a check.
    """
    lg = json.loads(league_json) if isinstance(league_json, str) else (league_json or {})
    node = lg.get("league") or {}
    unreadable: dict = {}

    # ── teams. Observed as a string ("14", "12", "8") under franchises.count.
    raw_teams = t((node.get("franchises") or {}).get("count")).strip()
    teams = int(raw_teams) if raw_teams.isdigit() else None
    if teams is None:
        unreadable["teams"] = "no_team_count" if not raw_teams \
            else "unreadable_team_count:%s" % raw_teams

    # ── roster slots. P2: limits are RANGE STRINGS and superflex has no slot.
    # A PARTIAL parse is unreadable, not a small roster: dropping one unparseable
    # position silently shrinks the starting-skill count and manufactures an
    # `F1.starting_skill_slots` verdict out of a parse failure.
    slots, superflex, invalid = starter_slots(node)
    if invalid or not slots:
        unreadable["roster_slots"] = "no_roster_slots" if not slots else \
            "unreadable_starter_limits:" + ",".join(
                sorted({i["position"] for i in invalid}))
        slots = None

    # ── the draft, and P1's draft type (it lives in draftResults, not league).
    picks, dmeta = draft_picks(draft_json)
    kind, why = draft_type(dmeta.get("draft_type_raw"))
    if kind is None:
        unreadable["draft_type"] = why

    # ── completeness. INFERRED, and the basis travels with the verdict.
    rounds_supplied = rounds is not None
    rounds_why = "ok"
    if not rounds_supplied:
        rounds, rounds_why = infer_rounds(picks, teams or 0)
    if rounds is None:
        complete, complete_why = False, rounds_why
    else:
        complete, complete_why = draft_is_complete(dmeta, teams or 0, rounds)
    # `screen()` owns the reason CODE; only the DETAIL travels, so the same
    # string is never minted in two places.
    status_detail = None if complete else complete_why.split(":", 1)[-1]

    # ── F5's draft date, from the FIRST pick. Per-pick unix stamps are the one
    # thing the probe confirmed outright, and the first pick is the conservative
    # read: ADP must precede the moment the room started picking, not the moment
    # it finished. No stamp at all is None, never epoch 0 — 1970 would silently
    # satisfy "strictly before the draft".
    draft_at = None
    if dmeta.get("first_pick_at"):
        draft_at = datetime.fromtimestamp(
            dmeta["first_pick_at"], tz=timezone.utc).date().isoformat()

    # ── the crosswalk. NOT RUN is not NOT MATCHED: leaving the key off entirely
    # is what makes `screen()` say so instead of reporting a 0% match rate.
    if crosswalk is not None:
        rows_x = crosswalk[0] if isinstance(crosswalk, tuple) else crosswalk
        done = {r.get("overall") for r in (rows_x or [])}
        for p in picks:
            p["crosswalked"] = p["overall"] in done

    # P3/P4. `screen()` already reports F4.no_scoring_rules on an empty map; what
    # it cannot know without this is WHICH absence — an export that answered
    # "Error - No League Scoring Rules" or one that carried rules with no
    # reception line in them.
    by_pos, scoring_why = reception_points_by_position(rules_json)
    if not by_pos:
        unreadable["scoring"] = scoring_why

    return {
        "league_id": str(league_id or t(node.get("id")) or ""),
        "source": "mfl",
        "teams": teams,
        "scoring": {"rec_by_position": by_pos or None},
        "roster_slots": slots,
        "superflex": superflex,
        "draft_type": kind,
        "draft": {
            "status": "complete" if complete else "incomplete",
            "status_detail": status_detail,
            "picks": picks,
        },
        "draft_at": draft_at,
        "adp_observed_at": adp_observed_at,
        "pre_draft_adp": pre_draft_adp,
        "has_weekly_outcomes": has_weekly_outcomes,
        # F1 records keepers as a COVARIATE and never filters on them.
        "keeper_type": t(node.get("keeperType")) or None,
        "unreadable": unreadable,
        # Rule 11 coverage travels WITH the record, not in a log nobody reads.
        "source_meta": {
            "rounds": rounds,
            "rounds_source": "supplied by caller" if rounds_supplied else
            "INFERRED — every observed round full; no round-count field exists in "
            "any MFL export and rosterSize counts the bench",
            "pick_coverage": dmeta.get("coverage"),
            "timestamp_coverage": dmeta.get("timestamp_coverage"),
            "invalid_picks": dmeta.get("invalid"),
            "completeness_source": dmeta.get("completeness_source"),
            "autopick_enforceable": dmeta.get("autopick_enforceable"),
            "autopick_note": dmeta.get("autopick_note"),
            # A CLAUSE THAT CANNOT FIRE MUST SAY SO IN THE REPORT. `screen()`'s
            # autopick check runs `autopick / picks > 0.5` over picks that carry
            # no autopick flag, so it passes EVERY league — silently, which is
            # indistinguishable from every league genuinely having no abandoned
            # team. INGEST-PLAN pre-registered the requirement ("must be reported
            # as unenforced rather than quietly passing every league") and the
            # adapter has been recording it since it was written; until this it
            # reached no report. `screen_all` surfaces it.
            "unenforced": [] if dmeta.get("autopick_enforceable") else [
                "F2.autopick_majority — %s. Every league passes this clause; that "
                "is not evidence that none was abandoned." % dmeta.get("autopick_note")],
            "draft_type_raw": dmeta.get("draft_type_raw"),
            "round1_order": dmeta.get("round1_order"),
        },
    }


def board_index(board: dict):
    """Our board -> the sleeper index the crosswalk matches against.

    THE POOL MUST BE THE WHOLE POOL. `draft_data.json` splits the board: drafted
    keepers are REMOVED from `players` and live in `kept_players`. An index built
    from `players` alone is missing them — measured on the live artifact, all three
    of Cory's keepers (Chase, Henry, Walker) fail to match while Gibbs succeeds.

    That failure is doubly misleading. It reduces the crosswalk rate, which is F2's
    admission bar, and it books the miss as `no_sleeper_match` — "our board does
    not have this player" — when the truth is "we built the index from a partial
    pool". Same reason-conflation the crosswalk guards against, one level up, and
    the version that would have quietly failed leagues for our own bug.

    Any future array that also holds board players belongs in this union.
    """
    out = {}
    for key in ("players", "kept_players"):
        for p in (board or {}).get(key) or []:
            pid = p.get("player_id")
            if pid is None:
                continue
            out[str(pid)] = {"full_name": p.get("name"), "position": p.get("position"),
                             "team": p.get("team"), "search_rank": None}
    from adp import build_index
    return build_index(out)
