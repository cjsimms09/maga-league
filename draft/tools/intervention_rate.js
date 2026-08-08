/* THE INTERVENTION RATE — a standing metric.
 *
 * THE QUESTION: how often does this tool actually disagree with the market, by
 * how much, and on what evidence? Intervention rate is the number that decides
 * what the tool IS. Cory's pre-registered prior, recorded before the first run:
 *
 *   "interventions should be RARE and CONCENTRATED — roughly the 2 contested
 *    decisions per draft the tournament identified, not 1 and not 10."
 *
 * THE HONEST BAR, both directions:
 *   - intervene on almost nothing  -> this is a consensus board with a legality
 *     layer and a money function, and the report must SAY SO plainly;
 *   - intervene constantly         -> equally suspicious. A model that deviates
 *     on every pick is overconfident, not insightful.
 *
 * ── WHAT THIS MEASURES TODAY, AND WHAT IT CANNOT ────────────────────────────
 *
 * The spec asks for a per-STAGE breakdown (Stage 2 baseline / Stage 3 doctrine
 * tilt / Stage 4 edge intervention). THE DECISION TREE DOES NOT EXIST YET, so
 * there are no stages to attribute to, and inventing a stage label for a
 * composite that never had stages would be a fabricated number dressed as a
 * measurement.
 *
 * What IS measurable now — and what the anchor doctrine's own build split calls
 * buildable without the gated reliability weights — is the deviation the
 * CURRENT composite already produces, decomposed into the terms that caused it:
 *
 *   BASELINE      the pick sits inside the noise band around consensus ADP.
 *                 This is Stage 2 in all but name: market order, no edge.
 *   INTERVENTION  the pick deviates beyond the band. The DRIVERS that bought
 *                 the distance are today's stand-in for named edges, and their
 *                 firing frequency answers requirement (3) directly: a term
 *                 that never fires is dead weight, whatever the spec says.
 *
 * When the tree lands, the stage label replaces the band test and the rest of
 * this file is unchanged.
 *
 * Run: node draft/tools/intervention_rate.js [drafts]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('../../public/js/draft/engine.js');
const D = require('../../public/js/draft/deviation.js');

const ROOT = path.join(__dirname, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const LEAGUE = DATA.league;
const TEAMS = LEAGUE.teams || 10;
const ROUNDS = LEAGUE.rounds || 15;
const MY_SLOT = LEAGUE.my_draft_slot || 4;
const STARTERS = LEAGUE.starters || {};
const KEEPERS = (DATA.kept_players || []).filter(k => Number(k.team_slot) === MY_SLOT);
const KEEPER_ROUNDS = (LEAGUE.keeper_rules || {}).count || 0;
const NOISE_BAND = 4.0;                       // same band the deviation badge uses

// Deterministic RNG — a metric that moves between runs is not a metric.
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const adpOf = p => (p.adjusted_adp != null ? p.adjusted_adp
  : (p.raw_adp != null ? p.raw_adp : 9999));

/** Snake pick order; which overall picks belong to MY_SLOT. */
function myPicks() {
  const out = [];
  for (let r = 1; r <= ROUNDS; r++) {
    const idx = (r % 2 === 1) ? MY_SLOT : (TEAMS - MY_SLOT + 1);
    out.push((r - 1) * TEAMS + idx);
  }
  // Keeping N players forfeits rounds 1..N.
  return out.slice(KEEPER_ROUNDS);
}

