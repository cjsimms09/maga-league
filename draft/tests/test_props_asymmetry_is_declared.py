# TERRITORY: D
"""A GRADED PROPS-VS-V6 COMPARISON MAY NOT SHIP WITHOUT ITS ASYMMETRY STATEMENT.

DEFECT GUARDED: a right number quoted without the caveat that makes it readable.

The first real grade of the paid props data (2026-08-17) returned Spearman
0.93-0.97 against own_v6's 0.66-0.74. That is not projection skill. The arm sums
prop lines from all 18 weeks of the season, so a week-17 line is set knowing
everything through week 16, and a player who was injured in week 3 simply has no
rows afterwards. It is a measure of an in-season market watching a season, and
own_v6 is a preseason forecast — the comparison is structurally unfair in props'
favour, by construction.

The module's author knew this and preregistered it: the artifact carries an
`in_season_information_asymmetry` field saying a props win answers "how much is
on the table given in-season market access", not "should the preseason board
switch to this".

So the risk is not a wrong number. It is "props beat own_v6 by +0.31 Spearman" —
true, catastrophically misleading, and exactly the shape of sentence this repo
keeps finding in its own files. A test cannot stop a human quoting it; it CAN
stop the artifact shipping without the sentence that makes it readable.

draft/audit/props_first_grade_2026-08-17.md

Run: python -m pytest draft/tests/test_props_asymmetry_is_declared.py -q
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARTIFACT = ROOT / "draft" / "backtest" / "props_season_projection_2025.json"

ASYMMETRY_KEY = "in_season_information_asymmetry"
#: The statement has to name the mechanism, not merely exist. These are the
#: load-bearing words: WHAT the props see that own_v6 cannot.
REQUIRED_TERMS = ("in-season", "own_v6")


def carries_a_graded_comparison(doc: dict) -> bool:
    """True when the artifact reports a real props-vs-v6 head-to-head, rather
    than a refusal or a fixture run."""
    if doc.get("status") != "graded":
        return False
    arm = doc.get("arm_2025") or {}
    return bool(arm.get("head_to_head_shared_population"))


def missing_declaration(doc: dict) -> list[str]:
    """Why this document's comparison is unreadable as published, if it is."""
    if not carries_a_graded_comparison(doc):
        return []
    stated = doc.get(ASYMMETRY_KEY)
    if not isinstance(stated, str) or not stated.strip():
        return [f"{ASYMMETRY_KEY} is absent or empty"]
    low = stated.lower()
    return [f"the statement does not mention {t!r}"
            for t in REQUIRED_TERMS if t.lower() not in low]


def test_the_committed_artifact_declares_the_asymmetry():
    """The live check. If the artifact grades props against own_v6, it must say
    in the same file what props could see that own_v6 could not."""
    doc = json.loads(ARTIFACT.read_text())
    if not carries_a_graded_comparison(doc):
        # A refusal artifact (pending data) has nothing to caveat. That state is
        # covered by test_refusal_artifacts_are_not_stale.py instead.
        return
    bad = missing_declaration(doc)
    assert not bad, (
        "the props artifact reports a graded comparison against own_v6 without a "
        f"readable asymmetry statement: {bad}. The Spearman figures (0.93-0.97 vs "
        "own_v6's 0.66-0.74) are an in-season-information artifact, not projection "
        "skill — props sum lines from all 18 weeks, so they see injuries and role "
        "changes a preseason forecast cannot. See "
        "draft/audit/props_first_grade_2026-08-17.md")


def test_KNOWN_POSITIVE_a_stripped_declaration_is_detected():
    """CONTROL. The assertion above is "nothing is missing", which passes
    perfectly on a checker that never looks — a renamed status, a moved key, a
    changed artifact shape. So feed it the real document with the statement
    removed, and with the statement present but gutted, and require both to be
    caught.
    """
    doc = json.loads(ARTIFACT.read_text())
    if not carries_a_graded_comparison(doc):
        # The control must still prove the detector works, so synthesise the
        # graded shape rather than skipping.
        doc = dict(doc, status="graded",
                   arm_2025={"head_to_head_shared_population": {"QB": {"n": 1}}},
                   **{ASYMMETRY_KEY: "props see in-season information own_v6 cannot"})

    assert missing_declaration(doc) == [], "the real artifact should be clean"

    stripped = {k: v for k, v in doc.items() if k != ASYMMETRY_KEY}
    assert missing_declaration(stripped), "a removed statement was not detected"

    gutted = dict(doc, **{ASYMMETRY_KEY: "see the docs"})
    assert missing_declaration(gutted), (
        "a statement that names neither the mechanism nor own_v6 was accepted — "
        "the check is satisfied by any non-empty string, which is decoration")
