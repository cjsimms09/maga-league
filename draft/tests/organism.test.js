/* THE ORGANISM TEST — one system, provable.
 *
 * The claim under test: a decision made in one half of this tool is visible and
 * gradeable in the other. Draft and season are not two products sharing a repo.
 *
 * THE STANDARD, and it is the doctrine-wiring standard: a link passes only if
 * the OUTPUT CHANGES. "The data flows" is not enough — data passed to something
 * that never consumes it is exactly the bug the doctrine audit found, a
 * truthful-looking wire attached to a computation it does not touch. So every
 * link here asserts a visible behavioural difference.
 *
 *   LINK A  a draft pick's shadow roster, scored by in-season results
 *           -> PENDING: needs the season and in-season grading
 *   LINK B  an in-season efficiency measurement changing a draft-side
 *           opponent projection
 *           -> PENDING: needs in-season measurement
 *   LINK C  a January verdict updating EVIDENCE_STATE, which changes a draft
 *           surface's confidence sentence
 *           -> PROVEN BELOW
 *
 * C is seeded now rather than waiting, because an organism test filed as three
 * empty rows is a promise, and this file exists to replace promises with
 * assertions. A and B join as their halves land; until then they are listed as
 * pending IN THE OUTPUT, so the gap is visible on every run rather than
 * discovered later.
 *
 * Run: node draft/tests/organism.test.js
 */
'use strict';
const D = require('../../public/js/draft/deviation.js');

let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d ? '  -> ' + d : '')); } };

const player = { player_id: '1', name: 'Quinshon Judkins', position: 'RB',
  adjusted_adp: 78, raw_adp: 78, adp_sd: 6, adp_source: 'ffc' };
const entry = { player: player, score: 100, components: { weighted: { tier: 9 } } };
const badgeNow = () => D.badge(entry, 64, 4);

// ── LINK C: a season-half verdict changes a draft-half surface ──────────────
{
  const restore = JSON.parse(JSON.stringify(D.EVIDENCE_STATE[34]));

  const before = badgeNow();
  check('SETUP: the draft surface currently speaks from the pre-experiment state',
    /unvalidated vs market/.test(before.tierLine), before.tierLine);

  // The January verdict. This is the season half writing a result.
  D.recordEvidence(34, 'lost', 'lost to market by $41/season at n=36');

  const after = badgeNow();
  check('LINK C — a January verdict CHANGES what the draft surface says',
    after.tierLine !== before.tierLine,
    'before=' + before.tierLine + ' after=' + after.tierLine);
  check('...and the new sentence carries the actual finding, not a generic label',
    /lost to market/.test(after.tierLine) && /\$41/.test(after.tierLine),
    after.tierLine);
  check('...on the RENDERED badge, not merely in the state table',
    !/unvalidated/.test(after.tierLine), after.tierLine);

  // The reverse direction matters too: a corrected verdict must un-say it.
  D.recordEvidence(34, 'unrun', null);
  const reverted = badgeNow();
  check('LINK C is bidirectional — retracting the verdict restores the honest prior',
    reverted.tierLine === before.tierLine,
    'expected ' + before.tierLine + ' got ' + reverted.tierLine);

  D.recordEvidence(34, restore.status, restore.finding);
}

// ── NON-VACUITY: the link must be capable of failing ────────────────────────
{
  // If tierLine ever stops consulting EVIDENCE_STATE, every check above passes
  // for the wrong reason. Prove the dependency is live by asserting two
  // different states produce two different sentences.
  const restore = JSON.parse(JSON.stringify(D.EVIDENCE_STATE[34]));
  D.recordEvidence(34, 'won', 'beat market by $18/season at n=36');
  const won = D.tierLine('LEAN');
  D.recordEvidence(34, 'inconclusive', 'raced against market at n=36, inconclusive');
  const inc = D.tierLine('LEAN');
  D.recordEvidence(34, restore.status, restore.finding);
  check('NON-VACUITY: distinct verdicts produce distinct sentences',
    won !== inc && /beat market/.test(won) && /inconclusive/.test(inc),
    won + ' | ' + inc);
}

// ── THE PENDING LINKS, visible on every run ─────────────────────────────────
console.log('');
console.log('  PENDING LINKS (not yet assertable — listed so the gap stays visible):');
console.log('    LINK A  draft pick -> shadow roster scored by in-season results');
console.log('            blocked: needs the season + in-season grading');
console.log('    LINK B  in-season efficiency -> draft-side opponent projection');
console.log('            blocked: needs in-season measurement');
console.log('  Both join this file as their halves land. See PARKED.md ⑮.');

console.log(`\n${pass}/${pass + fail} organism checks passed (1 of 3 links proven)`);
process.exit(fail ? 1 : 0);
