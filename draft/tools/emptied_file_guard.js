#!/usr/bin/env node
'use strict';
/* TERRITORY: D
 *
 * THE EMPTIED-FILE GUARD — a tracked file that had content must not quietly
 * arrive with none.
 *
 * `mailbox_deletion_guard.js` (relay) does this for ROWS inside the five
 * mailbox files. It is the right rule and the wrong blast radius: everything
 * outside those five is unwatched, and that is where the damage actually
 * landed. On 2026-08-20 commit `fd33cd15` — whose message says it published
 * ONE prereg — emptied **15 unrelated files to zero bytes**, 1,777 deletions
 * against 100 insertions, and nothing noticed for a day:
 *
 *   8 PREREGS (MLV, MLV-timing, MLV-onesie, TE-cap, TE-curve, RB-tail,
 *   persistence-shrink, Clay-retrograde), 5 AUDITS, 2 of A's claim files —
 *   88,281 bytes.
 *
 * An emptied PREREG is worse than a deleted one. A missing file is an error
 * anyone trips over; an empty file with the right name reads as *the work was
 * done* to every grep, every reader and every reviewer — and a prereg is the
 * document that makes a study's result count as evidence at all. Register 63
 * was found this way: its recheck came due, its power audit existed by name,
 * and the file was zero bytes.
 *
 * THE RULE: for every file tracked at BOTH revisions, fail if it was
 * non-empty at BASE and is empty (or whitespace-only) at HEAD. Deleting a
 * file outright is NOT flagged here — that is visible in any diff and is
 * often deliberate; this catches the silent shape, which is the one that
 * survives review.
 *
 * ESCAPE HATCH, mirroring the mailbox guard: `[emptied-ok]` in the commit
 * message acknowledges the truncation, prints it, and passes. Silence is the
 * failure mode, not emptying as such.
 *
 * CONTROLS (GRADING-POLICY requirement 3), and they gate the exit code:
 *   known-POSITIVE — `fd33cd15` against its own parent must report all 15.
 *     A guard that cannot fire on the real event that motivated it is
 *     decoration.
 *   known-NEGATIVE — a commit pair that emptied nothing must report 0.
 *
 * Run:  node draft/tools/emptied_file_guard.js [BASE] [HEAD]
 * Test: node draft/tests/emptied_file_guard.test.js
 */
const { execFileSync } = require('child_process');

const ACK = '[emptied-ok]';

function git(args, opts) {
  /* stderr is 'pipe', not inherited: `git show REV:path` writes a `fatal:`
   * line for a path absent at that revision, which is a NORMAL answer here
   * (the callers below treat it as "not present") and would otherwise spray
   * the guard's own output with noise that reads like failure. */
  return execFileSync('git', args,
    { maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...(opts || {}) });
}

/** Bytes of `file` at `rev`, or null when the path does not exist there. */
function sizeAt(rev, file) {
  try { return git(['show', `${rev}:${file}`]).length; } catch (e) { return null; }
}

/** True when the blob is empty or nothing but whitespace. */
function blankAt(rev, file) {
  try { return git(['show', `${rev}:${file}`]).toString().trim() === ''; }
  catch (e) { return null; }
}

/**
 * Files that carried content at `base` and carry none at `head`.
 * Only files present at BOTH revisions are considered — see the header.
 */
function check(base, head) {
  const changed = git(['diff', '--name-only', base, head])
    .toString().split('\n').filter(Boolean);
  const emptied = [];
  for (const f of changed) {
    const before = sizeAt(base, f);
    if (before === null || before === 0) continue;        // absent or already empty
    const after = sizeAt(head, f);
    if (after === null) continue;                          // deleted outright — visible
    if (after === 0 || blankAt(head, f)) emptied.push({ file: f, bytes_lost: before });
  }
  return emptied.sort((a, b) => b.bytes_lost - a.bytes_lost);
}

/* ── the controls ─────────────────────────────────────────────────────── */
const KNOWN_CLOBBER = 'fd33cd15';
const KNOWN_CLOBBER_FILES = 15;

function controls() {
  const checks = [];
  let pos = null, neg = null;
  try {
    const parent = git(['rev-parse', `${KNOWN_CLOBBER}^`]).toString().trim();
    pos = check(parent, KNOWN_CLOBBER);
    // known-NEGATIVE: the clobber's parent against ITS parent — a commit pair
    // from the same history that emptied nothing. Drawn independently of the
    // positive rather than being the positive run backwards.
    const gp = git(['rev-parse', `${KNOWN_CLOBBER}^^`]).toString().trim();
    neg = check(gp, parent);
  } catch (e) {
    return { ok: false, checks: [{ control: 'fixture',
      case: `commit ${KNOWN_CLOBBER} reachable`, want: true, got: String(e.message).slice(0, 80),
      ok: false }] };
  }
  checks.push({
    control: 'known-positive',
    case: `${KNOWN_CLOBBER} vs its parent reports the real clobber`,
    want: KNOWN_CLOBBER_FILES, got: pos.length, ok: pos.length === KNOWN_CLOBBER_FILES,
  });
  checks.push({
    control: 'known-negative', case: 'a commit pair that emptied nothing reports 0',
    want: 0, got: neg.length, ok: neg.length === 0,
  });
  return { ok: checks.every(c => c.ok), checks };
}

function main() {
  const base = process.argv[2] || 'HEAD~1';
  const head = process.argv[3] || 'HEAD';

  const res = controls();
  const bad = res.checks.filter(c => !c.ok);
  console.log(`  controls: ${res.checks.length - bad.length}/${res.checks.length} pass`);
  for (const c of bad) {
    console.log(`    RED  ${c.control} — ${c.case}: want ${c.want}, got ${c.got}`);
  }
  if (!res.ok) {
    console.log('\n  ⛔ REFUSING: a control failed, so a clean report below would '
      + 'mean nothing. A guard that cannot fire is decoration.');
    return 1;
  }

  const emptied = check(base, head);
  if (!emptied.length) {
    console.log(`emptied-file guard: nothing emptied ${base}..${head}.`);
    return 0;
  }
  const msg = git(['log', '--format=%B', `${base}..${head}`]).toString();
  const total = emptied.reduce((a, e) => a + e.bytes_lost, 0);
  console.log(`\n${emptied.length} file(s) had content at ${base} and are EMPTY at ${head}:`);
  for (const e of emptied) console.log(`  ${String(e.bytes_lost).padStart(7)} B  ${e.file}`);
  if (msg.includes(ACK)) {
    console.log(`\n${total} bytes, acknowledged by ${ACK} in the commit message. Passing.`);
    return 0;
  }
  console.log(
    `\n⛔ ${total} BYTES SILENTLY EMPTIED. An empty file with the right name reads as `
    + `"the work was done" to every grep and every reader — which is exactly how `
    + `fd33cd15 destroyed 8 preregs and 5 audits for a day without anyone noticing. `
    + `If it is deliberate, say so: put ${ACK} in the commit message. Otherwise restore: `
    + `git checkout ${base} -- <file>.`);
  return 1;
}

module.exports = { check, controls, sizeAt, blankAt, KNOWN_CLOBBER, KNOWN_CLOBBER_FILES, ACK };
if (require.main === module) process.exit(main());