/** One simulated draft. Opponents take by ADP with seeded noise. */
function simulate(seed) {
  const rand = rng(seed);
  const pool = DATA.players.filter(p => p.position && p.proj_mean != null);
  const gone = new Set(KEEPERS.map(k => String(k.player_id)));
  const roster = KEEPERS.map(k => Object.assign({}, k, { is_keeper: true }));
  const mine = new Set(myPicks());
  const results = [];

  for (let overall = 1; overall <= TEAMS * ROUNDS; overall++) {
    const board = pool.filter(p => !gone.has(String(p.player_id)));
    if (!board.length) break;

    if (!mine.has(overall)) {
      // An opponent: market order, jittered, so the board drains realistically
      // without every simulated room being identical.
      const top = board.slice().sort((a, b) => adpOf(a) - adpOf(b)).slice(0, 8);
      const pick = top[Math.min(top.length - 1, Math.floor(rand() * rand() * top.length))];
      gone.add(String(pick.player_id));
      continue;
    }

    const nextMine = [...mine].filter(x => x > overall).sort((a, b) => a - b)[0] || null;
    const ctx = {
      board: board,
      roster: roster,
      league: LEAGUE,
      weights: E.DEFAULT_WEIGHTS,
      currentPick: overall,
      nextPick: nextMine,
      totalPicks: TEAMS * ROUNDS,
      myPicksLeft: [...mine].filter(x => x >= overall).length,
      roundsLeft: ROUNDS - Math.ceil(overall / TEAMS) + 1,
      runMultipliers: {},
      intervening: [],
    };
    let scored;
    try { scored = E.recommend(ctx); } catch (e) { break; }
    if (!scored || !scored.length) break;

    const top = scored[0];
    const badge = D.badge(top, overall, NOISE_BAND);
    const drivers = D.drivers((top.components || {}).weighted);

    results.push({
      overall: overall,
      round: Math.ceil(overall / TEAMS),
      player: top.player.name,
      position: top.player.position,
      adp: adpOf(top.player),
      deviation: badge ? badge.delta : (adpOf(top.player) - overall),
      intervened: !!badge,
      tier: badge ? badge.tier : null,
      drivers: drivers.map(d => d.term),
      leadDriver: drivers.length ? drivers[0].term : null,
      contested: !!top.contested,
      gapToSecond: top.gap_to_second != null ? top.gap_to_second : null,
    });

    gone.add(String(top.player.player_id));
    roster.push(top.player);
  }
  return results;
}

