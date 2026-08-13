# TERRITORY: C
"""A FIELD READ FROM A BOARD ROW THAT NO BOARD ROW HAS.

`draft/tools/orphan_field_sweep.js` catches this in the JS modules and reports 3
orphans, all guarded, 0 bare. NOTHING DID THE SAME FOR THE PYTHON SIDE, and that
is exactly where the live instance was: `adp.py` builds the fallback ADP from
`p.get("search_rank")` while board rows carry the Sleeper rank as `raw_adp` /
`consensus_rank` / `sleeper_rank`. The read always missed, `or 9999` supplied a
sentinel, and 1,503 players collapsed onto one identical ADP under a comment
describing an ordering that never happened.

THE HARD PART IS NOT THE NAMES, IT IS WHICH DICT. The same modules legitimately
read `full_name`, `first_name` and `search_rank` itself from the raw Sleeper
dump, where those names are correct. A grep finds all of them and reports a
hundred false positives; this follows the AST binding instead, and then requires
each binding to PROVE it holds a board row before judging it — my first version
skipped that step and accused `keepers.live_index_of`, which takes pick-order
rows where `keeper_slot` and `overall` are real.

Run: python3 -m pytest draft/tests/test_board_field_reads.py -q
"""
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE.parent / "backtest"))

import board_field_reads as F  # noqa: E402

#: The one orphan on the Python side, open by design: fixing the key read is a
#: DECISION about deep-pool ordering, not a typo, and it is routed to A. Every
#: fallback ADP starts at `ffc_max + 1`, so nothing it orders can reach the
#: relevant board — which is why it is a ratchet and not an emergency.
KNOWN = {("draft/adp.py", "search_rank")}

VOCAB = {"player_id", "name", "position", "team", "adp", "bye", "proj_mean"}


def _mod(tmp_path, body):
    p = tmp_path / "m.py"
    p.write_text(body)
    return str(p)


def test_it_FINDS_a_field_no_board_row_has(tmp_path):
    """The detector, before any real file is called clean.

    MUTATION: compare the read against nothing, or return `[]` — the sweep goes
    quiet and every module reads as clean."""
    m = _mod(tmp_path, "def f(players):\n"
                       "    for p in players:\n"
                       "        x = p.get('name')\n"
                       "        y = p.get('search_rank')\n")
    got = F.sweep([m], vocabulary=VOCAB)
    assert [o["field"] for o in got["orphans"]] == ["search_rank"], got


def test_a_DEFAULT_IS_NOT_AN_EXONERATION(tmp_path):
    """`p.get("search_rank") or 9999` HAD a default, and the default is precisely
    what made it invisible: the read always missed and always took the guard.

    MUTATION: skip reads that supply a default — the live defect disappears from
    the report, because it is one of them."""
    m = _mod(tmp_path, "def f(players):\n"
                       "    for p in players:\n"
                       "        x = p.get('name')\n"
                       "        y = p.get('ghost', 9999)\n")
    got = F.sweep([m], vocabulary=VOCAB)
    assert [o["field"] for o in got["orphans"]] == ["ghost"], got
    assert got["orphans"][0]["has_default"] is True


def test_a_BINDING_THAT_IS_NOT_A_BOARD_ROW_is_left_alone(tmp_path):
    """THE FALSE ALARM THIS ALREADY PRODUCED. `keepers.live_index_of(board, ...)`
    takes PICK-ORDER rows, where `keeper_slot` and `overall` are real fields.
    Judging them against the player vocabulary accuses correct code, and a check
    that cries wolf twice is one nobody runs a third time.

    A binding must read at least one RECOGNISABLE board field before anything
    read from it is judged. MUTATION: drop that requirement — both come back."""
    m = _mod(tmp_path, "def f(board):\n"
                       "    return sum(1 for row in board\n"
                       "               if not row.get('keeper_slot')\n"
                       "               and row.get('overall'))\n")
    assert F.sweep([m], vocabulary=VOCAB)["orphans"] == []


def test_the_RAW_SLEEPER_DUMP_is_not_judged_by_the_board_vocabulary(tmp_path):
    """`full_name` and `search_rank` are correct names on a Sleeper player. The
    parameter is what distinguishes them, and a function taking `raw` is holding
    the dump.

    MUTATION: judge every dict — every builder that touches Sleeper is accused."""
    m = _mod(tmp_path, "def f(raw):\n"
                       "    for p in raw.values():\n"
                       "        x = p.get('full_name')\n"
                       "        y = p.get('search_rank')\n")
    assert F.sweep([m], vocabulary=VOCAB)["orphans"] == []


def test_NO_BOARD_is_unmeasured_rather_than_clean(tmp_path):
    """A sweep that could not build a vocabulary must not report zero orphans —
    that reads downstream exactly like a sweep that looked and found none."""
    got = F.sweep([_mod(tmp_path, "x = 1\n")], vocabulary=set())
    assert got["status"] == "unmeasured", got
    assert got["orphans"] == []


def test_THE_PYTHON_MODULES_HAVE_NO_NEW_ORPHAN_FIELD():
    """RATCHET over the real modules, against the real board.

    One known orphan, routed and open by design. A NEW one is the defect this
    file exists to catch — a consumer reading a field name its author believed
    in, which is the single most repeated defect in this repo."""
    import glob
    board = ROOT / "public" / "draft_data.json"
    if not board.exists():
        pytest.skip("UNCHECKED: no board to build a vocabulary from")
    got = F.sweep(sorted(glob.glob(str(ROOT / "draft" / "*.py"))))
    assert got["status"] == "measured", got
    assert got["checked"] > 20, ("only %d board-row reads found — the AST walk "
                                 "has stopped seeing them" % got["checked"])
    found = {(str(Path(o["file"]).relative_to(ROOT)), o["field"])
             for o in got["orphans"]}
    assert found <= KNOWN, "NEW orphan field read from a board row: %s" % (found - KNOWN)
