// TERRITORY: A
/* WHAT THE BOARD CORY WILL ACTUALLY USE RECOMMENDS, DRIVEN END TO END.
 *
 * Cory, plainly: *"Your board still recommends TEs and QBs, and drafting off the
 * top recommendation still produces 3-4 tight ends in B's harness. Nothing I did
 * today changed that."*
 *
 * HE IS RIGHT, AND THE SECOND SENTENCE IS THE IMPORTANT ONE. Everything I built
 * today lives in draft/tools/ — draft_plan, bench_rule, bye_structure,
 * wire_vs_bench, dollar_objective. NONE OF IT IS IN THE SCORING PATH. The board
 * at the table is public/js/draft/engine.js, and it has not moved. A day of
 * analysis that never reaches the artifact being used is a day of analysis, not
 * a day of improvement, and a green scan across draft/tools/ says nothing about
 * the thing on the screen.
 *
 * ── WHY THIS IS A CHECKED-IN TOOL AND NOT A SHELL ONE-LINER ────────────────
 *
 * My first attempt at this measured the engine with a hand-built ctx and got
 * FOUR KICKERS AND FIVE DEFENCES with null scores from pick 68 on. That looked
 * like a catastrophic engine defect. IT WAS MY DRIVER. `applyRosterLegality`
 * reads `ctx.myPicksLeft` and I passed `roundsLeft`, so it defaulted to 99;
 * several other fields app.js supplies were absent entirely, and the engine's
 * own comments record that three of them were once missing in the app and every
 * roster-relative weight was evaluated against a guess.
 *
 * So the ctx here is built from app.js's `context()` field by field. Anything
 * this reports is about the engine, not about me holding it wrong -- and when it
 * is wrong, the fix belongs in one reviewable file rather than in a shell
 * history nobody can re-run.
 *
 * ── WHAT THIS IS NOT ───────────────────────────────────────────────────────
 *
 * The room is simulated as strict ADP order, which it will not be. This measures
 * the SHAPE the engine's own top recommendation produces against a neutral room,
 * not what will happen on the 22nd. B's harness drives the real surface and is
 * the authority on that; this exists so A can reproduce and fix without waiting
 * for a round trip.
 *
 * Run: node draft/tools/engine_drive.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

global.window = global;
global.document = { getElementById: () => null, querySelector: () => null, addEventListener: () => {} };

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const KEEP = require(path.join(ROOT, 'draft', 'tools', 'keepers_of.js'));

const keep = KEEP.keepersFrom(DATA);
const pool = DATA.players.filter(p => p.position && (p.proj_mean || 0) > 0);
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
const SCHED = [8, 13, 28, 33, 48, 53, 68, 73, 88, 93, 108, 113, 128, 133, 148];
const WHICH = (process.argv[2] || 'measured').toLowerCase();
const WEIGHTS = WHICH === 'default' ? E.DEFAULT_WEIGHTS : (E.MEASURED_WEIGHTS || E.DEFAULT_WEIGHTS);

/* Built from app.js context() field by field. The four that bit me are marked. */
function makeCtx(board, roster, i) {
  const pick = SCHED[i];
  return {
    board: board,
    roster: roster,
    nextPick: SCHED[i + 1] || null,
    currentPick: pick,                        // absent => survival asks the WRONG question
    pick: pick,
    round: Math.ceil(pick / (DATA.league.teams || 10)),
    myPicksLeft: SCHED.length - i,            // absent => defaults 99, legality NEVER fires
    myPickIndex: i,                           // absent => doctrine tilt reads a guess
    totalMyPicks: SCHED.length,
    totalPicks: 150,
    league: DATA.league,
    /* THE LIVE APP SHIPS MEASURED_WEIGHTS, NOT DEFAULT_WEIGHTS (app.js:52,
     * `E.MEASURED_WEIGHTS || E.DEFAULT_WEIGHTS`). Driving with DEFAULT was my
     * third driver error in this file: it sets need=1, and `need` is the ONLY
     * roster-aware term in the score. Measuring the engine with roster-awareness
     * switched on, when the shipped board has it switched off, describes a board
     * nobody uses. Selectable so both can be reported side by side. */
    weights: WEIGHTS,
    currentKeepers: roster.filter(p => p.is_keeper),
    ceilingAllStages: false,
    doctrine: null,
    drift: null,
    intervening: (SCHED[i + 1] || pick) - pick,
  };
}

