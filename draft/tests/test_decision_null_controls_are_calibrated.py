"""THE FIVE DECISION-NULL CONTROLS MUST BE ESTIMATES, NOT COIN FLIPS.

Found 2026-11-01, while answering Cory's question "Is it learning?".

The weekly learning loop (`weekly-grade.yml`) had been RED for five days. The
cause was not a bad number — it was a good gate, miscalibrated:

  `waiver_vs_random.py`'s known-negative control asks "what does a RANDOM
  available player score on this same null?" and must land at 0.5. It drew ONE
  random player per claim. Measured across 8 seeds it sat at 0.5025 — UNBIASED,
  exactly as its construction implies, since the control draw and the draws it
  is ranked against are i.i.d. from one pool — but with an sd of the mean of
  0.0137 against a gate of ±0.0190. That is a nominal-95% gate failing 2 of 8
  seeds, and on 2026-10-27 the shipped seed was one of them.

  The headline it was guarding never moved: 0.7159, sd 0.0008 across the same
  seeds. Five days of a red loop over an instrument's own noise.

ALL FIVE GRADERS SHARED IT, both halves:
  1. ONE DRAW IS AN OPINION. Fixed by averaging CTL_REPS draws per decision,
     which divides the control's dominant variance term by CTL_REPS.
  2. THE BAND ASSUMED A UNIFORM CONTROL — sd = sqrt(1/12) = 0.2887 — when the
     measured per-decision sd is 0.2630, because these values are discrete with
     a large atom (most waiver adds never score again) so the mid-rank piles up
     at 0.5. Fixed by using the control's OWN dispersion.

That `draft_pick_vs_random.py` moved from 0.4992 to 0.4816 — 69% of its band —
on a re-run with NO code change is the defect demonstrating itself.

⚠️ A HYPOTHESIS THAT DIED ON MEASUREMENT, recorded so nobody re-runs it: the
obvious story was clustering (883 claims in only 58 season-week cells, so the
i.i.d. SE should understate). A cluster-robust SE is SMALLER still — 0.0075 vs
0.0089 i.i.d. vs 0.0097 assumed — the wrong direction. Every WITHIN-RUN
estimator understates the true Monte-Carlo SE of 0.0137, which is why
MC_ALLOWANCE exists and why the band is validated against a seed sweep rather
than trusted from a formula.

⚠️ THE FIX MAKES THE GATES MORE SENSITIVE, NOT LOOSER, and that is the point:
after it, a +0.01 injected bias is caught where the old ±0.0190 band missed
anything under 0.019. So if `drop` (0.5032) or `keeper` (0.5055) trips in a
coming week it is more likely a REAL small bias in that null than noise — the
opposite of the situation this fixed. Investigate, do not widen the band.

Run: python3 -m pytest draft/tests/test_decision_null_controls_are_calibrated.py -q
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
BT = ROOT / "draft" / "backtest"
GRADERS = ["start_sit", "waiver", "draft_pick", "drop", "keeper"]


def src(name: str) -> str:
    return (BT / f"{name}_vs_random.py").read_text(encoding="utf8")


@pytest.mark.parametrize("name", GRADERS)
def test_control_averages_more_than_one_draw(name):
    """One draw per decision is the defect. CTL_REPS must exist and exceed 1."""
    s = src(name)
    m = re.search(r"^CTL_REPS\s*=\s*(\d+)", s, re.M)
    assert m, (f"{name}: no CTL_REPS — its known-negative control is back to a "
               "single draw per decision, which is a coin flip, not an estimate")
    assert int(m.group(1)) > 1, f"{name}: CTL_REPS={m.group(1)} is still one draw"
    # and it must actually be USED to build the control, not merely defined
    assert "for _ in range(CTL_REPS)" in s, (
        f"{name}: CTL_REPS is defined but the control loop does not use it")


@pytest.mark.parametrize("name", GRADERS)
def test_band_is_not_the_uniform_assumption(name):
    """sqrt(1/12) is the sd of a UNIFORM variate. These controls are not
    uniform — they pile up at 0.5 — so the band must come from the control's
    own measured dispersion."""
    s = src(name)
    band = re.search(r"ctl_half\s*=\s*(.+?)\n(?:\s{16,}.+\n)*", s)
    assert band, f"{name}: could not find the ctl_half assignment"
    region = s[band.start():band.start() + 400]
    assert "statistics.stdev(ctl_rand)" in region, (
        f"{name}: the known-negative band is not derived from the control's own "
        f"dispersion. Got: {region[:160]!r}")
    assert "1.0 / 12.0" not in region and "1/12" not in region, (
        f"{name}: the band is back on the uniform sd=sqrt(1/12) assumption, "
        "which is 1.1x too wide per-draw here and was the second half of the "
        "2026-11-01 defect")


@pytest.mark.parametrize("name", GRADERS)
def test_committed_control_sits_inside_its_own_band(name):
    """The artifact on disk must be one a green run produced. A committed
    artifact whose control is outside its band means the loop is red."""
    d = json.loads((BT / f"{name}_vs_random.json").read_text(encoding="utf8"))
    c = d["controls"]
    neg = [k for k in c if k.startswith("random")]
    assert neg, f"{name}: no known-negative control key in the artifact"
    v = c[neg[0]]
    half = c["known_negative_band_half_width"]
    assert abs(v - 0.5) <= half, (
        f"{name}: committed known-negative {v:.4f} is outside ±{half:.4f}. "
        "Either the grader is genuinely biased (investigate the null — do NOT "
        "widen the band) or the artifact predates the calibration fix.")


@pytest.mark.parametrize("name", GRADERS)
def test_the_control_is_actually_precise_now(name):
    """⚠️ THE ASSERTION THAT WOULD HAVE CAUGHT THIS. The old control could sit
    anywhere in a ±0.019 band and still pass, so "passes" carried almost no
    information. Averaging makes it precise, so we can demand it land CLOSE to
    0.5 — which is what a known-negative control is for.

    Deliberately generous (0.02 absolute) so it tracks gross breakage rather
    than the per-grader band, which each grader checks for itself above.
    """
    d = json.loads((BT / f"{name}_vs_random.json").read_text(encoding="utf8"))
    c = d["controls"]
    v = c[[k for k in c if k.startswith("random")][0]]
    assert abs(v - 0.5) <= 0.02, (
        f"{name}: known-negative {v:.4f} is more than 0.02 off 0.5. A random "
        "chooser scoring that far from chance means the null is not the null.")


def test_headline_verdicts_survived_the_recalibration():
    """A calibration change must not move the findings. These are the values
    measured immediately after the fix; a drift past 0.02 means the fix touched
    the estimate and not just its gate."""
    expected = {"start_sit": 0.8504, "waiver": 0.7147, "draft_pick": 0.8515,
                "drop": 0.7999, "keeper": 0.9074}
    for name, want in expected.items():
        d = json.loads((BT / f"{name}_vs_random.json").read_text(encoding="utf8"))
        got = d["mean_percentile"]
        assert abs(got - want) <= 0.02, (
            f"{name}: headline moved {want} -> {got}. The control fix changes "
            "the GATE, never the estimate; a real move here needs explaining.")
        # and every one of them must still clear chance, or the instrument is
        # saying something new that belongs in a register row, not a test
        assert got > 0.55, f"{name}: headline {got} no longer clears chance"
