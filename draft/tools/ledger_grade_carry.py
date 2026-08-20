#!/usr/bin/env python3
# TERRITORY: relay — register 156's fix, called by relay_publish.sh --grade.
"""Carry a GRADE from the branch ledger onto main's copy of the SAME row.

relay_publish.sh's insert step is insert-never-overwrite by design — correct
for other lanes' rows, silently wrong for grades: a graded row shares its P-id
with main's OPEN stub, so the insert skips it and the tool prints success while
main goes on serving 🟡 OPEN (the P153–P156 stall, register 156).

This is the narrow, explicit path for exactly that case. For each NAMED id:

  * main's row must exist and its status cell must be OPEN — a row already
    GRADED on main is someone else's newer work and is REFUSED, never clobbered;
  * the branch's row must exist and be terminal (GRADED or ABANDONED) — carrying
    an OPEN row would be a no-op dressed as a publish, so it is REFUSED too;
  * the whole row line is replaced (a ledger row is one line by construction);
    every other byte of the file is untouched, asserted rather than assumed.

Ids are EXPLICIT on purpose. An automatic "carry every OPEN→terminal diff"
would also carry a merge artifact that made ANOTHER lane's row look graded on
the relay branch — publishing a grade its owner never made. The relay names
what it graded; anything else is refused loudly. Exit 0 only if every named id
carried.

Usage: ledger_grade_carry.py <main_ledger_path> <branch_ledger_path> P250 [P251 ...]
"""
import re
import sys

ROW = r'^\| {pid} \|.*$'   # no capture group: findall must return the FULL row line
OPEN_MARK = 'OPEN'
TERMINAL = ('GRADED', 'ABANDONED')


def row_of(text, pid):
    """The single full row line for pid, or None. Two rows with one id is
    corruption and raises rather than picking one."""
    rows = re.findall(ROW.format(pid=re.escape(pid)), text, re.M)
    if len(rows) > 1:
        raise SystemExit(f'REFUSED: {pid} appears {len(rows)} times — ledger corrupt, fix that first')
    return rows[0] if rows else None


def status_cell(row):
    """The 7th pipe-delimited cell (id|claim|filed|owner|grade-by|status|...)."""
    cells = row.split('|')
    return cells[6].strip() if len(cells) > 6 else ''


def carry(main_text, branch_text, pids):
    """Returns (new_main_text, carried_ids). Raises SystemExit on any refusal —
    all-or-nothing, so a partial publish cannot masquerade as a full one."""
    out = main_text
    carried = []
    for pid in pids:
        main_row = row_of(out, pid)
        if main_row is None:
            raise SystemExit(f'REFUSED: {pid} not present on main — a NEW row belongs to the insert path, not --grade')
        branch_row = row_of(branch_text, pid)
        if branch_row is None:
            raise SystemExit(f'REFUSED: {pid} not present on the branch ledger — nothing to carry')
        m_status = status_cell(main_row)
        if OPEN_MARK not in m_status:
            raise SystemExit(f'REFUSED: {pid} on main is "{m_status}", not OPEN — someone graded it there already; reconcile by hand')
        b_status = status_cell(branch_row)
        if not any(t in b_status for t in TERMINAL):
            raise SystemExit(f'REFUSED: {pid} on the branch is "{b_status}", not GRADED/ABANDONED — carrying it would publish nothing')
        if main_row == branch_row:
            raise SystemExit(f'REFUSED: {pid} rows are byte-identical yet statuses differ — the status parse is wrong, not the ledger')
        replaced = out.replace(main_row, branch_row, 1)
        if replaced == out:
            raise SystemExit(f'REFUSED: replace of {pid} was a no-op — refusing to report a carry that did not happen')
        out = replaced
        carried.append(pid)
    # blast-radius assertion: exactly the named rows changed, nothing else
    before = [l for l in main_text.splitlines() if not re.match(r'\| P\d+ ', l) or
              not any(re.match(rf'\| {re.escape(p)} ', l) for p in carried)]
    after = [l for l in out.splitlines() if not re.match(r'\| P\d+ ', l) or
             not any(re.match(rf'\| {re.escape(p)} ', l) for p in carried)]
    if before != after:
        raise SystemExit('REFUSED: a byte outside the named rows moved — refusing to write')
    return out, carried


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 2
    main_path, branch_path, pids = argv[0], argv[1], argv[2:]
    for p in pids:
        if not re.fullmatch(r'P\d+', p):
            raise SystemExit(f'REFUSED: "{p}" is not a P-id')
    main_text = open(main_path).read()
    branch_text = open(branch_path).read()
    out, carried = carry(main_text, branch_text, pids)
    open(main_path, 'w').write(out)
    print(f'grades carried onto main: {", ".join(carried)}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
