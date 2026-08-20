/* WHAT ACTUALLY MOVES CORY'S BOARD — every in-house component, measured.
 *
 * Cory, 2026-08-20, after ruling own_v6 out of the blend:
 *   "I want to make sure the rest of the model that I will actually draft from
 *    is sound... Our tried and failed models should probably not be involved
 *    including our failed projections."
 *
 * A switch being ON is not evidence it does anything, and a component being
 * OURS is not evidence it is bad. This runs every term through the real
 * `recommend()` path at his twelve real picks and reports, per component, HOW
 * OFTEN IT IS NON-ZERO and HOW BIG IT GETS. A term that never fires cannot hurt
 * him whatever its provenance; a term that fires on every row is deciding his
 * draft whether or not anyone graded it.
 *
 * ── WHY THIS EXISTS AS A TOOL AND NOT A PARAGRAPH ─────────────────────────
 *
 * Because the paragraph was wrong. `DOCTRINE_TILT_ON` reads `true` with a tilt
 * of 2.5 and two of its five suites red, which reads like a failed model
 * steering the board. Measured: it contributes EXACTLY ZERO on 120 of 120
 * top-ten rows. The switch is on and the term is inert, and no amount of
 * reading the config would have told anyone that.
 *
 * The opposite error is available too: `need` was described for weeks as
 * "inert by mask redundancy" while carrying the only VORP in the score.
 *
 * Run: node draft/tools/what_actually_moves_my_board.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
const E = require(path.join(ROOT, 'public/js/draft/engine.js'));
const { realRoster } = require(path.join(ROOT, 'draft/tests/_empty_roster_fiction_precondition.js'));
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/draft_data.json'), 'utf8'));
const L = D.league;
const MY = ((D.pick_order || {}).my_picks) || [];
const rows = ((D.pick_order || {}).picks) || [];
const adp = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const pool = D.players.filter(p => p.position && p.proj_mean != null);
const byAdp = pool.slice().sort((a, b) => adp(a) - adp(b));
const liveBefore = pk => rows.filter(r => r.overall < pk && !r.keeper_slot).length;

const TERMS = ['value', 'need', 'ceiling', 'keeper', 'stack', 'tier', 'risk', 'bye',
  'onesie', 'doctrine'];
const stat = {};
TERMS.forEach(t => { stat[t] = { nz: 0, n: 0, max: 0, sum: 0 }; });

/* ⚠️ THE ROSTER MUST GROW, AND MY FIRST VERSION HELD IT STATIC — which made
 * `stack` read 0/120 and I nearly reported it as inert. `stack` needs a
 * ROSTERED QUARTERBACK to fire, and Cory's three keepers are WR/RB/RB, so a
 * keeper-only roster makes the term structurally incapable of firing at any
 * pick. That is the empty-roster fiction wearing different clothes: a harness
 * that forbids the thing it is measuring.
 *
 * With the roster filling as the model picks, `stack` fires twice (max 6.0) —
 * both times after a quarterback is on the roster. Rare, but not zero, and the
 * difference between those two words is the whole point of this file. */
let liveRoster = realRoster();

MY.forEach((cur, i) => {
  const nxt = MY[i + 1] || cur + 15;
  const taken = new Set(byAdp.slice(0, liveBefore(cur)).map(p => String(p.player_id)));
  liveRoster.forEach(k => taken.add(String(k.player_id)));
  const board = byAdp.filter(p => !taken.has(String(p.player_id)));
  const recs = E.recommend({ board: board, roster: liveRoster, league: L,
    currentPick: cur, nextPick: nxt, totalPicks: 150, myPicksLeft: MY.length - i,
    myPickIndex: i, totalMyPicks: MY.length, roundsLeft: MY.length - i,
    runMultipliers: {}, pickBoard: rows, currentKeepers: realRoster(),
    intervening: rows.filter(r => r.overall >= cur && r.overall < nxt
      && r.slot !== L.my_draft_slot)
      .map(r => ({ team_slot: r.slot, pick_no: r.overall, roster: [], profile: null, room: [] })),
    weights: E.MEASURED_WEIGHTS }) || [];
  if (recs[0]) liveRoster = liveRoster.concat([recs[0].player]);
  recs.slice(0, 10).forEach(x => {
    const w = (x.components || {}).weighted || {};
    TERMS.forEach(t => {
      const v = Number(w[t] || 0);
      const s = stat[t];
      s.n++;
      if (Math.abs(v) > 1e-9) { s.nz++; s.sum += Math.abs(v); }
      s.max = Math.max(s.max, Math.abs(v));
    });
  });
});

const W = E.MEASURED_WEIGHTS;
console.log('\n  WHAT ACTUALLY MOVES YOUR BOARD — top ten at each of your twelve picks\n');
console.log('  term       weight   fires on        mean |value|   max      verdict');
TERMS.sort((a, b) => stat[b].nz - stat[a].nz).forEach(t => {
  const s = stat[t];
  const rate = s.n ? s.nz / s.n : 0;
  const mean = s.nz ? s.sum / s.nz : 0;
  const wt = (t in W) ? String(W[t]) : 'post';
  const verdict = s.nz === 0 ? 'INERT — cannot affect a pick'
    : rate > 0.9 ? 'decides picks'
      : rate > 0.2 ? 'fires sometimes'
        : 'rare (' + s.nz + ' rows)';
  console.log('  ' + t.padEnd(11) + wt.padEnd(9)
    + (s.nz + '/' + s.n).padEnd(16)
    + mean.toFixed(2).padEnd(15) + s.max.toFixed(2).padEnd(9) + verdict);
});

/* THE PROJECTION INPUTS, NAMED. Every term above is computed FROM these, so a
 * bad source contaminates terms that are themselves fine. */
console.log('\n  AND WHAT THE NUMBERS ARE BUILT FROM (draftable scope only)\n');
const scope = (L.draftable_scope || {}).focus || 200;
const top = byAdp.slice(0, scope);
['proj_mean_source', 'proj_ceiling_source', 'proj_sd_source', 'adp_source'].forEach(f => {
  const c = {};
  top.forEach(p => { const v = String(p[f] == null ? 'absent' : p[f]); c[v] = (c[v] || 0) + 1; });
  console.log('  ' + f);
  Object.keys(c).sort((a, b) => c[b] - c[a]).slice(0, 4)
    .forEach(v => console.log('      ' + String(v).slice(0, 56).padEnd(58) + c[v]));
});
console.log('\n  A switch being ON is not evidence it does anything, and a component');
console.log('  being OURS is not evidence it is bad. Both are measured here.\n');