// ------------------------------------------------------------------ report
function report(nDrafts) {
  const all = [];
  for (let i = 0; i < nDrafts; i++) all.push(simulate(1000 + i * 7919));

  const picks = all.flat();
  const interventions = picks.filter(p => p.intervened);
  const perDraft = all.map(d => d.filter(p => p.intervened).length);
  const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  const median = a => {
    if (!a.length) return 0;
    const s = a.slice().sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)];
  };

  console.log('='.repeat(74));
  console.log('THE INTERVENTION RATE');
  console.log('='.repeat(74));
  console.log(`${nDrafts} simulated drafts · ${TEAMS} teams × ${ROUNDS} rounds · seat ${MY_SLOT}`);
  console.log(`${KEEPERS.length} keepers (rounds 1-${KEEPER_ROUNDS} forfeited) · `
    + `${picks.length} decisions · noise band ±${NOISE_BAND}`);
  console.log('');

  const rate = picks.length ? interventions.length / picks.length : 0;
  console.log('── THE HEADLINE ' + '─'.repeat(58));
  console.log(`  deviated from consensus beyond the band : ${(rate * 100).toFixed(1)}%`
    + `  (${interventions.length}/${picks.length})`);
  console.log(`  interventions per draft                 : mean ${mean(perDraft).toFixed(1)}`
    + `, median ${median(perDraft)}, range ${Math.min(...perDraft)}-${Math.max(...perDraft)}`);
  const mags = interventions.map(p => Math.abs(p.deviation));
  console.log(`  average deviation when it does deviate  : ${mean(mags).toFixed(1)} picks`
    + `  (median ${median(mags).toFixed(1)}, max ${mags.length ? Math.max(...mags).toFixed(0) : 0})`);
  console.log('');

  // ---- the pre-registered verdict, stated plainly either way ----
  const perDraftMean = mean(perDraft);
  console.log('── THE HONEST BAR ' + '─'.repeat(56));
  console.log('  Cory pre-registered: RARE AND CONCENTRATED, ~2 per draft, not 1 and not 10.');
  let verdict;
  if (perDraftMean < 1) {
    verdict = 'BELOW the prior. On this evidence the tool is a consensus board with a\n'
      + '  legality layer and a money function. That is a real product — it is not the\n'
      + '  product the composite claims to be.';
  } else if (perDraftMean > 10) {
    verdict = 'FAR ABOVE the prior. A model that deviates on nearly every pick is\n'
      + '  overconfident, not insightful. Treat the deviations as suspect until the\n'
      + '  evidence behind them is measured (experiments 33 and 36).';
  } else if (perDraftMean > 4) {
    verdict = 'ABOVE the prior. More interventions than the tournament\'s contested-decision\n'
      + '  count suggests should exist. Not automatically wrong, but it means the model is\n'
      + '  claiming edges on picks the tournament said were not close.';
  } else {
    verdict = 'WITHIN the pre-registered band. Interventions are rare and concentrated,\n'
      + '  which is what was predicted before the measurement was run.';
  }
  console.log('  VERDICT: ' + verdict);
  console.log('');

  // ---- which edges actually fire (requirement 3) ----
  console.log('── WHICH TERMS ACTUALLY BUY THE DEVIATION ' + '─'.repeat(32));
  const leadCount = {}, anyCount = {};
  interventions.forEach(p => {
    if (p.leadDriver) leadCount[p.leadDriver] = (leadCount[p.leadDriver] || 0) + 1;
    p.drivers.forEach(t => { anyCount[t] = (anyCount[t] || 0) + 1; });
  });
  const known = Object.keys(D.EVIDENCE);
  known.sort((a, b) => (leadCount[b] || 0) - (leadCount[a] || 0));
  known.forEach(t => {
    const lead = leadCount[t] || 0, any = anyCount[t] || 0;
    const ev = D.EVIDENCE[t];
    const bar = '█'.repeat(Math.round((lead / Math.max(1, interventions.length)) * 30));
    console.log(`  ${t.padEnd(9)} lead ${String(lead).padStart(4)}  any ${String(any).padStart(4)}`
      + `  [${ev.klass}] ${bar}`);
  });
  const dead = known.filter(t => !(anyCount[t] || 0));
  console.log('');
  if (dead.length) {
    console.log('  ⚠️  DEAD WEIGHT — specced but NEVER fired in '
      + nDrafts + ' drafts: ' + dead.join(', '));
    console.log('     A named edge that never triggers is not an edge. Either its trigger is');
    console.log('     unreachable on a real board, or it is mis-specified. Report, do not keep.');
  } else {
    console.log('  every classified term fired at least once.');
  }
  console.log('');

  // ---- confidence distribution ----
  console.log('── CONFIDENCE OF THE INTERVENTIONS ' + '─'.repeat(39));
  const tiers = {};
  interventions.forEach(p => { tiers[p.tier] = (tiers[p.tier] || 0) + 1; });
  ['CERTIFIED', 'LIKELY', 'LEAN'].forEach(t => {
    const n = tiers[t] || 0;
    console.log(`  ${t.padEnd(10)} ${String(n).padStart(4)}`
      + `  ${interventions.length ? ((n / interventions.length) * 100).toFixed(1) : '0.0'}%`);
  });
  console.log('');
  console.log('  NOTE: no term is VALIDATED today, so CERTIFIED is unreachable by');
  console.log('  construction. Every deviation above is bought with weak or moderate');
  console.log('  evidence — which is the honest state until experiments 33 and 36 report.');
  console.log('');

  // ---- deviation direction and where in the draft ----
  const early = interventions.filter(p => p.deviation > 0).length;
  console.log('── SHAPE ' + '─'.repeat(65));
  console.log(`  reaches (we take him early) : ${early}`);
  console.log(`  falls   (he came to us)     : ${interventions.length - early}`);
  const byRound = {};
  interventions.forEach(p => { byRound[p.round] = (byRound[p.round] || 0) + 1; });
  const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);
  console.log('  by round: ' + rounds.map(r => `r${r}:${byRound[r]}`).join(' '));
  console.log('');
  console.log('  ⚠️  NOT MEASURED HERE: the dollar value of these interventions. Rate');
  console.log('     without value is meaningless — a 2%-rate model that is right is a');
  console.log('     different product from a 2%-rate model that is wrong. That pairing');
  console.log('     needs the money grader over the same simulated rooms and is the');
  console.log('     obvious next build.');
  console.log('='.repeat(74));

  return { rate: rate, perDraftMean: perDraftMean, picks: picks.length,
           interventions: interventions.length, dead: dead,
           meanMagnitude: mean(mags), medianMagnitude: median(mags),
           maxMagnitude: mags.length ? Math.max.apply(null, mags) : 0,
           reaches: early, falls: interventions.length - early,
           perDraft: perDraft, tiers: tiers,
           leadCount: leadCount, anyCount: anyCount };
}

