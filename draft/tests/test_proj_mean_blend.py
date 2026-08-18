# TERRITORY: A
"""Tests for the blended-proj_mean study.

Every gate is TWO-ARMED — a fixture that must pass AND a fixture that must
fail — because a gate proven only on the passing side is a gate nobody has
shown can fire.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / "backtest"))
sys.path.insert(0, str(ROOT))

import proj_mean_blend as PMB  # noqa: E402

ARTIFACT = ROOT / "backtest" / "proj_mean_blend.json"
PREREG = ROOT / "backtest" / "PROJ-MEAN-BLEND-PREREG.md"


def _row(pid, pos="WR", base=100.0, fp=None, own=None, adp=50.0, exp=3, adj=0.0):
    return {"player_id": pid, "name": f"p{pid}", "position": pos, "years_exp": exp,
            "proj_baseline": base, "proj_fantasypros": fp, "proj_ownmodel": own,
            "raw_adp": adp, "adp": adp, "opportunity_adj": adj,
            "proj_mean": base * (1 + adj)}


# ── the preregistration exists and precedes the artifact ────────────────────

def test_preregistration_is_committed():
    assert PREREG.exists(), "the prereg is the licence for this study"
    text = PREREG.read_text()
    assert "AMENDMENT 1" in text, "Cory's coverage ruling must be recorded"
    for token in ("P1", "P2", "P3", "P4", "P5"):
        assert token in text, f"policy {token} must be preregistered, not invented later"


def test_the_bar_and_the_veto_are_stated_as_numbers():
    text = PREREG.read_text()
    assert "0.010" in text, "the per-year Spearman tolerance must be a number"
    assert "3.0" in text, "the rookie-bloc limit must be a number"
    assert PMB.ROOKIE_BLOC_LIMIT == 3.0
    assert PMB.YEAR_WEIGHT == {"2023": 0.5, "2024": 1.0, "2025": 1.0}


# ── §2 the constructibility gate, both arms ─────────────────────────────────

def test_gate_refuses_when_the_control_has_no_history():
    """The live arm. There is no Sleeper archive, so the gate MUST say so."""
    gate = PMB.constructibility_gate()
    assert gate["status"] == "no_control"
    assert gate["arms"]["sleeper"]["per_player_history"] is False
    assert gate["arms"]["own_v6"]["per_player_history"] is True, (
        "own_v6 IS constructible — if this ever goes False the gate is failing "
        "for the wrong reason and the refusal would be vacuous")


def test_gate_would_pass_if_the_archives_existed(tmp_path, monkeypatch):
    """The negative control. A gate that can only ever refuse proves nothing."""
    sl = tmp_path / "sleeper_projections_2023.json"
    fp = tmp_path / "fp_projections_2023.json"
    sl.write_text("{}")
    fp.write_text("{}")
    monkeypatch.setattr(PMB, "_sleeper_history_paths", lambda: [sl])
    monkeypatch.setattr(PMB, "_fp_history_paths", lambda: [fp])
    gate = PMB.constructibility_gate()
    assert gate["status"] == "constructible", (
        "with every archive present the gate must pass — otherwise the live "
        "refusal is an artifact of the instrument, not a fact about the data")


def test_gate_names_what_a_positive_would_have_looked_like():
    """SESSION-A 13g: an absence must state what presence would have shown."""
    arm = PMB.constructibility_gate()["arms"]["sleeper"]
    assert arm["what_a_positive_would_look_like"]
    assert arm["searched"], "a negative with no search list is an assertion"


# ── the Sleeper presence test must not be read off proj_sleeper ─────────────

def test_sleeper_is_read_from_proj_baseline_not_proj_sleeper():
    """build.py stamps proj_sleeper only inside the FantasyPros block, so
    reading it would undercount Sleeper by exactly FP's coverage gap."""
    p = _row("1", base=120.0, fp=None)
    p["proj_sleeper"] = None
    assert PMB.sources_of(p)["sleeper"] == 120.0


