"""D7 — ADP BUILT FROM THE POOL ITSELF, decision-time clean by construction.

THE QUESTION THIS ANSWERS. F5 needs a board observably frozen before the drafts it
grades. Both providers were probed and neither bounds ADP to a past date, and their
year aggregates ACCUMULATE — so the 2027 timeline rested on providers not
cooperating. It does not have to: 21,323 public leagues did not all draft on the
same day, and the picks made before a decision are a board that was frozen before
it, verifiably, pick by pick.

Registered as D7 in INGEST-PLAN.md BEFORE any of this was measured.

THE THREE RULES, and the first is the one a careless version gets wrong:

  PER-PICK, NOT PER-DRAFT.  MFL drafts are email drafts spanning days. A draft that
                            STARTED before T can contain picks made AFTER T, so
                            "leagues whose draft completed earlier" imports future
                            picks under a label that says otherwise. Only a pick
                            whose OWN timestamp is strictly before T qualifies.
  SELF-EXCLUSION.           A league's own picks never enter the board it is graded
                            against. Structural — the caller cannot forget it,
                            because the league id is a required argument.
  FORMAT-MATCHED ONLY.      Dynasty ADP is a different quantity, not a noisier
                            version of the same one, and the crawl measured
                            `dynasty` at 5,642 term hits.

AND SUPPORT IS NOT OPTIONAL. A player seen in one draft has no ADP; he has one
observation. Below `MIN_SUPPORT` he is ABSENT from the board rather than priced
late — absent is not zero here either, and pricing him late would put a phantom
bargain in front of every policy that reads the board.
"""
from __future__ import annotations

# Fixed in the D7 registration BEFORE any measurement, so it cannot be chosen to
# flatter a result. Sensitivity across SUPPORT_SENSITIVITY is reported beside it.
MIN_SUPPORT = 10
SUPPORT_SENSITIVITY = (5, 10, 25, 50)

# HOW BIG A BOARD COUNTS AS USABLE — and this was a bare default in the code while
# `min_support` was registered, which is the same degree of freedom wearing
# different clothes. A single threshold decides how many leagues D7 "works" for, so
# the WHOLE CURVE is reported and no one value does the deciding.
BOARD_SIZE_CURVE = (25, 50, 100, 200)

# Every board built here carries this, so it can never be read as provider ADP in
# a table that also contains provider ADP.
ADP_SOURCE = "within_pool_v1"


def qualifying_picks(pool_picks, before_ts, exclude_league) -> list:
    """Picks usable as evidence for a decision at `before_ts` in `exclude_league`.

    `pool_picks` is a flat list of {league_id, player, overall, timestamp} across
    the pool. Both filters are applied HERE and nowhere else, so no caller can
    apply one and forget the other.
    """
    out = []
    for p in pool_picks or []:
        ts = p.get("timestamp")
        if ts is None:
            # A pick we cannot date cannot be shown to precede anything. Dropped
            # and counted by `board`, never assumed early.
            continue
        if str(p.get("league_id")) == str(exclude_league):
            continue
        if float(ts) >= float(before_ts):
            continue
        out.append(p)
    return out


def board(pool_picks, before_ts, exclude_league, min_support=MIN_SUPPORT) -> dict:
    """The within-pool ADP board for one decision. Returns rows plus its own shape.

    `rows` is [{player_id, adp, n}] sorted by adp — the shape `ExternalAsOfStore`
    already consumes, so this is an ADP SOURCE and not a second board format.
    """
    picks = qualifying_picks(pool_picks, before_ts, exclude_league)
    undated = sum(1 for p in (pool_picks or []) if p.get("timestamp") is None)
    by_player: dict = {}
    leagues = set()
    for p in picks:
        pid = str(p.get("player"))
        if not pid or pid == "None":
            continue
        by_player.setdefault(pid, []).append(float(p.get("overall") or 0))
        leagues.add(str(p.get("league_id")))
    rows, thin = [], 0
    for pid, positions in by_player.items():
        if len(positions) < min_support:
            thin += 1
            continue
        rows.append({"player_id": pid, "adp": round(sum(positions) / len(positions), 2),
                     "n": len(positions)})
    rows.sort(key=lambda r: r["adp"])
    return {
        "adp_source": ADP_SOURCE,
        "rows": rows,
        "min_support": min_support,
        "contributing_leagues": len(leagues),
        "contributing_picks": len(picks),
        "players_with_adp": len(rows),
        # THE PLAYERS THAT ARE NOT ON THE BOARD, counted. A board of 40 players is
        # not a board of 400 with 360 late ones, and the difference decides whether
        # a replay can price anything.
        "players_below_support": thin,
        "undated_picks_dropped": undated,
    }


