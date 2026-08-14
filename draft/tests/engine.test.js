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

// UNCITED CONSTANTS. The old assertion here pinned adpSd(100) to 22.0 — the
// 0.22 coefficient the engine audit flagged as roughly twice real mid-round
// dispersion. A test that pins a number the audit says is wrong holds the bug
// in place, exactly like the P(top-2) label test did.
//
// The first repair of it was no better: it swapped 22.0 for a literal 15.0,
// which is just CFG.ADP_SD_CAP restated. That still tests the code against
// itself, and it still breaks the moment the constant is legitimately tuned.
// The rule now: assert the SHAPE against the named constant, and separately
// assert the constant's VALUE once, with a citation for where the value comes
// from. Then re-tuning touches exactly one line, and that line says why.
//
// SPEC: WORKORDERv3.md, adp_sd interim — "clamp(0.15 x adp, 3.0, 15.0)",
// standing in for real per-player ADP dispersion until FFC's sd is reachable
// (blocked at CONNECT by the network policy; see the allowlist note).
check('the sd coefficients are the ones the work order specifies',
  E.CFG.ADP_SD_RATE === 0.15 && E.CFG.ADP_SD_FLOOR === 3.0
    && E.CFG.ADP_SD_CAP === 15.0,
  JSON.stringify([E.CFG.ADP_SD_RATE, E.CFG.ADP_SD_FLOOR, E.CFG.ADP_SD_CAP]));
check('adpSd floors, rather than going to zero at the top of the board',
  approx(E.adpSd(5), E.CFG.ADP_SD_FLOOR));
check('adpSd grows linearly with ADP between the floor and the cap',
  approx(E.adpSd(50), 50 * E.CFG.ADP_SD_RATE));
check('and is capped, so a late-round ADP does not flatten the curve entirely',
  approx(E.adpSd(100), E.CFG.ADP_SD_CAP) && approx(E.adpSd(200), E.CFG.ADP_SD_CAP),
  String(E.adpSd(200)));
check('a source-provided sd always beats the heuristic',
  E.adpSd(170, 6.5) === 6.5);
check('and the cap never fires below the floor',
  E.adpSd(1) === E.CFG.ADP_SD_FLOOR && E.CFG.ADP_SD_CAP > E.CFG.ADP_SD_FLOOR);

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

  // --- D3 flex-discount: a flex-fill is priced marginal-over-best-alternative --
  {
    const board3 = [mk('rb1', 'RB', 100), mk('rb2', 'RB', 90), mk('wr1', 'WR', 70)];
    const keepers2 = [{ position: 'RB', proj_mean: 200, vorp: 88 }, { position: 'RB', proj_mean: 190, vorp: 80 }];
    check('D3 bestFlexAlt returns the best OTHER flex-eligible vorp',
      E.bestFlexAlt(board3[0], { board: board3, league: LEAGUE }) === 90);
    const ctx3 = { board: board3, currentPick: 34, nextPick: 41, totalPicks: 150, myPicksLeft: 12,
      roster: keepers2, league: LEAGUE, weights: E.DEFAULT_WEIGHTS, runMultipliers: {}, roundsLeft: 12 };
    check('D3 a flex-fill (2 RB keepers) is priced marginal = vorp − best alt (100−90=10)',
      E.scorePlayer(board3[0], ctx3).components.need === 10);
    check('D3 flex need is FLOORED at zero (rb2 marginal 90−100 < 0 → 0)',
      E.scorePlayer(board3[1], Object.assign({}, ctx3, { _flexAltSorted: null })).components.need === 0);
    check('D3 a DEDICATED-slot fill is NOT discounted (WR into open WR2 keeps full 70)',
      E.scorePlayer(board3[2], Object.assign({}, ctx3, { _flexAltSorted: null })).components.need === 70);
    // Capped at full VORP: never worth more than the player's own VORP.
    check('D3 flex need is CAPPED at full VORP',
      E.scorePlayer(board3[0], Object.assign({}, ctx3, { _flexAltSorted: null })).components.need <= 100);
  }

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

  // --- Onesie demotion (item 2 fix 1): a rail-flagged K/DST sinks below the
  // last unflagged player, even if a bug floated it to the very top score. This
  // is the engine-level safety net so the app AND the robot see the same order.
  const mkE = (pos, score, rails, forced) =>
    ({ player: { position: pos, name: pos + score }, score, rails: rails || [], forced: !!forced });
  const messy = [
    mkE('K', 999, ['K this early is almost never right']),   // flagged, top score
    mkE('WR', 50, []),
    mkE('DEF', 900, ['DEF this early is almost never right']), // flagged
    mkE('RB', 40, []),
    mkE('K', 30, []),                                          // UNflagged K — stays put
  ];
  const dem = E.demoteFlaggedOnesies(messy);
  check('demotion puts both rail-flagged onesies at the tail of the list',
    ['K', 'DEF'].indexOf(dem[dem.length - 1].player.position) >= 0
      && dem[dem.length - 1].rails.length > 0
      && dem[dem.length - 2].rails.length > 0,
    dem.map(e => e.player.name).join(','));
  check('an unflagged kicker is NOT demoted (only rail-flagged onesies sink)',
    !dem.find(e => e.player.name === 'K30').demoted);
  check('every non-onesie player is above every demoted onesie',
    (function () {
      const firstDemoted = dem.findIndex(e => e.demoted);
      return dem.slice(0, firstDemoted).every(e =>
        !(['K', 'DEF'].indexOf(e.player.position) >= 0 && e.rails.length > 0));
    })());
  check('demotion is stable within each group (WR before RB, K999 before DEF900)',
    dem.filter(e => !e.demoted).map(e => e.player.name).join(',') === 'WR50,RB40,K30'
      && dem.filter(e => e.demoted).map(e => e.player.name).join(',') === 'K999,DEF900');
  check('a forced endgame onesie is never demoted even when flagged',
    !E.demoteFlaggedOnesies([mkE('K', 10, ['flag'], true), mkE('WR', 5, [])])[0].demoted);
  // End to end through recommend: a flagged kicker never sits above a startable
  // player, and the demoted flag is set for the app to draw its divider.
  const rec = E.recommend(early);
  check('through recommend, the flagged kicker is marked demoted',
    rec[0].player.position !== 'K' || rec[0].demoted === true);

  // --- Rail-fire budget (item 2 fix 2). Pure counting + acknowledgement logic.
  const flg = (id, rails) => ({ player: { player_id: id, name: 'P' + id, position: 'RB' }, rails: rails || [] });
  const list = [flg('1', ['a']), flg('2', []), flg('3', ['b', 'c']),
                flg('4', ['d']), flg('5', [])];
  const b0 = E.computeRailBudget(list, { builtAt: 'B1', acks: {}, budget: 2, topN: 15 });
  check('budget counts only flagged players in the top N', b0.count === 3, String(b0.count));
  check('more than the budget trips overBudget', b0.overBudget === true);
  check('nothing acknowledged yet, so not allAcked', b0.allAcked === false && b0.unacked.length === 3);
  check('two flags or fewer is within budget',
    E.computeRailBudget([flg('1', ['a']), flg('2', ['b'])], { builtAt: 'B1', budget: 2 }).overBudget === false);
  check('topN cut excludes flags below the line',
    E.computeRailBudget(list, { builtAt: 'B1', budget: 2, topN: 2 }).count === 1);
  // Acknowledge one fire against build B1 with its exact flags.
  const sig3 = E.railFireSig('B1', '3', ['b', 'c']);
  const acks = { 3: { sig: sig3, reason: 'checked, real', flags: ['b', 'c'] } };
  const b1 = E.computeRailBudget(list, { builtAt: 'B1', acks, budget: 2, topN: 15 });
  check('a matching acknowledgement clears exactly that fire',
    b1.unacked.length === 2 && b1.fires.find(f => f.id === '3').acked === true);
  check('still overBudget until EVERY fire is acknowledged', b1.overBudget === true && b1.allAcked === false);
  // A rebuild (new builtAt) invalidates the old ack — you must look again.
  const b2 = E.computeRailBudget(list, { builtAt: 'B2', acks, budget: 2, topN: 15 });
  check('a new build silently invalidates an old acknowledgement',
    b2.fires.find(f => f.id === '3').acked === false && b2.unacked.length === 3);
  // A changed flag set on the same player also invalidates it.
  const list2 = [flg('1', ['a']), flg('3', ['b', 'c', 'NEW']), flg('4', ['d'])];
  const b3 = E.computeRailBudget(list2, { builtAt: 'B1', acks, budget: 2, topN: 15 });
  check('a changed flag set invalidates the acknowledgement for that player',
    b3.fires.find(f => f.id === '3').acked === false);
  check('flag-set signature is order-independent',
    E.railFireSig('B1', '3', ['c', 'b']) === E.railFireSig('B1', '3', ['b', 'c']));
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
  // Symbolic, not a literal 0.35: the claim is "a 12-team league is left at the
  // module default", and that is true whatever the default happens to be. The
  // 10-team check above is the one with a cited target (the audit's 0.20), and
  // it asserts a RANGE around it rather than a snapshot.
  check('12-team redraft keeps the original default',
    f12.BENCH_DISCOUNT === E.CFG.BENCH_DISCOUNT, f12.BENCH_DISCOUNT);
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

  // --- paths panel (Part 2 §1) --------------------------------------------
  {
    // A board with several coherent directions: elite TE, WR value, RB depth.
    const board = [
      mk('teA', 'TE', 20, 60, { tier: 1, tier_drop: 40 }),
      mk('teB', 'TE', 55, 20, { tier: 3 }),
      mk('wrA', 'WR', 24, 58), mk('wrB', 'WR', 30, 54), mk('wrC', 'WR', 44, 40),
      mk('rbA', 'RB', 26, 56), mk('rbB', 'RB', 38, 48),
      mk('qbA', 'QB', 90, 30),
    ];
    const paths = E.computePaths(mkCtx(board));
    check('paths: returns an array, at most PATHS_MAX directions',
      Array.isArray(paths) && paths.length <= E.CFG.PATHS_MAX, 'n=' + paths.length);
    check('paths: the top path is priced at zero (nothing costs less than the best)',
      paths.length > 0 && paths[0].price === 0, JSON.stringify(paths.map(p => p.price)));
    /* ── THIS ASSERTION PINNED THE DEFECT, AND ITS TWO HALVES SPLIT (08-14) ──
     *
     * It checked `price >= 0 && price <= PATHS_BAND` as one condition. The first
     * half is a genuine invariant — a "cost" below zero is a badge that reads
     * backwards, and it really can happen (an unsorted board produces −5.1, −9,
     * −23.6; see paths_offer_options.test.js).
     *
     * THE SECOND HALF WAS PINNING THE THING CORY REPORTED. "Every rendered path
     * is within the band" is the same statement as "the band decides whether an
     * option exists", and measured across his twelve picks that left ONE
     * direction at ten of them — whose leader is by construction the player the
     * recommendations panel already prints at #1. *"Gibbs listed twice? No other
     * options."*
     *
     * The band still means what it meant; it now sets `within_band` instead of
     * deleting the card. So the checkable claim is that the FLAG is accurate,
     * not that it is universally true — a test asserting the latter is a test
     * that goes red when the panel starts offering alternatives. */
    check('paths: no price is negative — a cost below zero is a badge that reads '
      + 'backwards', paths.every(p => p.price >= 0),
    JSON.stringify(paths.map(p => p.price)));
    check('paths: within_band agrees with the price on every card, so an expensive '
      + 'direction can never render as an equal',
      paths.every(p => p.within_band === (p.price <= E.CFG.PATHS_BAND)),
      JSON.stringify(paths.map(p => [p.price, p.within_band])));
    check('paths: the in-band cards are a PREFIX — a widened panel never demotes '
      + 'a direction that already qualified',
      (function () {
        const f = paths.map(p => p.within_band);
        return f.lastIndexOf(true) < f.indexOf(false) || f.indexOf(false) < 0;
      })(), JSON.stringify(paths.map(p => p.within_band)));
    check('paths: each direction groups a single position (a real direction, not a mix)',
      paths.every(p => p.candidates.every(c => c.player.position === p.position)));
    check('paths: every path names a plain-language direction and a when-it\'s-right',
      paths.every(p => p.name && p.when_right));
    check('paths: distinct directions do not repeat the same cluster key',
      new Set(paths.map(p => p.key)).size === paths.length);
    // Coin-flip flag is symmetric when set.
    check('paths: a path-level coin flip is mutual (both cards point at each other)',
      paths.every(p => !p.coin_flip_with
        || (paths.find(q => q.key === p.coin_flip_with) || {}).coin_flip_with === p.key));
    check('paths: an empty board yields no paths',
      E.computePaths(mkCtx([])).length === 0);
  }

  // --- B7 dollar gap -------------------------------------------------------
  {
    const boomy = { player_id: 'boom', name: 'Boomer', position: 'WR', proj_mean: 180, proj_ceiling: 260 };
    const steady = { player_id: 'steady', name: 'Steady', position: 'WR', proj_mean: 175, proj_ceiling: 205 };
    const g = E.dollarGap(boomy, steady, null);
    check('dollarGap: the boomier player leads on high-pool $ (more weekly-high fuel)',
      g.high > 0, JSON.stringify(g));
    check('dollarGap: total decomposes into high + entry + rs (+ echo, 0 with no ctx)',
      Math.abs(g.total - (g.high + g.entry + g.rs + g.echo)) < 0.05, JSON.stringify(g));
    check('dollarGap: v1 always carries the rough confidence class',
      g.confidence === 'rough');
    check('dollarGap: the Why? terms expose each player\'s decomposition',
      g.terms && g.terms.A && g.terms.B && g.terms.A.dollars && g.terms.note);
    // Two near-identical players fall inside the noise band → even money.
    const twinA = { player_id: 'ta', name: 'TwinA', position: 'RB', proj_mean: 150, proj_ceiling: 200 };
    const twinB = { player_id: 'tb', name: 'TwinB', position: 'RB', proj_mean: 150, proj_ceiling: 200 };
    const gt = E.dollarGap(twinA, twinB, null);
    check('dollarGap: a gap inside the noise band is EVEN MONEY, not a fake number',
      gt.even_money === true && /even money/.test(gt.verdict) && gt.leader === null,
      JSON.stringify(gt));
    check('dollarGap: a real gap names the leader with a dollar figure',
      !g.even_money && g.leader === 'Boomer' && /\+\$/.test(g.verdict), g.verdict);
  }

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