def test_adp_fallback_rows_are_not_counted_as_sleeper_covered():
    p = _row("1", pos="WR", adp=100.0)
    p["proj_baseline"] = round(PMB._rank_fallback_value(p), 2)
    assert PMB.sources_of(p)["sleeper_is_adp_fallback"] is True
    cens = PMB.coverage_census([p])["WR"]["veteran"]
    assert cens["sources_0"] == 1 and cens["sources_1"] == 0


# ── absent is never zero ────────────────────────────────────────────────────

def test_a_missing_source_is_never_averaged_as_zero():
    rows = [_row("1", base=100.0, fp=None, own=None)]
    off = PMB.level_offsets(rows)
    bi = PMB.measured_biases()
    for policy in PMB.POLICIES:
        got = PMB.policy_baselines(rows, policy, off, bi)
        assert got.get("1") in (None, 100.0), (
            f"{policy} moved a single-source row; a missing source was treated "
            "as a value")


def test_p2_refuses_rather_than_assuming_a_zero_offset():
    """No measured offset at this position -> keep Sleeper, never assume 0."""
    rows = [_row("1", pos="K", base=100.0, fp=90.0)]
    off = PMB.level_offsets(rows)          # K has 0 paired rows -> offset None
    assert off["K"]["fantasypros"]["offset"] is None
    assert PMB.policy_baselines(rows, "P2", off, PMB.measured_biases()) == {}


# ── the policies do what they say ───────────────────────────────────────────

def test_p1_blends_only_three_source_rows():
    rows = [_row("1", fp=90.0, own=80.0), _row("2", fp=90.0), _row("3")]
    got = PMB.policy_baselines(rows, "P1", PMB.level_offsets(rows), PMB.measured_biases())
    assert set(got) == {"1"}


def test_p3_blends_two_or_more():
    rows = [_row("1", fp=90.0, own=80.0), _row("2", fp=90.0), _row("3")]
    got = PMB.policy_baselines(rows, "P3", PMB.level_offsets(rows), PMB.measured_biases())
    assert set(got) == {"1", "2"}


def test_p5_is_an_exact_within_position_permutation():
    """The property Amendment 1 promised: the multiset of per-position values
    is preserved, so replacement level and the cross-position dollar scale
    cannot move."""
    rows = ([_row(str(i), pos="WR", base=200.0 - i, fp=100.0 + i,
                  own=(150.0 - i) if i % 2 else None, adp=i + 1)
             for i in range(60)])
    before = sorted(r["proj_baseline"] for r in rows)
    new = PMB._rank_space_baselines(rows)
    after = sorted(new.get(str(i), rows[i]["proj_baseline"]) for i in range(60))
    assert [round(x, 6) for x in before] == [round(x, 6) for x in after]


def test_p5_leaves_a_position_with_no_second_source_untouched():
    """K and DEF: no blend can reach them, so they must come out identical."""
    rows = [_row(str(i), pos="K", base=100.0 - i, adp=i + 1) for i in range(40)]
    assert PMB._rank_space_baselines(rows) == {}


def test_p5_quantile_transfer_beats_the_bare_subpopulation_percentile():
    """The bug found by measuring: a percentile taken inside a source's own
    coverage is a different ruler from one taken on the full position. The
    transfer must move a source-favoured player UP, and must not move a player
    no source covers except by displacement."""
    rows = [_row(str(i), pos="WR", base=200.0 - i, adp=i + 1) for i in range(60)]
    for i in range(30):                    # own covers only the top half
        rows[i]["proj_ownmodel"] = 100.0 + i        # and REVERSES their order
    new = PMB._rank_space_baselines(rows)
    assert new, "a source disagreeing with Sleeper must move somebody"
    # player 0 is Sleeper's best but own's worst among the covered -> must fall
    assert new["0"] < rows[0]["proj_baseline"]


# ── the veto fires, and can pass ────────────────────────────────────────────

def test_bloc_veto_fires_on_a_synthetic_bloc_shift():
    draftable = {"rookie": [40] * 20, "veteran": [-10] * 20}
    cut = PMB._draftable_cut(draftable)
    assert cut["would_have_passed"] is False


