#!/usr/bin/env python3
# TERRITORY: A
"""THE NO-FITTING RULE, ENFORCED IN CODE RATHER THAN REMEMBERED.

Cory: *"I'm not saying to fit... but do not fit!!!! ENFORCE IT!!!!"*

§11 of PRE-REGISTRATION-three-season-replay.md states the rule. A rule in a
document is a rule somebody has to remember, and this project has established
four separate times that remembering is not a mechanism. So the replay harness
MUST route every result through this module, and this module REFUSES the shapes
that constitute fitting.

WRITTEN BEFORE THE HARNESS EXISTS, DELIBERATELY. A guard added afterwards is a
guard fitted around whatever was already built.

── WHAT FITTING ACTUALLY IS, OPERATIONALLY ────────────────────────────────────

Not "using many configurations". Searching a space and keeping the winner,
without a mechanism that would have been true in advance.

    THE ONE-SENTENCE TEST: can you say WHY it was wrong, in a sentence that
    would still be true if the score had not moved?

    YES -> a FIX.  "Week 9 started a player on bye because the bye guard reads
                    a field the replay never populates."
    NO  -> a FIT.  "Config 4,712 scored best."

`mechanism` below is that sentence, and it is REQUIRED to promote anything.

── THE FOUR REFUSALS ──────────────────────────────────────────────────────────

1. A promotable result with NO mechanism.                       -> refuse
2. A promotable result SELECTED from a search.                   -> refuse
3. A result that does not declare how many configs were tried.   -> refuse
4. A mechanism that merely restates the score.                   -> refuse

(4) is the one that matters most and is the easiest to fake. "It scored higher"
dressed up in a longer sentence is still the score. The check is deliberately
crude — a keyword screen — and its crudeness is stated rather than hidden: it
raises the cost of laundering a number into a sentence. It cannot stop a
determined author, and it is not meant to.

── WHAT THIS DOES NOT DO ──────────────────────────────────────────────────────

It does not judge whether a mechanism is TRUE. No code can. It forces one to be
stated, attached to the result, and carried into the artifact, so a reviewer —
human or the independent reviewer — has something falsifiable to attack.

Run the suite: python -m pytest draft/tests/test_no_fit_guard.py
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field, asdict
from typing import Any


class FittingRefused(Exception):
    """Raised instead of returning a result that would constitute fitting."""


# Phrases that describe an OUTCOME rather than a CAUSE. A mechanism built only
# from these is the score wearing a sentence.
_SCORE_WORDS = re.compile(
    r"\b(scored?|scores|best|better|worse|higher|lower|improv\w*|outperform\w*|"
    r"wins?|won|beat\w*|optimal|maximis\w*|maximiz\w*|top|highest|lowest|"
    r"most money|more money|gain\w*|profit\w*)\b", re.I)

# Words that indicate a CAUSAL claim about the machinery. At least one is
# required — a mechanism has to point at something in the system.
_CAUSE_WORDS = re.compile(
    r"\b(because|since|due to|caused|reads?|writes?|returns?|never|always|"
    r"missing|absent|null|undefined|off.by|scale|unit|denominator|population|"
    r"field|guard|branch|path|order|index|slot|bug|defect|contract|"
    r"docstring|specification|spec)\b", re.I)

MIN_MECHANISM_CHARS = 40


@dataclass
class ReplayResult:
    """One replay outcome, with the provenance that makes it readable later.

    `configs_tried` is REQUIRED and has no default on purpose. A default would
    silently become 1 for a search of ten thousand, which is the precise lie
    §11 forbids.
    """
    label: str
    arm: str
    seasons: list
    value: Any
    configs_tried: int
    selected_from_search: bool = False
    mechanism: str | None = None
    promotable: bool = False
    notes: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return asdict(self)


def _reject(msg: str) -> None:
    raise FittingRefused(msg)


def validate_mechanism(mechanism: str | None) -> str:
    """The one-sentence test, as far as code can apply it."""
    if not mechanism or not mechanism.strip():
        _reject(
            "NO MECHANISM. A change promoted from the replay must say WHY the "
            "model was wrong, in a sentence that would still be true if the "
            "score had not moved. Without one this is a fit, not a fix.")
    m = mechanism.strip()
    if len(m) < MIN_MECHANISM_CHARS:
        _reject(
            f"MECHANISM TOO SHORT ({len(m)} chars). It has to name what in the "
            "system was wrong, not assert that something was.")
    if not _CAUSE_WORDS.search(m):
        _reject(
            "MECHANISM NAMES NO CAUSE. It reads as an assertion about the "
            "result rather than a claim about the machinery — nothing in it "
            "points at a field, a branch, a unit, a population or a contract.")
    stripped = _SCORE_WORDS.sub("", m)
    if len(stripped.strip()) < MIN_MECHANISM_CHARS // 2:
        _reject(
            "MECHANISM IS THE SCORE RESTATED. Remove the outcome words and "
            "almost nothing is left, so this says the config did better and "
            "not why the model was wrong.")
    return m


def record(result: ReplayResult) -> dict:
    """The ONLY sanctioned way for the harness to emit a result.

    Returns the artifact dict. Raises FittingRefused rather than returning
    something a reader could mistake for a sanctioned recommendation.
    """
    if not isinstance(result.configs_tried, int) or result.configs_tried < 1:
        _reject(
            "configs_tried MUST be a positive integer on every result. "
            "'Best of 10,000' and 'the one we predicted' are different claims "
            "and must never be emitted in the same shape.")

    if result.promotable:
        validate_mechanism(result.mechanism)
        if result.selected_from_search:
            _reject(
                "PROMOTION FROM A SEARCH IS REFUSED. A configuration chosen "
                "because it won a sweep is a HYPOTHESIS, not a finding. "
                "Pre-register it and test it on data it was not chosen from.")
        if result.configs_tried > 1:
            _reject(
                f"PROMOTION AFTER TRYING {result.configs_tried} CONFIGURATIONS "
                "is refused. With n=3 seasons the best of many will look "
                "excellent by chance alone. Diagnose here; promote elsewhere.")

    art = result.as_dict()
    # THE LABEL RIDES WITH THE NUMBER, always, so a downstream reader cannot
    # lose the caveat by quoting the value alone.
    art["evidence_class"] = (
        "DIAGNOSTIC — one of many configurations, not a selection"
        if result.configs_tried > 1 else
        "PRE-DECLARED — a single stated comparison")
    art["may_change_production"] = bool(result.promotable)
    return art


def summarise(artifacts: list) -> str:
    """A one-screen report that cannot omit the config count."""
    lines = []
    for a in artifacts:
        lines.append(
            f"{a['label']:<34} {a['arm']:<22} configs={a['configs_tried']:<7}"
            f" {a['evidence_class']}")
    return "\n".join(lines)


if __name__ == "__main__":
    demo = record(ReplayResult(label="TOOL vs BASELINE", arm="full-system",
                               seasons=[2023, 2024, 2025], value=None,
                               configs_tried=1))
    print(json.dumps(demo, indent=1))
