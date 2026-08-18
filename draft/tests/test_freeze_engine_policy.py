# TERRITORY: A
"""THE FREEZE MUST RECORD THE POLICY IT FROZE — and must never GUESS it.

Register 4i, 2026-08-17. `pre_draft_freeze_2026.json` carries no `engine_policy`
key at all, so the war room's "⏮ Restore the measured core" control never
renders: `app.js renderBaselineControl` guards on
`if (!b || !b.engine_policy) { host.innerHTML = ''; return; }`. A built feature
has been invisible for the life of the artifact and nothing failed, because the
guard is correct — the data was simply never there.

(The relay first reported this as a button that renders and silently does
nothing. Wrong: it is absent, not dead. The correction is recorded rather than
quietly swapped, because the alarming version travelled first.)

THE REAL STAKE IS NOT THE BUTTON. The freeze's own payload claims every
valuation path is "recomputable from inputs". The WEIGHTS are an input. Without
them the artifact pins what the board said but not the policy that said it, so a
replay reproduces the numbers only by trusting whatever weights happen to be
loaded that day — the one thing an immutable reference exists to prevent.

WHY IT IS PARSED FROM engine.js AND NOT TYPED HERE. A hand-copied dict is a
second source of truth for the policy: the "two places" disease that let the
ceiling weight sit at 0.65 in the loaded core for weeks after the ledger
measured it at -4.8, with nothing failing. These tests pin the parse, and the
one that matters proves it really is a parse — feed it a DIFFERENT engine and
the answer must change.

Run: python3 -m pytest draft/tests/test_freeze_engine_policy.py -q
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))

import freeze_pre_draft as F  # noqa: E402


def test_the_policy_matches_what_engine_js_actually_ships():
    pol = F.engine_policy()
    assert pol, "engine_policy() returned nothing against the real engine.js"
    w = pol["MEASURED_WEIGHTS"]
    src = (ROOT / "public" / "js" / "draft" / "engine.js").read_text()
    m = re.search(r"const\s+MEASURED_WEIGHTS\s*=\s*\{(.*?)\}", src, re.S)
    assert m, "engine.js no longer declares MEASURED_WEIGHTS in the expected shape"
    for key, val in re.findall(r"([A-Za-z_]\w*)\s*:\s*(-?\d+(?:\.\d+)?)", m.group(1)):
        assert w[key] == float(val), f"{key}: freeze says {w[key]}, engine says {val}"


def test_it_carries_corys_ruled_ceiling_rather_than_a_stale_constant():
    """Cory ruled ceiling = 0.45 and it shipped at 09f94f99. If the freeze ever
    records something else, the artifact is claiming a policy the engine does
    not run — which is exactly the disagreement this field exists to make
    impossible."""
    assert F.engine_policy()["MEASURED_WEIGHTS"]["ceiling"] == 0.45


def test_IT_REALLY_PARSES_a_different_engine_gives_a_different_answer(monkeypatch, tmp_path):
    """THE CONTROL, and the only test here that proves anything.

    Every assertion above would pass identically if engine_policy() returned a
    hardcoded dict that happened to match today's engine. This points it at a
    SYNTHETIC engine.js with deliberately absurd weights and requires the output
    to follow. If this fails, the function is a copy and the freeze has become
    the second source of truth it was written to avoid."""
    fake = tmp_path / "engine.js"
    fake.write_text(
        "const DEFAULT_WEIGHTS = { value: 9.9 };\n"
        "  const MEASURED_WEIGHTS = { value: 0.125, tier: 7.0, ceiling: 3.5,\n"
        "    keeper: 0.0, stack: 0.25 };\n")
    monkeypatch.setattr(F, "ENGINE_JS", fake)
    w = F.engine_policy()["MEASURED_WEIGHTS"]
    assert w == {"value": 0.125, "tier": 7.0, "ceiling": 3.5,
                 "keeper": 0.0, "stack": 0.25}, (
        "engine_policy() did not follow a synthetic engine.js — it is returning "
        "a constant, not parsing, which makes the freeze a SECOND source of "
        "truth for the policy instead of a record of it")


@pytest.mark.parametrize("body,why", [
    ("", "an empty file"),
    ("const SOMETHING_ELSE = { value: 1.0 };", "no MEASURED_WEIGHTS declaration"),
    ("const MEASURED_WEIGHTS = { };", "a declaration with no numeric weights"),
])
def test_A_POLICY_IT_CANNOT_READ_IS_OMITTED_never_guessed(monkeypatch, tmp_path, body, why):
    """FAIL ARMS. A partial or invented policy is worse than none: the entire
    value of the field is that a replay can TRUST it. On any parse failure the
    function returns {}, and the freeze then simply omits the key — which
    restores exactly the honest old behaviour (the war-room control stays
    hidden) instead of freezing a wrong policy that looks authoritative."""
    fake = tmp_path / "engine.js"
    fake.write_text(body)
    monkeypatch.setattr(F, "ENGINE_JS", fake)
    assert F.engine_policy() == {}, f"should refuse to guess a policy from {why}"


def test_a_missing_engine_file_is_also_omitted_not_an_exception():
    """The freeze is the one irreversible step in the plan. It must not crash
    on a missing optional input — it should record less, never fail late."""
    import types
    saved = F.ENGINE_JS
    try:
        F.ENGINE_JS = Path("/nonexistent/engine.js")
        assert F.engine_policy() == {}
    finally:
        F.ENGINE_JS = saved
    assert isinstance(types, types.ModuleType)  # keep the import honest