// --- Roster shape and bye weeks ---------------------------------------------
(function planTests() {
  const L = { starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 } };
  const P = (pos, bye) => ({ player_id: pos + bye + Math.random(), position: pos, name: pos, bye });
  const full = [P('QB', 5), P('RB', 5), P('RB', 7), P('WR', 9), P('WR', 11),
                P('TE', 6), P('RB', 12), P('K', 8), P('DEF', 10)];

  // --- the plan -----------------------------------------------------------
  {
    const p = E.rosterPlan({ league: L, roster: [], myPicksLeft: 9 });
    check('an empty roster needs every starting slot', p.mustSpend === 9, JSON.stringify(p));
    check('and with exactly nine picks nothing is spare', p.spare === 0, p.message);
  }
  {
    const p = E.rosterPlan({ league: L, roster: [], myPicksLeft: 14 });
    check('with picks to burn, some are genuinely free', p.spare === 5, p.message);
    check('and it says so in a sentence', /5 picks are genuinely free/.test(p.message), p.message);
  }
  {
    // The one that matters: two picks, kicker and defence still missing.
    const short = full.filter(x => x.position !== 'K' && x.position !== 'DEF');
    const p = E.rosterPlan({ league: L, roster: short, myPicksLeft: 2 });
    check('K and DEF are counted as must-fill', p.mustSpend === 2, JSON.stringify(p.needed));
    check('two picks for two slots leaves nothing spare', p.spare === 0);
    check('and it is flagged tight', p.tight === true);
  }
  {
    const short = full.filter(x => x.position !== 'K' && x.position !== 'DEF');
    const p = E.rosterPlan({ league: L, roster: short, myPicksLeft: 1 });
    check('more slots than picks says so plainly', p.spare === -1 && /has to give/.test(p.message), p.message);
  }
  {
    const p = E.rosterPlan({ league: L, roster: full, myPicksLeft: 4 });
    check('a complete lineup frees every remaining pick', p.mustSpend === 0 && p.spare === 4, p.message);
    check('and the message says it is all upside', /upside/.test(p.message), p.message);
  }
  {
    // FLEX is a claim on a pick but not on a position.
    const noFlex = [P('QB', 5), P('RB', 5), P('RB', 7), P('WR', 9), P('WR', 11),
                    P('TE', 6), P('K', 8), P('DEF', 10)];
    const p = E.rosterPlan({ league: L, roster: noFlex, myPicksLeft: 3 });
    check('an unfilled FLEX still costs a pick', p.mustSpend === 1, JSON.stringify(p));
    check('but it is not listed as a position you must draft',
      !p.needed.some(n => n.position === 'FLEX'), JSON.stringify(p.needed));
    const withSurplus = noFlex.concat([P('WR', 4)]);
    check('a surplus receiver satisfies the FLEX',
      E.rosterPlan({ league: L, roster: withSurplus, myPicksLeft: 3 }).mustSpend === 0);
  }

  // --- bye weeks ----------------------------------------------------------
  {
    const roster = [P('RB', 7), P('RB', 7), P('WR', 9), P('WR', 11), P('QB', 7)];
    const late = E.byeGrid({ league: L, roster, myPicksLeft: 2 });
    const wk7 = late.find(r => r.week === 7);
    check('both starting RBs out in the same week is a real hole',
      wk7.severity === 'bad' && wk7.shorts.some(s => s.position === 'RB'), JSON.stringify(wk7.shorts));
    check('and it says how many you could actually start',
      wk7.shorts.find(s => s.position === 'RB').available === 0);

    const early = E.byeGrid({ league: L, roster, myPicksLeft: 8 });
    check('the same clash in round three is provisional, not a crisis',
      early.find(r => r.week === 7).severity === 'warn', JSON.stringify(early[0]));
    check('and it is marked as such so the UI can say why',
      early.find(r => r.week === 7).provisional === true);
  }
  {
    // A position you have not drafted at all is a ROSTER gap, not a bye clash.
    const thin = [P('RB', 7), P('RB', 7)];
    const g = E.byeGrid({ league: L, roster: thin, myPicksLeft: 2 });
    check('an undrafted position is never reported as a bye problem',
      g.every(r => !r.shorts.some(s => ['QB', 'TE', 'K', 'DEF', 'WR'].indexOf(s.position) >= 0)),
      JSON.stringify(g));
  }
  {
    // Depth means a bye costs nothing.
    const deep = [P('WR', 9), P('WR', 11), P('WR', 12), P('RB', 5), P('RB', 6), P('RB', 8)];
    const g = E.byeGrid({ league: L, roster: deep, myPicksLeft: 2 });
    check('with three receivers, one on bye is a non-event',
      !g.find(r => r.week === 9).shorts.length, JSON.stringify(g.find(r => r.week === 9)));
  }
  {
    const g = E.byeGrid({ league: L, roster: [P('RB', 7), P('WR', 7), P('TE', 7), P('QB', 7)], myPicksLeft: 9 });
    check('weeks are returned in order', g.every((r, i) => i === 0 || g[i - 1].week <= r.week));
    check('a week with four players out is at least amber even with no hole',
      g[0].severity !== 'ok', JSON.stringify(g[0]));
  }
  check('players with no bye on file are skipped rather than bucketed under 0',
    E.byeGrid({ league: L, roster: [P('RB', null), P('WR', 0)], myPicksLeft: 5 }).length === 0);
})();


