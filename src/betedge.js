// TERRITORY: A
/* THE BET EDGE ADVISOR — "if an open or proposed bet to me is advantageous,
 * tell me" (Cory, 2026-08-15). This module answers exactly that, and nothing
 * louder.
 *
 * WHAT IT IS. A pure pricing layer over the same measured models everything
 * else reads: team strengths from the live standings rows (the shrink and the
 * measured weekly sd champodds uses), and finishing odds from champodds'
 * bracket Monte-Carlo (champion / finalist / playoffs / toilet all priced in
 * the SAME simulations, so a "top 2" bet and a "champion" bet can never
 * disagree about the bracket they were priced on). For each bet it computes
 * P(the viewer's side wins) and the dollar EV at the bet's even-money stake,
 * with the derivation in English lines — the same show-your-working contract
 * betlogic's verdicts follow.
 *
 * WHAT IT IS NOT. It is not a settlement engine (betlogic owns grading, and
 * THE ENGINE NEVER SETTLES A BET stands), and it is not an oracle: a bet whose
 * terms live only in free text cannot be priced, and says so instead of
 * guessing. It prices DECISIONS — take / accept / decline — so a condition
 * about a week already in play is refused here (the accept deadline blocks
 * accepting it anyway; grading owns the past).
 *
 * HONESTY RULES, inherited: no manufactured numbers (every input is a live
 * standings row or a champodds output); multi-condition bets are priced under
 * an independence assumption and the lines SAY so; pool bets are priced on
 * their FIRST rule only (champion), with the mass that falls to later rules
 * reported as unpriced rather than allocated by fiat.
 *
 * The advantage threshold: a bet is flagged 'advantageous' at p >= 0.55 and
 * 'against' at p <= 0.45. The 5-point band is not decoration — the forward
 * test puts real spread between these models and the truth, and calling 52%
 * an edge would be selling model noise as money.
 */
'use strict';
const CH = require('./routes/champodds');

const CFG = {
  ADVANTAGE_P: 0.55,     // flag threshold; see header for why not 0.50
  SIMS: 4000,
  SEED: 20260815,
  // Numeric-integration grid for P(weekly high): span and steps over the
  // score distribution. 601 points over ±6 sd is exact to well under a
  // percentage point, which is finer than the models feeding it.
  GRID_SPAN_SD: 6,
  GRID_STEPS: 601,
};

// Standard normal CDF (Abramowitz & Stegun 7.1.26 via erf; |err| < 1.5e-7 —
// far below model resolution).
function phi(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const e = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + e) : 0.5 * (1 - e);
}

/**
 * Build the pricing context from live standings rows — ONE simulate call, the
 * rest is closed-form. Same inputs champProbLive uses; null preseason for the
 * same reason (nothing measured yet — pending beats guessed).
 *
 * @param rows [{ owner_id, wins, losses, ties?, pf }]
 * @param gamesLeft regular-season games remaining
 */
function contextFromRows(rows, gamesLeft, opts = {}) {
  const clean = (rows || []).filter(r => r && r.owner_id != null);
  if (!clean.length) return null;
  const gp = r => (Number(r.wins) || 0) + (Number(r.losses) || 0) + (Number(r.ties) || 0);
  if (clean.some(r => gp(r) < 1)) return null;
  const means = clean.map(r => r.pf / gp(r));
  const leagueMean = means.reduce((a, b) => a + b, 0) / means.length;
  const strengths = {}, rec = {};
  for (const r of clean) {
    const g = gp(r), m = r.pf / g, wgt = g / (g + CH.CFG.SHRINK_K);
    strengths[r.owner_id] = { mean: wgt * m + (1 - wgt) * leagueMean, sd: CH.CFG.WEEKLY_SD };
    rec[r.owner_id] = { wins: Number(r.wins) || 0, pf: Number(r.pf) || 0, gp: g };
  }
  const model = CH.simulate({
    strengths, baseRec: rec, futureWeeks: Math.max(0, Number(gamesLeft) || 0),
    schedule: null, cut: 4, sims: opts.sims || CFG.SIMS, seed: opts.seed || CFG.SEED,
  });
  return { strengths, rec, model, gamesLeft: Math.max(0, Number(gamesLeft) || 0), weekNow: opts.weekNow || null };
}

