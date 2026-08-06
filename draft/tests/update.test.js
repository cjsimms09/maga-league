/* Acceptance tests for the A2/A3 update. Run: node draft/tests/update.test.js */
const S = require('../../public/js/draft/survival.js');
const C = require('../../public/js/draft/composite.js');
const E = require('../../public/js/draft/engine.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const LEAGUE = {
  teams: 10, rounds: 15,
  starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 },
  keeper_rules: { count: 3, cost_model: 'original_round', undrafted_rule: 'assigned_round', undrafted_round: 10 },
};

function board() {
  const out = [];
  let id = 0;
  // VORP spreads differ hugely by position in a real league: elite RB/WR are
  // worth ~90 over replacement, while K1 is worth ~3 over K12. A fixture that
  // gives kickers RB-sized VORP will produce nonsense downstream.
  const SHAPE = { RB: [90, 7], WR: [85, 6], QB: [45, 3.5], TE: [55, 5], K: [4, 0.4], DEF: [6, 0.6] };
  [['RB', 22], ['WR', 26], ['QB', 12], ['TE', 12], ['K', 6], ['DEF', 6]].forEach(([pos, n]) => {
    for (let i = 0; i < n; i++) {
      const [top, step] = SHAPE[pos];
      out.push({
        player_id: pos + (++id), name: pos + ' ' + (i + 1), position: pos, team: 'T' + (i % 8),
        proj_mean: 260 - i * 7, vorp: top - i * step, replacement: 120,
        adjusted_adp: 4 + i * 4.5 + (pos === 'QB' ? 25 : pos === 'K' || pos === 'DEF' ? 110 : 0),
        raw_adp: 4 + i * 4.5, tier: 1 + Math.floor(i / 4), tier_drop: 14, tier_size: 4, tier_rank: (i % 4) + 1,
        proj_ceiling: 320 - i * 7, bye: 6 + (i % 8), age: 25, years_exp: 3, games_expected: 15,
      });
    }
  });
  return out;
}

// ============ ACCEPTANCE: RB-need survival drops vs ADP-only ============
// "With all intervening teams needing RB, RB survival drops measurably vs the
//  old ADP-only model."
const B = board();
// The target must be someone ADP expects to SURVIVE to my next pick (ADP ~45
// against a target pick of 32). Picking a player ADP already has ~100% gone
// leaves no headroom and the test proves nothing about the need layer.
const targetRb = B.filter(p => p.position === 'RB' && p.adjusted_adp > 40 && p.adjusted_adp < 60)[0];

function intervening(needPosition) {
  // 10 teams pick between my pick 20 and my next pick 32.
  const rows = [];
  for (let i = 0; i < 12; i++) {
    // A team "needing RB" has its RB slots empty and everything else filled.
    const roster = needPosition === 'RB'
      ? [{ position: 'QB', team: 'X' }, { position: 'WR', team: 'X' }, { position: 'WR', team: 'X' },
         { position: 'TE', team: 'X' }]
      : [{ position: 'RB', team: 'X' }, { position: 'RB', team: 'X' }, { position: 'RB', team: 'X' },
         { position: 'WR', team: 'X' }, { position: 'WR', team: 'X' }];
    rows.push({ team_slot: i + 1, pick_no: 20 + i, roster, profile: null });
  }
  return rows;
}

const ctxBase = { board: B, league: LEAGUE, currentPick: 20, totalPicks: 150, roundsLeft: 12 };
const adpOnly = S.survivalProbability(targetRb, 32, {});
const rbNeeded = S.survivalProbability(targetRb, 32, Object.assign({}, ctxBase, { intervening: intervening('RB') }));
const rbNotNeeded = S.survivalProbability(targetRb, 32, Object.assign({}, ctxBase, { intervening: intervening('WR') }));

check('ADP alone expects this RB to survive (headroom to test against)', adpOnly > 0.5,
  `adp-only=${adpOnly.toFixed(3)}`);
