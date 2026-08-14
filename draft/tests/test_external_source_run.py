# TERRITORY: C
"""A SOURCE THAT RETURNED NOTHING MUST NOT LOOK LIKE A DAY THAT WAS CAPTURED.

The first version of this runner lived as a heredoc inside
`.github/workflows/external-adp-capture.yml` and guessed at both providers' APIs:
`FP.fetch(year)` returns `(text, url, diag)` and it was passed straight to
`FP.parse` as html; FFC entries were keyed on `entry["player_id"]`, a field FFC
does not send. Neither guess RAISES — both produce an empty rows dict, the step
goes green, and the archive gains a dated row with no board behind it. Every day
after that, `days_missing_a_source` counts it as covered.

So these assertions are about the three outcomes being distinguishable: a board,
an empty fetch, and a failure. Only the first is ever written.

Run: python3 -m pytest draft/tests/test_external_source_run.py -q
"""
import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import external_source_capture as S  # noqa: E402
import external_source_run as R  # noqa: E402


def test_an_EMPTY_FETCH_IS_NOT_WRITTEN():
    """THE DEFECT THE HEREDOC HAD, ASSERTED. A wrong field name yields {} without
    raising, and a dated row with nothing in it is worse than an absent day —
    absence is visible in `days_missing_a_source`, an empty board is counted as
    covered for ever after.

    MUTATION: write the row anyway — the archive grows daily, the coverage report
    reads clean, and every source comparison is over zero shared players."""
    ser, verdicts = R.apply_results([], 2026, "2026-08-14",
                                    [R.result("ffc", rows={})])
    assert ser == []
    assert verdicts[0]["verdict"] == "empty"
    assert verdicts[0]["rows"] == 0


def test_ONE_SOURCE_FAILING_DOES_NOT_COST_THE_OTHER():
    """`build_adp_table` RAISES when its crosswalk cannot account for itself, and
    that refusal is correct — but it is a refusal about FFC. Letting it propagate
    would discard FantasyPros' board on the same unrefetchable day, and holding
    the alternatives separately is the entire purpose of this archive.

    MUTATION: abort the whole run on the first error — one provider's bad morning
    erases every source's record of that day, permanently."""
    ser, verdicts = R.apply_results(
        [], 2026, "2026-08-14",
        [R.result("ffc", error="RuntimeError: 3 of the top 100 did not match"),
         R.result("fantasypros", rows={"1": 12.0})])
    assert [v["verdict"] for v in verdicts] == ["failed", "recorded"]
    assert len(ser) == 1 and ser[0]["source"] == "fantasypros"
    assert "RuntimeError" in verdicts[0]["note"]


def test_a_FAILED_SOURCE_IS_NAMED_IN_THE_LOG_LINE():
    """A summary listing only what worked is how a source goes dark for a
    fortnight unnoticed — the failure `days_missing_a_source` exists to catch,
    reproduced one layer up in the line a human actually reads.

    MUTATION: join only the recorded sources — the log says `recorded ffc:215`
    every morning and never mentions that FantasyPros stopped arriving."""
    line = R.summary([{"source": "ffc", "verdict": "recorded", "rows": 215, "note": None},
                      {"source": "fantasypros", "verdict": "failed", "rows": 0,
                       "note": "URLError"}])
    assert "fantasypros" in line and "FAILED" in line
    assert "1/2" in line


def test_NOTHING_CAPTURED_SAYS_SO_rather_than_reading_as_success():
    """MUTATION: return the same 'recorded' phrasing with a zero count — a total
    outage reads as a successful run with an empty board."""
    line = R.summary([{"source": "ffc", "verdict": "failed", "rows": 0, "note": "x"}])
    assert "NO SOURCE CAPTURED" in line
    assert R.summary([]).startswith("NO SOURCE ATTEMPTED")


