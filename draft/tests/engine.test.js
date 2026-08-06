/* Acceptance tests for the client engine (Modules 5-7).
 * Run: node draft/tests/engine.test.js
 */
const E = require('../../public/js/draft/engine.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}
const approx = (a, b, eps = 0.01) => Math.abs(a - b) < eps;

// --- normal CDF sanity (the whole survival model rests on this) ---
check('normalCdf(mu) = 0.5', approx(E.normalCdf(50, 50, 10), 0.5));
check('normalCdf +1sd = 0.841', approx(E.normalCdf(60, 50, 10), 0.8413, 0.001));
check('normalCdf -2sd = 0.023', approx(E.normalCdf(30, 50, 10), 0.0228, 0.001));

// --- Module 5: survival ---
const guy = { player_id: 'x', position: 'RB', adjusted_adp: 40, proj_mean: 200 };
const probs = [];
for (let pick = 1; pick <= 120; pick += 5) probs.push(E.survival(guy, pick));
check('survival declines monotonically with pick number',
  probs.every((p, i) => i === 0 || p <= probs[i - 1] + 1e-9));
check('survival ~1 well before ADP', probs[0] > 0.95);
check('survival ~0 well after ADP', probs[probs.length - 1] < 0.05);
check('survival at ADP is ~50%', approx(E.survival(guy, 40), 0.5, 0.02));

check('adpSd floors at 3', approx(E.adpSd(5), 3.0));
check('adpSd grows with ADP', approx(E.adpSd(100), 22.0));

// run multiplier shortens survival
const hot = E.survival(guy, 60, { RB: 1.8 });
const cold = E.survival(guy, 60, { RB: 0.6 });
check('a positional run makes a player less likely to survive', hot < E.survival(guy, 60));
check('a cold position makes a player more likely to survive', cold > E.survival(guy, 60));
check('run-adjusted survival stays within [0,1]', hot >= 0 && hot <= 1 && cold >= 0 && cold <= 1);

// --- run detection ---
const board = [];
let id = 0;
['RB', 'WR', 'TE', 'QB'].forEach(pos => {
  for (let i = 0; i < 25; i++) {
    board.push({ player_id: 'p' + (++id), position: pos, name: pos + i,
      adjusted_adp: 5 + i * 4 + (pos === 'RB' ? 0 : 2), proj_mean: 250 - i * 6, tier: 1 + Math.floor(i / 5),
      tier_drop: 12, proj_ceiling: 300 - i * 6, vorp: 100 - i * 6 });
  }
});
const rbRun = [];
for (let i = 0; i < 8; i++) rbRun.push({ position: 'RB' });
for (let i = 0; i < 2; i++) rbRun.push({ position: 'WR' });
const mults = E.runMultipliers(rbRun, board, 40);
check('RB run produces an elevated multiplier', (mults.RB || 1) > 1.1, JSON.stringify(mults));
check('multipliers stay clamped', Object.values(mults).every(m => m >= 0.6 && m <= 1.8));

// --- Module 6: VONA, incl. the tier-boundary acceptance test ---
// The tier-mates must be genuinely in doubt at my next pick, otherwise "5 left"
// and "0 left" are the same board (everyone is gone either way) and the test
// proves nothing. Mates sit right around the next pick so survival is ~coin-flip.
const NEXT_PICK = 45;
function tierPool(mates) {
  const pool = [{ player_id: 'target', position: 'RB', name: 'Target', proj_mean: 200,
    adjusted_adp: 30, tier: 2, tier_drop: 40, vorp: 80, proj_ceiling: 240 }];
  for (let i = 0; i < mates; i++) {
    pool.push({ player_id: 'mate' + i, position: 'RB', name: 'Mate' + i, proj_mean: 198 - i,
      adjusted_adp: 44 + i * 2, tier: 2, tier_drop: 40, vorp: 78, proj_ceiling: 238 });
  }
  // The tier below: a real cliff, and reliably still there later.
  for (let i = 0; i < 6; i++) {
    pool.push({ player_id: 'lower' + i, position: 'RB', name: 'Lower' + i, proj_mean: 160 - i * 2,
      adjusted_adp: 70 + i * 4, tier: 3, tier_drop: 10, vorp: 40, proj_ceiling: 190 });
  }
  return pool;
}
const lastInTier = tierPool(0);
const deepTier = tierPool(5);
const vonaAlone = E.vona(lastInTier[0], lastInTier, NEXT_PICK);
const vonaDeep = E.vona(deepTier[0], deepTier, NEXT_PICK);
check('VONA is higher for the last player in a tier than with 5 tier-mates left',
  vonaAlone > vonaDeep, `alone=${vonaAlone.toFixed(1)} deep=${vonaDeep.toFixed(1)}`);
check('VONA is measurably higher (not noise)', vonaAlone - vonaDeep > 5,
  `difference ${(vonaAlone - vonaDeep).toFixed(1)}`);

// expected-best-available must sit between the best and worst candidate
const eba = E.expectedBestAvailable(deepTier.slice(1), NEXT_PICK);
const means = deepTier.slice(1).map(p => p.proj_mean);
check('E[best available] lies within the candidate range',
  eba <= Math.max(...means) + 0.01 && eba >= Math.min(...means) - 0.01, `eba=${eba.toFixed(1)}`);

// --- Module 7: composite ---
const ctx = {
  board: deepTier,
  nextPick: NEXT_PICK,
  currentPick: 30,
  totalPicks: 180,
  myPicksLeft: 12,
  roster: [],
  league: { starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1 } },
  weights: E.DEFAULT_WEIGHTS,
};
const scored = E.recommend(ctx);
check('recommend returns every player scored', scored.length === deepTier.length);
check('recommendations are sorted best-first',
  scored.every((s, i) => i === 0 || s.score <= scored[i - 1].score + 1e-9));
