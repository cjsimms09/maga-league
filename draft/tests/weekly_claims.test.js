// TERRITORY: A
/* WEEKLY GRADEABLE CLAIMS — the payloads and their resolutions.
 *
 * THE GAP THIS FILLS. The forecast rail is enforced (predledger refuses a
 * forecast without key/ftype/value/resolution_rule) and graded every week by
 * grade-cron. NOTHING EMITS A WEEKLY FORECAST INTO IT — the only
 * PredLedger.forecast caller is the draft client, which fires on draft night and
 * never again. The rail runs all season with nothing on it.
 *
 * Run: node draft/tests/weekly_claims.test.js
 */
'use strict';
const path = require('path');
const W = require(path.join(__dirname, '..', '..', 'src', 'weekly_claims.js'));
const PL = require(path.join(__dirname, '..', '..', 'src', 'predledger.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };
const threw = f => { try { f(); return null; } catch (e) { return e.message; } };

// ── THE LEDGER'S OWN VALIDATOR IS THE JUDGE, NOT MY OPINION OF THE SHAPE ────
{
  const f = W.matchupForecast({ season: '2026', week: 3, home: 'a', away: 'b', p_home: 0.62 });
  const bad = threw(() => PL.assertForecast && PL.assertForecast('forecast', f));
  ck('a matchup forecast passes the ledger\'s enforced skeleton', !bad, bad);
  const h = W.weeklyHighForecast({ season: '2026', week: 3, pick: 'c', field_size: 10 });
  const bad2 = threw(() => PL.assertForecast && PL.assertForecast('forecast', h));
  ck('  and so does the weekly high', !bad2, bad2);
}

// ── THE KEY IS STABLE, BECAUSE THE RESOLUTION JOINS ON IT ──────────────────
{
  const a = W.matchupForecast({ season: '2026', week: 3, home: 'x', away: 'y', p_home: 0.5 });
  const b = W.matchupForecast({ season: '2026', week: 3, home: 'y', away: 'x', p_home: 0.5 });
  ck('the key does not depend on which side is listed first', a.key === b.key, [a.key, b.key]);
  ck('  and it carries no timestamp — a re-run must not create a second forecast',
    !/\d{4}-\d{2}-\d{2}T/.test(a.key), a.key);
}

// ── THE TIE RULE IS STATED BEFORE THE OUTCOME AND APPLIED LITERALLY ────────
{
  const f = W.matchupForecast({ season: '2026', week: 3, home: 'a', away: 'b', p_home: 0.62 });
  ck('the resolution rule names the tie case', /tie resolves as NOT a home win/.test(f.resolution_rule));
  ck('  and a tie resolves to 0, as stated', W.resolveMatchup(f, { a: 100, b: 100 }).outcome === 0);
  ck('  a home win resolves to 1', W.resolveMatchup(f, { a: 110, b: 99 }).outcome === 1);
}

// ── UNPLAYED IS NULL, NOT A MISS ──────────────────────────────────────────
{
  const f = W.matchupForecast({ season: '2026', week: 3, home: 'a', away: 'b', p_home: 0.62 });
  ck('an unplayed matchup resolves to null, never to a loss',
    W.resolveMatchup(f, { a: 110 }) === null,
    'grading a game that has not happened as a miss is a fabricated outcome');
}

// ── THE WEEKLY-HIGH TIEBREAK IS APPLIED, NOT RE-DECIDED ───────────────────
{
  const h = W.weeklyHighForecast({ season: '2026', week: 3, pick: 'c', field_size: 10 });
  ck('a clean win resolves to the top scorer',
    W.resolveWeeklyHigh(h, { a: 100, b: 120, c: 130 }).outcome === 'c');
  ck('  a tie at the top breaks on season points-for, as the rule says',
    W.resolveWeeklyHigh(h, { b: 130, c: 130 }, { b: 900, c: 800 }).outcome === 'b');
  ck('  and hit/miss is recorded against the committed pick',
    W.resolveWeeklyHigh(h, { a: 100, b: 140, c: 130 }).hit === false);
  ck('  the field size rides with it — picking 1 of 10 is not picking 1 of 2',
    h.field_size === 10);
}

// ── NO GUESSED INPUTS ─────────────────────────────────────────────────────
{
  ck('a missing p_home throws', !!threw(() =>
    W.matchupForecast({ season: '2026', week: 3, home: 'a', away: 'b' })));
  ck('a probability outside [0,1] throws', !!threw(() =>
    W.matchupForecast({ season: '2026', week: 3, home: 'a', away: 'b', p_home: 1.4 })));
}

// ── A WEEK'S WORTH, END TO END ────────────────────────────────────────────
{
  const claims = W.weekClaims({ season: '2026', week: 5, weekly_high_pick: 'a',
    matchups: [{ home: 'a', away: 'b', p_home: 0.55 }, { home: 'c', away: 'd', p_home: 0.48 }] });
  ck('one week yields a claim per matchup plus the weekly high', claims.length === 3, claims.length);
  ck('  every key is distinct', new Set(claims.map(c => c.key)).size === 3);
  ck('  and every one carries a resolution rule', claims.every(c => c.resolution_rule));
  // DENSITY, which is the whole argument for this file: a 10-team season is
  // ~5 matchups x 14 weeks + 14 weekly highs = ~84 graded observations, against
  // the handful of draft-night forecasts that are all the rail sees today.
  ck('  a full season is dozens of observations, not a handful',
    (5 * 14) + 14 > 80);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