def test_a_NULL_PRICE_INSIDE_A_REAL_BOARD_DOES_NOT_MAKE_IT_EMPTY():
    """The refusal is about a board with NO prices, not about a board with a hole
    in it. Conflating them would throw away 700 real prices because one player
    was unpriced.

    MUTATION: refuse when ANY price is None — a single unpriced player discards
    the whole day."""
    ser, verdicts = R.apply_results([], 2026, "2026-08-14",
                                    [R.result("ffc", rows={"1": 12.0, "2": None})])
    assert verdicts[0]["verdict"] == "recorded" and verdicts[0]["rows"] == 1
    assert ser[0]["rows"] == {"1": 12.0}


# ── DEPTH: the number A's anchor item turns on ──────────────────────────────

def test_an_UNDECLARED_DEPTH_IS_UNKNOWN_NOT_ZERO():
    """A's ask names `total_drafts` because the anchor decision turns on sample
    depth. "The provider did not say" and "nobody drafted" are opposite readings
    of the same integer, and the second one argues for switching away from a
    source that might be the deepest we have.

    MUTATION: coerce a missing field to 0 — an unknown depth becomes evidence
    against the source, and the comparison silently prefers whichever provider
    happens to publish a count."""
    d = R.declared_depth({"status": "Success", "meta": {"teams": 10}})
    assert d["value"] is None
    assert "UNKNOWN, not" in d["note"]


def test_the_DEPTH_FIELD_IS_NAMED_so_a_renamed_field_is_visible():
    """MUTATION: return the number alone — the provider renames `total_drafts` to
    `drafts`, our candidate list still matches something else entirely, and
    nothing records which field the number came from."""
    d = R.declared_depth({"meta": {"total_drafts": 125, "teams": 10}})
    assert d["value"] == 125 and d["field"] == "total_drafts"
    top = R.declared_depth({"total_drafts": 7})
    assert top["value"] == 7 and top["field"] == "total_drafts"


def test_a_NON_NUMERIC_DEPTH_IS_REFUSED_not_silently_cast():
    """MUTATION: `int(v)` unguarded — a provider that starts sending "125 drafts"
    as a string with a word in it raises inside the capture step and costs the
    day, rather than recording the price board with an unreadable depth."""
    d = R.declared_depth({"meta": {"total_drafts": "many"}})
    assert d["value"] is None and d["field"] == "total_drafts"
    assert "not a number" in d["note"]


def test_the_DEPTH_SEARCH_DOES_NOT_INVENT_A_FIELD_ORDER_ADVANTAGE():
    """`sample_size` last, `total_drafts` first: if a payload carries both, the
    one that names drafts wins. Otherwise the archive's depth column would
    silently switch meaning the day a provider adds a second count.

    MUTATION: iterate the payload's keys instead of our declared list — the field
    that wins depends on dict ordering, which is the provider's to change."""
    d = R.declared_depth({"meta": {"sample_size": 9, "total_drafts": 125}})
    assert d["field"] == "total_drafts" and d["value"] == 125
    # AND ACROSS NESTING LEVELS TOO. Scope-major search made the winner depend on
    # where the provider nested the field rather than on what it means.
    d2 = R.declared_depth({"sample_size": 9, "meta": {"total_drafts": 125}})
    assert d2["field"] == "total_drafts" and d2["value"] == 125


def test_a_GENERIC_TOTAL_IS_NOT_READ_AS_A_DRAFT_COUNT():
    """`total` means "total drafts" and "total players" with equal ease, and a
    WRONG depth is worse than an unknown one: unknown is visible and argues for
    nothing, wrong silently decides the anchor. FFC's payload carries 700+ players
    on a hundred-odd drafts, so reading the wrong `total` would report the
    shallower source as the deeper one by a factor of six.

    MUTATION: put `total` back on the candidate list — a payload that declares a
    player count gets it recorded as sample depth."""
    d = R.declared_depth({"meta": {"total": 705, "teams": 10}})
    assert d["value"] is None and d["field"] is None


# ── THE FETCH FORMAT: derived once, and refused rather than defaulted ───────

