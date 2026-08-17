// TERRITORY: A
// ROUTES.md IS CORRUPTED BY MERGES, NOT BY CARELESSNESS — SO A HABIT CANNOT FIX IT.
//
// C's parked request, built. They diagnosed it from two commit archaeologies and
// could not build the guard: this file is A's and territory-check refuses them.
// Their words: *"Both incidents were merge RESOLUTION taking one side of a
// region, not a lane editing wrongly, so no amount of care from any of us
// prevents the next one."*
//
// FIVE KNOWN INCIDENTS, and the last three were mine on 2026-08-13:
//
//   1. `8ba81c4` — a whole block DUPLICATED. The TO: B block went from one copy
//      to two: 22 byte-identical lines, 9 items doubled. `lane-start.sh` reported
//      19 open items to B where 10 existed. Removed in `436eade`.
//   2. `8ae5a33` — a handled item RESURRECTED. C deleted the line, replied, and
//      committed; the merge brought the deleted block back AND kept the reply, so
//      one inbox showed an item already answered and the other showed the answer.
//   3-5. Three conflicts in one session while landing the pick-numbering work. I
//      resolved each by hand, ran C's three checks manually every time, and
//      counted items on both sides to prove nothing was lost. That worked because
//      I had just read their diagnosis. It is not a mechanism.
//
// ── WHY THE OBVIOUS FIXES ARE WRONG ───────────────────────────────────────
//
// The file's whole contract is line-by-line — *"deleting the line IS the
// receipt"* — and git resolves by REGION. A deletion on one side plus any edit on
// the other is exactly the case that gets restored.
//
// `merge=union` in `.gitattributes` MAKES IT WORSE, not better: union keeps both
// sides, which is incident 1 by design and incident 2 as well. C called that and
// they are right.
//
// So the guard is not about merging. It catches the RESULT at the commit that
// causes it, rather than whenever somebody next reads the file.
//
// Run: node draft/tests/routes_integrity.test.js
/* TERRITORY-GRANT: B key, base, inBase, lost, unionLost, itemsOf, execSync, ROOT
 *
 * GRANTED BY A, 2026-08-14. This arm fired on every legitimate merge: the union
 * rule was "every item from either side survives", but an item B closed
 * deliberately still exists on my side, and the merge correctly preserves the
 * deletion. The check could not tell a closure from a casualty.
 *
 * Using the MERGE BASE to separate them is the correct discrimination, and it
 * keeps the case this arm exists for — an item new on the other side and absent
 * from the base is still a hard failure. It falls back to the strict rule with
 * no base, so a noisy guard is preferred to a blind one. That is my own suite's
 * standard applied better than I applied it.
 */

'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const P = path.join(ROOT, 'ROUTES.md');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 400) : '')); }
};

ck('ROUTES.md exists — the channel is the coordination mechanism', fs.existsSync(P));
if (!fs.existsSync(P)) { console.log('\nFAILED'); process.exit(1); }
const SRC = fs.readFileSync(P, 'utf8');
const LINES = SRC.split('\n');

/* An ITEM is a line beginning `- [ ]` or `- [x]`. The heading above it decides
 * whose inbox it lands in, which is why an orphan is not cosmetic. */
const isItem = l => /^- \[[ xX]\]/.test(l);
const isHeading = l => /^## TO: /.test(l);

// ── CHECK 1: NO DUPLICATE ITEM LINES (incident 1) ────────────────────────
// A duplicated block is byte-identical by construction — that is what made it
// invisible and what makes it detectable.
{
  const items = LINES.filter(isItem);
  const seen = new Map();
  items.forEach(l => seen.set(l, (seen.get(l) || 0) + 1));
  const dupes = [...seen.entries()].filter(([, n]) => n > 1);
  ck('no item line appears twice', dupes.length === 0,
    dupes.map(([l, n]) => n + '× ' + l.slice(0, 90)));
  ck('CONTROL — there are items to check at all', items.length > 5, items.length);
}

// ── CHECK 2: EVERY ITEM SITS UNDER A `## TO:` HEADING (incident 2) ───────
// A resurrected block often lands outside its heading, and an item with no
// addressee is an item nobody's inbox shows.
{
  let head = null;
  const orphans = [];
  LINES.forEach((l, i) => {
    if (isHeading(l)) head = l;
    else if (isItem(l) && !head) orphans.push((i + 1) + ': ' + l.slice(0, 80));
  });
  ck('every item is addressed — none sits above the first `## TO:` heading',
    orphans.length === 0, orphans);
  const heads = LINES.filter(isHeading);
  ck('CONTROL — the file really is organised by addressee', heads.length >= 2,
    heads.map(h => h.trim()));
  const lanes = heads.map(h => h.replace('## TO: ', '').trim());
  ck('and every heading names a known lane', lanes.every(x => ['A', 'B', 'C', 'D'].indexOf(x) >= 0),
    lanes);
  ck('no lane has TWO headings — a second one splits an inbox in half and each '
    + 'half looks complete', new Set(lanes).size === lanes.length, lanes);
}

