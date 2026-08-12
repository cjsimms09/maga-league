# TERRITORY: C
"""SLEEPER'S PUBLIC POOL — is it discoverable, and does it match our format?

The external-sample question was answered against MyFantasyLeague and archive.org.
This is the second source, and the four questions are Cory's, in his order:
discoverable at all / format match rate / per-pick timestamps / per-league cost.

THE DISCOVERY MECHANISM. Sleeper exposes no "list public leagues" endpoint. What it
does expose is a REFERRAL CRAWL — a league names its users, and a user names their
other leagues — so the reachable pool is the connected component containing ours.
Whether `/v1/user/<id>/leagues/nfl/<season>` answers without auth is the question
that decides the route, and it is asked before anything is designed on top of it.

PROBE BEFORE DESIGNING, and this file is written to be WRONG SAFELY. MFL's
`draftType` came back `SFIRSTRANDOM` rather than "snake", and an adapter guessed
from documentation would have rejected every league while reading as format rarity.
So every reader here returns a REASON when it cannot read a field, and absent is
never scored as a mismatch — `unreadable` and `does not match` are different
findings and only one of them is about Sleeper.

Pure. The workflow fetches; this decides. Same split as every probe in this lane.
"""
from __future__ import annotations

API = "https://api.sleeper.app/v1"

# OUR OWN LEAGUE, ALL FOUR SEASONS — the crawl seeds and the positive control.
OUR_LEAGUES = ("1374848328470102016", "1248121522762027008",
               "1117672595379277824", "990840142107619328")


def league_url(lid) -> str:
    return "%s/league/%s" % (API, lid)


def users_url(lid) -> str:
    return "%s/league/%s/users" % (API, lid)


def user_leagues_url(user_id, season) -> str:
    """THE EDGE THE WHOLE ROUTE TURNS ON. If this needs auth, Q1 closes."""
    return "%s/user/%s/leagues/nfl/%s" % (API, user_id, season)


def drafts_url(lid) -> str:
    return "%s/league/%s/drafts" % (API, lid)


def picks_url(draft_id) -> str:
    return "%s/draft/%s/picks" % (API, draft_id)


def user_ids(users_body) -> list:
    """User ids from a league's user list. A non-list is an ERROR, not an empty league."""
    if not isinstance(users_body, list):
        raise TypeError("league users is %s, not a list — an auth wall or an error page "
                        "is not a league with no members" % type(users_body).__name__)
    return [str(u.get("user_id")) for u in users_body
            if isinstance(u, dict) and u.get("user_id")]


def league_ids(user_leagues_body) -> list:
    """League ids from a user's league list. Same refusal: a non-list raises."""
    if not isinstance(user_leagues_body, list):
        raise TypeError("user leagues is %s, not a list — cannot tell 'no leagues' from "
                        "'not permitted'" % type(user_leagues_body).__name__)
    return [str(l.get("league_id")) for l in user_leagues_body
            if isinstance(l, dict) and l.get("league_id")]


# ── FORMAT, read from the real response rather than from documentation ──────
#
# F1's six clauses, applied to Sleeper's shapes. Each returns (value, reason) and a
# reason of None means READ. Absent is never scored as a mismatch.

def teams_of(lg):
    n = (lg or {}).get("total_rosters")
    return (int(n), None) if isinstance(n, int) else (None, "no total_rosters")


def reception_points(lg):
    """Half-PPR is `scoring_settings.rec == 0.5`. TE-premium lives in `rec_te`."""
    s = (lg or {}).get("scoring_settings")
    if not isinstance(s, dict):
        return None, "no scoring_settings"
    if "rec" not in s:
        return None, "no rec term"
    try:
        base = float(s["rec"])
    except (TypeError, ValueError):
        return None, "rec unreadable: %r" % (s["rec"],)
    te = s.get("rec_te")
    if te is not None:
        try:
            if abs(float(te)) > 1e-9:
                # TE PREMIUM IS ITS OWN FORMAT, not half-PPR with a caveat — the same
                # split F1 already makes on the MFL side.
                return None, "te_premium:rec_te=%s" % te
        except (TypeError, ValueError):
            return None, "rec_te unreadable"
    return base, None


def pass_td_points(lg):
    s = (lg or {}).get("scoring_settings")
    if not isinstance(s, dict) or "pass_td" not in s:
        return None, "no pass_td term"
    try:
        return float(s["pass_td"]), None
    except (TypeError, ValueError):
        return None, "pass_td unreadable"


def keeper_count(lg):
    """Sleeper carries this in `settings`, and the key has varied by era."""
    st = (lg or {}).get("settings")
    if not isinstance(st, dict):
        return None, "no settings"
    for k in ("max_keepers", "keepers", "num_keepers"):
        if k in st:
            try:
                return int(st[k]), None
            except (TypeError, ValueError):
                return None, "%s unreadable" % k
    return None, "no keeper key (tried max_keepers, keepers, num_keepers)"


def roster_positions(lg):
    rp = (lg or {}).get("roster_positions")
    return (list(rp), None) if isinstance(rp, list) and rp else (None, "no roster_positions")


def superflex(lg):
    rp, why = roster_positions(lg)
    if rp is None:
        return None, why
    return (("SUPER_FLEX" in rp) or (rp.count("QB") > 1)), None