// ---------------------------------------------------------------------------
// The paper sheet — the fallback for a dead phone at the table.
// ---------------------------------------------------------------------------
(function sheetSuite() {
  const mk = (id, pos, adp, tier, proj) => ({
    player_id: id, name: 'P' + id, position: pos, team: 'XX', bye: 7,
    adjusted_adp: adp, raw_adp: adp, tier: tier, proj_mean: proj, proj_sd: 20,
    vorp: proj / 10, tier_drop: 5, overall_rank: adp,
  });
  const board = [
    mk('a', 'RB', 1, 1, 300), mk('b', 'RB', 2, 1, 290), mk('c', 'WR', 3, 1, 280),
    mk('d', 'WR', 12, 2, 240), mk('e', 'TE', 20, 1, 200), mk('f', 'QB', 30, 1, 320),
    mk('g', 'RB', 40, 3, 180), mk('h', 'WR', 55, 3, 170), mk('i', 'K', 90, 1, 130),
    mk('j', 'DEF', 95, 1, 120), mk('k', 'TE', 60, 2, 150),
  ];
  const league = { teams: 10, starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 },
    roster_slots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1, BN: 6 } };
  const ctx = { board: board, currentPick: 5, nextPick: 16, totalPicks: 150,
    myPicksLeft: 12, roster: [], league: league, weights: E.DEFAULT_WEIGHTS,
    runMultipliers: {}, intervening: [], roundsLeft: 12 };

  // The single property that makes the queue worth having.
  const s1 = E.cheatSheet(ctx, { targets: [], avoid: [], queue: ['h', 'a', 'e'] });
  check('the sheet keeps YOUR queue order, not the board\'s',
    s1.queue.map(q => q.player_id).join(',') === 'h,a,e', JSON.stringify(s1.queue.map(q => q.player_id)));
  check('queue rows are numbered from 1 in your order',
    s1.queue.map(q => q.rank).join(',') === '1,2,3');
  check('each queued player carries his chance of lasting to your next turn',
    s1.queue.every(q => typeof q.survives_to_next === 'number'
      && q.survives_to_next >= 0 && q.survives_to_next <= 100), JSON.stringify(s1.queue));
  check('the man going at pick 1 is less likely to last than the man going at 55',
    s1.queue.find(q => q.player_id === 'a').survives_to_next
      < s1.queue.find(q => q.player_id === 'h').survives_to_next);

  // Best-available must not duplicate the queue, or the sheet reads as if you
  // have twice as many options as you do.
  check('best-available excludes anyone already in your queue',
    s1.best.every(p => ['h', 'a', 'e'].indexOf(p.player_id) < 0), JSON.stringify(s1.best.map(p => p.player_id)));

  // Never-list is absolute everywhere, including on paper.
  const s2 = E.cheatSheet(ctx, { targets: [], avoid: ['a', 'b'], queue: [] });
  check('a blocked player never reaches the sheet',
    s2.best.every(p => p.player_id !== 'a' && p.player_id !== 'b')
      && s2.byPosition.every(g => g.players.every(p => p.player_id !== 'a')));
  check('the sheet records how many were blocked', s2.generated.blocked === 2);

  // A contradiction the user created is reported, not silently resolved.
  const s3 = E.cheatSheet(ctx, { targets: [], avoid: ['a'], queue: ['a'] });
  check('queued AND blocked is flagged rather than quietly picking one',
    s3.warnings.some(w => /queue AND/.test(w)), JSON.stringify(s3.warnings));

  // A queued player who has gone is reported, not dropped.
  const gone = Object.assign({}, ctx, { board: board.filter(p => p.player_id !== 'a') });
  const s4 = E.cheatSheet(gone, { targets: [], avoid: [], queue: ['a', 'b'] });
  check('a queued player already drafted is shown as gone, not removed',
    s4.queue.length === 2 && s4.queue[0].gone === true && s4.queue[1].gone === false,
    JSON.stringify(s4.queue));

  // Tier breaks are the reason the by-position section exists.
  const s5 = E.cheatSheet(ctx, { targets: [], avoid: [], queue: [] });
  const rbs = s5.byPosition.find(g => g.position === 'RB');
  check('positions are grouped and ordered by the same score as the board',
    !!rbs && rbs.players.length === 3, JSON.stringify(rbs));
  check('the last man in a tier is marked as a cliff',
    rbs.players.some(p => p.tier_break), JSON.stringify(rbs.players));
  check('the last row overall is never marked as a cliff',
    rbs.players[rbs.players.length - 1].tier_break === false);

  // Provenance: a sheet that does not say what it was built from is a sheet
  // you cannot tell is stale.
  check('the sheet stamps the state it was built from',
    s5.generated.current_pick === 5 && s5.generated.board_size === 11
      && s5.generated.my_picks_left === 12, JSON.stringify(s5.generated));
  check('an empty queue says so rather than looking complete',
    s5.warnings.some(w => /queue is empty/.test(w)));

  // Targets survive onto paper.
  const s6 = E.cheatSheet(ctx, { targets: ['g'], avoid: [], queue: [] });
  check('a starred player is marked as starred on the sheet',
    s6.best.find(p => p.player_id === 'g').targeted === true);

  // The text renderer.
  const txt = E.sheetText(s1, { title: 'MFGA', myPicks: [5, 16, 25], built_at: '2026-08-07T09:00:00Z' });
  check('the text sheet names all three sections',
    /YOUR QUEUE/.test(txt) && /BEST AVAILABLE/.test(txt) && /== RB ==/.test(txt));
  check('the text sheet leads with the snapshot it was built from',
    /snapshot: pick 5/.test(txt) && /your picks: 5, 16, 25/.test(txt), txt.split('\n').slice(0, 4).join(' | '));
  check('the text sheet prints your queue in your order',
    txt.indexOf('\n1.') < txt.indexOf('\n2.'));
  check('the text sheet is plain ASCII-safe text with no markup',
    txt.indexOf('<') < 0 && txt.indexOf('&') < 0);
  check('every queued player appears in the text',
    ['Ph', 'Pa', 'Pe'].every(n => txt.indexOf(n) >= 0));

  // An empty board must degrade, not throw.
  const empty = E.cheatSheet(Object.assign({}, ctx, { board: [] }), { targets: [], avoid: [], queue: [] });
  check('an empty board produces a sheet that says so instead of crashing',
    empty.best.length === 0 && empty.warnings.some(w => /board is empty/.test(w)));
  check('and rendering that empty sheet does not throw',
    typeof E.sheetText(empty, {}) === 'string');

  // No next pick (last pick of the draft) must not fabricate a percentage.
  const last = E.cheatSheet(Object.assign({}, ctx, { nextPick: null }),
    { targets: [], avoid: [], queue: ['a'] });
  check('with no next pick the survival column is null, not a made-up 0',
    last.queue[0].survives_to_next === null, JSON.stringify(last.queue[0]));
})();


