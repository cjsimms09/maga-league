"""THE PROBE'S VERDICT LOGIC, TESTED WITHOUT EGRESS.

The fetch needs CI. The reasoning — what a 200 is worth, when a parameter did
nothing, what a null means — is pure, and it is the part that can be wrong in a
way that produces a plausible answer. A probe whose classifier is untested is
exactly the "returns a plausible number rather than the right one" failure rule 13
was written for.

Run: python3 -m pytest draft/tests/test_adp_asof_probe.py -q
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import adp_asof_probe as P  # noqa: E402


def _payload(total, ids):
    return {"adp": {"totalDrafts": str(total),
                    "player": [{"id": str(i), "averagePick": float(i)} for i in ids]}}


def _row(name, payload=None, status=200, **kw):
    r = {"name": name, "status": status,
         "composition": P.composition(payload) if payload else None}
    r.update(kw)
    return r


BASE = _row("baseline", _payload(5011, [1, 2, 3, 4, 5, 6]))
BASE["classification"] = "baseline"


# ── the verdict that a status code cannot give you ──────────────────────────
def test_a_200_with_the_SAME_composition_is_IGNORED_not_accepted():
    """THE CENTRAL CASE. A silently-ignored parameter returns a perfectly
    plausible payload with a 200. Reading the status would score it as working."""
    same = _row("days_7", _payload(5011, [1, 2, 3, 4, 5, 6]))
    assert P.classify(BASE, same) == "ignored"


def test_a_200_with_a_MOVED_composition_is_the_only_positive():
    fewer = _row("days_7", _payload(212, [1, 2, 3, 4, 5, 6]))
    assert P.classify(BASE, fewer) == "changed_composition"


def test_the_same_draft_count_with_a_DIFFERENT_ORDER_still_counts_as_moved():
    """Composition is not just a number. A window that returns the same count of
    drafts but a different board is a different observation."""
    reordered = _row("period_recent", _payload(5011, [9, 8, 7, 6, 5, 4]))
    assert P.classify(BASE, reordered) == "changed_composition"


def test_a_refusal_is_a_refusal_and_an_unreadable_body_is_not_a_pass():
    assert P.classify(BASE, _row("x", None, status=400)) == "refused"
    assert P.classify(BASE, _row("x", None, status=200)) == "unreadable"


# ── the controls decide what every other row is worth ───────────────────────
def test_a_SILENT_control_devalues_every_other_200_in_the_run():
    """If a known-bogus parameter is accepted and ignored, no candidate's 200
    means anything by itself, and the verdict has to say so."""
    rows = [BASE,
            _row("CONTROL_bogus_param", _payload(5011, [1, 2, 3, 4, 5, 6]),
                 classification="ignored"),
            _row("days_7", _payload(5011, [1, 2, 3, 4, 5, 6]), classification="ignored")]
    v = P.verdict(rows)
    assert "SILENTLY ACCEPTED" in v["controls"]
    assert "NO member of the recorded candidate set" in v["date_bounding"]


def test_a_REFUSED_control_means_a_refusal_elsewhere_carries_information():
    rows = [BASE,
            _row("CONTROL_bogus_param", None, status=400, classification="refused"),
            _row("days_7", _payload(212, [1, 2, 3]), classification="changed_composition")]
    v = P.verdict(rows)
    assert "validates its input" in v["controls"]
    assert "CANDIDATE FOUND" in v["date_bounding"]


def test_a_NULL_is_reported_as_a_fact_about_the_CANDIDATE_SET_not_the_provider():
    """Rule 13, stated in the artifact rather than remembered by the reader. And
    the set itself ships, so the null is extendable instead of final."""
    rows = [BASE, _row("days_7", _payload(5011, [1, 2, 3, 4, 5, 6]), classification="ignored")]
    v = P.verdict(rows)
    assert "statement about THIS SET, not about the provider" in v["date_bounding"]
    assert "days_7" in v["candidates_tried"]


def test_a_provider_that_ANSWERED_WITH_AN_ERROR_is_not_reported_as_unreachable():
    """THE DEFECT THIS SUITE MISSED THE FIRST TIME, and it cost a real answer.

    `urlopen` raises HTTPError on 4xx/5xx. The first cut caught it under a bare
    `except Exception` and filed it as a transport error, so a plain 404 was
    indistinguishable from a blocked network path — and the FFC arm reported
    "nothing was reached", which I then wrote up as "my path was probably wrong".
    The path was right. The error handling conflated two different nulls, which
    is the exact confusion rule 13 is about, one level down.
    """
    rows = [{"name": "baseline", "status": 404, "http_error": "404 Not Found"},
            {"name": "date", "status": 404, "http_error": "404 Not Found"}]
    v = P.verdict(rows)
    assert "REACHED BUT REFUSED" in v["verdict"]
    assert "404" in v["verdict"]
    assert "NO CONCLUSION" not in v["verdict"]


def test_reaching_NOTHING_scores_NOTHING():
    """A sandbox with no egress must not produce a negative finding. Every row a
    transport error means the run is about the network path."""
    rows = [{"name": "baseline", "status": None, "transport_error": "URLError: blocked"},
            {"name": "days_7", "status": None, "transport_error": "URLError: blocked"}]
    v = P.verdict(rows)
    assert "NO CONCLUSION" in v["verdict"]
    assert "not about the provider" in v["verdict"]


# ── does a year figure accumulate across its season? ────────────────────────
def test_a_complete_season_reporting_MORE_drafts_shows_the_aggregate_accumulates():
    """The F5 consequence: if the year number grows through the season, a finished
    season's ADP contains drafts LATER than an August league's draft, so it cannot
    be that league's pre-draft board."""
    a = P.aggregate_spans_the_season({"2025": {"total_drafts": 5011},
                                      "2026": {"total_drafts": 903}})
    assert a["answer"].startswith("YES")
    assert "violates F5" in a["detail"]
    assert "5011" in a["detail"] and "903" in a["detail"]


