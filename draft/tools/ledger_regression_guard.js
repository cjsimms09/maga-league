#!/usr/bin/env node
'use strict';
/* TERRITORY: relay (loop-governance gate; register filed by D 08-21 — "the
 * check can't distinguish 'not yet graded' from 'was graded and lost'").
 *
 * THE LEDGER REGRESSION GUARD — a grade, once on main, never silently
 * reverts to OPEN. The existing checker only fails rows past their grade-by
 * date, so a LOST grade hides until the date passes and then reads as
 * never-graded and gets graded twice (P143: GRADED FALSE in 0b05742c with a
 * full result, later served as 🟡 OPEN with an empty cell — the exact shape
 * relay_publish.sh's insert-never-overwrite warns about, register 161).
 *
 * Method: one pass of `git log -p` over PREDICTION-LEDGER.md collecting every
 * row-line ever ADDED with a terminal status (GRADED/ABANDONED), keyed by
 * id + a mid-content fingerprint of the claim. At HEAD, a row with the SAME
 * id AND the SAME claim fingerprint but status OPEN is a regression — the
 * fingerprint match is what makes this safe across the 08-21 id
 * reconciliation, where an id alone can now name a different row than it
 * once did (those differ in fingerprint and are skipped).
 * A row missing entirely at HEAD is NOT flagged here: post-reconciliation
 * that is usually a renumber, and the mailbox deletion guard owns that class.
 *
 * Deliberate re-opens exist (a grade withdrawn WITH a reason). Escape hatch:
 * if the HEAD row's status cell or result cell contains "REOPENED", it
 * passes — visible re-opening is fine, silent reversion is the defect.
 */
const { execFileSync } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const LEDGER = 'PREDICTION-LEDGER.md';

const splitRow = (l) => l.split(/(?<!\\)\|/);

function fingerprint(claim) {
  const t = String(claim || '').replace(/\s+/g, ' ').trim();
  return t.length > 50 ? t.slice(10, 50) : t;
}

function parseRowLine(line) {
  const c = splitRow(line);
  if (c.length < 8) return null;
  const id = c[1].trim();
  if (!/^P\d+[a-z]?$/.test(id)) return null;
  return { id, fp: fingerprint(c[2]), status: c[6] || '', result: (c[7] || '').trim() };
}

/* Every (id, fp) ever added with a terminal status, from history. */
function terminalFromHistory(cwd, headRev) {
  const log = execFileSync('git', ['log', '-p', '--format=', headRev, '--', LEDGER],
    { cwd, maxBuffer: 512 * 1024 * 1024 }).toString();
  const seen = new Map(); // id|fp -> status word
  for (const line of log.split('\n')) {
    if (!line.startsWith('+| P')) continue;
    const row = parseRowLine(line.slice(1));
    if (!row) continue;
    if (/GRADED|ABANDONED/.test(row.status)) seen.set(row.id + '|' + row.fp, row.status.trim());
  }
  return seen;
}

function regressions(terminal, headText) {
  const bad = [];
  for (const line of headText.split('\n')) {
    if (!line.startsWith('| P')) continue;
    const row = parseRowLine(line);
    if (!row) continue;
    if (!/OPEN/.test(row.status)) continue;
    if (/REOPENED/i.test(row.status) || /REOPENED/i.test(row.result)) continue;
    const was = terminal.get(row.id + '|' + row.fp);
    if (was) bad.push({ id: row.id, was: was.slice(0, 30) });
  }
  return bad;
}

function main() {
  const headRev = process.argv[2] || 'HEAD';
  const headText = execFileSync('git', ['show', headRev + ':' + LEDGER],
    { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString();
  const bad = regressions(terminalFromHistory(ROOT, headRev), headText);
  if (!bad.length) {
    console.log(`ledger regression guard: no grade lost (checked ${headRev} against its own history).`);
    return 0;
  }
  for (const b of bad) {
    console.log(`⛔ ${b.id}: was "${b.was}" in this ledger's own git history, now OPEN with the same claim — ` +
      `a grade was LOST, not never-made. Restore it from history (git log -p -- ${LEDGER} | grep '${b.id}'), ` +
      `or re-open it VISIBLY by writing REOPENED with a reason in the status or result cell.`);
  }
  return 1;
}

if (require.main === module) process.exit(main());
module.exports = { regressions, parseRowLine, fingerprint, terminalFromHistory };