def test_bloc_veto_passes_when_nothing_moves_as_a_bloc():
    draftable = {"rookie": [1, -1, 0] * 7, "veteran": [1, -1, 0] * 7}
    cut = PMB._draftable_cut(draftable)
    assert cut["would_have_passed"] is True, (
        "a veto that cannot pass is not a veto, it is a refusal")


def test_the_draftable_cut_is_labelled_post_hoc():
    cut = PMB._draftable_cut({"rookie": [0] * 5, "veteran": [0] * 5})
    assert cut["status"] == "post_hoc_diagnostic_only"
    assert "never a second chance" in cut["cannot_rescue"]


# ── the artifact matches a regeneration, and says REFUSE ────────────────────

@pytest.mark.skipif(not ARTIFACT.exists(), reason="artifact not built")
def test_artifact_records_the_refusal_and_the_zero_rookie_coverage():
    doc = json.loads(ARTIFACT.read_text())
    assert doc["ship"]["decision"] == "REFUSE"
    assert doc["constructibility_gate"]["status"] == "no_control"
    # The census finding the audit leans on: own_v6 sees no rookie anywhere.
    for pos in ("QB", "RB", "WR", "TE"):
        cell = doc["coverage_census"][pos]["rookie"]
        assert cell["has_own"] == 0, f"{pos} rookies gained own_v6 coverage"
        assert cell["sources_3"] == 0, f"{pos} has a 3-source rookie"


@pytest.mark.skipif(not (ROOT.parent / "public" / "draft_data.json").exists(),
                    reason="no built board")
def test_p1_blends_no_rookie_yet_the_rookie_bloc_still_moves():
    """The cleanest evidence in the study, pinned so it cannot rot.

    P1 blends only rows carrying all three sources, and no rookie carries
    three — so P1 changes NO rookie's projection. The rookie bloc moves anyway,
    purely because veterans moved around them. Coverage artifact in pure form,
    with the football content held at exactly zero.

    Pin moved 2026-08-17: Cory's ruled rookie_capital_prior layer
    (league_config.rookie_capital_prior, his approval verbatim) now fills
    proj_ownmodel on 74 board rookies, each stamped proj_ownmodel_source ==
    "rookie_capital_prior_2026" — so those rookies GENUINELY carry a third
    source and P1 blends them (63 on the committed board; the other 11 lack a
    real Sleeper or FP value). Old pin: zero rookies blended. The original
    census claim survives exactly on the unstamped population: no rookie
    carries three sources FROM THE WALK-FORWARD MODEL ITSELF. NOTE FOR THE
    REGISTER: the study's §2 census and the rookie-bloc veto were measured on
    a board where P1 touched no rookie — when proj_mean_blend.json is next
    rebuilt, §2 must be re-read against the ruled layer, not assumed.
    """
    rows = PMB.board_rows()
    by_id = {str(p["player_id"]): p for p in rows}
    blended = PMB.policy_baselines(rows, "P1", PMB.level_offsets(rows),
                                   PMB.measured_biases())
    assert blended, "P1 must blend something or the test proves nothing"
    stamped = {str(p["player_id"]) for p in rows
               if p.get("proj_ownmodel_source") == "rookie_capital_prior_2026"}
    assert stamped, ("the ruled rookie-capital layer vanished from the board — "
                     "if that is deliberate, restore the old zero-rookie pin")
    rookie_blended = [pid for pid in blended if PMB.is_rookie(by_id[pid])]
    unstamped = [pid for pid in rookie_blended if pid not in stamped]
    assert not unstamped, (
        "a rookie gained three-source coverage OUTSIDE the ruled capital-prior "
        "layer — the census claim this whole audit rests on has changed and §2 "
        "must be re-read: %r" % unstamped[:5])
    assert rookie_blended, (
        "stamped rookies exist but P1 blends none of them — the third source "
        "stopped counting and the pin above would be vacuous")


@pytest.mark.skipif(not ARTIFACT.exists(), reason="artifact not built")
def test_every_policy_is_reported_and_none_silently_passes():
    doc = json.loads(ARTIFACT.read_text())
    assert set(doc["policies"]) == set(PMB.POLICIES)
    assert doc["ship"]["policies_passing_bloc_veto"] == [], (
        "if a policy starts passing the veto, this test must be re-read "
        "deliberately rather than updated reflexively")