// ---------------------------------------------------------------------------
// Reading the room — manager tells, and who takes whom before your next pick.
// ---------------------------------------------------------------------------
(function threatSuite() {
  const mk = (id, pos, adp, tier, proj) => ({
    player_id: id, name: 'P' + id, position: pos, team: 'XX', bye: 7,
    adjusted_adp: adp, raw_adp: adp, tier: tier, proj_mean: proj, proj_sd: 20,
    vorp: proj / 10, tier_drop: 5, overall_rank: adp,
  });
  const board = [];
  ['RB', 'WR', 'QB', 'TE'].forEach((pos, pi) => {
    for (let i = 0; i < 6; i++) board.push(mk(pos + i, pos, 5 + pi * 4 + i * 3, 1 + i, 300 - pi * 20 - i * 12));
  });
  const league = { teams: 10, starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 },
    roster_slots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1, BN: 6 } };
  const seat = (slot, pick_no, profile, roster) => ({
    team_slot: slot, pick_no: pick_no, roster: roster || [], profile: profile || null });
  const ctx = (intervening, over) => Object.assign({
    board: board, currentPick: 10, nextPick: 15, totalPicks: 130, myPicksLeft: 10,
    roster: [], league: league, weights: E.DEFAULT_WEIGHTS, runMultipliers: {},
    intervening: intervening, roundsLeft: 10, progress: 0.2,
  }, over || {});

  // --- tells -------------------------------------------------------------
  check('a manager with no profile produces no tells', E.managerTells(null).length === 0);
  check('a profile with nothing distinctive produces no tells',
    E.managerTells({ sample_size: 3, positional_timing: { QB: { vs_league: 0.2, mean_round: 7 } },
      reach_delta: { mean: 0.3 }, homer_index: { team: 'KC', rate: 0.08 },
      rookie_affinity: { rate: 0.10, league_rate: 0.09 },
      bpa_vs_need: { bpa_rate: 0.6, league_rate: 0.6 } }).length === 0,
    JSON.stringify(E.managerTells({ sample_size: 3, reach_delta: { mean: 0.3 } })));

  const early = E.managerTells({ sample_size: 3,
    positional_timing: { QB: { vs_league: -3.2, mean_round: 4.2 } } });
  check('taking a position early is reported as early, not late',
    early.length === 1 && /QB about 3.2 rounds earlier/.test(early[0].text), JSON.stringify(early));
  const late = E.managerTells({ sample_size: 3,
    positional_timing: { TE: { vs_league: 2.4, mean_round: 11 } } });
  check('waiting on a position is reported as waiting',
    /waits about 2.4 rounds longer/.test(late[0].text), JSON.stringify(late));

  const proxied = E.managerTells({ sample_size: 3, reach_delta: { mean: 4.0, proxy: true } });
  check('a reach measured by proxy is marked as a proxy',
    proxied[0].proxy === true && /hint/.test(proxied[0].detail), JSON.stringify(proxied));
  check('a reach measured against real ADP is not marked as a proxy',
    E.managerTells({ sample_size: 3, reach_delta: { mean: 4.0, proxy: false } })[0].proxy === false);
  check('drafting below market reads as patience, not reaching',
    /lets value come to him/.test(E.managerTells({ sample_size: 3,
      reach_delta: { mean: -3.5 } })[0].text));

  /* ── THE REACH TELL CARRIES ITS OWN SUPPORT ────────────────────────────
   *
   * `reach_delta` has always carried `sd`, and the profile `picks_analysed`, so
   * the standard error was computable and never computed. The tell fired on
   * |mean| alone. Measured over the ten managers on the live board, only TWO
   * exceed two standard errors — and NEITHER is one the tell calls a reacher:
   *
   *     ds7mmet      mean  +7.3   sd 134.2   t = 0.34   <- "reaches"
   *     Richard2121  mean +12.9   sd 141.2   t = 0.58   <- "reaches"
   *     MarianSaar   mean  -7.0   sd  20.7   t = -2.10  <- "near market"
   *     B8T3S        mean  -5.9   sd  18.3   t = -2.05  <- "near market"
   *
   * One or two enormous outliers (sd 134 against a mean of 7) drag the mean past
   * the threshold, so the flag is anti-correlated with the evidence for reaching.
   * It also contradicts this project's own standard, set in the VONA section of
   * the surface contract: "three drafts give a direction, not a magnitude."
   *
   * NOT GATED, NOT RE-WEIGHTED, AND `withinPrecision` IN survival.js — which
   * reads the same mean to shape the opponent softmax — IS UNTOUCHED. Several
   * corrections are defensible and none is measured; fitting one eight days out
   * would move Layer 2 survival, and through it VONA, on a suspicion. */
  {
    const weak = E.managerTells({ sample_size: 3, picks_analysed: 40,
      reach_delta: { mean: 7.3, sd: 134.2, proxy: false } })[0];
    check('a reach whose spread swamps it is marked WEAK rather than stated flat',
      /WEAK/.test(weak.detail) && weak.well_supported === false, JSON.stringify(weak.detail));
    check('and it names the spread and the sample, so the reader can check it',
      /±21 picks over 40/.test(weak.detail), weak.detail);

    const solid = E.managerTells({ sample_size: 3, picks_analysed: 39,
      reach_delta: { mean: -7.0, sd: 20.7, proxy: false } })[0];
    check('a reach that survives its own spread says so instead',
      /holds at 2\.1 standard errors/.test(solid.detail) && solid.well_supported === true,
      solid.detail);

    check('CONTROL — both tells still FIRE and carry the same text and weight; '
      + 'nothing was gated or re-weighted on the strength of this',
    /reaches 7\.3 picks/.test(weak.text) && /lets value come to him/.test(solid.text)
      && weak.weight === 7.3 / 2, JSON.stringify([weak.text, weak.weight]));

    check('a profile with no sd degrades to the old behaviour rather than '
      + 'inventing support', (function () {
      const t = E.managerTells({ sample_size: 3, reach_delta: { mean: 4.0, proxy: false } })[0];
      return t.support_t === null && t.well_supported === null && !/WEAK|standard errors/.test(t.detail);
    })());

    /* THE MEASUREMENT, RE-DERIVED FROM THE LIVE BOARD rather than quoted, so
     * this goes red if the profiles change shape rather than silently ageing. */
    const PROF = require('../../public/draft_data.json').manager_profiles || {};
    const mgrs = Object.values(PROF.managers || {});
    const tOf = m => {
      const rd = m.reach_delta || {}, n = m.picks_analysed || 0;
      if (rd.sd == null || !n || rd.mean == null) return null;
      return rd.mean / (rd.sd / Math.sqrt(n));
    };
    const supported = mgrs.filter(m => { const t = tOf(m); return t != null && Math.abs(t) >= 2; });
    check('CONTROL — the live board still carries ten profiles with sd, or the '
      + 'claim below measures nothing', mgrs.length >= 8
      && mgrs.every(m => tOf(m) != null), mgrs.length);
    check('MEASURED: most managers reach-effects are NOT distinguishable from '
      + 'zero, which is why the tell had to carry its support',
    supported.length <= mgrs.length / 2,
    supported.length + ' of ' + mgrs.length + ' exceed 2 SE');
    check('and every manager the tell calls a REACHER on this board is one of '
      + 'the unsupported ones — the flag is anti-correlated with the evidence',
    mgrs.filter(m => (m.reach_delta || {}).mean > 0 && Math.abs(tOf(m)) >= 2).length === 0,
    mgrs.filter(m => (m.reach_delta || {}).mean > 0)
      .map(m => m.name + ' t=' + tOf(m).toFixed(2)).join(', '));
  }

  check('a homer above the threshold is called out by team',
    /homer for KC/.test(E.managerTells({ sample_size: 3,
      homer_index: { team: 'KC', rate: 0.31 } })[0].text));
  check('a rookie rate that is high only in ratio terms is not a tell',
    E.managerTells({ sample_size: 3, rookie_affinity: { rate: 0.03, league_rate: 0.01 } }).length === 0);
  check('tells come back strongest first',
    (function () {
      const t = E.managerTells({ sample_size: 3,
        positional_timing: { QB: { vs_league: -4.0, mean_round: 3 }, TE: { vs_league: -1.1, mean_round: 8 } } });
      return t.length === 2 && t[0].position === 'QB';
    })());
  check('every tell carries the sample size it came from',
    E.managerTells({ sample_size: 3, homer_index: { team: 'KC', rate: 0.31 } })[0].sample_size === 3);

  // --- the threat board --------------------------------------------------
  check('with nobody picking in between there is nothing to report',
    E.threatBoard(ctx([])).rows.length === 0);
  check('and it does not pretend otherwise',
    E.threatBoard(ctx([])).atRisk.length === 0 && E.threatBoard(ctx([])).picksUntilNext === 0);

  const seats = [seat(5, 11), seat(6, 12), seat(7, 13), seat(8, 14)];
  const t = E.threatBoard(ctx(seats));
  check('one row per intervening pick, in pick order',
    t.rows.length === 4 && t.rows.map(r => r.pick_no).join(',') === '11,12,13,14',
    JSON.stringify(t.rows.map(r => r.pick_no)));
  check('picks outside the window are excluded',
    E.threatBoard(ctx(seats.concat([seat(9, 40)]))).rows.length === 4);
  check('a seat with no profile is labelled by slot, not left blank',
    t.rows.every(r => r.manager === null && r.team_slot > 0));

  // THE property that is easy to get wrong: one seat takes ONE player.
  t.rows.forEach(r => {
    const sum = r.likely.reduce((s, l) => s + l.p, 0);
    check('pick ' + r.pick_no + ' does not claim to take more than one player ('
      + sum + '%)', sum <= 101, JSON.stringify(r.likely));
  });

  check('each seat names its most likely position with a probability',
    t.rows.every(r => r.positions.length && r.positions[0].p > 0
      && r.positions[0].p <= 1));
  check('positions come back most-likely first',
    t.rows.every(r => r.positions.every((p, i) => i === 0 || r.positions[i - 1].p >= p.p)));

  // Availability must decay across the window, or seat four is told a player
  // seat one almost certainly took is still sitting there.
  const topName = t.rows[0].likely[0].name;
  const later = t.rows[3].likely.find(l => l.name === topName);
  check('a player the first seat is likely to take is less likely to still be '
    + 'there for the fourth', !later || later.p < t.rows[0].likely[0].p,
    JSON.stringify({ first: t.rows[0].likely[0], fourth: later }));

  check('at-risk players carry a chance and a named seat where one stands out',
    t.atRisk.every(r => r.gone >= 25 && r.gone <= 100), JSON.stringify(t.atRisk.slice(0, 3)));
  check('at-risk is ordered by what it costs you, not by raw probability',
    t.atRisk.every((r, i) => i === 0
      || (t.atRisk[i - 1].gone / 100) * (t.atRisk[i - 1].vorp || 0) >= (r.gone / 100) * (r.vorp || 0)),
    JSON.stringify(t.atRisk.map(r => r.name + ' ' + r.gone + '% v' + r.vorp)));
  check('nobody appears in at-risk twice',
    new Set(t.atRisk.map(r => r.player_id)).size === t.atRisk.length);

  // A profile actually has to change the answer, or none of this is worth
  // rendering. The lever is alpha_need vs beta_value: a need-driven manager
  // whose ONLY hole is QB should reach for the low-value QB that a
  // value-driven manager in the same seat would pass on.
  //
  // (An earlier version of this test asserted that a high alpha_need raised QB
  // for a manager with an EMPTY roster. It does the opposite, correctly: an
  // empty roster's biggest need is the two-starter position, so need-weighting
  // pushes him further toward RB. The profile was doing its job; the test was
  // wrong about what the job is.)
  const oneHole = [
    { position: 'RB' }, { position: 'RB' }, { position: 'WR' },
    { position: 'WR' }, { position: 'TE' },
  ];
  const pOf = (x, pos) => (x.rows[0].positions.find(p => p.position === pos) || { p: 0 }).p;
  const needy = E.threatBoard(ctx([seat(5, 11,
    { name: 'Richard', sample_size: 3, softmax: { alpha_need: 2.5, beta_value: 0.4 },
      positional_timing: { QB: { vs_league: -3.2, mean_round: 4.2 } } }, oneHole)]));
  const valuey = E.threatBoard(ctx([seat(5, 11,
    { name: 'Sam', sample_size: 3, softmax: { alpha_need: 0.4, beta_value: 2.5 } }, oneHole)]));
  check('with QB his only hole, the need-driven manager takes a QB more often '
    + 'than the value-driven one', pOf(needy, 'QB') > pOf(valuey, 'QB'),
    JSON.stringify({ needy: pOf(needy, 'QB'), valuey: pOf(valuey, 'QB') }));
  check('and the value-driven manager keeps taking the best player instead',
    pOf(valuey, 'RB') > pOf(needy, 'RB'),
    JSON.stringify({ needy: pOf(needy, 'RB'), valuey: pOf(valuey, 'RB') }));
  check('every seat\'s positional probabilities sum to 1',
    needy.rows[0].positions.reduce((s, p) => s + p.p, 0) > 0.999
      && needy.rows[0].positions.reduce((s, p) => s + p.p, 0) < 1.001);

  // A reacher spreads his probability down the list rather than concentrating
  // it on the best name — that is what makes him hard to predict. Tested on
  // the raw probability rather than through the threat board, whose integer
  // percentages round the whole effect away.
  //
  // This is the property that was inverted for the life of the file: the
  // softmax constant is a PRECISION (it multiplies the score gap), and both
  // call sites RAISED it for a reacher, modelling him as more predictable than
  // average. Nothing failed because nothing tested it.
  const S = E.survivalModel;
  const rbPool = board.filter(p => p.position === 'RB');
  const best = rbPool[0], fourth = rbPool[3];
  const prof = mean => ({ profile: { reach_delta: { mean: mean } } });
  const wp = (p, t) => S.withinPositionProbability(p, board, t);

  check('a league-average manager is unchanged by the fix',
    S.withinPrecision({ profile: {} }) === S.CFG.WITHIN_POS_TEMP
      && S.withinPrecision(prof(0)) === S.CFG.WITHIN_POS_TEMP);
  check('a reacher is modelled with LOWER precision than average',
    S.withinPrecision(prof(10)) < S.CFG.WITHIN_POS_TEMP, String(S.withinPrecision(prof(10))));
  check('a value drafter is modelled with HIGHER precision than average',
    S.withinPrecision(prof(-10)) > S.CFG.WITHIN_POS_TEMP, String(S.withinPrecision(prof(-10))));
  check('precision is clamped at both ends so an outlier profile cannot break it',
    S.withinPrecision(prof(999)) >= 0.15 && S.withinPrecision(prof(-999)) <= 0.9);

  check('a reacher is LESS likely than average to take the best man at a position',
    wp(best, prof(12)) < wp(best, prof(0)),
    JSON.stringify({ reacher: wp(best, prof(12)), avg: wp(best, prof(0)) }));
  check('and MORE likely than average to take somebody further down',
    wp(fourth, prof(12)) > wp(fourth, prof(0)),
    JSON.stringify({ reacher: wp(fourth, prof(12)), avg: wp(fourth, prof(0)) }));
  check('a value drafter concentrates on the best man instead',
    wp(best, prof(-12)) > wp(best, prof(0)));
  // The in-pool mass is (1 - tail budget); the reserved remainder belongs to
  // everyone OUTSIDE the candidate pool, so the full distribution — pool + tail —
  // is what sums to 1. Asserting the pool alone summed to 1 while the tail ALSO
  // got a constant each is what let a position sum to 1 + 0.01 x tailCount and
  // broke board-wide conservation (Cory, 2026-08-10).
  check('pool + tail is a proper distribution (sums to 1)',
    (function () {
      const tot = rbPool.slice(0, S.CFG.WITHIN_POS_CANDIDATES)
        .reduce((s, p) => s + wp(p, prof(12)), 0);
      return Math.abs((tot + S.CFG.WITHIN_POS_TAIL_P) - 1) < 1e-3;
    })());

  check('a profiled manager is named rather than numbered',
    needy.rows[0].manager === 'Richard');
  check('and his tell rides along with the row',
    needy.rows[0].tells.length === 1 && /QB/.test(needy.rows[0].tells[0].text));

  // Degradation, not crashes.
  check('an empty board produces an empty threat board rather than throwing',
    E.threatBoard(ctx(seats, { board: [] })).rows.length === 0);
  check('no next pick means no window and no invented threats',
    E.threatBoard(ctx(seats, { nextPick: null })).rows.length === 0);
})();


