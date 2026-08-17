"""CLAIM INTEGRITY — epistemics rules enforced over generated artifacts.

The doctrine is `CLAIM-INTEGRITY.md`: a rule nobody can violate silently is
worth more than a rule everybody agrees with. Every rule here carries all three
required components —

    (a) the guard catches the overclaim
    (b) anti-overreach: honest phrasings of the same facts pass untouched
    (c) spec-conformance: the reasoning is findable from the failure

(b) matters as much as (a). A guard that flags legitimate sentences is disabled
by the first person under deadline pressure, and disabling it removes the true
positives too. (c) matters because a rule whose justification is unreachable is
either re-litigated or slipped past by rewording — which is worse than no guard,
since the claim ships and the rail reports green.

Rules enforced here: confidence tiers · provenance labels · the honesty line.
Attribution wording has its own file (`test_attribution_wording.py`) and the
same three components.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent

# Generated result artifacts — the things that make claims. Missing files are
# skipped; several arrive with the season.
REPORTS = [
    "draft/backtest/LAB-REPORT.md",
    "draft/backtest/CORY-CONDITIONAL.md",
    "draft/backtest/FRONTIER.md",
    "draft/backtest/POLICY-TOURNAMENT.md",
    "draft/backtest/STACK-SWEEP.md",
    "draft/backtest/SIM-FIDELITY.md",
    "draft/backtest/PLAYOFF-MONEY-VALIDATION.md",
    "draft/backtest/HETEROGENEOUS-VALIDATION.md",
]


def _present(names):
    return [(n, ROOT / n) for n in names if (ROOT / n).exists()]


# ── RULE 1: CONFIDENCE TIERS ─────────────────────────────────────────────────
# A surfaced edge states its tier. A dollar figure presented as a verdict with
# no qualifier is a certified claim by omission.

TIER_WORDS = re.compile(
    r"\b(LEAN|LIKELY|CERTIFIED|CANDIDATE|WINNER|parked|REFUTED|SUPPORTED|"
    r"INSUFFICIENT-N|GLOBAL|null|CI|held-out|not installed|pending|"
    r"caveats?|unmeasur\w+|untested|measurement|hindsight|WORSE|BETTER|"
    r"no evidence|survives?|YES|NO)\b", re.I)
# A bracketed numeric interval IS a stated confidence — "[150.38, 223.62]"
# qualifies an edge as surely as the word LEAN does, and demanding the word
# anyway would be the over-reach this doctrine exists to prevent.
CI_INTERVAL = re.compile(r"\[\s*[-−+]?\d[\d.,]*\s*,\s*[-−+]?\d[\d.,]*\s*\]")
EDGE_IN_ROW = re.compile(r"[+−-]\s?\$?\d")
SEPARATOR = re.compile(r"^\|[\s:|-]+\|?$")


def _tables(text: str) -> list[list[str]]:
    """Contiguous markdown table blocks. The tier qualification belongs to the
    TABLE, not to every cell — a results table headed by a verdict column does
    not need the word LEAN repeated in each row, and requiring that would make
    the guard unusable."""
    blocks, cur = [], []
    for line in text.splitlines():
        if line.lstrip().startswith("|"):
            cur.append(line)
        elif cur:
            blocks.append(cur)
            cur = []
    if cur:
        blocks.append(cur)
    return blocks


def _untiered_edge_rows(text: str) -> list[str]:
    """Edge-stating tables with no qualification anywhere in them."""
    bad = []
    for block in _tables(text):
        rows = [r for r in block if not SEPARATOR.match(r.strip())]
        edge_rows = [r for r in rows if EDGE_IN_ROW.search(r)]
        if not edge_rows:
            continue
        joined = "\n".join(block)
        if TIER_WORDS.search(joined) or CI_INTERVAL.search(joined):
            continue
        bad.append(edge_rows[0].strip()[:140])
    return bad


def test_a_every_surfaced_edge_states_its_confidence_tier():
    offences = []
    for name, path in _present(REPORTS):
        for row in _untiered_edge_rows(path.read_text()):
            offences.append(f"{name}: {row}")
    assert not offences, (
        "a dollar edge is surfaced with no confidence tier — an unqualified "
        "edge reads as CERTIFIED by omission. Add LEAN / CANDIDATE / WINNER / "
        "parked / REFUTED or the CI.\n  " + "\n  ".join(offences)
    )


def test_b_confidence_guard_does_not_flag_honest_rows():
    """Anti-overreach. Properly qualified rows, and rows that are not edge
    claims at all, must pass — or the guard gets switched off."""
    honest = [
        "| wr_anchor | +187.25 | [150.38, 223.62] | 1.9 | WINNER — enroll as THE PLAN |",
        "| 0.5x | +80.42 | [56.04, 105.62] | 3.13 | LEAN — not installed |",
        # An entirely-negative CI carries the LOSER label since the frontier.py
        # verdict fix (2026-08-15) — the old fixture row here paired it with
        # "parked: CI includes $0", enshrining the mislabel this suite exists
        # to catch. Both rows are qualified, so both must pass the tier guard.
        "| flat_l2.0 | -88.83 | [-141.83, -35.83] | LOSER — significantly worse than the control |",
        "| flat_l1.0 | +26.38 | [-15.12, 67.25] | parked: CI includes $0 |",
        "| 2023 | $3,500 | pot | weekly-high $1,500 |",          # a fact, not an edge
        "| # | experiment | pre-registered criterion | state |",  # a header
        "|---|---|---|---|",                                       # a separator
    ]
    for row in honest:
        assert not _untiered_edge_rows(row), f"false positive: {row}"

    overclaims = [
        "| h1_phase | +226.50 | best in the sweep |",
        "| stack 0.5x | +204.58 | install it |",
    ]
    for row in overclaims:
        assert _untiered_edge_rows(row), f"not caught: {row}"


# ── RULE 2: PROVENANCE LABELS ────────────────────────────────────────────────
# Site data is DECLARATION until Sleeper speaks (AUTHORITY-DOCTRINE.md). The
# failure mode is not disagreement — it is DRIFT: a synonym at a time until the
# doctrine's vocabulary and the code's no longer match.

CANONICAL_LABELS = {"site-declared", "site-claimed", "Sleeper-verified"}
# Only STATUS-shaped tokens are provenance labels. `Sleeper-derived`,
# `Sleeper-imported`, `site-native` are ordinary description and policing them
# would be the over-reach that gets a guard switched off; `Sleeper-confirmed`
# and `site-approved` are claims about authority and are policed.
# "settled" is deliberately ABSENT. `SLEEPER-SETTLED` is a TAXONOMY KIND in
# AUTHORITY-DOCTRINE.md (one of Sleeper-settled / site-native / derived), not a
# render-time authority label — and this guard originally policed it, which led
# me to "normalise" a taxonomy category and break `authority.test.js`. A guard
# that cannot tell a category from a label is the over-reach this doctrine
# warns about, met on its first run.
STATUS_SUFFIXES = ("confirmed", "verified", "validated", "approved",
                   "declared", "claimed", "authoritative")
LABEL_TOKEN = re.compile(r"\b(Sleeper|site)-(" + "|".join(STATUS_SUFFIXES) + r")\b", re.I)


def _canonical_ci():
    return {l.lower() for l in CANONICAL_LABELS}

LABEL_SCOPE = [
    "AUTHORITY-DOCTRINE.md",
    "public/js/draft/seat.js",
    "public/js/draft/app.js",
    "src/routes/admin.js",
    "views/admin/warroom.ejs",
    "draft/data/opening_script.md",
]


def _drifted_labels(text: str) -> set[str]:
    found = {m.group(0) for m in LABEL_TOKEN.finditer(text)}
    return {f for f in found if f.lower() not in _canonical_ci()}


def test_a_no_invented_or_drifted_provenance_labels():
    offences = []
    for name, path in _present(LABEL_SCOPE):
        for bad in sorted(_drifted_labels(path.read_text())):
            offences.append(f"{name}: '{bad}'")
    assert not offences, (
        "provenance label outside the canonical set "
        f"{sorted(CANONICAL_LABELS)} — this is how the authority doctrine "
        "erodes, one synonym at a time.\n  " + "\n  ".join(offences)
    )


def test_b_provenance_guard_does_not_flag_prose_or_canonical_use():
    """Anti-overreach: the canonical labels pass, and ordinary prose about
    Sleeper is not a label and must not be policed."""
    fine = [
        "slotSource = 'site-claimed'",
        "renders `site-declared` until Sleeper speaks",
        "seat 4 (Sleeper-verified)",
        "the slot verifies automatically once Sleeper assigns the draft order",
        "Sleeper is always truth once it speaks.",
        "imported from the Sleeper draft object",
        "Sleeper-derived rosters",          # description, not a provenance claim
        "site-native settlement records",
        "Sleeper-imported pick history",
        "classified SLEEPER-SETTLED in the inventory",   # taxonomy kind, not a label
        "Sleeper-settled facts get all three phases",
    ]
    for line in fine:
        assert not _drifted_labels(line), f"false positive: {line}"

    drifted = [
        "shows Sleeper-confirmed once agreed",
        "marked site-approved by the commissioner",
        "state: Sleeper-validated",
    ]
    for line in drifted:
        assert _drifted_labels(line), f"not caught: {line}"


# ── RULE 3: THE HONESTY LINE ─────────────────────────────────────────────────
# A generated report names its own limits. A results document with no caveat,
# no sample size and no CI anywhere in it is presenting findings as complete.

HONESTY = re.compile(
    r"\b(caveats?|limitations?|honest\w*|pre-registered|null|CI\b|n\s?=|"
    r"underpowered|unmeasur\w+|cannot reproduce|not installed|"
    r"skipped|unavailable|LEAN)\b", re.I)


def test_a_every_generated_report_carries_an_honesty_line():
    offences = []
    for name, path in _present(REPORTS):
        text = path.read_text()
        if len(text.strip()) < 200:
            continue                       # a stub, not a report
        if not HONESTY.search(text):
            offences.append(name)
    assert not offences, (
        "generated report states results with no caveat, limitation, sample "
        "size or CI anywhere in it — findings presented as complete.\n  "
        + "\n  ".join(offences)
    )


def test_b_honesty_guard_accepts_any_genuine_limit_statement():
    """Anti-overreach: many phrasings are legitimate; the guard must accept the
    range rather than mandate one house sentence."""
    honest = [
        "Caveats: money proxy v1; playoff $ included.",
        "n=3 seasons — underpowered by construction.",
        "CI [150, 224]",
        "cannot reproduce: ['runs_per_draft']",
        "This remains a LEAN, not an install.",
        "2025 is honestly skipped — nflverse weekly 404.",
    ]
    for line in honest:
        assert HONESTY.search(line), f"false negative: {line}"

    silent = [
        "WR Feast earns 187 dollars per season.",
        "The frontier peaks at lambda 0.5.",
    ]
    for line in silent:
        assert not HONESTY.search(line), f"false positive: {line}"


# ── (c) SPEC CONFORMANCE — the reasoning must be findable from the failure ──

def test_c_the_doctrine_exists_and_states_all_three_components():
    raw = (ROOT / "CLAIM-INTEGRITY.md").read_text()
    # The doc is line-wrapped prose inside a blockquote, so a sentence spans
    # lines with `>` and `**` markers in the middle. Normalise those away before
    # matching — otherwise the test enforces the doc's LINE BREAKS, not its
    # content, and any reflow turns the build red for no reason.
    doc = " ".join(re.sub(r"[>*`]", " ", raw).split())
    assert "the guard catches the overclaim" in doc
    assert "anti-overreach" in doc.lower()
    assert "findable from the failure" in doc
    assert "worth more than a rule everybody agrees with" in doc


@pytest.mark.parametrize("rule,needle", [
    ("confidence tiers", "Confidence tiers"),
    ("provenance labels", "Provenance labels"),
    ("honesty line", "Honesty line"),
    ("attribution wording", "Attribution wording"),
])
def test_c_each_enforced_rule_is_documented_in_the_doctrine(rule, needle):
    """A red build must lead to the reasoning, not just to a regex."""
    doc = (ROOT / "CLAIM-INTEGRITY.md").read_text()
    assert needle in doc, f"{rule} is enforced but undocumented"


def test_c_the_canonical_label_set_is_stated_where_it_is_enforced():
    doc = (ROOT / "CLAIM-INTEGRITY.md").read_text()
    for label in CANONICAL_LABELS:
        assert label in doc, f"canonical label {label} not documented"
