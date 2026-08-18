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

// ── THE SCHEDULED MIDDLE (loop closure 2026-08-15) ──────────────────────────
// The resolvers above existed from the day the emitter landed, and NOTHING
// scheduled them: every checkpoint would have pended forever while grade-cron
// graded an empty join. This block walks the whole arc the way the cron now
// runs it — emission → premature pass resolves NOTHING and says why →
// season-final pass resolves ONCE → a re-run finds nothing pending.
{
  // emission fixture: real season, real checkpoint, appended as ledger entries
  const claims = CRON.buildCheckpoint(season, 7, 4);
  const ledger = claims.map(c => ({ kind: 'forecast',
    method: 'analyzer-checkpoint-v1', payload: c }));
  // plus a non-analyzer forecast that must NEVER be swept up by this pass
  ledger.push({ kind: 'forecast', method: 'weekly-claims-v1',
    payload: { key: 'wk|x', ftype: 'probability', value: 0.5 } });

  check('the pending scan finds exactly the analyzer checkpoints, no other rail',
    CRON.pendingAnalyzerForecasts(ledger).length === claims.length);

  // PREMATURE: a season with a missing regular-season week is NOT final
  const partial = { ...season,
    weeks: Object.fromEntries(Object.entries(season.weeks || {})
      .filter(([w]) => Number(w) !== 3)) };
  check('a season missing week 3 reads NOT FINAL — a hole is never assumed scored',
    CRON.seasonIsFinal(partial) === false);
  check('  while the real, complete season reads final',
    CRON.seasonIsFinal(season) === true);

  // SEASON-FINAL: the pass resolves everything, once
  const pending = CRON.pendingAnalyzerForecasts(ledger);
  const res = CRON.buildFinalResolutions(pending, season);
  check('at season-final the pass resolves every pending checkpoint',
    res.length === claims.length);
  check('  playoff outcomes are 0/1 and exactly `spots` teams resolve as in',
    res.filter(r => r.outcome === 1 && /playoff/.test(r.forecast_key)).length === 4);

  /* THE PINNED CUT. A forecast made under spots=4 must resolve against the
   * top FOUR even if the league later moves to 6 — the rule its own
   * resolution_rule promises. Proven by resolving a spots=6 forecast for a
   * team that finished 5th-or-6th: under its own pinned cut it is IN. */
  const rec = ST.actualStandings(season);
  const order = ST.seedOrder(Object.values(rec));
  const fifth = String(order[4]);
  const AC = require('../../src/analyzer_claims.js');
  const wide = AC.playoffForecast({ season: 2099, throughWeek: 7, rid: fifth,
    playoff_prob: 0.5, spots: 6 });
  const wideRes = CRON.buildFinalResolutions([wide], season);
  check('the cut is read from each forecast\'s OWN subject.spots (spots=6 claim: '
    + '5th place resolves IN while the spots=4 claims above resolved it OUT)',
  wideRes.length === 1 && wideRes[0].outcome === 1);
  check('  and a forecast with no pinned cut is refused, never guessed',
    CRON.buildFinalResolutions([{ ...wide, subject: { rid: fifth } }], season).length === 0);

  // DEDUPE: append the resolutions, re-run the scan — nothing pending
  const after = ledger.concat(res.map(r => ({ kind: 'forecast_resolution',
    method: 'analyzer-checkpoint-v1', payload: r })));
  check('A RE-RUN AFTER RESOLUTION FINDS NOTHING PENDING — forecast_key dedupe, '
    + 'the same discipline claims-cron uses, so Sundays never stack duplicates',
  CRON.pendingAnalyzerForecasts(after).length === 0);
  const res2 = CRON.buildFinalResolutions(CRON.pendingAnalyzerForecasts(after), season);
  check('  and the second pass appends zero resolutions', res2.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
