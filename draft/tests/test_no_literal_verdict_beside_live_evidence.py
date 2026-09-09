# TERRITORY: A
"""A VERDICT WRITTEN AS A LITERAL, SITTING BESIDE THE MEASUREMENT IT JUDGES.

⚠️ THIS IS THE MOST-REPEATED DEFECT IN THIS PROJECT. `DEFECT-REGISTER.md` has
**31 rows** naming some form of it — register 5h's family — and CLAUDE.md
carries at least three corrections of ITSELF for it, each written after the
previous one had already described the pattern in its own words.

    a claim ships · the number it describes moves · the claim does not

It has been fixed one instance at a time for a month, which is why it is still
here. On 2026-09-09 it refused the board publish for SIX DAYS:
`board_vs_market`'s dynasty arm reported `"control": "PASSES — sign flips
against FFC"` as a literal string while `age_rho_non_qb` was measured live and
had moved +0.425 → -0.056. And when that was fixed, the RECEPTION arm four keys
away in the same function was still quoting "-0.301" for a value computed two
lines above it. Fixing the instance in front of you and leaving its twin is the
mechanism by which this survives.

So this file guards the CLASS, not an instance.

THE SHAPE, and why it is detectable: a dict that carries BOTH a hardcoded
verdict string AND a computed value is claiming a conclusion about numbers it
is measuring in the same breath. The verdict cannot go false when the numbers
move, because it is a constant. Either it should be COMPUTED from them, or it
is a static statement about the METHOD and not about this run — and that
distinction has to be written down by a human, once, rather than guessed at.

⚠️ AST, NOT REGEX. This repo's own record: "a sweep for missing controls that
matched on vocabulary" is on the list of nine probes that returned confident
wrong answers in a single evening (rule 3f). Verdict words appear in prose,
comments and test names everywhere; only the STRUCTURE distinguishes a reported
verdict from a sentence about one.

⚠️ AND THE FIRST CUT HAD ~40% PRECISION, WHICH IS WHY THERE IS AN ALLOWLIST.
It flagged 5 sites; 2 were real and 3 were static-by-design method notes. A
guard that is wrong three times in five is a guard people delete — this repo
says so in three separate places. So every site is classified ONCE, by a human,
with the reason in this file; anything new is a failure until someone does the
same. Same instrument as `constant_multiple_sweep.py`'s KNOWN_PARTICIPANTS.

Run: python -m pytest draft/tests/test_no_literal_verdict_beside_live_evidence.py
"""
from __future__ import annotations

import ast
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent

# Words that assert an OUTCOME. Deliberately not "verdict-ish" words like
# "note" or "reading" — the filter is the structure below, not this list.
VERDICT_WORDS = (
    "PASSES", "FAILS", "REFUTED", "CONFIRMED", "HOLDS", "SURVIVES",
    "RULED OUT", "NOT ESTABLISHED", "DETECTED", "NO EFFECT",
)

# ── CLASSIFIED SITES ────────────────────────────────────────────────────────
#
# A site is (file, dict-key). Being here means a human read it and decided the
# string is a statement about the METHOD or the DECISION RULE, true regardless
# of what this run measured — not a verdict that can go stale.
#
# ⚠️ ADDING A LINE HERE IS A DELIBERATE ACT AND NEEDS THE REASON WRITTEN. It is
# not a way to quiet a red. If the string's truth depends on a number in the
# same dict, it belongs in code as a computation, not here.
STATIC_BY_DESIGN = {
    ("draft/backtest/tiered_outcome_model.py", "reading"):
        "Describes the PREREGISTERED DECISION ORDER — 'MISCALIBRATED leads if "
        ">=2 of 5 reliability buckets miss, then CONFIRMED, then REDUNDANT, "
        "then NULL'. That is the rule the run is judged BY, fixed before the "
        "run; it is not this run's outcome and must not move with the data.",
    ("draft/backtest/pace_arm.py", "k_IS_NOT_leak_free"):
        "A METHODOLOGICAL caveat, always true of the procedure: k is an "
        "in-sample optimum over the declared grid, so the arm is legitimate "
        "evidence only if it FAILS. True on every board and every season; a "
        "computed version would say the same thing forever.",
    ("draft/backtest/ingest_run.py", "pass_td_note"):
        "A property of the F1 SCREEN, not of the sampled pool: a league "
        "differing from us only in passing-TD value passes F1, so passing-TD "
        "value cannot be why our format is rare. Follows from the screen's "
        "definition, not from the counts beside it.",
    ("draft/backtest/exp_participation.py", "prereg_outcome"):
        "The GRADED OUTCOME of a completed preregistered experiment, recorded "
        "as history. A prereg's verdict is fixed the moment it is graded — "
        "re-deriving it from a later run is exactly the researcher degree of "
        "freedom a prereg exists to remove. ⚠️ THIS ONE IS THE ARGUABLE ENTRY: "
        "if this dict is ever recomputed and re-published as CURRENT rather "
        "than archived, it becomes the live class and must move to code.",
}


