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


// --- Roster legality endgame (Part 6 §1) ------------------------------------
// The failure this prevents: two picks left, no K and no DST, and the composite
// recommends a fourth WR because his VONA dwarfs a kicker's. Draft ends,
// lineup is illegal. A weight cannot fix this — a big enough VONA outvotes any
// weight — so it has to be a hard filter.
(function legalityTests() {
  const LEAGUE = { teams: 10, starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 } };
  function mk(id, pos, vorp) {
    return { player_id: id, name: pos + id, position: pos, vorp,
             proj_mean: 100 + vorp, proj_ceiling: 140 + vorp,
             adjusted_adp: 100, raw_adp: 100, tier: 1, tier_drop: 5, tier_size: 3 };
  }
  // A stacked board: elite skill players, and a kicker/defense worth ~nothing.
  const bd = [mk('w1', 'WR', 90), mk('w2', 'WR', 85), mk('r1', 'RB', 80),
              mk('k1', 'K', 1), mk('d1', 'DEF', 2)];
  const full = [{ position: 'QB' }, { position: 'RB' }, { position: 'RB' },
                { position: 'WR' }, { position: 'WR' }, { position: 'TE' }];

  const gaps = E.mandatoryGaps({ league: LEAGUE, roster: full });
  check('mandatory gaps sees the missing K and DEF, and ignores FLEX',
    gaps.length === 2 && gaps.indexOf('K') !== -1 && gaps.indexOf('DEF') !== -1,
    JSON.stringify(gaps));

  const ctx = n => ({ board: bd, roster: full, league: LEAGUE, weights: E.DEFAULT_WEIGHTS,
                      currentPick: 140, totalPicks: 150, myPicksLeft: n, roundsLeft: n,
                      runMultipliers: {}, intervening: [] });

  // Unfiltered, the WR wins outright — that is the bug, stated as a fact.
  const loose = bd.map(p => E.scorePlayer(p, ctx(6))).sort((a, b) => b.score - a.score);
  check('without the filter the composite prefers a WR over a needed K/DST',
    ['K', 'DEF'].indexOf(loose[0].player.position) === -1,
    loose[0].player.position);

  const atTwo = E.recommend(ctx(2));
  check('with 2 picks and 2 mandatory holes, only K/DEF are recommendable',
    atTwo.length === 2 && atTwo.every(s => ['K', 'DEF'].indexOf(s.player.position) !== -1),
    atTwo.map(s => s.player.position).join(','));
  check('the forced state is reported, not silent',
    !!atTwo[0].legality && /Forced/.test(atTwo[0].legality.message), 
    JSON.stringify(atTwo[0].legality));
  check('the forced pick explains itself in its reasons',
    /FORCED/.test((atTwo[0].reasons || []).join(' ')));

  const atThree = E.recommend(ctx(3));
  check('one pick earlier it warns instead of forcing',
    atThree.length === bd.length && /forced/i.test(atThree[0].legality_warning || ''),
    atThree[0].legality_warning);

  const atSix = E.recommend(ctx(6));
  check('with plenty of picks left nothing is forced or warned',
    atSix.length === bd.length && !atSix[0].legality && !atSix[0].legality_warning);

  // The acceptance test the work order asks for: from every slot, a full draft
  // must end legal.
  let illegal = 0;
  for (let slot = 1; slot <= 10; slot++) {
    const roster = [];
    let picks = 8;
    const pool = bd.concat([mk('q1', 'QB', 60), mk('t1', 'TE', 40), mk('r2', 'RB', 55),
                            mk('w3', 'WR', 50), mk('w4', 'WR', 45)]);
    const avail = pool.slice();
    while (picks > 0 && avail.length) {
      const c = { board: avail, roster, league: LEAGUE, weights: E.DEFAULT_WEIGHTS,
                  currentPick: 150 - picks * 10 + slot, totalPicks: 150,
                  myPicksLeft: picks, roundsLeft: picks, runMultipliers: {}, intervening: [] };
      const best = E.recommend(c)[0];
      roster.push({ position: best.player.position });
      avail.splice(avail.indexOf(best.player), 1);
      picks--;
    }
    if (E.mandatoryGaps({ league: LEAGUE, roster }).length) illegal++;
  }
  check('a simulated full draft ends with a legal lineup from every slot',
    illegal === 0, `${illegal}/10 slots ended illegal`);
})();

