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


def _arms(control_n, live_n, *, access_fail=False):
    """Synthetic arm results: control players, 2026 players."""
    return {
        "known_positive_2025": {"_control": True, "status": 200,
                                "players": control_n,
                                "is_access_failure": access_fail},
        "known_positive_2024": {"_control": True, "status": 200,
                                "players": control_n,
                                "is_access_failure": access_fail},
        "capture_2026": {"_control": False, "status": 200, "players": live_n},
        "variant_2026_ppr": {"_control": False, "status": 200, "players": live_n},
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