def screen(lg) -> tuple:
    """(matches, reason). UNREADABLE IS NOT A MISMATCH — that distinction is the
    whole reason MFL's 74 unreadable leagues did not become evidence about the pool.
    """
    t, why = teams_of(lg)
    if t is None:
        return False, "unreadable:%s" % why
    if t != 10:
        return False, "teams:%d" % t
    r, why = reception_points(lg)
    if r is None:
        return False, "unreadable:%s" % why
    if not (0.4 <= r <= 0.6):
        return False, "rec:%s" % r
    sf, why = superflex(lg)
    if sf is None:
        return False, "unreadable:%s" % why
    if sf:
        return False, "superflex"
    k, why = keeper_count(lg)
    if k is None:
        return False, "unreadable:%s" % why
    if k < 1:
        return False, "no_keepers"
    return True, "ok"


def pick_has_timestamp(pick) -> tuple:
    """Q3. D7 needs a PER-PICK time to stop a multi-day draft importing future picks."""
    if not isinstance(pick, dict):
        return False, "pick is %s" % type(pick).__name__
    for k in ("pick_time", "created", "timestamp", "updated_at", "metadata_time"):
        if pick.get(k) is not None:
            return True, k
    md = pick.get("metadata")
    if isinstance(md, dict):
        for k in ("pick_time", "timestamp"):
            if md.get(k) is not None:
                return True, "metadata.%s" % k
    return False, "no time field (tried pick_time, created, timestamp, updated_at)"


# ── THE WAIVER-BID PATH, and why this is a question rather than a lookup ────
#
# `history_export.py` reads a bid at `t["settings"]["waiver_bid"]`, gets null for
# every one of 648 waiver transactions across three seasons, and records a
# "NO-FAAB pivot (2026-08-08): this league has no bids".
#
# THE LEAGUE SETTINGS DISAGREE: waiver_budget 100, waiver_type 1, waiver_bid_min 0.
#
# Those cannot both be right, and the failure mode is SELF-CONFIRMING: a reader
# pointed at the wrong path gets null, and null reads as absence, and absence
# becomes a recorded fact about the league. That is this program's most-repeated
# defect wearing its most convincing disguise — a conclusion supported by data
# that was never consulted.
#
# So this does not decide it. It reports WHERE A BID ACTUALLY LIVES in a real
# response, and refuses to answer from a field that may never have been populated.

BID_PATHS = (("waiver_bid",), ("settings", "waiver_bid"), ("metadata", "waiver_bid"),
             ("settings", "bid"), ("waiver_budget",))


def bid_path(txn) -> tuple:
    """(path, value) for the first path that carries a bid, or (None, why).

    ABSENT IS NOT ZERO and it is not "no FAAB" either: a transaction with no bid
    anywhere means this transaction had no bid, which is a different claim from
    "this league does not use them".
    """
    if not isinstance(txn, dict):
        return None, "transaction is %s" % type(txn).__name__
    for path in BID_PATHS:
        cur = txn
        for k in path:
            cur = cur.get(k) if isinstance(cur, dict) else None
            if cur is None:
                break
        if cur is not None:
            return ".".join(path), cur
    return None, "no bid at any of: %s" % ", ".join(".".join(p) for p in BID_PATHS)


# ── F7 AT SCALE: two phases, because expansion and screening cost differently ──
#
# MEASURED in the first probe: 400 leagues examined cost 5,897 requests — roughly
# 14.7 each — because every examined league also fetched its users AND each user's
# league list. SCREENING a league costs ONE request. So a run that expands while it
# screens pays 14.7x for a number that needs 1x.
#
# Phase 1 EXPANDS until the discovered set is large enough. Phase 2 SCREENS from
# that set WITHOUT expanding. At 0.084s per request, 10,000 screens is ~14 minutes
# rather than ~3.4 hours.
#
# F7 NEEDS 200 MATCHED LEAGUE-SEASONS. At the measured 2.00% format rate that is
# ~10,000 leagues screened, which phase 2 reaches inside one job.

def draft_complete(lg) -> tuple:
    """F2's clause, on Sleeper's shape. `status` is the league's, not the draft's."""
    st = (lg or {}).get("status")
    if st is None:
        return None, "no status"
    # Sleeper: pre_draft / drafting / in_season / complete
    return (st in ("in_season", "complete")), st


def f7_verdict(matched: int, screened: int, discovered: int, target: int = 200) -> str:
    """F7's registered rule, applied to whatever this run actually reached.

    THE RULE IS UNCHANGED AND IS NOT BEING RELAXED: >=200 matched league-seasons, and
    a short sample REPORTS THE NUMBER AND CHANGES NOTHING. What changes is the pool it
    is asked of — MFL's was measured unreachable, and this asks the same question of a
    second source.
    """
    rate = (matched / screened) if screened else 0.0
    if matched >= target:
        return ("F7 MET ON SLEEPER: %d matched of %d screened (%.2f%%), from a discovered "
                "pool of %d. The pre-registered target of %d is reached. This says the "
                "FORMAT constraint that closed MFL does not close Sleeper; it does NOT by "
                "itself deliver a graded observation, which still needs F2, F4 and F5"
                % (matched, screened, 100 * rate, discovered, target))
    need = int(target / rate) if rate else None
    return ("F7 NOT YET MET IN THIS RUN: %d matched of %d screened (%.2f%%), discovered "
            "pool %d. Per the pre-registered rule a short sample REPORTS THE NUMBER AND "
            "CHANGES NOTHING. %s"
            % (matched, screened, 100 * rate, discovered,
               ("At this rate %d screens would reach %d — the pool holds %d, so the target "
                "is %s" % (need, target, discovered,
                           "REACHABLE" if need and need <= discovered else
                           "not reachable from the pool discovered so far"))
               if rate else "No matches, so no rate can be projected."))
