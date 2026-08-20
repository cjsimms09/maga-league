# TERRITORY: A
"""DOES THE SHIPPED BOARD'S CROSS-POSITION ORDER OBEY ITS TWO RULES?

Both of these were LIVE on the board Cory drafts from, both shipped by me in
`attach_draftsharks.py`, and neither was caught by any existing test. D found
the first; the second turned up while checking their report.

(1) FALSY ZERO. `-(p.get("vorp") or -1e9)` sorts a vorp of EXACTLY 0.0 last,
    because `0.0 or -1e9` is `-1e9`. Exactly six players have vorp 0.0 — one
    per position, since that IS the replacement-level player — so all six were
    ranked 695-700 of 700. George Kittle sat at 697 two days before the draft.

(2) THE K/DEF DEMOTION WAS DROPPED. Cory ruled 2026-08-17 that kickers and
    defences come out of the cross-position order; `vorp.py` does it in the
    sort key. My rewrite claimed `apply_vorp` encoded it in the value. It does
    not. Houston DEF ranked 39th overall and Brandon Aubrey 44th.

⚠️ WHY THIS TEST IS ABOUT THE ARTIFACT AND NOT THE FUNCTION. Both defects were
in code whose unit behaviour was fine in isolation; what was wrong was the
ORDER that reached `public/draft_data.json`. A test of the sort helper would
have passed through both. This reads the shipped board.

Run: python3 draft/tests/test_attach_draftsharks_ranking.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BOARD = json.loads((ROOT / "public" / "draft_data.json").read_text())
PLAYERS = [p for p in BOARD["players"] if p.get("position")]
ONESIES = ("K", "DEF")

_fails = []


def ck(name, cond, detail=None):
    if cond:
        print("PASS  " + name)
    else:
        _fails.append(name)
        print("FAIL  " + name + ("  — " + repr(detail)[:300] if detail is not None else ""))


# ── DEFECT 1: a vorp of exactly zero is a RANK, not a missing value ──────────
zeros = [p for p in PLAYERS if p.get("vorp") == 0]
ck("CONTROL — the board really does contain vorp==0 players, so this test has "
   "something to catch (rule 3e: a check that can never fire is not a check)",
   len(zeros) > 0, len(zeros))

worst = max(p["overall_rank"] for p in PLAYERS)
skill_zeros = [p for p in zeros if p["position"] not in ONESIES]
ck("a replacement-level SKILL player is ranked on his points, not dumped to the "
   "bottom of the board (Kittle was 697 of 700)",
   all(p["overall_rank"] < worst * 0.5 for p in skill_zeros),
   [(p["name"], p["position"], p["overall_rank"]) for p in skill_zeros])

# and the ordering around him must be monotone in vorp, within skill players
skill = sorted([p for p in PLAYERS if p["position"] not in ONESIES],
               key=lambda p: p["overall_rank"])
inversions = [(a["name"], b["name"]) for a, b in zip(skill, skill[1:])
              if (a.get("vorp") or 0) < (b.get("vorp") or 0) - 1e-9]
ck("and the skill-player order is monotone in vorp — no player outranks someone "
   "worth more than him", not inversions, inversions[:5])

# ── DEFECT 2: Cory's 2026-08-17 onesie ruling ────────────────────────────────
onesies = [p for p in PLAYERS if p["position"] in ONESIES]
skills = [p for p in PLAYERS if p["position"] not in ONESIES]
ck("CONTROL — the board carries both onesies and skill players",
   len(onesies) > 0 and len(skills) > 0, (len(onesies), len(skills)))

best_onesie = min(p["overall_rank"] for p in onesies)
worst_skill = max(p["overall_rank"] for p in skills)
ck("CORY'S RULING 2026-08-17 — every K and DEF ranks BELOW every skill player "
   "in the cross-position order (Houston DEF was 39th, Aubrey 44th)",
   best_onesie > worst_skill, {"best_onesie": best_onesie, "worst_skill": worst_skill})

ck("… and they still carry a real vorp and sort sensibly among themselves — "
   "demoted, never unranked",
   all(p.get("vorp") is not None for p in onesies)
   and [p["name"] for p in sorted(onesies, key=lambda p: p["overall_rank"])][:1]
   == [p["name"] for p in sorted(onesies, key=lambda p: -(p.get("vorp") or 0))][:1],
   [(p["name"], p.get("vorp"), p["overall_rank"])
    for p in sorted(onesies, key=lambda p: p["overall_rank"])[:3]])

# ── the ranks themselves must be a clean permutation ─────────────────────────
ranks = sorted(p["overall_rank"] for p in PLAYERS)
ck("overall_rank is a clean 1..N with no gaps or duplicates",
   ranks == list(range(1, len(PLAYERS) + 1)),
   {"n": len(PLAYERS), "min": ranks[0], "max": ranks[-1],
    "dupes": len(ranks) - len(set(ranks))})

# ── PYTEST ENTRY POINT, ADDED 2026-08-20 ────────────────────────────────────
#
# ⚠️ THIS FILE COLLECTED **ZERO** TESTS UNDER PYTEST AND HAD BEEN READING AS
# GREEN. It is named test_*.py, so the gate's `pytest draft/tests` imports it —
# the checks above run at IMPORT and the old tail called sys.exit(1) on failure.
# pytest reports that as a collection ERROR, not a FAILED line. The board gate
# greps for "^FAILED" to decide what broke, found nothing, and refused to
# publish with "no FAILED lines parsed — treating as BLOCKING". That is the gate
# behaving correctly on a file I wrote badly, and it cost Cory a board rebuild
# the night before keeper lock.
#
# Found by test_ci_loop_integrity, which exists for exactly this: "a test_*.py
# that collects zero tests is a silent no-op — pytest passes it."
#
# The checks still run at import, so the standalone `python3 <file>` output is
# unchanged. This just gives pytest something to collect and fail on.


def test_all_checks_pass():
    assert not _fails, "%d check(s) failed: " % len(_fails) + "; ".join(_fails)


if __name__ == "__main__":
    print("\n%d checks, %d failed" % (7, len(_fails)))
    if _fails:
        print("FAILED")
        sys.exit(1)
