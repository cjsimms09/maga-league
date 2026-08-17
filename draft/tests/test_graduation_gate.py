"""THE GRADUATION GATE's own guards.

The gate polices the two-places disease for policy values. These tests police the
gate, because a gate that emits false proposals gets ignored — and an ignored
gate is worse than none, since it looks like coverage.

Run: python3 draft/tests/test_graduation_gate.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))
import graduation_gate as G  # noqa: E402

fails = []


def ck(name, cond, detail=""):
    if cond:
        print("PASS " + name)
    else:
        fails.append(name)
        print("FAIL " + name + ((" -> " + str(detail)) if detail else ""))


# ── It reads the REAL loaded policy, not a copy ────────────────────────────
loaded = G.loaded_weights()
ck("reads MEASURED_WEIGHTS out of engine.js", len(loaded) >= 6, loaded)
ck("value is loaded at 1.0 (the measured core)", loaded.get("value") == 1.0, loaded.get("value"))
# RE-PINNED 2026-08-17: Cory ruled ceiling non-zero ("IS THIS STUDIES? IF SO,
# YES") after three preregistered runs on real-ceiling boards beat the shipped
# zero 3/3 seeds, separably, at every value 0.15-0.65. 0.45 is the exp-21
# inverted-U peak. The 2026-08-10 zero this line used to pin was measured on a
# proj_mean-x-constant board and could not have come out any other way. Full
# record at MEASURED_WEIGHTS in engine.js.
ck("ceiling is loaded at 0.45 (Cory's 2026-08-17 ruling)",
   loaded.get("ceiling") == 0.45, loaded.get("ceiling"))

# ── An instrument that says it cannot measure the thing gets no vote ───────
limited = {"build_up_from_core": {
    "edge": -63.4, "ci95": [-86.7, -41.2], "separable": True,
    "reading": "INSTRUMENT-LIMITED — grade_room has no within-team weekly correlation"}}
r = G.classify("stack", 0.5, limited)
ck("an INSTRUMENT-LIMITED arm never drives a proposal",
   r["status"] != "PROPOSAL", r)
ck("and it is reported as a wrong-instrument reading",
   r["status"] == "WRONG-INSTRUMENT", r)

# ── Arms disagreeing in sign is a finding, not a flip ──────────────────────
split = {"ablation_from_full": {"edge": 150.0, "ci95": [124, 173], "separable": True,
                                "reading": "EARNS (+150, CI excludes 0)"},
         "build_up_from_core": {"edge": -4.8, "ci95": [-25.8, 17.2], "separable": False,
                                "reading": "decoration"}}
r = G.classify("ceiling", 0.0, split)
ck("two arms disagreeing in sign reads UNSETTLED, not a proposal",
   r["status"] == "ARMS-DISAGREE", r)

# ── A settled, material contradiction DOES propose ─────────────────────────
hurts = {"ablation_from_full": {"edge": -263.0, "ci95": [-292, -236], "separable": True,
                                "reading": "HURTS (-263, CI excludes 0)"}}
ck("a term measured to HURT but loaded ON is proposed OFF",
   G.classify("tier", 1.0, hurts)["status"] == "PROPOSAL")
ck("the same term loaded OFF simply agrees",
   G.classify("tier", 0.0, hurts)["status"] == "AGREES")
earns = {"ablation_from_full": {"edge": 362.0, "ci95": [329, 394], "separable": True,
                                "reading": "EARNS (+362, CI excludes 0)"}}
ck("a term measured to EARN but loaded OFF is proposed ON",
   G.classify("value", 0.0, earns)["status"] == "PROPOSAL")

# ── Immaterial effects are a free choice, not a finding ────────────────────
tiny = {"ablation_from_full": {"edge": 4.5, "ci95": [-3.4, 12.8], "separable": False,
                               "reading": "decoration"}}
ck("an effect under the resolvable floor is a FREE choice",
   G.classify("bye", 0.0, tiny)["status"] == "IMMATERIAL")

# ── IT NEVER FLIPS ANYTHING. The whole design rests on this. ───────────────
before = G.loaded_weights()
out = G.run()
after = G.loaded_weights()
ck("running the gate does not change a single loaded weight", before == after,
   {"before": before, "after": after})
ck("the gate emits rows, never instructions",
   all("status" in r and "detail" in r for r in out["rows"]))
ck("every row states whether a human has recorded a decision",
   all("documented" in r for r in out["rows"]))
ck("the report says out loud that it proposes and never flips",
   "NEVER FLIPS" in out["note"])

# ── Only UNDOCUMENTED disagreements block ──────────────────────────────────
ck("blocking lists only undocumented disagreements",
   all(any(r["term"] == t and not r["documented"] for r in out["rows"])
       for t in out["blocking"]), out["blocking"])

# PYTEST ENTRY POINT. The checks above run at import (script style, so the file
# stays runnable directly); this exposes their result as ONE pytest test. Without
# it the file would be collected with zero tests and read as passing coverage that
# does not exist — and a bare sys.exit at module scope aborts collection for the
# WHOLE suite, which is far worse than one red test.
def test_all_checks_passed():
    assert not fails, fails


if __name__ == "__main__":
    print("\n%d failed" % len(fails))
    sys.exit(1 if fails else 0)