console.log('DRIVING THE SHIPPED ENGINE — its own #1 at each of my 15 picks\n');
console.log('  weights: ' + WHICH.toUpperCase() + '  ' + JSON.stringify(WEIGHTS));
console.log('  (app.js:52 ships MEASURED. pass "default" as argv[2] for the other.)');
console.log('  room simulated as strict ADP order. keepers: '
  + keep.map(k => k.name + ' (' + k.position + ')').join(', ') + '\n');

const taken = new Set(keep.map(k => String(k.player_id)));
/* FULL PLAYER OBJECTS, NOT {name, position, player_id}. My first driver built
 * trimmed roster entries, and one roster entry without a numeric proj_mean makes
 * starterSlotMarginal produce NaN — which the engine correctly refuses, scoring
 * ALL 576 PLAYERS null. It reported this itself, in score_error.likely_cause, and
 * that diagnostic is the only reason this took minutes instead of the evening.
 * Checked: kept_players all carry proj_mean and app.js pushes board objects, so
 * the live app is NOT exposed to that path. It was mine. */
const roster = keep.map(k => Object.assign({}, k, { is_keeper: true }));

console.log('  pick  take                              score   #2 was');
console.log('  ' + '-'.repeat(74));
SCHED.forEach((pk, i) => {
  /* Drain the room to this pick: the next best ADP player who is still there. */
  let need = (pk - 1) - (taken.size - keep.length);
  for (let j = 0; j < byAdp.length && need > 0; j++) {
    const p = byAdp[j];
    if (taken.has(String(p.player_id))) continue;
    taken.add(String(p.player_id)); need--;
  }
  const board = pool.filter(p => !taken.has(String(p.player_id)));
  let out;
  try { out = E.recommend(makeCtx(board, roster, i)); }
  catch (e) { console.log('  ' + String(pk).padStart(4) + '  recommend THREW: ' + e.message); return; }
  const list = Array.isArray(out) ? out : (out && out.scored) || [];
  const top = list[0], second = list[1];
  if (!top || !top.player) { console.log('  ' + String(pk).padStart(4) + '  no recommendation'); return; }
  taken.add(String(top.player.player_id));
  roster.push(Object.assign({}, top.player));
  console.log('  ' + String(pk).padStart(4) + '  '
    + (top.player.position + ' ' + top.player.name).padEnd(30)
    + (top.score == null ? '  null' : Number(top.score).toFixed(1).padStart(6))
    + '   ' + (second && second.player ? second.player.position + ' ' + second.player.name : '—'));
});

const cnt = {};
roster.forEach(p => { cnt[p.position] = (cnt[p.position] || 0) + 1; });
console.log('\n  RESULTING ROSTER (3 keepers + 15 picks): ' + JSON.stringify(cnt));

/* THE COMPARISON THAT MATTERS: the engine against the tool that has been getting
 * all the attention, and against what this league actually drafts. */
const PLAN = require('./draft_plan.js');
const planCnt = {};
PLAN.keep.forEach(k => { planCnt[k.position] = (planCnt[k.position] || 0) + 1; });
PLAN.plan.forEach(x => { if (x.p) planCnt[x.p.position] = (planCnt[x.p.position] || 0) + 1; });
console.log('\n  THE THREE ANSWERS, SIDE BY SIDE (whole roster, keepers included)');
console.log('    pos    engine (what Cory sees)   draft_plan (my tool)   league 3yr avg');
console.log('    ' + '-'.repeat(74));
const LEAGUE = { QB: 1.60 + 0.0, RB: 4.73, WR: 5.23, TE: 1.40, K: 1.03, DEF: 0.97 };
/* league figures are DRAFTED-only; keepers add ~3 to the engine/plan columns, so
 * the comparison is stated rather than silently mismatched. */
['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].forEach(p => {
  console.log('    ' + p.padEnd(7) + String(cnt[p] || 0).padStart(12)
    + String(planCnt[p] || 0).padStart(22) + LEAGUE[p].toFixed(2).padStart(17));
});
console.log('    (league column is DRAFTED per team; the other two include 3 keepers,');
console.log('     so add ~2 RB and ~1 WR to the league column before comparing.)');

const bad = [];
if ((cnt.K || 0) > 1) bad.push((cnt.K) + ' kickers');
if ((cnt.DEF || 0) > 1) bad.push((cnt.DEF) + ' defences');
if ((cnt.TE || 0) > 2) bad.push((cnt.TE) + ' tight ends');
if ((cnt.QB || 0) > 2) bad.push((cnt.QB) + ' quarterbacks');
console.log('\n  ROSTERS THIS SHAPE ARE NOT DRAFTABLE: '
  + (bad.length ? bad.join(', ') : 'none — the shape is legal'));
