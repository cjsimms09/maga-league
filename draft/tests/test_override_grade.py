"""OVERRIDE GRADING guards (SESSION-A binding rule 2).

The grader will sit on an EMPTY ledger until Aug 22, so "it runs clean" proves
nothing — that is precisely the shape of the four guards this week that existed
and did not guard. These tests drive synthetic overrides through it and assert it
fires in BOTH directions, refuses to fire on thin or immaterial patterns, and
never quietly scores a missing outcome as a tie.

Run: python3 draft/tests/test_override_grade.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))
import override_grade as OG  # noqa: E402

fails = []


def ck(name, cond, detail=""):
    if cond:
        print("PASS " + name)
    else:
        fails.append(name)
        print("FAIL " + name + ((" -> " + str(detail)) if detail else ""))


def entry(picked, passed, reason, reconciled=False):
    return {"kind": "override", "season": 2026, "pick": 34,
            "payload": {"player_id": picked, "name": "P" + picked,
                        "over_player_id": passed, "over_name": "P" + passed,
                        "reason": reason, "reconciled_from_sync": reconciled}}


# ── A reconciled override is not a judgement and must not be graded as one ──
rows = OG.load_overrides([entry("1", "2", "gut", reconciled=True),
                          entry("3", "4", "gut")])
ck("reconciled-from-sync overrides are excluded", len(rows) == 1, rows)

# ── A missing outcome is dropped, never scored as a tie ─────────────────────
res = OG.resolve(OG.load_overrides([entry("1", "2", "gut")]), {"1": 100.0})
ck("an unresolvable override is DROPPED, not treated as delta 0", res == [], res)

# ── IT FIRES WHEN THE HUMAN BEATS THE CORE ──────────────────────────────────
ents, realized = [], {}
for i in range(6):
    a, b = "a%d" % i, "b%d" % i
    ents.append(entry(a, b, "gut"))
    realized[a], realized[b] = 120.0 + i, 90.0 + i      # human +30 every time
out = OG.run(ents, realized)
prop = [g for g in out["groups"] if g["reason"] == "gut"]
ck("a persistent, material, POSITIVE pattern becomes a PROPOSAL",
   prop and prop[0]["status"] == "PROPOSAL", prop)

# ── AND WHEN IT COSTS HIM MONEY — the direction Cory asked for by name ──────
ents, realized = [], {}
for i in range(6):
    a, b = "c%d" % i, "d%d" % i
    ents.append(entry(a, b, "homer"))
    realized[a], realized[b] = 80.0 + i, 130.0 + i      # human -50 every time
out = OG.run(ents, realized)
leak = [g for g in out["groups"] if g["reason"] == "homer"]
ck("a persistent, material, NEGATIVE pattern is named as a LEAK",
   leak and leak[0]["status"] == "LEAK", leak)
ck("and leaks are surfaced in their own list", len(out["leaks"]) == 1, out["leaks"])

# ── IT REFUSES TO FIRE ON A THIN PATTERN ────────────────────────────────────
ents, realized = [], {}
for i in range(2):
    a, b = "e%d" % i, "f%d" % i
    ents.append(entry(a, b, "hunch"))
    realized[a], realized[b] = 200.0, 50.0              # huge, but only twice
out = OG.run(ents, realized)
thin = [g for g in out["groups"] if g["reason"] == "hunch"]
ck("a huge effect over too few overrides stays DATA, not a proposal",
   thin and thin[0]["status"] == "DATA", thin)

# ── AND ON A CONSISTENT BUT IMMATERIAL ONE ──────────────────────────────────
ents, realized = [], {}
for i in range(6):
    a, b = "g%d" % i, "h%d" % i
    ents.append(entry(a, b, "tiny"))
    realized[a], realized[b] = 100.5, 100.0             # +0.5/pick = 3 pts total
out = OG.run(ents, realized)
tiny = [g for g in out["groups"] if g["reason"] == "tiny"]
ck("a consistent but immaterial edge stays DATA", tiny and tiny[0]["status"] == "DATA", tiny)

# ── MULTIPLICITY IS REPORTED, NOT ASSUMED ───────────────────────────────────
ents, realized = [], {}
for r in ("gut", "homer", "need", "hunch"):
    for i in range(4):
        a, b = "%s_a%d" % (r, i), "%s_b%d" % (r, i)
        ents.append(entry(a, b, r))
        realized[a], realized[b] = 110.0, 100.0
out = OG.run(ents, realized)
ck("the number of reason-groups tested is reported", out["reason_groups_tested"] == 4,
   out["reason_groups_tested"])
ck("and the multiplicity note states it", "4" in out["multiplicity_note"])

# ── IT INSTALLS NOTHING, like everything else that proposes ─────────────────
ck("output declares it installs nothing", "NOTHING" in out["installs"])
ck("units are points and say they are NOT dollars", "NOT DOLLARS" in out["units"])


def test_all_checks_passed():
    assert not fails, fails


if __name__ == "__main__":
    print("\n%d failed" % len(fails))
    sys.exit(1 if fails else 0)
