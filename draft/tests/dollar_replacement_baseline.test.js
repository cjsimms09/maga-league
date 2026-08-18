// TERRITORY: A
// THE E[$] NUMBER HAS NO REPLACEMENT LEVEL IN IT, SO CROSS-POSITION IT PREFERS
// QUARTERBACKS WHO ARE WORSE THAN A FREE ONE.
//
// Sibling of dollar_terms_independence.test.js, found the same way and in the
// same currency: every number correct, every number correctly rendered, and the
// SENTENCE Cory takes away is false. That file's defect was one signal shown as
// two. This one is a comparison made in the wrong units.
//
// ── THE ARITHMETIC ────────────────────────────────────────────────────────
//
//     playerDollars(p) = DG_HIGH_K x (ceiling - mean) + (DG_ENTRY_K + DG_RS_K) x mean
//
// `p.position` does not appear. It is RAW PROJECTED POINTS, priced. Every other
// value surface in this tool is denominated in points OVER REPLACEMENT — the
// board's own `overall_rank` is VORP, and `draft_data.json` carries the levels
// it used right there in the same file:
//
//     RB 179.3 · WR 162.6 · TE 136.4 · QB 341.72
//
// A 10-team, 1-QB league makes QB replacement roughly TWICE every other
// position's, because the 10th-best quarterback is a very good football player
// and the 10th-best tight end is not. Pricing raw points therefore hands every
// quarterback a ~342-point head start that no other position gets.
//
// ── WHAT THAT DOES ON THE LIVE BOARD (measured 2026-08-18) ────────────────
//
//   · 22 of the top 25 by E[$] are QBs. By the board's own overall_rank: 1.
//   · The compare tray says "Jaxson Dart +$23" over Saquon Barkley, and
//     "Jordan Love +$36" over Brock Bowers. Dart is overall_rank 86 and
//     13.2 points BELOW the QB replacement level; Love is 93 and 19.2 below.
//   · Malik Willis — overall_rank 137, FORTY-SIX POINTS below replacement —
//     prices at $77.8, above Bijan Robinson (overall_rank 2) at $70.2.
//
// ── SCOPE, AND IT IS THE HALF THAT MATTERS ────────────────────────────────
//
// THE RECOMMENDATIONS ARE NOT AFFECTED. `recommend()` never calls this; the
// value term is VORP. `playerDollars` reaches exactly three surfaces, all of
// them comparison/display: the compare tray (`dollarGap`, app.js:4829), the
// doctrine banner (app.js:7872) and `doctrinePathKey` (app.js:8186).
//
// AND THE CODEBASE ALREADY AGREES WITH THIS ARGUMENT — it just applied it to
// the wrong position. `dollarGap` REFUSES a cross-position comparison involving
// K or DEF (the D10a ruling, engine.js:3239) on the grounds that it "would
// compare two constructions". The QB case is the same objection with a bigger
// number and, unlike D10a's, it is measurable today.
//
// Run: node draft/tests/dollar_replacement_baseline.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const B = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const REP = (B.replacement && B.replacement.replacement_points) || {};
const D = p => E.playerDollars(p).total;
const over = p => (p.proj_mean || 0) - (REP[p.position] || 0);
const PRICED = B.players.filter(p => Number.isFinite(+p.proj_mean) && +p.proj_mean > 0);

