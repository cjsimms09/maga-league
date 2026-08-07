/* MCTS draft advisor: value function, search, and the ship conditions.
 * Run: node draft/tests/mcts.test.js
 */
const V = require('../../public/js/draft/value.js');
const M = require('../../public/js/draft/mcts.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}
const approx = (a, b, eps) => Math.abs(a - b) < (eps == null ? 0.01 : eps);

const LEAGUE = { teams: 10, starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 },
                 roster_slots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1, BN: 6 } };

function makeBoard() {
  const board = [];
  let id = 0;
  const spec = { RB: 40, WR: 40, QB: 18, TE: 18, K: 12, DEF: 12 };
  Object.keys(spec).forEach(function (pos) {
    for (let i = 0; i < spec[pos]; i++) {
      const base = { RB: 300, WR: 290, QB: 320, TE: 250, K: 130, DEF: 125 }[pos];
      const mean = base - i * (pos === 'K' || pos === 'DEF' ? 1.5 : 7);
      board.push({
        player_id: 'p' + (++id), name: pos + i, position: pos, team: 'XX', bye: 7,
        proj_mean: mean, proj_sd: mean * 0.2, vorp: mean / 10,
        adjusted_adp: id, raw_adp: id, tier: 1 + Math.floor(i / 6), tier_drop: 4,
        score: mean,                                  // stands in for q_score
      });
    }
  });
  // The search expects the board sorted by score descending.
  board.sort(function (a, b) { return b.score - a.score; });
  return board;
}

function makeCtx(over) {
  const board = makeBoard();
  // Ten seats, snake, me at slot 4. The schedule always BEGINS at my pick —
  // the root is my decision, and a search rooted on somebody else's pick would
  // present a prediction of their behaviour as advice to me.
  const all = [];
  let pick = 1;
  for (let round = 0; round < 7; round++) {
    const order = round % 2 === 0 ? [1,2,3,4,5,6,7,8,9,10] : [10,9,8,7,6,5,4,3,2,1];
    order.forEach(function (slot) {
      all.push({ team_slot: slot, pick_no: pick++, roster: [], profile: null });
    });
  }
  const schedule = all.slice(all.findIndex(function (t) { return t.team_slot === 4; }));
  return Object.assign({
    board: board,
    league: LEAGUE,
    myRoster: [],
    mySlot: 4,
    myPicksLeft: 6,
    schedule: schedule,
    valuer: V.makeValuer({ league: LEAGUE, players: board }),
    blocked: new Set(),
    seed: 7,
    runMultipliers: {}, roundsLeft: 6, progress: 0.2,
  }, over || {});
}