def test_the_FFC_FORMAT_IS_THE_BOARDS_OWN_DERIVATION():
    """Cory's rule: values being compared must be derived from the same thing. The
    archived FFC price must be the price the board's anchor would have used, so
    the format segment comes from `build._ffc_format` — the ONE function that
    turns our `rec` into FFC's path — rather than a constant typed here.

    MUTATION: hardcode "half-ppr" — the league changes to full PPR, the board
    switches sources correctly, and this archive keeps recording half-PPR under a
    params block that still claims to describe our format."""
    assert R.ffc_format({"scoring": {"rec": 0.5}}) == "half-ppr"
    assert R.ffc_format({"scoring": {"rec": 1.0}}) == "ppr"
    assert R.ffc_format({"scoring": {"rec": 0.0}}) == "standard"


def test_an_UNKNOWN_FORMAT_IS_REFUSED_not_silently_defaulted():
    """`fetch_adp` does `FORMATS.get(fmt, "half-ppr")`, so a format string FFC
    does not know is not an error — it is silently replaced by half-PPR. My first
    version passed `"half_ppr"` with an UNDERSCORE, which is not a FORMATS key: it
    worked only because the default happened to be the answer, and the report
    would have recorded a format string the module does not recognise.

    MUTATION: return the value unchecked — a typo, or a rename upstream, fetches
    a different league format than `params` claims, and every comparison silently
    spans two scoring systems."""
    with pytest.raises(ValueError) as e:
        R.ffc_format({"scoring": {"rec": 0.5}}, derive=lambda cfg: "half_ppr")
    assert "half_ppr" in str(e.value)


def test_a_MISSING_CONFIG_IS_REFUSED_rather_than_assumed():
    """MUTATION: fall back to half-PPR when there is no scoring block — a build
    running against a missing or renamed config archives a format nobody chose,
    and it reads as a deliberate one."""
    with pytest.raises(ValueError):
        R.ffc_format({})
    with pytest.raises(ValueError):
        R.ffc_format({"scoring": {}})


def test_the_PARAMS_TRAVEL_WITH_THE_ROWS_through_apply():
    """MUTATION: drop `params` in apply_results — the fetch format never reaches
    the archive, and a year later nobody can tell whether the FFC column was our
    league size."""
    ser, _ = R.apply_results([], 2026, "2026-08-14",
                             [R.result("ffc", rows={"1": 12.0},
                                       params={"teams": 10, "total_drafts": 125},
                                       note="hi")])
    assert ser[0]["params"]["teams"] == 10
    assert ser[0]["params"]["total_drafts"] == 125
    assert ser[0]["note"] == "hi"


def test_the_PUBLISHED_SD_REACHES_THE_ARCHIVE_through_apply():
    """MUTATION: drop `sd` in apply_results — the runner collects FFC's published
    dispersion and the store never sees it, which looks identical to FFC not
    publishing one."""
    ser, _ = R.apply_results([], 2026, "2026-08-14",
                             [R.result("ffc", rows={"1": 12.0}, sd={"1": 6.5})])
    assert ser[0]["sd"] == {"1": 6.5} and ser[0]["sd_count"] == 1


def test_a_RERUN_REPLACES_the_days_rows_rather_than_doubling():
    """apply_results goes through the store's dedupe, so a retried workflow step
    cannot create two boards for one source-day.

    MUTATION: append to the series directly instead of via `append_day` — the
    retry doubles the day and every median over it is weighted toward whichever
    source retried."""
    ser, _ = R.apply_results([], 2026, "2026-08-14", [R.result("ffc", rows={"1": 12.0})])
    ser, _ = R.apply_results(ser, 2026, "2026-08-14", [R.result("ffc", rows={"1": 13.0})])
    assert len(ser) == 1 and ser[0]["rows"] == {"1": 13.0}


