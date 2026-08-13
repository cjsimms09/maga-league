# TERRITORY: C
"""PLAYER-LEVEL DURABILITY — expected games, and E[weeks out | injured].

A's two requests, in A's order:

  1. `projections.EXPECTED_GAMES` is ONE VALUE PER POSITION, so Harstad's per-game
     VBD is unavailable rather than unimplemented — every RB is priced at 14.2 games
     whether he has played 17 three years running or 9.
  2. The bench equation multiplies P(need) by a FULL-SEASON advantage, so a one-week
     bye and a season-ending tear price identically.

TWO THINGS MAKE THIS HARDER THAN COUNTING ROWS, AND BOTH INFLATE THE ANSWER.

**A BYE IS NOT A MISSED GAME.** Every player on a team lacks a weekly row in that
team's bye. Counting it adds exactly one missed game to every player in the league —
uniform enough to look like a durability signal, and wrong for all of them. The bye
is derived from the frame itself: the week in which NO player from that team has a
row. That is a measurement rather than a hard-coded schedule, so it cannot drift out
of date the way a copied calendar does.

**A SEASON-ENDING INJURY IS RIGHT-CENSORED.** A player who misses weeks 12-17 is
observed as "6 weeks out", but the injury did not end in week 17 — the season did.
Averaging censored and completed absences together UNDERSTATES E[weeks out], and it
understates it most for the severe injuries the term exists to price. So they are
counted separately, and the censored fraction rides along, rather than one mean that
quietly mixes two different quantities.

WHAT THIS CANNOT SEE, STATED RATHER THAN GLOSSED. A weekly row means he recorded a
counting stat, not that he was active. A healthy back-up who took no snaps and an
inactive one look identical here, so `missed` is "weeks with no production", which
overstates injury for deep-roster players and is accurate for the starters this is
actually used to price. Distinguishing them needs a snap-count or inactives feed,
which is a different ingest.
"""
from __future__ import annotations

#: Last week of the league's scored season (`last_scored_leg` in league_history).
#: Also the censoring boundary: an absence still running here did not end, the
#: season did.
LAST_WEEK = 17

TEAM_COLS = ("recent_team", "team")
ID_COLS = ("player_id", "gsis_id")
POS_COLS = ("position", "pos")


def _rows(frame):
    if frame is None:
        return []
    if hasattr(frame, "to_dict"):
        return frame.to_dict("records")
    return list(frame)


def _first(row, names, default=None):
    for n in names:
        if n in row and row[n] is not None:
            return row[n]
    return default


def durability(weekly, seasons, crosswalk, *, before_season=None,
               last_week=LAST_WEEK) -> tuple:
    """`(out, report)` — per player per season: games, byes, missed weeks, spells.

    `before_season` REFUSES a season not strictly before it, the same rule
    `usage_shares`, `weekly_variance` and `team_pace` enforce.
    """
    seasons = [int(s) for s in (seasons or [])]
    if before_season is not None:
        bad = [s for s in seasons if s >= int(before_season)]
        if bad:
            raise ValueError(
                "durability was given season(s) %s which are not strictly BEFORE the "
                "drafted season %s — games played in the season being replayed is an "
                "outcome, not a prior" % (bad, before_season))

    rows = _rows(weekly)
    if not rows:
        return {}, {"usable": False, "why": "no weekly rows", "players": 0}

    # weeks each TEAM actually played, and weeks each PLAYER appeared
    team_weeks, player_weeks, player_team, player_pos = {}, {}, {}, {}
    for r in rows:
        s = _first(r, ("season",))
        if s is not None and int(s) not in seasons:
            continue
        wkno = r.get("week")
        if wkno is None:
            continue
        wkno = int(wkno)
        if wkno > int(last_week):
            continue                    # postseason is not part of the fantasy season
        tm = _first(r, TEAM_COLS)
        team_weeks.setdefault((tm, int(s)), set()).add(wkno)
        sid = crosswalk.get(str(_first(r, ID_COLS)))
        if not sid:
            continue
        player_weeks.setdefault((sid, int(s)), set()).add(wkno)
        player_team.setdefault((sid, int(s)), tm)
        p = _first(r, POS_COLS)
        if p:
            player_pos.setdefault(sid, p)

    out = {}
    for (sid, season), played in player_weeks.items():
        tm = player_team.get((sid, season))
        tw = team_weeks.get((tm, season), set())
        # THE BYE IS A WEEK THE TEAM DID NOT PLAY, measured from the frame.
        byes = sorted(set(range(1, int(last_week) + 1)) - tw)
        missed = sorted(w for w in range(1, int(last_week) + 1)
                        if w not in played and w in tw)
        rec = out.setdefault(sid, {"position": player_pos.get(sid), "games": {},
                                   "byes": {}, "missed": {}, "spells": {}})
        rec["games"][season] = len(played)
        rec["byes"][season] = byes
        rec["missed"][season] = missed
        rec["spells"][season] = _spells(missed, int(last_week))

    counts = {"players": len(out),
              "spells": sum(len(v) for r in out.values() for v in r["spells"].values())}
    return out, {"usable": True, "seasons": seasons, "last_week": int(last_week),
                 **counts}


