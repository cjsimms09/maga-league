// TERRITORY: A
// VARIANCE PORTFOLIO — tests: hand-computed variance cells, lineup-selection
// parity with archetype_season (rule 11), overlay band boundaries both
// sides, legality supremacy, absent-not-zero controls, pot-MC determinism
// and the $4,000 conservation identity, and committed-artifact consistency.
//
// Run: node draft/tests/variance_portfolio.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const VP = require(path.join(__dirname, '..', 'tools', 'variance_portfolio.js'));
const AS = require(path.join(__dirname, '..', 'tools', 'archetype_season.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };
const near = (a, b, eps) => Math.abs(a - b) <= eps;

const CLASSES = {
  'QB-WR1': { r_pooled: 0.4 }, 'QB-WR2': { r_pooled: 0.39 },
  'QB-TE1': { r_pooled: 0.33 }, 'WR1-WR2': { r_pooled: 0.01 },
};

// ── the pot, derived from the league office's own book ─────────────────────
{
  const pot = VP.potStructure(2026);
  ck('pot 2026: $100 x 15 weekly', pot.weekly === 100 && pot.weeks === 15);
  ck('pot 2026: reg $250/$125', JSON.stringify(pot.reg) === '[250,125]');
  ck('pot 2026: playoff $675/$575/$475/$400',
    JSON.stringify(pot.playoff) === '[675,575,475,400]');
  const total = pot.weekly * pot.weeks + pot.reg.concat(pot.playoff)
    .reduce((s, x) => s + x, 0);
  ck('IDENTITY: pot components sum to the $4,000 book', total === 4000);
}

// ── classRho: mapping cells + absent-not-zero ──────────────────────────────
{
  ck('QB-WR pair prices at the QB-WR1 class',
    VP.classRho(CLASSES, 'QB', 'WR') === 0.4
    && VP.classRho(CLASSES, 'WR', 'QB') === 0.4);
  ck('QB-TE prices at QB-TE1', VP.classRho(CLASSES, 'TE', 'QB') === 0.33);
  ck('WR-WR prices at WR1-WR2', VP.classRho(CLASSES, 'WR', 'WR') === 0.01);
  ck('RB pairs are ABSENT (null), never zero',
    VP.classRho(CLASSES, 'RB', 'WR') === null
    && VP.classRho(CLASSES, 'RB', 'RB') === null);
}

// ── startersForWeek: parity with archetype_season's scorer (rule 11) ───────
{
  // hand fixture with a flex flip: 3 RBs, 2 WRs, 1 TE.
  const roster = [
    { player_id: 'q', position: 'QB' },
    { player_id: 'r1', position: 'RB' }, { player_id: 'r2', position: 'RB' },
    { player_id: 'r3', position: 'RB' },
    { player_id: 'w1', position: 'WR' }, { player_id: 'w2', position: 'WR' },
    { player_id: 't1', position: 'TE' },
    { player_id: 'k', position: 'K' }, { player_id: 'd', position: 'DEF' },
  ];
  const pts = { q: 20, r1: 15, r2: 12, r3: 9, w1: 14, w2: 8, t1: 7, k: 6, d: 5 };
  const starters = VP.startersForWeek(roster, pts);
  const total = starters.reduce((s, p) => s + pts[p.player_id], 0);
  ck('hand fixture: starters sum equals AS.lineupPointsForWeek',
    total === AS.lineupPointsForWeek(roster, pts), { total });
  ck('hand fixture: flex is r3 (best remaining flex-eligible)',
    starters.some(p => p.player_id === 'r3'));
  // randomized parity sweep, seeded — many flex boundaries crossed.
  const rand = AS.mulberry32(424242);
  let agree = true;
  for (let t = 0; t < 200; t++) {
    const ro = [], wp = {};
    const npos = { QB: 2, RB: 4, WR: 4, TE: 2, K: 1, DEF: 1 };
    Object.keys(npos).forEach(pos => {
      for (let i = 0; i < npos[pos]; i++) {
        const id = pos + i;
        ro.push({ player_id: id, position: pos });
        wp[id] = Math.round(rand() * 300) / 10;
      }
    });
    const st = VP.startersForWeek(ro, wp);
    const sum = st.reduce((s, p) => s + wp[p.player_id], 0);
    if (!near(sum, AS.lineupPointsForWeek(ro, wp), 1e-9)) agree = false;
  }
  ck('RULE 11: 200 seeded rosters — startersForWeek total == '
    + 'AS.lineupPointsForWeek every time', agree);
}

// ── teamWeekVariance: hand-computed stack cell ─────────────────────────────
{
  const cvMap = { q: 0.5, w: 0.6, r: 0.7 };
  const cvOf = p => (cvMap[p.player_id] != null
    ? { cv: cvMap[p.player_id], fallback: false } : null);
  const starters = [
    { player_id: 'q', position: 'QB', team: 'CIN' },
    { player_id: 'w', position: 'WR', team: 'CIN' },
  ];
  const pts = { q: 20, w: 15 };
  // wsd_q = 10, wsd_w = 9; var = 100 + 81 + 2*0.4*10*9 = 253.
  const v = VP.teamWeekVariance(starters, pts, cvOf, CLASSES);
  ck('hand cell: QB+WR same team = own vars + 2*rho*wsd*wsd = 253',
    near(v.variance, 253, 1e-9), v);
  // different teams: covariance term vanishes.
  const v2 = VP.teamWeekVariance(
    [{ player_id: 'q', position: 'QB', team: 'CIN' },
      { player_id: 'w', position: 'WR', team: 'BAL' }], pts, cvOf, CLASSES);
  ck('different NFL teams: no covariance term', near(v2.variance, 181, 1e-9));
  // same-team RB pair: unmeasured class contributes NOTHING and is counted.
  const v3 = VP.teamWeekVariance(
    [{ player_id: 'r', position: 'RB', team: 'DET' },
      { player_id: 'w', position: 'WR', team: 'DET' }],
    { r: 10, w: 15 }, cvOf, CLASSES);
  ck('unmeasured class (RB-WR): absent-not-zero — no term, counted',
    near(v3.variance, 49 + 81, 1e-9) && v3.unmeasured_pairs === 1, v3);
  // unresolved cv (K): contributes nothing, counted.
  const v4 = VP.teamWeekVariance(
    [{ player_id: 'k', position: 'K', team: 'DET' }], { k: 8 },
    cvOf, CLASSES);
  ck('unresolved cv (K): zero contribution, counted as unresolved',
    v4.variance === 0 && v4.unresolved === 1);
}

// ── marginalVariance ───────────────────────────────────────────────────────
{
  const cvOf = p => (p.player_id === 'x' ? null
    : { cv: 0.5, fallback: false });
  const cand = { player_id: 'c', position: 'WR', team: 'CIN', proj_mean: 320 };
  const qb = { player_id: 'q', position: 'QB', team: 'CIN', proj_mean: 320 };
  // wsd both = 0.5*20 = 10; marginal = 100 + 2*0.4*10*10 = 180.
  ck('hand cell: marginal variance with a rostered same-team QB = 180',
    near(VP.marginalVariance(cand, [qb], cvOf, CLASSES), 180, 1e-9));
  ck('no same-team roster: marginal = own variance only',
    near(VP.marginalVariance(cand, [], cvOf, CLASSES), 100, 1e-9));
  ck('absent cv stays absent (null), never zero',
    VP.marginalVariance({ player_id: 'x', position: 'WR', proj_mean: 320 },
      [], cvOf, CLASSES) === null);
}

// ── chooseVariance: band boundaries, direction, legality supremacy ─────────
{
  const cvMap = { a: 0.3, b: 0.9, c: 0.5 };
  const cvOf = p => ({ cv: cvMap[p.player_id], fallback: false });
  const rec = (id, pos, score) => ({ player: { player_id: id, position: pos,
    team: 'T' + id, proj_mean: 160 }, score });
  const recs = [rec('a', 'WR', 100), rec('b', 'WR', 98.5), rec('c', 'RB', 97.9)];
  const tilt = VP.chooseVariance(recs, { roster: [] }, +1, cvOf, CLASSES, 2.0);
  ck('tilt takes the high-cv candidate INSIDE the band (non-vacuity control)',
    tilt.player.player_id === 'b', tilt.player);
  const avoid = VP.chooseVariance(recs, { roster: [] }, -1, cvOf, CLASSES, 2.0);
  ck('avoid takes the LOW-cv candidate', avoid.player.player_id === 'a');
  // band boundary both sides: gap exactly 2.0 is IN; 2.01 is OUT.
  const atBand = [rec('a', 'WR', 100), rec('b', 'WR', 98.0)];
  ck('gap exactly = band is inside',
    VP.chooseVariance(atBand, { roster: [] }, +1, cvOf, CLASSES, 2.0)
      .player.player_id === 'b');
  const pastBand = [rec('a', 'WR', 100), rec('b', 'WR', 97.99)];
  ck('gap past the band defers to the engine',
    VP.chooseVariance(pastBand, { roster: [] }, +1, cvOf, CLASSES, 2.0)
      .player.player_id === 'a');
  // legality supremacy: a forced rec is NEVER overridden.
  const forced = [Object.assign(rec('a', 'WR', 100), { forced: true }),
    rec('b', 'WR', 99)];
  ck('forced pick is never overridden (legality owns it)',
    VP.chooseVariance(forced, { roster: [] }, +1, cvOf, CLASSES, 2.0)
      .player.player_id === 'a');
  const warned = [Object.assign(rec('a', 'WR', 100),
    { legality_warning: 'next pick forced' }), rec('b', 'WR', 99)];
  ck('legality warning defers to the engine',
    VP.chooseVariance(warned, { roster: [] }, +1, cvOf, CLASSES, 2.0)
      .player.player_id === 'a');
  // K/DEF never chosen by preference.
  const kdef = [rec('a', 'WR', 100),
    Object.assign(rec('k', 'K', 99.5), {}), rec('b', 'WR', 99)];
  cvMap.k = 9.9;
  ck('a onesie inside the band is never chosen by the overlay',
    VP.chooseVariance(kdef, { roster: [] }, +1, cvOf, CLASSES, 2.0)
      .player.player_id === 'b');
}

// ── potSeasonMC: determinism + the conservation identities ─────────────────
{
  const pot = VP.potStructure(2026);
  const teams = {};
  for (let i = 1; i <= 10; i++) {
    teams[i] = { means: Array(15).fill(100 + i * 0.01),
      sds: Array(15).fill(20 + (i % 3)) };
  }
  const a = VP.potSeasonMC(teams, { sims: 400, seed: 7, pot });
  const b = VP.potSeasonMC(teams, { sims: 400, seed: 7, pot });
  ck('determinism: same seed, same result byte for byte',
    JSON.stringify(a) === JSON.stringify(b));
  const c = VP.potSeasonMC(teams, { sims: 400, seed: 8, pot });
  ck('seed variation moves the result (non-vacuity)',
    JSON.stringify(a) !== JSON.stringify(c));
  ck('no weekly ties occurred (continuous draws)', a._weekly_ties === 0);
  const ids = Object.keys(teams);
  const sum = k => ids.reduce((s, id) => s + a[id][k], 0);
  const sumD = k => ids.reduce((s, id) => s + a[id].dollars[k], 0);
  ck('IDENTITY: every simulated season pays out exactly $4,000',
    near(sumD('total'), 4000, 1e-6), sumD('total'));
  ck('IDENTITY: weekly dollars = $1,500, reg = $375, playoff = $2,125',
    near(sumD('weekly'), 1500, 1e-6) && near(sumD('reg'), 375, 1e-6)
    && near(sumD('playoff'), 2125, 1e-6));
  ck('IDENTITY: playoff probs sum to exactly 4', near(sum('playoff_prob'), 4, 1e-9));
  ck('IDENTITY: bottom-3 probs sum to exactly 3', near(sum('bottom3_prob'), 3, 1e-9));
  ck('IDENTITY: champ probs sum to exactly 1', near(sum('champ_prob'), 1, 1e-9));
  ck('IDENTITY: p_high sums to 1 (one strict high per week)',
    near(sum('p_high'), 1, 1e-9));
  // variance monotonicity control: a higher-sd team in an equal-mean field
  // takes the weekly high more often (the mechanism, isolated).
  const eq = {};
  for (let i = 1; i <= 10; i++) {
    eq[i] = { means: Array(15).fill(100),
      sds: Array(15).fill(i === 1 ? 30 : 20) };
  }
  const m = VP.potSeasonMC(eq, { sims: 3000, seed: 11, pot });
  ck('mechanism control: the high-sd team wins the week more often than 1/10',
    m[1].p_high > 0.12 && m[2].p_high < 0.105, { p1: m[1].p_high, p2: m[2].p_high });
  ck('both tails: the high-sd team also takes the weekly LOW more often',
    m[1].p_low > 0.12, m[1].p_low);
}

// ── the committed artifact ─────────────────────────────────────────────────
{
  const art = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'data', 'variance_portfolio.json'), 'utf8'));
  ck('artifact: territory first', art._territory.indexOf('TERRITORY: A') === 0);
  ck('artifact: prereg pointer + commit recorded',
    art.prereg.indexOf('edge_hunt_2026-08-16') >= 0
    && art.prereg.indexOf('eb367719') >= 0);
  ck('artifact: 120 paired rooms, 3 arms, tie band = engine TIE_THRESHOLD',
    art.rooms === 120 && art.arms.length === 3 && art.tie_band === 2);
  ck('artifact: no room crashed',
    art.arms.every(a => art.summary[a].crashed === 0));
  ck('artifact: shipped arm never diverges from the engine',
    art.summary.shipped.overlay_diverged_picks_per_room === 0);
  ck('artifact: tilt arm DID act (non-vacuous overlay)',
    art.summary.var_tilt.overlay_diverged_picks_per_room > 0);
  const t = art.paired_vs_shipped.var_tilt;
  ck('artifact: paired deltas carry n and CI in both sd treatments',
    t.cal.dollars_total.n === 120 && t.raw.dollars_total.ci95.length === 2);
  // The preregistered decision rule, recomputed from the artifact itself:
  // CI-clear positive total in BOTH treatments AND sign-stable batches.
  const ciClear = ['cal', 'raw'].every(tr => t[tr].dollars_total.ci95[0] > 0);
  const stable = art.batches.var_tilt.every(b0 => b0.d_dollars_total_cal > 0)
    && art.batches.var_tilt.every(b0 => b0.d_dollars_total_raw > 0);
  ck('decision rule recompute: prepared-diff condition is '
    + (ciClear && stable ? 'MET' : 'NOT met — null stands, no diff prepared'),
  true, { ciClear, stable });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