@pytest.mark.skipif(not ARTIFACT.exists(), reason="artifact not built")
def test_mechanism_probe_reproduces_the_committed_own_v6_cells():
    doc = json.loads(ARTIFACT.read_text())
    repro = doc["mechanism_probe"]["reproduction_check"]
    assert repro["faithful"] is True, (
        "the probe rebuilds own_v6 outside its own module; an unfaithful "
        "rebuild would produce plausible numbers about a different model")


@pytest.mark.skipif(not ARTIFACT.exists(), reason="artifact not built")
def test_probe_cannot_license_the_ship():
    doc = json.loads(ARTIFACT.read_text())
    assert "does not grade the shipped blend" in doc["mechanism_probe"]["cannot_license_the_ship"]
    assert doc["ship"]["why"], "a refusal must carry its reason"


# ── Amendment 2: the position-weighted arm, and the leak rule ──────────────

def test_position_weighted_arm_is_dropped_not_fitted_on_itself():
    """Cory's (b): weights fitted on the season they grade are the answer key.

    AMENDED 2026-08-17. This used to assert `seasons_predictable_leak_free ==
    [2025]` — deliberately, so that a second gradeable season would FAIL here
    and force a re-evaluation instead of leaving A3 dropped behind a comment
    that had gone stale. It fired exactly as designed when
    nflverse_weekly_points_{2021,2022}.json were rebuilt offline, and the
    re-evaluation it demanded happened: see
    draft/backtest/POSITION-WEIGHT-TRANSFER-PREREG.md and
    draft/audit/position_weight_transfer_2026-08-17.md.

    So the assertion moves rather than relaxes. A3 is still DROPPED, but now for
    ONE reason (no per-player Sleeper/FP series) where there were two, and this
    test now pins BOTH halves of that: the reason that survived, and the fact
    that the leak-free season list grew.
    """
    a3 = PMB.constructibility_gate()["position_weighted_arm_A3"]
    assert a3["verdict"] == "DROPPED"
    assert a3["constructible"] is False, (
        "the surviving block is the per-player source history, which no store "
        "rebuild can supply")
    assert a3["dropped_for_reasons"] == ["no_per_player_source_history"], (
        "if this list ever changes, the why_dropped prose must change with it — "
        "the two must not be able to drift apart")
    assert 2025 in a3["seasons_predictable_leak_free"]
    assert len(a3["seasons_predictable_leak_free"]) >= 2, (
        "the 2021/2022 rebuild made a fit-on-one-season / grade-on-another "
        "weight constructible; a regression to a single season would mean a "
        "committed store went missing")
    assert a3["fit_seasons_available"] >= 1
    assert "DISSOLVED" in a3["why_dropped"], (
        "the prose must say which of the two original blocks is gone, or a "
        "reader inherits the stale two-reason story")


def test_cross_fit_weights_are_never_fitted_on_the_graded_player():
    """The weight applied to a player must come from the fold he is not in.
    Rigged fixture: arm A is ACCURATE on even ids and poor on odd ones, arm B
    the reverse, so the two folds MUST produce different weights. Deliberately
    not made exact — a zero MSE is a degenerate weight and is refused
    separately."""
    pids = [str(i) for i in range(40)]
    actual = {p: 100.0 + int(p) for p in pids}
    pred_a = {p: actual[p] + (2.0 if int(p) % 2 == 0 else 40.0) for p in pids}
    pred_b = {p: actual[p] + (40.0 if int(p) % 2 == 0 else 2.0) for p in pids}
    got = PMB._cross_fit_weighted(pred_a, pred_b, pids, actual)
    wa = got["weight_a_folds"]
    assert wa is not None and len(wa) == 2
    assert wa[0] != wa[1], (
        "identical fold weights mean the split is not doing anything and the "
        "cross-fit is decorative")


def test_cross_fit_refuses_a_thin_fold_rather_than_guessing():
    pids = ["2", "4", "6"]
    actual = {p: 10.0 for p in pids}
    got = PMB._cross_fit_weighted(dict.fromkeys(pids, 1.0),
                                  dict.fromkeys(pids, 2.0), pids, actual)
    assert got["rho"] is None and "thin" in got["why"]