// ---------------------------------------------------------------------------
// The value function — ONE scoring path, reusing StarterSlotMarginal's parts
// ---------------------------------------------------------------------------
{
  const board = makeBoard();
  const rep = V.replacementLevels(board, LEAGUE);
  const pick = (pos, n) => board.filter(p => p.position === pos)[n];
  const legal = [pick('QB', 0), pick('RB', 0), pick('RB', 1), pick('WR', 0), pick('WR', 1),
                 pick('TE', 0), pick('RB', 2), pick('K', 0), pick('DEF', 0)];

  check('V is the optimal legal lineup in projected points, nothing invented',
    Math.abs(V.bestLineup(legal, LEAGUE, rep).points
      - legal.reduce((s, p) => s + p.proj_mean, 0)) < 1e-9);
  check('an unfilled slot is filled at replacement level, not at zero',
    V.bestLineup(legal.filter(p => p.position !== 'K'), LEAGUE, rep).points
      > V.bestLineup(legal, LEAGUE, rep).points - pick('K', 0).proj_mean - 1);
  check('and the unfilled slot is reported by name',
    V.bestLineup(legal.filter(p => p.position !== 'K'), LEAGUE, rep).unfilled.indexOf('K') >= 0);
  check('a surplus receiver fills the FLEX rather than being wasted',
    V.bestLineup([pick('WR', 0), pick('WR', 1), pick('WR', 2)], LEAGUE, rep).points
      > V.bestLineup([pick('WR', 0), pick('WR', 1)], LEAGUE, rep).points);
  check('a better player at the same slot is always worth more',
    V.bestLineup([pick('RB', 0)], LEAGUE, rep).points
      > V.bestLineup([pick('RB', 5)], LEAGUE, rep).points);

  const valuer = V.makeValuer({ league: LEAGUE, players: board });
  check('the valuer is deterministic',
    valuer.evaluate(legal) === valuer.evaluate(legal));
  check('the cache is order-insensitive — a roster is a SET',
    (function () {
      const v = V.makeValuer({ league: LEAGUE, players: board });
      v.evaluate(legal); v.evaluate(legal.slice().reverse());
      return v.stats().misses === 1 && v.stats().hits === 1;
    })());
  check('a cache hit returns a bit-identical value to recomputing',
    valuer.evaluate(legal) === V.bestLineup(legal, LEAGUE, rep).points);

  // NORMALISATION — the silent breaker.
  const r = valuer.calibrate([], board, 6);
  check('calibration produces a real range for THIS decision',
    r.hi > r.lo && r.lo >= 0, JSON.stringify(r));
  check('raw V is on the point scale that would break UCT',
    valuer.evaluate(legal) > 1000, String(valuer.evaluate(legal)));
  check('normalised V is in [0,1], where c=1.2 of exploration means something',
    (function () {
      const n = valuer.normalized(legal);
      return n >= 0 && n <= 1;
    })(), String(valuer.normalized(legal)));
  check('the floor of the range is the roster with nothing else drafted',
    Math.abs(r.lo - valuer.evaluate([])) < 1e-9);
  check('the ceiling is above the floor by a whole draft\'s worth of value',
    (r.hi - r.lo) > 100, String(r.hi - r.lo));
  check('normalisation is monotone in raw value',
    valuer.normalizeValue(r.lo) === 0 && valuer.normalizeValue(r.hi) === 1
      && valuer.normalizeValue((r.lo + r.hi) / 2) > 0.4);
  check('and it clamps rather than escaping [0,1]',
    valuer.normalizeValue(r.hi * 10) === 1 && valuer.normalizeValue(-999) === 0);

  // The card has to say what V cannot see.
  const d = valuer.describe();
  check('the valuer states its own objective and its blind spot',
    /expected points/.test(d.objective) && /variance/.test(d.blindTo), JSON.stringify(d));
}

// ---------------------------------------------------------------------------
// Candidate generation — "this determines whether the search can think"
// ---------------------------------------------------------------------------
{
  const ctx = makeCtx();
  const top = M.candidates(ctx.board, [], LEAGUE, { k: 8 });
  check('the action set is K wide, not the whole board',
    top.length >= 8 && top.length <= 14, String(top.length));
  check('and it leads with the best available by score',
    top[0] === ctx.board[0]);

  // THE RULE THAT MATTERS: without forcing K/DST in near the end, the search
  // can never discover onesie timing — the exact question it exists to answer.
  // A roster that already HAS a K and DEF does not need one force-included by
  // the legal-lineup rule, so this isolates the endgame rule on its own.
  const pk = (pos, n) => ctx.board.filter(p => p.position === pos)[n];
  const hasOnesies = [pk('K', 0), pk('DEF', 0)];
  const noEnd = M.candidates(ctx.board, hasOnesies, LEAGUE, { k: 8, endgame: false });
  const end = M.candidates(ctx.board, hasOnesies, LEAGUE, { k: 8, endgame: true });
  check('a second kicker is NOT in the ordinary action set',
    !noEnd.some(p => p.position === 'K'), noEnd.map(p => p.position).join(','));
  check('but K and DEF appear once the endgame is within reach — otherwise '
    + 'onesie timing is undiscoverable',
    end.some(p => p.position === 'K') && end.some(p => p.position === 'DEF'));
  check('and with an EMPTY roster a kicker is proposed anyway, because a legal '
    + 'lineup needs one — the rule that keeps a points-V out of an illegal roster',
    M.candidates(ctx.board, [], LEAGUE, { k: 8 }).some(p => p.position === 'K'));

  // A team that needs a TE must be able to consider one even if no TE is top-8.
  const needy = M.candidates(ctx.board, [], LEAGUE, { k: 3 });
  check('the best available at every unfilled position is always a candidate',
    ['QB', 'RB', 'WR', 'TE'].every(pos => needy.some(p => p.position === pos)),
    needy.map(p => p.position).join(','));
  check('candidates are never duplicated',
    new Set(top.map(p => p.player_id)).size === top.length);
}