check('RB survival drops when every intervening team needs RB', rbNeeded < adpOnly,
  `adp-only=${adpOnly.toFixed(3)} rb-needed=${rbNeeded.toFixed(3)}`);
check('the drop is measurable, not noise', adpOnly - rbNeeded > 0.05,
  `drop=${(adpOnly - rbNeeded).toFixed(3)}`);
check('RB survives better when nobody needs RB', rbNotNeeded > rbNeeded,
  `needed=${rbNeeded.toFixed(3)} not-needed=${rbNotNeeded.toFixed(3)}`);

// ============ ACCEPTANCE: monotonic survival survives the refactor ============
const monoAdp = [];
const monoLayered = [];
for (let pick = 21; pick <= 140; pick += 4) {
  monoAdp.push(S.survivalProbability(targetRb, pick, {}));
  monoLayered.push(S.survivalProbability(targetRb, pick,
    Object.assign({}, ctxBase, { intervening: intervening('RB') })));
}
check('ADP-only survival still declines monotonically',
  monoAdp.every((p, i) => i === 0 || p <= monoAdp[i - 1] + 1e-9));
check('three-layer survival declines monotonically',
  monoLayered.every((p, i) => i === 0 || p <= monoLayered[i - 1] + 1e-9),
  JSON.stringify(monoLayered.map(x => +x.toFixed(3))));
check('survival stays in [0,1] across the whole range',
  monoLayered.every(p => p >= 0 && p <= 1));

// blend decay: layer 2 fully trusted near, decayed far
check('layer-2 weight is 1 inside the near horizon', S.layer2Weight(10) === 1);
check('layer-2 weight decays past the horizon', S.layer2Weight(60) < 0.1 && S.layer2Weight(30) < 1);

// need model sanity
const needy = { team_slot: 1, pick_no: 21, roster: [{ position: 'QB' }, { position: 'WR' }, { position: 'WR' }, { position: 'TE' }] };
const probs = S.positionProbabilities(needy, B, { league: LEAGUE, progress: 0.25, roundsLeft: 12 });
check('position probabilities form a distribution',
  Math.abs(Object.values(probs).reduce((a, b) => a + b, 0) - 1) < 1e-6);
check('an empty RB slot makes RB the likeliest position',
  Object.keys(probs).sort((a, b) => probs[b] - probs[a])[0] === 'RB', JSON.stringify(probs));
const lateCtx = { league: LEAGUE, progress: 0.95, roundsLeft: 1 };
const lateProbs = S.positionProbabilities(
  { team_slot: 1, pick_no: 145, roster: [{ position: 'QB' }, { position: 'RB' }, { position: 'RB' }, { position: 'WR' }, { position: 'WR' }, { position: 'TE' }] },
  B, lateCtx);
check('K/DST become forced picks in the final rounds',
  (lateProbs.K || 0) + (lateProbs.DEF || 0) > 0.5, JSON.stringify(lateProbs));

// ============ ACCEPTANCE: KOV age/round behaviour ============
const oldEarly = { player_id: 'a', position: 'RB', age: 30, years_exp: 8, vorp: 70,
  proj_mean: 220, adjusted_adp: 15, depth_chart_order: 1 };
const youngLate = { player_id: 'b', position: 'WR', age: 23, years_exp: 1, vorp: 12,
  proj_mean: 150, adjusted_adp: 128, depth_chart_order: 1, opportunity_z: 1.2 };

const kovOldEarly = C.keeperOptionValue(oldEarly, { league: LEAGUE, board: B, currentPick: 15 });   // round 2
const kovYoungLate = C.keeperOptionValue(youngLate, { league: LEAGUE, board: B, currentPick: 128 }); // round 13

check('KOV ~ 0 for a 30-year-old drafted in round 2',
  Math.abs(kovOldEarly.value) < 0.01, `kov=${kovOldEarly.value.toFixed(2)} ramp=${kovOldEarly.ramp}`);
