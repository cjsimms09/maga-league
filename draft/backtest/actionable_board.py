# TERRITORY: C
"""THE REGION OF THE BOARD THAT PRICES DECISIONS, CHECKED FIELD BY FIELD.

The pool is 1,841 rows and the draft is 150 picks deep. An error at rank 1,500
is untidy; the same error inside the relevant board changes what the tools
recommend. So these checks are scoped to the actionable region — everything the
market prices inside `provenance.adp.relevant_board`, plus the keepers, because a
keeper is off the board precisely because he is worth a pick.

WHAT IT FOUND, on the shipped 2026 board:

  * 35 actionable rows carry NO BYE WEEK while their own team's bye is known and
    unambiguous elsewhere on the board — 11 RB, 9 TE, 8 QB, 5 WR, 2 DEF, 1 K.
    Not a source gap: 32 teams show a bye, zero conflict. `bye_source` across the
    whole board is `ffc` (215) or absent (1,626) and **nothing is ever
    `team-derived`**, so the fallback that exists to close this has never once
    fired. Diagnosis in `bye_gap`.
  * one row where an ABSENT projection became a ZERO — Ricky Pearsall, market
    ADP 111.5, both projection sources null, `proj_mean` 0.0, model rank 823,
    VORP −173. Zero is a claim that he will not score; absent is a statement that
    we do not know. The board cannot tell them apart and the tools act on the
    number.

WHAT IT DELIBERATELY DOES NOT FLAG, because checking cost me two false alarms:

  * Frank Gore appearing twice. Two people — Sr. and Jr. — not a duplicate.
  * QBs the model ranks far below their ADP (Penix, Cousins, Tua). In a ten-team
    one-QB league replacement is high and most starters carry negative VORP.
    That is the valuation disagreeing with the market, which is its job.
"""
from __future__ import annotations

import collections

#: Positions this league can roster. Anything else on an actionable row is a
#: join error, not a player.
ROSTERED = ("QB", "RB", "WR", "TE", "K", "DEF")


def _num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def relevant_board(board: dict):
    """How deep the market-priced region goes, READ from the artifact.

    Returned as None when the board does not say, so a caller cannot silently
    substitute a default and audit a region the build never claimed.
    """
    return _num((((board or {}).get("provenance") or {}).get("adp") or {})
                .get("relevant_board"))


def actionable(board: dict) -> list:
    """Rows inside the market-priced region, plus the keepers."""
    depth = relevant_board(board)
    if depth is None:
        return []
    rows = [p for p in ((board or {}).get("players") or [])
            if (_num(p.get("adp")) or 10 ** 9) <= depth]
    return rows + list((board or {}).get("kept_players") or [])


def team_byes(board: dict) -> dict:
    """`team -> bye`, from any player who has one, UNANIMOUS ONLY.

    A team showing two byes is dropped rather than resolved by a mode: a wrong
    bye manufactures a conflict warning about a week the player actually plays,
    which is worse than a missing one. Measured on the 2026 board: 32 teams, no
    conflicts.
    """
    byteam, conflict = {}, set()
    for p in ((board or {}).get("players") or []):
        t, b = p.get("team"), p.get("bye")
        if not t or t == "FA" or b in (None, "", 0):
            continue
        if t in byteam and byteam[t] != int(b):
            conflict.add(t)
        byteam.setdefault(t, int(b))
    for t in conflict:
        byteam.pop(t, None)
    return byteam


def bye_gap(board: dict) -> dict:
    """Actionable rows with no bye, split by whether one is DERIVABLE.

    The split is the finding. A player whose team's bye is unknown is a genuine
    source gap and nothing can be done from here. A player whose team's bye sits
    on the same board in black and white is a FILL THAT DID NOT HAPPEN, and the
    tools' bye logic skips him in silence — no conflict warning, no stacking
    cost, on a player somebody is drafting.
    """
    byteam = team_byes(board)
    missing = [p for p in actionable(board) if p.get("bye") in (None, "", 0)]
    derivable = [p for p in missing if byteam.get(p.get("team")) is not None]
    return {
        "missing": missing, "derivable": derivable,
        "unknowable": [p for p in missing if byteam.get(p.get("team")) is None],
        "teams_with_a_bye": len(byteam),
        "by_position": dict(collections.Counter(p.get("position") for p in derivable)),
        "note": "%d actionable rows have no bye; %d of them belong to a team "
                "whose bye IS known on this board" % (len(missing), len(derivable)),
    }


def absent_projection_read_as_zero(board: dict) -> list:
    """Rows the market prices whose projection is ZERO with no source behind it.

    Zero is a claim ("he will not score"); absent is the refusal to make one. A
    board that writes the first when it means the second hands every consumer a
    number, and VORP, tiering and best-available all act on it — this row lands
    at rank 823 while the market drafts him in the eleventh round.
    """
    out = []
    for p in actionable(board):
        sources = (p.get("proj_fantasypros"), p.get("proj_sleeper"))
        if all(s is None for s in sources) and (_num(p.get("proj_mean")) or 0) <= 0:
            out.append(p)
    return out


def field_gaps(board: dict) -> dict:
    """The cheap completeness checks over the same region.

    Every one of these is clean today, and they are here so they STAY clean: each
    is a field some tool indexes by, where an absence reads as a value.
    """
    rows = actionable(board)
    return {
        "no_adp_sd": [p for p in rows if _num(p.get("adp_sd")) is None],
        "unrostered_position": [p for p in rows if p.get("position") not in ROSTERED],
        "no_team": [p for p in rows if not p.get("team")],
        "no_player_id": [p for p in rows if not p.get("player_id")],
    }


def audit(board: dict) -> dict:
    """Everything above, as one answer, with `n` so a caller can act on counts."""
    bg = bye_gap(board)
    zeros = absent_projection_read_as_zero(board)
    gaps = field_gaps(board)
    return {
        "actionable": len(actionable(board)),
        "relevant_board": relevant_board(board),
        "bye_derivable_but_missing": len(bg["derivable"]),
        "bye_unknowable": len(bg["unknowable"]),
        "absent_projection_as_zero": len(zeros),
        "field_gaps": {k: len(v) for k, v in gaps.items()},
        "detail": {"bye": bg, "zero_projection": zeros, "fields": gaps},
    }
