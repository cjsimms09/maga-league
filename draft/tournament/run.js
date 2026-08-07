/* Self-play tournament — does the search earn its place?
 *
 * The 51 unit checks prove the search WORKS. They say nothing about whether it
 * is BETTER than greedy application of the same value function. That is the
 * ship question, and this is the only thing that answers it.
 *
 * The analysis is pre-registered in PREREGISTRATION.md, committed before this
 * script was ever run against outcomes. Read that first; this file is the
 * machinery, that file is the contract.
 *
 * Usage:
 *   node draft/tournament/run.js --pilot          timing only, no outcomes
 *   node draft/tournament/run.js --drafts 1000    the real thing
 *   node draft/tournament/run.js --jitter 0.2     rollout-perturbation arm
 */
'use strict';

const path = require('path');
const fs = require('fs');
const V = require('../../public/js/draft/value.js');
const M = require('../../public/js/draft/mcts.js');
const S = require('../../public/js/draft/survival.js');

// ---------------------------------------------------------------- arguments
const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? argv[i + 1] : dflt;
};
const has = name => argv.indexOf('--' + name) >= 0;

const OPTS = {
  drafts: parseInt(arg('drafts', '1000'), 10),
  iterations: parseInt(arg('iterations', '150'), 10),
  jitter: parseFloat(arg('jitter', '0')),
  pilot: has('pilot'),
  board: arg('board', path.join(__dirname, '..', '..', 'public', 'draft_data.json')),
  out: arg('out', path.join(__dirname, 'results.json')),
};

// ------------------------------------------------------------------ the board
const artifact = JSON.parse(fs.readFileSync(OPTS.board, 'utf8'));
const LEAGUE = artifact.league;
const TEAMS = LEAGUE.teams || 10;
const ROUNDS = Math.max(1, Math.round(((artifact.pick_order || {}).picks || []).length / TEAMS));
const PLAYERS = (artifact.players || []).filter(p => p.proj_mean > 0);

// The composite's own ordering. The artifact ships overall_rank from the same
// pipeline the board renders, so this is the board a person would be reading —
// not a second ranking invented for the tournament.
const BOARD = PLAYERS.slice().sort((a, b) =>
  (a.overall_rank || 1e9) - (b.overall_rank || 1e9));
const ADP_BOARD = PLAYERS.slice().sort((a, b) =>
  (a.adjusted_adp || 1e9) - (b.adjusted_adp || 1e9));

const REPLACEMENT = V.replacementLevels(PLAYERS, LEAGUE);

// ----------------------------------------------------------------------- rng
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------- schedule
function snakeOrder() {
  const out = [];
  let pick = 1;
  for (let r = 0; r < ROUNDS; r++) {
    const order = [];
    for (let s = 1; s <= TEAMS; s++) order.push(s);
    if (r % 2 === 1) order.reverse();
    order.forEach(slot => out.push({ team_slot: slot, pick_no: pick++, round: r + 1 }));
  }
  return out;
}
const SCHEDULE = snakeOrder();

// ------------------------------------------------------------------- policies
/* Opponents are STOCHASTIC, not deterministic.
 *
 * A room of deterministic greedy seats produces exactly one outcome per
 * (board, slot) pair, so a thousand drafts would be a thousand copies of ten
 * results and every p-value would be meaningless. Opponents therefore sample
 * from a softmax over their ranked candidate set: mostly the best available,
 * sometimes not — which is also a truer picture of a real room than nine
 * perfectly disciplined drafters.
 *
 * The same seed drives both arms of a pair, so the opponents make the same
 * draws given the same board state. That is what makes the comparison paired.
 */
const SOFTMAX_TEMP = 2.0;      // higher = more disciplined; 2.0 ~ takes top-3 most of the time

function rankedPolicy(rankBoard) {
  const rankOf = {};
  rankBoard.forEach((p, i) => { rankOf[p.player_id] = i; });
  return function (available, roster, picksLeft, rand) {
    const cands = M.legalActions(
      M.candidates(available, roster, LEAGUE,
        { k: 6, endgame: picksLeft <= M.CFG.ENDGAME_WITHIN }),
      roster, LEAGUE, picksLeft, null);
    if (!cands.length) return available[0];
    const best = Math.min.apply(null, cands.map(p => rankOf[p.player_id] == null ? 1e9 : rankOf[p.player_id]));
    const w = cands.map(p => Math.exp(-((rankOf[p.player_id] || 1e9) - best) / SOFTMAX_TEMP));
    let tot = 0; w.forEach(x => { tot += x; });
    let r = rand() * tot, acc = 0;
    for (let i = 0; i < cands.length; i++) { acc += w[i]; if (r <= acc) return cands[i]; }
    return cands[cands.length - 1];
  };
}

