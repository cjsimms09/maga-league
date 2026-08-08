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

/* ── THE PENDING LINKS, AND THE CHECK THAT THEY DO NOT STAY PENDING ─────────
 *
 * A test with permanently-pending assertions is a test that stops being read.
 * The failure mode is specific: the dependency lands, nobody remembers this
 * file, and the "PENDING" note quietly becomes false — the link is buildable and
 * unbuilt, and the suite is still green because it is only printing a string.
 *
 * So each pending link names a DEPENDENCY PREDICATE it can evaluate itself, and
 * FAILS when the dependency has landed while the link is still pending. The test
 * notices its own unblocking.
 */
const PENDING = [
  {
    id: 'LINK A',
    what: 'draft pick -> shadow roster scored by in-season results',
    blockedBy: 'the 2026 season + in-season grading',
    // Landed when shadow rosters can be graded against realized weekly results.
    landed: () => {
      try {
        const S = require('../../public/js/draft/shadows.js');
        return typeof S.gradeAgainstSeason === 'function';
      } catch (e) { return false; }
    },
  },
  {
    id: 'LINK B',
    what: 'in-season efficiency -> draft-side opponent projection',
    blockedBy: 'the in-season tools (Command Center, PARKED.md ⑭)',
    landed: () => {
      try {
        const E = require('../../public/js/draft/engine.js');
        return typeof E.applyInSeasonEfficiency === 'function';
      } catch (e) { return false; }
    },
  },
];

console.log('');
console.log('  PENDING LINKS (listed so the gap stays visible on every run):');
PENDING.forEach(l => {
  const up = l.landed();
  console.log('    ' + l.id + '  ' + l.what);
  console.log('            blocked by: ' + l.blockedBy + (up ? '   <-- LANDED' : ''));
  check(l.id + ' is still legitimately pending (its dependency has NOT landed)',
    !up,
    l.id + "'s dependency is now present, so the link is buildable and unbuilt. "
      + 'Write the assertion and move it above — a pending note that has become '
      + 'false is worse than no note, because the suite stays green while the '
      + 'organism has a hole nobody is looking at.');
});
console.log('  Both join this file as their halves land. See PARKED.md ⑮.');

console.log(`\n${pass}/${pass + fail} organism checks passed (1 of 3 links proven)`);
process.exit(fail ? 1 : 0);