// ── 1. THE STRUCTURAL FACT. This half is permanent and survives any fix to the
//      surfaces — it is what `playerDollars` IS. ─────────────────────────────
{
  ck('the board still publishes the replacement levels the rest of the tool uses',
    ['QB', 'RB', 'WR', 'TE'].every(k => Number.isFinite(REP[k])), REP);

  /* Two players identical in every field the formula reads, differing ONLY in
   * position. If the price moves, position is priced; it does not, so it is not.
   * This is the whole defect in four lines and it needs no board at all. */
  const a = { position: 'QB', proj_mean: 300, proj_ceiling: 360 };
  const b = { position: 'TE', proj_mean: 300, proj_ceiling: 360 };
  ck('E[$] is IDENTICAL for a QB and a TE with identical projections — the '
    + 'formula never reads p.position, so no replacement level can be in it',
  Math.abs(D(a) - D(b)) < 1e-12, { qb: D(a), te: D(b) });

  ck('...while their VALUE OVER REPLACEMENT differs by the gap between the two '
    + 'levels, which is what every other surface in the tool is denominated in',
  Math.abs((over(a) - over(b)) - (REP.TE - REP.QB)) < 1e-9,
  { qb_vorp: over(a), te_vorp: over(b), delta: over(a) - over(b) });

  /* CONTROL — the formula is not simply constant. It must still respond to the
   * two things it does read, or the two checks above would pass vacuously.
   *
   * ⚠️ THE MEAN CONTROL HAD TO BE REWRITTEN AND THE REASON IS WORTH KEEPING.
   * The first version raised `proj_mean` by 1 with `proj_ceiling` HELD FIXED and
   * it FAILED — the price went DOWN. That is real arithmetic, not a bug:
   *
   *     d(total)/d(mean) at fixed ceiling = -DG_HIGH_K + DG_ENTRY_K + DG_RS_K
   *                                       = -0.22 + 0.13 = -0.09
   *
   * because `boom = ceiling - mean` shrinks faster than the mean terms grow.
   * IT IS NOT A SECOND DEFECT, and I checked before saying so: no player on the
   * board has a ceiling below their mean (ratio min 1.038, median 1.445), and
   * along the ray a real player actually moves on — ceiling proportional to mean
   * — the price is mean x (DG_HIGH_K x ratio - 0.09), rising for every ratio
   * above 0.409. Holding the ceiling fixed while the mean moves is a
   * perturbation this board never makes. So the control scales both, which is
   * the question the control was trying to ask. */
  const scaled = { position: 'QB', proj_mean: 303, proj_ceiling: 363.6 };  // same 1.20 ratio
  ck('CONTROL: the price rises with a proportional increase in projection',
    D(scaled) > D({ position: 'QB', proj_mean: 300, proj_ceiling: 360 }),
    { base: D({ position: 'QB', proj_mean: 300, proj_ceiling: 360 }), scaled: D(scaled) });
  ck('CONTROL: the price does move with proj_ceiling',
    D({ position: 'QB', proj_mean: 300, proj_ceiling: 361 }) > D(a));
  ck('and the stated fixed-ceiling slope is exactly -0.09, so the paragraph '
    + 'above is arithmetic rather than a story about it',
  Math.abs((D({ position: 'QB', proj_mean: 301, proj_ceiling: 360 }) - D(a))
           - (E.CFG.DG_ENTRY_K + E.CFG.DG_RS_K - E.CFG.DG_HIGH_K)) < 1e-9);
  ck('CONTROL for that: no board player has a ceiling below their mean, which '
    + 'is what keeps the fixed-ceiling slope off every real comparison',
  PRICED.filter(p => p.proj_ceiling != null && p.proj_ceiling < p.proj_mean).length === 0);
}

