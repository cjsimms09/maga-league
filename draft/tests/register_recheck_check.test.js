/* TERRITORY: relay
 *
 * The enforcer for Cory's 2026-08-17 complaint — "tons of findings but no one
 * is following up or acting on any of them" — is only worth having if it can
 * actually fail. Every check here has a fail arm, because a nagging tool that
 * never nags is worse than none: it looks like accountability.
 */
'use strict';

const assert = require('assert');
const R = require('../tools/register_recheck_check.js');

let pass = 0;
function ok(name, fn) { fn(); pass++; console.log('PASS  ' + name); }

const HEADER = '| # | what | owner | status | next action |\n|---|---|---|---|---|\n';
const md = body => HEADER + body;

ok('FAIL ARM — an OPEN row past its recheck date is caught', () => {
  const a = R.audit(md('| 9a | something broken | C | OPEN | fix it, recheck 08-01 |\n'),
    '2026-08-17');
  assert.strictEqual(a.overdue.length, 1, 'an overdue open row must be flagged');
  assert.strictEqual(a.overdue[0].due, '2026-08-01');
});

ok('CONTROL — the same row BEFORE its date is not flagged', () => {
  const a = R.audit(md('| 9a | something broken | C | OPEN | fix it, recheck 08-19 |\n'),
    '2026-08-17');
  assert.strictEqual(a.overdue.length, 0,
    'a row whose date has not arrived must not fire — a check that fires on '
    + 'everything gets muted, which is the failure mode being guarded against');
});

ok('CONTROL — a CLOSED row past its date is not flagged', () => {
  const a = R.audit(md('| 9a | fixed already | C | ✅ CLOSED | shipped, recheck 08-01 |\n'),
    '2026-08-17');
  assert.strictEqual(a.overdue.length, 0, 'closing a defect must not keep nagging');
});

ok('FAIL ARM — "closed" in the PROSE does not exempt an open row', () => {
  const a = R.audit(md('| 9a | we CLOSED the loop on this ages ago | C | OPEN | recheck 08-01 |\n'),
    '2026-08-17');
  assert.strictEqual(a.overdue.length, 1,
    'only the STATUS CELL may exempt a row. If prose could, any row could talk '
    + 'its way out of the check by describing itself as done.');
});

ok('an OPEN row with NO recheck date is reported, never failed on', () => {
  const a = R.audit(md('| 9a | broken, no date | C | OPEN | somebody look at it |\n'),
    '2026-08-17');
  assert.strictEqual(a.overdue.length, 0, 'undated rows must not fail the build yet');
  assert.strictEqual(a.undated.length, 1, 'but they MUST be counted and surfaced, '
    + 'or the hole is invisible');
});

ok('the LIVE register parses, and is green today', () => {
  const fs = require('fs');
  const path = require('path');
  const text = fs.readFileSync(
    path.join(__dirname, '..', '..', 'DEFECT-REGISTER.md'), 'utf8');
  const a = R.audit(text, '2026-08-17');
  assert(a.all.length > 20, 'should parse the real register, got ' + a.all.length);
  assert(a.dated.length > 0, 'the real register must carry SOME recheck dates, or '
    + 'this check is decorative on the file it was built for');
  assert.strictEqual(a.overdue.length, 0,
    'nothing should be overdue on the day this shipped — if this fails on 08-17 '
    + 'the check was mis-built, not the register');
});

ok('CONTROL — the LIVE register DOES go red at a future date, so it is not vacuous', () => {
  const fs = require('fs');
  const path = require('path');
  const text = fs.readFileSync(
    path.join(__dirname, '..', '..', 'DEFECT-REGISTER.md'), 'utf8');
  const later = R.audit(text, '2026-09-01');
  assert(later.overdue.length > 0,
    'by 2026-09-01 every recheck date in the register has passed, so this MUST '
    + 'report overdue rows. If it does not, the check cannot fire on the real '
    + 'file and its green today means nothing.');
});