def support_sensitivity(pool_picks, before_ts, exclude_league,
                        levels=SUPPORT_SENSITIVITY) -> dict:
    """The same board at every registered support level.

    Reported so `min_support` cannot be read as a tuned parameter: the whole curve
    is published and the primary is the value fixed in the registration.
    """
    return {str(k): board(pool_picks, before_ts, exclude_league,
                          min_support=k)["players_with_adp"] for k in levels}


def feasibility(leagues, pool_picks, min_support=MIN_SUPPORT, need_players=100) -> dict:
    """M1-M4: can D7 produce boards at all, and for WHICH leagues?

    `leagues` is [{league_id, first_pick_ts, ...covariates}]. This is the
    measurement D7 registered before it ran, and it answers the question the
    registration says decides the route: how many leagues get a usable board, and
    are they the early ones or the late ones.
    """
    dated = [lg for lg in (leagues or []) if lg.get("first_pick_ts") is not None]
    dated.sort(key=lambda lg: float(lg["first_pick_ts"]))
    usable, per_league = 0, []
    for lg in dated:
        b = board(pool_picks, lg["first_pick_ts"], lg["league_id"], min_support)
        ok = b["players_with_adp"] >= need_players
        usable += 1 if ok else 0
        per_league.append({"league_id": str(lg["league_id"]),
                           "first_pick_ts": lg["first_pick_ts"],
                           "players_with_adp": b["players_with_adp"],
                           "contributing_leagues": b["contributing_leagues"],
                           "usable": ok})
    # THE COVARIATE D7 NAMED: is the usable slice the EARLY drafts or the LATE ones?
    # A route that only works for the drafts closest to the season has not rescued
    # a preseason decision, and saying so is the point of measuring it.
    half = len(per_league) // 2
    early_usable = sum(1 for x in per_league[:half] if x["usable"])
    late_usable = sum(1 for x in per_league[half:] if x["usable"])
    # THE CURVE, so `need_players` cannot silently be the answer. Computed from the
    # per-league board sizes already measured, at no extra fetching or scanning.
    sizes = [x["players_with_adp"] for x in per_league]
    curve = {str(k): sum(1 for v in sizes if v >= k) for k in BOARD_SIZE_CURVE}
    return {
        "leagues_examined": len(leagues or []),
        "leagues_by_board_size": curve,
        "board_size_distribution": _distribution(sizes),
        "leagues_dated": len(dated),
        "leagues_undated": len(leagues or []) - len(dated),
        "leagues_with_usable_board": usable,
        "need_players": need_players,
        "min_support": min_support,
        "usable_in_earlier_half": early_usable,
        "usable_in_later_half": late_usable,
        "per_league": per_league[:200],
        "verdict": _feasibility_verdict(len(dated), usable, early_usable, late_usable,
                                        need_players, len(leagues or [])),
        # M4, reported beside the count rather than left for someone to ask about.
        "calendar_covariates": calendar_covariates(leagues),
    }


def _distribution(vals) -> dict:
    if not vals:
        return {"n": 0, "min": None, "median": None, "max": None}
    s = sorted(vals)
    mid = len(s) // 2
    return {"n": len(s), "min": s[0],
            "median": s[mid] if len(s) % 2 else (s[mid - 1] + s[mid]) / 2,
            "max": s[-1]}


def calendar_covariates(leagues, keys=("teams", "keeper_type", "draft_type")) -> dict:
    """M4 — do EARLY drafters differ from LATE ones on the covariates we hold?

    D7's registration named this and it is not a nicety. If the leagues that draft
    first are systematically different, then a board built from earlier picks is
    not "the market before T" — it is "the early drafters before T", and the
    difference is invisible in an ADP number.

    Reported as two distributions rather than a test statistic: with a sample this
    size a p-value would be a decoration, and the split is what someone judging the
    result actually needs to see.
    """
    dated = [lg for lg in (leagues or []) if lg.get("first_pick_ts") is not None]
    dated.sort(key=lambda lg: float(lg["first_pick_ts"]))
    half = len(dated) // 2
    out = {"n_early": half, "n_late": len(dated) - half, "by_key": {}}
    for k in keys:
        early = _tally(dated[:half], k)
        late = _tally(dated[half:], k)
        # A COVARIATE ABSENT FOR EVERY LEAGUE IS A KEY THAT DOES NOT EXIST, not a
        # covariate nobody recorded — and the two are indistinguishable in the
        # output, because both print "(absent)" and both make the halves agree.
        # Caught before this ever ran: M4 was written reading `keepers` while the
        # record carries `keeper_type`, so the keeper covariate would have reported
        # NO DIFFERENCE for every run, forever, and read as a finding.
        vacuous = (set(early) | set(late)) <= {"(absent)"} and (early or late)
        out["by_key"][k] = {"early": early, "late": late,
                            "differs": sorted(early) != sorted(late),
                            "vacuous_key": bool(vacuous)}
    out["verdict"] = _covariate_verdict(out)
    return out