/* Greedy on V — "the value function's greedy application".
 *
 * This is the comparator the ship condition names. Losing to it means the
 * search adds nothing over simply maximising V one pick at a time. */
/* The baseline the search must beat. It does NOT reimplement argmax-V — it
 * calls the very function the search's own rollout plays, so the two cannot
 * drift. They did drift once (objective shared, choice set not) and the search
 * lost 33-419; see M.greedyPick. If this line ever becomes a local copy again,
 * the tournament silently stops measuring what it claims to measure. */
function greedyVPolicy(valuer) {
  return function (available, roster, picksLeft) {
    return M.greedyPick(available, roster, LEAGUE, picksLeft, valuer, null)
      || available[0];
  };
}

/* Opponent profiles for the MCTS chance nodes.
 *
 * The search models opponents through the production survival machinery. The
 * simulator's opponents are the ranked-softmax policy above. Those are NOT the
 * same model — a deliberate and CONSERVATIVE mismatch: the search is being
 * asked to beat a room it does not perfectly understand, which is the real
 * situation. `--jitter` perturbs these further for ship condition 2.
 */
function profileFor(slot, jitter, rand) {
  const j = jitter ? (1 + (rand() * 2 - 1) * jitter) : 1;
  return {
    name: 'seat' + slot, sample_size: 3, shrinkage_weight: 0.6,
    softmax: { alpha_need: 1.0 * j, beta_value: 1.0 / j },
    reach_delta: { mean: 0 },
  };
}

// ----------------------------------------------------------------- one draft
/**
 * Play one full draft.
 *
 * `mctsSlot` is the seat under test; null means every seat uses `basePolicy`.
 * Returns final rosters plus per-pick telemetry for the seat under test.
 */
function simulate(opts) {
  const rand = rng(opts.seed);
  const valuer = V.makeValuer({ league: LEAGUE, players: PLAYERS, replacement: REPLACEMENT });
  const available = (opts.rankBoard || BOARD).slice();
  const rosters = {};
  for (let s = 1; s <= TEAMS; s++) rosters[s] = [];
  const profiles = {};
  for (let s = 1; s <= TEAMS; s++) profiles[s] = profileFor(s, opts.jitter, rand);

  const telemetry = [];
  const recent = [];             // last picks, for run detection

  for (let i = 0; i < SCHEDULE.length; i++) {
    const step = SCHEDULE[i];
    const slot = step.team_slot;
    const roster = rosters[slot];
    const picksLeft = ROUNDS - step.round + 1;
    if (!available.length) break;

    let chosen = null;
    let searchInfo = null;

    if (slot === opts.subjectSlot && opts.subjectPolicy === 'mcts') {
      const schedule = [];
      for (let j = i; j < SCHEDULE.length; j++) {
        schedule.push({
          team_slot: SCHEDULE[j].team_slot, pick_no: SCHEDULE[j].pick_no,
          roster: rosters[SCHEDULE[j].team_slot],
          profile: SCHEDULE[j].team_slot === slot ? null : profiles[SCHEDULE[j].team_slot],
        });
      }
      try {
        const search = M.createSearch({
          board: available, league: LEAGUE, myRoster: roster, rosters: rosters,
          schedule: schedule, mySlot: slot, myPicksLeft: picksLeft,
          valuer: valuer, blocked: new Set(), seed: (opts.seed * 31 + i) >>> 0,
          runMultipliers: {}, roundsLeft: picksLeft, progress: i / SCHEDULE.length,
          cfg: { MAX_NODES: 40000 },
        });
        const out = search.run(opts.iterations);
        chosen = out.actions.length ? out.actions[0].player : null;
        // ROOT visits, not the top action's. The first run reported "mean root
        // visits per pick 75" against a 400-iteration budget, which read like
        // the search was starving when it was simply the wrong field.
        searchInfo = out.actions.length
          ? { rootVisits: out.iterations, topVisits: out.actions[0].visits,
              share: out.actions[0].share } : null;
      } catch (e) {
        chosen = null;                     // fall through to the base policy
      }
    }

    if (!chosen) {
      const policy = (slot === opts.subjectSlot && opts.subjectPolicy === 'greedyV')
        ? greedyVPolicy(valuer)
        : (opts.basePolicy || rankedPolicy(BOARD));
      chosen = policy(available, roster, picksLeft, rand);
    }
    if (!chosen) break;

    if (slot === opts.subjectSlot) {
      // Marginal value of THIS pick, and the context it was made in. This is
      // how the "where does the edge live" question gets answered rather than
      // assumed.
      const before = valuer.evaluate(roster);
      const after = valuer.evaluate(roster.concat([chosen]));
      const runPos = {};
      recent.slice(-5).forEach(p => { runPos[p.position] = (runPos[p.position] || 0) + 1; });
      const runActive = Object.keys(runPos).some(k => runPos[k] >= 3);
      // A turn is a pick where my next one comes within TEAMS/2 picks — the
      // back-to-back at a snake boundary, where the largest single-pick errors
      // are supposed to happen.
      let nextMine = null;
      for (let j = i + 1; j < SCHEDULE.length; j++) {
        if (SCHEDULE[j].team_slot === slot) { nextMine = SCHEDULE[j].pick_no; break; }
      }
      telemetry.push({
        round: step.round, pick_no: step.pick_no,
        gain: after - before,
        position: chosen.position,
        isTurn: nextMine != null && (nextMine - step.pick_no) <= Math.ceil(TEAMS / 2),
        runActive: runActive,
        search: searchInfo,
      });
    }

    roster.push(chosen);
    recent.push(chosen);
    const idx = available.indexOf(chosen);
    if (idx >= 0) available.splice(idx, 1);
  }

  // Final valuation of every seat on a common yardstick.
  const finals = {};
  for (let s = 1; s <= TEAMS; s++) finals[s] = valuer.evaluate(rosters[s]);
  return { rosters: rosters, finals: finals, telemetry: telemetry };
}