// ---------------------------------------------------------------------------
// Legality — the hard filter, not a weight
// ---------------------------------------------------------------------------
{
  const ctx = makeCtx();
  const pick = (pos, n) => ctx.board.filter(p => p.position === pos)[n];
  // Two picks left, no K and no DEF: only K and DEF are legal moves.
  const roster = [pick('QB', 0), pick('RB', 0), pick('RB', 1), pick('WR', 0),
                  pick('WR', 1), pick('TE', 0), pick('RB', 2)];
  const cands = M.candidates(ctx.board, roster, LEAGUE, { k: 8, endgame: true });
  const legal = M.legalActions(cands, roster, LEAGUE, 2, new Set());
  check('with 2 picks left and 2 mandatory holes, only K and DEF are legal',
    legal.length > 0 && legal.every(p => p.position === 'K' || p.position === 'DEF'),
    legal.map(p => p.position).join(','));
  check('with 5 picks left the same roster is free to take anyone',
    M.legalActions(cands, roster, LEAGUE, 5, new Set()).some(p => p.position === 'RB'));
  check('a do-not-draft player is never a legal action, at any point',
    !M.legalActions(cands, roster, LEAGUE, 9,
      new Set([cands[0].player_id])).some(p => p.player_id === cands[0].player_id));
  check('unmetNeeds sees a FLEX hole, not just dedicated slots',
    M.unmetNeeds([pick('QB', 0), pick('RB', 0), pick('RB', 1), pick('WR', 0), pick('WR', 1),
                  pick('TE', 0), pick('K', 0), pick('DEF', 0)], LEAGUE).RB >= 1);
  check('a full legal lineup has no unmet needs',
    Object.keys(M.unmetNeeds(roster.concat([pick('K', 0), pick('DEF', 0)]), LEAGUE)).length === 0);
}

// ---------------------------------------------------------------------------
// The search itself
// ---------------------------------------------------------------------------
{
  const s = M.createSearch(makeCtx());
  const out = s.run(600);
  check('the search runs and returns a recommendation',
    out.actions.length > 0 && out.iterations === 600, JSON.stringify(out.iterations));
  check('root visit shares sum to 1',
    approx(out.actions.reduce((a, r) => a + r.share, 0), 1, 1e-6));
  check('every action was tried at least once before any was dismissed',
    out.actions.every(r => r.visits > 0), JSON.stringify(out.actions.map(r => r.visits)));
  check('the recommendation is the most-visited root action',
    out.actions[0].visits >= out.actions[1].visits);
  check('Q values are probabilities, not points',
    out.actions.every(r => r.q >= 0 && r.q <= 1), JSON.stringify(out.actions.map(r => r.q)));
  check('the node cap was not hit on a normal search', out.capHit === false);

  // Reproducibility ship condition.
  const a = M.createSearch(makeCtx({ seed: 99 })).run(400);
  const b = M.createSearch(makeCtx({ seed: 99 })).run(400);
  check('same seed and same state give a bit-identical recommendation',
    a.actions[0].player.player_id === b.actions[0].player.player_id
      && a.actions[0].visits === b.actions[0].visits
      && a.actions[0].q === b.actions[0].q,
    a.actions[0].player.player_id + '/' + a.actions[0].visits
      + ' vs ' + b.actions[0].player.player_id + '/' + b.actions[0].visits);
  const c = M.createSearch(makeCtx({ seed: 100 })).run(400);
  check('a different seed explores differently (the search is genuinely stochastic)',
    JSON.stringify(a.actions.map(r => r.visits)) !== JSON.stringify(c.actions.map(r => r.visits)));

  // ENDGAME: with only mandatory holes left, it must recommend one of them.
  const ctx2 = makeCtx();
  const pick = (pos, n) => ctx2.board.filter(p => p.position === pos)[n];
  ctx2.myRoster = [pick('QB', 0), pick('RB', 0), pick('RB', 1), pick('WR', 0),
                   pick('WR', 1), pick('TE', 0), pick('RB', 2)];
  ctx2.board = ctx2.board.filter(p => ctx2.myRoster.indexOf(p) < 0);
  ctx2.myPicksLeft = 2;
  const endOut = M.createSearch(ctx2).run(300);
  check('at the forced-pick boundary the search recommends K or DEF, never a fourth WR',
    ['K', 'DEF'].indexOf(endOut.actions[0].player.position) >= 0,
    endOut.actions[0].player.position);
  check('and no illegal action is even present in the tree',
    endOut.actions.every(r => ['K', 'DEF'].indexOf(r.player.position) >= 0));
}