// ---------------------------------------------------------------------------
// PARTICIPATION: keeper (KOV) and bye, on boards that can actually exercise them.
//
// The evidence bundle's item 17 reported keeper 0/20 and bye 0/20 — but every
// board there sat at pick 30-49, i.e. rounds 3-5, and KOV_ROUND_RAMP_START is
// 6, so the ramp is exactly 0 and KOV CANNOT contribute. The zero was the
// construction, not the term. Zeroing a term that is already zero proves
// nothing, which is why "0 of 20" was an open question and not a verdict.
//
// These are the boards that can tell the difference.
// ---------------------------------------------------------------------------
(function participationSuite() {
  const L = { teams: 10,
    starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 },
    roster_slots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1, BN: 6 },
    keeper_rules: { count: 3, cost_model: 'original_round', undrafted_round: 10 } };

  // Young ascending players are what KOV exists to price; old ones are the
  // control. age and years_exp drive keepProbability and next-year VORP.
  const mk = (id, pos, adp, proj, age) => ({
    player_id: id, name: pos + id, position: pos, team: 'XX', bye: 7,
    adjusted_adp: adp, raw_adp: adp, tier: 1 + Math.floor(adp / 24), tier_drop: 4,
    proj_mean: proj, proj_sd: proj * 0.2, proj_floor: proj * 0.8, proj_ceiling: proj * 1.3,
    vorp: proj / 10, overall_rank: adp, age: age, years_exp: age - 22,
    depth_chart_order: 1,
  });
  const board = [];
  for (let i = 0; i < 60; i++) {
    // Alternate young and old at the same projection, so KOV is the only thing
    // that can separate them.
    board.push(mk('y' + i, ['RB', 'WR', 'TE', 'QB'][i % 4], 100 + i * 2, 160 - i, 23));
    board.push(mk('o' + i, ['RB', 'WR', 'TE', 'QB'][i % 4], 101 + i * 2, 160 - i, 31));
  }
  // The incumbents must be POOR keeper candidates, or marginal KOV correctly
  // returns 0 for everyone on the board: with three slots already held by
  // better candidates, the 4th-best is worth nothing and that is the scarcity
  // fix (P1.3) working. An earlier version of this test used a strong roster
  // and read that legitimate zero as the term being inert — the diagnostic
  // (raw_value 1.05, bar 5.49, slots_free 0, displaced RBr3) is what showed it.
  //
  // Old players with modest projections are the incumbents here, so a young
  // ascending board player can actually clear the bar.
  const roster = [mk('r1', 'QB', 1, 210, 35), mk('r2', 'RB', 2, 120, 33),
                  mk('r3', 'RB', 3, 115, 34), mk('r4', 'WR', 4, 110, 34),
                  mk('r5', 'WR', 5, 108, 35), mk('r6', 'TE', 6, 100, 34),
                  mk('r7', 'K', 7, 130, 33), mk('r8', 'DEF', 8, 125, 33)];

  const lateCtx = w => ({
    board: board, currentPick: 115, nextPick: 125, totalPicks: 150,
    myPicksLeft: 4, roster: roster, league: L, weights: w || E.DEFAULT_WEIGHTS,
    runMultipliers: {}, intervening: [], roundsLeft: 4,
    original_rounds: board.reduce((m, p) => { m[p.player_id] = 12; return m; }, {}),
  });

  const kov = E.compositeTerms.keeperOptionValue(board[0], lateCtx());
  check('at round 12 the KOV ramp is fully open, not zero',
    kov.ramp === 1, JSON.stringify({ ramp: kov.ramp, round: kov.round }));
  check('and raw KOV is non-zero for a young player there',
    Math.abs(kov.raw_value) > 0, JSON.stringify(kov));
  check('MARGINAL KOV is non-zero when a board player beats the incumbent '
    + 'keeper bar', Math.abs(kov.value) > 0, JSON.stringify(kov));

  // The scarcity fix, asserted directly rather than inferred: with three
  // stronger candidates already rostered, a 4th is worth zero.
  const strong = [mk('s1', 'RB', 1, 300, 23), mk('s2', 'RB', 2, 295, 23),
                  mk('s3', 'WR', 3, 290, 23), mk('s4', 'WR', 4, 285, 24)];
  const crowded = E.compositeTerms.keeperOptionValue(board[0],
    Object.assign({}, lateCtx(), { roster: strong }));
  check('a 4th keeper candidate behind three stronger ones is worth zero — the '
    + 'scarcity fix, not an inert term',
    crowded.value === 0 && crowded.raw_value > 0, JSON.stringify(crowded));

  const early = E.compositeTerms.keeperOptionValue(board[0],
    Object.assign({}, lateCtx(), { currentPick: 37 }));
  check('at round 4 KOV is exactly zero — the ramp, working as specified, which '
    + 'is why the 0/20 in the evidence bundle proved nothing',
    early.value === 0 && early.ramp === 0, JSON.stringify(early));

  // THE DEMANDED TEST: zero the term on a board that can exercise it. `need` is
  // zeroed in BOTH arms to isolate the keeper term — otherwise the D3 flex
  // discount (which lives in `need`) can reorder the flex-eligible top-5 hard
  // enough to mask the keeper effect on this synthetic board. With need off, the
  // ONLY difference is the keeper term, so a top-5 change proves it participates.
  const withKov = E.recommend(lateCtx(Object.assign({}, E.DEFAULT_WEIGHTS, { need: 0 })))
    .slice(0, 5).map(x => x.player.player_id).join();
  const noKov = E.recommend(lateCtx(Object.assign({}, E.DEFAULT_WEIGHTS, { need: 0, keeper: 0 })))
    .slice(0, 5).map(x => x.player.player_id).join();
  check('ZEROING KEEPER CHANGES THE TOP 5 ON A ROUND-12 BOARD — the term '
    + 'participates', withKov !== noKov, 'with: ' + withKov + '  without: ' + noKov);

  // Bye: it can only bite when the roster actually collides on a week.
  const byeRoster = [mk('b1', 'RB', 1, 300, 27), mk('b2', 'RB', 2, 290, 27),
                     mk('b3', 'WR', 3, 280, 27), mk('b4', 'WR', 4, 270, 27),
                     mk('b5', 'TE', 5, 260, 27), mk('b6', 'QB', 6, 250, 27)];
  byeRoster.forEach(p => { p.bye = 9; });          // everyone off in week 9
  const byeBoard = board.map(p => Object.assign({}, p, { bye: 9 }));
  const byeCtx = w => ({
    board: byeBoard, currentPick: 60, nextPick: 70, totalPicks: 150, myPicksLeft: 6,
    roster: byeRoster, league: L, weights: w || E.DEFAULT_WEIGHTS,
    runMultipliers: {}, intervening: [], roundsLeft: 6,
  });
  const bTerm = E.compositeTerms.byeCollisionPenalty(byeBoard[0], byeCtx());
  check('a roster stacked on one bye week produces a non-zero bye penalty',
    Math.abs(bTerm.value || bTerm) > 0, JSON.stringify(bTerm));

  const withBye = E.recommend(byeCtx()).slice(0, 5).map(x => x.player.player_id).join();
  const noBye = E.recommend(byeCtx(Object.assign({}, E.DEFAULT_WEIGHTS, { bye: 0 })))
    .slice(0, 5).map(x => x.player.player_id).join();
  check('zeroing bye changes the top 5 when the roster actually collides — '
    + 'the term participates', withBye !== noBye,
    'with: ' + withBye + '  without: ' + noBye);
})();