// ── 2. THE MEASURED CONSEQUENCE ON THE LIVE BOARD. ────────────────────────────
//      ⚠️ CHARACTERIZATION, NOT A REQUIREMENT. These assertions describe a
//      DEFECT. When A rules and the fix lands they will go red, and that is the
//      fix reporting itself — DELETE THIS BLOCK IN THAT COMMIT rather than
//      relaxing it. Register row 5e.
{
  ck('enough priced players to measure this', PRICED.length >= 300, PRICED.length);

  const byDollars = PRICED.slice().sort((x, y) => D(y) - D(x));
  const byRank = PRICED.slice().sort((x, y) => (x.overall_rank || 9999) - (y.overall_rank || 9999));
  const qbIn = arr => arr.slice(0, 25).filter(p => p.position === 'QB').length;

  ck('DEFECT: the top 25 by E[$] is overwhelmingly QB while the board\'s own '
    + 'top 25 is not — the same players, two orderings, one screen',
  qbIn(byDollars) >= 15 && qbIn(byRank) <= 5,
  { top25_qb_by_dollars: qbIn(byDollars), top25_qb_by_overall_rank: qbIn(byRank) });

  /* The sharpest single statement of it: players the E[$] model prices above the
   * board's own #2 overall, who are below their OWN position's replacement level
   * — i.e. worse than a quarterback nobody would have to draft. */
  const anchor = byRank.find(p => (p.overall_rank || 9999) === 2) || byRank[1];
  const abovePriced = PRICED.filter(p => D(p) > D(anchor));
  const belowRep = abovePriced.filter(p => over(p) < 0);
  ck('DEFECT: below-replacement players are priced above the board\'s #2 overall',
    belowRep.length > 0,
    { anchor: anchor.name, anchor_dollars: +D(anchor).toFixed(1),
      priced_above: abovePriced.length, of_which_below_replacement: belowRep.length,
      worst: belowRep.sort((x, y) => over(x) - over(y)).slice(0, 3)
        .map(p => `${p.name} (${p.position}, ovr#${p.overall_rank}, VORP ${over(p).toFixed(1)}, $${D(p).toFixed(1)})`) });
}

// ── 3. WHERE THE DAMAGE IS, AND WHERE IT IS NOT — the scoping measurement that
//      says a blanket refusal would be the wrong fix. ─────────────────────────
{
  // Cory's realistic window; K/DEF are already refused by D10a so they are out.
  const POOL = PRICED.filter(p => (p.adjusted_adp || p.adp || 9999) <= 160
    && p.position !== 'K' && p.position !== 'DEF');
  const disagree = (pa, pb) => {
    const A = POOL.filter(p => p.position === pa), Bs = POOL.filter(p => p.position === pb);
    let n = 0, d = 0;
    A.forEach(x => Bs.forEach(y => {
      if (x === y || (pa === pb && x.name > y.name)) return;
      n++;
      const s1 = Math.sign(D(x) - D(y)), s2 = Math.sign(over(x) - over(y));
      if (s1 && s2 && s1 !== s2) d++;
    }));
    return n ? d / n : 0;
  };
  ck('the window has enough players to make these rates mean something',
    POOL.length >= 100, POOL.length);

  const within = Math.max(disagree('RB', 'RB'), disagree('WR', 'WR'));
  const qbCross = Math.min(disagree('QB', 'RB'), disagree('QB', 'WR'), disagree('QB', 'TE'));
  const nonQbCross = Math.max(disagree('RB', 'WR'), disagree('RB', 'TE'), disagree('WR', 'TE'));

  /* WITHIN POSITION THE TWO CURRENCIES AGREE, and they must: over-replacement is
   * a constant shift there, so the only way they can differ is the boom term
   * out-voting the mean — which is the model working as designed, not a defect.
   * This is the control that keeps the QB number below from being an artifact of
   * comparing two arbitrary orderings. */
  ck('CONTROL: within a position the two currencies mostly agree (<15%)',
    within < 0.15, +(within * 100).toFixed(1));

  ck('DEFECT: any comparison involving a QB is near a coin flip (>40% inverted)',
    qbCross > 0.40, { qb_rb: +(disagree('QB', 'RB') * 100).toFixed(1),
      qb_wr: +(disagree('QB', 'WR') * 100).toFixed(1),
      qb_te: +(disagree('QB', 'TE') * 100).toFixed(1) });

  ck('...and cross-position WITHOUT a QB is far milder, which is why the fix is '
    + 'scoped to QB rather than banning cross-position comparison outright',
  nonQbCross < qbCross - 0.10,
  { worst_non_qb_cross: +(nonQbCross * 100).toFixed(1), mildest_qb_cross: +(qbCross * 100).toFixed(1) });
}

