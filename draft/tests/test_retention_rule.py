"""The retention rule is enforced here, not just written down.

Cory, 2026-08-17: "Im getting frustrated of everyone just throwing things
away!!! we need to keep digging and searching. we dont just throw out vegas odds
or weekly routes because we havent seen a pattern yet, that is stupid and I need
every session to stop thinking like that."

The rule: no lane stops a capture job — only Cory does. A null grades the
WIRING, never the STORE. History cannot be backfilled, so KEEP is always the
default and every null ships with a re-test trigger.

This file exists because the relay wrote the OPPOSITE instruction twice on
2026-08-17 and it sat in session D's inbox as a live assignment ("wire it or
stop the job, not both open"). A doc that states a rule cannot catch a doc that
contradicts it. This can.

Every check below ships with a known-positive control proving it can fail —
the standard this project runs on, and the one the bad instruction slipped past.
"""

from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]

# Docs a session actually reads and takes instruction from.
LANE_FACING = [
    "OPERATING-MODEL.md",
    "DATA-LIFECYCLE.md",
    "DEFECT-REGISTER.md",
    "ROUTES.md",
    "SESSION-D.md",
]

LANES = ["A", "B", "C", "D", "E"]

# Imperative phrasings that tell someone to end a capture. The exact shapes the
# relay used, plus the near neighbours.
STOP_PHRASES = [
    "stop the job",
    "stop the weekly job",
    "stop the capture",
    "stop capturing",
    "disable the job",
    "disable the weekly",
    "kill the job",
    "drop the store",
    "delete the store",
]

# A paragraph that carries any of these is discussing the rule or correcting a
# past violation, not issuing the instruction. Paragraph scope is deliberate:
# a sentence-scoped guard false-positives on its own corrective text, which is
# a bug this project already shipped once (the void-instruction guard, 08-17).
CORRECTION_MARKERS = [
    "false binary",
    "got it wrong",
    "wrong version",
    "never",
    "not a lane decision",
    "only cory",
    "no lane",
    "do not stop",
    "does not stop",
    "keeps running",
    "nobody in any lane",
    "neither is a reason",
]


def paragraphs(text):
    return [p for p in text.split("\n\n") if p.strip()]


def offending_paragraphs(text):
    """Paragraphs that issue a stop instruction without framing it as wrong."""
    out = []
    for para in paragraphs(text):
        low = para.lower()
        if not any(phrase in low for phrase in STOP_PHRASES):
            continue
        if any(marker in low for marker in CORRECTION_MARKERS):
            continue
        out.append(para)
    return out


@pytest.mark.parametrize("name", LANE_FACING)
def test_no_lane_facing_doc_tells_anyone_to_stop_a_capture_job(name):
    path = ROOT / name
    assert path.exists(), f"{name} is missing"
    bad = offending_paragraphs(path.read_text())
    assert not bad, (
        f"{name} instructs a lane to stop a capture job.\n"
        "Only Cory decides that (OPERATING-MODEL.md Rule 3c). A null grades the\n"
        "wiring, never the store; history cannot be backfilled.\n\n"
        + "\n---\n".join(bad[:3])
    )


def test_the_guard_catches_the_exact_instruction_that_shipped():
    """Known-positive control: the real text that sat in D's inbox on 08-17."""
    shipped = (
        "**`routes_*` is captured weekly and reaches no prediction.** Decide: "
        "wire it (prereg first) or stop the weekly job. Not both open."
    )
    assert offending_paragraphs(shipped), (
        "The guard does not catch the instruction it was written for."
    )


def test_the_guard_does_not_fire_on_text_correcting_that_instruction():
    """Known-negative control: the corrective paragraph must survive."""
    corrective = (
        "This section exists because the relay got it wrong — it told session D "
        'to "wire routes_* or stop the weekly job, not both open." That is a '
        "false binary and it destroys the thing that makes the next study "
        "possible."
    )
    assert not offending_paragraphs(corrective), (
        "The guard false-positives on its own correction — the sentence-scoped bug again."
    )


def test_operating_model_carries_the_rule_and_names_the_only_approver():
    text = (ROOT / "OPERATING-MODEL.md").read_text()
    assert "RULE 3c" in text, "Rule 3c (no lane stops a capture job) is missing"
    low = text.lower()
    assert "only cory" in low, "Rule 3c must name Cory as the only approver"
    assert "backfill" in low, (
        "Rule 3c must state the asymmetry — history cannot be backfilled — "
        "because that is the reason, and a rule without its reason gets re-litigated"
    )


def test_shared_goals_include_capturing_through_a_null():
    text = (ROOT / "OPERATING-MODEL.md").read_text().lower()
    assert "the goals every lane shares" in text, "shared-goals section is missing"
    assert "keep capturing through a null" in text, (
        "the shared goals must carry retention — every lane signs up to it, not just D"
    )


def test_data_lifecycle_separates_capture_from_use():
    text = (ROOT / "DATA-LIFECYCLE.md").read_text().lower()
    assert "capture and use are two decisions" in text
    assert "a null is dated, not permanent" in text, (
        "nulls must carry a re-test trigger; an untriggered null is abandoned"
    )


@pytest.mark.parametrize("lane", LANES)
def test_every_lane_inbox_carries_the_standing_rule(lane):
    """The rule is Cory's for every session, so every inbox states it."""
    text = (ROOT / "ROUTES.md").read_text()
    heading = f"## TO: {lane}"
    assert heading in text, f"{heading} is missing from ROUTES.md"
    start = text.index(heading)
    later = [
        text.index(f"## TO: {other}")
        for other in LANES
        if other != lane and f"## TO: {other}" in text and text.index(f"## TO: {other}") > start
    ]
    section = text[start : min(later)] if later else text[start:]
    assert "YOU DO NOT STOP A CAPTURE JOB" in section, (
        f"lane {lane}'s inbox does not carry the retention rule — "
        "a standard only one lane is told is not a standard"
    )


def test_lane_section_slicing_can_fail():
    """Known-positive control for the slicing above.

    Without it, a rule present anywhere in ROUTES.md would satisfy every lane.
    """
    text = (ROOT / "ROUTES.md").read_text()
    start = text.index("## TO: D")
    later = [
        text.index(f"## TO: {o}")
        for o in LANES
        if o != "D" and f"## TO: {o}" in text and text.index(f"## TO: {o}") > start
    ]
    section = text[start : min(later)] if later else text[start:]
    assert len(section) < len(text), "the slice returned the whole file — it isolates nothing"