check('KOV is substantial for a 23-year-old drafted in round 13',
  kovYoungLate.value > 5, `kov=${kovYoungLate.value.toFixed(2)} p_keep=${kovYoungLate.p_keep.toFixed(2)}`);
check('the young late pick is far likelier to be kept',
  C.keepProbability(youngLate, 13, LEAGUE) > C.keepProbability(oldEarly, 2, LEAGUE) + 0.3,
  `young=${C.keepProbability(youngLate, 13, LEAGUE).toFixed(2)} old=${C.keepProbability(oldEarly, 2, LEAGUE).toFixed(2)}`);
check('next-year VORP ages a 30yo RB down and a 23yo WR up',
  C.nextYearVorp(oldEarly) < oldEarly.vorp && C.nextYearVorp(youngLate) >= youngLate.vorp);

// ============ bye collisions ============
const byeGuy = { position: 'RB', bye: 9, proj_mean: 210, replacement: 120, games_expected: 15, vorp: 90 };
const noCollision = C.byeCollisionPenalty(byeGuy, { league: LEAGUE, roster: [{ position: 'RB', bye: 5 }, { position: 'RB', bye: 7 }] });
const collision = C.byeCollisionPenalty(byeGuy, { league: LEAGUE, roster: [{ position: 'RB', bye: 9 }, { position: 'RB', bye: 9 }] });
check('no bye penalty when the week is covered', noCollision.value === 0, JSON.stringify(noCollision));
check('bye penalty fires when starters share a bye', collision.value > 0, JSON.stringify(collision));
check('bye penalty is computed, not a constant',
  C.byeCollisionPenalty(Object.assign({}, byeGuy, { proj_mean: 400 }),
    { league: LEAGUE, roster: [{ position: 'RB', bye: 9 }, { position: 'RB', bye: 9 }] }).value > collision.value);

// ============ correlation ============
const qb = { position: 'QB', team: 'KC', proj_mean: 300 };
const wr = { position: 'WR', team: 'KC', proj_mean: 200 };
const stackUp = C.correlationAdjustment(wr, { league: LEAGUE, roster: [qb], currentPick: 70 });
const cannibal = C.correlationAdjustment(wr, { league: LEAGUE, roster: [{ position: 'WR', team: 'KC' }], currentPick: 70 });
check('stacking a pass-catcher with your QB is a positive', stackUp.value > 0, JSON.stringify(stackUp));
check('a second target earner from the same team is a negative', cannibal.value < 0, JSON.stringify(cannibal));
check('correlation stays modest in redraft', Math.abs(stackUp.value) < 15);

// ============ composite integration ============
const ctx = {
  board: B, nextPick: 32, currentPick: 20, totalPicks: 150, myPicksLeft: 11,
  roster: [], league: LEAGUE, weights: E.DEFAULT_WEIGHTS,
  intervening: intervening('RB'), roundsLeft: 12,
};
const scored = E.recommend(ctx);
check('composite runs end to end with all seven terms', scored.length === B.length);
check('new components are exposed for auditing',
  ['keeper', 'bye', 'stack'].every(k => typeof scored[0].components[k] === 'number'));
check('weighted breakdown includes the new terms',
  ['keeper', 'bye', 'stack'].every(k => typeof scored[0].components.weighted[k] === 'number'));

// KOV weight actually moves late-round rankings
const lateCtxFull = Object.assign({}, ctx, { currentPick: 128, nextPick: 140, myPicksLeft: 3 });
const kovOff = E.recommend(Object.assign({}, lateCtxFull, { weights: Object.assign({}, E.DEFAULT_WEIGHTS, { keeper: 0 }) }));
const kovOn = E.recommend(Object.assign({}, lateCtxFull, { weights: Object.assign({}, E.DEFAULT_WEIGHTS, { keeper: 3 }) }));
check('the keeper weight changes late-round scoring',
  kovOff[0].score !== kovOn[0].score || kovOff[0].player.player_id !== kovOn[0].player.player_id);

console.log(`\n${pass}/${pass + fail} update checks passed`);
process.exit(fail ? 1 : 0);