/* ── THE PRE-TREE BASELINE ────────────────────────────────────────────────
 *
 * Frozen deliberately, BEFORE the decision tree is built, so that when the tree
 * lands we can answer a question that is otherwise unanswerable after the fact:
 *
 *   DOES THE STAGED STRUCTURE CHANGE HOW OFTEN THE MODEL DEVIATES,
 *   OR DOES IT ONLY MAKE THE EXISTING DEVIATIONS LEGIBLE?
 *
 * Those are different things. A restructure that CLARIFIES behaviour is a
 * documentation win. A restructure that silently CHANGES recommendations is a
 * model change wearing a refactor's clothes — and the second one is very easy
 * to ship believing it was the first, because the new structure comes with its
 * own explanation for whatever it now does.
 *
 * The only defence is a number recorded before the change, which is this file.
 * The diff gets REPORTED, never absorbed.
 */
function freezeBaseline(nDrafts, outPath) {
  const quiet = console.log;
  console.log = () => {};
  const r = report(nDrafts);
  console.log = quiet;
  const out = {
    label: 'PRE-TREE BASELINE',
    measured_at: new Date().toISOString(),
    git_head: require('child_process')
      .execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(),
    board_built_at: DATA.built_at,
    architecture: 'composite-then-explain (no decision tree)',
    drafts: nDrafts,
    noise_band: NOISE_BAND,
    metrics: r,
    // What a later comparison must hold fixed to be a fair diff.
    comparability: {
      seeds: 'deterministic: 1000 + i*7919',
      opponent_model: 'top-8 by adjusted_adp, rand()*rand() index weighting',
      board: 'public/draft_data.json at board_built_at',
      note: 'A tree measured against a DIFFERENT board or opponent model is not '
        + 'comparable to this. Re-freeze the baseline on the new board first, '
        + 'or the diff measures the board rather than the tree.',
    },
    the_question: 'When the decision tree lands, re-run and diff. Same rate and '
      + 'same magnitude => the tree made existing behaviour legible. Different '
      + 'rate or magnitude => the tree CHANGED recommendations, and that change '
      + 'must be justified on its own evidence rather than inherited from the '
      + 'restructure.',
  };
  require('fs').writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
  return out;
}

/* ── THE POST-TREE DIFF ────────────────────────────────────────────────────
 *
 * Answers the ONE question the frozen baseline exists to answer: now that the
 * decision-tree vocabulary has landed, does the model DEVIATE differently, or
 * does it deviate identically and merely LABEL the deviations?
 *
 * The distinction is load-bearing and easy to lose. A staged surface comes with
 * its own story for whatever it recommends, so "Stage 2 — consensus baseline"
 * printed next to a pick READS like the pick came from consensus even when the
 * arithmetic that chose it never consulted a stage. The only defence is the
 * number recorded before the change (pre-tree-baseline.json) and a mechanical
 * diff against it — which is this.
 *
 * The verdict is intentionally binary and blunt:
 *   RELABELLED  — metrics byte-identical to baseline. The tree is a legend over
 *                 an unchanged engine. Stage 2 is a label, not an anchor. If the
 *                 intent was for Stage 2 to ANCHOR (deviations must be earned off
 *                 consensus), that intent is NOT met and must be flagged, not
 *                 absorbed into "the tree shipped".
 *   CHANGED     — metrics moved. Recommendations changed. That change must be
 *                 justified on its OWN evidence, never inherited from the refactor.
 */