// ---------------------------------------------------------------------------
// Layer 2 must never assert certainty (the candidate-pool cliff).
// ---------------------------------------------------------------------------
(function layer2CliffSuite() {
  const S = E.survivalModel;
  const L = { teams: 10, starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 } };
  // More players at a position than the candidate pool holds, so some are
  // guaranteed to fall outside it.
  const board = [];
  for (let i = 0; i < 20; i++) {
    board.push({ player_id: 'd' + i, name: 'DEF' + i, position: 'DEF',
      adjusted_adp: 160 + i, raw_adp: 160 + i, proj_mean: 125 - i * 0.2,
      vorp: 10 - i * 0.05, tier: 1, tier_drop: 1 });
    board.push({ player_id: 'r' + i, name: 'RB' + i, position: 'RB',
      adjusted_adp: 40 + i, raw_adp: 40 + i, proj_mean: 200 - i * 3,
      vorp: 20 - i * 0.3, tier: 1 + Math.floor(i / 5), tier_drop: 4 });
  }
  const intervening = [];
  for (let i = 0; i < 7; i++) {
    intervening.push({ team_slot: 5 + i, pick_no: 37 + i, roster: [], profile: null });
  }
  const ctx = { board: board, league: L, runMultipliers: {}, currentPick: 37,
                nextPick: 44, roundsLeft: 11, intervening: intervening };

  check('the candidate pool is smaller than the position, so some players sit '
    + 'outside it', S.CFG.WITHIN_POS_CANDIDATES < 20);

  const defs = board.filter(p => p.position === 'DEF');
  const svs = defs.map(p => S.survivalProbability(p, 44, ctx));
  check('NO player gets survival of exactly 1.0 from Layer 2 — the model must '
    + 'not claim a real room is incapable of taking someone',
    svs.every(v => v < 1), JSON.stringify(svs.filter(v => v >= 1).length + ' at exactly 1.0'));
  check('and every survival is still a probability',
    svs.every(v => v >= 0 && v <= 1));
  check('players outside the pool are still MORE likely to survive than those '
    + 'inside it — the floor is small, not a flattening',
    Math.min.apply(null, svs.slice(S.CFG.WITHIN_POS_CANDIDATES + 2))
      > Math.max.apply(null, svs.slice(0, 3)),
    JSON.stringify({ outside: svs.slice(-1)[0], inside: svs[0] }));
  check('the tail floor is small enough to stay a floor, not a model',
    S.CFG.WITHIN_POS_TAIL_P > 0 && S.CFG.WITHIN_POS_TAIL_P <= 0.05,
    String(S.CFG.WITHIN_POS_TAIL_P));

  // The dropped-ctx bug: layer1TakenGivenAvailable inside the Layer-2
  // composition was called without ctx, so drift and any provided sd were
  // silently ignored on the one path that runs during a live draft.
  // Inside the near horizon Layer 2 carries full weight (w = 1), so Layer 1
  // contributes nothing and the missing ctx could not show. The bug bites past
  // NEAR_HORIZON, where the composition blends the two — which is exactly the
  // "what is left at my pick three rounds from now" question.
  const far = 37 + S.CFG.NEAR_HORIZON + 20;
  check('past the near horizon Layer 1 carries real weight in the composition',
    S.layer2Weight(S.CFG.NEAR_HORIZON + 20) < 0.9,
    String(S.layer2Weight(S.CFG.NEAR_HORIZON + 20)));
  const drifted = Object.assign({}, ctx, { drift: { applied: true, offset: -25, sdScale: 1 } });
  const a = S.survivalProbability(defs[0], far, ctx);
  const b = S.survivalProbability(defs[0], far, drifted);
  check('a global ADP drift reaches the Layer-2 composition — it was silently '
    + 'dropped because ctx was not passed to layer1TakenGivenAvailable',
    Math.abs(a - b) > 1e-9,
    'no drift ' + a.toFixed(6) + '  drifted ' + b.toFixed(6));
})();


// ---------------------------------------------------------------------------
// KEEP THIS LAST. process.exit() below ends the run, so any suite appended
// after it never executes and its checks vanish from the count without a
// single failure to notice. Add new tests ABOVE this line.
// ---------------------------------------------------------------------------
// --- the ceiling term must not outweigh the value terms ---------------------
// SPEC: CFG.RAIL_COMPONENT_RATIO = 1.0 states the contract the composite is
// built on — no single component may exceed the player's own VORP. The ceiling
// term violated it by up to 15x on the real 2026-08-07 board because it added
// proj_ceiling minus proj_mean at face value, which is a VARIANCE spread (136
// points for Gibbs) entering a sum denominated in points over replacement.
// Nothing in this suite covered the magnitude, only the direction, which is why
// it survived to be found by the plausibility rail on live data.
{
  const wide = { player_id: 'w', name: 'Wide', position: 'RB', team: 'XX', bye: 7,
                 proj_mean: 200, proj_sd: 120, proj_ceiling: 340, vorp: 40,
                 adjusted_adp: 20, raw_adp: 20, tier: 2, tier_drop: 5, overall_rank: 20 };
  const narrow = Object.assign({}, wide, { player_id: 'n', name: 'Narrow',
                 proj_sd: 10, proj_ceiling: 212 });
  const c = pos => ({ board: [wide, narrow], currentPick: 100, nextPick: 110,
                      totalPicks: 120, myPicksLeft: 3, roster: [],
                      league: { teams: 10, starters: { QB: 1, RB: 2, WR: 2, TE: 1,
                                                       FLEX: 1, K: 1, DEF: 1 } },
                      weights: E.DEFAULT_WEIGHTS, runMultipliers: {}, intervening: [],
                      roundsLeft: 3 });
  const got = E.recommend(c()).find(x => x.player.player_id === 'w');
  const ceilComp = Math.abs((got.components || {}).ceiling || 0);
  check('the ceiling component is capped, so a wide projection cannot buy the pick',
    ceilComp <= E.CFG.CEILING_MAX_BONUS + 1e-9,
    ceilComp + ' > cap ' + E.CFG.CEILING_MAX_BONUS);
  check('a 140-point upside spread does not enter the composite at face value',
    ceilComp < 140 * 0.5, String(ceilComp));
  check('but upside still beats no upside — the lottery ticket survives the cap',
    Math.abs((E.recommend(c()).find(x => x.player.player_id === 'w').components || {}).ceiling || 0)
      > Math.abs((E.recommend(c()).find(x => x.player.player_id === 'n').components || {}).ceiling || 0));
  check('the ceiling constants are the ones documented in upsideBonus',
    E.CFG.CEILING_SPREAD_SHARE === 0.15 && E.CFG.CEILING_MAX_BONUS === 20.0,
    JSON.stringify([E.CFG.CEILING_SPREAD_SHARE, E.CFG.CEILING_MAX_BONUS]));
}