// ── 4. THE DOCTRINE BANNER'S SILENCE IS THE SAME DEFECT WEARING A HAT. ────────
//      Register row 4x asked why nine doctrines produce one score. `scoreBoard`
//      takes max-dollars over the allowed pool, the top of the board by dollars
//      is ALWAYS a quarterback, so the only constraints that can ever bite are
//      the ones that forbid QB. That is a sharper answer than "on a full board
//      almost no constraint binds", and it predicts exactly which ones do.
{
  const DD = require(path.join(ROOT, 'public', 'js', 'draft', 'doctrine.js'));
  const ents = PRICED.map(p => ({ player: p }));
  const roster = (B.kept_players || []).map(k => ({ position: k.position || k.pos }));
  const top = PRICED.slice().sort((x, y) => D(y) - D(x))[0];
  ck('the man topping the board by E[$] is a QB — the premise of everything below',
    top.position === 'QB', { name: top.name, position: top.position });

  const at = i => DD.scoreBoardDetail(ents, { liveIndex: i, roster,
    dollarsOf: p => E.playerDollars(p).total });
  const bindersAt = i => Object.keys(at(i)).filter(k => at(i)[k].binds).sort();

  ck('at live pick 1 the ONLY doctrine that binds is late_qb, the one that '
    + 'forbids exactly the position sitting on top of the price list',
  JSON.stringify(bindersAt(1)) === JSON.stringify(['late_qb']), bindersAt(1));

  ck('from live pick 8 — where late_qb stops forbidding QB — NOTHING binds and '
    + 'all nine doctrines return the same number',
  bindersAt(8).length === 0
    && new Set(Object.values(at(8)).map(x => x.score)).size === 1,
  { binds: bindersAt(8), distinct_scores: new Set(Object.values(at(8)).map(x => x.score)).size });

  /* CONTROL for the two above: scoreBoardDetail CAN report a bind and a spread,
   * so "nothing binds" at pick 8 is a fact about the board and not a probe that
   * cannot fire. Rule 3e — and this control exists because the FIRST version of
   * this measurement passed `roster: []` and `p.vorp` as the price, and reported
   * numbers that belong to no surface anybody looks at. */
  const qb = PRICED.filter(p => p.position === 'QB').sort((x, y) => D(y) - D(x))[0];
  const ctl = DD.scoreBoardDetail([{ player: qb }].concat(
    PRICED.filter(p => p.position !== 'QB').sort((x, y) => D(y) - D(x)).slice(0, 40)
      .map(p => ({ player: p }))),
  { liveIndex: 3, roster, dollarsOf: p => E.playerDollars(p).total });
  ck('CONTROL: the same call DOES produce a bind and a strictly lower score when '
    + 'a constraint actually bites',
  ctl.late_qb.binds && ctl.late_qb.score < ctl.balanced.score,
  { late_qb: ctl.late_qb.score, balanced: ctl.balanced.score });
}

