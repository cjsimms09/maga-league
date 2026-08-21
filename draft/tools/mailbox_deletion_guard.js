#!/usr/bin/env node
'use strict';
/* TERRITORY: relay (loop-governance gate; built on Cory's 08-21 order "Do
 * whatever you need to to make sure it doesn't cause problems ... protect it",
 * mechanizing the register-190 discipline A was holding the decision on).
 *
 * THE MAILBOX DELETION GUARD — a mailbox push is APPEND-AND-TICK-ONLY for
 * rows you do not own. This makes that rule a machine's problem instead of a
 * memory: for each mailbox file, compare two git revisions and FAIL if a row
 * that existed before is GONE after — not ticked, not edited, gone.
 *
 * What counts as a row:
 *   - a ROUTES-style checkbox line:  "- [ ] ..." or "- [x] ..."
 *   - a table row with an id cell:   "| 186 | ..." / "| P298 | ..." / "| A18 | ..."
 *
 * What does NOT flag (the legitimate operations):
 *   - ticking:   "- [ ] X" -> "- [x] X"          (same key, state changed)
 *   - editing:   the row's KEY survives           (key = date+author+lead text
 *                for checkbox rows; the id cell for table rows)
 *   - appending: new rows are always fine
 *   - pruning ON PURPOSE: a commit whose message contains [mailbox-prune]
 *     acknowledges its deletions; the guard prints them and passes. Silent
 *     is the failure mode, not deletion per se.
 *
 * Known-positive in the test suite: commit 57a4a95e (register 190) — the
 * REAL clobber that silently deleted three relay rows. The guard must fire
 * on it, or the guard is decoration.
 */
const { execFileSync } = require('child_process');
const path = require('path');

const MAILBOXES = ['ROUTES.md', 'CORY-ASKS.md', 'DEFECT-REGISTER.md',
  'OPEN-QUESTIONS.md', 'PREDICTION-LEDGER.md'];

function gitShow(rev, file, cwd) {
  try {
    return execFileSync('git', ['show', rev + ':' + file],
      { cwd, maxBuffer: 64 * 1024 * 1024 }).toString();
  } catch (e) { return null; /* file absent at that rev */ }
}

/* A row's identity. Checkbox rows: the date + author-arrow + first 40 chars
 * of content, so an edit deep in the row body keeps its key, while a whole
 * row vanishing loses it. Table rows: the id cell — ids are unique (CI
 * elsewhere enforces that), so id-survival is row-survival. */
function keysOf(text) {
  const keys = new Map(); // key -> {line, fp} (fp = content fingerprint)
  if (text == null) return keys;
  for (const line of text.split('\n')) {
    let m = line.match(/^- \[[ x]\] (\d{4}-\d\d-\d\d [^·]*· *[^·]+·)(.{0,40})/);
    if (m) {
      keys.set('cb:' + m[1].trim() + m[2],
        { line: line.slice(0, 120), fp: fingerprint(line) });
      continue;
    }
    m = line.match(/^\| ([A-Za-z]?\d+[a-z]?) \|(.*)/);
    if (m) keys.set('row:' + m[1], { line: line.slice(0, 120), fp: fingerprint(m[2]) });
  }
  return keys;
}

/* A distinctive mid-content slice, so a row RENUMBERED during a
 * reconciliation merge (id changes, text survives — E's merge turned P250
 * into P283 with a provenance note PREPENDED, which defeats any prefix
 * match) is told apart from a row DELETED. 40 chars from inside the text,
 * whitespace-normalized. */
function fingerprint(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > 50 ? t.slice(10, 50) : t;
}

function check(before, after) {
  const b = keysOf(before), a = keysOf(after);
  const afterNorm = String(after || '').replace(/\s+/g, ' ');
  const lost = [], renumbered = [];
  /* A row closed WITH a rewritten headline (B, 24d18dbe: "- [ ] E → B TWO
   * FINDABILITY FIXES" became "- [x] E → B BOTH ALREADY FIXED") breaks both
   * the key and the content fingerprint, but is a legitimate tick. Pair each
   * orphaned before-row with a spare orphaned after-row from the SAME
   * date·author→addressee prefix; only unpaired losses flag. Two same-prefix
   * rows where one vanishes and none appears still flag — pairing never
   * absorbs a real deletion, it only absorbs a 1-for-1 rewrite. */
  const spareAfter = new Map(); // cb prefix -> count of after-only rows
  for (const k of a.keys()) {
    if (k.startsWith('cb:') && !b.has(k)) {
      const p = k.slice(0, k.lastIndexOf('·') + 1);
      spareAfter.set(p, (spareAfter.get(p) || 0) + 1);
    }
  }
  for (const [k, v] of b) {
    if (a.has(k)) continue;
    if (v.fp && v.fp.length >= 20 && afterNorm.includes(v.fp)) {
      renumbered.push(v); // content survives under another id/key — not a loss
      continue;
    }
    if (k.startsWith('cb:')) {
      const p = k.slice(0, k.lastIndexOf('·') + 1);
      const n = spareAfter.get(p) || 0;
      if (n > 0) { spareAfter.set(p, n - 1); renumbered.push(v); continue; }
    }
    lost.push({ key: k, line: v.line });
  }
  return { lost, renumbered };
}

function main() {
  const args = process.argv.slice(2);
  const cwd = process.cwd();
  const from = args[0] || 'HEAD~1';
  const to = args[1] || 'HEAD';
  let msg = '';
  try {
    msg = execFileSync('git', ['log', '-1', '--format=%B', to], { cwd }).toString();
  } catch (e) { /* detached uses; message check just won't exempt */ }
  const acknowledged = /\[mailbox-prune\]/.test(msg);

  let total = 0;
  for (const f of MAILBOXES) {
    const { lost, renumbered } = check(gitShow(from, f, cwd), gitShow(to, f, cwd));
    if (renumbered.length) {
      console.log(`${f}: ${renumbered.length} row(s) renumbered/rekeyed, content survives — fine.`);
    }
    if (!lost.length) continue;
    total += lost.length;
    console.log(`\n${f}: ${lost.length} row(s) present at ${from} and GONE at ${to}:`);
    for (const l of lost) console.log('  - ' + l.line);
  }
  if (!total) { console.log(`mailbox guard: no rows lost ${from}..${to}.`); return 0; }
  if (acknowledged) {
    console.log(`\n${total} deletion(s), acknowledged by [mailbox-prune] in the commit message. Passing.`);
    return 0;
  }
  console.log(
    `\n⛔ ${total} mailbox row(s) SILENTLY DELETED. A mailbox push is append-and-tick-only ` +
    `for rows you do not own (register 190 — the first clobber deleted three rows within ` +
    `an hour of the push grant). If the deletion is deliberate, say so: put [mailbox-prune] ` +
    `in the commit message. Otherwise restore the rows: git show ${from}:<file> has them.`);
  return 1;
}

if (require.main === module) process.exit(main());
module.exports = { keysOf, check, MAILBOXES };