@pytest.mark.skipif(not ARTIFACT.exists(), reason="artifact not built")
def test_weighted_probe_is_reported_beside_equal_weight():
    doc = json.loads(ARTIFACT.read_text())
    s = doc["mechanism_probe"]["summary"]
    for key in ("weighted_cells", "weighted_beat_equal",
                "weighted_beat_better_parent", "blend_beat_better_parent"):
        assert key in s, f"{key} must be reported, not summarised away"
    assert "not a season holdout" in s["weighting_note"].lower() or \
           "NOT a SEASON holdout" in s["weighting_note"], (
        "the player-vs-season holdout limitation must travel with the number")


# ── the proj_sleeper trap, found by the census and closed at the root ───────

def test_sleeper_column_is_not_gated_on_fantasypros():
    """RED BEFORE THE FIX: `proj_sleeper` was stamped only inside build.py's
    FantasyPros block, so a player FP missed lost his Sleeper number from every
    per-source surface — 77 rows on the shipped board, including Kenneth Walker
    at ADP 17, who rendered our own model alone under the raw-projection label.
    """
    import build

    board = [{"player_id": "1", "proj_baseline": 200.0},               # no FP
             {"player_id": "2", "proj_baseline": 150.0,
              "proj_sleeper": 150.0, "proj_fantasypros": 145.0}]       # already had it
    # THE RED ARM, made explicit rather than asserted in prose: the old rule
    # ("stamp only where FantasyPros also landed") leaves row 1 unstamped.
    old_rule = [p for p in board if p.get("proj_fantasypros") is not None]
    assert len(old_rule) == 1 and old_rule[0]["player_id"] == "2", (
        "the old rule stamped only FP-covered rows — this is the bug, reproduced")

    n = build.attach_sleeper_column(board, {"1": 200.0, "2": 150.0})
    assert n == 1
    assert board[0]["proj_sleeper"] == 200.0, (
        "a player FantasyPros misses must still carry his Sleeper number")
    assert board[1]["proj_sleeper"] == 150.0, "an existing stamp must not move"


def test_sleeper_column_refuses_the_adp_fallback_rows():
    """proj_baseline falls back to an ADP decay when Sleeper has no number.
    Stamping THAT as proj_sleeper would put a fabricated value under a source's
    name — the exact defect class this repo keeps finding."""
    import build

    board = [{"player_id": "9", "proj_baseline": 88.0}]     # not in `baseline`
    assert build.attach_sleeper_column(board, {}) == 0
    assert board[0].get("proj_sleeper") is None, "absent is not a guess"


# ── proj_mean is still Sleeper-only, and the provenance must not lie ────────

def test_proj_mean_composition_is_unchanged_on_the_board():
    """The strongest guard in this file: the study REFUSED, so nothing about
    the shipped board may have moved. If a later change lands the blend, this
    test must be updated in the same commit that changes the behaviour."""
    board = ROOT.parent / "public" / "draft_data.json"
    if not board.exists():
        pytest.skip("no built board")
    doc = json.loads(board.read_text())
    prov = (doc.get("provenance") or {}).get("projections") or {}
    assert prov.get("source") == "sleeper_projections"
    comp = prov.get("proj_mean_composition")
    if comp is not None:            # present from the next rebuild onward
        assert comp["blended"] is False
        assert comp["sources"] == ["sleeper"]


def test_provenance_separates_what_proj_mean_is_from_what_is_displayed():
    """`consensus_sources` said 2 while three columns attached, and its name
    reads equally as 'sources inside proj_mean' (1) and 'columns in the
    displayed consensus' (up to 3). A field answering two questions answers
    neither, so both are now stated separately."""
    src = (ROOT / "build.py").read_text()
    assert "proj_mean_composition" in src
    assert "display_consensus_sources" in src
    assert "by_position" in src, (
        "display coverage must be per position — the uniform number is the "
        "lie, because K/DEF are Sleeper-only and no rookie carries three")
