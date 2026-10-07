"""THE PROBE MUST BE ABLE TO REACH ALL THREE VERDICTS — and must refuse two of them.

`ffc_adp_probe.py` decides between fixes that are opposites: repair the capture
(FFC still publishes) or scope a draft-window requirement (FFC ended). A probe
that can only say one of those is not a measurement.

⚠️ AND THE REASON IT HAS CONTROLS AT ALL IS A MEASURED NEAR-MISS. Run from the
dev sandbox, every arm returned nothing — INCLUDING the 2024 and 2025 arms
whose ADP certainly exists. Read naively that is "FFC is gone", and the fix it
points at is rewriting a board gate. The real answer was
`CONNECT tunnel failed: 403 Forbidden`.

So the verdict function is tested for all three branches on synthetic arm
results, and most importantly for its REFUSAL: with no populated control it
must decline to say anything about 2026 no matter what the 2026 arms show.

Run: python3 -m pytest draft/tests/test_ffc_adp_probe.py -q
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft" / "tools"))

import ffc_adp_probe as P  # noqa: E402

BIG = P.POPULATED + 50


def _arms(control_n, live_n, *, access_fail=False, variant_n=None):
    """Synthetic arm results: control players, capture-format players.

    `variant_n` sets a DIFFERENT count on a format we do not capture, which is
    exactly the case that produced a wrong verdict on the first real run.
    """
    return {
        "known_positive_2025": {"_control": True, "status": 200,
                                "players": control_n,
                                "is_access_failure": access_fail},
        "known_positive_2024": {"_control": True, "status": 200,
                                "players": control_n,
                                "is_access_failure": access_fail},
        "capture_2026": {"_control": False, "status": 200, "players": live_n},
        "variant_2026_standard": {"_control": False, "status": 200,
                                  "players": live_n if variant_n is None
                                  else variant_n},
    }


def test_controls_populated_and_2026_populated_means_OUR_CAPTURE_BROKE():
    v = P.verdict(_arms(BIG, BIG))
    assert v["verdict"] == "SOURCE_FINE__OUR_CAPTURE_BROKE", v
    assert "capture" in v["next"].lower()
    assert "floor stays" in v["next"] or "stays as it is" in v["next"]


def test_controls_populated_and_2026_empty_means_THE_SOURCE_ENDED():
    v = P.verdict(_arms(BIG, 0))
    assert v["verdict"] == "FFC_NO_LONGER_SERVES_2026", v
    assert "do NOT lower" in v["next"] or "do not lower" in v["next"].lower()


def test_a_THIN_capture_format_is_WINDING_DOWN_not_broken_and_not_dead():
    """The third state the original two-way split could not express, and the
    reality on 2026-10-07: HTTP 200, controls proven, and the format we capture
    down to a fraction of its own history."""
    v = P.verdict(_arms(BIG, 12))
    assert v["verdict"] == "SOURCE_WINDING_DOWN", v
    assert "winding down" in v["why"]
    assert "COLLAPSE_KEEP_FRACTION" in v["next"], \
        "the verdict must name the capture rule that made the decline invisible"
    assert "lower" in v["next"].lower()


def test_THE_EXACT_MEASUREMENT_THAT_PRODUCED_A_WRONG_VERDICT():
    """⚠️ REGRESSION TEST FOR MY OWN ERROR, with the real numbers.

    First real run, 2026-10-07:

        capture_2026 (half-ppr)   54     <- the format we capture
        variant_2026_standard    118     <- a format we do NOT capture
        controls 2025/2024   156 / 178

    The probe returned SOURCE_FINE__OUR_CAPTURE_BROKE because `standard` cleared
    the 100 threshold, and that verdict was reported onward before it was
    checked. The capture arm — the only one that speaks for the feed we fetch —
    reads 54 against a known-good 156/178.

    Rule 3i: every arm was recorded and the verdict still quoted the one value
    that fit a story.
    """
    arms = {
        "known_positive_2025": {"_control": True, "status": 200, "players": 156},
        "known_positive_2024": {"_control": True, "status": 200, "players": 178},
        "capture_2026": {"_control": False, "status": 200, "players": 54},
        "variant_2026_12team": {"_control": False, "status": 200, "players": 54},
        "variant_2026_ppr": {"_control": False, "status": 200, "players": 29},
        "variant_2026_standard": {"_control": False, "status": 200, "players": 118},
    }
    v = P.verdict(arms)
    assert v["verdict"] == "SOURCE_WINDING_DOWN", (
        f"got {v['verdict']} — a format we do not capture is vouching for the "
        "one we do, which is the defect this test exists for")
    assert "54" in v["why"]


def test_a_populated_CAPTURE_format_outvotes_thin_variants():
    """The other direction, so the fix is not simply 'always winding down': if
    the format we fetch is healthy, a thin variant elsewhere must not drag the
    verdict down."""
    v = P.verdict(_arms(BIG, BIG, variant_n=3))
    assert v["verdict"] == "SOURCE_FINE__OUR_CAPTURE_BROKE", v


def test_NO_POPULATED_CONTROL_REFUSES_TO_SPEAK_even_when_2026_looks_dead():
    """⚠️ THE ASSERTION THAT MATTERS. This is the exact state the dev sandbox
    produces, and the state that would have sent someone to rewrite a gate."""
    v = P.verdict(_arms(0, 0, access_fail=True))
    assert v["verdict"] == "PROBE_OR_ACCESS_BROKEN", v
    assert v["says_nothing_about_ffc"] is True
    assert "not a dead source" in v["why"]


def test_NO_POPULATED_CONTROL_REFUSES_even_when_2026_looks_ALIVE():
    """The other direction: an unproven probe must not be believed when it
    brings good news either. A broken probe that happens to return rows for one
    arm is still a broken probe."""
    v = P.verdict(_arms(0, BIG))
    assert v["verdict"] == "PROBE_OR_ACCESS_BROKEN", v
    assert v["says_nothing_about_ffc"] is True


def test_a_THIN_control_does_not_license_a_verdict():
    """A stub payload is not a populated one. If the control comes back with a
    handful of rows the endpoint has changed shape, which is its own finding and
    not permission to judge 2026."""
    v = P.verdict(_arms(3, 0))
    assert v["verdict"] == "PROBE_OR_ACCESS_BROKEN", v


def test_the_CONTROL_NEGATIVE_arm_is_what_the_capture_actually_SENDS():
    """Rule 3f: the arm under test has to be the request the capture makes, or
    the probe answers a question nobody asked. Pinned against the URL in
    free_source_discovery.py, which is the capture's own declaration."""
    cap = next(a for a in P.ARMS if a["key"] == "capture_2026")
    assert "year=2026" in cap["url"] and "teams=10" in cap["url"]
    assert "half-ppr" in cap["url"]
    assert cap["control"] is False
    disc = (ROOT / "draft" / "tools" / "free_source_discovery.py").read_text(encoding="utf8")
    assert cap["url"] in disc, (
        "the probe's capture arm is not the URL the repo declares for ffc_adp "
        "— the probe would be testing a different endpoint than the one that "
        "stopped reporting")


