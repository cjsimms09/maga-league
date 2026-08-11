"""THE REPLAY, ON A REAL LEAGUE — the step that turns a pile of drafts into evidence.

`external_replay.py` holds the contamination store and the forecast contract. This
walks an actual matched league: pick by pick, in draft order, handing the policy a
DECISION CONTEXT that contains only what a manager in that seat could have known at
that moment, and emitting forecasts stamped with that pick's own decision time.

WHY A REPLAY IS THE EASIEST PLACE IN THIS PROJECT TO CHEAT. Every leak here
produces a better-looking number and no error:

  * the available-player set including someone taken LATER — the model avoids a
    player the room is about to take, and looks prescient;
  * the CURRENT board instead of the frozen one — priced with information that did
    not exist on draft day;
  * the actual pick reaching the policy — which is not a backtest at all;
  * a team's roster including its own later picks — the need model solves a roster
    it has not built yet.

None of those raise. Each one raises the score. So the guards here are written
against the mutation, not against the intended behaviour: every rule below was
BROKEN FIRST and observed red before the assertion protecting it was trusted.

WHAT THIS DOES NOT DO. It does not implement the policy. `policy` is a callable
supplied by the caller — the shipped engine lives in A's lane, in JS — and the
harness's job is to hand it a clean context and stamp what comes back. Keeping
that seam explicit is also what makes the contamination rules testable, since a
fake policy can assert on exactly what it was given.
"""
from __future__ import annotations

from datetime import datetime, timezone

from external_replay import ExternalAsOfStore, emit_forecast, policy_fingerprint


class ReplayRefused(RuntimeError):
    """The league was not admitted, so it is not replayed."""


def _as_iso_day(unix_ts):
    """A pick's unix stamp -> the day it was made. None stays None.

    ABSENT IS NOT THE DRAFT DATE. An undated pick has unknown staleness, and
    dating it from the league would manufacture an observation from an absence
    and drag every spread toward the first pick.
    """
    if unix_ts in (None, "", 0):
        return None
    try:
        return datetime.fromtimestamp(int(unix_ts), tz=timezone.utc).date().isoformat()
    except (TypeError, ValueError, OSError):
        return None


def _next_turn_for(picks: list, overall, team):
    """This seat's next pick after `overall`, from the SEAT SEQUENCE only.

    None at the end of the draft, which is the honest answer and is what makes a
    survival forecast there unresolvable rather than wrong.
    """
    later = [p.get("overall") for p in picks
             if p.get("team") == team and (p.get("overall") or 0) > (overall or 0)]
    return min(later) if later else None


def decision_contexts(record: dict, board: list) -> list:
    """One ENVELOPE per pick: {"context": ..., "actual_player_id": ...}.

    THE STRICTLY-BEFORE RULE IS THE WHOLE FUNCTION. `taken` accumulates AFTER the
    context for a pick is built, so pick N sees picks 1..N-1 and never itself —
    an off-by-one here is the difference between a replay and a peek, and it
    would show up as a better number rather than as a failure.

    THE ANSWER LIVES IN THE ENVELOPE, NEVER IN THE CONTEXT, and that is structural
    rather than procedural. The first cut popped `actual_player_id` off the
    context before calling the policy and put it back afterwards, which is a leak
    with a delay: the policy holds a reference to that dict, so any policy that
    kept its context would find the answer sitting in it a moment later. Written
    break-first and the test caught it — a policy that stores what it is given is
    an ordinary thing to write, and nothing would have raised.
    """
    picks = sorted((record.get("draft") or {}).get("picks") or [],
                   key=lambda p: p.get("overall") or 0)
    by_id = {str(r.get("player_id")): r for r in (board or []) if r.get("player_id") is not None}
    taken: set = set()
    roster: dict = {}
    out = []
    for p in picks:
        pid = str(p.get("player_id")) if p.get("player_id") is not None else None
        team = p.get("team")
        ctx = {
            "overall": p.get("overall"),
            "round": p.get("round"),
            "team": team,
            "decided_at": _as_iso_day(p.get("timestamp")),
            # The frozen pre-draft board, minus everyone already gone. Built from
            # `taken` BEFORE this pick is added to it.
            "available": [by_id[i] for i in by_id if i not in taken],
            # This seat's roster AS IT STOOD, not as it finished.
            "roster": list(roster.get(team) or []),
            "picks_made": len(taken),
            # THE SEAT ORDER IS PUBLIC BEFORE THE DRAFT; THE SELECTIONS ARE NOT.
            # Knowing WHEN this seat picks again is something every manager in the
            # room knows at the moment of the pick — it comes from the draft order,
            # which MFL publishes as `round1DraftOrder` and which snake determines
            # thereafter. Knowing WHAT anyone picks in between is the future, and
            # is not here. Derived from the pick list's TEAM sequence rather than
            # recomputed from the snake rule, because a keeper league genuinely
            # skips seats that forfeited a pick and the observed sequence is the
            # accurate one.
            "next_turn_overall": _next_turn_for(picks, p.get("overall"), team),
            "picks_until_next_turn": (
                (_next_turn_for(picks, p.get("overall"), team) or 0) - (p.get("overall") or 0)
                if _next_turn_for(picks, p.get("overall"), team) else None),
        }
        out.append({"context": ctx, "actual_player_id": pid})
        if pid is not None:
            taken.add(pid)
            roster.setdefault(team, []).append(pid)
    return out