/* ──────────────────────────────────────────────────────────────────────────
 * THE THREE WAYS THIS CHECK WAS LYING, FOUND 2026-08-18 BY THE RELAY.
 *
 * The counts it printed were wrong in BOTH directions, and the direction that
 * matters is that three rows explicitly waiting on a named human were being
 * counted CLOSED and therefore never chased. `CLAUDE.md`'s headline is about
 * findings going invisible to the mechanism built to chase them; that was
 * undated rows, and this is the same failure wearing a tick.
 * ────────────────────────────────────────────────────────────────────────── */

ok('FAIL ARM — "✅ FIXED — verify" is OPEN, because fixed is not accepted', () => {
  const md = [
    '| # | what | owner | status | next action |',
    '| E6 | a thing | B | ✅ **FIXED — verify** | B please review, recheck 08-01 |',
  ].join('\n');
  const a = R.audit(md, '2026-08-18');
  assert.strictEqual(a.open.length, 1,
    'a row awaiting a named human\'s verification is not closed — this is the '
    + 'exact shape that hid rows 31, E6 and E15');
  assert.strictEqual(a.overdue.length, 1, 'and it must be chaseable');
});

ok('FAIL ARM — "SEND BACK OFFERED" is an open question, tick or no tick', () => {
  const md = [
    '| # | what | owner | status | next action |',
    '| 31 | a thing | D | ✅ TEXT FIXED, ⚠️ SEND BACK OFFERED | recheck 08-01 |',
  ].join('\n');
  assert.strictEqual(R.audit(md, '2026-08-18').open.length, 1,
    'OPERATING-MODEL makes a SEND BACK a complete answer that still needs one');
});

ok('FAIL ARM — RESOLVED with no tick is CLOSED ("resolved" lacks "closed")', () => {
  const md = [
    '| # | what | owner | status | next action |',
    '| 39 | a thing | A | RESOLVED | nothing, recheck 08-01 |',
  ].join('\n');
  assert.strictEqual(R.audit(md, '2026-08-18').open.length, 0,
    'the old substring test counted every bare RESOLVED row open forever');
});

ok('CONTROL — the terminal words really do close, so this is not just stricter', () => {
  const md = ['| # | what | owner | status | next action |'].concat(
    ['CLOSED', '✅ CLOSED 08-18', '✅ RESOLVED 08-18', 'RESOLVED',
     '✅ RULED 08-18 — B to ship', 'WITHDRAWN', 'SUPERSEDED']
      .map((s, i) => `| r${i} | a thing | A | ${s} | recheck 08-01 |`)).join('\n');
  const a = R.audit(md, '2026-08-18');
  assert.strictEqual(a.open.length, 0,
    'every real terminal status in the register must still close: ' +
    a.open.map(r => r.status).join(' · '));
});

ok('CONTROL — a progress report is NOT terminal, and stays chaseable', () => {
  const md = ['| # | what | owner | status | next action |'].concat(
    ['OPEN', '🔴 OPEN', 'WAITING', 'IN HAND', '**ANSWERED**', '**MITIGATED**']
      .map((s, i) => `| r${i} | a thing | A | ${s} | recheck 08-01 |`)).join('\n');
  assert.strictEqual(R.audit(md, '2026-08-18').open.length, 6,
    'ANSWERED/MITIGATED/IN HAND/WAITING are progress, not acceptance — the safe '
    + 'direction to err is toward being chased');
});

ok('FAIL ARM — an ESCAPED pipe must not shift which cell is read as status', () => {
  /* Row 4s really was `✅ RESOLVED 08-18` and really was being counted OPEN,
   * because `\|` inside its prose added phantom columns and `length - 2` landed
   * on a fragment of a sentence. Five of nine escaped-pipe rows were misread. */
  const md = [
    '| # | what | owner | status | next action |',
    '| 4s | graded `RB\\|33+` 240 → 151, `WR\\|12-24` too | A | ✅ RESOLVED 08-18 | none, recheck 08-01 |',
  ].join('\n');
  const a = R.audit(md, '2026-08-18');
  assert.strictEqual(a.all[0].status, '✅ RESOLVED 08-18',
    'read the wrong cell as status: ' + JSON.stringify(a.all[0].status));
  assert.strictEqual(a.open.length, 0, 'and so it must count as closed');
});

