# TERRITORY: C
"""THE CANDIDATE LEDGER'S MACHINE-READABLE HALF — revisit triggers as DATA.

WHY THIS EXISTS, and it is a defect in my own proposal. I told A that each retired
hypothesis should carry `revisit_when` and `revisit_n` so the standing check fires
when the sample crosses, rather than when someone remembers. Then I wrote both of my
first two candidates into a MARKDOWN TABLE.

`C-001`'s counter is derivable from `league_history.json`. **`C-002`'s counter lives
only in prose**, so the mechanism I proposed cannot read its own second row. That is
an intention with no trigger, which is precisely the failure the mechanism exists to
correct — committed one message after I described it.

So the counters live here, in a shape a checker can read, and the prose ledger keeps
the reasoning. ONE source for each number: the prose cites this file rather than
restating a figure that could drift from it.

WHAT THIS IS NOT: not a scan, not an analysis, not a promotion path. It answers one
question per candidate — HAS THE SAMPLE CROSSED — and returns. Rule 9.
"""
import json
from pathlib import Path

LEDGER_VERSION = "candidate-ledger/v1"

# EVERY RETIRED OR CANDIDATE HYPOTHESIS THAT HAS A COUNTABLE REVISIT CONDITION.
# A candidate with no countable trigger is recorded with `revisit_n: None` and states
# WHY in `revisit_when` — an untriggerable candidate must be visible as untriggerable
# rather than silently absent from the check.
CANDIDATES = [
    {"id": "C-001",
     "claim": "owner drafting tendencies persist across seasons",
     "status": "candidate",
     "discovery_n": 10,
     "searched": 18,                       # 6 tendencies x 3 season pairs
     "revisit_when": "owner-seasons available >= 43, from any source with repeat owners",
     "counter": "owner_seasons",
     "revisit_n": 43},
    {"id": "C-002",
     "claim": "QB gap-per-pick exceeds RB by >1.5x with variance controlled",
     "status": "candidate",
     "discovery_n": 5,
     "searched": 6,                        # one per position, POST-HOC
     "revisit_when": "QB decision slots in the oracle-capture series >= 15",
     "counter": "oracle_capture_qb_slots",
     "revisit_n": 15},
    {"id": "R-F7",
     "claim": "200 matched external league-seasons are reachable",
     "status": "retired",
     "discovery_n": 394,
     "searched": 1,
     "revisit_when": ("a NON-MFL source with >=200 accessible half-PPR league-seasons "
                      "is identified. NOT a wider F1 — Cory closed that 2026-08-12"),
     "counter": None,                      # not countable from any archive we hold
     "revisit_n": None},
    {"id": "R-ROUTE1",
     "claim": "a dated preseason board series exists in the public archive",
     "status": "retired",
     "discovery_n": 18,
     "searched": 18,
     "revisit_when": ("a publisher outside the 18 registered targets is identified, OR "
                      "the empty-versus-unfetched conflation is repaired and re-run"),
     "counter": None,
     "revisit_n": None},
]


def counters(history: dict = None, capture_series: dict = None) -> dict:
    """The current value of every countable trigger, from the archives themselves.

    DERIVED, NEVER STORED. A counter written down by hand is a number that drifts from
    the thing it counts — which is how a revisit trigger comes to fire late, or never.
    """
    out = {}
    seasons = ((history or {}).get("seasons") or [])
    out["owner_seasons"] = sum(len(s.get("owners") or {}) for s in seasons)
    rows = ((capture_series or {}).get("series") or [])
    out["oracle_capture_qb_slots"] = sum(int(r.get("qb_decision_slots") or 0) for r in rows)
    return out


def due(now: dict) -> list:
    """Candidates whose sample has CROSSED. The whole mechanism, in one comparison.

    An uncountable candidate is never due and never silently dropped — it is reported
    by `untriggerable()` instead, because "no trigger" and "not yet" are different
    states and collapsing them is how a hypothesis is retired permanently by accident.
    """
    hits = []
    for c in CANDIDATES:
        if not c.get("counter") or c.get("revisit_n") is None:
            continue
        have = (now or {}).get(c["counter"])
        if have is not None and have >= c["revisit_n"]:
            hits.append({"id": c["id"], "claim": c["claim"], "counter": c["counter"],
                         "have": have, "needed": c["revisit_n"],
                         "why": ("%s is testable now: %s reached %d, retired/registered "
                                 "at %d" % (c["id"], c["counter"], have, c["revisit_n"]))})
    return hits


def untriggerable() -> list:
    """Candidates no counter can ever fire for. Visible, not forgotten."""
    return [{"id": c["id"], "claim": c["claim"], "revisit_when": c["revisit_when"]}
            for c in CANDIDATES if not c.get("counter") or c.get("revisit_n") is None]


def report(history=None, capture_series=None) -> dict:
    now = counters(history, capture_series)
    d = due(now)
    return {
        "version": LEDGER_VERSION,
        "counters": now,
        "due": d,
        "untriggerable": untriggerable(),
        "verdict": (("%d candidate(s) DUE — the sample crossed: %s"
                     % (len(d), "; ".join(x["why"] for x in d))) if d else
                    ("nothing due. %s" % ", ".join("%s %s/%s" % (
                        c["counter"], now.get(c["counter"]), c["revisit_n"])
                        for c in CANDIDATES if c.get("counter")))),
    }
