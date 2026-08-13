# TERRITORY: C
"""CONSTANTS TRANSCRIBED FROM AN EXPERIMENT MUST STILL MATCH THE EXPERIMENT.

`public/js/draft/deviation.js` carries two blocks of numbers copied out of
experiment artifacts, each with its provenance in a comment above it and each
saying, in the comment, that it is to be REGENERATED from the artifact on a
re-fire and never hand-set:

  MARKET_EFFICIENCY  within-cell Spearman(-adp, realized) per round-band ×
                     position, from draft/backtest/exp36.json. Live: it sets the
                     deviation card's noise band, so it decides when the card
                     speaks at all.
  DEADZONE           the RB value cliff located on our own three seasons, from
                     draft/backtest/exp25_deadzone.json. Labelled INFORMATIONAL —
                     it is shown, not re-weighted into the board.

NOTHING CHECKED THAT THE COPIES STILL MATCH. A re-fire that moves a number
updates the artifact and leaves the live constant behind, and the drift is
invisible: both files are internally consistent, both read as current, and the
card keeps citing an exp36 that no longer says what it is quoted as saying. That
is the same defect as evidence that lives only in a commit message — it does not
become wrong loudly, it becomes wrong silently, on the day somebody re-runs the
study that produced it.

WHAT THIS IS NOT. Neither block is experiment output leaking into a live surface
by accident. Both are deliberate, cited, and the dead-zone one is explicitly held
to display only while a board change waits on the money-graded gate. Reading the
callers before reporting is what established that. This checks the ONE property
those comments promise and nothing verified: that the numbers agree.

WHEN THIS GOES RED it means an experiment was re-fired and its live citation was
not updated — or the reverse. The fix is to regenerate the constant from the
artifact, in the lane that owns deviation.js. The artifact is the source of
truth; the JS is the copy.

⚠ Either file absent reports UNCHECKED and skips. "Could not look" must never
read as "looked and it was fine".

Run: python3 -m pytest draft/tests/test_cited_constants.py -q
"""
import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
DEVIATION = ROOT / "public" / "js" / "draft" / "deviation.js"
EXP36 = ROOT / "draft" / "backtest" / "exp36.json"
EXP25 = ROOT / "draft" / "backtest" / "exp25_deadzone.json"

#: Rounding of the transcribed values. The artifact carries full precision and the
#: JS carries what a human copied, so an exact float compare would fail on a
#: difference nobody made. Three places is finer than any of the constants are
#: written to, so a real edit still fails.
PLACES = 3


def _read(p):
    if not p.exists():
        pytest.skip("UNCHECKED: %s is not present — this says nothing about the "
                    "constants in it" % p)
    return p.read_text()


def js_object(src: str, name: str) -> dict:
    """The `var NAME = { ... };` literal, as nested dicts of numbers and strings.

    Deliberately a small parser rather than a regex per value: a per-value regex
    finds the numbers it is told to look for and is silent about a key that was
    added, which is the direction this check is supposed to fail in.
    """
    m = re.search(r"var\s+%s\s*=\s*\{" % re.escape(name), src)
    assert m, "no `var %s = {` in the file — the block was renamed or removed" % name
    i = m.end() - 1
    depth, end = 0, None
    for j in range(i, len(src)):
        if src[j] == "{":
            depth += 1
        elif src[j] == "}":
            depth -= 1
            if depth == 0:
                end = j + 1
                break
    assert end, "unbalanced braces after `var %s`" % name
    body = src[i:end]
    body = re.sub(r"//[^\n]*", "", body)
    body = re.sub(r"/\*.*?\*/", "", body, flags=re.S)
    body = re.sub(r"'([^']*)'", r'"\1"', body)              # 'r1-3' -> "r1-3"
    body = re.sub(r"([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:", r'\1"\2":', body)
    body = re.sub(r",(\s*[}\]])", r"\1", body)              # trailing commas
    return json.loads(body)


def exp36_surface() -> dict:
    """The efficiency of every RANKED cell, keyed as the JS keys it.

    Unranked cells are excluded on purpose: a thin cell has `efficiency: None`
    and defaults to a full market anchor, so it is absent from the JS by design
    rather than missing from it.
    """
    cells = json.loads(_read(EXP36))["surface"]["cells"]
    return {band: {pos: c["efficiency"] for pos, c in byp.items() if c.get("ranked")}
            for band, byp in cells.items()}