ok('CONTROL — an escaped pipe does not accidentally close an OPEN row either', () => {
  const md = [
    '| # | what | owner | status | next action |',
    '| 2b | the delta is `\\|delta\\|` and CLOSED is a word in this prose | A | 🔴 OPEN | recheck 08-01 |',
  ].join('\n');
  const a = R.audit(md, '2026-08-18');
  assert.strictEqual(a.all[0].status, '🔴 OPEN');
  assert.strictEqual(a.open.length, 1,
    'prose must never exempt a row — the whole reason status is read narrowly');
});

ok('the LIVE register has no row wearing a tick that means "not finished"', () => {
  const fs = require('fs');
  const path = require('path');
  const text = fs.readFileSync(
    path.join(__dirname, '..', '..', 'DEFECT-REGISTER.md'), 'utf8');
  const a = R.audit(text, '2026-08-18');
  /* Not a ban on ticks — closed rows are ticked and should be. This catches the
   * combination that hid three rows: a tick with no terminal word AND no date,
   * which is a row that looks finished and cannot ever be chased. */
  const invisible = a.open.filter(r => /✅/.test(r.status) && !R.recheckOf(r));
  assert.strictEqual(invisible.length, 0,
    'these look done, are not, and carry no recheck date: '
    + invisible.map(r => r.id.trim()).join(', '));
});


ok('FAIL ARM — a row whose date was MOVED must enforce the new date, not the '
  + 'first one written', () => {
  /* Dates get moved — CLAUDE.md says owners may, with a reason — and a move is
   * recorded by ANNOTATING the row, so the superseded date is still sitting in
   * the text, earlier in the line. `recheckOf` takes the FIRST match, so an
   * appended new date loses to the old one and the row fires on a date its owner
   * already retired.
   *
   * Found live on 08-18: rows 4x (08-19 vs 08-20) and 21b (08-18 vs 08-23).
   * Both happened to resolve to the EARLIER date, which is the safe direction —
   * but relying on that is luck, not design. Fixed in the DATA, by writing the
   * superseded one as "recheck WAS 08-19", which this regex deliberately does
   * not match. */
  const md = [
    '| # | what | owner | status | next action |',
    '| 21b | a thing | A | OPEN | owner A, recheck WAS 08-18 — replaced. recheck 08-23 |',
  ].join('\n');
  const a = R.audit(md, '2026-08-19');
  assert.strictEqual(R.recheckOf(a.open[0]), '2026-08-23',
    'the retired date won: ' + R.recheckOf(a.open[0]));
  assert.strictEqual(a.overdue.length, 0,
    'the row fired on a date its owner had already moved');
});

ok('CONTROL — "recheck WAS" is the ONLY escape, so a row cannot retire a date '
  + 'it still means', () => {
  const md = [
    '| # | what | owner | status | next action |',
    '| 9 | a thing | A | OPEN | recheck 08-18, and we should recheck 08-23 too |',
  ].join('\n');
  //: two LIVE dates, neither retired — the first still governs, and the row is
  //: overdue. If this ever returned 08-23 the "WAS" convention would be
  //: unnecessary and the fix above would be papering over a looser rule.
  const a = R.audit(md, '2026-08-19');
  assert.strictEqual(R.recheckOf(a.open[0]), '2026-08-18');
  assert.strictEqual(a.overdue.length, 1);
});

ok('the LIVE register enforces one unambiguous date per open row', () => {
  const fs = require('fs');
  const path = require('path');
  const text = fs.readFileSync(
    path.join(__dirname, '..', '..', 'DEFECT-REGISTER.md'), 'utf8');
  const a = R.audit(text, '2026-08-18');
  /* Any open row carrying two DIFFERENT live dates is a row where the build's
   * behaviour depends on word order. Retired dates must say "recheck WAS". */
  const ambiguous = a.open.filter(r => {
    const seen = new Set();
    const re = /recheck\s+(?:(\d{4})-)?(\d{2})-(\d{2})/gi;
    let m;
    while ((m = re.exec(r.all)) !== null) seen.add(m[2] + '-' + m[3]);
    return seen.size > 1;
  });
  assert.strictEqual(ambiguous.length, 0,
    'open rows with two live recheck dates — write the retired one as '
    + '"recheck WAS MM-DD": ' + ambiguous.map(r => r.id.trim()).join(', '));
});

console.log(`\n${pass}/18 checks passed`);
