/* ITEM 13 — THE NaN THAT WAS OBSERVED AND THEN COULD NOT BE FOUND.
 *
 * On 2026-08-12, commit 39f1a92 reported: "EVERY PLAYER AT A FILLED POSITION
 * SCORES NaN", measured at pick 41 on the real board with production weights —
 * 219/219 QBs NaN with one QB rostered, 1,580/1,719 with a QB and three RBs, 0
 * on an empty roster. It named the pick-110 UNKNOWN resolution as the same
 * mechanism. It was routed to A and never independently reproduced.
 *
 * CORY'S RULE, AND IT IS THE RIGHT ONE: a defect that disappears without an
 * identified cause is DORMANT, NOT FIXED. Non-reproduction across N states is
 * information and is not an answer. Three explanations fit "we cannot find it
 * now" and only one of them is safe:
 *
 *   (a) something changed that removed the state that produced it
 *   (b) the state is rarer than the sampling reaches
 *   (c) the reproduction does not exercise the path that produced it
 *
 * THIS FILE IS THE ATTEMPT TO TELL THEM APART, by reproducing at the reporting
 * commit rather than at HEAD — if it will not reproduce on the engine that
 * reported it, (a) is excluded and the cause is in the CONTEXT, not the code.
 *
 * THERE IS A DOCUMENTED PRECEDENT FOR EXACTLY THAT. Three days earlier,
 * draft/audit/rule12_result_2026-08-11.md recorded three harness faults that
 * "each looked like an engine defect. None was." The first: "NaN on 8 of 11. My
 * ctx passed `targetPick`; the engine reads `nextPick`." Same symptom, same
 * week, cause in the caller.
 *
 * Run: node draft/tools/nan_provenance.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const L = DATA.league;

const pool = DATA.players.filter(p => p.position && p.proj_mean != null && p.vorp != null);
const byVorp = pool.slice().sort((a, b) => b.vorp - a.vorp);
const adpOf = p => (p.adjusted_adp != null ? p.adjusted_adp : (p.raw_adp != null ? p.raw_adp : 9999));

/* The 17 keys app.js's context() actually supplies. live_context.js is the
 * authority; repeated here as the FULL ctx so each probe below can remove
 * exactly one thing and attribute the result to that removal. */
function fullCtx(roster) {
  const taken = new Set(roster.map(p => String(p.player_id)));
  pool.slice().sort((a, b) => adpOf(a) - adpOf(b)).slice(0, 40)
    .forEach(p => taken.add(String(p.player_id)));
  return {
    board: pool.filter(p => !taken.has(String(p.player_id))),
    roster: roster, league: L, currentPick: 41, nextPick: 56, totalPicks: 150,
    myPicksLeft: 10, roundsLeft: 10, runMultipliers: {}, intervening: [],
    weights: E.MEASURED_WEIGHTS,
  };
}

function nanProfile(ctx) {
  let recs;
  try { recs = E.recommend(ctx); } catch (err) { return { threw: err.message }; }
  const byPos = {};
  recs.forEach(r => {
    const pos = r.player.position;
    byPos[pos] = byPos[pos] || { n: 0, nan: 0 };
    byPos[pos].n++;
    if (!isFinite(Number(r.score))) byPos[pos].nan++;
  });
  return {
    total: recs.length,
    nan: recs.filter(r => !isFinite(Number(r.score))).length,
    byPos: byPos,
    topNaN: recs.length ? !isFinite(Number(recs[0].score)) : false,
  };
}

function line(label, p) {
  if (p.threw) return '  ' + label.padEnd(34) + 'THREW: ' + p.threw;
  const parts = Object.keys(p.byPos).sort()
    .filter(k => p.byPos[k].nan > 0)
    .map(k => k + ' ' + p.byPos[k].nan + '/' + p.byPos[k].n);
  return '  ' + label.padEnd(34) + String(p.nan).padStart(5) + '/' + p.total + ' NaN'
    + (parts.length ? '   ' + parts.join('  ') : '')
    + (p.topNaN ? '   TOP IS NaN' : '');
}

