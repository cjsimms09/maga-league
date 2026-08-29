/* TERRITORY: A. ONE ANSWER TO "HAS THIS SEASON ACTUALLY BEEN PLAYED?"
 *
 * ── WHY THIS IS A MODULE AND NOT THREE COPIES ──────────────────────────────
 *
 * Register 419: `objective_dp.js` guarded its season loop with
 * `if (!season.weeks || ...) return;`. That held while 2026 carried no weeks.
 * After the 08-22 draft the 2026 scaffolding landed EIGHTEEN WEEKS OF ZEROS —
 * week 1 is 09-10, nothing has been played — so 2026 walked through the guard
 * and added ten seats grading 0 for every owner and every arm. Every mean the
 * tool reported was diluted by exactly 30/40: +45.84/+29.33 read as
 * +34.38/+22.00, 0.75x to the decimal. Its control A refused to report, which
 * is the only reason anyone found out.
 *
 * `ungraded_season_leak.py` then measured the rest of the registry and found
 * the same contamination in `roster_builder_replay` (including a PREDICTION
 * LEDGER grade, P215's mean_delta −15.3 where the truth is −20.41) and in
 * `waiver_realized_level`. Three tools, one predicate.
 *
 * Register 408 is the reason this is a require and not a fourth paste: the
 * duplicate-arm guard was shipped four times by hand THAT SAME WEEK, by the
 * person quoting the lesson, and had to be extracted within the hour.
 *
 * ── THE PREDICATE IS "COMPLETE", AND THE DIFFERENCE IS A DATE ──────────────
 *
 * ⚠️ The obvious version asks whether ANY week has realized points. That is
 * correct today and becomes WRONG ON 2026-09-10, when week 1 is played: 2026
 * would satisfy it and enter a FULL-SEASON grade on 1 of 18 weeks — a subtler
 * error than the zeros, arriving on a schedule with nobody watching. A season
 * qualifies only when EVERY week it carries has been played.
 *
 * Measured 2026-08-29: 2023, 2024 and 2025 each carry 18 of 18 scored weeks;
 * 2026 carries 0 of 18.
 *
 * ⛔ THIS IS FOR SEASON-LEVEL GRADES. A weekly instrument that legitimately
 * wants partial data should NOT use it — and an artifact that is ABOUT the
 * current season (opponent_need_2026 requires 2026 by construction) must not
 * either. Filtering is not always the right answer; knowing is.
 */
'use strict';

/* A season counts only if every week it carries has somebody scoring in it. */
function isCompleteSeason(season) {
  const weeks = Object.values((season && season.weeks) || {});
  if (!weeks.length) return false;
  return weeks.every(entries => (entries || []).some(
    e => Number(e && e.points) > 0));
}

/* Partition, so the caller can REPORT the exclusion instead of silently
 * dropping it. An exclusion nobody can see is the defect 419 was built out
 * of, so the shape of this function makes announcing it the easy path. */
function splitByCompleteness(seasons) {
  const complete = [], incomplete = [];
  (seasons || []).forEach(s => (isCompleteSeason(s) ? complete : incomplete).push(s));
  return { complete, incomplete };
}

function selfTest() {
  let pass = 0, fail = 0;
  const ck = (n, ok, d) => { ok ? (pass++, console.log('PASS  ' + n))
    : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        ' + JSON.stringify(d).slice(0, 200) : ''))); };

  const scored = n => { const w = {}; for (let i = 1; i <= n; i++) w[i] = [{ points: 101.5 }]; return { weeks: w }; };
  const zeros = n => { const w = {}; for (let i = 1; i <= n; i++) w[i] = [{ points: 0 }]; return { weeks: w }; };

  ck('KNOWN NEGATIVE — 18 weeks of ZEROS is not a played season (the 2026 shape)',
    isCompleteSeason(zeros(18)) === false);
  ck('KNOWN POSITIVE — 18 weeks all scored IS (the 2023-25 shape)',
    isCompleteSeason(scored(18)) === true);

  /* THE DATE TRAP, as a test rather than a comment. */
  const oneOf18 = zeros(18);
  oneOf18.weeks[1] = [{ points: 101.5 }];
  ck('⭐ ONE scored week of 18 is still INCOMPLETE — this is the assertion that '
    + 'stops 09-10 from silently re-opening register 419',
    isCompleteSeason(oneOf18) === false);

  ck('no weeks at all is incomplete', isCompleteSeason({ weeks: {} }) === false);
  ck('a missing weeks key does not throw', isCompleteSeason({}) === false);
  ck('null does not throw', isCompleteSeason(null) === false);
  ck('a week whose entries are null does not throw and is incomplete',
    isCompleteSeason({ weeks: { 1: null } }) === false);

  const { complete, incomplete } = splitByCompleteness([scored(18), zeros(18), scored(18)]);
  ck('splitByCompleteness partitions and loses nothing',
    complete.length === 2 && incomplete.length === 1);

  /* Against the REAL file, so the module cannot drift from the data it is
   * about (register 121: a control written against invented input). */
  try {
    const path = require('path');
    const H = JSON.parse(require('fs').readFileSync(
      path.join(__dirname, '..', 'data', 'league_history.json'), 'utf8'));
    const s = {};
    H.seasons.forEach(x => { s[x.season] = isCompleteSeason(x); });
    ck('AGAINST THE LIVE FILE — 2023/2024/2025 complete, 2026 not',
      s['2023'] === true && s['2024'] === true && s['2025'] === true && s['2026'] === false, s);
  } catch (e) {
    ck('AGAINST THE LIVE FILE — league_history.json readable', false, String(e.message));
  }

  console.log('\n' + pass + '/' + (pass + fail) + ' self-tests passed');
  return fail ? 1 : 0;
}

if (require.main === module) process.exit(selfTest());
module.exports = { isCompleteSeason, splitByCompleteness };
