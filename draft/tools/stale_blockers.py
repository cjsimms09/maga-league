#!/usr/bin/env python3
# TERRITORY: relay — the relay owns "nothing is lost", and losing a RETIRED BLOCKER
# is how a ruling stays blocked after the thing blocking it went away.
"""WHICH REFUSALS ARE STILL BLOCKED ON A REASON THAT NO LONGER HOLDS?

On 2026-08-18 this project's most expensive failure mode turned out not to be wrong
measurements. **It was correct measurements that never got connected to each other**,
and the clearest case cost a ruling of Cory's:

    proj_mean_blend.json   08-16 21:31   ship: REFUSE — "the CONTROL arm, Sleeper
                                         alone, has no per-player history for ANY
                                         graded season"
    sleeper_hist_proj.json 08-17 16:25   "1/3 season(s) passed every leak gate:
                                         [2025] … a three-way grade becomes
                                         licensable"

**Nineteen hours apart. Neither artifact references the other.** `DEFECT-REGISTER`
row 21 still carried the retired sentence as its reason for being open, so Cory's
blend ruling — *"Let's do it"* — sat blocked on something that had stopped being true
the following afternoon. Three separate rows described one job and none of them
pointed at the others.

Four near-misses of the same species happened in a single evening. That is a rate, not
an accident, and no amount of care fixes it: nobody re-reads every refusal every time a
new artifact lands.

── WHAT IT DOES ───────────────────────────────────────────────────────────────

Finds every artifact whose verdict is a REFUSAL, extracts the distinctive words of its
stated reason, and reports any artifact committed LATER whose own verdict shares enough
of those words to be worth a human's eye.

**IT PROPOSES PAIRS. IT DOES NOT JUDGE THEM** — the same rule `prior_art.py` follows,
for the same reason: a filter that silently drops the pair you needed reintroduces the
failure it exists to prevent. Every hit is a question ("has this blocker been retired?"),
never an answer.

Run:  python3 draft/tools/stale_blockers.py
      python3 draft/tools/stale_blockers.py --min-shared 3
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SEARCH_DIRS = ("draft/backtest", "draft/data", "draft/audit")

#: A verdict that says "we could not". These are the rows that go quiet.
BLOCKED_RE = re.compile(
    r"\brefuse|no_control|cannot|could not|insufficient|not measurable|no answer|"
    r"blocked|unmeasurable|no per-player|never measured|has no\b|not licensable",
    re.I,
)

#: Words that carry no topic. Without this every refusal matches every artifact.
STOP = set("""the a an and or of to in on for with is are was were be been being it its
this that these those from by as at any all no not have has had do does did we our us
they their there here what which who whom when where why how so than then thus can
could should would may might must will shall if but because while during into onto over
under again further once only very same such own too also just each both few more most
other some own s t don now d ll m o re ve y ain aren couldn didn doesn hadn hasn haven
isn ma mightn mustn needn shan shouldn wasn weren won wouldn status why n true false
none null value values row rows season seasons year years data one two three""".split())

TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z_\-]{2,}")


def tokens(text: str) -> set:
    """Distinctive lowercase words of a reason — the join key between artifacts."""
    return {w.lower() for w in TOKEN_RE.findall(text or "")
            if w.lower() not in STOP and len(w) > 3}


def verdict_text(doc) -> str:
    """Every verdict-ish string in an artifact, concatenated."""
    if not isinstance(doc, dict):
        return ""
    out = []
    for k, v in doc.items():
        if not re.search(r"verdict|headline|ship|clears|conclusion|_answer|_ruling|"
                         r"decision|why|gate", str(k), re.I):
            continue
        out.append(v if isinstance(v, str) else json.dumps(v, ensure_ascii=False))
    return " ".join(out)


def committed_at(path: Path, root: Path = ROOT) -> int | None:
    """Unix seconds of the last commit touching `path`; None if git knows nothing."""
    try:
        rel = str(path.relative_to(root))
        out = subprocess.run(["git", "log", "-1", "--format=%ct", "--", rel],
                             cwd=root, capture_output=True, text=True, timeout=20)
        s = (out.stdout or "").strip()
        return int(s) if s else None
    except Exception:
        return None


def collect(root: Path = ROOT, dirs=SEARCH_DIRS) -> list:
    rows = []
    for d in dirs:
        for f in sorted((root / d).glob("*.json")):
            try:
                doc = json.loads(f.read_text())
            except (ValueError, OSError):
                continue
            text = verdict_text(doc)
            if not text:
                continue
            rows.append({
                "path": str(f.relative_to(root)),
                "text": text,
                "blocked": bool(BLOCKED_RE.search(text)),
                "tokens": tokens(text),
                "at": committed_at(f, root),
            })
    return rows


def idf(rows: list) -> dict:
    """How rare is each word across the corpus? — the thing raw overlap ignores.

    THE FIRST CUT RANKED BY OVERLAP COUNT AND IT WAS USELESS. The top six pairs were
    all `nfl_schedule_*.json` matching each other on the boilerplate `_why` I had
    written into six copies of one template — "cannot, credits, free, odds, paid" —
    while the pair the tool was BUILT for sat thirty rows down, matched on `every`,
    `number`, `passed`. It found the right answer for the wrong reason and buried it
    under near-duplicates of itself.

    Weighting each shared word by its rarity fixes both halves at once: words repeated
    across a family of generated artifacts stop counting, and a genuinely distinctive
    term shared by two unrelated studies counts for a lot.
    """
    import math
    n = max(1, len(rows))
    df: dict = {}
    for r in rows:
        for w in r["tokens"]:
            df[w] = df.get(w, 0) + 1
    return {w: math.log(n / c) for w, c in df.items()}


def pairs(rows: list, min_shared: int = 4, min_score: float = 6.0,
          max_similarity: float = 0.55) -> list:
    """`(blocked, later, shared, score)` — a later artifact that speaks to a refusal.

    The LATER constraint is what makes this a retired-blocker check rather than a
    similarity search: an artifact that predates a refusal cannot have retired it.
    `score` is the summed rarity of the shared words, so a family of near-identical
    generated artifacts cannot dominate the ranking.
    """
    weights = idf(rows)
    out = []
    blocked = [r for r in rows if r["blocked"] and r["at"]]
    for b in blocked:
        for o in rows:
            if o is b or not o["at"] or o["at"] <= b["at"]:
                continue
            shared = b["tokens"] & o["tokens"]
            if len(shared) < min_shared:
                continue
            # SAME DOCUMENT, DIFFERENT FILE — the failure IDF could not fix.
            # `nfl_schedule_2021..2026` are six copies of one template I wrote, so
            # their shared words are genuinely RARE corpus-wide (6 of 96 artifacts)
            # and rarity-weighting ranked them top. Rarity cannot see duplication.
            # Two artifacts sharing most of their whole vocabulary are one finding
            # emitted twice, never a refusal and its rescuer.
            union = b["tokens"] | o["tokens"]
            if union and len(b["tokens"] & o["tokens"]) / len(union) >= max_similarity:
                continue
            score = sum(weights.get(w, 0.0) for w in shared)
            if score >= min_score:
                out.append((b, o, shared, round(score, 1)))
    out.sort(key=lambda t: -t[3])
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-shared", type=int, default=4)
    ap.add_argument("--min-score", type=float, default=6.0)
    ap.add_argument("--limit", type=int, default=15)
    a = ap.parse_args()

    rows = collect()
    ps = pairs(rows, a.min_shared, a.min_score)

    print("=" * 78)
    print("STALE BLOCKERS — refusals a later artifact may have retired")
    print("=" * 78)
    n_blocked = sum(1 for r in rows if r["blocked"])
    print(f"  {len(rows)} artifacts carry a verdict · {n_blocked} of them refuse something")
    if not ps:
        print("\n  No refusal shares vocabulary with anything committed after it.")
        print("=" * 78)
        return 0

    print(f"  {len(ps)} pair(s) worth a look, most-overlapping first:\n")
    weights = idf(rows)
    for b, o, shared, score in ps[:a.limit]:
        rare = sorted(shared, key=lambda w: -weights.get(w, 0))[:8]
        print(f"  ⛔ {b['path']}")
        print(f"  →  {o['path']}   (rarity {score})")
        print(f"     distinctive shared terms: {', '.join(rare)}")
        print()
    print("  Each line is a QUESTION — has this blocker been retired? — never an answer.")
    print("  The case that built this: proj_mean_blend refused for want of Sleeper")
    print("  history at 08-16 21:31; sleeper_hist_proj proved it exists at 08-17 16:25.")
    print("=" * 78)
    return 0


if __name__ == "__main__":   # pragma: no cover
    raise SystemExit(main())