// --- UCT must actually explore: the normalisation regression test -----------
{
  // Equal-value children must SPREAD visits, not collapse onto one.
  //
  // This is the test for the silent breaker: with raw point-scale Q (~1,400)
  // and c=1.2, the exploration term is a rounding error and UCT degenerates
  // into greedy descent — the search looks busy and thinks nothing. Every
  // child here is worth the same, so a healthy search visits them evenly and a
  // broken one puts everything down the first branch it tried.
  const ctx = makeCtx();
  // NEAR-equal, not exactly equal. Exactly-equal children explore even with a
  // broken scale, because the Q terms cancel and the sqrt term decides by
  // default — so a flat board would pass this test for the wrong reason.
  // Small real differences are the realistic case AND the one that collapses:
  // a 5-point gap dwarfs c·√(ln N / n) ≈ 3, so raw Q descends greedily, while
  // the same gap normalised is ~0.01 and exploration wins.
  ctx.board = ctx.board.map((p, i) => Object.assign({}, p,
    { proj_mean: 200 - (i % 11) * 0.5, score: 200 - (i % 11) * 0.5 }));
  ctx.valuer = V.makeValuer({ league: LEAGUE, players: ctx.board });
  const s = M.createSearch(ctx);
  const out = s.run(800);
  const visits = out.actions.map(r => r.visits);
  const share = visits[0] / out.iterations;
  // Verified to FAIL when evaluate() returns raw points: 96% of visits go down
  // a single branch. That is the whole bug, caught.
  check('with near-equal children, visits spread across the action set '
    + 'instead of collapsing onto one', share < 0.6 && visits.filter(v => v > 10).length >= 3,
    JSON.stringify({ topShare: share.toFixed(2), visits: visits }));

  // And the direct statement of the bug: Q must be normalised, not raw points.
  check('Q values reaching UCT are normalised, not raw point sums',
    out.actions.every(r => r.q >= 0 && r.q <= 1),
    JSON.stringify(out.actions.map(r => r.q)));
}

// --- the root must be my decision -------------------------------------------
{
  const bad = makeCtx();
  bad.schedule = bad.schedule.slice(1);          // now starts on somebody else
  let threw = false;
  try { M.createSearch(bad); } catch (e) { threw = /must begin at my pick/.test(e.message); }
  check('a schedule that does not start at my pick is refused, not silently '
    + 'turned into advice about somebody else\'s turn', threw);
}

