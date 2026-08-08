"""ATTRIBUTION WORDING — a causal claim the design cannot support must not ship.

Experiment 37 grades the live season's dollars per component against a MODELLED
counterfactual with no control arm (randomised compliance declined for 2026 —
`DECISIONS-NEEDED.md` D12). Its numbers are associational, and no sample size
changes that: with Cory's own past behavior as the baseline, a good outcome is
equally consistent with "the tool helped" and "the tool agreed with what a
competent manager would have done anyway".

So the January report may say

    "$X was realised on decisions where the tool recommended Y"

and may not say

    "the tool earned $X"

A wording rule that lives only in a spec drifts by January, which is exactly
when it matters and nobody rereads the spec. This test is the rail: it scans
generated report artifacts for the banned form and fails the build.

It is deliberately written BEFORE the report generator exists. Right now it
guards the reports we do have and proves it can bite; when 37's generator lands
its output goes in ARTIFACTS and inherits the rule for free.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent

# Report artifacts subject to the rule. Missing files are skipped, not failed —
# most of these arrive with the season.
ARTIFACTS = [
    "draft/backtest/LAB-REPORT.md",
    "draft/backtest/PLAYOFF-MONEY-VALIDATION.md",
    "draft/backtest/HETEROGENEOUS-VALIDATION.md",
    "draft/backtest/CORY-CONDITIONAL.md",
    "draft/data/in-season-attribution.md",      # exp 37's January deliverable
    "draft/data/weekly-brief.md",
]

# The banned shape: an agent (the tool / the system / the optimizer / a doctrine)
# directly EARNING or MAKING or WINNING money. Deliberately narrow — this must
# catch the causal overclaim without flagging ordinary reporting of dollars.
BANNED = [
    re.compile(r"\bthe (tool|system|model|optimi[sz]er|engine|doctrine)\b[^.\n]{0,40}"
               r"\b(earned|made|won|generated|produced|delivered)\b[^.\n]{0,20}\$", re.I),
    re.compile(r"\b(tool|system|model)\b[^.\n]{0,30}\bcaused\b", re.I),
    re.compile(r"\$[\d,]+[^.\n]{0,30}\b(thanks to|because of) the (tool|system|model)\b", re.I),
]

PERMITTED_HINT = ('use: "$X was realised on decisions where the tool recommended Y"')


def _artifacts():
    return [(p, (ROOT / p)) for p in ARTIFACTS if (ROOT / p).exists()]


def test_no_report_artifact_makes_a_causal_attribution_claim():
    offences = []
    for name, path in _artifacts():
        for lineno, line in enumerate(path.read_text().splitlines(), start=1):
            for pat in BANNED:
                if pat.search(line):
                    offences.append(f"{name}:{lineno}: {line.strip()[:120]}")
    assert not offences, (
        "causal attribution wording found in a report artifact — "
        + PERMITTED_HINT + "\n  " + "\n  ".join(offences)
    )


def test_the_rule_actually_bites():
    """A guard that cannot fail is decoration. Prove each pattern catches the
    overclaim AND leaves honest reporting of the same dollars alone."""
    caught = [
        "In 2026 the tool earned $412 across lineup decisions.",
        "The system generated $1,200 of weekly-high money.",
        "The model caused the improvement in entry equity.",
        "$412 was banked thanks to the tool this season.",
    ]
    for line in caught:
        assert any(p.search(line) for p in BANNED), f"not caught: {line}"

    allowed = [
        "$412 was realised on decisions where the tool recommended a different starter.",
        "Weekly-high captures totalled $1,200 on weeks the optimizer flagged a ceiling play.",
        "Cory earned $1,325 in 2025.",
        "The tool recommended Y on 41 decisions; those decisions realised $412.",
        "Playoff dollars are $2,125 of the $4,000 pot.",
    ]
    for line in allowed:
        assert not any(p.search(line) for p in BANNED), f"false positive: {line}"


def test_the_rule_is_documented_where_the_report_is_generated():
    """The test enforces it; the specs must still SAY it, or a future author
    meets a failing test with no explanation of why the sentence is wrong."""
    for doc in ["docs/queued/in-season-master.md", "docs/queued/annual-button.md"]:
        text = (ROOT / doc).read_text()
        assert "ATTRIBUTION WORDING RULE" in text, doc
        assert "was realised on decisions where the tool recommended" in text, doc


@pytest.mark.parametrize("name,path", _artifacts())
def test_artifacts_are_readable(name, path):
    assert path.read_text().strip(), f"{name} is empty"