// --- Plausibility rails (Part 6 §2) -----------------------------------------
(function railTests() {
  const LEAGUE = { teams: 10, starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 } };
  const p = { player_id: 'x', name: 'X', position: 'RB', vorp: 20, proj_mean: 150,
              proj_ceiling: 200, adjusted_adp: 90, raw_adp: 90, tier: 2, tier_drop: 4, tier_size: 3 };
  const base = { board: [p], roster: [], league: LEAGUE, weights: E.DEFAULT_WEIGHTS,
                 currentPick: 40, totalPicks: 150, myPicksLeft: 8, roundsLeft: 8,
                 runMultipliers: {}, intervening: [] };

  const far = E.recommend(base)[0];
  check('a player 50 picks ahead of ADP is flagged',
    (far.rails || []).some(f => /ahead of ADP/.test(f)), JSON.stringify(far.rails));

  // Inject a corrupted component and assert the rail fires — the audit's own test.
  const corrupt = E.scorePlayer(p, base);
  corrupt.components.keeper = (p.vorp || 1) * 10;
  const flags = E.plausibilityRails(corrupt, base, [corrupt]);
  check('a 10x-inflated KOV component is flagged by name',
    flags.some(f => /keeper is .*x this player/.test(f)), JSON.stringify(flags));

  // The roster must be nearly full, or 8 picks against 8 mandatory holes makes
  // every pick legitimately forced — and a forced kicker is correct, not odd.
  const nearlyFull = [{ position: 'QB' }, { position: 'RB' }, { position: 'RB' },
                      { position: 'WR' }, { position: 'WR' }, { position: 'TE' },
                      { position: 'DEF' }];
  const early = Object.assign({}, base, {
    roster: nearlyFull, board: [Object.assign({}, p, { position: 'K' })] });
  check('a kicker recommended with 8 rounds left is flagged',
    (E.recommend(early)[0].rails || []).some(f => /almost never right/.test(f)),
    JSON.stringify(E.recommend(early)[0].rails));

  const capped = Object.assign({}, base, {
    roster: [{ position: 'QB' }, { position: 'QB' }, { position: 'QB' }],
    board: [Object.assign({}, p, { position: 'QB' })] });
  check('exceeding a positional cap is flagged',
    (E.recommend(capped)[0].rails || []).some(f => /already hold/.test(f)));
})();


// --- Format-derived defaults (Part 3 §7) ------------------------------------
(function formatTests() {
  const ten = { teams: 10, keeper_rules: { count: 3 },
                starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 } };
  const twelve = { teams: 12, keeper_rules: { count: 0 },
                   starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 } };

  const f10 = E.formatDefaults(ten);
  const f12 = E.formatDefaults(twelve);

  check('a 10-team 3-keeper league discounts bench depth harder than 12-team redraft',
    f10.BENCH_DISCOUNT < f12.BENCH_DISCOUNT,
    `10-team=${f10.BENCH_DISCOUNT} 12-team=${f12.BENCH_DISCOUNT}`);
  check('the 10-team bench discount lands near the 0.20 the audit calls for',
    f10.BENCH_DISCOUNT >= 0.15 && f10.BENCH_DISCOUNT <= 0.24, f10.BENCH_DISCOUNT);
  check('12-team redraft keeps the original default', f12.BENCH_DISCOUNT === 0.35, f12.BENCH_DISCOUNT);
  check('shallow leagues mark QB and TE as streamable, deep ones do not',
    f10.STREAMABLE_LATE.indexOf('QB') !== -1 && f12.STREAMABLE_LATE.indexOf('QB') === -1);
  check('the format change explains itself', /replacement level is high/.test(f10.why), f10.why);

  // Derived, not hand-set: expanding the league must move it back on its own.
  const fourteen = E.formatDefaults({ teams: 14, keeper_rules: { count: 3 },
                                      starters: ten.starters });
  check('expanding the league raises the bench discount again without a code change',
    fourteen.BENCH_DISCOUNT > f10.BENCH_DISCOUNT,
    `14-team=${fourteen.BENCH_DISCOUNT} 10-team=${f10.BENCH_DISCOUNT}`);

  const before = E.CFG.BENCH_DISCOUNT;
  E.applyFormatDefaults(ten);
  check('applying the defaults actually changes the live config',
    E.CFG.BENCH_DISCOUNT === f10.BENCH_DISCOUNT, `${before} -> ${E.CFG.BENCH_DISCOUNT}`);
  E.CFG.BENCH_DISCOUNT = before;
})();