// --- chance nodes must SAMPLE, not take the argmax --------------------------
{
  // With a profiled opponent, the child visit distribution at a chance node
  // should follow the policy rather than collapsing onto one child.
  const ctx = makeCtx();
  ctx.schedule = ctx.schedule.map(t => Object.assign({}, t, {
    profile: t.team_slot === ctx.mySlot ? null
      : { name: 'M' + t.team_slot, sample_size: 3, shrinkage_weight: 0.6,
          softmax: { alpha_need: 1.0, beta_value: 1.0 } },
  }));
  const s = M.createSearch(ctx);
  s.run(1200);
  const I = s._internal;
  // Find a chance node with children and check it spread its visits.
  let spread = null;
  for (let n = 0; n < I.nodes.visits.length && !spread; n++) {
    const kids = I.childIndex[n];
    if (kids && kids.length >= 3 && !I.nodes.isMine[kids[0]]) {
      const visited = kids.filter(c => I.nodes.visits[c] > 0).length;
      if (I.nodes.visits[n] > 20) spread = { kids: kids.length, visited: visited };
    }
  }
  check('a chance node spreads its visits across opponents\' plausible picks '
    + 'rather than collapsing onto the modal one',
    !spread || spread.visited > 1, JSON.stringify(spread));
}

// --- tree reuse: SHIP CONDITION 3 -------------------------------------------
//
// Reuse is the path the tool actually lives on during a draft: every real pick
// promotes a subtree. Seed determinism is the easy half of condition 3; this is
// the half that matters, because if reuse diverged from a fresh search the
// recommendation would decay as the draft progressed and nothing would say so.
{
  const s = M.createSearch(makeCtx());
  const out = s.run(600);
  const target = out.actions[0];
  const hit = s.advance(target.player.player_id);
  check('a pick the generator proposed is found and promoted to root',
    hit.hit === true && hit.node != null);
  check('the promoted subtree KEEPS its accumulated visits — reuse that threw '
    + 'them away would be a rebuild wearing a disguise',
    hit.reused.visits === target.visits, JSON.stringify(hit.reused));
  check('and the value range is recalibrated for the new root, since fewer '
    + 'picks remain and less value is at stake',
    hit.recalibrated && (hit.recalibrated.to.hi - hit.recalibrated.to.lo)
      < (hit.recalibrated.from.hi - hit.recalibrated.from.lo),
    JSON.stringify(hit.recalibrated));

  const after = s.summary();
  check('after promotion the search reports from the new root, not the old one',
    after.iterations === target.visits
      && after.actions.every(r => r.player.player_id !== target.player.player_id),
    JSON.stringify({ iters: after.iterations, was: target.visits }));

  const miss = M.createSearch(makeCtx()).advance('nobody-at-all');
  check('a pick the generator never proposed is reported as a miss, not guessed at',
    miss.hit === false && miss.node === null);

  // EQUIVALENCE: a reused tree and a fresh tree from the SAME state must agree.
  //
  // The state has to actually match. Promoting my own pick leaves the root on
  // an OPPONENT's turn, nine picks before my next one — an earlier version of
  // this test compared that against a fresh search rooted on my next turn and
  // "found" a divergence that was entirely its own doing. So chain advance()
  // through the intervening picks, exactly as live sync would, and only then
  // compare.
  let guard = 0;
  while (!s.isMyTurn() && guard++ < 20) {
    const opts = s.options();
    if (!opts.length || !opts[0].player) break;
    s.run(60);                                  // grow the tree as sync would
    const step = s.advance(opts[0].player.player_id);
    if (!step.hit) break;
  }
  // The rescale arithmetic, checked directly rather than inferred.
  //
  // The equivalence test below tolerates 0.05 and cannot isolate this, but the
  // range genuinely drifts over a draft — measured on the real board, the span
  // falls from 548 to 424 and the floor rises by 98 points across ten picks. A
  // retained mean carried at the old scale would be ~0.23 out in normalised
  // units by then, which is larger than most gaps the search is deciding.
  (function () {
    const s2 = M.createSearch(makeCtx());
    s2.run(400);
    const before = s2.summary().actions[0];
    const h = s2.advance(before.player.player_id);
    const oldSpan = h.recalibrated.from.hi - h.recalibrated.from.lo;
    const newSpan = h.recalibrated.to.hi - h.recalibrated.to.lo;
    const rawMean = before.q * oldSpan + h.recalibrated.from.lo;
    let want = (rawMean - h.recalibrated.to.lo) / newSpan;
    want = want < 0 ? 0 : (want > 1 ? 1 : want);
    const got = s2.summary().rootValue;
    check('a retained mean is rescaled from the old range into the new one, '
      + 'so pre- and post-promotion iterations stay commensurable',
      Math.abs(got - want) < 1e-9, 'got ' + got + ' want ' + want);
  })();

  check('advance() chains through the intervening picks back to my turn',
    s.isMyTurn(), 'guard=' + guard);

  const reusedState = s.rootState();
  s.run(1500);
  const reusedSummary = s.summary();
  const reusedTop = reusedSummary.actions[0];

  const freshCtx = makeCtx();
  freshCtx.board = reusedState.board.slice();
  freshCtx.myRoster = reusedState.myRoster.slice();
  freshCtx.myPicksLeft = 6 - reusedState.myRoster.length;
  freshCtx.schedule = freshCtx.schedule.slice(reusedState.step);
  const fresh = M.createSearch(freshCtx);
  fresh.run(reusedSummary.iterations + 1500);
  const freshTop = fresh.summary().actions[0];

  check('a promoted subtree and a fresh search from the same state agree on '
    + 'the recommendation — reuse is not slowly poisoning the answer',
    reusedTop.player.player_id === freshTop.player.player_id,
    'reused ' + reusedTop.player.name + ' (' + (reusedTop.share * 100).toFixed(0)
      + '%) vs fresh ' + freshTop.player.name + ' (' + (freshTop.share * 100).toFixed(0) + '%)');
  check('...and on the value of that recommendation, within tolerance — which '
    + 'is what the rescale-on-promotion exists to guarantee',
    Math.abs(reusedTop.q - freshTop.q) < 0.05,
    'q ' + reusedTop.q.toFixed(4) + ' vs ' + freshTop.q.toFixed(4));
}

