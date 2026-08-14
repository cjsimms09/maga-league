# TERRITORY: C
"""TEAM PACE AND PLAYS PER GAME — item 2, the tiebreak signal with nothing behind it.

Every other signal Cory named is already on the board: `target_share`,
`opportunity_share`, `wopr`, `age`, `years_exp`. Pace had no data at all, and it is
the DENOMINATOR under all of them — a share is a share OF something, and two backs
with identical shares on offences running 68 and 58 plays a game are not the same
player.

RAW PLAYS PER GAME IS NOT PACE, and that is the whole difficulty. A team that trails
all season throws to catch up and runs more plays; a team that leads kneels the clock
away. Rank offences by raw volume and you partly rank them by how badly they were
losing — then the tiebreak recommends the players on bad teams, confidently, with a
real number behind it.

So NEUTRAL-SCRIPT volume is measured alongside raw volume and the two are reported
SEPARATELY. Not blended: a single "adjusted" number would hide which half is doing
the work, and the gap between them is itself the interesting quantity (a large gap
means the raw figure was mostly garbage time).

WHAT COUNTS AS A PLAY. Scrimmage plays only — `play_type` in {pass, run} — minus
kneels and spikes. pbp rows also carry punts, kickoffs, field goals, extra points and
`no_play` penalty rows; counting those ranks offences partly by how often they kicked
and got flagged. Kneels and spikes matter more than they look: both are typed as
run/pass, and a team that leads a lot kneels a lot, so counting them rewards exactly
the offences that stopped playing.

AND THE TEAM IS `posteam`, the one ON OFFENCE. Keying on `home_team` credits every
road drive to the wrong offence and leaves numbers that still look entirely plausible.
"""
from __future__ import annotations

#: Below this many games a team reports a status rather than a number.
MIN_GAMES = 4

#: |score differential| at or under this counts as neutral script. Declared, not
#: tuned: two possessions is the usual line for "the game plan has not changed yet",
#: and it is written here rather than fitted to make any team look fast.
NEUTRAL_MARGIN = 14

SCRIMMAGE = ("pass", "run")


def _rows(frame):
    if frame is None:
        return []
    if hasattr(frame, "to_dict"):
        return frame.to_dict("records")
    return list(frame)


def _truthy(v):
    """pbp writes these as 0/1 floats, and NaN for rows where they do not apply."""
    try:
        return float(v) == 1.0
    except (TypeError, ValueError):
        return False