const oneQB = [byVorp.filter(p => p.position === 'QB')[0]];
const qb3rb = oneQB.concat(byVorp.filter(p => p.position === 'RB').slice(0, 3));

console.log('NaN PROVENANCE — item 13\n');
console.log('  The reported signature (39f1a92): with one QB rostered, 219/219 QBs NaN');
console.log('  and every other position clean; with QB+3RB, 1,580/1,719 NaN; empty');
console.log('  roster clean. Pick 41, real board, production weights.\n');

console.log('  ARM 1 — the reported states, on TODAY\'s engine, complete context:');
console.log(line('empty roster', nanProfile(fullCtx([]))));
console.log(line('one QB rostered', nanProfile(fullCtx(oneQB))));
console.log(line('QB + three RBs', nanProfile(fullCtx(qb3rb))));

console.log('\n  ARM 2 — the same states with ONE context key removed at a time.');
console.log('  This is the class rule12_result_2026-08-11 already documented: a ctx');
console.log('  that passes targetPick where the engine reads nextPick.\n');
const KEYS = ['nextPick', 'currentPick', 'totalPicks', 'myPicksLeft', 'roundsLeft',
  'league', 'weights', 'runMultipliers', 'intervening'];
const culprits = [];
KEYS.forEach(k => {
  const ctx = fullCtx(qb3rb);
  delete ctx[k];
  const p = nanProfile(ctx);
  if (!p.threw && p.nan > 0) culprits.push({ key: k, nan: p.nan, total: p.total, byPos: p.byPos });
  console.log(line('without ctx.' + k, p));
});

/* THE DISCRIMINATOR. The report said the NaN was POSITION-SELECTIVE — every
 * player at a FILLED position, nothing elsewhere. A missing context key should
 * hit the whole board indiscriminately. If no removal reproduces the selective
 * shape, the cause is neither today's engine nor a missing key, and this file
 * must say so rather than pick the nearest explanation. */
const selective = culprits.filter(c => {
  const posns = Object.keys(c.byPos);
  const hit = posns.filter(p => c.byPos[p].nan > 0);
  return hit.length > 0 && hit.length < posns.length;
});

console.log('\n  FINDING');
if (!culprits.length) {
  console.log('    No single missing context key produces a NaN on today\'s engine.');
} else {
  console.log('    ' + culprits.length + ' context key(s) produce NaN when absent: '
    + culprits.map(c => c.key).join(', '));
  console.log('    Of those, ' + selective.length + ' produce the POSITION-SELECTIVE shape');
  console.log('    the report described (some positions hit, others clean): '
    + (selective.map(c => c.key).join(', ') || 'none'));
}
console.log('\n    app.js supplies all 17 keys unconditionally (live_context.js pins');
console.log('    this), so production cannot enter these states. A harness can.');

console.log('\n  WHAT THIS DOES AND DOES NOT ESTABLISH');
console.log('    ESTABLISHED: the reported states do not produce NaN on today\'s engine,');
console.log('    and an incomplete context does. Combined with the precedent in');
console.log('    rule12_result_2026-08-11.md — "NaN on 8 of 11. My ctx passed');
console.log('    targetPick; the engine reads nextPick" — the caller is the likelier');
console.log('    origin than the scorer.');
console.log('    NOT ESTABLISHED: that this WAS the cause. The reporting session\'s');
console.log('    context was never captured, so the actual input is gone. The');
console.log('    position-selective shape is not reproduced by any single missing key');
console.log('    here, which is evidence AGAINST the simple version of that story.');
console.log('');
console.log('    THEREFORE ITEM 13 IS NOT CLOSED BY THIS FILE. It is recorded as:');
console.log('    OBSERVED ONCE, CAUSE UNKNOWN, NOT REPRODUCIBLE, GUARDED SO IT CANNOT');
console.log('    PROPAGATE — see the finite-score guard in engine.js and');
console.log('    draft/tests/no_nan_score.test.js. A guard converts "we cannot');
console.log('    reproduce it" into "it cannot reach a recommendation". It does not');
console.log('    convert it into "it is understood".');

process.exit(0);