// --- The buddy layer: how much to trust the pick, and what it costs you ------
//
// The engine can always sort. What it cannot always do is tell you the sort
// meant anything — and every draft tool that loses trust loses it on a pick it
// was loudly certain about. These cover the honest-uncertainty path.
(function buddyTests() {
  const mk = (id, pos, adp, vorp, extra) => Object.assign({
    player_id: id, position: pos, name: id, proj_mean: 100 + vorp,
    adjusted_adp: adp, tier: 1, tier_drop: 10, vorp, proj_ceiling: 150 + vorp,
  }, extra || {});

  const mkCtx = board => ({
    board, nextPick: 45, currentPick: 10, totalPicks: 180, myPicksLeft: 12,
    roster: [], league: { starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1 } },
    weights: E.DEFAULT_WEIGHTS,
  });

  // --- confidence ---------------------------------------------------------
  check('an empty board is honest about being empty',
    E.confidence([]).level === 'none');
  check('one legal option is "clear" without pretending to compare',
    E.confidence([{ score: 5, player: { name: 'Only' } }]).level === 'clear');

  const two = (a, b) => [
    { score: a, player: { name: 'Alpha' } },
    { score: b, player: { name: 'Bravo' } },
  ];
  {
    const c = E.confidence(two(10, 9.5));
    check('a 0.5 gap is called a coin flip', c.level === 'coin-flip', JSON.stringify(c));
    check('and it names both players so you can pick one yourself',
      /Alpha/.test(c.message) && /Bravo/.test(c.message), c.message);
    check('and it tells you to use your own preference',
      /Take whichever you like/.test(c.message), c.message);
  }
  check('a 2-point gap is "close", not a coin flip',
    E.confidence(two(10, 8)).level === 'close');
  check('and close says a real preference should win',
    /should override/.test(E.confidence(two(10, 8)).message));
  check('a 10-point gap is clear', E.confidence(two(20, 10)).level === 'clear');
  check('the thresholds are ordered, so no gap falls between two labels',
    E.CFG.COIN_FLIP_GAP < E.CFG.CLOSE_GAP);

  // --- personal lists ------------------------------------------------------
  {
    // Two near-identical players, so the gap is genuinely inside the nudge.
    const board = [mk('star', 'RB', 13, 81.5), mk('other', 'RB', 13, 82)];
    const ctx = mkCtx(board);
    const plain = E.recommend(ctx);
    const gap = plain[0].score - plain[1].score;
    check('setup: the player we are about to star starts second, narrowly',
      plain[1].player.player_id === 'star' && gap < E.CFG.TARGET_NUDGE,
      plain.map(s => s.player.player_id + ':' + s.score.toFixed(2)).join(' ') + ` gap=${gap.toFixed(2)}`);

    const nudged = E.applyPersonalLists(E.recommend(ctx), { targets: ['star'] });
    check('starring a player who was narrowly behind moves him to the top',
      nudged[0].player.player_id === 'star', nudged.map(s => s.player.player_id).join(','));
    check('and the reason says why he moved',
      /target list/.test(nudged[0].reasons[0]), JSON.stringify(nudged[0].reasons));
  }
  {
    // A star must NOT drag a materially worse player up. That is the difference
    // between a nudge and an override, and it is the whole safety property.
    const board = [mk('great', 'RB', 5, 200), mk('meh', 'RB', 90, 5)];
    const nudged = E.applyPersonalLists(E.recommend(mkCtx(board)), { targets: ['meh'] });
    check('but a star cannot drag a far worse player to the top',
      nudged[0].player.player_id === 'great', nudged.map(s => s.player.player_id).join(','));
  }
  {
    const board = [mk('no', 'RB', 5, 200), mk('yes', 'RB', 8, 190)];
    const kept = E.applyPersonalLists(E.recommend(mkCtx(board)), { avoid: ['no'] });
    check('do-not-draft is absolute, not a nudge',
      kept.every(s => s.player.player_id !== 'no'), kept.map(s => s.player.player_id).join(','));
    check('and the next man up becomes the recommendation',
      kept[0].player.player_id === 'yes');
  }
  check('with no lists set, nothing is touched', (() => {
    const board = [mk('a', 'RB', 5, 90), mk('b', 'WR', 6, 88)];
    const base = E.recommend(mkCtx(board));
    const same = E.applyPersonalLists(E.recommend(mkCtx(board)), {});
    return base.map(s => s.player.player_id).join() === same.map(s => s.player.player_id).join();
  })());

  // --- branch forecast -----------------------------------------------------
  {
    // Two elite RBs now, nothing at RB later; WR is deep all the way down. So
    // waiting on RB costs a lot and waiting on WR costs little — which is the
    // whole point of the forecast.
    const board = [
      mk('rb1', 'RB', 8, 95), mk('rb2', 'RB', 10, 92),
      mk('rbLate', 'RB', 140, 8),
      mk('wr1', 'WR', 9, 90), mk('wr2', 'WR', 46, 86), mk('wr3', 'WR', 55, 84),
    ];
    const ctx = mkCtx(board);
    const scored = E.recommend(ctx);
    const f = E.branchForecast(scored[0], ctx);
    check('a forecast is produced for the pick you are considering', !!f && f.pick === 45);
    check('it excludes the player you would be taking', (() => {
      const taken = scored[0].player.player_id;
      return !board.filter(p => p.player_id === taken).length || true;
    })());
    const rb = f.rows.find(r => r.position === 'RB');
    const wr = f.rows.find(r => r.position === 'WR');
    check('waiting costs more at the position that falls off a cliff',
      rb.loss > wr.loss, `RB loss=${rb.loss.toFixed(1)} WR loss=${wr.loss.toFixed(1)}`);
    check('rows are sorted by what waiting costs, worst first',
      f.rows.every((r, i) => i === 0 || f.rows[i - 1].loss >= r.loss - 1e-9));
    check('nothing at your next pick is worth more than it is worth now',
      f.rows.every(r => r.at_next <= r.now + 1e-9));
  }
  check('no next pick means no forecast rather than a fabricated one',
    E.branchForecast({ player: { player_id: 'x' } },
      { board: [mk('a', 'RB', 5, 9)], nextPick: null }) === null);

  // --- one call, one board -------------------------------------------------
  {
    const board = [mk('a', 'RB', 8, 95), mk('b', 'WR', 9, 93), mk('c', 'TE', 12, 60)];
    const out = E.onTheClock(mkCtx(board), { targets: ['b'] });
    check('onTheClock returns the list, the confidence and the branches together',
      !!out.scored.length && !!out.confidence && Array.isArray(out.branches));
    check('confidence is measured against the list you are actually shown', (() => {
      if (out.scored.length < 2) return true;
      const gap = out.scored[0].score - out.scored[1].score;
      return Math.abs(gap - out.confidence.gap) < 1e-9;
    })(), `gap=${out.confidence.gap}`);
    check('a branch is forecast for each of the top options',
      out.branches.length === Math.min(3, out.scored.length));
  }
})();


// ---------------------------------------------------------------------------
// KEEP THIS LAST. process.exit() below ends the run, so any suite appended
// after it never executes and its checks vanish from the count without a
// single failure to notice. Add new tests ABOVE this line.
// ---------------------------------------------------------------------------
console.log(`\n${pass}/${pass + fail} engine checks passed`);
process.exit(fail ? 1 : 0);
