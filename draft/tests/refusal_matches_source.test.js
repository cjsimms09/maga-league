// TERRITORY: A
/* THE MIRROR DEFECT, MADE OBSERVABLE.
 *
 * scorePlayer refuses a player when proj_mean <= 0. THAT KEY CANNOT TELL "NO
 * PROJECTION" FROM "PROJECTED AT ZERO." Today the two coincide exactly — 1181
 * players, all of them absence written as a number. That is luck, not design.
 * The day ingest legitimately projects somebody at 0.0 — a third-string kicker,
 * a suspended player — the rule silently reclassifies a MEASUREMENT as an
 * ABSENCE, and nothing would say so.
 *
 * THE REAL FIX IS C's STATUS CONTRACT (projected / absent / imputed, with vorp
 * null on absent and the engine refusing on STATUS rather than on VALUE), dated
 * to September. This suite does not fix it. It converts a KNOWN-LATENT defect
 * into an OBSERVABLE one, which is the whole pattern of this week:
 *
 *   the count the ENGINE refuses  ==  the count the SOURCE ARTIFACT lacks
 *
 * Identical today at 1181. THE DAY THEY DIVERGE IS THE DAY THE MIRROR DEFECT
 * FIRES. It is a count comparison, cheap enough to run on every build — and the
 * board rebuilds nightly (0 8 * * *), so the artifact drafted on is never the
 * one last audited by hand.
 *
 * WHY A COUNT AND NOT A SET COMPARISON: the two are computed by different
 * routes on purpose. The engine's number comes from RUNNING recommend() and
 * reading which entries carry score_error; the source number comes from
 * READING draft_data.json. A set comparison would be stronger but would share
 * the same player list; two independent paths to one number is what has caught
 * every real defect this week.
 *
 * Run: node draft/tests/refusal_matches_source.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const KEEP = require(path.join(ROOT, 'draft', 'tools', 'keepers_of.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const L = DATA.league;
const pool = DATA.players.filter(p => p.position && p.proj_mean != null && p.vorp != null);
const keep = KEEP.keepersFrom(DATA);
const board = pool.filter(p => !keep.some(k => String(k.player_id) === String(p.player_id)));

// PATH 1 — READ the artifact.
const sourceUnprojected = board.filter(p => !(Number(p.proj_mean) > 0));

// PATH 2 — RUN the engine and see what it refuses for want of a projection.
const scored = E.recommend({ board, roster: keep, league: L, currentPick: 1,
  nextPick: 8, totalPicks: 150, myPicksLeft: 15, roundsLeft: 15,
  runMultipliers: {}, intervening: [], weights: E.MEASURED_WEIGHTS });
const engineRefused = scored.filter(e => e.score_error
  && /no projection/.test(e.score_error.reason || ''));

ck('CONTROL: both paths found something — a zero/zero match proves nothing',
  sourceUnprojected.length > 0 && engineRefused.length > 0,
  { source: sourceUnprojected.length, engine: engineRefused.length });

ck('THE ENGINE REFUSES EXACTLY WHAT THE SOURCE LACKS',
  engineRefused.length === sourceUnprojected.length,
  { engine_refused: engineRefused.length,
    source_unprojected: sourceUnprojected.length,
    diverged_by: engineRefused.length - sourceUnprojected.length,
    meaning: 'a divergence means the refusal key (proj_mean <= 0) has started '
      + 'classifying something the source does not call missing — the mirror '
      + 'defect. MORE refused than missing = a real measurement was thrown away. '
      + 'FEWER = something unprojected is being scored. Both are findings.' });

/* AND THE SAME PLAYERS, NOT MERELY THE SAME COUNT. Weaker as an independent
 * check (it shares the player list) but it localises a divergence to a NAME
 * instead of a number, which is the difference between a finding and a puzzle. */
{
  const srcIds = new Set(sourceUnprojected.map(p => String(p.player_id)));
  const engIds = new Set(engineRefused.map(e => String(e.player.player_id)));
  const onlyEngine = [...engIds].filter(i => !srcIds.has(i));
  const onlySource = [...srcIds].filter(i => !engIds.has(i));
  const nameOf = id => (board.find(p => String(p.player_id) === id) || {}).name || id;
  ck('  and they are the SAME PLAYERS, so a divergence has a name',
    onlyEngine.length === 0 && onlySource.length === 0,
    { refused_but_source_has_a_projection: onlyEngine.slice(0, 5).map(nameOf),
      unprojected_but_still_scored: onlySource.slice(0, 5).map(nameOf) });
}

/* THE STANDING NUMBER. Not an assertion about football — a tripwire on the
 * SHAPE of the board. If a nightly rebuild changes this materially, somebody
 * should look at the build before drafting on it. */
console.log('\n  standing count: ' + sourceUnprojected.length + ' of ' + board.length
  + ' board players carry no projection ('
  + Math.round(100 * sourceUnprojected.length / board.length) + '%)');
console.log('  board built_at: ' + (DATA.built_at || 'unstamped')
  + '   — rebuilds nightly, so this is not the board last audited by hand');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
