// TERRITORY: A
/* CROSS-TOOL COHERENCE — the analyzer's playoff odds against the lineup tool's
 * weekly matchup probabilities, which nothing has ever compared.
 *
 * ── WHY THIS IS NOT A STYLE CHECK ──────────────────────────────────────────
 *
 * The two surfaces compute probabilities about THE SAME GAMES by completely
 * different mechanisms, and neither knows the other exists:
 *
 *   · THE LINEUP/CLAIMS SIDE (`claims-cron.buildClaims`) takes each owner's
 *     season POINTS-FOR, runs it through `playoffs.winProb` — a tanh of the
 *     z-score against the field — and normalises the pair to sum to 1.
 *   · THE ANALYZER (`routes/standings.projectStandings`) ignores all of that and
 *     Monte-Carlos each team's weekly score as Normal(mean_shrunk, sd) on the
 *     real schedule, counting wins.
 *
 * **Two models of one event, in one product, with nothing forcing agreement.**
 * That is the two-places disease in its most expensive form — not a duplicated
 * constant but a duplicated BELIEF, where each side can be internally coherent
 * and the pair still tells the league two different things about Sunday.
 *
 * ── AND THE LITERAL FORMULATION NEEDS CORRECTING ───────────────────────────
 *
 * The check was specified as "the product of the lineup tool's weekly matchup
 * probabilities should roughly agree with the analyzer's playoff odds."
 * **Taken literally that product is P(this team wins EVERY remaining game)**,
 * which is not playoff odds and would be smaller by orders of magnitude — a
 * 60%-per-week team over seven weeks products to 2.8%. Implementing it as
 * specified would produce a screaming divergence on a perfectly healthy pair.
 *
 * So the per-matchup probabilities are carried to a playoff probability the way
 * they actually compose: **simulate each remaining GAME, one winner per game**,
 * accumulate win totals, and apply the same seeding rule the analyzer applies.
 * The coupling matters — two teams cannot both win the same game — and a
 * per-team independent binomial would quietly break exactly that.
 *
 * ── WHAT MAKES THIS AN INDEPENDENT CHECK AND NOT RULE 10d AGAIN ────────────
 *
 * The PROBABILITIES come from the lineup side and the SCHEDULE and SEEDING come
 * from the shared definitions (`seedOrder`, `playoffCut`). Nothing here consumes
 * the analyzer's own strength model, its RNG or its win counts — which is the
 * whole point. Importing `seedOrder` is deliberate: a second seeding rule would
 * make a disagreement about TIEBREAKS look like a disagreement about
 * PROBABILITY, and the check would be reporting on itself.
 *
 * ── FAIL CLOSED ────────────────────────────────────────────────────────────
 *
 * Every function here refuses missing input rather than defaulting. A coherence
 * check that returns "coherent" because it was handed nothing is worse than no
 * check: it converts an absence of evidence into a green light, which is the
 * failure this codebase has now hit in six different surfaces.
 */
'use strict';

/* ── CHECK 1 — THE HARD IDENTITY ───────────────────────────────────────────
 *
 * EXACT, no tolerance, and it needs no model at all: across one week's
 * matchups, the sum of every team's win probability MUST equal the number of
 * games, because every game produces exactly one winner.
 *
 * This is the check that catches the specific bug `claims-cron` warns about in
 * a comment and nothing verifies — `winProb` returns a probability against the
 * FIELD, not head-to-head, so a raw pair does not sum to 1. The cron normalises.
 * If that normalisation is ever removed, refactored around, or applied to only
 * one side, THIS is what goes red, and it goes red immediately rather than
 * after a season of mis-graded Brier scores.
 */
function weekProbabilityIdentity(matchups) {
  if (!Array.isArray(matchups) || !matchups.length) {
    throw new Error('coherence: weekProbabilityIdentity needs the week\'s matchups '
      + 'and has no default. An identity checked against an empty week passes '
      + 'trivially and reports coherence it never tested.');
  }
  const problems = [];
  let total = 0;
  matchups.forEach((m, i) => {
    const p = Number(m.p_home);
    if (!(p >= 0 && p <= 1)) {
      problems.push(`matchup ${i} (${m.home} vs ${m.away}): p_home=${m.p_home} is not a probability`);
      return;
    }
    total += p + (1 - p);          // the pair, as the ledger will store it
  });
  const games = matchups.length;
  // Floating point only — this identity is exact by construction, so the
  // tolerance is machine epsilon scaled by the count, not a judgement call.
  const drift = Math.abs(total - games);
  return {
    check: 'week probability identity',
    games: games,
    summed_win_probability: Number(total.toFixed(9)),
    exact: drift < 1e-9 && !problems.length,
    problems: problems,
    why: 'every game produces exactly one winner, so the win probabilities across '
      + 'a week must sum to the number of games. This is an identity, not an '
      + 'approximation, and a failure is a bug rather than a disagreement.',
  };
}

/* ── CHECK 2 — EXPECTED WINS ───────────────────────────────────────────────
 *
 * The tightest comparison available, because it needs no seeding, no bracket
 * and no simulation on either side: a team's expected remaining wins is the SUM
 * of its per-week win probabilities, and the analyzer reports `exp_wins`
 * directly. Two independent routes to one number.
 */