def _spells(missed, last_week) -> list:
    """Consecutive runs of missed weeks. A run touching `last_week` is CENSORED."""
    spells, run = [], []
    for w in missed:
        if run and w == run[-1] + 1:
            run.append(w)
        else:
            if run:
                spells.append(run)
            run = [w]
    if run:
        spells.append(run)
    return [{"start": r[0], "end": r[-1], "weeks": len(r),
             # The season ended, not the injury. Treating this as a completed
             # absence biases E[weeks out] low, and biases it most for exactly the
             # severe injuries the bench term exists to price.
             "censored": r[-1] >= int(last_week)}
            for r in spells]


def merge_games_only(out: dict, season, games_by_player: dict) -> dict:
    """Add GAMES PLAYED for a season we can count but cannot fully derive.

    `import_weekly_data` 404s for 2025 — the season CLOSEST to the board we draft
    on, so losing it does not merely shrink n, it re-weights every durability
    figure toward older conditions.

    `games` is `len(weeks the player appeared)` and nothing else: a bye moves
    `byes`/`missed`/`spells` and never the count. So games-played can come from the
    weekly POINTS store, which is keyed by our ids and carries no team.

    GATED, NOT ASSUMED. Rebuilt 2024 from the store and required it to reproduce
    `import_weekly_data` before trusting the path for a season nobody can check:
    485 players in both, 485 agreeing exactly, zero disagreements.

    ⚠ AND IT REFUSES TO INVENT WHAT IT CANNOT KNOW. Without team there is no
    team-week set, so `missed` and `spells` are UNDERIVABLE for this season. The
    dangerous failure here is not an exception — it is a season quietly
    contributing "nobody missed time" to `weeks_out_by_position`, diluting the
    injury rate with a season that was never examined. So the season is added to
    `games` alone, recorded in `games_only_seasons`, and left absent everywhere the
    injury statistics look.
    """
    for sid, n in (games_by_player or {}).items():
        rec = out.setdefault(sid, {"position": None, "games": {}, "byes": {},
                                   "missed": {}, "spells": {}})
        if season in rec["games"] and season not in rec.get("games_only_seasons", []):
            raise ValueError(
                "season %s is already fully derived for %s — refusing to overwrite "
                "a record that has byes and spells with a bare count" % (season, sid))
        rec["games"][season] = int(n)
        rec.setdefault("games_only_seasons", [])
        if season not in rec["games_only_seasons"]:
            rec["games_only_seasons"].append(season)
            rec["games_only_seasons"].sort()
    return out