def test_it_refuses_to_conclude_when_a_year_is_unreadable():
    a = P.aggregate_spans_the_season({"2025": {"total_drafts": None},
                                      "2026": {"total_drafts": 903}})
    assert a["answer"].startswith("unknown")


def test_EQUAL_draft_counts_do_not_demonstrate_accumulation():
    """THE BOUNDARY, and it was untested until a rule-10a break found nothing to
    redden. `>` vs `>=` is the whole difference, and only equality separates them:
    two seasons reporting the same number of drafts is the case where the year
    figure demonstrably did NOT grow, and calling that accumulation would assert
    an F5 violation the data does not show. A break of `>` to `>=` reddens here
    and nowhere else."""
    a = P.aggregate_spans_the_season({"2025": {"total_drafts": 903},
                                      "2026": {"total_drafts": 903}})
    assert a["answer"].startswith("NOT DEMONSTRATED")


def test_it_does_not_claim_accumulation_when_the_comparison_does_not_show_it():
    a = P.aggregate_spans_the_season({"2025": {"total_drafts": 400},
                                      "2026": {"total_drafts": 903}})
    assert a["answer"].startswith("NOT DEMONSTRATED")


# ── composition parses what MFL actually returns ────────────────────────────
def test_composition_reads_totalDrafts_and_tolerates_the_singleton_player_dict():
    c = P.composition({"adp": {"totalDrafts": "5011",
                               "player": {"id": "13593", "averagePick": "1.5"}}})
    assert c["total_drafts"] == 5011 and c["players"] == 1


def test_an_absent_totalDrafts_is_None_never_zero():
    """Absent is not zero: a 0 here would read as 'we checked, no drafts'."""
    assert P.composition({"adp": {"player": []}})["total_drafts"] is None


def test_the_probe_sends_the_SHIPPED_user_agent():
    """FFC 403s Python's default User-Agent. `draft/adp.py` has fetched it in
    every build for weeks with its own header, so the probe reuses that string
    rather than inventing one — and this reads the literal out of adp.py so the
    two cannot silently drift into a second definition.

    The alternative was editing adp.py to export a constant; that file is not
    this lane's, so the coupling is enforced by a test instead of by a shared
    symbol."""
    src = (Path(__file__).resolve().parent.parent / "adp.py").read_text()
    shipped = re.search(r'"User-Agent":\s*"([^"]+)"', src)
    assert shipped, "adp.py no longer sets a User-Agent — the premise of this test is gone"
    assert P.USER_AGENT == shipped.group(1), (
        "probe sends %r, the shipped client sends %r" % (P.USER_AGENT, shipped.group(1)))