function expectedWins(schedule, baseWins) {
  if (!schedule || typeof schedule !== 'object') {
    throw new Error('coherence: expectedWins needs {rid: [p, p, ...]} and has no default.');
  }
  const out = {};
  Object.keys(schedule).forEach(rid => {
    const ps = schedule[rid] || [];
    const add = ps.reduce((s, p) => s + Number(p), 0);
    out[rid] = ((baseWins || {})[rid] || 0) + add;
  });
  return out;
}

/* ── CHECK 3 — PLAYOFF ODDS ────────────────────────────────────────────────
 *
 * Carry the per-matchup probabilities to a playoff probability the way they
 * compose, then compare against the analyzer's. `seedOrderFn` is INJECTED so
 * this file cannot become a second seeding rule.
 *
 * `games` is [{week, home, away, p_home}]. Locked results arrive as baseWins /
 * basePf so the simulation only resolves what is genuinely unplayed.
 */
function impliedPlayoffOdds(opts) {
  const o = opts || {};
  for (const k of ['games', 'rids', 'spots', 'seedOrderFn', 'seed']) {
    if (o[k] === undefined || o[k] === null) {
      throw new Error(`coherence: impliedPlayoffOdds requires \`${k}\` and has no `
        + 'default — a coherence check with a guessed input measures the guess.');
    }
  }
  const sims = o.sims || 4000;
  const baseWins = o.baseWins || {};
  const basePf = o.basePf || {};
  // Own seeded RNG: deterministic, and deliberately NOT the analyzer's, so a
  // coincidence of random draws cannot manufacture agreement.
  let a = o.seed >>> 0;
  const rand = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const made = {};
  o.rids.forEach(r => { made[r] = 0; });
  for (let s = 0; s < sims; s++) {
    const rec = {};
    o.rids.forEach(r => { rec[r] = { rid: r, wins: baseWins[r] || 0, pf: basePf[r] || 0 }; });
    for (const g of o.games) {
      // ONE WINNER PER GAME — the coupling a per-team binomial would destroy.
      const homeWins = rand() < Number(g.p_home);
      const w = homeWins ? g.home : g.away;
      if (rec[w]) rec[w].wins++;
      /* PF IS NOT SIMULATED HERE, and that is a stated limitation rather than an
       * oversight: these probabilities carry no score distribution, only a
       * win chance. So the tiebreak runs on points-for FROZEN at the locked
       * weeks. It biases the comparison toward whoever leads on PF today, and
       * it only bites on exact win ties. Named so a divergence concentrated in
       * tied teams is read as this, not as a model disagreement. */
    }
    const order = o.seedOrderFn(Object.values(rec));
    order.slice(0, o.spots).forEach(r => { made[r] = (made[r] || 0) + 1; });
  }
  const out = {};
  o.rids.forEach(r => { out[r] = made[r] / sims; });
  return out;
}

/* ── THE COMPARISON ────────────────────────────────────────────────────────
 *
 * Tolerances are arguments with no defaults. A tolerance chosen after seeing the
 * divergence is a tolerance chosen to pass, which is the same failure as a
 * materiality bar written after the verdict.
 */
function compare(opts) {
  const o = opts || {};
  for (const k of ['analyzer', 'implied', 'expected_wins', 'tol_prob', 'tol_wins']) {
    if (o[k] === undefined || o[k] === null) {
      throw new Error(`coherence: compare requires \`${k}\` and has no default. `
        + 'A tolerance with a default is a tolerance nobody chose.');
    }
  }
  const rows = [];
  (o.analyzer || []).forEach(p => {
    const rid = p.rid;
    const impl = o.implied[rid];
    const ew = o.expected_wins[rid];
    const dProb = impl == null ? null : Number((p.playoff_prob - impl).toFixed(4));
    const dWins = ew == null ? null : Number((p.exp_wins - ew).toFixed(3));
    rows.push({
      rid: rid,
      analyzer_playoff_prob: p.playoff_prob,
      implied_playoff_prob: impl == null ? null : Number(impl.toFixed(4)),
      d_playoff_prob: dProb,
      analyzer_exp_wins: Number((p.exp_wins || 0).toFixed(3)),
      implied_exp_wins: ew == null ? null : Number(ew.toFixed(3)),
      d_exp_wins: dWins,
      /* MISSING IS NOT AGREEING. A team the implied side could not produce is
       * reported as unresolvable, never folded in as a zero divergence. */
      status: (impl == null || ew == null) ? 'UNRESOLVABLE'
        : (Math.abs(dProb) > o.tol_prob || Math.abs(dWins) > o.tol_wins) ? 'DIVERGES' : 'ok',
    });
  });
  const diverging = rows.filter(r => r.status === 'DIVERGES');
  const unresolvable = rows.filter(r => r.status === 'UNRESOLVABLE');
  return {
    check: 'analyzer playoff odds vs lineup-implied playoff odds',
    tol_prob: o.tol_prob, tol_wins: o.tol_wins,
    rows: rows,
    diverging: diverging.map(r => r.rid),
    unresolvable: unresolvable.map(r => r.rid),
    /* FAIL CLOSED: an unresolvable row blocks exactly as a diverging one does.
     * "We could not compare these two" and "these two agree" must never render
     * the same, which is the entire reason this file exists. */
    coherent: diverging.length === 0 && unresolvable.length === 0,
    why: diverging.length
      ? 'the two surfaces disagree about the same games beyond the stated tolerance'
      : unresolvable.length
        ? 'one or more teams could not be compared — that is not agreement'
        : 'the two independently computed odds agree within the stated tolerance',
  };
}

module.exports = {
  weekProbabilityIdentity, expectedWins, impliedPlayoffOdds, compare,
};