/** P(team a outscores team b in one week): difference of independent Normals. */
function pHeadToHead(ctx, a, b) {
  const sa = ctx.strengths[a], sb = ctx.strengths[b];
  if (!sa || !sb) return null;
  return phi((sa.mean - sb.mean) / Math.sqrt(sa.sd * sa.sd + sb.sd * sb.sd));
}

/** P(subject posts the week's high score): ∫ φ_s(x) Π_{j≠s} Φ_j(x) dx. */
function pWeeklyHigh(ctx, subject) {
  const s = ctx.strengths[subject];
  if (!s) return null;
  const ids = Object.keys(ctx.strengths).map(Number).filter(id => id !== Number(subject));
  const lo = s.mean - CFG.GRID_SPAN_SD * s.sd, hi = s.mean + CFG.GRID_SPAN_SD * s.sd;
  const step = (hi - lo) / (CFG.GRID_STEPS - 1);
  let p = 0;
  for (let i = 0; i < CFG.GRID_STEPS; i++) {
    const x = lo + i * step;
    const dens = Math.exp(-((x - s.mean) ** 2) / (2 * s.sd * s.sd)) / (s.sd * Math.sqrt(2 * Math.PI));
    let others = 1;
    for (const j of ids) {
      const o = ctx.strengths[j];
      others *= phi((x - o.mean) / o.sd);
      if (others === 0) break;
    }
    p += dens * others * step;
  }
  return Math.min(1, Math.max(0, p));
}

/** Binomial upper tail: P(X >= k), X ~ Bin(n, q). Exact, n <= 14 here. */
function binomTail(n, q, k) {
  if (k <= 0) return 1;
  if (k > n) return 0;
  let p = 0;
  for (let i = k; i <= n; i++) {
    let c = 1;
    for (let j = 0; j < i; j++) c = c * (n - j) / (j + 1);
    p += c * Math.pow(q, i) * Math.pow(1 - q, n - i);
  }
  return p;
}

/**
 * P(one condition holds), with its derivation line — or {p: null, line} when
 * the model cannot price it, always saying which fact is out of reach.
 */