// ── 5. AND IT REACHES THE PATHS PANEL, WHICH IS THE ONE CORY READS AT 8s/PICK.
//      `doctrinePathKey` (app.js:8175) walks every path's candidates and returns
//      the key of whichever holds the highest E[$] the enrolled doctrine allows;
//      `renderPaths` then badges that row "◆ the <plan> branch". `computePaths`
//      emits ONE PATH PER POSITION. So if the QB path's best man tops the price
//      list, the badge lands on the QB row — and it does, at nearly every pick.
//
//      THIS MEASURES THE INPUTS, NOT A COPY OF THE FUNCTION. `doctrinePathKey`
//      lives inside app.js's IIFE and is not exported, so reimplementing it here
//      would be a test agreeing with itself (rule 10d). What is asserted is the
//      property that decides its answer: the max-E[$] candidate across the real
//      `computePaths` output, at Cory's real picks, off his real keeper roster.
{
  const L = B.league;
  const pool = B.players.filter(p => p.position && p.proj_mean != null && p.vorp != null);
  const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
    : (p.raw_adp != null ? +p.raw_adp : 9999));
  const byAdp = pool.slice().sort((x, y) => adpOf(x) - adpOf(y));
  /* Keepers are REMOVED from `players`, so an id join returns nothing. That is
   * the same mistake that made my first 4x measurement worthless — `roster: []`
   * — so it is spelled out rather than left to a silent empty array. */
  const roster = B.kept_players || [];
  ck('the keeper roster is non-empty — the input that made the first version of '
    + 'this measurement meaningless', roster.length >= 3, roster.length);

  const mine = ((B.pick_order || {}).my_picks || []).slice(0, 4);
  ck('Cory has real picks to measure at', mine.length === 4, mine);

  const topPathPos = [];
  mine.forEach(PICK => {
    const taken = new Set(byAdp.slice(0, PICK - 1).map(p => String(p.player_id)));
    const board = pool.filter(p => !taken.has(String(p.player_id)));
    const ctx = { board, roster, league: L, currentPick: PICK, nextPick: PICK + 10,
      totalPicks: 147, myPicksLeft: 8, roundsLeft: 8,
      runMultipliers: {}, intervening: [], weights: E.MEASURED_WEIGHTS };
    const recs = E.recommend(ctx).filter(x => E.scoreable(x));
    const paths = E.computePaths(ctx, recs);
    let bestPos = null, bestD = -Infinity;
    paths.forEach(pa => (pa.candidates || []).forEach(c => {
      const p = c.player || c;
      if (D(p) > bestD) { bestD = D(p); bestPos = p.position; }
    }));
    topPathPos.push({ pick: PICK, pos: bestPos, dollars: +bestD.toFixed(1),
      offered: paths.map(pa => pa.pos).join('/') });
  });

  ck('CONTROL: the paths panel actually produces multiple directions at every '
    + 'pick measured, so "the QB one wins" is a choice and not the only option',
  topPathPos.every(r => r.offered.split('/').length >= 2), topPathPos);

  /* CHARACTERIZATION — goes red when 5e is fixed. Delete with §2 and §3. */
  const qbWins = topPathPos.filter(r => r.pos === 'QB').length;
  ck('DEFECT: the highest-E[$] candidate across all offered paths is a QB at '
    + 'most of Cory\'s picks, so the "◆ the <plan> branch" badge lands on the QB '
    + 'row — including where that QB is below replacement',
  qbWins >= 3, topPathPos);
}

