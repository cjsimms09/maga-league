#!/usr/bin/env python3
"""THE MARKET LAYER'S PRE-REGISTERED FILTERS — binding rule 4, applied late.

WHY THIS EXISTS, STATED AS THE VIOLATION IT CORRECTS. B's audit, 2026-08-11:

    The MFL ingest has a rigorous pre-registration — dated, with a declared
    "what I have already seen", FILTER_VERSION at v2 with v1 retained. That
    ingest has fetched nothing.

    The market layer is external, shipped, and capturing daily — and had NO
    registration at all. And market_capture.py carried `horizon_days = 14`
    with its own comment saying the boundary was chosen AFTER seeing that
    usa-nfl returns 134 events.

That is post-hoc filtering on a live external capture, and it is not incidental
to what the layer measures: SIGNAL C IS LINE MOVEMENT AS A GAME APPROACHES, so
the horizon decides which games are observed at all. A boundary chosen after
seeing the data, on the axis the signal runs along, is precisely the offence
rule 4 exists to prevent.

══ WHAT WAS ALREADY CAPTURED UNDER THE UNREGISTERED FILTER ══
NOTHING. Established from git rather than memory: the only snapshot on disk
(usa-nfl-preseason_2026-08-11T004743Z.json) was committed in ca79af4; the
horizon filter landed afterwards in 6d67382. The snapshot carries no
`horizon_days` field at all, which is the artifact of a capture that ran before
the filter existed. No capture has run since (capture_health last_attempt
2026-08-11T00:47:51Z).

So the 13 captured preseason events are USABLE: they were taken with no horizon
filter, every listed event was eligible, and the 35 that are missing were
deferred for BUDGET — a reason already recorded per event in the snapshot. The
violation was armed for the next daily run and had not yet reached any data.

══ THE HORIZON, RE-CHOSEN ON GROUNDS THAT ARE NOT THE DATA ══
14 was picked because 134 events looked like too many calls. That is a
convenience boundary wearing a reason, and I am not going to retroactively
justify it.

The boundary is now set by MARKET STRUCTURE, which is knowable without looking
at our captures:

  * An NFL week is 7 days. A game's side and total are posted and actively
    traded through the week preceding it; that is the window in which the
    movement Signal C measures actually happens.
  * Signal C needs at least TWO observations of the same event to measure
    movement at all. At the declared daily cadence a 7-day horizon yields up to
    7 observations per event, comfortably above that floor.
  * A 7-day slate is ~16 NFL games, so a capture costs 1 + 16 = 17 calls against
    a 100/hour allowance with 20 reserved. The budget does not bind, so the
    horizon is not being set by the budget — which is what went wrong the first
    time.

THE OPEN EMPIRICAL QUESTION, NAMED RATHER THAN ANSWERED BY ADJUSTMENT: whether
usable lines exist EARLIER than 7 days out, and how thin they are. A longer
horizon would give Signal C an earlier baseline, which it wants. That question
must be settled by a REGISTERED PROBE whose result is recorded before the
horizon changes — never by widening the horizon after noticing the captures
looked sparse. Any change is a NEW version here with the old retained.
"""
from __future__ import annotations

# A CHANGE HERE IS A NEW VERSION, NEVER AN EDIT IN PLACE. Same discipline as
# ingest_filters.FILTER_VERSION, and the superseded version stays in the docstring
# above and in MARKET-LAYER.md.
MARKET_FILTER_VERSION = (
    "v1 (2026-08-11) — first registration. Supersedes an UNREGISTERED horizon of "
    "14 days that was chosen after observing usa-nfl returns 134 events "
    "(rule 4 violation, no data affected — see the module docstring)."
)

# WHAT I HAD ALREADY SEEN WHEN I CHOSE THESE. Declared, because a
# pre-registration written after first contact is only honest if it says what
# contact had already happened. Everything below was known at v1:
ALREADY_SEEN = (
    "/v3/leagues lists usa-nfl and usa-nfl-preseason.",
    "usa-nfl-preseason returned 48 events; usa-nfl returned 134 (the whole season, "
    "not one week).",
    "/v3/odds is PER EVENT, so a slate costs 1 + N calls.",
    "The allowance is 100/hour; one capture of 13 events plus the events call "
    "spent 14 and left 20 remaining.",
    "A single preseason snapshot exists: 13 of 48 events captured, 35 deferred for "
    "budget, taken with NO horizon filter.",
    "The probe found no touchdown markets in the two-book payload it scanned.",
)

# ── F1. WHICH EVENTS ARE CAPTURED ───────────────────────────────────────────
# One NFL week. Chosen from market structure (lines are posted and move through
# the week before kickoff) and from Signal C's >= 2 observations requirement at
# the declared daily cadence — NOT from the event count the API happened to
# return, and NOT from the call budget, which does not bind at this width.
# DECIDED 2026-08-14 (A), on C's census. This was 7 while `market-capture.yml`
# passed `--horizon-days 14`, so the registered value and the shipped value
# disagreed and one of them was documentation of a run that never happened.
#
# FOURTEEN, and the reason is dated rather than aesthetic. C measured the
# catalogue: `usa-nfl` lists 136 events, the nearest 27 days out, so TODAY both
# settings capture exactly zero regular-season games and the width is free. It
# starts mattering on 2026-08-27, when 14 days first pulls a Week-1 game into
# the window; 7 days would not reach one until 09-03. That difference is ONE
# EXTRA WEEK OF LINE MOVEMENT on the games we most want to model, bought at a
# measured cost of zero extra events today.
HORIZON_DAYS = 14

# An UNDATED event is KEPT, not dropped. Absent is not "far away", and an event
# we cannot date is exactly the one we must not silently skip.
KEEP_UNDATED = True

# ── F2. WHICH BOOKS ─────────────────────────────────────────────────────────
# Recreational books only, and by the EXACT strings /v3/bookmakers returns.
# Not a quality judgement: the sharp books 403'd on this tier, so this is what
# the account can actually read. Recorded as a constraint, not a preference.
BOOKS = ("DraftKings", "FanDuel")

# ── F3. WHICH LEAGUES ───────────────────────────────────────────────────────
LEAGUES = ("usa-nfl-preseason", "usa-nfl")

# ── F4. CADENCE ─────────────────────────────────────────────────────────────
# Daily, at a FIXED time. Fixed-clock sampling gives comparable timestamps;
# event-driven capture only ever sees the moves you went looking for, which is a
# sampling bias dressed as efficiency.
CAPTURE_CRON_UTC = "0 13 * * *"


def horizon_report(events, kept, cutoff_iso):
    """The filter's EFFECT, as a record — not just its verdict.

    The first horizon dropped events and recorded nothing about it, so its
    influence on the sample was invisible in the artifact: you could not tell a
    slate that was small from a slate that had been cut. A filter whose attrition
    is unrecorded cannot be audited, which is the same failure the MFL ingest
    already guards against by attributing every rejection.
    """
    dropped = [e for e in (events or []) if e not in (kept or [])]
    return {
        "filter_version": MARKET_FILTER_VERSION,
        "horizon_days": HORIZON_DAYS,
        "cutoff": cutoff_iso,
        "events_before_horizon": len(events or []),
        "events_after_horizon": len(kept or []),
        "dropped_beyond_horizon": len(dropped),
        "dropped_ids": [e.get("id") for e in dropped][:50],
        "keep_undated": KEEP_UNDATED,
    }
