# TERRITORY: D
"""A STUDY THAT GIVES A DIFFERENT ANSWER EVERY RUN CANNOT BE CHECKED BY ANYONE.

`opportunity_delta_arm.py`'s synthetic-recovery control selected its planted
sample with `hash((pid, week)) % 3`. Python randomises string hashing per
process, so the sample was redrawn on every run and the control reported
`mean_slope` 13.161, then 12.601, then 12.751 on identical inputs (D,
2026-09-02). The graded numbers were unaffected — n_player_weeks, every fold n
and every delta_mae were byte-identical across four runs, so P327's FALSE
verdict rests on reproducible arithmetic — but a CONTROL whose sample changes
every run is the one thing a control must never be.

⚠️ AND THE LESSON IS NOT THE INSTANCE. `league_history_contamination_sweep.py`
has carried an explicit determinism check since A's register 420, written by
the same hand that then shipped this without one. So this guards the CLASS
rather than the site: builtin `hash()` is banned from D's study code, because
its instability is invisible — the study runs, prints, exits 0, and simply
means something different tomorrow.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STUDY_DIRS = (ROOT / "draft" / "backtest", ROOT / "draft" / "tools")

#: `hash(` as a call, not `hashlib`, `.hash`, or a `hash` key/attribute.
BUILTIN_HASH = re.compile(r"(?<![\w.])hash\s*\(")


def _d_owned_studies():
    out = []
    for d in STUDY_DIRS:
        for p in sorted(d.glob("*.py")):
            head = p.read_text(errors="ignore")[:400]
            if "TERRITORY: D" in head:
                out.append(p)
    return out


def test_the_scan_finds_D_files_at_all():
    """The licence: if the territory header ever changes shape, the assertion
    below passes on an empty list and this file becomes decoration."""
    files = _d_owned_studies()
    assert len(files) >= 5, f"only {len(files)} D-owned study files found"


def test_no_D_study_selects_a_sample_with_builtin_hash():
    bad = []
    for p in _d_owned_studies():
        for i, line in enumerate(p.read_text(errors="ignore").splitlines(), 1):
            if line.lstrip().startswith("#"):
                continue
            if BUILTIN_HASH.search(line):
                bad.append(f"{p.relative_to(ROOT)}:{i}: {line.strip()[:90]}")
    assert not bad, (
        "builtin hash() is per-process randomised, so anything selected with it "
        "is redrawn every run and the study stops being reproducible. Use "
        "hashlib (stable across processes) or a seeded rng:\n  " + "\n  ".join(bad))


def test_CONTROL_the_detector_actually_fires():
    """RULE 3E — the test above returns a null, and a null from a detector that
    has never returned a positive is a bug report. This is its positive: the
    exact line that was in `opportunity_delta_arm.py` until 2026-09-02."""
    assert BUILTIN_HASH.search("        if hash((pid, week)) % 3 == 0:")
    assert BUILTIN_HASH.search("x = hash(pid)")
    # and it must NOT fire on the legitimate neighbours it has to live beside
    assert not BUILTIN_HASH.search("import hashlib as _hashlib")
    assert not BUILTIN_HASH.search("_hashlib.blake2b(b'x').hexdigest()")
    assert not BUILTIN_HASH.search('doc["sha"] = fingerprint(rows)')
    assert not BUILTIN_HASH.search("self.hash(x)")
