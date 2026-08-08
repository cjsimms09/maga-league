"""CROSS-LANGUAGE PARITY — the browser's doctrine mirrors the Lab's archetypes.

The doctrine banner scores a plan by asking "what is the best player this
doctrine would let me take right now?". That question is answered twice: by
`cory_conditional.py`'s `make_archetypes()` in the simulator that produced the
enrolled verdict, and by `doctrine.js`'s `LIVE_CONSTRAINTS` in the War Room.

If those two drift, the banner names a plan the Lab never raced — the numbers on
screen would describe a strategy nobody measured. Neither file can be trusted to
stay in step by inspection, so this test drives BOTH over the same grid of
(archetype x position x live-pick-index x roster) and demands identical
allow/deny sets, including the shared "unsatisfiable -> unconstrained" rule.

A failure here means one side was edited and the other was not. Fix the mirror,
do not relax the grid.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
DOCTRINE_JS = ROOT / "public" / "js" / "draft" / "doctrine.js"

sys.path.insert(0, str(ROOT / "draft" / "backtest"))
from cory_conditional import make_archetypes  # noqa: E402

POSITIONS = ["QB", "RB", "WR", "TE"]
# Live pick indices spanning every window boundary the archetypes care about:
# hero_rb's i==2, early_qb's i==3, the 3-in-4 / 2-in-4 windows at i<=4,
# zero_rb's i>=6 release and late_qb's i>=8 release.
INDICES = [1, 2, 3, 4, 5, 6, 7, 8, 9]
# Roster shapes that flip the roster-conditional branches.
ROSTERS = [
    [],
    [{"position": "RB"}],
    [{"position": "RB"}, {"position": "RB"}],
    [{"position": "WR"}],
    [{"position": "WR"}, {"position": "WR"}],
    [{"position": "WR"}, {"position": "WR"}, {"position": "WR"}],
    [{"position": "QB"}],
    [{"position": "TE"}],
    [{"position": "RB"}, {"position": "WR"}, {"position": "QB"}, {"position": "TE"}],
]
KEYS = sorted(make_archetypes().keys())


def _python_table() -> dict:
    """Allowed positions per (key, index, roster) from the Lab's own choosers."""
    archs = make_archetypes()
    board = [{"position": p} for p in POSITIONS]
    table = {}
    for key in KEYS:
        chooser = archs[key]
        for i in INDICES:
            for r_idx, roster in enumerate(ROSTERS):
                allowed = chooser(board, i, roster)
                table[f"{key}|{i}|{r_idx}"] = sorted({p["position"] for p in allowed})
    return table


def _js_table() -> dict:
    """The same grid, evaluated by the browser module — including the
    unsatisfiable-falls-back-to-unconstrained rule scoreBoard() applies."""
    script = f"""
const D = require({json.dumps(str(DOCTRINE_JS))});
const POSITIONS = {json.dumps(POSITIONS)};
const INDICES = {json.dumps(INDICES)};
const ROSTERS = {json.dumps(ROSTERS)};
const KEYS = {json.dumps(KEYS)};
const out = {{}};
for (const key of KEYS) {{
  const allow = D.LIVE_CONSTRAINTS[key];
  if (!allow) {{ out['MISSING:' + key] = true; continue; }}
  for (const i of INDICES) {{
    for (let r = 0; r < ROSTERS.length; r++) {{
      let pool = POSITIONS.filter(p => allow(p, i, ROSTERS[r]));
      if (!pool.length) pool = POSITIONS.slice();   // unsatisfiable -> unconstrained
      out[key + '|' + i + '|' + r] = pool.sort();
    }}
  }}
}}
process.stdout.write(JSON.stringify(out));
"""
    node = shutil.which("node")
    if not node:
        pytest.skip("node not available")
    res = subprocess.run([node, "-e", script], capture_output=True, text=True, check=True)
    return json.loads(res.stdout)


def test_every_lab_archetype_has_a_browser_mirror():
    js = _js_table()
    missing = [k for k in KEYS if f"MISSING:{k}" in js]
    assert not missing, f"doctrine.js has no LIVE_CONSTRAINTS for: {missing}"


def test_browser_mirror_matches_the_lab_choosers_cell_for_cell():
    py, js = _python_table(), _js_table()
    diffs = [
        f"{cell}: lab={py[cell]} browser={js.get(cell)}"
        for cell in sorted(py)
        if py[cell] != js.get(cell)
    ]
    assert not diffs, (
        f"{len(diffs)} of {len(py)} cells disagree between cory_conditional.py "
        f"and doctrine.js:\n  " + "\n  ".join(diffs[:20])
    )


def test_the_grid_actually_exercises_the_constraints():
    """A parity test that compares two unconstrained tables proves nothing.

    Demand that the grid contains real disagreement BETWEEN doctrines — if every
    cell allowed every position, the test above would pass on two broken files.
    """
    py = _python_table()
    constrained = [c for c, v in py.items() if len(v) < len(POSITIONS)]
    assert len(constrained) >= 20, (
        f"only {len(constrained)} constrained cells in the grid — it is not "
        "exercising the archetype windows"
    )
    keys_seen = {c.split("|")[0] for c in constrained}
    assert keys_seen >= {"zero_rb", "hero_rb", "robust_rb", "wr_anchor",
                         "elite_te", "early_qb", "late_qb"}, sorted(keys_seen)