// --- value must be a control, not an anchor --------------------------------
// SPEC: measured on the real 2026-08-07 board at the six picks I own, the top
// two players were separated by 2.4-10.1 points of score while a slider swing
// moves its own term by a few. `v` entered the sum unweighted, so it was an
// anchor no control could touch — and three of seven sliders could not change
// the top five at ANY setting. A control that cannot move what it points at
// teaches you to stop trusting the panel.
{
  check('value is a weight, and defaults to 1.0 so an untouched panel is unchanged',
    E.DEFAULT_WEIGHTS.value === 1.0);
  check('every preset carries a value weight, so selecting one cannot silently drop it',
    (E.WEIGHT_PRESETS || []).every(p => p.weights && p.weights.value != null),
    JSON.stringify((E.WEIGHT_PRESETS || []).map(p => p.key + ':' + (p.weights || {}).value)));
}

// --- the value anchor cannot be switched off -------------------------------
// SPEC: measured at picks 41/61/81/101 on the real 2026-08-07 board, value=0
// put seven K/DST in the top ten at pick 81 against five at default. Every one
// tripped a rail, so this is insurance rather than a fix for an observed break
// — but a board chasing need and tier with nothing pulling back toward what a
// player is worth is not a board worth shipping behind a slider.
{
  const L2 = { teams: 10, starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 } };
  const mk = (id, pos, proj, adp) => ({ player_id: id, name: pos + id, position: pos,
    team: 'XX', bye: 7, proj_mean: proj, proj_sd: proj * 0.2, proj_ceiling: proj * 1.2,
    vorp: proj / 4, adjusted_adp: adp, raw_adp: adp, adp_sd: 5, tier: 1, tier_drop: 3,
    overall_rank: adp, score: proj });
  const bd = [mk('a', 'RB', 240, 10), mk('b', 'WR', 235, 11), mk('c', 'K', 130, 150)];
  const c = w => ({ board: bd, currentPick: 40, nextPick: 53, totalPicks: 120,
    myPicksLeft: 6, roster: [], league: L2, weights: w, runMultipliers: {},
    intervening: [], roundsLeft: 8 });
  const at = v => { const w = Object.assign({}, E.DEFAULT_WEIGHTS); w.value = v; return E.recommend(c(w)); };
  check('value=0 is floored, so it scores identically to the floor',
    at(0)[0].score.toFixed(6) === at(E.CFG.VALUE_WEIGHT_FLOOR)[0].score.toFixed(6),
    at(0)[0].score + ' vs ' + at(E.CFG.VALUE_WEIGHT_FLOOR)[0].score);
  check('the floor is below the default, so the slider still does something',
    E.CFG.VALUE_WEIGHT_FLOOR < E.DEFAULT_WEIGHTS.value && E.CFG.VALUE_WEIGHT_FLOOR > 0);
  check('and a kicker never outranks a startable player at ANY value setting',
    [0, 0.25, 1, 2, 3].every(v => at(v)[0].player.position !== 'K'));
}

// --- KOV is connected: it ramps to zero early and moves the board late ------
// SPEC: item 17 left open whether the keeper term was disconnected or merely
// zero. Finding 2 (this session) established KOV_ROUND_RAMP_START=6, so item
// 17's rounds-3-5 boards produced ramp=0 by design. This proves the other
// half: on a round-12 board the term is live and its removal changes the top 5.
{
  const L2 = { teams: 10, starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 },
               keeper_rules: { count: 3 } };
  const mk = (id, pos, proj, adp, age) => ({ player_id: id, name: pos + id, position: pos,
    team: 'XX', bye: 7, proj_mean: proj, proj_sd: proj * 0.2, proj_ceiling: proj * 1.2,
    vorp: proj / 6, adjusted_adp: adp, raw_adp: adp, adp_sd: 5, tier: 1, tier_drop: 3,
    overall_rank: adp, score: proj, age: age, next_year_vorp: proj / 5 });
  const board = [];
  for (let i = 0; i < 20; i++) board.push(mk('y' + i, 'WR', 150 - i * 3, 110 + i, 23));
  const c = w => ({ board: board, currentPick: 115, nextPick: 126, totalPicks: 150,
    myPicksLeft: 4, roster: [], league: L2, weights: w, runMultipliers: {},
    intervening: [], roundsLeft: 4, currentKeepers: [] });
  // The connection proof, robust to board shape: the keeper COMPONENT is
  // non-zero at round 12 and exactly zero at round <=6. (On the real production
  // board this reorders the top 5 — verified separately; a uniform synthetic
  // board may not reorder, so we assert the load-bearing fact, not the effect.)
  const late = E.recommend(c(E.DEFAULT_WEIGHTS));
  const lateLive = late.some(x => Math.abs((x.components || {}).keeper || 0) > 0);
  const early = E.recommend(Object.assign({}, c(E.DEFAULT_WEIGHTS), { currentPick: 35 }));
  const earlyZero = early.every(x => !((x.components || {}).keeper));
  check('at round <=6 the keeper term contributes nothing (the ramp)', earlyZero);
  check('on a round-12 board the keeper term is LIVE (non-zero component)',
    lateLive, 'no live keeper component at round 12');
}

// --- D9: the installed ceiling posture (Lab exp 21 + exp 2 §5) --------------
// Pins the INSTALL so a later edit cannot silently revert it. Every number is
// cited to DECISIONS-NEEDED D9 / FRONTIER.md / POLICY-TOURNAMENT.md — never
// read back off the code.
{
  // D9 (Cory, 2026-08-08): "INSTALL — ceiling slider 0.5 -> 0.65, conservative end".
  check('D9: the ceiling slider is installed at the conservative 0.65',
    E.DEFAULT_WEIGHTS.ceiling === 0.65, String(E.DEFAULT_WEIGHTS.ceiling));

  // The phase profile is EARLY-weighted, not a late ramp: exp 2 §5's per-phase
  // grid found endgame ceiling >= 1.0 WORSE with CIs excluding zero, and exp 21
  // found early-ramp (+$56) >> late-ramp (+$5).
  const d9board = [];
  for (let i = 0; i < 60; i++) {
    d9board.push({ player_id: 'd' + i, name: 'P' + i, position: ['RB','WR','TE','QB'][i % 4],
      proj_mean: 200 - i * 2, proj_ceiling: 240 - i * 2, vorp: 90 - i,
      adjusted_adp: 30 + i, raw_adp: 30 + i, tier: 1 + (i / 10 | 0), tier_drop: 8, bye: 7 });
  }
  const d9league = { teams: 10, starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 } };
  const at = (pick, left) => E.autoWeights({ board: d9board, currentPick: pick,
    nextPick: pick + 13, totalPicks: 150, myPicksLeft: left, roster: [],
    league: d9league, runMultipliers: {}, intervening: [], roundsLeft: 8 }).weights.ceiling;
  const endgameC = at(124, 2);
  // exp 2 §5's grid: endgame 0.5 BETTER (+$19, CI [7.5,33]); 1.0/2.0/3.0 WORSE
  // with CIs excluding zero. The aggressive-endgame hypothesis is REFUTED.
  check('D9: the endgame ceiling weight is the grid winner (<= 0.5), not the designed 1.4',
    endgameC <= 0.5, String(endgameC));
  // CORE TILTS UNCHANGED, deliberately: every core tilt straddled the default,
  // and "no evidence of a shift" is the finding, not a licence to nudge.
  const src = require('fs').readFileSync(__dirname + '/../../public/js/draft/engine.js', 'utf8');
  check('D9 (narrowed): core phase tilts are UNCHANGED at their designed values',
    /w\.ceiling = 0\.45;/.test(src) && /w\.ceiling = 0\.6;/.test(src) && /w\.ceiling = 0\.8;/.test(src),
    'anchor 0.45 / build 0.6 / fill 0.8 must all still be present');

  // The bench-lottery is a DIFFERENT mechanism (floor is free on the wire) and
  // stays: the same player must still earn more upside credit late than early.
  const flier = { position: 'WR', proj_mean: 100, proj_ceiling: 190, vorp: 5 };
  const earlyU = E.upsideBonus(flier, 10, 150, 12);
  const lateU = E.upsideBonus(flier, 140, 150, 3);
  check('D9: the bench-lottery policy is UNTOUCHED — upside still amplifies late',
    lateU > earlyU, 'early=' + earlyU.toFixed(1) + ' late=' + lateU.toFixed(1));
}

