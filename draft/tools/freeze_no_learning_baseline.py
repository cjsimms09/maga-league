#!/usr/bin/env python3
# TERRITORY: D
"""FREEZE THE NO-LEARNING BASELINE — P298's control, captured on the day it means.

Cory, 2026-08-21 ("Make it a rule!"), `ADAPTATION-POLICY.md`'s cross-propagation
rule, clause 3: *"A frozen no-learning baseline runs forever. One arm that never
absorbs any propagated pattern is graded alongside the learning-enabled arms. If
learning cannot beat the arm that ignored every finding, the loop is circulating
noise."*

P298 (owner D) states the arm as **"weights and logic as of 08-21"**. THAT DATE IS
THE PERISHABLE PART. The grade is not due until 2026-10-27 and the grader wiring
can be built any time before then — but the 08-21 state cannot be reconstructed
after the arms move, and this project promotes arms weekly and rebuilds the board
nightly. The ROUTES dispatch's own default ("unclaimed by 08-27, the frozen arm
ships with my weight snapshot") would capture 08-27 weights, which is a different
control than the one Cory ruled.

So this file exists to do the one thing that gets harder every day: WRITE THE
NUMBERS DOWN, TODAY, WITH A HASH.

── REUSED, NOT REINVENTED (Rule 11) ─────────────────────────────────────────
`draft/freeze_pre_draft.py` (TERRITORY: A) is this project's freeze pattern and
this file matches it deliberately rather than inventing a second freeze concept:
  * freeze INPUTS, not only outputs — the arm definitions and the per-position
    model config, so the arm is reconstructable from the snapshot alone;
  * a `_sha256_of_payload` over the canonical JSON, so silent mutation is
    detectable rather than arguable;
  * refuse to overwrite an existing freeze — a freeze that can be re-taken is
    not a freeze. `--force` exists for a same-day correction and says so loudly.

── WHAT THIS DOES NOT DO ────────────────────────────────────────────────────
REPORT ONLY. It reads A's modules and writes one D-owned artifact. It changes no
arm, no weight, no shipped behaviour. Wiring the frozen arm into the Tuesday
grader is the other half of P298 and is NOT this file — that half is not
perishable and is blocked behind register 170 besides (the ADAPTATION-POLICY
wording still does not match the Cory-ruled `decide_promotion()`).

Run:    python3 draft/tools/freeze_no_learning_baseline.py
Verify: python3 draft/tools/freeze_no_learning_baseline.py --verify
Test:   python3 -m pytest draft/tests/test_freeze_no_learning_baseline.py -q
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT / "draft"))
sys.path.insert(0, str(ROOT / "draft" / "backtest"))

_DEFAULT_OUT = ROOT / "draft" / "data" / "frozen_no_learning_baseline_2026.json"
OUT = Path(os.environ.get("FROZEN_BASELINE_PATH") or str(_DEFAULT_OUT))

FROZEN_AS_OF = "2026-08-21"   # P298's own wording. Not today() — a rerun must
                              # not silently relabel the freeze as a later date.


def _sha(payload: dict) -> str:
    """sha256 over canonical JSON — same construction freeze_pre_draft.py uses."""
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def live_state() -> dict:
    """The arm set and per-position config as they stand right now, BY VALUE.

    Imported from A's modules and copied out as plain data — the snapshot must
    survive those modules changing, which is the entire point of a control.
    """
    import weekly_own_projection as W
    from own_model_v5 import V5_CONFIG

    return {
        "arms": [dict(a) for a in W.DEFAULT_ARMS],
        "champion": dict(W.DEFAULT_CHAMPION),
        "formula_version": getattr(W, "FORMULA_VERSION_V1", None),
        "vegas_sensitivity_vg": dict(getattr(W, "VG", {}) or {}),
        "model_config_v5": {k: dict(v) for k, v in V5_CONFIG.items()},
    }


def _git_commit() -> str | None:
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], cwd=str(ROOT),
                              capture_output=True, text=True, timeout=10
                              ).stdout.strip() or None
    except Exception:                                        # noqa: BLE001
        return None


def build_payload() -> dict:
    state = live_state()
    payload = {
        "_territory": "TERRITORY: D — produced by draft/tools/freeze_no_learning_baseline.py",
        "_what": ("P298's frozen no-learning control: the weekly arm set and "
                  "per-position model config as of 2026-08-21, the day Cory ruled "
                  "the cross-propagation rule. This arm absorbs NO propagated "
                  "pattern for the rest of the season and is graded alongside the "
                  "learning-enabled arms. If learning cannot beat it, the loop is "
                  "circulating noise."),
        "_authority": "ADAPTATION-POLICY.md cross-propagation rule, clause 3; ledger P298 (owner D)",
        "_this_is_a_control_not_a_competitor": (
            "Per P298's CONSEQUENCE ROUTE the frozen arm never retires, whichever "
            "way the comparison lands. Do not promote it, tune it, or let any "
            "propagated finding touch it — doing so destroys the only number that "
            "can falsify the learning programme as a whole."),
        "frozen_as_of": FROZEN_AS_OF,
        "git_commit_at_freeze": _git_commit(),
        "state": state,
    }
    payload["_sha256_of_payload"] = _sha(
        {k: v for k, v in payload.items() if k != "_sha256_of_payload"})
    return payload


def verify(path: Path = OUT) -> dict:
    """Compare the committed freeze against (a) its own hash and (b) live code.

    Two DIFFERENT failure modes, reported separately and never conflated:
      * `hash_ok` False  -> the artifact itself was edited after freezing.
      * `drift` non-empty -> live code moved away from the frozen state. That is
        EXPECTED and healthy as the season learns; it is reported, never
        "fixed", because re-freezing to match live would destroy the control.
    """
    if not path.exists():
        return {"exists": False, "hash_ok": None, "drift": None,
                "why": f"no freeze at {path}"}
    doc = json.loads(path.read_text())
    stated = doc.get("_sha256_of_payload")
    recomputed = _sha({k: v for k, v in doc.items() if k != "_sha256_of_payload"})
    drift = {}
    #: ⚠️ COMPARE THROUGH THE SAME REPRESENTATION. `V5_CONFIG`'s `weights` are
    #: Python TUPLES; once written to JSON they read back as LISTS, so a naive
    #: `live != frozen` reported drift in `model_config_v5` on the very first
    #: verify — seconds after the freeze, when drift was necessarily zero.
    #: Left in, this control would have shown PERMANENT false drift and a real
    #: change would have been indistinguishable from the artifact. Caught by
    #: running the verifier immediately after freezing, which is the only
    #: moment the correct answer is known in advance (Rule 3e).
    live = json.loads(json.dumps(live_state()))
    for key, frozen_val in (doc.get("state") or {}).items():
        if live.get(key) != frozen_val:
            drift[key] = {"frozen": frozen_val, "live": live.get(key)}
    return {
        "exists": True,
        "hash_ok": stated == recomputed,
        "stated_sha256": stated,
        "recomputed_sha256": recomputed,
        "frozen_as_of": doc.get("frozen_as_of"),
        "drift": drift,
        "drift_keys": sorted(drift),
        "note": ("drift is EXPECTED as the season learns and is the signal this "
                 "control exists to measure — never re-freeze to clear it"),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify", action="store_true",
                    help="check the existing freeze; write nothing")
    ap.add_argument("--force", action="store_true",
                    help="OVERWRITE an existing freeze (same-day correction only)")
    args = ap.parse_args()

    if args.verify:
        r = verify()
        print(json.dumps(r, indent=1)[:2000])
        if not r["exists"]:
            print("\n  NO FREEZE ON DISK — P298's control does not exist yet.")
            return 1
        print(f"\n  hash_ok={r['hash_ok']}  frozen_as_of={r['frozen_as_of']}  "
              f"drift in {len(r['drift'])} key(s): {r['drift_keys'] or 'none'}")
        return 0 if r["hash_ok"] else 1

    if OUT.exists() and not args.force:
        print(f"REFUSED — a freeze already exists at {OUT}.")
        print("  A freeze that can be re-taken is not a freeze. If the season has")
        print("  moved on, that is DRIFT and it is the measurement, not a problem")
        print("  to clear: run --verify. Use --force only for a same-day correction.")
        return 1

    payload = build_payload()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=1, sort_keys=False) + "\n")
    print(f"FROZE the no-learning baseline as of {FROZEN_AS_OF} -> {OUT}")
    print(f"  sha256      : {payload['_sha256_of_payload']}")
    print(f"  git commit  : {payload['git_commit_at_freeze']}")
    print(f"  arms frozen : {[a['name'] for a in payload['state']['arms']]}")
    print(f"  champion    : {payload['state']['champion']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
