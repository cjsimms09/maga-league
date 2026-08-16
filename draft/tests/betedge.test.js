// TERRITORY: A
// BET EDGE ADVISOR — pricing claims get fail arms, refusals get fail arms.
//
// The field under test is synthetic and stark on purpose: team 1 is measured
// dominant, team 10 measured weak, everyone else level. Every directional
// claim ("advantageous", complement sides, pool sums) has an arm that would
// fail if a sign flipped or a side got mixed up — the failure modes that
// would quietly cost real dollars on the bank page.
'use strict';
const assert = require('assert');
const path = require('path');
const BE = require(path.join(__dirname, '..', '..', 'src', 'betedge'));

let pass = 0;
const ck = (name, fn) => {
  try { fn(); pass++; console.log(`PASS  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
};

// Week 8 of the season: 7 games played, 7 left. Team 1 strong, 10 weak.
const rows = Array.from({ length: 10 }, (_, i) => {
  const id = i + 1;
  const mean = id === 1 ? 130 : id === 10 ? 92 : 111;
  return { owner_id: id, wins: id === 1 ? 6 : id === 10 ? 1 : 3, losses: id === 1 ? 1 : id === 10 ? 6 : 4, pf: mean * 7 };
});
const ctx = BE.contextFromRows(rows, 7, { weekNow: 8, sims: 4000, seed: 77 });
const nameOf = id => `T${id}`;

ck('context builds from rows; preseason rows stay null', () => {
  assert(ctx && ctx.model[1] && ctx.strengths[1], 'context missing pieces');
  const pre = Array.from({ length: 10 }, (_, i) => ({ owner_id: i + 1, wins: 0, losses: 0, pf: 0 }));
  assert.strictEqual(BE.contextFromRows(pre, 14), null, 'preseason must price nothing');
});

const mkBet = (over = {}) => ({
  format: 'prop', stake: 20, logic: 'all', for_id: 1, proposer_id: 1,
  parties: [{ owner_id: 1 }, { owner_id: 2 }], conditions: [], ...over,
});

ck('matchup bet: the strong side prices advantageous, weak side against, sides sum to 1', () => {
  const bet = mkBet({ conditions: [{ test: 'outscores', when: 'week', week: 9, subject_id: 1, target_id: 10 }] });
  const forSide = BE.priceBet(bet, 1, ctx, nameOf);
  const agSide = BE.priceBet(bet, 2, ctx, nameOf);
  assert(forSide.priceable && agSide.priceable);
  assert(forSide.p > 0.55, `strong side only ${forSide.p}`);
  assert.strictEqual(forSide.flag, 'advantageous');
  assert.strictEqual(agSide.flag, 'against');
  assert(Math.abs(forSide.p + agSide.p - 1) < 1e-9, 'sides must be complements');
  assert(forSide.ev > 0 && agSide.ev < 0, `EV signs wrong: ${forSide.ev} / ${agSide.ev}`);
});

ck('a level matchup prices fair, near zero EV', () => {
  const bet = mkBet({ parties: [{ owner_id: 3 }, { owner_id: 4 }], for_id: 3,
    conditions: [{ test: 'outscores', when: 'week', week: 9, subject_id: 3, target_id: 4 }] });
  const r = BE.priceBet(bet, 3, ctx, nameOf);
  assert.strictEqual(r.flag, 'fair');
  assert(Math.abs(r.ev) < 2, `level bet EV should hug zero, got ${r.ev}`);
});

ck('finishes-champion prices exactly what the bracket model says', () => {
  const bet = mkBet({ conditions: [{ test: 'finishes', when: 'season', subject_id: 1, target_place: 'champion' }] });
  const r = BE.priceBet(bet, 1, ctx, nameOf);
  assert(Math.abs(r.p - Math.round(ctx.model[1].champ_prob * 1000) / 1000) < 1e-9,
    `advisor ${r.p} vs model ${ctx.model[1].champ_prob} — two surfaces disagreeing on one bracket`);
});

ck('top2 / missed / last all price, and nest sanely for the dominant team', () => {
  const price = place => BE.priceBet(mkBet({ conditions: [{ test: 'finishes', when: 'season', subject_id: 1, target_place: place }] }), 1, ctx, nameOf).p;
  const champ = price('champion'), top2 = price('top2'), missed = price('missed'), last = price('last');
  assert(champ <= top2, 'champion must not exceed finalist');
  assert(missed < 0.3, `dominant team missing the playoffs priced at ${missed}`);
  assert(last < 0.05, `dominant team dead last priced at ${last}`);
});

ck('free-text bets refuse with a reason, never a guessed number', () => {
  const r = BE.priceBet(mkBet({ conditions: [], terms: 'loser wears the jorts to the draft' }), 1, ctx, nameOf);
  assert.strictEqual(r.priceable, false);
  assert(/free-text/.test(r.why), r.why);
});

ck('a condition on an already-played week refuses — grading owns the past', () => {
  const bet = mkBet({ conditions: [{ test: 'outscores', when: 'week', week: 3, subject_id: 1, target_id: 2 }] });
  const r = BE.priceBet(bet, 1, ctx, nameOf);
  assert.strictEqual(r.priceable, false);
  assert(r.lines.some(l => /already played/.test(l)), 'must say which fact is out of reach');
});

ck('ALL of two conditions prices no higher than either alone, and says independence', () => {
  const one = mkBet({ conditions: [{ test: 'outscores', when: 'week', week: 9, subject_id: 1, target_id: 2 }] });
  const two = mkBet({ conditions: [
    { test: 'outscores', when: 'week', week: 9, subject_id: 1, target_id: 2 },
    { test: 'finishes', when: 'season', subject_id: 1, target_place: 'playoffs' },
  ] });
  const p1 = BE.priceBet(one, 1, ctx, nameOf), p2 = BE.priceBet(two, 1, ctx, nameOf);
  assert(p2.p <= p1.p + 1e-9, `ALL added a condition and the price went UP: ${p1.p} -> ${p2.p}`);
  assert(p2.lines.some(l => /independence/.test(l)), 'multi-condition price must disclose the assumption');
});

ck('open-market bet: a non-party viewer prices the TAKE side (against the poster)', () => {
  const bet = mkBet({ status: 'open', open_slots: 1, parties: [{ owner_id: 1 }],
    conditions: [{ test: 'outscores', when: 'week', week: 9, subject_id: 1, target_id: 10 }] });
  const r = BE.priceBet(bet, 5, ctx, nameOf);
  assert(r.priceable);
  assert(r.p < 0.45, `taking the other side of a dominant claim should price against, got ${r.p}`);
  assert(r.lines.some(l => /against the claim/.test(l)));
});

ck('pool with picks: each side is its picks\' title odds, unpriced mass disclosed', () => {
  const bet = {
    format: 'pool', stake: 100, status: 'locked',
    parties: [
      { owner_id: 1, picks: [1, 2] },
      { owner_id: 2, picks: [3, 4] },
    ],
  };
  const r = BE.priceBet(bet, 1, ctx, nameOf);
  assert(r.priceable);
  const expect = ctx.model[1].champ_prob + ctx.model[2].champ_prob;
  assert(Math.abs(r.p - Math.round(expect * 1000) / 1000) < 1e-9, `pool side ${r.p} != sum of picks ${expect}`);
  assert(r.lines.some(l => /falls to the pool's later rules/.test(l)), 'undecided mass must be disclosed, not allocated');
  // No picks yet → not priced.
  const early = BE.priceBet({ format: 'pool', stake: 100, parties: [{ owner_id: 1, picks: [] }, { owner_id: 2, picks: [] }] }, 1, ctx, nameOf);
  assert.strictEqual(early.priceable, false);
});

ck('weekly-high probabilities behave: sum ≈ 1 across the league, dominant team leads', () => {
  const ps = rows.map(r => BE.pWeeklyHigh(ctx, r.owner_id));
  const sum = ps.reduce((a, b) => a + b, 0);
  assert(Math.abs(sum - 1) < 0.02, `weekly-high probs sum to ${sum}`);
  assert(ps[0] === Math.max(...ps), 'dominant team must lead the weekly-high book');
});

ck('wins_at_least: already-reached is certainty; unreachable prices near zero', () => {
  const done = mkBet({ conditions: [{ test: 'wins_at_least', when: 'season', subject_id: 1, target_number: 5 }] });
  assert.strictEqual(BE.priceBet(done, 1, ctx, nameOf).p, 1);
  const wild = mkBet({ conditions: [{ test: 'wins_at_least', when: 'season', subject_id: 10, target_number: 8 }] });
  assert(BE.priceBet(wild, 1, ctx, nameOf).p < 0.05, '1-6 team needing 7 straight should price tiny');
});

ck('deterministic: same rows, same seed, same prices', () => {
  const c2 = BE.contextFromRows(rows, 7, { weekNow: 8, sims: 4000, seed: 77 });
  const bet = mkBet({ conditions: [{ test: 'finishes', when: 'season', subject_id: 1, target_place: 'champion' }] });
  assert.deepStrictEqual(BE.priceBet(bet, 1, ctx, nameOf), BE.priceBet(bet, 1, c2, nameOf));
});

console.log(`\n${pass} checks passed${process.exitCode ? ' — WITH FAILURES ABOVE' : ''}`);
