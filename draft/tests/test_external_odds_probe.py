# TERRITORY: C
""""WE ASKED AND GOT NOTHING" AND "THE PARAMETER WAS IGNORED" ARGUE OPPOSITE WAYS.

The as-of probe (runs 31458991195 / 31459812251) established that this class of
API accepts unknown parameters, ignores them, and returns 200: every date-bounding
candidate was accepted and every one was ignored. So an availability reading taken
without a control is not a negative result, it is an unmeasured one — and it would
retire a question Cory named the priority, on the strength of our own bad query.

These assertions are about that distinction surviving, and about a market
vocabulary we did not anticipate being reported rather than dropped.

Run: python3 -m pytest draft/tests/test_external_odds_probe.py -q
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import external_odds_probe as P  # noqa: E402

# ⚠ EVERY OUTCOME CARRIES A PRICE, because a real one does — and because an
# UNPRICED selection is genuinely indistinguishable from a market name by shape
# alone. My first fixture had a bare `{"name": "BUF"}`, which the walker read as
# a market and which then made the ignored-parameter control misfire. That is a
# known limit of the classifier, recorded in `market_keys`, not papered over: the
# probe's first real payload is what settles the provider's actual shape.
PROPS = {"bookmakers": [{"key": "DraftKings", "markets": [
    {"key": "player_pass_yds",
     "outcomes": [{"name": "Josh Allen", "point": 245.5, "price": -110}]},
    {"key": "totals", "outcomes": [{"name": "Over", "point": 44.5, "price": -110}]},
]}]}
DEFAULT_ONLY = {"bookmakers": [{"key": "DraftKings", "markets": [
    {"key": "ML", "outcomes": [{"name": "BUF", "price": -145}]},
    {"key": "spread", "outcomes": [{"name": "BUF", "point": -3.5, "price": -110}]},
]}]}


def test_AN_IGNORED_PARAMETER_VOIDS_THE_READING_rather_than_reading_as_absent():
    """THE WHOLE POINT. A nonsense `markets` value that returns the same board
    means the provider never read the parameter — so "no player props came back"
    is a fact about our query, not about the provider.

    MUTATION: compare only the real response against the family list and skip the
    control — a provider that ignores `markets` reports every family ABSENT, we
    conclude the pipe carries nothing, and a live evidence stream is retired on
    the strength of a request that could not have carried it."""
    h = P.parameter_was_honoured(DEFAULT_ONLY, DEFAULT_ONLY)
    assert h["honoured"] is False
    av = P.availability(P.classify(P.market_keys(DEFAULT_ONLY)), h)
    assert {v["state"] for v in av.values()} == {"unmeasured"}
    assert "VOID" in P.report(P.classify(P.market_keys(DEFAULT_ONLY)), h,
                              {}, P.ASK)["verdict"]


def test_a_HONOURED_PARAMETER_EARNS_THE_WORD_ABSENT():
    """The mirror. When the control comes back different, the provider does read
    the parameter, and an empty family is then a real negative — which is a
    result worth having: A stops planning around the pipe.

    MUTATION: return `unmeasured` regardless — a clean null can never be reached,
    the question stays open for ever, and we keep paying for a pipe nobody can
    rule out."""
    h = P.parameter_was_honoured(PROPS, DEFAULT_ONLY)
    assert h["honoured"] is True
    av = P.availability(P.classify(P.market_keys(PROPS)), h)
    assert av["player_props"]["state"] == "available"
    assert av["season_win_totals"]["state"] == "absent"


def test_a_MISSING_CALL_IS_UNANSWERED_not_dishonoured():
    """A failed request tells us nothing about the parameter. Reporting it as
    "not honoured" would look like a measured provider defect.

    MUTATION: treat a None response as proof the parameter was ignored — a
    transient 500 on the control call permanently records the provider as
    ignoring `markets`."""
    assert P.parameter_was_honoured(PROPS, None)["honoured"] is None
    assert P.parameter_was_honoured(None, PROPS)["honoured"] is None


def test_the_CONTROL_COMPARES_STRUCTURE_not_bytes():
    """Two calls for the same event differ in prices and timestamps between
    requests, so a byte comparison reports "different" every time and the control
    silently never fires — the failure the control exists to catch, reproduced
    inside the control.

    MUTATION: compare the serialised payloads — identical market sets with a
    moved line read as a honoured parameter, and every VOID run reports as
    measured."""
    moved = {"bookmakers": [{"key": "DraftKings", "markets": [
        {"key": "ML", "outcomes": [{"name": "BUF", "price": -155}]},
        {"key": "spread", "outcomes": [{"name": "BUF", "point": -4.5}]},
    ]}]}
    assert P.parameter_was_honoured(DEFAULT_ONLY, moved)["honoured"] is False


def test_a_MARKET_NAME_WE_DID_NOT_ANTICIPATE_IS_REPORTED_not_dropped():
    """A family list states what we went looking for. The keys matching nothing
    are the ones most likely to BE the thing we did not know to ask for, and this
    is a discovery tool — dropping them turns it into a confirmation tool.

    MUTATION: return only the matched families — the provider serves a market
    under a name nobody guessed, the probe reports a clean null, and we stop
    looking."""
    payload = {"bookmakers": [{"key": "DK", "markets": [
        {"key": "alt_qb_efficiency_rating"}, {"key": "ML"}]}]}
    c = P.classify(P.market_keys(payload), books=("DK",))
    assert "alt_qb_efficiency_rating" in c["unclassified"]
    assert c["unclassified_count"] == 1
    assert c["books_seen"] == ["DK"]


def test_MARKET_NAMES_ARE_FOUND_WHEREVER_THEY_SIT():
    """The response shape is not something to assume — a reader that only looks
    where it expects data reports absence for a payload that moved. Names live as
    dict KEYS at one level and as `key`/`name` VALUES at another.

    MUTATION: read one fixed path — a provider that nests markets differently
    reports zero markets, which is indistinguishable from a provider that serves
    none."""
    nested = {"data": {"event": {"offers": [
        {"market": "player_receptions"}, {"bet_type": "totals"}]}}}
    keys = P.market_keys(nested)
    assert "player_receptions" in keys and "totals" in keys


def test_the_ASKED_MARKETS_TRAVEL_WITH_THE_ANSWER():
    """The daily capture's `markets` parameter was never in the artifact, which is
    exactly why nobody could tell the question had not been asked. A recorded
    absence whose request is not recorded beside it cannot be re-read later.

    MUTATION: drop `asked_markets` — a year from now this file says the provider
    has no props and nothing says what we asked for."""
    r = P.report(P.classify(P.market_keys(PROPS)),
                 P.parameter_was_honoured(PROPS, DEFAULT_ONLY), {}, P.ASK,
                 event_id="e1", league="usa-nfl")
    assert "player_pass_yds" in r["asked_markets"]
    assert r["event_id"] == "e1" and r["league"] == "usa-nfl"


def test_FINDING_ONLY_WHAT_WE_ALREADY_CAPTURE_IS_A_NULL_not_a_hit():
    """`sides` is in the family list precisely so a run that finds only moneylines
    and spreads is VISIBLY the status quo. Counting it as a hit would report the
    probe as a success for confirming the thing that prompted it.

    MUTATION: count `sides` as actionable — the verdict reads ACTIONABLE on a run
    that found exactly what we have been capturing all along."""
    r = P.report(P.classify(P.market_keys(DEFAULT_ONLY)),
                 {"honoured": True, "note": "x"}, {}, P.ASK)
    assert r["verdict"].startswith("NULL")


def test_AN_UNKNOWN_CREDIT_COST_IS_NOT_FREE():
    """The decision this probe feeds is "is this affordable daily". A missing
    quota header means we do not know what it cost.

    MUTATION: default a missing header to 0 — an unmeasurable cost reads as free
    and a plan gets built on it."""
    c = P.credit_cost({"x-ratelimit-remaining": "480"}, {})
    assert c["spent"] is None and "UNKNOWN rather than free" in c["note"]
    c2 = P.credit_cost({"x-ratelimit-remaining": "480"},
                       {"x-ratelimit-remaining": "477"})
    assert c2["spent"] == 3 and c2["remaining"] == 477


def test_SCAFFOLDING_DOES_NOT_LAND_IN_THE_DISCOVERY_BUCKET():
    """`unclassified` is supposed to hold "a market we did not know to ask for".
    My first walker added every dict key with a structured value, so `bookmakers`,
    `markets` and the book's own name landed there beside the one real discovery
    — four entries where one was the finding. A bucket filled with scaffolding is
    unreadable, which is the same as dropping it.

    MUTATION: add every container key again — the discovery bucket fills with
    structure on every run and the one name that mattered is invisible in it."""
    payload = {"bookmakers": [{"key": "DK", "markets": [
        {"key": "alt_qb_efficiency_rating"}, {"key": "ML"}]}]}
    assert P.market_keys(payload) == ["DK", "ML", "alt_qb_efficiency_rating"]
    # The skeleton is still auditable, just not counted as markets.
    assert "bookmakers" in P.structure_keys(payload)
    assert "markets" in P.structure_keys(payload)


def test_A_PROVIDER_THAT_KEYS_MARKETS_BY_NAME_IS_STILL_DISCOVERED():
    """Not every API names markets in a `key` field — some make the market name
    the dict key itself. Ignoring container keys entirely would report a provider
    that serves props as serving nothing.

    MUTATION: read naming fields only — `{"markets": {"player_pass_yds": {...}}}`
    reports zero markets, and a pipe that carries exactly what we asked for is
    recorded as carrying nothing."""
    payload = {"markets": {"player_pass_yds": {"outcomes": [{"price": -110}]},
                           "spread": {"outcomes": [{"price": -110}]}}}
    keys = P.market_keys(payload)
    assert "player_pass_yds" in keys and "spread" in keys
    assert "markets" not in keys          # the scaffolding still does not count


def test_A_PLAYER_NAME_IS_A_SELECTION_not_a_market():
    """`{"name": "Josh Allen", "point": 245.5, "price": -110}` is the player on one
    side of a prop. Reading that as a market name would put every rostered player
    into the discovery bucket on every run — and would make the ignored-parameter
    control compare two rosters instead of two market sets.

    Decided from the node's own siblings rather than from a vocabulary, so a
    provider that calls the field `american` instead of `price` still has its
    selections recognised as selections.

    MUTATION: drop the price test — every player and team name becomes a market
    name, `unclassified` fills with the roster, and `player_props` reports
    AVAILABLE because "Josh Allen" happens to match nothing while some other name
    does."""
    assert "Josh Allen" not in P.market_keys(PROPS)
    assert "Josh Allen" in P.selection_names(PROPS)
    assert "player_pass_yds" in P.market_keys(PROPS)
    assert "BUF" not in P.market_keys(DEFAULT_ONLY)


# ── WHAT RUN 2 ACTUALLY RETURNED, AND WHY ITS VERDICT WAS UNEARNED ──────────

def test_AN_EVENT_WITH_NO_MARKETS_CANNOT_CONVICT_THE_PARAMETER():
    """RUN 2 (31772127983) RETURNED `VOID — the parameter was not read`, AND THAT
    VERDICT WAS NOT EARNED. The odds response carried NO market names at all —
    `real_keys: 2, control_keys: 2`, both of them `American Football` and
    `USA - NFL`, with even the `sides` family empty though the daily capture pulls
    ML and spread every day. The probe took `events[0]` of 136 listed for usa-nfl,
    i.e. an arbitrary game that may be months out and unpriced.

    Two empty responses are trivially identical, so the control fires and reports
    the parameter ignored NO MATTER WHAT THE PARAMETER DOES. That is the same
    defect the control exists to prevent, one level up: a conclusion about the
    provider drawn from a fact about our own request.

    MUTATION: compare the fingerprints without checking whether either carried a
    market — every unpriced event convicts the provider of ignoring `markets`, and
    the open question Cory named the priority gets closed by an empty game."""
    empty = {"sport": "American Football", "league": "USA - NFL"}
    h = P.parameter_was_honoured(empty, empty)
    assert h["honoured"] is None, h
    assert "nothing to compare" in h["note"] and "UNMEASURED" in h["note"]


def test_A_REAL_BOARD_STILL_CONVICTS_A_ONE_EYED_PARAMETER():
    """The guard above must not swallow the finding it was added beside. When the
    responses DO carry markets and they are identical, the parameter really is
    being ignored and the run really is VOID.

    MUTATION: return `None` whenever the two agree — the ignored-parameter finding
    becomes unreachable and the probe can never conclude anything."""
    h = P.parameter_was_honoured(DEFAULT_ONLY, DEFAULT_ONLY)
    assert h["honoured"] is False
    assert "IGNORED" in h["note"]


def test_THE_PROBE_PICKS_THE_NEAREST_EVENT_not_an_arbitrary_one():
    """Run 2 took `events[0]` of 136 listed for usa-nfl and got a payload with no
    markets at all. Lines are posted and traded in the days before kickoff — the
    same market-structure fact `market_filters` registers its horizon on — so an
    arbitrary event from a whole-season list is very likely unpriced, and an
    unpriced event answers nothing about what the provider serves.

    UNDATED EVENTS SORT LAST rather than being dropped: an event we cannot date is
    not "far away", and the probe should prefer a game it can reason about over
    one it cannot, without pretending the undated ones do not exist.

    MUTATION: take the first listed event — the probe asks about a game months out
    with no lines on it, gets an empty payload, and every verdict it draws is
    about that game rather than about the provider."""
    events = [{"id": "far", "date": "2026-12-28T18:00:00"},
              {"id": "soon", "date": "2026-08-15T00:20:00"},
              {"id": "undated"},
              {"id": "mid", "date": "2026-09-08T00:20:00"}]
    assert [e["id"] for e in P.nearest_first(events)] == ["soon", "mid", "far", "undated"]
    assert P.nearest_first([]) == []


def test_A_GAME_ALREADY_PLAYED_IS_NOT_THE_NEAREST_ONE():
    """RUN 3 PICKED A KICKOFF IN THE PAST. `nearest_first` sorted ascending with no
    sense of now, so on a 48-event preseason list it chose 2026-08-13T23:00Z — a
    game that had already started — and a finished game has no live board. The
    verdict that followed was about a played game, not about the provider.

    Future ascending first, then undated, then the past most-recent-first: a game
    that kicked off an hour ago may still carry a board, one from last month will
    not, and an undated event is not "far away" so it stays ahead of the corpses.

    MUTATION: sort by date alone — the oldest fixture in the list wins every time,
    which on any full-season slate means a game from weeks ago."""
    events = [{"id": "past", "date": "2026-08-10T00:00:00"},
              {"id": "far", "date": "2026-12-28T18:00:00"},
              {"id": "soon", "date": "2026-08-15T00:20:00"},
              {"id": "undated"},
              {"id": "justplayed", "date": "2026-08-13T23:00:00"}]
    got = [e["id"] for e in P.nearest_first(events, now="2026-08-14T05:30:00")]
    assert got == ["soon", "far", "undated", "justplayed", "past"], got


def test_A_PAYLOAD_WITH_NO_PRICES_IS_A_PAYLOAD_WITH_NO_BOARD():
    """RUN 3'S REFUSAL DID NOT FIRE, AND THE REASON IS MY OWN READER. The empty
    check asked whether ANY market name was found, and the response's `sport` and
    `league` names — `American Football`, `USA - NFL Preseason` — come through the
    naming fields. Two names, zero markets, and the payload read as non-empty.

    A real odds board always carries PRICED selections. That is the shape test, and
    it is the same one that separates a market from a player elsewhere in this file.

    MUTATION: test for any name at all — a response carrying nothing but the sport
    and league reads as a board, the refusal never fires, and the control convicts
    the parameter on an empty payload exactly as it did on runs 2 and 3."""
    names_only = {"sport": {"name": "American Football"},
                  "league": {"name": "USA - NFL Preseason"}}
    assert P.market_keys(names_only)          # names ARE found — that was the trap
    assert P.has_board(names_only) is False
    assert P.has_board(PROPS) is True
    assert P.has_board(DEFAULT_ONLY) is True
    assert P.has_board(None) is False


# ── THE REAL SHAPE, FROM RUN 4 — the fixture I could not have written before ─
#
# `raw_shape: [DraftKings, FanDuel, bookmakerIds, bookmakers, league, odds,
#  sport, urls]` and `selection_sample: [ML, Spread, Team Total Away,
#  Team Total Home, Totals]`. So this provider's MARKET names carry price fields
# as siblings, which my `priced` rule files as selections — and `market_keys`
# came back holding nothing but `American Football` and `USA - NFL Preseason`.
REAL_SHAPE = {
    "sport": {"name": "American Football"},
    "league": {"name": "USA - NFL Preseason"},
    "bookmakers": {"DraftKings": {"odds": [
        {"name": "ML", "price": -145, "team": "BUF"},
        {"name": "Spread", "price": -110, "point": -3.5},
        {"name": "Totals", "price": -110, "point": 44.5},
        {"name": "Team Total Home", "price": -115, "point": 21.5},
    ]}},
}
REAL_WITH_PROPS = json.loads(json.dumps(REAL_SHAPE))
REAL_WITH_PROPS["bookmakers"]["DraftKings"]["odds"].append(
    {"name": "player_pass_yds", "price": -110, "point": 245.5})


def test_THE_CONTROL_COMPARES_EVERY_NAME_THE_PAYLOAD_USES():
    """RUN 4 IS WHY. The three calls all fingerprinted to the same two strings —
    `American Football` and `USA - NFL Preseason` — because this provider's market
    names (`ML`, `Spread`, `Totals`, `Team Total Home`) carry prices as siblings
    and my classifier files priced nodes as selections. So the control compared
    two labels that cannot change and reported the parameter ignored for a third
    time, on a payload that plainly had a board in it.

    THE CONTROL IS A CHANGE DETECTOR, NOT A CLASSIFIER. Whether a string is
    "really" a market does not matter to the question it asks — did the response
    change when we asked for something different. It must therefore compare
    EVERY name the payload uses.

    MUTATION: fingerprint on the curated market list — the comparison runs over
    the sport and league labels, which are identical in every response this
    provider will ever send, and the probe can only ever return VOID."""
    a = P.all_names(REAL_SHAPE)
    assert "ML" in a and "Totals" in a and "Team Total Home" in a
    assert P.parameter_was_honoured(REAL_WITH_PROPS, REAL_SHAPE)["honoured"] is True
    assert P.parameter_was_honoured(REAL_SHAPE, REAL_SHAPE)["honoured"] is False


def test_THE_REAL_MARKETS_CLASSIFY_ONCE_THEY_ARE_LOOKED_AT():
    """`ML`, `Spread` and `Totals` are exactly the three the daily capture pulls,
    and reporting `sides: unmeasured, matched: []` for a payload containing all
    three was the visible symptom that the reader was looking in the wrong bucket.

    MUTATION: classify the curated list only — a board full of markets reports
    every family empty, and a real availability answer is unreachable."""
    c = P.classify(P.all_names(REAL_SHAPE), books=("DraftKings", "FanDuel"))
    assert "ML" in c["families"]["sides"] and "Spread" in c["families"]["sides"]
    assert "Totals" in c["families"]["game_totals"]
    av = P.availability(c, {"honoured": True, "note": "x"})
    assert av["sides"]["state"] == "available"
    assert av["player_props"]["state"] == "absent"


# ── THE FOLLOW-UP THE ANSWER FORCES ─────────────────────────────────────────
#
# Run 5 settled it: asking for props returned the SAME seven names as asking for
# `zzz_not_a_market_qqq`, on a payload carrying a real board (ML, Spread, Totals,
# Team Total Away/Home). The parameter is accepted and ignored, so props are NOT
# reachable by adding a query parameter to this endpoint. The next question is
# whether they live somewhere else — and it must be asked without inventing a
# provider that does not exist.

def test_A_PATH_THAT_DID_NOT_ANSWER_IS_NOT_A_PROVIDER_THAT_DOES_NOT_SERVE():
    """A 404 from a path WE made up is evidence about our guess, not about the
    provider — `market_request.build` already says exactly that, which is why it
    demands a reason for every discovery request. Recording an invented path's
    404 as "props do not exist" would close Cory's question with our own spelling.

    MUTATION: report a 404 as absent — three guessed URLs come back empty and the
    probe concludes the provider serves no props, having never asked it anything
    it understood."""
    d = P.discovery_report([{"path": "/v3/markets", "status": 404, "names": []},
                            {"path": "/v3/props", "status": 404, "names": []}])
    assert d["verdict"] == "no candidate path answered"
    assert d["proves_absence"] is False
    assert "about our guesses" in d["note"]


def test_A_PATH_THAT_ANSWERED_IS_REPORTED_WITH_WHAT_IT_SAID():
    """MUTATION: report only that something answered — the one path that works
    comes back as a bare 200 and the names it served are lost, so the next run
    has to spend credits rediscovering them."""
    d = P.discovery_report([{"path": "/v3/markets", "status": 404, "names": []},
                            {"path": "/v3/odds/markets", "status": 200,
                             "names": ["player_pass_yds", "ML"]}])
    assert d["verdict"] == "answered"
    assert d["answered"][0]["path"] == "/v3/odds/markets"
    assert "player_pass_yds" in d["answered"][0]["names"]
    assert d["proves_absence"] is False


def test_DISCOVERY_WITH_NOTHING_TRIED_IS_NOT_A_NULL():
    """MUTATION: return the same "nothing answered" verdict for an empty list —
    a run where the discovery step never executed is indistinguishable from one
    where every candidate failed, which is rule 13f exactly."""
    d = P.discovery_report([])
    assert d["verdict"] == "not attempted"
    assert d["proves_absence"] is False


def test_A_404_AND_A_403_ARE_DIFFERENT_ANSWERS_and_both_must_survive():
    """The discovery run reported `status: 0` for all four paths — my exception
    branch — so the artifact could not tell a 404 from a 403. They mean opposite
    things: 404 says the path does not exist, 403 says IT DOES AND WE CANNOT READ
    IT ON THIS TIER, which is a pricing decision for Cory rather than a dead end.

    MUTATION: keep only the status integer — a paid-tier endpoint that exists and
    answers 403 is filed identically to a URL we misspelled, and the one outcome
    worth escalating is indistinguishable from the three that are not."""
    d = P.discovery_report([
        {"path": "/v3/props", "status": 0, "error": "HTTPError: 403 Forbidden"},
        {"path": "/v3/markets", "status": 0, "error": "HTTPError: 404 Not Found"}])
    tried = {t["path"]: t for t in d["tried"]}
    assert "403" in tried["/v3/props"]["error"]
    assert "404" in tried["/v3/markets"]["error"]
    # AND A FORBIDDEN PATH IS CALLED OUT, because it is the one that changes what
    # anybody would do next.
    assert d["exists_but_forbidden"] == ["/v3/props"], d


# ── WHAT IS IN THE EVENTS WE DROP — A's first-priority question ──────────────
#
# `events_before_horizon: 48 -> 32` out of a 134-event catalogue. A wants to know
# what is in the 102 we never ask about, specifically whether any of it is
# regular season, because those weeks are unrecoverable once they pass.

EV = [
    {"id": "p1", "date": "2026-08-15T00:20:00"},   # +1 day
    {"id": "p2", "date": "2026-08-20T00:20:00"},   # +6 days   -> inside 7
    {"id": "p3", "date": "2026-08-24T00:20:00"},   # +10 days  -> inside 14 only
    {"id": "r1", "date": "2026-09-11T00:20:00"},   # +28 days  -> beyond both
    {"id": "r2", "date": "2026-12-28T18:00:00"},   # far
    {"id": "old", "date": "2026-08-01T00:00:00"},  # already played
    {"id": "u"},                                    # undated
]
NOW = "2026-08-14T06:00:00"


def test_THE_DROPPED_EVENTS_ARE_COUNTED_AND_DATED_not_just_subtracted():
    """`48 -> 32` says sixteen went and nothing about what they were. A cut slate
    and a small slate look identical in a difference, which is the same complaint
    `horizon_report` was written to fix one layer down — and it still cannot say
    whether the dropped games are the ones that matter.

    MUTATION: report the counts only — "102 dropped" stays a number nobody can
    act on, and whether the first regular-season weeks are inside it is unknown
    on the day it stops being recoverable."""
    c = P.events_census(EV, now=NOW, horizons=(7, 14))
    assert c["total"] == 7
    assert c["undated"] == 1 and c["already_started"] == 1
    assert c["upcoming"] == 5
    assert c["within"]["7"] == 2 and c["within"]["14"] == 3
    # THE DROPPED SET, DATED — the answer to "what is in the 102"
    assert c["beyond"]["14"]["n"] == 2
    assert c["beyond"]["14"]["first"] == "2026-09-11T00:20:00"
    assert c["beyond"]["14"]["last"] == "2026-12-28T18:00:00"


def test_WIDENING_THE_HORIZON_IS_PRICED_IN_EVENTS_not_argued():
    """The 7-vs-14 question is a real trade and it should be answered with the
    number of games each buys, not with a preference. This is the arithmetic A
    needs to set the registered filter.

    MUTATION: report one horizon — the choice between them goes back to being an
    argument, on a window whose first weeks cannot be recaptured."""
    c = P.events_census(EV, now=NOW, horizons=(7, 14))
    assert c["marginal"]["7->14"] == 1        # exactly one extra game bought


def test_AN_UNDATED_EVENT_IS_NOT_BEYOND_THE_HORIZON():
    """`KEEP_UNDATED` exists one file over for this reason: absent is not "far
    away". Filing undated events under "dropped" would make the horizon look more
    expensive than it is and hide a game we simply cannot date.

    MUTATION: bucket undated events with the far-future ones — every capture
    reports phantom attrition, and the one event we genuinely cannot place
    disappears into a count."""
    c = P.events_census(EV, now=NOW, horizons=(7,))
    assert c["undated"] == 1
    # p3 (+10d), r1 (+28d), r2 (far) are all beyond a 7-day cut — and the undated
    # one is in NEITHER bucket, which is the assertion that matters here.
    assert c["beyond"]["7"]["n"] == 3
    # ⚠ ASSERT ON THE LIST, NOT ON THE SERIALISED BLOB. My first version checked
    # `"u" not in json.dumps(...)` and matched the letter inside "ids_truncated",
    # which would have failed for a payload that was perfectly correct — a test
    # that fails for the wrong reason is as bad as one that passes for it.
    assert "u" not in c["beyond"]["7"]["ids"]


def test_AN_EMPTY_CATALOGUE_IS_UNMEASURED_not_a_clean_slate():
    """MUTATION: return zeroes — a listing call that failed reads as a league with
    no games, and the horizon looks like it is dropping nothing."""
    c = P.events_census([], now=NOW)
    assert c["status"] == "unmeasured"
    assert "no events" in c["note"]