def test_the_TWO_SOURCES_LAND_ON_ONE_ID_SPACE():
    """THE CORRECTNESS REQUIREMENT CORY STATED: values being compared must be
    derived from the same thing. Both capture functions key on the pid returned by
    `draft/adp.py`'s crosswalk — the SAME one the board uses — so a shared key is
    the same player by construction rather than by coincidence.

    This asserts the property the runner depends on: the store compares sources on
    their shared KEYS, so two boards keyed differently would report a disagreement
    over an empty intersection and call it agreement.

    MUTATION: key one source by the provider's own name string — `shared` collapses
    to 0, `pairs` is empty, and the comparison reports nothing while looking
    exactly like a healthy day."""
    ser, _ = R.apply_results([], 2026, "2026-08-14", [
        R.result("ffc", rows={"4034": 12.0, "6786": 30.0}),
        R.result("fantasypros", rows={"4034": 27.0, "6786": 28.0}),
    ])
    d = S.disagreement(ser, 2026, "2026-08-14", {"4034": "QB", "6786": "WR"})
    assert d["status"] == "measured"
    pair = d["pairs"]["fantasypros->ffc"]     # sorted, so the sign is stable
    assert pair["shared"] == 2
    assert pair["by_position"]["QB"]["median"] == -15.0


# ── THE WIRING ITSELF, AGAINST A's REAL BUILDERS ────────────────────────────
#
# Everything above tests MY decisions. These two test the JOIN — and the join is
# where both original defects lived. Only the network calls are replaced; A's
# crosswalk, A's parser and A's accounting identities all run for real, so a
# renamed parameter or a changed return shape fails here rather than at 12:02 UTC
# on a day that cannot be refetched.

SLEEPER = {
    "4034": {"full_name": "Josh Allen", "position": "QB", "team": "BUF",
             "search_rank": 20},
    "6786": {"full_name": "Justin Jefferson", "position": "WR", "team": "MIN",
             "search_rank": 3},
    "4866": {"full_name": "Saquon Barkley", "position": "RB", "team": "PHI",
             "search_rank": 5},
}

FFC_PAYLOAD = {
    "status": "Success",
    "meta": {"type": "half-ppr", "teams": 10, "rounds": 15, "total_drafts": 125},
    "players": [
        {"name": "Justin Jefferson", "position": "WR", "team": "MIN", "adp": 3.4,
         "stdev": 2.1, "adp_rank": 1, "bye": 6},
        {"name": "Saquon Barkley", "position": "RB", "team": "PHI", "adp": 5.2,
         "stdev": 3.3, "adp_rank": 2, "bye": 9},
        {"name": "Josh Allen", "position": "QB", "team": "BUF", "adp": 27.0,
         "stdev": 8.4, "adp_rank": 3, "bye": 7},
    ],
}

FP_JSON = json.dumps({"players": [
    {"player_name": "Justin Jefferson", "player_position_id": "WR",
     "player_team_id": "MIN", "rank_ave": 4.1},
    {"player_name": "Saquon Barkley", "player_position_id": "RB",
     "player_team_id": "PHI", "rank_ave": 6.0},
    {"player_name": "Josh Allen", "player_position_id": "QB",
     "player_team_id": "BUF", "rank_ave": 42.0},
]})


def test_the_FFC_CAPTURE_JOINS_A_s_BUILDER_and_keys_on_OUR_ids(monkeypatch):
    """THE FIRST DEFECT, ASSERTED. The heredoc keyed FFC rows on
    `entry["player_id"]` — a field FFC does not send — so every row fell through
    to `entry["name"]`, and the archive would have held FantasyPros keyed one way
    and FFC keyed another. `disagreement` compares on shared keys, so the two
    boards would have shared NOTHING and reported perfect agreement over an empty
    intersection.

    MUTATION: key on the provider's own field again — `shared` collapses to zero
    and the archive looks healthy while comparing nothing."""
    import adp as A
    monkeypatch.setattr(A, "fetch_adp", lambda fmt, teams, year: FFC_PAYLOAD)
    r = R.capture_ffc(SLEEPER, 2026, 10, "half-ppr")
    assert set(r["rows"]) == {"4034", "6786", "4866"}, r["rows"]
    assert r["rows"]["4034"] == 27.0
    # THE DEPTH A's ITEM TURNS ON, off the real payload rather than a guess.
    assert r["params"]["total_drafts"] == 125
    assert r["params"]["total_drafts_field"] == "total_drafts"
    assert r["params"]["format"] == "half-ppr" and r["params"]["teams"] == 10
    # THE PROVIDER'S META, VERBATIM — so a depth field we did not anticipate is
    # still recoverable next August rather than discarded on the day.
    assert r["params"]["provider_meta"]["meta"]["rounds"] == 15
    assert r["params"]["parsed"] == 3 and r["params"]["matched"] == 3


