// TERRITORY: relay
// A STALE `origin/main` MUST SHOUT, BECAUSE `git show` ON ONE SUCCEEDS.
//
// `routes_branch_reconcile.js` was built because the relay quoted main's backlog
// to Cory while four lanes were clearing on branches main could not see. One day
// later that same tool ran against an `origin/main` that was 45 COMMITS STALE,
// and printed confident per-lane numbers with nothing on screen to say so.
//
// The reason it is dangerous rather than merely wrong: `git show origin/main:F`
// does not fail on a stale ref. It succeeds, fast, with the wrong content —
// clean plausible output from a probe aimed slightly off, which is the shape of
// every rule 3e/3f failure in this project's history.
//
// Run: node draft/tests/git_ref_freshness.test.js
'use strict';
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');
const F = require(path.join(ROOT, 'draft', 'tools', 'git_ref_freshness.js'));

let pass = 0;
function ok(name, fn) { fn(); console.log('PASS  ' + name); pass++; }

ok('FAIL ARM — a ref older than the threshold produces a banner that names the '
  + 'ref, the age, and the command that fixes it', () => {
  const b = F.stalenessBanner('origin/main', 60, 15);
  assert.ok(b, 'no banner for a 60-minute-old ref');
  assert.ok(b.includes('origin/main'), 'the ref is not named');
  assert.ok(/git fetch/.test(b), 'the fix is not named');
  assert.ok(b.includes('1.0h'), 'the age is not shown: ' + b.slice(0, 80));
});

ok('CONTROL — a FRESH ref produces NO banner. A warning that fires every run is '
  + 'a warning that gets scrolled past, which is this project\'s own epitaph for '
  + 'the intervention-rate check', () => {
  assert.strictEqual(F.stalenessBanner('origin/main', 1, 15), null);
  assert.strictEqual(F.stalenessBanner('origin/main', 15, 15), null,
    'exactly at the threshold is still fresh');
});

ok('an UNDATEABLE ref warns too — "I could not tell" and "it is fine" must not '
  + 'look the same, since the whole failure being prevented is a confident '
  + 'wrong number', () => {
  const b = F.stalenessBanner('origin/main', null, 15);
  assert.ok(b && /unverified/i.test(b), b);
});

ok('minutes render as minutes and hours as hours — 45 commits arrived in an '
  + 'hour on the night this was written, so the unit is the difference between '
  + '"slightly behind" and "a different repository"', () => {
  assert.ok(F.stalenessBanner('r', 30, 15).includes('30m'));
  assert.ok(F.stalenessBanner('r', 135, 15).includes('2.3h'));
});

ok('THE THRESHOLD IS SHORT ON PURPOSE and stays short — 15 minutes, tuned to a '
  + 'merge cadence of 16 commits in 73 minutes, not to a quiet week', () => {
  assert.strictEqual(F.STALE_MINUTES, 15);
});

ok('CONTROL — the REAL origin/main can be dated, so a fresh verdict is a '
  + 'measurement rather than a failed read', () => {
  const age = F.refAgeMinutes('origin/main', Date.now(), ROOT);
  assert.ok(typeof age === 'number' && Number.isFinite(age),
    'origin/main could not be dated: ' + age);
  assert.ok(age >= 0, 'negative age: ' + age);
});

ok('CONTROL — the two tools that compare against origin/main both call the '
  + 'warning. A helper nobody wired in is register 28 all over again', () => {
  const fs = require('fs');
  ['routes_branch_reconcile.js', 'reopen_risk.js'].forEach((t) => {
    const src = fs.readFileSync(path.join(ROOT, 'draft', 'tools', t), 'utf8');
    assert.ok(src.includes('git_ref_freshness'), t + ' does not require the helper');
    assert.ok(/warnIfStale\(/.test(src), t + ' requires it but never calls it');
  });
});

console.log('\n' + pass + '/' + pass + ' checks passed');