def _sites() -> list[tuple[str, str, int, str]]:
    """(relpath, key, lineno, text) for every literal verdict beside a
    computed value. Tests are excluded: a verdict string in a test IS the
    assertion, which is the point of a test."""
    out = []
    for p in sorted((ROOT / "draft").rglob("*.py")):
        rel = str(p.relative_to(ROOT))
        if "/tests/" in rel:
            continue
        try:
            tree = ast.parse(p.read_text())
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.Dict):
                continue
            literal, computed = [], False
            for k, v in zip(node.keys, node.values):
                key = k.value if isinstance(k, ast.Constant) else None
                if isinstance(v, ast.Constant) and isinstance(v.value, str):
                    if any(w in v.value for w in VERDICT_WORDS):
                        literal.append((key, getattr(v, "lineno", 0), v.value))
                elif isinstance(v, (ast.Call, ast.BinOp, ast.IfExp,
                                    ast.Compare, ast.Subscript)):
                    computed = True
            if computed:
                for key, line, text in literal:
                    out.append((rel, key, line, text))
    return out


def test_no_UNCLASSIFIED_literal_verdict_sits_beside_live_evidence():
    unknown = [(f, k, ln, t) for f, k, ln, t in _sites()
               if (f, k) not in STATIC_BY_DESIGN]
    assert not unknown, (
        "A hardcoded VERDICT is sitting in the same dict as a value computed "
        "from live data. It cannot go false when that value moves — which is "
        "this project's most-repeated defect (31 register rows, register 5h's "
        "family), and which refused the board publish for six days on "
        "2026-09-09.\n\n"
        + "\n".join(f"  {f}:{ln}  key={k!r}\n    {t[:110]!r}"
                    for f, k, ln, t in unknown)
        + "\n\n  Either COMPUTE it from the numbers beside it (see "
          "board_vs_market._flip_verdict / _same_sign_verdict), or add it to "
          "STATIC_BY_DESIGN in this file WITH the reason it cannot go stale."
    )


def test_KNOWN_POSITIVE_the_real_pre_fix_dynasty_verdict_is_caught():
    """Rule 3e: a clean sweep is only evidence if the sweep can return a hit.

    The fixture is the dynasty dict EXACTLY as it stood before register 497,
    not an invented shape — if this stops firing, the detector has stopped
    detecting and the test above is decoration.
    """
    src = '''
def f(rho, non_qb, nb, wide, hit, thin):
    return {
        "age_rho_non_qb": None if rho is None else round(rho, 3),
        "n": len(non_qb), "null": nb,
        "control_ffc_rho": -0.200,
        "control": "PASSES — sign flips against FFC (redraft), which is what "
                   "a dynasty/keeper composition predicts and what the "
                   "reception arm failed to do.",
        "detected": bool((not thin) and hit),
    }
'''
    tree = ast.parse(src)
    found = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Dict):
            continue
        lit = [k.value for k, v in zip(node.keys, node.values)
               if isinstance(v, ast.Constant) and isinstance(v.value, str)
               and any(w in v.value for w in VERDICT_WORDS)]
        comp = any(isinstance(v, (ast.Call, ast.BinOp, ast.IfExp, ast.Compare,
                                  ast.Subscript))
                   for v in node.values)
        if lit and comp:
            found += lit
    assert "control" in found, (
        "THE KNOWN POSITIVE FAILED: the detector no longer catches the exact "
        "code that refused the board for six days, so a clean sweep proves "
        "nothing. Fix this before trusting the test above.")


def test_FAIL_ARM_the_COMPUTED_form_is_not_flagged():
    """The fix must read as clean, or the guard punishes the repair and gets
    switched off. Same dict, verdict derived instead of typed."""
    src = '''
def f(rho, ctrl, non_qb):
    return {"age_rho_non_qb": round(rho, 3), "n": len(non_qb),
            "control_ffc_rho": ctrl,
            "control": _flip_verdict(rho, ctrl, "a", "b")}
'''
    for node in ast.walk(ast.parse(src)):
        if isinstance(node, ast.Dict):
            for v in node.values:
                assert not (isinstance(v, ast.Constant)
                            and isinstance(v.value, str)
                            and any(w in v.value for w in VERDICT_WORDS)), v.value


def test_every_ALLOWLIST_entry_still_points_at_real_code():
    """An allowlist naming sites that no longer exist is a list nobody has
    read since. Each entry must still resolve to a site the sweep finds —
    otherwise it is silently excusing nothing while looking like diligence."""
    live = {(f, k) for f, k, _, _ in _sites()}
    ghosts = [s for s in STATIC_BY_DESIGN if s not in live]
    assert not ghosts, (
        "these allowlist entries match no code — the site moved, was renamed, "
        f"or was fixed; delete them: {ghosts}")


def test_every_ALLOWLIST_entry_CARRIES_a_reason():
    """A bare exemption is how an allowlist becomes a dumping ground."""
    for site, why in STATIC_BY_DESIGN.items():
        assert len(why) > 80, (site, "the reason must actually explain why the "
                                     "string cannot go stale, not just assert it")