def test_ONLY_FFC_s_PUBLISHED_SD_IS_ARCHIVED_not_our_own_clamp(monkeypatch):
    """`fitted_sd` returns the PUBLISHED number where FFC sent one and a value
    CLAMPED FROM THE MEAN where it did not, tagging each. Archiving the clamped
    one would store our arithmetic as the provider's opinion — indistinguishable,
    a year later, from a real measurement.

    MUTATION: archive every `adp_sd` regardless of `adp_sd_source` — the file
    grows a dispersion column that is 100% populated and partly our own guess."""
    import adp as A
    payload = json.loads(json.dumps(FFC_PAYLOAD))
    del payload["players"][2]["stdev"]                 # Allen: no published sd
    monkeypatch.setattr(A, "fetch_adp", lambda fmt, teams, year: payload)
    r = R.capture_ffc(SLEEPER, 2026, 10, "half-ppr")
    assert set(r["sd"]) == {"6786", "4866"}, r["sd"]
    assert "4034" not in r["sd"]
    assert r["params"]["published_sd_rows"] == 2


def test_the_FANTASYPROS_CAPTURE_UNPACKS_A_THREE_TUPLE(monkeypatch):
    """THE SECOND DEFECT, ASSERTED. `FP.fetch` returns `(text, url, diag)` and the
    heredoc passed the whole tuple into `FP.parse` as html. `parse` does
    `(html or "").strip()` on a tuple — AttributeError, caught by the step's
    blanket `except`, printed, and the day recorded nothing.

    MUTATION: hand `parse` the tuple — the source silently contributes zero rows
    every day and the step stays green."""
    import fantasypros_adp as FP
    monkeypatch.setattr(FP, "fetch",
                        lambda year, half_ppr=True, timeout=30: (FP_JSON, "u", {}))
    r = R.capture_fantasypros(SLEEPER, 2026)
    assert r["error"] is None
    assert set(r["rows"]) == {"4034", "6786", "4866"}, r["rows"]
    assert r["rows"]["4034"] == 42.0
    assert r["sd"] is None                             # FP publishes none
    assert r["params"]["total_drafts"] is None
    assert "not applicable rather than zero" in r["params"]["total_drafts_note"]


def test_a_THIN_FANTASYPROS_DAY_IS_STILL_RECORDED_but_a_dead_one_is_not(monkeypatch):
    """`min_rows` exists so a thin FP fetch can never DEGRADE the board below its
    FFC baseline — a statement about anchoring, not about archiving. A thin day is
    still what FantasyPros said on a day nobody can refetch.

    MUTATION: keep the anchor's `min_rows` — a day FP served 40 players is thrown
    away entirely, and the archive records nothing rather than recording that FP
    went thin, which is itself the finding."""
    import fantasypros_adp as FP
    one = json.dumps({"players": [{"player_name": "Josh Allen",
                                   "player_position_id": "QB",
                                   "player_team_id": "BUF", "rank_ave": 42.0}]})
    monkeypatch.setattr(FP, "fetch", lambda year, half_ppr=True, timeout=30: (one, "u", {}))
    thin = R.capture_fantasypros(SLEEPER, 2026)
    assert thin["rows"] == {"4034": 42.0}
    _, v = R.apply_results([], 2026, "2026-08-14", [thin])
    assert v[0]["verdict"] == "recorded"

    # AND A FETCH THAT RETURNED NOTHING IS REFUSED, through the same path.
    monkeypatch.setattr(FP, "fetch", lambda year, half_ppr=True, timeout=30: ("", "u", {}))
    dead = R.capture_fantasypros(SLEEPER, 2026)
    ser, v2 = R.apply_results([], 2026, "2026-08-14", [dead])
    assert v2[0]["verdict"] == "empty" and ser == []


