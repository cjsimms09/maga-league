// TERRITORY: A
/* THE ANALYZER CHECKPOINT CRON — the caller analyzer_claims.js was missing.
 *
 * The pure half is tested in `analyzer_claims.test.js`. This tests the half that
 * decides WHICH checkpoint gets recorded, because that is where the two
 * defects that would silently ruin a season live:
 *
 *   · projecting THROUGH the week in progress, which feeds teamStrength a week
 *     of zeros and weakens every team by one week of nothing;
 *   · emitting an empty checkpoint in the preseason, which puts a claim in the
 *     ledger for a season that has not started.
 *
 * Both are asserted against the REAL season data rather than a fixture, because
 * a fixture of my own shape would agree with my own mistake.
 */
'use strict';
const CRON = require('../../netlify/functions/analyzer-cron.js');
const LO = require('../../src/routes/lineup.js');
const ST = require('../../src/routes/standings.js');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name); }
}

const history = LO.harvest();
const years = LO.defaultSeasons(history);
const season = LO.seasonOf(history, years[years.length - 1]);

// ── the checkpoint builds, on real data ─────────────────────────────────────
{
  const claims = CRON.buildCheckpoint(season, 7, 4);
  check('a real season at a real checkpoint produces claims', claims.length > 0);
  check('  two per team — a probability and a point', claims.length % 2 === 0);
  check('  every one carries a resolution rule stated before any outcome',
    claims.every(c => c.resolution_rule && c.key && c.ftype));
  check('  the cut it was run with is frozen into every probability rule',
    claims.filter(c => c.ftype === 'probability').every(c => /top 4 of the FINAL/.test(c.resolution_rule)));

  /* DETERMINISM. A re-run at the same checkpoint must reproduce the same
   * numbers, or the ledger's dedupe-by-key silently hides a second different
   * answer under the first key. */
  const again = CRON.buildCheckpoint(season, 7, 4);
  check('a RE-RUN at the same checkpoint reproduces identical values',
    JSON.stringify(claims) === JSON.stringify(again));

  const other = CRON.buildCheckpoint(season, 8, 4);
  check('  and a different checkpoint genuinely differs (the seed moves with it)',
    JSON.stringify(other) !== JSON.stringify(claims));
}

// ── the two defects this file exists for ────────────────────────────────────
{
  check('PRESEASON IS A CLEAN SKIP: week 0 emits nothing rather than an empty claim',
    CRON.buildCheckpoint(season, 0, 4).length === 0);
  check('  and a missing season emits nothing rather than throwing',
    CRON.buildCheckpoint(null, 7, 4).length === 0);

  /* ⚠️ THE OFF-BY-ONE THAT WOULD HAVE POISONED EVERY CHECKPOINT. The handler
   * passes liveWeek-1. Proving that matters means showing the projection ACTUALLY
   * MOVES between those two weeks — if it did not, the choice would be cosmetic
   * and this test would be theatre. */
  const at6 = CRON.buildCheckpoint(season, 6, 4).filter(c => c.ftype === 'probability');
  const at7 = CRON.buildCheckpoint(season, 7, 4).filter(c => c.ftype === 'probability');
  const moved = at6.some((c, i) => Math.abs(c.value - at7[i].value) > 0.01);
  check('THE CHECKPOINT CHOICE IS LOAD-BEARING: week 6 and week 7 give different odds',
    moved);
}

// ── resolutions ─────────────────────────────────────────────────────────────
{
  const claims = CRON.buildCheckpoint(season, 7, 4);
  const finalPlayoff = ST.actualPlayoffTeams(season).map(Number);
  const actual = ST.actualStandings(season);
  const wins = {};
  Object.keys(actual).forEach(r => { wins[String(r)] = actual[r].wins; });

  const res = CRON.buildCheckpointResolutions(claims, finalPlayoff, wins);
  check('a FINAL season resolves every claim', res.length === claims.length);
  check('  exactly `spots` teams resolve as having made it',
    res.filter(r => r.outcome === 1 && /playoff/.test(r.forecast_key)).length === 4);
  check('  and the wins resolutions carry signed error, so bias is readable',
    res.filter(r => r.signed_error !== undefined).length === claims.length / 2);

  /* AN UNFINISHED SEASON IS NOT A PILE OF MISSES — the distinction the whole
   * rail turns on, asserted here at the cron level and not only in the payload. */
  check('AN UNFINISHED SEASON RESOLVES NOTHING rather than scoring zeros',
    CRON.buildCheckpointResolutions(claims, null, {}).length === 0);

  /* Partial data must not be completed by guessing. */
  const partial = CRON.buildCheckpointResolutions(claims, finalPlayoff, {});
  check('  and missing final wins resolve only the playoff half, never both',
    partial.length === claims.length / 2);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
