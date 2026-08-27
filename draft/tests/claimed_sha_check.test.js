// TERRITORY: A
/* CONTROLS FOR THE CLAIMED-SHA CHECK — register 254's structural half.
 *
 * The tool spends most of its life printing a list, and a list is exactly what
 * a broken classifier prints too. So the classifier is exercised on all three
 * states with answers known in advance, and the CLAIM regex is exercised on
 * text it must match and text it must NOT — the second half being the one that
 * decides whether "13 delivery claims" means anything, because a regex that
 * matched every sha mention would report the whole register as a claim.
 *
 * Run: node draft/tests/claimed_sha_check.test.js
 */
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const T = require(path.join(ROOT, 'draft', 'tools', 'claimed_sha_check.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const git = a => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();

// ── 1. THE CLASSIFIER, ON ALL THREE STATES ─────────────────────────────────
ck('CONTROL: the tool\'s own self-test passes, which is what it gates its '
  + 'report on', T.selfTest().length === 0, T.selfTest());

ck('KNOWN-NEGATIVE: main\'s tip classifies as on_main',
  T.classify(git(['rev-parse', 'origin/main'])) === 'on_main');

ck('KNOWN-POSITIVE: a well-formed sha that cannot exist classifies as '
  + 'unresolvable — not as on_main, which is the failure that would make the '
  + 'whole report read clean',
  T.classify('0'.repeat(40)) === 'unresolvable');

{
  /* The third state needs a commit that EXISTS and is not an ancestor. Derived
   * from whatever branches this clone happens to hold, because pinning one sha
   * here is the mistake register 3f names: a control anchored to a moving ref
   * passes once and fails forever. */
  let off = null;
  try { off = git(['rev-list', '--max-count=1', '--all', '--not', 'origin/main']); }
  catch (e) { off = null; }
  if (off) {
    ck('KNOWN-POSITIVE: a real commit that is not an ancestor classifies as '
      + 'not_on_main — the state the single boolean was flattening',
      T.classify(off) === 'not_on_main', { sha: off.slice(0, 8), got: T.classify(off) });
  } else {
    console.log('SKIP  no off-main commit in this clone — the not_on_main state '
      + 'cannot be exercised here, and the tool says so at runtime too');
  }
}

// ── 2. THE REGEX MATCHES CLAIMS AND ONLY CLAIMS ────────────────────────────
const shasIn = s => {
  const re = new RegExp(T.CLAIM.source, T.CLAIM.flags);
  const out = []; let m;
  while ((m = re.exec(s)) !== null) out.push(m[2]);
  return out;
};

ck('a delivery claim is matched, in every phrasing the mailboxes actually use',
  ['**DONE AND PUSHED (`26bb07f0`)**', 'FIXED in `a8797d95`.',
    'merged in bb55ca5f', 'landed in `e261392e`', 'shipped in 7b16525d',
    'Pushed `0af0111e`'].every(s => shasIn(s).length === 1),
  ['**DONE AND PUSHED (`26bb07f0`)**', 'FIXED in `a8797d95`.',
    'merged in bb55ca5f', 'landed in `e261392e`', 'shipped in 7b16525d',
    'Pushed `0af0111e`'].map(s => s + ' -> ' + JSON.stringify(shasIn(s))));

/* THE HALF THAT MAKES THE COUNT MEAN SOMETHING. A register full of "see
 * abc1234" is not a register full of delivery claims, and a regex that could
 * not tell them apart would report a number nobody should act on. */
ck('NEGATIVE ARM: a bare mention of a commit is NOT a delivery claim',
  ['see `abc1234` for the diff', 'the clobber was fd33cd15',
    'compare against 4a224f5e^', 'commit dc285528 is the one Cory asked about']
    .every(s => shasIn(s).length === 0),
  ['see `abc1234` for the diff', 'the clobber was fd33cd15',
    'compare against 4a224f5e^', 'commit dc285528 is the one Cory asked about']
    .map(s => s + ' -> ' + JSON.stringify(shasIn(s))));

ck('...and a short hex word that is not a sha does not become one',
  shasIn('fixed in beef') .length === 0, shasIn('fixed in beef'));

// ── 3. THE SWEEP REACHES THE MAILBOXES ─────────────────────────────────────
{
  const claims = T.scan();
  /* A FLOOR, NOT A PIN. The count moves every time somebody files a row; what
   * must never happen is the sweep silently reaching nothing, which is how a
   * path change turns this into a clean report about an empty set. */
  ck('CONTROL: the sweep actually reaches the mailboxes and finds claims there '
    + '(' + claims.length + ' today)', claims.length >= 5, claims.length);
  ck('...and every claim it found carries a file, a line and a sha',
    claims.every(c => c.file && c.line > 0 && /^[0-9a-f]{7,40}$/.test(c.sha)),
    claims.filter(c => !(c.file && c.line > 0 && /^[0-9a-f]{7,40}$/.test(c.sha))));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
