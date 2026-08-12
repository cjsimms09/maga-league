// TERRITORY: A
/* THE COMPONENT-GRADE WRITER — and the one property that matters before week 1.
 *
 * The artifact this writes is ALL NULLS today and will be until realized data
 * lands. So the tests that matter are not "does it write six rows" — they are
 * the ones that distinguish a healthy writer emitting nulls from a broken one
 * emitting the same nulls, because those are the two states the season opens in
 * and they look identical from the outside.
 */
'use strict';
const assert = require('assert');
const W = require('../../src/component_write.js');
const RUN = require('../../src/component_run.js');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name); }
}

// ── the artifact's shape ────────────────────────────────────────────────────
const doc = W.build();

check('every declared component appears, including the ones with no data',
  doc.rows.length === doc.declared && doc.declared === 6);

check('a row with no data NAMES THE INPUT IT AWAITS rather than reporting empty',
  doc.rows.filter(r => r.verdict === 'no_data').every(r => r.awaiting && r.awaiting.length > 20));

check('  (a reader in week 3 needs to know WHICH feed is missing, not that one is)',
  doc.rows.some(r => /box scores/.test(r.awaiting || '')));

check('each row carries its own materiality bar and cluster unit',
  doc.rows.every(r => r.units && r.units.material != null && r.units.cluster_is));

check('the artifact says it proposes nothing',
  /PROPOSES NOTHING/.test(doc.note));

// ── THE SELF-CHECK, which is the whole point ────────────────────────────────
check('the self-check PASSES on a healthy grading path', doc.self_check.ok === true);

check('  and it is labelled NOT evidence about the league',
  doc.self_check.is_evidence_about_the_league === false);

check('  and it says what it actually is (rule 10d — a fixture is not a result)',
  /rule 10d/.test(doc.self_check.what_it_is || ''));

/* ⚠️ NON-VACUITY. The self-check asserting `ok === true` proves nothing unless a
 * BROKEN path makes it false. Without this, a self-check hardcoded to true would
 * pass every test above — which is precisely the guard-that-does-not-guard
 * failure the self-check exists to prevent, reproduced inside its own test. */
const realRunAll = RUN.runAll;
try {
  RUN.runAll = () => ({ components: [{ name: 'weekly_claims', verdict: 'noise' }] });
  const broken = W.selfCheck();
  check('BROKEN ON PURPOSE: a grading path returning the wrong verdict FAILS the self-check',
    broken.ok === false);
  check('  and the detail says the nulls are not evidence',
    /PIPE IS BROKEN/.test(broken.detail));

  RUN.runAll = () => { throw new Error('exploded'); };
  const threw = W.selfCheck();
  check('BROKEN ON PURPOSE: a grading path that THROWS fails rather than propagating',
    threw.ok === false && /exploded/.test(threw.detail));
} finally {
  RUN.runAll = realRunAll;
}

check('CONTROL: the self-check passes again once the real path is restored',
  W.selfCheck().ok === true);

// ── the feed-error path ─────────────────────────────────────────────────────
/* An unreadable input that silently became "no data" would report a BROKEN FEED
 * as a QUIET SEASON. The writer surfaces it; this asserts the field exists and
 * is null when the feed is fine, so a consumer can rely on it. */
check('feed_error is null when there is simply no feed yet (absent != broken)',
  doc.feed_error === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