// ── 6. ⛔ AND THE OBVIOUS FIX IS WORSE THAN THE DEFECT ON THE PAIRS THAT MATTER.
//      THIS BLOCK EXISTS TO STOP A GOOD-FAITH IMPROVEMENT, and it is here because
//      I nearly shipped that improvement myself. A first pass re-priced the same
//      formula on `max(0, mean - replacement)` and looked decisive: the top-25
//      median rank delta against the board's own ordering fell 55 slots to 21,
//      and the top 20 turned from twenty quarterbacks into a plausible board.
//
//      That comparison was rigged, though not on purpose: it measured the two
//      candidate currencies against EACH OTHER, which cannot say which is closer
//      to the ordering the tool already trusts. **The neutral test is each one
//      against `vorp`**, and it reverses on every decision-relevant subset:
//
//         subset (window ADP<=160, K/DEF excluded)        raw-$   over-repl
//         all cross-position pairs                        33.5%     32.0%
//         a QB on one side                                51.6%     42.0%
//         within 20 ADP of each other                     40.1%     41.8%   worse
//         a QB on one side AND within 20 ADP              31.9%     33.1%   worse
//         NO QB either side  (the control)                22.8%     26.1%   worse
//
//      Re-pricing wins only on the aggregate QB set, which is dominated by pairs
//      nobody weighs against each other (an elite QB against a fringe receiver).
//      Restricted to players Cory could actually be choosing between, it LOSES.
//      The mechanism is visible in the formula: `boom = ceiling - mean` is
//      replacement-INVARIANT by construction, so subtracting a level fixes only
//      the mean half, and near replacement `max(0, mean - R)` collapses toward
//      zero and hands the whole ranking to a boom term still denominated in raw
//      points. **A real fix has to re-denominate the boom term too, which is a
//      value-model change and not a four-line patch.**
//
//      So the recommendation on register 5e is a REFUSAL, in the shape of the
//      K/DEF refusal already ruled — never a re-pricing.
{
  const POOL = PRICED.filter(p => (p.adjusted_adp || p.adp || 9999) <= 160
    && p.position !== 'K' && p.position !== 'DEF');
  const adp = p => (p.adjusted_adp || p.adp || 9999);
  const OVR = p => {
    const m = Math.max(0, (p.proj_mean || 0) - (REP[p.position] || 0));
    const c = p.proj_ceiling != null ? p.proj_ceiling : p.proj_mean;
    return E.CFG.DG_HIGH_K * Math.max(0, c - (p.proj_mean || 0))
      + (E.CFG.DG_ENTRY_K + E.CFG.DG_RS_K) * m;
  };
  const vsVorp = (f, keep) => {
    let n = 0, d = 0;
    for (let i = 0; i < POOL.length; i++) {
      for (let j = i + 1; j < POOL.length; j++) {
        const x = POOL[i], y = POOL[j];
        if (x.position === y.position) continue;
        if (keep && !keep(x, y)) continue;
        n++;
        const s1 = Math.sign(f(x) - f(y)), s2 = Math.sign((x.vorp || 0) - (y.vorp || 0));
        if (s1 && s2 && s1 !== s2) d++;
      }
    }
    return { n, pct: n ? d / n : 0 };
  };

  const near = (x, y) => Math.abs(adp(x) - adp(y)) <= 20;
  const noQb = (x, y) => x.position !== 'QB' && y.position !== 'QB';

  const rawQb = vsVorp(D, (x, y) => !noQb(x, y));
  const ovrQb = vsVorp(OVR, (x, y) => !noQb(x, y));
  ck('CONTROL: the re-pricing DOES help where the defect is loudest — QB pairs '
    + 'in aggregate improve, so this block is not simply rejecting everything',
  ovrQb.pct < rawQb.pct - 0.05,
  { raw: +(rawQb.pct * 100).toFixed(1), over_replacement: +(ovrQb.pct * 100).toFixed(1) });

  const rawNear = vsVorp(D, near), ovrNear = vsVorp(OVR, near);
  ck('⛔ but on pairs within 20 ADP — the only ones he actually weighs against '
    + 'each other — re-pricing is WORSE, so it is not the fix',
  ovrNear.pct > rawNear.pct, { pairs: rawNear.n,
    raw: +(rawNear.pct * 100).toFixed(1), over_replacement: +(ovrNear.pct * 100).toFixed(1) });

  const rawNo = vsVorp(D, noQb), ovrNo = vsVorp(OVR, noQb);
  ck('⛔ and on pairs with NO quarterback at all it is worse again — the fix '
    + 'would damage the RB-vs-WR comparison to repair the QB one',
  ovrNo.pct > rawNo.pct, { pairs: rawNo.n,
    raw: +(rawNo.pct * 100).toFixed(1), over_replacement: +(ovrNo.pct * 100).toFixed(1) });

  ck('the sample behind those two refusals is large enough to act on',
    rawNear.n > 500 && rawNo.n > 1000, { near: rawNear.n, no_qb: rawNo.n });

  /* THE MECHANISM, ASSERTED RATHER THAN NARRATED: boom survives the subtraction
   * untouched, which is why fixing the mean half alone cannot work. */
  const p1 = { position: 'QB', proj_mean: 380, proj_ceiling: 470 };
  const bareBoom = q => E.CFG.DG_HIGH_K * Math.max(0, q.proj_ceiling - q.proj_mean);
  ck('boom is replacement-INVARIANT by construction — (ceil-R)-(mean-R) is '
    + 'ceil-mean — so a level subtraction cannot touch it',
  Math.abs((OVR(p1) - (E.CFG.DG_ENTRY_K + E.CFG.DG_RS_K)
            * Math.max(0, p1.proj_mean - REP.QB)) - bareBoom(p1)) < 1e-9);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