// --- node cap degrades to deepening, does not crash -------------------------
{
  const ctx = makeCtx();
  ctx.cfg = { MAX_NODES: 60, EXPAND_AT: 1 };
  const s = M.createSearch(ctx);
  const out = s.run(300);
  check('hitting the node cap is reported, not silent',
    out.capHit === true && out.nodes <= 70, JSON.stringify({ cap: out.capHit, n: out.nodes }));
  check('and the search still returns a usable recommendation',
    out.actions.length > 0 && out.iterations === 300);
}

// --- degradation ------------------------------------------------------------
{
  const empty = M.createSearch(makeCtx({ board: [] })).run(50);
  check('an empty board returns no actions rather than throwing',
    empty.actions.length === 0);
  const noSched = M.createSearch(makeCtx({ schedule: [] })).run(50);
  check('an empty schedule (my last pick) degrades cleanly',
    noSched.actions.length === 0);
}

// --- the explanation is what makes the card trustworthy ---------------------
{
  const s = M.createSearch(makeCtx());
  const out = s.run(600);
  const ex = M.explain(s, out, LEAGUE);
  check('the search explains itself in a sentence, naming both options',
    ex && /prefers/.test(ex.text) && ex.text.indexOf(out.actions[0].player.name) >= 0,
    ex && ex.text);
  // This test previously REQUIRED the string "P(top-2)" — it was enforcing a
  // mislabel. Q is the normalised interim value, a position within this
  // decision's own range, not a probability of anything. Asserting it is NOT
  // presented as a probability is the check that matters.
  check('it quotes the visit share and does NOT dress the normalised value up '
    + 'as a probability',
    /% of playouts/.test(ex.text) && !/P\(top-2\)/.test(ex.text)
      && !/probability/i.test(ex.text), ex.text);
  check('a single legal move says so instead of inventing a comparison',
    (function () {
      const one = M.explain(s, { actions: [out.actions[0]] }, LEAGUE);
      return /Only one legal move/.test(one.text);
    })());
}

console.log(`\n${pass}/${pass + fail} MCTS checks passed`);
process.exit(fail ? 1 : 0);
