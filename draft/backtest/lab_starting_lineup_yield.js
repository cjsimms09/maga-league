#!/usr/bin/env node
// TERRITORY: A
/* STARTING-LINEUP YIELD — does the shipped board optimize the objective?
 *
 * THE OBJECTIVE IS EXPECTED STARTING-LINEUP POINTS, not roster points. Nothing
 * in this repository grades a completed draft against that quantity. The board
 * ranks candidates, the legality module counts empty slots, and the money layer
 * grades seasons — but the one number the draft exists to maximise is computed
 * NOWHERE. This lab computes it.
 *
 * ── WHY IT WAS WORTH BUILDING ──────────────────────────────────────────────
 *
 * `scorePlayer` has two branches, selected by `need.fills === 'bench'`, and the
 * bench branch carries ~120 lines of reasoning about who actually reaches a
 * starting lineup. Under MEASURED_WEIGHTS the two branches are ARITHMETICALLY
 * THE SAME EXPRESSION:
 *
 *     starter:  wValue*v + w.tier*tier + w.need*need + w.risk*risk
 *               + w.ceiling*ceiling + w.keeper*kov - w.bye*bye + w.stack*stack
 *     bench:    wValue*v + wCeil*benchCeiling + w.stack*stack + w.keeper*kov
 *               + max(0, w.need*need) - max(0, w.bye*bye) + wRisk*min(0,risk)
 *
 * with tier=need=risk=ceiling=bye=0 and BENCH_CEILING_FLOOR=BENCH_RISK_FLOOR=0,
 * BOTH reduce to `wValue*v + w.keeper*kov + w.stack*stack`. Measured, not
 * derived: of 174 players whose `need_fills` flips when QB and TE are filled,
 * 164 have a byte-identical score. The 10 that move are moved by the onesie
 * MULTIPLICATIVE discount, not by the branch (Prescott 4.6104 -> 0.4610, which
 * is exactly x0.10 = ONESIE_KEEP).
 *
 * That is not presented here as a defect. The floors were driven to zero
 * deliberately and bench_branch_anchor.test.js measures the branch refusing
 * junk without them. It is presented as the reason this lab exists: THE
 * QUANTITY THE BRANCH REASONS ABOUT WAS NEVER MEASURED END TO END.
 *
 * ── THE GAP THIS LAB IS AIMED AT ───────────────────────────────────────────
 *
 * Every roster-aware channel that reaches the shipped score is position-scoped:
 *
 *   onesieState / demoteFlaggedOnesies   QB, TE, K, DEF only
 *   applyRosterLegality                  endgame only (picksLeft <= gaps)
 *   stack, keeper                        not about positional fill
 *
 * `starterSlotMarginal` and the D3 flex discount ARE roster-aware for RB and WR
 * and both land on `need.value`, which is multiplied by zero. So for the two
 * positions that make up most of the roster and the whole flex, the board has
 * NO positional-fill channel into the score before the endgame. Whether that
 * costs starting-lineup points is an empirical question, and it is the question
 * below.
 *
 * ── WHAT IS MEASURED ───────────────────────────────────────────────────────
 *
 *   starting_points   greedy-optimal starting lineup from proj_mean, the
 *                     objective itself
 *   bench_picks       selections whose `need_fills` was already 'bench' when
 *                     the board recommended them — picks that add nothing to
 *                     the objective except injury insurance
 *   roster_points     total proj_mean, the quantity the board ACTUALLY ranks by
 *
 * roster_points is reported alongside on purpose: if an arm wins on roster
 * points and loses on starting points, that is the objective divergence stated
 * as a number instead of as an argument.
 *
 * ── THE ESTIMAND IS NARROWER THAN THE OBJECTIVE. SAY SO FIRST. ─────────────
 *
 * This computes STATIC PROJECTED starting-lineup points: the sum of proj_mean
 * over the optimal nine slots of the FINISHED roster. That is NOT expected
 * season points, and it is further still from probability of winning the
 * league. Three things it cannot see, and each one matters:
 *
 *   INJURIES. Every bench player scores exactly ZERO here. So this lab is
 *   STRUCTURALLY INCAPABLE of valuing insurance — which is most of what the
 *   `need` term prices. THE NULL ON `need` IS THEREFORE PART ARTEFACT: a metric
 *   that scores depth at zero will report that depth is worth nothing, and that
 *   is an arithmetic identity rather than a finding. Do not cite the null as
 *   evidence that bench value is small.
 *
 *   BYES. Season totals are summed; no weekly lineup is ever fielded. Two
 *   starters sharing a bye costs nothing in this metric and real points in a
 *   real season.
 *
 *   WAIVERS AND WEEKLY DECISIONS. A 10-team league with a stocked wire changes
 *   what a bench body is worth. Replacement availability is not modelled.
 *
 * ⚠️ DO NOT ASK THIS LAB WHETHER A SPARE QB OR TE EARNS ITS PICK. The whole
 * value of a spare onesie is injury insurance, which is exactly the term this
 * metric zeroes. It would return "worthless" by construction and the answer
 * would be a property of the instrument, not of the roster.
 *
 * WHAT IT IS GOOD FOR, precisely: comparing ALLOCATION between arms that face
 * an identical room and identical projections. "Given these projections and
 * this room, did the weights put the better players in the starting slots?" It
 * is a necessary condition, not a sufficient one — a board that loses here is
 * losing on something the objective definitely contains, but a board that ties
 * here has not been shown to be equally good.
 *
 * THE MISSING LINK to the real objective is a season-forward simulator
 * (allocation -> weekly lineups with injuries/byes/waivers -> weekly scores ->
 * record and weekly highs -> bracket -> money). roster_sim.py and the certified
 * money grader exist and exp_construction_objective.py already chains them.
 * That is the instrument that answers the strategic question; this one does not
 * and must not be quoted as if it did.
 *
 * ── LIMITS, STATED BEFORE THE NUMBERS ──────────────────────────────────────
 *
 * ONE ROOM, DETERMINISTIC, NOT A DISTRIBUTION. Opponents take the best
 * remaining ADP every time. Real rooms reach and slip, so this is a single
 * draw from a room model, not an expectation over rooms. n = 1.
 *
 * ONLY CORY'S KEEPERS ARE KNOWN. `keeper_slate.status` is not confirmed and the
 * other nine teams have not designated, so nine teams' keepers are absent from
 * the pool removal. Every arm sees the SAME distortion, so the A/B contrast
 * survives it; the absolute point totals do not.
 *
 * PROJECTIONS ARE THE BOARD'S OWN. Grading a board with the projections it
 * ranks by cannot detect a projection error — it measures ALLOCATION ONLY,
 * which is exactly the quantity in question and nothing more.
 *
 * A NULL IS A RESULT. If the arms tie, the shipped weights are not costing
 * starting-lineup points in this room, and that is reported as the finding.
 * Nothing here changes production. Per the standing rule, an inconclusive
 * measurement preserves current behaviour.
 *
 * Run: node draft/backtest/lab_starting_lineup_yield.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const KEEP = require(path.join(ROOT, 'draft', 'tools', 'keepers_of.js'));

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const LEAGUE = DATA.league;
const STARTERS = LEAGUE.starters || {};
const PICKS = (DATA.pick_order || {}).picks || [];
const MY_PICKS = (DATA.pick_order || {}).my_picks || [];
const KEEPERS = KEEP.keepersFrom(DATA);

const pool = DATA.players.filter(p => p.position && p.proj_mean != null && p.vorp != null);
const adpOf = p => (p.adjusted_adp != null ? Number(p.adjusted_adp)
  : (p.raw_adp != null ? Number(p.raw_adp) : 9999));

/* THE OBJECTIVE, COMPUTED. Greedy is EXACT for this lineup shape: the flex is
 * the only contested slot and it is filled last from whatever the dedicated
 * slots did not consume, so no earlier assignment can be improved by trading
 * with it. Stated rather than assumed, because greedy is NOT exact for a
 * lineup with two overlapping flexes and this one would silently become wrong
 * if the league ever added a superflex. */