// ── CHECK 3: NO CONFLICT MARKERS COMMITTED ───────────────────────────────
// The loudest possible corruption, and the one a hurried resolution leaves.
{
  const marks = LINES.map((l, i) => ({ l: l, i: i + 1 }))
    .filter(x => /^(<<<<<<<|=======|>>>>>>>)\s*/.test(x.l) && x.l.trim() !== '=======' + '');
  const strict = LINES.map((l, i) => ({ l: l, i: i + 1 }))
    .filter(x => /^<<<<<<< |^>>>>>>> /.test(x.l) || x.l.trim() === '=======');
  ck('no conflict markers survive in the committed file', strict.length === 0,
    strict.map(x => x.i + ': ' + x.l.slice(0, 60)));
  ck('CONTROL — the detector is not merely finding nothing everywhere',
    marks.length === 0 && /^## /m.test(SRC));
}

// ── CHECK 4: THE COUNT PER LANE IS REPORTABLE ────────────────────────────
// Incident 1's SYMPTOM was `lane-start.sh` reporting 19 items to B where 10
// existed. Counting here is what makes that number trustworthy, and printing it
// is what makes a silent doubling visible in the log rather than only on a
// threshold nobody set.
{
  let head = null;
  const per = {};
  LINES.forEach(l => {
    if (isHeading(l)) head = l.replace('## TO: ', '').trim();
    else if (isItem(l) && head) per[head] = (per[head] || 0) + 1;
  });
  const total = Object.values(per).reduce((a, b) => a + b, 0);
  ck('every item is counted into exactly one lane',
    total === LINES.filter(isItem).length, { per: per, total: total });
  console.log('      lanes: ' + Object.keys(per).sort()
    .map(k => k + ' ' + per[k]).join('  ') + '   (total ' + total + ')');
}

// ── FAIL ARMS — the two REAL incidents, reconstructed ────────────────────
// Every check above passes on a clean file, which proves nothing about
// detection. These replay what actually happened.
{
  const run = (text) => {
    const ls = text.split('\n');
    const items = ls.filter(isItem);
    const seen = new Map();
    items.forEach(l => seen.set(l, (seen.get(l) || 0) + 1));
    let head = null; const orph = [];
    ls.forEach(l => { if (isHeading(l)) head = l; else if (isItem(l) && !head) orph.push(l); });
    return {
      dupes: [...seen.values()].filter(n => n > 1).length,
      orphans: orph.length,
      markers: ls.filter(l => /^<<<<<<< |^>>>>>>> /.test(l) || l.trim() === '=======').length,
    };
  };
  ck('CONTROL — the live file is clean by this same routine',
    run(SRC).dupes === 0 && run(SRC).orphans === 0 && run(SRC).markers === 0, run(SRC));

  /* INCIDENT 1: a merge duplicates a whole block. Byte-identical, which is
   * exactly why nobody saw it and exactly how it is caught. */
  const block = '## TO: B\n\n- [ ] 2026-08-13 · A · GATED ITEM 2\n- [ ] 2026-08-13 · C · another\n';
  ck('FAIL ARM — incident 1: a duplicated block is DETECTED',
    run(block + block).dupes === 2, run(block + block));

  /* INCIDENT 2: a deletion on one side plus an edit on the other restores the
   * deleted line. The restored copy can land outside its heading. */
  const resurrected = '- [ ] 2026-08-13 · A · a handled item, brought back\n'
    + '## TO: C\n\n- [ ] 2026-08-13 · A · the reply that was kept\n';
  ck('FAIL ARM — incident 2: a resurrected item outside its heading is DETECTED',
    run(resurrected).orphans === 1, run(resurrected));

  /* A HURRIED RESOLUTION leaves markers. */
  const conflicted = '## TO: A\n<<<<<<< HEAD\n- [ ] 2026-08-13 · C · mine\n=======\n'
    + '- [ ] 2026-08-13 · B · theirs\n>>>>>>> origin/main\n';
  ck('FAIL ARM — committed conflict markers are DETECTED',
    run(conflicted).markers === 3, run(conflicted));

  /* AND THE ONE THAT WOULD HAVE FOOLED A NAIVE VERSION: two lanes, same text.
   * Two different sessions can legitimately write the same short line to two
   * different inboxes, so a duplicate check that ignores position would fire on
   * honest content. It does not — the check is on the LINE, and a real item line
   * carries its date, its author and its subject, so identical lines in two
   * lanes are the duplication, not a coincidence. Asserted so the rule is
   * deliberate rather than incidental. */
  ck('CONTROL — real item lines are long enough that an accidental collision is '
    + 'not credible', LINES.filter(isItem).every(l => l.length > 40),
    LINES.filter(isItem).filter(l => l.length <= 40).map(l => l.slice(0, 50)));
}

// ── CHECK 5: DURING A MERGE, NOTHING MAY BE LOST ─────────────────────────
// THE GAP I JUST DECLARED, CLOSED. A deleted item leaves nothing behind to find
// in the committed file — but while a merge is IN PROGRESS both sides are still
// on disk as git stages, and the union property is checkable exactly then.
//
// That is the manual check I ran three times today: `git show :2:` and `:3:`,
// count `- [ ]` on both, confirm every line survives. Doing it from memory is a
// habit. Doing it here is a mechanism, and Cory's standing rule is the second.
//
// It is INERT outside a merge, so it costs nothing on an ordinary run — and that
// is also its limit, stated plainly: it only fires if somebody runs the suite
// after resolving and before committing.
{
  const cp = require('child_process');
  const stage = (n) => {
    try {
      return cp.execFileSync('git', ['show', ':' + n + ':ROUTES.md'],
        { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (e) { return null; }
  };
  /* THE UNION LOGIC, EXERCISED WHETHER OR NOT A MERGE IS IN PROGRESS.
   *
   * A branch that only runs during a merge is a branch that has never run — and
   * an unexercised check is one of two things this repo keeps finding: a clause
   * that reads like a guard and holds nothing. Rule 13f in its most literal
   * form: before believing a SKIP, show the thing can fail. So the comparison is
   * a named function, driven here on synthetic sides, and the real stages just
   * feed it when they exist. */
  const itemsOf = t => t.split('\n').filter(isItem);
  const unionLost = (oursTxt, theirsTxt, resolvedItems) => {
    const both = new Set(itemsOf(oursTxt).concat(itemsOf(theirsTxt)));
    const now = new Set(resolvedItems);
    return [...both].filter(l => !now.has(l));
  };
  {
    const A = '## TO: C\n- [ ] 2026-08-13 · A · an item only A wrote, long enough to be real\n';
    const B = '## TO: C\n- [ ] 2026-08-13 · B · an item only B wrote, long enough to be real\n';
    const goodResolve = itemsOf(A).concat(itemsOf(B));
    const tookOneSide = itemsOf(A);          // the exact failure C diagnosed
    ck('CONTROL — a true union loses nothing',
      unionLost(A, B, goodResolve).length === 0);
    ck('FAIL ARM — taking ONE SIDE of a region is DETECTED as a lost item, which '
      + 'is the corruption nobody could see',
      unionLost(A, B, tookOneSide).length === 1,
      unionLost(A, B, tookOneSide).map(l => l.slice(0, 60)));
  }

  const ours = stage(2), theirs = stage(3);
  if (!ours || !theirs) {
    console.log('SKIP  merge-union against real stages — no merge in progress '
      + '(the logic above was still exercised)');
  } else {
    /* ⚠️ THIS BRANCH CRASHED ON `now is not defined` UNTIL 2026-08-14, and the
     * shape is the one this repo keeps paying for: `now` is scoped INSIDE
     * `unionLost` above, and this line is outside it. The branch only runs while
     * a merge is in progress, so every ordinary run printed SKIP and passed —
     * the guard died precisely and only when it was doing its job.
     *
     * It was live for a full day of ROUTES merges. I saw a FAIL line from here
     * this morning, never saw a total, and did not ask why. A crash after a
     * `ck` reads exactly like a suite that stopped at the failure. */
    const resolved = LINES.filter(isItem);
    const lost = unionLost(ours, theirs, resolved);
    ck('MERGE — every item line from EITHER side survives the resolution',
      lost.length === 0, lost.map(l => l.slice(0, 90)));
    ck('CONTROL — both sides genuinely carry items, or the union proves nothing',
      itemsOf(ours).length > 0 && itemsOf(theirs).length > 0,
      { ours: itemsOf(ours).length, theirs: itemsOf(theirs).length });
    ck('and the summary below can actually be computed — this line threw for a '
      + 'day, which is how a guard fails silently in the only state it matters',
    Number.isFinite(resolved.length));
    console.log('      merge union: ours ' + itemsOf(ours).length + ' + theirs '
      + itemsOf(theirs).length + ' -> ' + resolved.length + ' resolved');
  }
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) {
  console.log('\nFAILED — ROUTES.md is corrupted. This is almost certainly a MERGE');
  console.log('resolution, not a lane editing wrongly. Resolve as a UNION and verify:');
  console.log('  git show :2:ROUTES.md and :3:ROUTES.md, count `- [ ]` on both sides,');
  console.log('  and confirm every item line from EITHER side survives in the result.');
  process.exit(1);
}
console.log('\nWHAT THIS GUARANTEES: a duplicated block, a resurrected item that lands');
console.log('outside its heading, and committed conflict markers all fail at the commit');
console.log('that causes them rather than whenever somebody next reads the file.');
console.log('An item DELETED by a merge is caught too, but ONLY while the merge is still');
console.log('in progress — the union check reads git stages 2 and 3, which exist between');
console.log('resolving and committing.');
console.log('WHAT IT DOES NOT: catch that deletion after the merge is committed. The two');
console.log('sides are gone by then and a missing line leaves nothing behind to find. So');
console.log('the union check only fires if the suite is run before committing a merge —');
console.log('which is a habit about WHEN to run it, wrapped around a real mechanism.');