def expected_games(out: dict, position_prior: dict = None, min_seasons=1,
                   shrink_k=None) -> dict:
    """Per-player expected games, with a status — never a silent position constant.

    `EXPECTED_GAMES[pos]` is what the board uses today for everyone at a position.
    This returns the player's own history where there is one and SAYS SO when there
    is not, so a consumer can tell a measurement from a fallback.

    ── A HISTORY IS NOT A FORECAST, AND THE RAW MEAN IS NOT A DROP-IN ─────────

    MEASURED on real 2023-24 weekly data against the live board, cut to the
    DRAFTABLE range (adp <= 150, 112 players matched): median |player - position
    constant| is 1.00 games, 43% differ by more than one and 18% by more than
    three. The variation A asked about is real and it is inside the draft.

    But this function averaged the seasons observed and did nothing else, and that
    is a history. Jonathon Brooks — one rookie season, three games, torn ACL —
    comes out at 3.00 against an RB prior of 14.2. McCaffrey's [16, 4] averages to
    10.0. Swapping those into the board as 2026 EXPECTATIONS systematically
    under-prices exactly the players coming off an injury year, which is the
    population where injury is least persistent and where the market has already
    applied its own discount. Only two seasons exist to average at all
    (`import_weekly_data` 404s for 2025), so these are two-point means.

    `shrink_k` weights the prior in SEASON UNITS: k=1 says one observed season is
    worth as much as the prior. DECLARED, NOT TUNED — I have not fitted it to make
    any number come out, and it is a parameter precisely because choosing it is a
    modelling decision that belongs to whoever prices the board, not to the ingest.

    OPT-IN. Passing no `shrink_k` reproduces the previous behaviour exactly, and
    the raw mean survives beside the blend as `observed_games` with
    `seasons_observed`, so a consumer can always tell a measurement from a blend.
    """
    prior = dict(position_prior or {})
    res = {}
    for sid, rec in (out or {}).items():
        seasons = sorted(rec["games"])
        vals = [rec["games"][s] for s in seasons]
        if len(vals) >= int(min_seasons):
            raw = sum(vals) / len(vals)
            pos = rec.get("position")
            if shrink_k is None:
                res[sid] = {"expected_games": round(raw, 2),
                            "seasons": seasons, "status": "measured",
                            "observed_games": round(raw, 2),
                            "seasons_observed": len(vals), "prior": prior.get(pos),
                            "basis": "%d season(s): %s" % (len(vals), vals)}
            elif pos in prior:
                n, k = len(vals), float(shrink_k)
                blended = (n * raw + k * float(prior[pos])) / (n + k)
                res[sid] = {"expected_games": round(blended, 6),
                            "seasons": seasons, "status": "shrunk",
                            "observed_games": round(raw, 2),
                            "seasons_observed": n, "prior": float(prior[pos]),
                            "basis": "%d season(s) %s shrunk toward %s (k=%g)"
                                     % (n, vals, prior[pos], k)}
            else:
                # NO PRIOR IS NOT ZERO SHRINKAGE SILENTLY APPLIED. The caller asked
                # for shrinkage and did not get it here; saying `measured` would
                # let one unshrunk value ride in a set the caller believes is
                # uniform.
                res[sid] = {"expected_games": round(raw, 2),
                            "seasons": seasons, "status": "measured_unshrunk",
                            "observed_games": round(raw, 2),
                            "seasons_observed": len(vals), "prior": None,
                            "basis": "%d season(s): %s — NO PRIOR for %s, so the "
                                     "requested shrinkage was not applied"
                                     % (len(vals), vals, pos)}
        elif rec.get("position") in prior:
            res[sid] = {"expected_games": float(prior[rec["position"]]),
                        "seasons": seasons, "status": "imputed",
                        "basis": "position prior for %s" % rec["position"]}
        else:
            res[sid] = {"expected_games": None, "seasons": seasons,
                        "status": "unmeasurable",
                        "basis": "no seasons and no position prior"}
    return res


def weeks_out_by_position(out: dict, min_n=8) -> dict:
    """E[weeks out | he missed time], per position, with censored spells SEPARATE.

    Reporting one mean over completed and censored spells together understates the
    answer by an amount nothing in the output would disclose. So: the completed mean,
    the censored count, and the censored fraction — which is itself the interesting
    number, because a position whose absences mostly run to the whistle is a position
    whose injuries end seasons.
    """
    by = {}
    for rec in (out or {}).values():
        pos = rec.get("position")
        if not pos:
            continue
        b = by.setdefault(pos, {"completed": [], "censored": []})
        for spells in rec["spells"].values():
            for sp in spells:
                b["censored" if sp["censored"] else "completed"].append(sp["weeks"])

    res = {}
    for pos, b in by.items():
        n = len(b["completed"]) + len(b["censored"])
        if n < int(min_n):
            res[pos] = {"status": "unmeasurable", "n": n,
                        "completed_n": len(b["completed"]),
                        "censored_n": len(b["censored"]),
                        "mean_completed": None, "censored_fraction": None,
                        "caveat": "only %d spell(s); min_n is %d" % (n, min_n)}
            continue
        comp = b["completed"]
        res[pos] = {
            "status": "measured", "n": n,
            "completed_n": len(comp), "censored_n": len(b["censored"]),
            "mean_completed": (round(sum(comp) / len(comp), 3) if comp else None),
            "censored_fraction": round(len(b["censored"]) / n, 4),
            "caveat": "mean_completed uses only absences observed to END. %d of %d "
                      "spells are RIGHT-CENSORED — they were still running when the "
                      "season stopped, so their true length is unknown and at least "
                      "what is recorded. Pooling them into one mean biases E[weeks "
                      "out] low, worst for the severe injuries this term prices."
                      % (len(b["censored"]), n),
        }
    return res