function priceCondition(c, ctx, nameOf) {
  const name = id => (nameOf ? nameOf(id) : `#${id}`);
  const s = ctx.strengths[Number(c.subject_id)];
  const say = (p, line) => ({ p, line });
  const cant = line => ({ p: null, line });

  // Pricing is for DECISIONS. A week already in play or behind us belongs to
  // the grading engine, not the price sheet.
  if (c.when === 'week' && ctx.weekNow != null && Number(c.week) < Number(ctx.weekNow)) {
    return cant(`week ${c.week} is already played — grading owns it, pricing doesn't`);
  }

  switch (c.test) {
    case 'outscores': {
      if (c.when === 'week') {
        const p = pHeadToHead(ctx, Number(c.subject_id), Number(c.target_id));
        if (p == null) return cant('a team in this bet has no measured strength row');
        return say(p, `P(${name(c.subject_id)} outscores ${name(c.target_id)} in wk ${c.week}) = ${(p * 100).toFixed(0)}% — strengths ${ctx.strengths[c.subject_id].mean.toFixed(1)} vs ${ctx.strengths[c.target_id].mean.toFixed(1)}, weekly sd ${CH.CFG.WEEKLY_SD}`);
      }
      const a = ctx.rec[Number(c.subject_id)], b = ctx.rec[Number(c.target_id)];
      const sb = ctx.strengths[Number(c.target_id)];
      if (!a || !b || !s || !sb) return cant('a team in this bet has no measured strength row');
      const g = ctx.gamesLeft;
      const gap = (a.pf + g * s.mean) - (b.pf + g * sb.mean);
      const sd = Math.sqrt(2 * g) * CH.CFG.WEEKLY_SD || 1e-9;
      const p = g > 0 ? phi(gap / sd) : (a.pf > b.pf ? 1 : 0);
      return say(p, `P(${name(c.subject_id)} out-points ${name(c.target_id)} on the season) = ${(p * 100).toFixed(0)}% — projected gap ${gap.toFixed(0)} pts over ${g} weeks left`);
    }
    case 'scores_at_least': {
      if (!s) return cant('no measured strength row for the subject');
      const need = Number(c.target_number);
      if (c.when === 'week') {
        const p = 1 - phi((need - s.mean) / s.sd);
        return say(p, `P(${name(c.subject_id)} scores ≥ ${need} in wk ${c.week}) = ${(p * 100).toFixed(0)}% — mean ${s.mean.toFixed(1)}, sd ${s.sd}`);
      }
      const r = ctx.rec[Number(c.subject_id)];
      const g = ctx.gamesLeft;
      const mean = r.pf + g * s.mean, sd = Math.sqrt(g) * s.sd || 1e-9;
      const p = g > 0 ? 1 - phi((need - mean) / sd) : (r.pf >= need ? 1 : 0);
      return say(p, `P(${name(c.subject_id)} totals ≥ ${need}) = ${(p * 100).toFixed(0)}% — on ${r.pf.toFixed(0)}, projecting ${mean.toFixed(0)}`);
    }
    case 'weekly_high': {
      const p = pWeeklyHigh(ctx, Number(c.subject_id));
      if (p == null) return cant('no measured strength row for the subject');
      return say(p, `P(${name(c.subject_id)} takes the wk ${c.week} high) = ${(p * 100).toFixed(0)}% — best-of-10 off measured strengths`);
    }
    case 'wins_at_least': {
      const r = ctx.rec[Number(c.subject_id)];
      if (!r || !s) return cant('no measured strength row for the subject');
      const need = Number(c.target_number);
      if (r.wins >= need) return say(1, `${name(c.subject_id)} already has ${r.wins} wins — done`);
      const others = Object.keys(ctx.strengths).map(Number).filter(id => id !== Number(c.subject_id));
      const q = others.reduce((sum, id) => sum + pHeadToHead(ctx, Number(c.subject_id), id), 0) / (others.length || 1);
      const p = binomTail(ctx.gamesLeft, q, need - r.wins);
      return say(p, `P(${name(c.subject_id)} reaches ${need} wins) = ${(p * 100).toFixed(0)}% — needs ${need - r.wins} of ${ctx.gamesLeft} at ~${(q * 100).toFixed(0)}%/game (random-opponent approximation)`);
    }
    case 'finishes': {
      const m = ctx.model[Number(c.subject_id)];
      if (!m) return cant('no simulated finishing odds for the subject');
      const map = {
        champion: [m.champ_prob, 'wins the title'],
        top2: [m.final_prob, 'reaches the final'],
        playoffs: [m.playoff_prob, 'makes the playoffs'],
        missed: [1 - m.playoff_prob, 'misses the playoffs'],
        last: [m.last_prob, 'finishes dead last'],
      };
      const hit = map[c.target_place];
      if (!hit) return cant(`finishing place '${c.target_place}' is not priced`);
      return say(hit[0], `P(${name(c.subject_id)} ${hit[1]}) = ${(hit[0] * 100).toFixed(0)}% — bracket Monte-Carlo (${CFG.SIMS} sims)`);
    }
    default:
      return cant(`condition '${c.test}' is not in the pricing vocabulary`);
  }
}

/**
 * Price one bet for one viewer: P(their side wins) and dollar EV.
 *
 * The viewer's side: on a proposition, `for_id` holds the claim; anyone else —
 * including someone eyeing an OPEN bet from the market — is against it, so
 * their p is the complement. On a pool with picks made, each side IS its
 * picks' title odds.
 *
 * @returns { priceable, p, ev, stake, verdict, lines, flag }  or
 *          { priceable: false, why, lines }
 */
