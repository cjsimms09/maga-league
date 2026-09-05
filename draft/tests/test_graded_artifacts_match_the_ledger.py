# TERRITORY: D
"""A GRADE THAT EXISTS ON DISK WHILE THE LEDGER ROW SAYS OPEN.

P151's verdict sat in `p151_target_share_trend.json` from 2026-08-20 while the
ledger read OPEN, and the relay's own work queue — built from ledger status —
sent a lane at four-day-old finished work. Register 304.

⚠️ AND THE OBVIOUS FIX DOES NOT WORK, WHICH IS WHY THIS IS A CONVENTION AND NOT
A SEARCH. The relay swept for it twice on 2026-09-02 and neither probe earns a
null: artifacts named inside OPEN claim cells finds nothing (only 2 of 129
GRADED rows name theirs there, so the handle is empty by construction), and
"backtest files mentioning an OPEN P-id beside a verdict word" hits 27 of 73
while MISSING P151 itself — the known positive. A probe that cannot find the one
case we know about is not a probe. Its 27 hits are prereg files whose
CONSEQUENCE text happens to say TRUE or FALSE.

Nothing can infer which prediction an artifact GRADES: a file may cite six
P-ids in its docstring and grade one of them. Only the author knows. So the
author says so, once, in the artifact:

    {"graded": ["P151"], ...}

and this test cross-reads it. Declaring the field is opt-in — an unstamped
artifact is not a failure, because a convention that fails on every file nobody
has reached yet is a convention people switch off. What is NOT optional is that
a stamp must agree with the ledger.

Routed by the relay 2026-09-02; the field is the ask, this is its teeth.
"""
import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
LEDGER = ROOT / "PREDICTION-LEDGER.md"
SEARCH_DIRS = ("draft/backtest", "draft/data", "draft/audit")

#: Live = the row still expects work. Mirrors the ledger's own vocabulary; a
#: stamped artifact is a claim that the work is DONE, so any live status is the
#: contradiction this test exists to catch.
LIVE = re.compile(r"\b(OPEN|IN HAND|WAITING)\b", re.I)


def _ledger_status() -> dict[str, str]:
    out = {}
    for line in LEDGER.read_text().splitlines():
        if not line.startswith("| P"):
            continue
        parts = re.split(r"(?<!\\)\|", line.rstrip())
        if len(parts) < 8:
            continue
        pid = parts[1].strip()
        if re.fullmatch(r"P\d+[a-z]?", pid):
            out[pid] = parts[6].strip()
    return out


def _stamped_artifacts():
    """Every JSON on disk carrying a top-level `graded` list."""
    out = []
    for d in SEARCH_DIRS:
        for p in sorted((ROOT / d).rglob("*.json")):
            try:
                doc = json.loads(p.read_text())
            except (ValueError, OSError):
                continue
            if isinstance(doc, dict) and isinstance(doc.get("graded"), list):
                out.append((p, doc["graded"]))
    return out


def test_the_ledger_parses_at_all_or_nothing_below_means_anything():
    """The licence. If the row regex stops matching, every assertion under it
    passes on an empty dict and this file becomes decoration."""
    st = _ledger_status()
    assert len(st) >= 50, f"only {len(st)} ledger rows parsed — the reader is broken"
    assert any(LIVE.search(v) for v in st.values()), "no row reads as live"
    assert any(not LIVE.search(v) for v in st.values()), "no row reads as terminal"


def test_every_stamped_artifact_names_a_real_prediction():
    st = _ledger_status()
    bad = [(p.relative_to(ROOT), pid) for p, ids in _stamped_artifacts()
           for pid in ids if pid not in st]
    assert not bad, (
        "a `graded` stamp names a prediction the ledger does not carry — a typo "
        f"here is worse than no stamp, because it reads as covered: {bad}")


def test_no_graded_artifact_sits_beside_a_live_ledger_row():
    """THE ONE THAT MATTERS. An artifact saying it graded P-x while P-x still
    reads OPEN is register 304 happening again."""
    st = _ledger_status()
    bad = [f"{p.relative_to(ROOT)} declares graded:{pid} but the ledger reads "
           f"{st[pid]!r}"
           for p, ids in _stamped_artifacts() for pid in ids
           if pid in st and LIVE.search(st[pid])]
    assert not bad, (
        "a grade exists on disk while its ledger row still asks for work:\n  "
        + "\n  ".join(bad))


def test_CONTROL_the_convention_is_actually_in_use():
    """RULE 3E. Every assertion above passes vacuously on zero stamped files,
    which is exactly how this would rot: the convention is agreed, nobody
    applies it, and the green tick says the loop is closed. So the stamps are
    required to exist — and to include P151, the case that motivated all of it
    and the one both of the relay's search-based probes could not find.
    """
    stamped = _stamped_artifacts()
    assert stamped, (
        "no artifact on disk carries a `graded` stamp, so the three tests above "
        "are passing on an empty set — the convention exists only on paper")
    ids = {pid for _, ids_ in stamped for pid in ids_}
    assert "P151" in ids, (
        "P151 is the known positive for this whole mechanism — its verdict sat "
        "on disk for four days while the ledger read OPEN (register 304). If its "
        "artifact is not stamped, this file is not guarding the case it was "
        f"built for. Stamped ids: {sorted(ids)}")