/** Percentile of a seat among the ten final rosters. 1.0 = best team. */
function percentile(finals, slot) {
  const vals = Object.keys(finals).map(k => finals[k]);
  const mine = finals[slot];
  let below = 0;
  vals.forEach(v => { if (v < mine) below++; });
  return below / (vals.length - 1);
}

// -------------------------------------------------------------- the statistics
/* One-sided paired t-test on the per-draft difference (MCTS − greedy).
 *
 * Paired because both arms share a seed, a board and a seat: the pairing
 * removes board and slot variance, which is most of it. One-sided because the
 * ship question is directional — "is MCTS better", not "is it different". Both
 * choices are pre-registered.
 */
function pairedT(diffs) {
  const n = diffs.length;
  if (n < 2) return { n: n, mean: 0, t: 0, p: 1 };
  let mean = 0;
  diffs.forEach(d => { mean += d; });
  mean /= n;
  let ss = 0;
  diffs.forEach(d => { ss += (d - mean) * (d - mean); });
  const sd = Math.sqrt(ss / (n - 1));
  const se = sd / Math.sqrt(n);
  const t = se > 0 ? mean / se : 0;
  return { n: n, mean: mean, sd: sd, t: t, p: oneSidedP(t, n - 1) };
}

/* Student-t upper tail. Normal approximation past 200 df, exact-ish below via
 * the incomplete beta — n is 1,000 here so the approximation is fine, but the
 * exact branch is kept so a smaller pilot run is not quietly misreported. */