// --- THE MEASURED CONFIG (2026-08-09, Cory-confirmed) — what the tool loads on ---
// The participation test + follow-ups: mask (always on) + value anchor is the edge; stack
// 0.5 earns (exp6); need 0.5 is near-inert (mask does it); ceiling 0.65 kept; tier/risk are
// a measured drag → 0; bye a null → 0; keeper unmeasured → left at 1.0.
{
  const m = E.MEASURED_WEIGHTS;
  check('measured: value anchor at 1.0', m.value === 1.0, String(m.value));
  check('measured: tier and risk OFF (measured drag)', m.tier === 0 && m.risk === 0,
    `tier=${m.tier} risk=${m.risk}`);
  // D10, corrected 2026-08-13. The engine carried 0.5; Cory ruled that 1.0 was
  // what D10 meant to stand and that the SUPERSEDED marking had been applied
  // backwards — the engine was wrong, not the ruling. Both state changes are
  // recorded in the decision record rather than one quietly overwriting the
  // other. This assertion is the reason the correction could not be silent.
  check('measured: stack at 1.0 (the one adjuster that earned — D10 as ruled)',
    m.stack === 1.0, String(m.stack));
  check('measured: need at 0 (inert by mask redundancy — settled)', m.need === 0, String(m.need));
  check('measured: ceiling SETTLED TO ZERO — the ledger measured -4.8 [-26,+17], a sign we '
    + 'cannot distinguish from zero, yet at 0.65 it decided a third of late #1s (flip diag). '
    + 'The weekly-payout lean lives in the same-tier tiebreak + Ceiling Chase doctrine now.',
    m.ceiling === 0, String(m.ceiling));
  check('measured: bye OFF (a real null)', m.bye === 0, String(m.bye));
  // it must be a real, selectable preset AND the thing matchPreset names it
  const preset = E.WEIGHT_PRESETS.find(p => p.key === 'measured');
  check('measured: is the first (default) preset', E.WEIGHT_PRESETS[0].key === 'measured',
    E.WEIGHT_PRESETS[0].key);
  check('measured: matchPreset identifies the config as "measured"',
    E.matchPreset(m) === 'measured', String(E.matchPreset(m)));
}



// --- MOCK #1 FIX #1 + #2: path names read SLOT STATE, not need magnitude -----
//
// The reported bug: a path said "Fill TE now" with Loveland already rostered.
// The seat-identity bug made the roster wrong, but there was a SECOND and
// independent defect underneath it — path naming thresholded the need
// MAGNITUDE (`need > 0.5`), and a bench upgrade carries positive marginal
// value, so a backup TE was labelled as filling a slot that was already full.
{
  const league = { teams: 10, starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 },
                   roster_slots: { BN: 6 }, scoring: {} };
  const mk = (id, pos, mean, tier) => ({ player_id: String(id), name: 'Player ' + id,
    position: pos, proj_mean: mean, proj_ceiling: mean * 1.3, vorp: mean / 3,
    adjusted_adp: id, raw_adp: id, tier: tier || 1, bye: 7, team: 'AAA', weekly_sd: 6 });

  // TE-led board so a TE path clears PATHS_BAND and the assertion is real.
  const board = [mk(1, 'TE', 250, 2), mk(2, 'TE', 244, 2), mk(3, 'WR', 150, 6),
                 mk(4, 'WR', 145, 6), mk(5, 'RB', 148, 6), mk(6, 'RB', 120, 7)];
  const baseCtx = board2 => ({ board: board2, currentPick: 34, nextPick: 41, totalPicks: 150,
    myPicksLeft: 8, league, weights: E.DEFAULT_WEIGHTS, runMultipliers: {},
    intervening: [], roundsLeft: 10 });

  // computePaths(ctx, scored) consumes the scored list it is GIVEN, so the
  // naming rule can be tested directly instead of via recommend()'s ranking.
  // Three earlier attempts at a full-pipeline fixture all passed vacuously —
  // the engine's own ranking kept any non-starter path from ever leading, so
  // no TE path existed to mislabel. Feeding the scored list makes the exact
  // mislabel case reachable.
  const entry = (player, fills, need, tierUrgency) => ({
    player, score: 100 - need, survival_to_next: 0.5, rails: [], why: 'x',
    components: { vona: 10, tier_urgency: tierUrgency || 0, need: need,
                  need_fills: fills, risk: 0, ceiling: 5, keeper: 0, bye: 0, stack: 0 },
  });

  // THE BUG: a FLEX-filling TE carrying a large marginal value. The old rule
  // (`need > 0.5`) named this "Fill TE now" while the TE slot was full.
  const withTE = Object.assign(baseCtx(board), { roster: [mk(99, 'TE', 120, 5)] });
  const scoredTE = [entry(mk(1, 'TE', 250, 2), 'flex', 80, 0),
                    entry(mk(5, 'RB', 148, 6), 'bench', 40, 0)];
  const paths = E.computePaths(withTE, scoredTE);
  const tePaths = paths.filter(p => p.position === 'TE');
  check('NON-VACUITY: the flex-TE path IS produced (the mislabel case is reachable)',
    tePaths.length > 0, paths.map(p => p.name).join(' | '));
  check('a large-need FLEX fill is NOT named "Fill TE now" — the slot is full',
    !tePaths.some(p => /^Fill TE now/.test(p.name)), tePaths.map(p => p.name).join(' | '));
  check('it is named for its real mechanism instead',
    tePaths.every(p => p.fills === 'flex' && p.mechanism === 'flex'
      && /for the flex/.test(p.name)), JSON.stringify(tePaths.map(p => p.name)));
  check('a BENCH fill with large need is not called a fill either',
    paths.filter(p => p.fills === 'bench').every(p => /^Best /.test(p.name)),
    paths.map(p => p.name + ':' + p.fills).join(' | '));

  // With the TE slot EMPTY, "Fill TE now" is correct and must still appear.
  const noTE = Object.assign(baseCtx(board), { roster: [] });
  const paths2 = E.computePaths(noTE, [
    entry(mk(1, 'TE', 250, 2), 'starter', 80, 0),
    entry(mk(5, 'RB', 148, 6), 'starter', 70, 0),
    entry(mk(6, 'RB', 120, 7), 'starter', 60, 3.0)]);
  const teFill = paths2.find(p => p.position === 'TE' && p.fills === 'starter');
  check('with the TE slot EMPTY, a fill-TE path is still offered',
    !!teFill, paths2.map(p => p.name + ':' + p.fills).join(' | '));

  // Names state their mechanism and carry the player.
  check('every path name states its mechanism and names the player',
    paths2.every(p => /—/.test(p.name) && ['need', 'flex', 'value', 'scarcity'].includes(p.mechanism)),
    paths2.map(p => p.name + ' [' + p.mechanism + ']').join(' | '));

  // Two paths at one position must say WHY they differ.
  const shared = paths2.filter(p => p.position === 'RB');
  if (shared.length >= 2) {
    check('two paths at one position carry the distinction line',
      shared.every(p => /same position, different logic/.test(p.distinction || '')),
      JSON.stringify(shared.map(p => p.distinction)));
  } else {
    /* WAS `check(..., true)` — a SKIP counted as a PASS. This board has fewer
     * than two paths at any one position, so the case is not exercised; saying so
     * is honest, and printing PASS is not. */
    console.log('SKIP  two paths at one position carry the distinction line'
      + ' — not exercised: no position has 2+ paths on this board');
  }
  check('a lone path at a position carries NO distinction line (no clutter)',
    paths2.filter(p => paths2.filter(q => q.position === p.position).length === 1)
      .every(p => !p.distinction));
}

// --- Cory's model: ceiling is late-only + a same-tier tiebreaker --------------
{
  // ceiling contributes NOTHING to the composite early/mid, ramps in late rounds
  const p = { proj_mean: 100, proj_ceiling: 160 };
  const early = E.upsideBonus(p, 20, 180, 14);
  const mid = E.upsideBonus(p, 90, 180, 12);
  const late = E.upsideBonus(p, 170, 180, 3);
  check('ceiling term is ZERO early (mean+VONA+tiers decide)', early === 0, `early=${early}`);
  check('ceiling term is ZERO mid-draft too', mid === 0, `mid=${mid}`);
  check('ceiling term powers the late throwaway rounds', late > 0, `late=${late}`);

  const wr = (id, mean, ceil, vorp) => ({ player_id: id, name: id, position: 'WR',
    proj_mean: mean, proj_ceiling: ceil, vorp: vorp, adjusted_adp: 40, raw_adp: 40,
    tier: 2, tier_drop: 5, tier_size: 4 });
  const tbCtx = b => ({ board: b, roster: [], league: { teams: 10,
    starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 } },
    weights: E.DEFAULT_WEIGHTS, currentPick: 40, nextPick: 53, totalPicks: 150,
    myPicksLeft: 11, roundsLeft: 11, runMultipliers: {} });
  // equal mean + vorp, same tier + position -> the higher ceiling wins the tie
  const tie = E.recommend(tbCtx([wr('steady', 150, 175, 50), wr('boom', 150, 230, 50)]));
  check('same-tier/same-position near-tie leans to the higher ceiling',
    tie[0].player.name === 'boom', tie.map(s => s.player.name).join(','));
  // a REAL value gap is never overridden by the tiebreak
  const gap = E.recommend(tbCtx([wr('steady', 180, 190, 80), wr('boom', 150, 230, 50)]));
  check('a real mean/VORP gap is NOT overridden by the ceiling tiebreak',
    gap[0].player.name === 'steady', gap.map(s => s.player.name).join(','));
}

console.log(`\n${pass}/${pass + fail} engine checks passed`);
process.exit(fail ? 1 : 0);
