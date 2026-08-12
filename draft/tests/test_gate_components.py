# TERRITORY: A
"""THE GATE'S COMPONENT PATH — broken on purpose, observed RED BY NAME.

RULE 10's BAR, not "the harness ran". Every assertion here breaks the thing the
gate is supposed to catch and checks that the gate reports THAT SPECIFIC ROW, at
the boundary rather than far past it.

WHY THE SELF-CHECK CASE IS THE IMPORTANT ONE. Before the season there is no
realized data, so every component row reads `no_data`. **An artifact of all
nulls from a working writer and one from a writer whose grading path is broken
look identical.** If the gate reported "all quiet" off a broken artifact it would
be the guards-that-do-not-guard failure with the season's entire evidence base
behind it. So a failed self-check must BLOCK, and that is asserted here.

AND THE UNITS ASSERTION IS A REQUIREMENT, NOT A DESCRIPTION. Cory's condition on
this build was that no dollar conversion be invented: MATERIAL_DOLLARS is $50,
component grades are points-per-player-week and Brier. The test asserts that
every component declares NO dollar conversion and says why, so a later change
that quietly adds one fails here rather than being discovered in a proposal.
"""
from __future__ import annotations

import importlib.util
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
GATE_PATH = ROOT / "draft" / "backtest" / "graduation_gate.py"