def test_the_parser_FINDS_the_block_and_reads_real_numbers():
    """Proved before it is trusted. A parser that quietly returns `{}` makes every
    comparison below pass over nothing, which is the failure this lane keeps
    finding in its own detectors."""
    got = js_object(_read(DEVIATION), "MARKET_EFFICIENCY")
    assert got, "the parser returned nothing"
    assert set(got) == {"r1-3", "r4-7", "r8-11", "r12+"}, got
    assert isinstance(got["r1-3"]["RB"], float), got["r1-3"]
    assert len([1 for b in got.values() for _ in b]) >= 8, got


def test_a_BLOCK_THAT_HAS_BEEN_RENAMED_fails_loudly():
    """The quiet way this whole file stops working. If the constant is renamed or
    removed, a parser that returned `{}` would make every comparison below pass
    over nothing — the check would go green on the exact edit that ended it. It
    has to raise instead, and the message has to say the block was not found
    rather than describe some mismatch.

    MUTATION: drop the `assert m` — the search returns None and the failure
    surfaces, if at all, as an unrelated TypeError somewhere downstream."""
    with pytest.raises(AssertionError) as e:
        js_object("var SOMETHING_ELSE = { RB: 1 };\n", "MARKET_EFFICIENCY")
    assert "MARKET_EFFICIENCY" in str(e.value)
    assert "renamed or removed" in str(e.value)


def test_the_COMPARISON_FIRES_on_a_planted_mismatch():
    """The detector, not the data. One digit changed in a copy of the parsed
    block must be found — otherwise "they agree" is a statement about the
    comparison rather than about the files.

    MUTATION: compare only the KEYS, which is the natural way to write this and
    passes for every possible set of values."""
    live = js_object(_read(DEVIATION), "MARKET_EFFICIENCY")
    truth = exp36_surface()
    bent = {b: dict(v) for b, v in live.items()}
    bent["r1-3"]["RB"] = round(bent["r1-3"]["RB"] + 0.01, PLACES)
    diffs = _diff(bent, truth)
    assert diffs and "r1-3.RB" in diffs[0], diffs


def _diff(live, truth):
    out = []
    for band in sorted(set(live) | set(truth)):
        lo, to = live.get(band) or {}, truth.get(band) or {}
        for pos in sorted(set(lo) | set(to)):
            a, b = lo.get(pos), to.get(pos)
            if a is None or b is None or round(a, PLACES) != round(b, PLACES):
                out.append("%s.%s: live=%r artifact=%r" % (band, pos, a, b))
    return out


def test_MARKET_EFFICIENCY_still_matches_exp36():
    """The live constant decides the deviation card's noise band, so a stale copy
    changes when the card speaks — silently, while still citing exp36."""
    diffs = _diff(js_object(_read(DEVIATION), "MARKET_EFFICIENCY"), exp36_surface())
    assert not diffs, (
        "deviation.js MARKET_EFFICIENCY no longer matches draft/backtest/exp36.json: "
        "%s. The artifact is the source of truth — regenerate the constant from it, "
        "as the comment above the block says to." % diffs)


def test_DEADZONE_still_matches_exp25():
    """Three numbers, each of which is a claim the card makes on screen: where the
    RB cliff starts, where it has bitten, and which position holds through it."""
    live = js_object(_read(DEVIATION), "DEADZONE")
    exp = json.loads(_read(EXP25))["rb_cliff"]
    cliff, cross = exp["cliff"], exp["crossover"]

    enter = int(str(cliff["from_band"]).split("-")[0])
    assert live["enter"] == enter, (
        "DEADZONE.enter is %r; exp25's cliff starts at band %s (pick %d)"
        % (live["enter"], cliff["from_band"], enter))
    assert live["inside"] == cliff["boundary_overall_pick"] == cross["overall_pick"], (
        "DEADZONE.inside is %r; exp25's boundary is %r"
        % (live["inside"], cliff["boundary_overall_pick"]))
    assert live["position"] == "RB", live
    # `holds` is the position that is still worth more AT the crossover — read off
    # the artifact rather than trusted, because it is the one value here that a
    # re-fire could genuinely invert.
    holds = "WR" if cross["WR"] > cross["RB"] else "RB"
    assert live["holds"] == holds, (
        "DEADZONE.holds is %r but at pick %s exp25 has RB=%s WR=%s"
        % (live["holds"], cross["overall_pick"], cross["RB"], cross["WR"]))
