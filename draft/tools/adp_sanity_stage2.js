/* STAGE 2 — TRACE THE DIVERGENCE. Seven mechanical questions per pick; the
 * eighth (was the decisive term CONCEPTUALLY VALID?) is written by hand in the
 * report, because it is a semantic judgement and not something a tool can emit.
 *
 * Cory: "CORRECT ARITHMETIC DOES NOT ESTABLISH CORRECT SEMANTICS. The hierarchy
 * is OBSERVED BEHAVIOUR -> DIVERGENCE -> CAUSAL MECHANISM -> SEMANTIC VALIDITY."
 *
 * ── THE RECONCILIATION GUARD, AND WHY IT IS THE FIRST THING PRINTED ─────────
 *
 * `components.weighted` is what every explanation surface and the decision
 * contract read to name a decisive term. On BENCH picks it does not sum to the
 * score — the bench branch scores on `Math.max(BENCH_CEILING_FLOOR, w.ceiling)`
 * times a separately-recomputed ceiling, while `weighted` reports
 * `w.ceiling * ceiling` with w.ceiling = 0. So on exactly the picks this
 * investigation is about, the published components can be 25 points away from
 * the number that decided the pick.
 *
 * Naming a "decisive term" out of those components without checking the residual
 * would be the Stage 2 version of the mistake Stage 1 was frozen to avoid: a
 * confident causal story about arithmetic that does not add up. So every trace
 * prints the residual, and a large residual is itself the finding.
 *
 * Run: node draft/tools/adp_sanity_stage2.js
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
['survival', 'composite', 'engine', 'needrule'].forEach(m =>
  require(path.join(ROOT, 'public', 'js', 'draft', m + '.js')));
const LC = require(path.join(ROOT, 'draft', 'tools', 'live_context.js'));
const E = global.DraftEngine;

const BOARD = LC.loadBoard();
const ALL = BOARD.players;
const KEEPERS = BOARD.kept_players;
const MY = (BOARD.pick_order.my_picks || []).slice();
const adpOf = p => (p.adp == null ? 9999 : Number(p.adp));
const bestByAdp = pool => pool.reduce((b, p) => (!b || adpOf(p) < adpOf(b)) ? p : b, null);

const drafted = new Set();
KEEPERS.forEach(k => drafted.add(String(k.player_id)));
const roster = KEEPERS.map(k => Object.assign({}, k, { is_keeper: true }));

const fmt = v => (v >= 0 ? '+' : '') + Number(v).toFixed(2);

for (let i = 0; i < MY.length; i++) {
  const pick = MY[i], next = MY[i + 1] || pick;
  let pool = ALL.filter(p => !drafted.has(String(p.player_id)));
  const gap = i === 0 ? pick - 1 : pick - MY[i - 1] - 1;
  for (let k = 0; k < gap; k++) {
    const o = bestByAdp(pool);
    if (!o) break;
    drafted.add(String(o.player_id));
    pool = pool.filter(x => x !== o);
  }
  const recs = E.recommend(LC.liveContext({
    currentPick: pick, nextPick: next, board: pool, roster,
    myPicksLeft: MY.length - i, myPickIndex: i,
  }));
  const win = recs[0], up = recs[1];
  const p = win.player;
  const market = bestByAdp(pool);
  const reach = adpOf(p) - pick;

  console.log('\n' + '='.repeat(78));
  console.log('PICK ' + pick + '   reach ' + fmt(reach)
    + (market ? '   (market would take ' + market.name + ' ' + market.position
      + ', adp ' + adpOf(market) + ')' : ''));
  console.log('  1 MODEL CHOSE     ' + p.name + ' (' + p.position + ', adp ' + adpOf(p)
    + ')  score ' + Number(win.score).toFixed(2));
  console.log('  2 REFERENCE WOULD ' + (market ? market.name + ' (' + market.position + ')' : '-'));
  console.log('  3 REACH           ' + fmt(reach) + ' picks earlier than market prices him');
  console.log('  4 COMPETING       ' + recs.slice(0, 5).map(r =>
    r.player.name + ' ' + r.player.position + ' ' + Number(r.score).toFixed(1)).join('  |  '));

  // 5/7 — term deltas between winner and runner-up, plus the RESIDUAL.
  const wc = (win.components || {}).weighted || {};
  const uc = (up.components || {}).weighted || {};
  const terms = Object.keys(wc);
  const sumW = terms.reduce((s, t) => s + (Number(wc[t]) || 0), 0);
  const sumU = terms.reduce((s, t) => s + (Number(uc[t]) || 0), 0);
  const residW = Number(win.score) - sumW, residU = Number(up.score) - sumU;
  const scoreGap = Number(win.score) - Number(up.score);

  const deltas = terms.map(t => ({ t, d: (Number(wc[t]) || 0) - (Number(uc[t]) || 0) }))
    .filter(x => Math.abs(x.d) > 1e-9).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const residDelta = residW - residU;

  console.log('  5 TERM DELTAS     ' + (deltas.length
    ? deltas.map(x => x.t + ' ' + fmt(x.d)).join('  ') : '(every published term identical)'));
  console.log('  6 RUNNER-UP       ' + up.player.name + ' (' + up.player.position
    + ', adp ' + adpOf(up.player) + ')  score ' + Number(up.score).toFixed(2));
  console.log('  7 GAP TO BEAT     ' + fmt(scoreGap));
  console.log('    RECONCILIATION  published terms sum to ' + sumW.toFixed(2)
    + ', score is ' + Number(win.score).toFixed(2) + '  -> RESIDUAL ' + fmt(residW));
  console.log('                    runner-up residual ' + fmt(residU)
    + '  -> UNEXPLAINED SHARE OF THE GAP ' + fmt(residDelta)
    + (Math.abs(scoreGap) > 1e-9
      ? ' (' + (100 * residDelta / scoreGap).toFixed(0) + '% of the gap)' : ''));
  if (Math.abs(residDelta) > Math.abs(scoreGap) * 0.5) {
    console.log('    *** THE PUBLISHED TERMS DO NOT EXPLAIN THIS PICK. Any "decisive term"'
      + '\n        named from them is a story about arithmetic that does not add up.');
  }
  console.log('    need.fills = ' + ((win.components || {}).need_fills || '?')
    + '   (bench => the floored-ceiling branch scored this pick)');

  drafted.add(String(p.player_id));
  roster.push(p);
}