def _gate():
    spec = importlib.util.spec_from_file_location("graduation_gate", GATE_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _artifact(rows, self_ok=True, feed_error=None):
    return {
        "artifact": "component grades",
        "rows": rows,
        "declared": len(rows),
        "graded": len([r for r in rows if r.get("verdict") not in ("no_data",)]),
        "feed_error": feed_error,
        "self_check": {"ok": self_ok, "detail": "fixture"},
    }


def _with_artifact(tmp_path, monkeypatch, doc):
    g = _gate()
    p = tmp_path / "component_grades.json"
    p.write_text(json.dumps(doc))
    monkeypatch.setattr(g, "COMPONENTS", p)
    return g


# ── THE UNITS CONDITION ─────────────────────────────────────────────────────

def test_no_component_declares_a_dollar_conversion():
    """The condition this build was given: do not invent a units conversion."""
    g = _gate()
    assert g.COMPONENT_DOLLARS, "the map must exist, so an omission is visible"
    for name, conv in g.COMPONENT_DOLLARS.items():
        assert conv["dollars_per_unit"] is None, (
            f"{name} declares a dollar conversion. MATERIAL_DOLLARS is "
            f"${g.MATERIAL_DOLLARS} and component grades are points-per-"
            "player-week and Brier; a conversion here must be argued in the "
            "open, not added quietly.")
        assert conv["why"], f"{name} declares no conversion and no reason"
        # The reason must name the actual defect, not just say 'units differ'.
        assert "threshold-blind" in conv["why"], (
            f"{name}'s reason must name WHY no conversion is defensible — the "
            "only points->wins->payout machine is threshold-blind on our data")


def test_gate_output_carries_the_units_refusal_where_a_reader_will_see_it():
    g = _gate()
    out = g.run()
    assert "NO DOLLAR CONVERSION" in out["component_units_note"]
    assert out["component_source"].endswith("(own units, never dollars)")


# ── BROKEN ON PURPOSE, RED BY NAME ──────────────────────────────────────────

def test_a_hurting_component_blocks_when_undocumented(tmp_path, monkeypatch):
    """The direct analogue of the dollar path's PROPOSAL: the tool ships a thing
    measured to be harmful, and nobody has recorded a decision about it."""
    g = _with_artifact(tmp_path, monkeypatch, _artifact([
        {"name": "opportunity_adj", "verdict": "hurting", "n_obs": 400,
         "n_clusters": 14, "implication": "REMOVE IT.",
         "units": {"material": 1.0, "cluster_is": "week"}},
    ]))
    monkeypatch.setattr(g, "documented", lambda term: False)
    out = g.run()
    assert "opportunity_adj" in out["blocking"], (
        "a HURTING component that nobody has recorded a decision about must "
        "block — this is the row the whole surface exists to surface")
    row = [r for r in out["component_rows"] if r["term"] == "opportunity_adj"][0]
    assert row["status"] == "PROPOSAL"
    assert "REMOVE IT" in row["detail"], (
        "the proposal must carry the implication the SPEC declared in advance, "
        "not one written after the verdict")


def test_a_documented_hurting_component_does_not_block(tmp_path, monkeypatch):
    """A recorded human decision is a legitimate resolution — the same rule the
    dollar path already uses. Without this the gate would demand a code change
    for every considered exception."""
    g = _with_artifact(tmp_path, monkeypatch, _artifact([
        {"name": "opportunity_adj", "verdict": "hurting", "n_obs": 400,
         "implication": "REMOVE IT.", "units": {"material": 1.0}},
    ]))
    monkeypatch.setattr(g, "documented", lambda term: True)
    out = g.run()
    assert "opportunity_adj" not in out["blocking"]


def test_a_broken_grading_path_blocks_even_though_every_row_reads_no_data(
        tmp_path, monkeypatch):
    """THE CASE THAT MATTERS BEFORE WEEK 1.

    Identical null rows, self-check failed. A gate that reported this as a quiet
    pre-season would be reading a broken pipe as an absence of news.
    """
    rows = [{"name": "projection", "verdict": "no_data", "n_obs": 0,
             "awaiting": "weekly box scores", "units": {"material": 1.0}}]
    g = _with_artifact(tmp_path, monkeypatch, _artifact(rows, self_ok=False))
    monkeypatch.setattr(g, "documented", lambda term: False)
    out = g.run()
    assert any("self-check" in b for b in out["blocking"]), (
        "a failed self-check must block: all-null rows from a working writer and "
        "from a broken one are otherwise indistinguishable")

    # THE CONTROL — the same rows with a PASSING self-check must NOT block, or
    # the assertion above would pass for the wrong reason.
    g2 = _with_artifact(tmp_path, monkeypatch, _artifact(rows, self_ok=True))
    monkeypatch.setattr(g2, "documented", lambda term: False)
    assert not any("self-check" in b for b in g2.run()["blocking"])


def test_an_unreadable_artifact_blocks_rather_than_reading_as_empty(
        tmp_path, monkeypatch):
    g = _gate()
    p = tmp_path / "component_grades.json"
    p.write_text("{not json")
    monkeypatch.setattr(g, "COMPONENTS", p)
    out = g.run()
    assert any("unreadable" in b for b in out["blocking"])


def test_a_feed_error_blocks(tmp_path, monkeypatch):
    """An unreadable INPUT that silently became 'no data' would report a broken
    feed as a quiet season — the most expensive confusion this surface can make."""
    g = _with_artifact(tmp_path, monkeypatch, _artifact(
        [], feed_error="weekly_realized.json unreadable: boom"))
    out = g.run()
    assert any("feed" in b for b in out["blocking"])


# ── THE NON-VACUITY CONTROL ─────────────────────────────────────────────────

def test_an_absent_artifact_is_not_an_error_but_is_reported(tmp_path, monkeypatch):
    """Before the writer's first run there is nothing to read. That must be
    VISIBLE and must not block — but it must not be silent either, or 'nobody
    has run the writer' looks the same as 'the writer found nothing'."""
    g = _gate()
    monkeypatch.setattr(g, "COMPONENTS", tmp_path / "does_not_exist.json")
    out = g.run()
    assert out["component_rows"] == []
    assert any("absent" in p["what"] for p in out["component_problems"])
    assert not any(p.get("blocking") for p in out["component_problems"])


def test_verdicts_map_onto_the_gates_existing_vocabulary(tmp_path, monkeypatch):
    """Each component verdict lands on exactly one gate status, and `noise` is
    IMMATERIAL rather than a proposal — a term below its own declared bar is a
    free choice, which is the same treatment the dollar path gives."""
    rows = [
        {"name": "projection", "verdict": "earning", "units": {"material": 1.0}},
        {"name": "consensus", "verdict": "noise", "units": {"material": 1.0}},
        {"name": "survival", "verdict": "too_thin", "n_clusters": 3,
         "why": "3 clusters against a declared minimum of 20",
         "units": {"material": 0.02}},
    ]
    g = _with_artifact(tmp_path, monkeypatch, _artifact(rows))
    monkeypatch.setattr(g, "documented", lambda term: False)
    out = g.run()
    got = {r["term"]: r["status"] for r in out["component_rows"]}
    assert got == {"projection": "AGREES", "consensus": "IMMATERIAL",
                   "survival": "UNMEASURED"}
    assert not [b for b in out["blocking"] if b in got], (
        "none of earning/noise/too_thin is a proposal, so none may block")


# ── THE THIRD SOURCE: RULINGS ───────────────────────────────────────────────
#
# C's finding: the gate compares loaded weights against MEASUREMENTS and has no
# view of DECISIONS. `LAB-REGISTRY.md` recorded "stack stays at 1.0" while the
# engine shipped 0.5, and the gate classified that value IMMATERIAL and correctly
# did not block, because no measurement contradicted it. A stale ruling was
# invisible by construction.

def _doc(tmp_path, name, text):
    p = tmp_path / name
    p.write_text(text)
    return p


def test_a_ruling_that_contradicts_the_shipped_value_is_reported(tmp_path, monkeypatch):
    g = _gate()
    d = _doc(tmp_path, "RULES.md", "## D10 — STOOD DOWN: stack stays at 1.0\nbody\n")
    monkeypatch.setattr(g, "RULING_DOCS", ("RULES.md",))
    monkeypatch.setattr(g, "ROOT", tmp_path)
    rows = g.ruling_rows({"stack": 0.5})
    assert rows and rows[0]["term"] == "stack"
    assert rows[0]["ruling_value"] == 1.0 and rows[0]["loaded"] == 0.5
    assert rows[0]["agrees"] is False


def test_marking_the_HEADING_superseded_clears_the_whole_SECTION(tmp_path, monkeypatch):
    """THE BUG MY FIRST VERSION HAD, pinned so it cannot come back.

    A ruling is a SECTION, not a line. The first implementation skipped
    superseded LINES, so marking D10's heading left its BODY still firing --
    the marker cleared the sentence nobody was reading and not the one the scan
    actually matched.
    """
    g = _gate()
    _doc(tmp_path, "RULES.md",
         "## D10 — SUPERSEDED 2026-08-09\n"
         "Nothing installed. The stack weight remains 1.0.\n")
    monkeypatch.setattr(g, "RULING_DOCS", ("RULES.md",))
    monkeypatch.setattr(g, "ROOT", tmp_path)
    assert g.ruling_rows({"stack": 0.5}) == [], (
        "the body of a superseded ruling still fired -- marking the heading must "
        "resolve everything under it")


def test_the_supersession_ends_at_the_next_heading(tmp_path, monkeypatch):
    """A superseded section must not silence the rulings that FOLLOW it."""
    g = _gate()
    _doc(tmp_path, "RULES.md",
         "## D10 — SUPERSEDED\nThe stack weight remains 1.0.\n"
         "## D11 — LIVE\nrisk stays at 1.0\n")
    monkeypatch.setattr(g, "RULING_DOCS", ("RULES.md",))
    monkeypatch.setattr(g, "ROOT", tmp_path)
    rows = g.ruling_rows({"stack": 0.5, "risk": 0.0})
    assert [r["term"] for r in rows] == ["risk"], (
        "a superseded section swallowed the next ruling")


def test_rulings_never_block(tmp_path, monkeypatch):
    """A superseded ruling is LEGITIMATE. A blocking check would demand that
    history be rewritten to get CI green; what must change is visibility."""
    g = _gate()
    out = g.run()
    for b in out["blocking"]:
        assert "ruled" not in str(b), "a ruling mismatch must never block"
    assert "REPORTED, NEVER BLOCKING" in out["rulings_note"]


def test_the_real_repo_has_no_unmarked_stale_ruling():
    """The live check, on the real documents. Non-vacuous: it asserts the scan
    found something to check, so deleting every ruling would not make it pass."""
    g = _gate()
    out = g.run()
    assert out["ruling_rows"], (
        "no ruling in the doctrine docs names a weight and a value -- the scan "
        "has nothing to check and would pass trivially")
    assert not out["stale_rulings"], (
        "a recorded ruling disagrees with what ships and is not marked "
        "SUPERSEDED: " + "; ".join(out["stale_rulings"]))


def test_a_struck_through_ruling_is_history_not_a_live_ruling(tmp_path, monkeypatch):
    """This repo strikes a wrong claim rather than deleting it, so the shape of
    the error stays visible. A scan that read `~~stack stays at 0.5~~` as live
    would make it impossible to correct a document without either deleting the
    record or leaving the check permanently red -- and "delete the evidence to
    get CI green" is the exact pressure this file exists to resist.
    """
    g = _gate()
    _doc(tmp_path, "RULES.md", "## D10\n~~**Stack stays at 0.5**~~ corrected 2026-08-13\n")
    monkeypatch.setattr(g, "RULING_DOCS", ("RULES.md",))
    monkeypatch.setattr(g, "ROOT", tmp_path)
    assert g.ruling_rows({"stack": 1.0}) == []


def test_a_LIVE_ruling_beside_a_struck_one_still_fires(tmp_path, monkeypatch):
    """NON-VACUITY: the strikethrough rule must not silence its neighbours."""
    g = _gate()
    _doc(tmp_path, "RULES.md",
         "## D10\n~~stack stays at 0.5~~\nrisk stays at 1.0\n")
    monkeypatch.setattr(g, "RULING_DOCS", ("RULES.md",))
    monkeypatch.setattr(g, "ROOT", tmp_path)
    rows = g.ruling_rows({"stack": 1.0, "risk": 0.0})
    assert [r["term"] for r in rows] == ["risk"]
