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

/* ── A WELL-FORMED FILE OF THE WRONG SHAPE (register 154, A 2026-08-24) ──────
 *
 * The check above covers an UNREADABLE feed. It does not cover the more likely
 * accident: a file that parses perfectly and is shaped for a different reader.
 *
 * Register 154 — open, owner C, deadline before week 1 — specifies writing
 * `weekly_realized.json` as `{week: {player_id: points}}`. That contains no
 * arrays, so `loadRealized`'s filter assigns nothing and returns `{}`, which
 * every caller reads as "the season is quiet". A present, correct-looking,
 * fully-populated file reporting as no-data is strictly worse than the absent
 * file the runner already reports honestly.
 *
 * These write a REAL temp file at the real path rather than stubbing `fs`,
 * because the defect lives in the read path and a stub would prove the stub.
 * The path is asserted absent first and restored after — this file must never
 * leave an artifact behind (register 315: a suite that writes a committed
 * artifact can spend a deploy). */
{
  const fsx = require('fs');
  const pathx = require('path');
  const WK = pathx.join(__dirname, '..', '..', 'draft', 'data', 'weekly_realized.json');
  const modPath = require.resolve(pathx.join(__dirname, '..', '..', 'src', 'component_write.js'));

  check('CONTROL: weekly_realized.json is absent before these cases, so each one '
    + 'is genuinely creating the state it tests', !fsx.existsSync(WK));

  const feedErrorFor = (obj) => {
    fsx.writeFileSync(WK, JSON.stringify(obj));
    try {
      delete require.cache[modPath];
      return require(modPath).write(null).feed_error;
    } finally {
      if (fsx.existsSync(WK)) fsx.unlinkSync(WK);
      delete require.cache[modPath];
    }
  };

  try {
    const wrong = feedErrorFor({ '1': { '4034': 21.5 }, '2': { '4034': 9.1 } });
    check('KNOWN POSITIVE: the box-score shape register 154 proposes IS rejected '
      + 'rather than read as an empty season', !!wrong && /NOT ONE ARRAY/.test(wrong));

    const right = feedErrorFor({
      projection: [{ player_id: '4034', week: 1, actual: 21.5, proj: 18 }] });
    check('KNOWN NEGATIVE: the component-keyed array shape this reader wants is '
      + 'accepted, so the guard is not simply rejecting everything', right === null);

    check('KNOWN NEGATIVE: an EMPTY object is legitimate "written, nothing yet" '
      + 'and must not trip the guard — the runner already reports absence honestly',
    feedErrorFor({}) === null);
  } finally {
    if (fsx.existsSync(WK)) fsx.unlinkSync(WK);
    delete require.cache[modPath];
  }

  check('CONTROL: weekly_realized.json is absent again afterwards — this suite '
    + 'leaves no artifact behind (register 315)', !fsx.existsSync(WK));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
