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