check('every recommendation carries an audit trail', scored.every(s => s.reasons.length > 0));
check('components are exposed for auditing',
  scored[0].components && typeof scored[0].components.vona === 'number');

// empty slot beats bench depth
const withRbs = Object.assign({}, ctx, {
  roster: [{ position: 'RB', proj_mean: 210 }, { position: 'RB', proj_mean: 205 }, { position: 'RB', proj_mean: 201 }],
});
const needEmpty = E.starterSlotMarginal(deepTier[0], [], ctx.league).value;
const needFull = E.starterSlotMarginal(deepTier[0], withRbs.roster, ctx.league).value;
check('an empty starting slot is worth more than bench depth', needEmpty > needFull,
  `empty=${needEmpty.toFixed(1)} full=${needFull.toFixed(1)}`);

// risk penalties fire
const oldRb = { position: 'RB', age: 30, proj_mean: 180, proj_ceiling: 200, injury_status: 'Questionable', depth_chart_order: 2 };
const risk = E.riskAdjustment(oldRb);
check('risk penalises age cliff + injury + depth chart', risk.value < -20, `risk=${risk.value}`);
check('risk explains itself', risk.reasons.length >= 3);

// upside weighting grows late
const early = E.upsideBonus({ proj_mean: 100, proj_ceiling: 140 }, 10, 180, 14);
const late = E.upsideBonus({ proj_mean: 100, proj_ceiling: 140 }, 170, 180, 3);
check('upside matters more in the endgame', late > early * 1.5, `early=${early.toFixed(1)} late=${late.toFixed(1)}`);

// weights actually move the answer
const heavyCeiling = E.recommend(Object.assign({}, ctx, { weights: { tier: 0, need: 0, risk: 0, ceiling: 5 } }));
check('weight sliders change the ranking', heavyCeiling[0].score !== scored[0].score);


// --- KOV scarcity (audit P1.3) ----------------------------------------------
// KOV was an absolute per-player number in a world with three keeper slots, so
// every late-round young ascender earned the bonus independently.

