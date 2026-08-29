"""KNOWN-POSITIVE for the DETERMINISM check: this probe disagrees with itself
by construction, so the sweep must report it NOT-REPRODUCIBLE and never
SENSITIVE. Its counterpart is _lh_ctl_negative.py, which is steady -- together
they stop the determinism check from labelling everything unreproducible,
which would hide contamination just as effectively as having no check at all.

Register 420 (A) is why this exists: exp_inverse_adjuster was nondeterministic
and this tool reported it as contaminated in register 345. A study that
disagrees with itself reads exactly like a study that disagrees across two
stores."""
import json
import pathlib
import random

ROOT = pathlib.Path(__file__).resolve().parents[2]
json.load(open(ROOT / "draft/data/league_history.json"))
print("unstable:", random.random())