function priceBet(bet, viewerId, ctx, nameOf) {
  const me = Number(viewerId);
  const no = why => ({ priceable: false, why, lines: [] });
  if (!ctx) return no('no measured season yet — pricing starts when real games exist');
  const stake = Math.abs(Number(bet.stake) || 0);
  if (!stake) return no('no stake — nothing to price');

  let p = null;
  const lines = [];

  if (bet.format === 'pool') {
    const parties = bet.parties || [];
    const mine = parties.find(x => Number(x.owner_id) === me);
    if (!mine) return no("you're not in this pool");
    const withPicks = parties.filter(x => (x.picks || []).length);
    if (withPicks.length < 2) return no('picks not made yet — price it once the franchise draft runs');
    const sideP = party => (party.picks || []).reduce((sum, t) => {
      const m = ctx.model[Number(t)];
      return sum + (m ? m.champ_prob : 0);
    }, 0);
    const pMine = sideP(mine);
    const pTheirs = withPicks.filter(x => x !== mine).reduce((sum, x) => sum + sideP(x), 0);
    const rest = Math.max(0, 1 - pMine - pTheirs);
    lines.push(`Your picks hold ${(pMine * 100).toFixed(0)}% of the title; theirs ${(pTheirs * 100).toFixed(0)}%.`);
    if (rest > 0.005) lines.push(`${(rest * 100).toFixed(0)}% of the title sits outside both sides — that falls to the pool's later rules, and this price does not guess them.`);
    // EV on the first-rule outcomes only; the unpriced remainder moves no money here.
    const winners = 1, losers = (bet.parties || []).length - 1;
    const ev = pMine * stake * losers / winners - pTheirs * stake;
    return finish(bet, pMine, ev, stake, lines, { decidedMass: pMine + pTheirs });
  }

  const cs = bet.conditions || [];
  if (!cs.length) return no('free-text terms — the model prices structure, not English');

  const priced = cs.map(c => priceCondition(c, ctx, nameOf));
  for (const r of priced) lines.push(r.line);
  if (priced.some(r => r.p == null)) return { priceable: false, why: 'a condition here is out of the model\'s reach (the lines say which)', lines };

  // ALL = product, ANY = complement-product — an independence assumption, and
  // the card says so whenever it actually bites (more than one condition).
  const ps = priced.map(r => r.p);
  const claim = bet.logic === 'any'
    ? 1 - ps.reduce((a, b) => a * (1 - b), 1)
    : ps.reduce((a, b) => a * b, 1);
  if (ps.length > 1) lines.push(`${ps.length} conditions combined as ${bet.logic === 'any' ? 'ANY' : 'ALL'} assuming independence — correlated conditions make the true number ${bet.logic === 'any' ? 'lower' : 'higher'} than this.`);

  const forId = Number(bet.for_id != null ? bet.for_id : bet.proposer_id);
  const iAmFor = me === forId;
  p = iAmFor ? claim : 1 - claim;
  lines.push(iAmFor ? 'You hold the claim.' : 'You are against the claim.');

  // Payout shape follows sidebets.buildLegs: every loser is out one stake, the
  // winners share it. FOR wins alone against N-1 stakes; AGAINST wins as a
  // group of N-1 sharing the one for-side stake. Two parties — the usual case
  // — makes both branches the plain (2p-1)·stake.
  const nParties = Math.max(2, (bet.parties || []).length + ((bet.parties || []).some(x => Number(x.owner_id) === me) ? 0 : 1));
  const opponents = nParties - 1;
  const ev = iAmFor
    ? p * stake * opponents - (1 - p) * stake
    : p * (stake / opponents) - (1 - p) * stake;
  return finish(bet, p, ev, stake, lines, {});
}

function finish(bet, p, ev, stake, lines, extra) {
  const flag = p >= CFG.ADVANTAGE_P ? 'advantageous' : p <= 1 - CFG.ADVANTAGE_P ? 'against' : 'fair';
  return {
    priceable: true,
    p: Math.round(p * 1000) / 1000,
    ev: Math.round(ev * 100) / 100,
    stake, flag, lines,
    ...extra,
  };
}

module.exports = { CFG, phi, contextFromRows, priceCondition, priceBet, pWeeklyHigh, binomTail };
