# TERRITORY: D
"""NO COMMITTED ARTIFACT MAY DECLARE A FILE MISSING THAT IS PRESENT.

DEFECT GUARDED: a refusal artifact outliving the condition it refused on.

The instance that prompted this file is `props_season_projection_2025.json`,
which carries `status: "pending_real_data"` and names three
`historical_props_*.json` stores as not yet fetched. All three exist, hold three
full seasons of real PAID odds-API data (12,559 player-weeks, 26,778 quotes),
and — this is why nothing caught it — LANDED IN THE SAME COMMIT as the refusal
(b879113). No date comparison could have separated them, and the freshness
registry deliberately excludes that artifact on the very premise that expired
(`draft/audit/row15_advanced_and_props_2026-08-17.md` §B4).

So a paid dataset has never been graded, and the write-up's "no real verdict
exists yet" reads as a finding when it is an un-run command.

The class is general — any artifact that records "X is absent" is a claim with a
shelf life — so this sweeps every committed JSON rather than pinning one file.

WHAT THIS DOES NOT DO: judge whether the refusal was right when written, or what
the verdict will be once it runs. Only whether the stated reason is still true.

Run: python -m pytest draft/tests/test_refusal_artifacts_are_not_stale.py -q
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SEARCH_DIRS = ("draft/backtest", "draft/data", "draft/tools")

# Keys an artifact uses to say "I refused because something was absent". Each
# holds, or is accompanied by, repo-relative paths the artifact calls missing.
PENDING_KEYS = ("pending_real_data", "pending_inputs", "missing_inputs")


def _iter_committed_json():
    for d in SEARCH_DIRS:
        for p in sorted((ROOT / d).glob("*.json")):
            try:
                yield p, json.loads(p.read_text())
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue


def find_refusals(docs) -> list[dict]:
    """[{artifact, key, claimed_missing}] for every committed doc asserting that
    named files are absent."""
    out = []
    for path, doc in docs:
        if not isinstance(doc, dict):
            continue
        for key in PENDING_KEYS:
            named = doc.get(key)
            if isinstance(named, list) and named:
                out.append({"artifact": path, "key": key,
                            "claimed_missing": [str(x) for x in named]})
    return out


def stale_claims(refusals) -> list[str]:
    """Every path a refusal calls missing that is in fact present."""
    bad = []
    for r in refusals:
        for rel in r["claimed_missing"]:
            target = ROOT / rel
            if target.exists():
                bad.append(
                    f"{r['artifact'].relative_to(ROOT)} ({r['key']}) claims "
                    f"{rel} is missing — it exists, {target.stat().st_size:,} bytes")
    return bad


# ── controls first: the sweep below is worthless without them ───────────────

def test_the_scanner_finds_refusal_artifacts_at_all():
    """COVERAGE CONTROL. The assertion in the final test is of the form "no
    stale claims found", which passes perfectly on a scanner that scanned
    nothing — if PENDING_KEYS drifts, or the search dirs move, the sweep would
    go quietly green while covering zero documents. So require it to find at
    least one real refusal in the committed tree.
    """
    refusals = find_refusals(_iter_committed_json())
    assert refusals, (
        "no committed artifact matched any of PENDING_KEYS — either the refusal "
        "vocabulary changed or the search paths did; until this finds something, "
        "the sweep below proves nothing")


def test_KNOWN_POSITIVE_a_synthetic_stale_refusal_is_detected():
    """CONTROL. Hand the checker a refusal naming a file that certainly exists
    and require it to be flagged. Without this, "no stale claims" cannot be
    distinguished from "the comparison never ran"."""
    fake = [{"artifact": ROOT / "synthetic.json", "key": "pending_real_data",
             "claimed_missing": ["draft/tests/test_refusal_artifacts_are_not_stale.py"]}]
    assert len(stale_claims(fake)) == 1

    # ...and the mirror: a genuinely absent file must NOT be flagged, so the
    # checker discriminates rather than flagging everything it is shown.
    absent = [{"artifact": ROOT / "synthetic.json", "key": "pending_real_data",
               "claimed_missing": ["draft/backtest/no_such_store_9x8y7z.json"]}]
    assert stale_claims(absent) == []


# ── the sweep ───────────────────────────────────────────────────────────────

@pytest.mark.repo_parity
def test_no_committed_artifact_claims_a_present_file_is_missing():
    """DELIBERATE RED FLAG — evidence awaiting a human, not a broken build.

    Marked `repo_parity` for the same reason as the ADP-sd ratchet and the
    stale pre-draft freeze: it pins REPO STATE, and clearing it means
    regenerating an artifact, which is a decision rather than a code fix. The
    publication gate runs `-m "not repo_parity"`, so this can never block a
    board rebuild — which is deliberate, since blocking the board over an
    ungraded study would be far worse than the staleness it reports.

    IT IS RED TODAY, on `props_season_projection_2025.json`. The fix is one
    command and it is A's, because the output is a graded number A rules on:

        python3 draft/tools/props_season_projection.py

    The refusal branch (props_season_projection.py:383-384) is verified NOT
    taken today — FHP.store_path(2025) exists — so this is a stale snapshot,
    not a live refusal, and not a code defect. See ROUTES.md -> TO: A.
    """
    bad = stale_claims(find_refusals(_iter_committed_json()))
    assert not bad, (
        "committed artifacts refuse on conditions that are no longer true:\n  "
        + "\n  ".join(bad)
        + "\n\nA refusal is a claim with a shelf life. Regenerate the artifact "
          "or correct the claim.")