def _tally(rows, key) -> dict:
    from collections import Counter
    # ABSENT IS ITS OWN BUCKET, not folded into the modal value: a covariate we
    # could not read is not evidence that the early and late halves agree.
    c = Counter("(absent)" if r.get(key) is None else str(r.get(key)) for r in rows)
    return dict(c.most_common())


def _covariate_verdict(rep: dict) -> str:
    moved = [k for k, v in rep["by_key"].items() if v["differs"]]
    dead = sorted(k for k, v in rep["by_key"].items() if v.get("vacuous_key"))
    if not rep["n_early"] and not rep["n_late"]:
        return "no dated leagues to split"
    if dead:
        return ("COVARIATE(S) %s ARE ABSENT FOR EVERY LEAGUE — that is a key this check "
                "reads and the record does not carry, NOT a covariate on which early and "
                "late agree. Nothing has been measured about %s"
                % (", ".join(dead), ", ".join(dead))) + \
               ("; the rest: " + _moved_line(rep, moved) if len(dead) < len(rep["by_key"])
                else "")
    if not moved:
        return ("no covariate we hold distinguishes the earlier half of the draft "
                "calendar from the later half (%d vs %d leagues)"
                % (rep["n_early"], rep["n_late"]))
    return _moved_line(rep, moved)


def _moved_line(rep: dict, moved: list) -> str:
    if not moved:
        return ("no covariate we hold distinguishes the earlier half of the draft calendar "
                "from the later half (%d vs %d leagues)" % (rep["n_early"], rep["n_late"]))
    return ("EARLY AND LATE DRAFTERS DIFFER on %s — a board built from earlier picks is "
            "then 'the early drafters before T' rather than 'the market before T', and "
            "that difference does not appear anywhere in an ADP number. It is a covariate "
            "on every result built from D7, not a reason to stop" % ", ".join(sorted(moved)))


def _feasibility_verdict(dated, usable, early, late, need, examined=None) -> str:
    # AN EMPTY POPULATION IS NOT AN UNDATED ONE. Measured in run 11: D7's
    # format-matched population came back with ZERO F1-passing leagues in it, and
    # this reported "NO LEAGUE CARRIES A DATED FIRST PICK ... a statement about the
    # timestamps we hold" — naming the wrong cause with total confidence. The
    # timestamps were fine; there was nobody to have one. Absent is not zero, and
    # the rule applies to this file's own verdict line before it applies to anything
    # else.
    if examined is not None and not examined:
        return ("THE POPULATION IS EMPTY — no league entered this measurement at all, so "
                "there is nothing here about dates, boards or D7. Whatever selected the "
                "population is what this run measured")
    if not dated:
        return ("NO LEAGUE CARRIES A DATED FIRST PICK — D7 cannot be evaluated from this "
                "sample, and that is a statement about the timestamps we hold, not about "
                "the route")
    if not usable:
        return ("NO LEAGUE reaches a board of %d players at this support level. D7 does not "
                "rescue the timeline on this sample: the pool's drafts do not spread enough "
                "for earlier picks to price a later draft" % need)
    head = ("%d of %d dated leagues reach a board of %d+ players" % (usable, dated, need))
    if late > early * 2 and early == 0:
        return (head + "; and EVERY usable league is in the LATER half of the draft calendar "
                "— D7 works only for drafts closest to the season, which are the least like "
                "the preseason decision this program is about. That is a limit, not a win")
    if late > early:
        return (head + "; and the usable slice is LATE-SKEWED (%d late vs %d early) — the "
                "boards exist because those leagues had more of the pool behind them, so "
                "draft date is a covariate on every result built from this" % (late, early))
    return head + " (%d early, %d late — no strong calendar skew)" % (early, late)