def team_pace(pbp, seasons, *, before_season=None, min_games=MIN_GAMES,
              neutral_margin=NEUTRAL_MARGIN) -> tuple:
    """`(out, report)` — per-team volume and pass rate, raw and neutral-script.

    `out[team]` is
    `{plays, games, plays_per_game, neutral_plays_per_game, neutral_share,
      pass_rate, neutral_pass_rate, status}`.

    `before_season` REFUSES any season not strictly before it, the same rule
    `usage_shares` and `weekly_variance` enforce: pace taken from the season being
    replayed is an outcome, not a prior.
    """
    seasons = [int(s) for s in (seasons or [])]
    if before_season is not None:
        bad = [s for s in seasons if s >= int(before_season)]
        if bad:
            raise ValueError(
                "team_pace was given season(s) %s which are not strictly BEFORE the "
                "drafted season %s — pace taken from the season being replayed is an "
                "outcome, not a prior" % (bad, before_season))

    rows = _rows(pbp)
    if not rows:
        return {}, {"usable": False, "why": "no play-by-play rows", "teams": 0}

    # ABSENT IS NOT ZERO, AND HERE IT IS WORSE THAN ZERO. Without `play_type` every
    # row reads as a scrimmage play, so every team's pace inflates by roughly the
    # special-teams rate — uniformly enough across teams to look entirely plausible
    # while being wrong for all of them.
    if not any("play_type" in r for r in rows):
        return {}, {"usable": False,
                    "why": "the frame carries no play_type column, so a scrimmage "
                           "play cannot be told from a punt, a kickoff or a penalty "
                           "row; counting every row would inflate every team's pace "
                           "by about the special-teams rate and still look plausible",
                    "teams": 0}

    agg = {}
    for r in rows:
        season = r.get("season")
        if season is not None and int(season) not in seasons:
            continue
        team = r.get("posteam")
        if not team or team != team:                 # None or NaN
            continue
        a = agg.setdefault(str(team), {"plays": 0, "passes": 0, "games": set(),
                                       "n_plays": 0, "n_passes": 0,
                                       # ⚠ THE SAME GAMES, COUNTED AFTER THE PLAY
                                       # FILTERS. `games` is added before the
                                       # SCRIMMAGE and kneel/spike filters, so a
                                       # game contributing only special-teams rows
                                       # for this team sits in the DENOMINATOR of
                                       # `plays_per_game` and not in the numerator
                                       # — A's criterion 1, found by saying the
                                       # ratio out loud. On real pbp the two are
                                       # expected identical; expected is what must
                                       # not be relied on, and the pbp pull is
                                       # egress-blocked from the sandbox so I
                                       # cannot measure it. Reported rather than
                                       # silently corrected: if these ever differ
                                       # the denominator is wrong and
                                       # `plays_per_game` is understated.
                                       "games_with_plays": set()})
        gid = r.get("game_id")
        if gid is not None and gid == gid:
            a["games"].add(str(gid))
        pt = r.get("play_type")
        if pt not in SCRIMMAGE:
            continue
        if _truthy(r.get("qb_kneel")) or _truthy(r.get("qb_spike")):
            continue
        a["plays"] += 1
        if gid is not None and gid == gid:
            a["games_with_plays"].add(str(gid))
        if pt == "pass":
            a["passes"] += 1
        diff = r.get("score_differential")
        try:
            neutral = abs(float(diff)) <= float(neutral_margin)
        except (TypeError, ValueError):
            neutral = False                          # unknown script is not neutral
        if neutral:
            a["n_plays"] += 1
            if pt == "pass":
                a["n_passes"] += 1

    out = {}
    for team, a in agg.items():
        g = len(a["games"])
        if g < int(min_games) or not a["plays"]:
            # A NUMBER OFF ONE GAME RANKS BESIDE ONE OFF SEVENTEEN and nothing in
            # the value says which is which.
            out[team] = {"plays": a["plays"], "games": g, "status": "unmeasurable",
                         "games_with_plays": len(a["games_with_plays"]),
                         "games_without_plays": g - len(a["games_with_plays"]),
                         "plays_per_game": None, "neutral_plays_per_game": None,
                         "neutral_share": None, "pass_rate": None,
                         "neutral_pass_rate": None,
                         "basis": "only %d game(s); min_games is %d" % (g, min_games)}
            continue
        out[team] = {
            "plays": a["plays"], "games": g, "status": "measured",
            "games_with_plays": len(a["games_with_plays"]),
            # NAMED, not left to be derived by subtraction — a reader should not
            # have to spot the gap to know the ratio below is over the wrong
            # denominator.
            "games_without_plays": g - len(a["games_with_plays"]),
            "plays_per_game": round(a["plays"] / g, 3),
            "neutral_plays_per_game": round(a["n_plays"] / g, 3),
            # The GAP is the interesting quantity: a low neutral share means the raw
            # figure was mostly garbage time.
            "neutral_share": round(a["n_plays"] / a["plays"], 4),
            "pass_rate": round(a["passes"] / a["plays"], 4),
            "neutral_pass_rate": (round(a["n_passes"] / a["n_plays"], 4)
                                  if a["n_plays"] else None),
            "basis": "%d scrimmage plays over %d games" % (a["plays"], g),
        }

    measured = sum(1 for v in out.values() if v["status"] == "measured")
    return out, {"usable": True, "seasons": seasons, "teams": len(out),
                 "teams_measured": measured, "min_games": int(min_games),
                 "neutral_margin": int(neutral_margin),
                 "note": "plays_per_game is RAW volume and is contaminated by game "
                         "script; neutral_plays_per_game counts only snaps within "
                         "%d points. They are reported separately on purpose — a "
                         "single blended number hides which half is doing the work."
                         % neutral_margin}
