# TERRITORY: relay — tests for register 156's fix (ledger_grade_carry.py).
"""The known positive is the REAL incident: P153's actual OPEN stub (main) and
graded row (branch), verbatim from the 2026-08-20 stall. If the carry cannot
move the exact rows it was built for, it has not been tested, only run (3e)."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from ledger_grade_carry import carry, row_of, status_cell  # noqa: E402

HEADER = ("# PREDICTION LEDGER\n\n"
          "| id | claim | filed | owner | grade-by | status | result | what changed |\n"
          "|---|---|---|---|---|---|---|---|\n")

# The real P153 stub as main carried it during the stall (shape, abbreviated claim).
P153_OPEN = ("| P153 | 🎯 **Gauntlet: Best-Available-ADP finishes LAST of the eight.** "
             "| 08-20 | relay | 08-21 | 🟡 OPEN | — | — |")
P153_GRADED = ("| P153 | 🎯 **Gauntlet: Best-Available-ADP finishes LAST of the eight.** "
               "| 08-20 | relay | 08-21 | GRADED | **FALSE — the merged bav/adp arm finished "
               "SECOND of seven, not last.** | The frame-limitation is now a graded fact. → P154 |")
OTHER_ROW = ("| P147 | 🎯 **2026 TE drafted count lands in [12,16].** "
             "| 08-19 | relay | 08-23 | 🔵 OPEN | — | — |")
GRADED_ON_MAIN = ("| P142 | 🎯 **Exact-DP gap < 5%.** "
                  "| 08-19 | relay | 08-20 | GRADED | **TRUE on both clauses.** | Construction closed. |")


def ledger(*rows):
    return HEADER + "\n".join(rows) + "\n"


def test_KNOWN_POSITIVE_the_real_p153_stall_carries():
    main_t = ledger(P153_OPEN, OTHER_ROW)
    branch_t = ledger(P153_GRADED, OTHER_ROW)
    out, carried = carry(main_t, branch_t, ['P153'])
    assert carried == ['P153']
    assert P153_GRADED in out
    assert P153_OPEN not in out
    assert OTHER_ROW in out          # untouched neighbour


def test_blast_radius_only_the_named_row_moves():
    main_t = ledger(P153_OPEN, OTHER_ROW, GRADED_ON_MAIN)
    branch_t = ledger(P153_GRADED, OTHER_ROW, GRADED_ON_MAIN)
    out, _ = carry(main_t, branch_t, ['P153'])
    # every byte except the named row identical
    assert out.replace(P153_GRADED, P153_OPEN) == main_t


def test_REFUSES_main_row_already_graded():
    main_t = ledger(GRADED_ON_MAIN)
    branch_t = ledger(GRADED_ON_MAIN.replace('**TRUE on both clauses.**', '**FALSE actually**'))
    with pytest.raises(SystemExit, match='not OPEN'):
        carry(main_t, branch_t, ['P142'])


def test_REFUSES_branch_row_still_open():
    main_t = ledger(P153_OPEN)
    branch_t = ledger(P153_OPEN)   # branch never graded it
    with pytest.raises(SystemExit, match='not GRADED/ABANDONED'):
        carry(main_t, branch_t, ['P153'])


def test_REFUSES_id_missing_on_main():
    with pytest.raises(SystemExit, match='not present on main'):
        carry(ledger(OTHER_ROW), ledger(P153_GRADED, OTHER_ROW), ['P153'])


def test_REFUSES_id_missing_on_branch():
    with pytest.raises(SystemExit, match='not present on the branch'):
        carry(ledger(P153_OPEN), ledger(OTHER_ROW), ['P153'])


def test_REFUSES_duplicate_id_as_corruption():
    main_t = ledger(P153_OPEN, P153_OPEN)
    with pytest.raises(SystemExit, match='ledger corrupt'):
        carry(main_t, ledger(P153_GRADED), ['P153'])


def test_ABANDONED_is_terminal_and_carries():
    ab = P153_GRADED.replace('GRADED', 'ABANDONED', 1)
    out, carried = carry(ledger(P153_OPEN), ledger(ab), ['P153'])
    assert carried == ['P153'] and ab in out


def test_carry_at_end_of_file_without_trailing_newline():
    main_t = HEADER + P153_OPEN           # no trailing newline
    branch_t = HEADER + P153_GRADED
    out, _ = carry(main_t, branch_t, ['P153'])
    assert out.endswith(P153_GRADED)


def test_status_cell_reads_the_sixth_pipe_cell():
    assert 'OPEN' in status_cell(P153_OPEN)
    assert 'GRADED' in status_cell(P153_GRADED)
    assert row_of(ledger(P153_OPEN), 'P153') == P153_OPEN
    assert row_of(ledger(P153_OPEN), 'P999') is None