function diff(nDrafts) {
  const quiet = console.log;
  console.log = () => {};
  const cur = report(nDrafts);
  console.log = quiet;

  const basePath = path.join(ROOT, 'draft', 'backtest', 'pre-tree-baseline.json');
  const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
  const b = base.metrics;

  const curHead = require('child_process')
    .execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim();

  const sameBoard = base.board_built_at === DATA.built_at;

  console.log('='.repeat(74));
  console.log('POST-TREE DIFF — did the decision tree CHANGE behaviour, or LABEL it?');
  console.log('='.repeat(74));
  console.log(`  baseline head ${base.git_head.slice(0, 8)}  (${base.architecture})`);
  console.log(`  current head  ${curHead.slice(0, 8)}  (decision-tree vocabulary landed)`);
  console.log(`  board         ${sameBoard ? 'SAME as baseline — fair diff'
    : 'DIFFERENT — diff measures the BOARD, re-freeze first'}  (${DATA.built_at})`);
  console.log('');

  const rows = [
    ['deviation rate',      b.rate * 100,        cur.rate * 100,        '%',     1],
    ['per-draft mean',      b.perDraftMean,      cur.perDraftMean,      '/draft',2],
    ['mean magnitude',      b.meanMagnitude,     cur.meanMagnitude,     ' picks',2],
    ['median magnitude',    b.medianMagnitude,   cur.medianMagnitude,   ' picks',2],
    ['reaches',             b.reaches,           cur.reaches,           '',      0],
    ['falls',               b.falls,             cur.falls,             '',      0],
    ['interventions',       b.interventions,     cur.interventions,     '',      0],
  ];
  let anyMoved = false;
  console.log('  metric              baseline      current       Δ');
  console.log('  ' + '─'.repeat(56));
  rows.forEach(([name, bv, cv, unit, dp]) => {
    const d = cv - bv;
    if (Math.abs(d) > 1e-9) anyMoved = true;
    const f = x => x.toFixed(dp) + unit;
    const dstr = (d > 0 ? '+' : '') + d.toFixed(dp);
    console.log('  ' + name.padEnd(18) + f(bv).padStart(11) + '  '
      + f(cv).padStart(11) + '  ' + dstr.padStart(8) + (Math.abs(d) > 1e-9 ? '  ⚠' : ''));
  });
  console.log('');

  // Dead-weight terms and lead-driver ranking must also hold.
  const baseDead = (b.dead || []).slice().sort().join(',');
  const curDead = (cur.dead || []).slice().sort().join(',');
  const deadSame = baseDead === curDead;
  const leadOrder = o => Object.keys(o).sort((x, y) => o[y] - o[x]).join('>');
  const leadSame = leadOrder(b.leadCount) === leadOrder(cur.leadCount);
  console.log('  dead weight   baseline [' + (baseDead || 'none') + ']  current ['
    + (curDead || 'none') + ']  ' + (deadSame ? 'same' : '⚠ CHANGED'));
  console.log('  lead-driver ranking  ' + (leadSame ? 'unchanged' : '⚠ CHANGED')
    + '   ' + leadOrder(cur.leadCount));
  console.log('');

  const relabelled = !anyMoved && deadSame && leadSame;
  console.log('── VERDICT ' + '─'.repeat(63));
  if (relabelled) {
    console.log('  RELABELLED — every metric is byte-identical to the pre-tree baseline.');
    console.log('  The tree is a LEGEND printed over an unchanged engine: engine.js and');
    console.log('  the recommendation path never call stages.js, so the pick is still');
    console.log('  whatever the composite produced. STAGE 2 IS A LABEL, NOT AN ANCHOR.');
    console.log('');
    console.log('  The deviation rate is INTACT at ' + (cur.rate * 100).toFixed(1)
      + '%. If the intent was for Stage 2');
    console.log('  to anchor — deviations EARNED off consensus rather than assumed — that');
    console.log('  intent is NOT met by shipping the vocabulary. Flag, do not absorb.');
  } else {
    console.log('  CHANGED — the tree moved recommendations. Per the baseline\'s own');
    console.log('  contract this change must be justified on its OWN evidence, not');
    console.log('  inherited from the restructure. The moved metrics are marked ⚠ above.');
  }
  console.log('='.repeat(74));

  return { relabelled, anyMoved, deadSame, leadSame, sameBoard,
           baseline: b, current: cur, baseHead: base.git_head, curHead };
}

if (require.main === module) {
  if (process.argv[2] === '--freeze') {
    const dest = path.join(ROOT, 'draft', 'backtest', 'pre-tree-baseline.json');
    const b = freezeBaseline(Number(process.argv[3]) || 25, dest);
    console.log('PRE-TREE BASELINE frozen -> ' + path.relative(ROOT, dest));
    console.log('  head        ' + b.git_head.slice(0, 8));
    console.log('  rate        ' + (b.metrics.rate * 100).toFixed(1) + '%');
    console.log('  per draft   ' + b.metrics.perDraftMean.toFixed(1));
    console.log('  magnitude   ' + b.metrics.meanMagnitude.toFixed(1) + ' picks');
    console.log('  reach/fall  ' + b.metrics.reaches + '/' + b.metrics.falls);
    console.log('  dead        ' + (b.metrics.dead.join(',') || 'none'));
  } else if (process.argv[2] === '--diff') {
    diff(Number(process.argv[3]) || 25);
  } else {
    report(Number(process.argv[2]) || 25);
  }
}
module.exports = { simulate, report, freezeBaseline, diff, myPicks, NOISE_BAND };