(function kovTests() {
  const C = require('../../public/js/draft/composite.js');

  function mkPlayer(id, vorp, age, pos) {
    return { player_id: id, name: 'P' + id, position: pos || 'RB', vorp, age: age || 23,
             adjusted_adp: 120, raw_adp: 120 };
  }
  function mkCtx(roster, board) {
    return {
      currentPick: 130, roster: roster || [],
      board: board || [mkPlayer('bench', 5, 28)],
      league: { teams: 10, keeper_rules: { count: 3, cost_model: 'original_round' } },
    };
  }

  {
    const p = mkPlayer('a', 60, 23);
    const out = C.keeperOptionValue(p, mkCtx([]));
    check('KOV: with no candidates rostered, marginal equals raw',
      approx(out.value, out.raw_value, 1e-9) && out.slots_free === 3,
      `value=${out.value} raw=${out.raw_value} free=${out.slots_free}`);
  }

  {
    const strong = [mkPlayer('i1', 80, 22), mkPlayer('i2', 78, 22), mkPlayer('i3', 76, 22)];
    const fourth = mkPlayer('d', 60, 23);
    const ctx = mkCtx(strong);
    const raw = C.keeperOptionValueRaw(fourth, ctx).value;
    const marginal = C.keeperOptionValue(fourth, ctx).value;
    check('KOV: the 4th keeper candidate is worth nothing',
      raw > 0 && marginal === 0, `raw=${raw} marginal=${marginal}`);
  }

  {
    const held = [mkPlayer('i1', 80, 22), mkPlayer('i2', 40, 22), mkPlayer('i3', 30, 22)];
    const better = mkPlayer('d', 70, 22);
    const ctx = mkCtx(held);
    const bar = C.keeperOptionValueRaw(held[2], ctx).value;
    const out = C.keeperOptionValue(better, ctx);
    check('KOV: a candidate above the bar keeps only the surplus',
      approx(out.value, out.raw_value - bar, 1e-9) && out.value > 0 && out.value < out.raw_value,
      `value=${out.value} raw=${out.raw_value} bar=${bar}`);
  }

  {
    const cand = mkPlayer('d', 60, 23);
    const none = C.keeperOptionValue(cand, mkCtx([])).value;
    const two = C.keeperOptionValue(cand, mkCtx([mkPlayer('i1', 80, 22), mkPlayer('i2', 78, 22)])).value;
    const three = C.keeperOptionValue(cand, mkCtx(
      [mkPlayer('i1', 80, 22), mkPlayer('i2', 78, 22), mkPlayer('i3', 70, 22)])).value;
    check('KOV: the bar rises as keeper slots fill',
      none >= two && two >= three, `${none}, ${two}, ${three}`);
  }

  {
    const cand = mkPlayer('d', 60, 23);
    const ctx = mkCtx([]);
    ctx.currentKeepers = [mkPlayer('k1', 85, 22), mkPlayer('k2', 84, 22), mkPlayer('k3', 83, 22)];
    check('KOV: keepers carried into the draft count against the slots',
      C.keeperOptionValue(cand, ctx).value === 0);
  }

  // Endogeneity: under original_round cost, the round you take him in IS his
  // keeper price, so the same player must not price identically everywhere.
  {
    const p = mkPlayer('a', 60, 23);
    const board = [mkPlayer('x', 40, 27), mkPlayer('y', 20, 27), mkPlayer('z', 8, 29)];
    board[0].adjusted_adp = 80; board[1].adjusted_adp = 130; board[2].adjusted_adp = 200;
    const at8 = C.keeperOptionValueRaw(p, Object.assign(mkCtx([], board), { currentPick: 71 }));
    const at13 = C.keeperOptionValueRaw(p, Object.assign(mkCtx([], board), { currentPick: 121 }));
    check('KOV: same player prices differently at round 8 vs 13 (endogeneity)',
      at8.round === 8 && at13.round === 13 && at8.value !== at13.value,
      `r8=${at8.round}/${at8.value} r13=${at13.round}/${at13.value}`);
  }
})();

console.log(`\n${pass}/${pass + fail} engine checks passed`);
process.exit(fail ? 1 : 0);