function oneSidedP(t, df) {
  if (!isFinite(t)) return t > 0 ? 0 : 1;
  if (df > 200) return 1 - normCdf(t);
  const x = df / (df + t * t);
  const ib = incBeta(x, df / 2, 0.5);
  const p = 0.5 * ib;
  return t > 0 ? p : 1 - p;
}
function normCdf(z) {
  const s = z < 0 ? -1 : 1; const a = Math.abs(z) / Math.SQRT2;
  const tt = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * tt - 1.453152027) * tt) + 1.421413741) * tt
    - 0.284496736) * tt + 0.254829592) * tt * Math.exp(-a * a);
  return 0.5 * (1 + s * y);
}
function incBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = lgamma(a) + lgamma(b) - lgamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta) / a;
  let f = 1, c = 1, d = 0;
  for (let i = 0; i <= 200; i++) {
    const m = Math.floor(i / 2);
    let num;
    if (i === 0) num = 1;
    else if (i % 2 === 0) num = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    else num = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + num * d; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d;
    c = 1 + num / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    const cd = c * d; f *= cd;
    if (Math.abs(1 - cd) < 1e-10) break;
  }
  return front * (f - 1);
}
function lgamma(z) {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let x = z, y = z, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += g[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}
/** Sign test — a distribution-free companion, in case the t is carried by tails. */
function signTest(diffs) {
  let wins = 0, losses = 0;
  diffs.forEach(d => { if (d > 0) wins++; else if (d < 0) losses++; });
  const n = wins + losses;
  if (!n) return { wins: 0, losses: 0, p: 1 };
  const z = (wins - n / 2) / (Math.sqrt(n) / 2);
  return { wins: wins, losses: losses, p: 1 - normCdf(z) };
}

// --------------------------------------------------------------------- runner
function runTournament(label, rankBoard, drafts, iterations, jitter) {
  const diffs = [], mctsPct = [], greedyPct = [];
  const bucket = {
    byRound: {}, turn: { a: 0, b: 0, n: 0 }, notTurn: { a: 0, b: 0, n: 0 },
    run: { a: 0, b: 0, n: 0 }, noRun: { a: 0, b: 0, n: 0 },
  };
  let iterSum = 0, iterN = 0;

  for (let d = 0; d < drafts; d++) {
    // Rotate the seat across all ten slots, so the result measures search
    // quality and not the luck of one draft position.
    const slot = (d % TEAMS) + 1;
    const seed = 1000003 + d * 7919;
    const base = { seed: seed, rankBoard: rankBoard, iterations: iterations,
                   jitter: jitter, subjectSlot: slot,
                   basePolicy: rankedPolicy(rankBoard) };
    const a = simulate(Object.assign({}, base, { subjectPolicy: 'mcts' }));
    const b = simulate(Object.assign({}, base, { subjectPolicy: 'greedyV' }));

    const pa = percentile(a.finals, slot), pb = percentile(b.finals, slot);
    mctsPct.push(pa); greedyPct.push(pb); diffs.push(pa - pb);

    // Where the edge lives, if there is one.
    const n = Math.min(a.telemetry.length, b.telemetry.length);
    for (let i = 0; i < n; i++) {
      const ta = a.telemetry[i], tb = b.telemetry[i];
      const r = ta.round;
      bucket.byRound[r] = bucket.byRound[r] || { a: 0, b: 0, n: 0 };
      bucket.byRound[r].a += ta.gain; bucket.byRound[r].b += tb.gain; bucket.byRound[r].n++;
      const t = ta.isTurn ? bucket.turn : bucket.notTurn;
      t.a += ta.gain; t.b += tb.gain; t.n++;
      const rr = ta.runActive ? bucket.run : bucket.noRun;
      rr.a += ta.gain; rr.b += tb.gain; rr.n++;
      if (ta.search) { iterSum += ta.search.rootVisits; iterN++; }
    }
    if (!OPTS.pilot && (d + 1) % 50 === 0) {
      process.stdout.write('  ' + label + ': ' + (d + 1) + '/' + drafts + '\r');
    }
  }

  const t = pairedT(diffs);
  const s = signTest(diffs);
  const mean = arr => arr.reduce((x, y) => x + y, 0) / arr.length;
  return {
    label: label, drafts: drafts, iterations: iterations, jitter: jitter,
    mcts_mean_percentile: mean(mctsPct),
    greedy_mean_percentile: mean(greedyPct),
    mean_diff: t.mean, sd_diff: t.sd, t: t.t, p_one_sided: t.p,
    sign: s, buckets: bucket,
    mean_root_visits: iterN ? iterSum / iterN : 0,
  };
}

// ----------------------------------------------------------------------- main
console.log('='.repeat(76));
console.log('MCTS SELF-PLAY TOURNAMENT');
console.log('='.repeat(76));
console.log('board          ', OPTS.board.replace(/^.*\/league\//, ''));
console.log('               ', PLAYERS.length, 'players,', TEAMS, 'teams,', ROUNDS, 'rounds');
const prov = (artifact.provenance || {}).adp || {};
console.log('board source   ', prov.adp_source || 'unknown',
  prov.warning ? '\n  !! ' + prov.warning : '');
console.log('drafts         ', OPTS.drafts, '(seat rotated across all', TEAMS, 'slots)');
console.log('iterations/pick', OPTS.iterations);
if (OPTS.jitter) console.log('opponent jitter', OPTS.jitter);

if (OPTS.pilot) {
  // TIMING ONLY. No outcome is printed, because the pre-registration is not
  // written yet and choosing the compute budget is allowed to see the clock
  // but must not see the result.
  const t0 = Date.now();
  const n = 6;
  for (let d = 0; d < n; d++) {
    const slot = (d % TEAMS) + 1;
    const base = { seed: 42 + d, rankBoard: BOARD, iterations: OPTS.iterations,
                   jitter: 0, subjectSlot: slot, basePolicy: rankedPolicy(BOARD) };
    simulate(Object.assign({}, base, { subjectPolicy: 'mcts' }));
    simulate(Object.assign({}, base, { subjectPolicy: 'greedyV' }));
  }
  const ms = (Date.now() - t0) / n;
  console.log('\nPILOT (timing only — no outcomes examined)');
  console.log('  per paired draft:', ms.toFixed(0), 'ms');
  console.log('  projected for', OPTS.drafts, 'drafts:', (ms * OPTS.drafts / 1000).toFixed(0), 's');
  console.log('  projected for both tournaments:', (2 * ms * OPTS.drafts / 1000).toFixed(0), 's');
  process.exit(0);
}

const results = [];
console.log('\nrunning...');
results.push(runTournament('vs composite room', BOARD, OPTS.drafts, OPTS.iterations, OPTS.jitter));
results.push(runTournament('vs ADP room', ADP_BOARD, OPTS.drafts, OPTS.iterations, OPTS.jitter));

console.log('\n' + '='.repeat(76));
results.forEach(r => {
  console.log('\n--- ' + r.label + ' ---');
  console.log('  MCTS mean finish percentile   ', r.mcts_mean_percentile.toFixed(4));
  console.log('  greedy-on-V mean percentile   ', r.greedy_mean_percentile.toFixed(4));
  console.log('  paired mean difference        ', r.mean_diff.toFixed(4),
    '(sd ' + r.sd_diff.toFixed(4) + ')');
  console.log('  t                             ', r.t.toFixed(3));
  console.log('  p (one-sided, MCTS > greedy)  ', r.p_one_sided.toExponential(3));
  console.log('  sign test                     ', r.sign.wins + 'W ' + r.sign.losses + 'L, p '
    + r.sign.p.toExponential(2));
  console.log('  mean root visits per pick     ', r.mean_root_visits.toFixed(0));
  const rounds = Object.keys(r.buckets.byRound).map(Number).sort((a, b) => a - b);
  console.log('  per-round mean V gain (MCTS − greedy):');
  rounds.forEach(rd => {
    const b = r.buckets.byRound[rd];
    console.log('    r' + String(rd).padStart(2) + '  ' + ((b.a - b.b) / b.n).toFixed(2));
  });
  const seg = (name, b) => console.log('    ' + name.padEnd(10)
    + (b.n ? ((b.a - b.b) / b.n).toFixed(2) : 'n/a') + '   (n=' + b.n + ')');
  console.log('  by context:');
  seg('turn', r.buckets.turn); seg('not turn', r.buckets.notTurn);
  seg('in a run', r.buckets.run); seg('no run', r.buckets.noRun);
});

/* PROVENANCE OF THE RUN ITSELF.
 *
 * The first tournament could not be cleanly attributed after the fact: two
 * unrelated commits (the adp_sd interim and the rollout fix) landed within
 * minutes of the results file being written, and nothing in that file recorded
 * which version of the code had actually been loaded. A result you cannot
 * attribute to a specific configuration is not a measurement, it is an
 * anecdote. So every run now stamps the exact commit and the exact constants
 * that produced it — including the survival constants, because the search
 * reasons THROUGH the survival model and a change there changes the result
 * without touching a line of mcts.js. */
function gitHead() {
  try {
    return require('child_process')
      .execSync('git rev-parse HEAD && git status --porcelain -- ../../public/js/draft ../tournament',
        { cwd: __dirname, encoding: 'utf8' })
      .trim().split('\n');
  } catch (e) { return ['UNAVAILABLE: ' + e.message]; }
}
const head = gitHead();
const stamp = {
  git_head: head[0],
  // Anything listed here means the run used code that is NOT the commit above.
  uncommitted_when_run: head.slice(1),
  mcts_cfg: M.CFG,
  survival_cfg: S ? S.CFG : 'survival module not loaded',
  node: process.version,
};
if (stamp.uncommitted_when_run.length) {
  console.log('\n!! this run used UNCOMMITTED code — see uncommitted_when_run in the results file:');
  stamp.uncommitted_when_run.forEach(l => console.log('   ' + l));
}
fs.writeFileSync(OPTS.out,
  JSON.stringify({ opts: OPTS, stamp: stamp, results: results }, null, 1));
console.log('\nwritten to', OPTS.out.replace(/^.*\/league\//, ''));
console.log('='.repeat(76));