def test_A_CROSSWALK_MISS_DOES_NOT_DISCARD_THE_DAY(monkeypatch):
    """`build_adp_table`'s `strict_top_n` gate REFUSES when a top-N player fails
    to crosswalk, because a BOARD built on a broken anchor is worse than no board.
    This is not building a board — and throwing away an unrefetchable observation
    over a nickname variant would destroy the evidence to protect a decision
    nobody is making here. The miss is not hidden: the counts travel in `params`.

    MUTATION: leave the anchor's `strict_top_n` in place — one unmatched name at
    the top of the board costs the whole day's record for every source."""
    import adp as A
    payload = json.loads(json.dumps(FFC_PAYLOAD))
    payload["players"].insert(0, {"name": "Nobody Atall", "position": "WR",
                                  "team": "XXX", "adp": 1.1, "adp_rank": 1})
    monkeypatch.setattr(A, "fetch_adp", lambda fmt, teams, year: payload)
    r = R.capture_ffc(SLEEPER, 2026, 10, "half-ppr")
    assert len(r["rows"]) == 3
    assert r["params"]["parsed"] == 4 and r["params"]["unmatched_count"] == 1


def test_the_ARCHIVE_DOES_NOT_CLAIM_A_FORMAT_MATCH_IT_DOES_NOT_HAVE(monkeypatch):
    """A's correction, 2026-08-14, and Cory caught it: `adp.py:67` — FFC publishes
    `standard`, `ppr`, `half-ppr`, `2qb`, `dynasty`. Every one is a RECEPTION or
    ROSTER-SHAPE axis. THERE IS NO PASSING-TD PARAMETER, so FFC is 4-point passing
    TDs exactly like FantasyPros, and "real human drafts at our exact settings"
    was false on the one rule that causes the entire measured gap.

    This is not a prose correction. `note` is written into EVERY ROW of the
    archive, every day, and read a year from now by someone who was not here —
    which is the whole reason the file exists. A false claim stored beside real
    numbers is worse than no claim: it is indistinguishable from a measurement.

    The limitation therefore TRAVELS WITH THE DATA rather than living in a doc
    that goes stale (rule 9: a mechanism implemented as a note).

    MUTATION: restore "our exact format" — the archive asserts a match on the one
    axis it does not have, and a reader concludes the QB gap must be something
    other than scoring."""
    import adp as A
    monkeypatch.setattr(A, "fetch_adp", lambda fmt, teams, year: FFC_PAYLOAD)
    r = R.capture_ffc(SLEEPER, 2026, 10, "half-ppr")
    assert "exact format" not in r["note"], r["note"]
    assert "passing TD" in r["note"]
    # NAMED AXES, NOT PROSE. What is matched and what is not, as data.
    assert r["params"]["format_axes_matched"] == ["reception scoring", "teams"]
    un = " ".join(r["params"]["format_axes_unmatched"])
    assert "passing TD" in un and "6.0" in un and "4.0" in un


def test_FANTASYPROS_CARRIES_THE_SAME_UNMATCHED_AXIS(monkeypatch):
    """Both sources are 4-point passing TDs, so the gap is STRUCTURAL: no public
    source prices our rule, and choosing between them cannot fix it. Recording the
    limitation on only one source would read as the other one being clean.

    MUTATION: name the axis on FFC alone — a reader comparing the two params
    blocks concludes FantasyPros matches our passing-TD value, which is the
    original error with the sources swapped."""
    import fantasypros_adp as FP
    monkeypatch.setattr(FP, "fetch",
                        lambda year, half_ppr=True, timeout=30: (FP_JSON, "u", {}))
    r = R.capture_fantasypros(SLEEPER, 2026)
    un = " ".join(r["params"]["format_axes_unmatched"])
    assert "passing TD" in un and "6.0" in un
    assert r["params"]["format_axes_matched"] == ["reception scoring"]