const FLEX_POS = { FLEX: ['RB', 'WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  REC_FLEX: ['WR', 'TE'] };
function startingPoints(roster) {
  const byPos = {};
  roster.forEach(p => { (byPos[p.position] = byPos[p.position] || []).push(p); });
  Object.keys(byPos).forEach(k => byPos[k].sort((a, b) => b.proj_mean - a.proj_mean));
  const used = new Set();
  let pts = 0, filled = 0, slots = 0;
  // Dedicated slots first.
  Object.keys(STARTERS).forEach(slot => {
    if (FLEX_POS[slot]) return;
    for (let i = 0; i < (STARTERS[slot] || 0); i++) {
      slots += 1;
      const cand = (byPos[slot] || []).find(p => !used.has(p.player_id));
      if (cand) { used.add(cand.player_id); pts += cand.proj_mean; filled += 1; }
    }
  });
  // Then the flexes, from what is left.
  Object.keys(STARTERS).forEach(slot => {
    if (!FLEX_POS[slot]) return;
    for (let i = 0; i < (STARTERS[slot] || 0); i++) {
      slots += 1;
      const cand = roster.filter(p => FLEX_POS[slot].indexOf(p.position) >= 0
        && !used.has(p.player_id)).sort((a, b) => b.proj_mean - a.proj_mean)[0];
      if (cand) { used.add(cand.player_id); pts += cand.proj_mean; filled += 1; }
    }
  });
  return { points: pts, filled: filled, slots: slots };
}

const SUPERFLEX_GUARD = Object.keys(STARTERS).filter(s => FLEX_POS[s]).length;
if (SUPERFLEX_GUARD > 1) {
  console.error('REFUSING: ' + SUPERFLEX_GUARD + ' flex-type slots. Greedy assignment '
    + 'is not exact with overlapping flexes and this lab would report a number it '
    + 'cannot justify. Replace startingPoints() with an assignment solver first.');
  process.exit(1);
}

/* ONE ARM. The room takes best-ADP-available at every board slot that is not
 * Cory's and not a keeper slot; Cory takes the composite's top recommendation. */
function runArm(weights) {
  const mine = new Set(MY_PICKS.map(Number));
  const gone = new Set(KEEPERS.map(p => String(p.player_id)));
  const myRoster = KEEPERS.slice();
  const log = [];
  const remainingMine = MY_PICKS.map(Number).slice().sort((a, b) => a - b);

  PICKS.slice().sort((a, b) => a.overall - b.overall).forEach(row => {
    const overall = Number(row.overall);
    const avail = pool.filter(p => !gone.has(String(p.player_id)));
    if (!avail.length) return;
    if (row.keeper_slot) return;              // already consumed by a keeper
    if (!mine.has(overall)) {
      const take = avail.slice().sort((a, b) => adpOf(a) - adpOf(b))[0];
      gone.add(String(take.player_id));
      return;
    }
    const idx = remainingMine.indexOf(overall);
    const left = remainingMine.length - idx;
    const next = remainingMine[idx + 1] || null;
    const scored = E.recommend({
      board: avail, roster: myRoster, league: LEAGUE,
      currentPick: overall, nextPick: next, totalPicks: PICKS.length,
      myPicksLeft: left, roundsLeft: left,
      runMultipliers: {}, intervening: [], weights: weights,
    }).filter(x => E.scoreable(x));
    if (!scored.length) return;
    const top = scored[0];
    gone.add(String(top.player.player_id));
    myRoster.push(top.player);
    log.push({ overall: overall, name: top.player.name, pos: top.player.position,
      fills: (top.components || {}).need_fills, score: top.score,
      proj: top.player.proj_mean });
  });

  const sl = startingPoints(myRoster);
  return {
    log: log,
    starting_points: sl.points,
    starters_filled: sl.filled + '/' + sl.slots,
    roster_points: myRoster.reduce((n, p) => n + (p.proj_mean || 0), 0),
    bench_picks: log.filter(r => r.fills === 'bench').length,
    flex_picks: log.filter(r => r.fills === 'flex').length,
    starter_picks: log.filter(r => r.fills === 'starter').length,
    roster: myRoster.map(p => p.position + ' ' + p.name).join(', '),
  };
}

const ARMS = {
  SHIPPED: E.MEASURED_WEIGHTS,
  NEED_1: Object.assign({}, E.MEASURED_WEIGHTS, { need: 1.0 }),
  DEFAULT: E.DEFAULT_WEIGHTS,
};

console.log('STARTING-LINEUP YIELD');
console.log('league: ' + LEAGUE.teams + ' teams, starters '
  + Object.keys(STARTERS).map(k => k + STARTERS[k]).join(' '));
console.log('Cory keeps: ' + KEEPERS.map(p => p.position + ' ' + p.name).join(', '));
console.log('Cory picks at board slots: ' + MY_PICKS.join(', '));
console.log('');

const out = {};
Object.keys(ARMS).forEach(name => { out[name] = runArm(ARMS[name]); });


const W = 22;
const row = (label, get) => console.log('  ' + label.padEnd(W)
  + Object.keys(ARMS).map(n => String(get(out[n])).padStart(14)).join(''));
console.log('  ' + ''.padEnd(W) + Object.keys(ARMS).map(n => n.padStart(14)).join(''));
row('STARTING points', a => a.starting_points.toFixed(1));
row('  starters filled', a => a.starters_filled);
row('roster points', a => a.roster_points.toFixed(1));
row('picks: starter', a => a.starter_picks);
row('picks: flex', a => a.flex_picks);
row('picks: BENCH', a => a.bench_picks);
console.log('');

Object.keys(ARMS).forEach(n => {
  console.log(n + ' selections:');
  out[n].log.forEach(r => console.log('  ' + String(r.overall).padStart(4) + '  '
    + (r.pos + ' ' + r.name).padEnd(30) + (r.fills || '?').padEnd(9)
    + 'proj ' + Number(r.proj).toFixed(1)));
  console.log('');
});

/* THE CONTRAST, STATED AS A NUMBER RATHER THAN AS A CONCLUSION. */
const d = out.NEED_1.starting_points - out.SHIPPED.starting_points;
const dr = out.NEED_1.roster_points - out.SHIPPED.roster_points;
console.log('NEED_1 - SHIPPED   starting points ' + (d >= 0 ? '+' : '') + d.toFixed(1)
  + '   roster points ' + (dr >= 0 ? '+' : '') + dr.toFixed(1));
console.log('');
console.log('n = 1 room, deterministic ADP opponents, nine teams\' keepers unknown.');
console.log('This is ONE DRAW, not an expectation. It cannot on its own justify a');
console.log('weight change, and no production constant is touched by this file.');

if (process.env.LAB_JSON) {
  fs.writeFileSync(process.env.LAB_JSON, JSON.stringify(out, null, 2));
  console.log('wrote ' + process.env.LAB_JSON);
}