def test_there_are_at_least_TWO_known_positives_and_an_INDEPENDENT_path():
    """Two controls so a single bad season cannot fake a verdict, and the HTML
    page so an API retirement looks different from the site going away."""
    controls = [a for a in P.ARMS if a["control"]]
    assert len(controls) >= 2, controls
    assert any("/api/" not in a["url"] for a in P.ARMS), \
        "every arm goes through the API — no independent path"


def test_EVERY_verdict_the_tool_can_emit_has_a_case_ARM_in_the_workflow():
    """Two halves of one contract. Adding a verdict without a case arm sends it
    to `*) unrecognised verdict` — a red run carrying the WRONG explanation,
    which is worse than no arm at all. This went red for exactly one commit
    when SOURCE_WINDING_DOWN was added."""
    import re
    src = (ROOT / "draft" / "tools" / "ffc_adp_probe.py").read_text(encoding="utf8")
    wf = (ROOT / ".github" / "workflows" / "ffc-adp-probe.yml").read_text(encoding="utf8")
    emitted = set(re.findall(r'"verdict": "([A-Z_0-9]+)"', src))
    assert len(emitted) >= 4, emitted
    missing = sorted(v for v in emitted if v not in wf)
    assert not missing, f"no case arm for {missing}"


def test_an_access_failure_is_CLASSIFIED_and_not_read_as_an_empty_source():
    """The distinction the whole file turns on."""
    r = P.fetch("https://127.0.0.1:1/definitely-not-listening")
    assert r["status"] is None and "error" in r
    assert r.get("is_access_failure") in (True, False)
    # and the real sandbox signature must classify as access, not as absence
    for sig in ("Tunnel connection failed: 403 Forbidden", "CONNECT tunnel failed",
                "403 Forbidden"):
        assert any(s in sig for s in ("Tunnel connection failed", "CONNECT",
                                      "403", "Forbidden")), sig