def replay_league(record: dict, snapshots: list, policy, *, screen=None) -> dict:
    """Replay one matched league. Returns {observations, summary}.

    REFUSES A LEAGUE THE FILTERS REJECTED. A replay of an excluded league produces
    observations that look exactly like admitted ones and would enter an aggregate
    unnoticed — the pre-registration's whole purpose defeated one function past
    the screen. `screen` defaults to the real filter rather than to permissive.
    """
    if screen is None:
        from ingest_filters import screen as screen
    ok, why = screen(record)
    if not ok:
        raise ReplayRefused(
            "league %s was excluded as %s — an excluded league is not replayed, because "
            "its observations would be indistinguishable from admitted ones"
            % (record.get("league_id"), why))

    fp = policy_fingerprint()
    store = ExternalAsOfStore(record.get("league_id"), record.get("draft_at"), snapshots, fp)
    board = store.board()
    contexts = decision_contexts(record, board)

    observations = []
    for env in contexts:
        ctx, actual = env["context"], env["actual_player_id"]
        for f in (policy(ctx) or []):
            obs = emit_forecast(store, f["key"], f["ftype"], f["value"],
                                f["resolution_rule"], extra=f.get("extra"),
                                decided_at=ctx["decided_at"])
            obs["overall"] = ctx["overall"]
            obs["actual_player_id"] = actual        # for the grader, after the fact
            observations.append(obs)

    dated = [e["context"]["decided_at"] for e in contexts]
    spread = store.lead_days_spread(dated)
    return {
        "league_id": record.get("league_id"),
        "observations": observations,
        # RULE 11 AT THE BOUNDARY, TRAVELLING WITH THE THING IT DESCRIBES. A
        # replay whose coverage lives in a log nobody opens is a replay nobody
        # can judge — and every one of these is already computed upstream.
        "summary": {
            "picks": len(contexts),
            "forecasts": len(observations),
            "board_size": len(board),
            "board_asof": store.snapshot_date().isoformat(),
            "policy_fingerprint": fp,
            "lead_days_spread": spread,
            "draft_span_days": _draft_span(contexts),
            "undated_picks": sum(1 for d in dated if d is None),
            "source_meta": record.get("source_meta"),
        },
    }


def _draft_span(contexts: list):
    """How many days this draft ran. None when it cannot be dated at all.

    The number that says whether multi-day drafts are a tail case or the norm —
    and it is free, because the timestamps are already parsed.
    """
    days = sorted(e["context"]["decided_at"] for e in contexts if e["context"]["decided_at"])
    if not days:
        return None
    from datetime import date
    return (date.fromisoformat(days[-1]) - date.fromisoformat(days[0])).days
