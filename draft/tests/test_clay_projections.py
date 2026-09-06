# TERRITORY: C
"""Pins the real defects found writing clay_projections.py, against the
committed PDF (not a fixture) -- the bugs were all in PDF column geometry
and would not reproduce against invented text.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))

import clay_projections as C  # noqa: E402


def _doc():
    C.main(write=False)
    return json.loads(C.OUT.read_text())


def _players():
    return {p["clay_name"]: p for p in _doc()["players"].values()}


def test_known_positive_scoring_qb():
    # 3946*0.04 + 26*6.0 + 12*(-2.0) + 580*0.1 + 12*6.0 = 419.84, verified by
    # hand against the raw text, not just re-run against itself.
    p = _players()["Josh Allen"]
    assert p["proj_clay_scored"] == 419.84
    assert p["team_clay"] == "BUF"


def test_known_positive_scoring_wr():
    # 123*0.5 + 1590*0.1 + 10*6.0 + 106*0.1 + 1*6.0 = 297.1
    p = _players()["Puka Nacua"]
    assert p["proj_clay_scored"] == 297.1


def test_team_field_is_text_not_a_failed_float_cast():
    # First version called to_float() on every column including "team",
    # which silently turned every team code into None -- caught by reading
    # the output, not by a test, which is why this one exists now.
    for p in _players().values():
        if p["team_clay"] is not None:
            assert not p["team_clay"].replace(".", "").isdigit(), p


def test_known_positive_control_catches_real_corruption():
    # FAIL ARM (rule 3f): the control this module runs on every invocation
    # must actually be capable of failing, not just capable of passing.
    cfg = C.YEAR_CONFIG[2026]
    lines = C.source_text(cfg).split("\n")
    corrupted = [l.replace("283", "999") if "Jahmyr Gibbs" in l and " DI " in l else l
                 for l in lines]
    try:
        C._verify_known_positive(corrupted, cfg["gibbs_expect"])
        raised = False
    except SystemExit:
        raised = True
    assert raised, "the known-positive control did not fire on injected corruption"
    # and the real, uncorrupted text must still pass
    C._verify_known_positive(lines, cfg["gibbs_expect"])


def test_no_positional_plausibility_violations():
    doc = _doc()
    assert doc["positional_plausibility_violations"] == []


def test_every_qb_carries_pass_yards_every_skill_row_does_not():
    for p in _players().values():
        stats = p["raw_stats"]
        # raw_stats keeps the source's own field names (p_yds), not our
        # scoring vocabulary -- this checks the INPUT is positionally sane,
        # a different sweep from the scored-stats check above.
        if p["position"] == "QB":
            assert stats.get("p_yds", 0) > 0, p
        else:
            assert "p_yds" not in stats, p


def test_coverage_matches_the_known_page_counts():
    doc = _doc()
    # QB 40, RB 111 (3 pages), WR 187 (5 pages), TE 80 (2 pages) -- counted
    # directly against the PDF's own page-labelled sections before trusting
    # the parser, not assumed from the parser's own output.
    assert doc["coverage"]["by_position"] == {"QB": 40, "RB": 111, "WR": 187, "TE": 80}
    assert doc["coverage"]["kickers"] == 32


def test_matched_to_board_floor():
    """⚠️ THE NAME SAYS FLOOR, THE COMMENT SAID FLOOR, AND THE CODE PINNED AN
    EQUALITY — `assert coverage["matched_to_board"] == 380` (A, 2026-08-31,
    register 433's board-publish sweep, editing C's file; see the routed note).

    `_doc()` calls `C.main()`, which rebuilds this store against the LIVE
    `public/draft_data.json`. So the number is a property of whichever board is
    on disk, and the nightly rebuild grades it against a FRESHLY BUILT one. An
    equality pin therefore refuses a correct board for being NEW — and it did:
    this test is on the acceptance gate's refusal list on every scheduled
    rebuild since 2026-08-27, and the published board has not moved since 08-26.

    What is asserted instead is what the crosswalk can actually promise without
    knowing tonight's board: the coverage block is INTERNALLY CONSISTENT (which
    is board-independent and catches a miscount outright), and the match RATE
    clears a floor. Measured on the committed store 2026-08-31: 380/418 =
    0.9091, so 0.85 leaves real room for board churn while a genuine crosswalk
    regression — the nickname fallback breaking, a column shifting — drops the
    rate far further than churn can.
    """
    doc = _doc()
    cov = doc["coverage"]
    matched = sum(1 for p in doc["players"].values() if p["matched_board"])
    total = len(doc["players"])
    assert cov["matched_to_board"] == matched, (
        "the coverage block disagrees with the rows it summarises — a miscount, "
        f"not board churn: {cov['matched_to_board']} vs {matched} matched rows")
    assert cov["matched_to_board"] + cov["unmatched_total"] == total, (
        "matched + unmatched must partition the store exactly")
    rate = matched / total
    assert rate >= 0.85, (
        f"only {matched}/{total} = {rate:.4f} of Clay's rows reach a board "
        "player. 0.9091 was measured 2026-08-31; a drop past 0.85 is a broken "
        "crosswalk (the Ken Walker / Cam Ward nickname fallback, or a shifted "
        "PDF column), not a rebuilt board.")


def test_no_two_clay_rows_collide_on_the_same_board_player():
    doc = _doc()
    seen = {}
    for pid, p in doc["players"].items():
        if not p["matched_board"]:
            continue
        prior = seen.get(pid)
        assert prior is None, f"{pid} claimed by both {prior!r} and {p['clay_name']!r}"
        seen[pid] = p["clay_name"]


def test_keeper_kenneth_walker_matches_via_local_override():
    p = _players()["Ken Walker III"]
    assert p["matched_board"] is True
    assert p["name"] == "Kenneth Walker"


def test_kickers_carry_raw_counts_but_are_never_scored():
    doc = _doc()
    assert len(doc["kickers"]) == 32
    for k in doc["kickers"].values():
        assert k["proj_clay_scored"] is None
        assert k["raw_stats"]["fgm"] is not None
        assert "not_scored_reason" in k


def test_zero_def_rows_the_gap_is_documented_not_silent():
    doc = _doc()
    assert all(p["position"] != "DEF" for p in doc["players"].values())
    assert "DEFENSE" in doc["_note"] or "DEF" in doc["_note"]


def test_writes_no_board_field():
    before = Path(C.BOARD).read_bytes()
    C.main(write=False)
    after = Path(C.BOARD).read_bytes()
    assert before == after, "clay_projections.py must never modify public/draft_data.json"


def test_reasonable_agreement_with_sleeper():
    # Not a tight bound -- an independent source SHOULD differ from Sleeper.
    # This only catches a scoring/join catastrophe (rho near 0 or negative).
    doc = _doc()
    rho = doc["agreement_vs_sleeper_spearman"]["spearman"]
    n = doc["agreement_vs_sleeper_spearman"]["n"]
    assert n > 300, "matched population collapsed"
    assert rho > 0.8, f"agreement with Sleeper is implausibly low: {rho}"
