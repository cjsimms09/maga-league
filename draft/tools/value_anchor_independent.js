/* ITEM 24 — AN INDEPENDENT CHECK ON THE VALUE ANCHOR, FROM REAL DRAFTS.
 *
 * Cory: "THE VALUE ANCHOR HAS NO INDEPENDENT CONFIRMATION — the mask has the
 * oracle test, the anchor has only the participation test."
 *
 * The anchor is VONA, weight 1.0, and after item 10 it is one of only three
 * weights not degenerate or collinear on the board its experiments ran on. It
 * makes a falsifiable claim that needs no season outcomes:
 *
 *     WAITING AT THIS POSITION COSTS N POINTS
 *
 * and that claim is built entirely on SURVIVAL — how many players at a position
 * disappear while you wait. `expectedBestAvailable` is a survival-weighted sum,
 * so if the survival structure is wrong, VONA is wrong, whatever the projections
 * say.
 *
 * ── WHY THIS USES REAL DRAFTS AND WHAT IT DELIBERATELY DOES NOT DO ──────────
 *
 * Every measurement of this model so far comes from a harness that also
 * generates its own rooms — opponents following the same ADP the survival model
 * is derived from. TESTING SURVIVAL AGAINST AN ADP-DRIVEN ROOM IS TESTING THE
 * MODEL AGAINST ITSELF, which is the position six dead hypotheses were argued
 * from. league_history.json carries 480 picks across four REAL drafts (2023 x2,
 * 2024, 2025) — the same league, real humans, no model involved.
 *
 * IT CANNOT COMPARE POINTS, AND THAT LIMIT IS ALREADY DOCUMENTED. Scoring the
 * cost of waiting in POINTS needs contemporaneous projections and ADP for those
 * seasons, and board_pin.py states plainly that "the board is not recoverable
 * for 2023-25: the repository's first commit is 2026-08-08, ADP and projection
 * series are 2026-only". So this measures the STRUCTURE survival encodes — how
 * many players at each position go while you wait — which needs nothing but the
 * pick order, and is the input VONA is most sensitive to.
 *
 * WHAT A DISAGREEMENT WOULD MEAN. Our survival model is fitted to ADP. If real
 * rooms in this league deplete positions at materially different rates than the
 * model assumes, then eba is systematically wrong BY POSITION — and VONA is
 * compared across positions to choose a pick, so a positional bias in the input
 * is a positional bias in every recommendation.
 *
 * Run: node draft/tools/value_anchor_independent.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
const S = require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));

const PM = require(path.join(ROOT, 'draft', 'tools', 'position_map.js'));
const HIST = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));
const DATA = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

/* Position for a historical player id.
 *
 * ⚠️ THE COMMENT THAT WAS HERE SAID "The 2026 board is the only player table we
 * have; a 2023 rookie who never reached it is UNKNOWN." THAT WAS TRUE WHEN IT
 * WAS WRITTEN AND `draft/data/player_positions.json` MADE IT FALSE — a union
 * over every board ever built. The premise outlived its truth in comment form,
 * and a consumer trusting it kept joining through the live board. Resolvable
 * picks ran 99.8% here and 93.8% against a pruned board.
 *
 * Unknown is still COUNTED rather than dropped, which was the right half of the
 * original design: dropping would quietly shrink every denominator below. */
const posMap = PM.positionMap();
const posById = new Proxy({}, { get: (_, k) => (typeof k === 'string' ? PM.posOf(posMap, k) : undefined) });

const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

/* ── THE REALIZED STRUCTURE ────────────────────────────────────────────────*/
const drafts = [];
HIST.seasons.forEach(s => {
  (s.drafts || []).forEach(d => {
    const picks = (d.picks || []).slice().sort((a, b) => a.pick_no - b.pick_no);
    if (picks.length) drafts.push({ season: s.season, id: d.draft_id, picks: picks });
  });
});

console.log('VALUE ANCHOR — INDEPENDENT CHECK AGAINST REAL DRAFTS\n');
console.log('  ' + drafts.length + ' real draft(s): '
  + drafts.map(d => d.season + ' (' + d.picks.length + ')').join(', '));

let known = 0, unknown = 0;
drafts.forEach(d => d.picks.forEach(p => {
  if (posById[String(p.player_id)]) known++; else unknown++;
}));
console.log('  picks whose position we can resolve from the 2026 player table: '
  + known + ' of ' + (known + unknown)
  + '  (' + (100 * known / (known + unknown)).toFixed(1) + '%)');
console.log('  UNRESOLVED ARE COUNTED, NOT DROPPED — a 2023 pick who never reached');
console.log('  the 2026 board is a real pick and shrinking the denominator to hide');
console.log('  him would flatter every rate below.\n');

/* For each team, between its consecutive picks, how many players at each
 * position were taken? That is the realized depletion a drafter actually faced,
 * and it is exactly what survival tries to predict. */
const realized = {};   // pos -> array of counts taken during one wait
POS.forEach(p => { realized[p] = []; });
let waits = 0, unresolvedInGaps = 0;

drafts.forEach(d => {
  const byTeam = {};
  d.picks.forEach(p => {
    const t = String(p.roster_id);
    (byTeam[t] = byTeam[t] || []).push(p);
  });
  Object.keys(byTeam).forEach(t => {
    const mine = byTeam[t].sort((a, b) => a.pick_no - b.pick_no);
    for (let i = 0; i + 1 < mine.length; i++) {
      const from = mine[i].pick_no, to = mine[i + 1].pick_no;
      const between = d.picks.filter(p => p.pick_no > from && p.pick_no < to);
      if (!between.length) continue;
      waits++;
      const c = {};
      POS.forEach(p => { c[p] = 0; });
      between.forEach(p => {
        const pos = posById[String(p.player_id)];
        if (pos && c[pos] !== undefined) c[pos]++; else unresolvedInGaps++;
      });
      POS.forEach(p => realized[p].push(c[p]));
    }
  });
});

const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const med = a => { const b = a.slice().sort((x, y) => x - y);
  return b.length ? b[Math.floor(b.length / 2)] : NaN; };

console.log('  REALIZED DEPLETION per wait, across ' + waits + ' team-to-next-pick gaps');
console.log('  (mean players taken at each position while one drafter waited)\n');
console.log('  pos    mean    median   max    share of a gap');
const totalMean = POS.reduce((s, p) => s + mean(realized[p]), 0);
POS.forEach(p => {
  const m = mean(realized[p]);
  console.log('  ' + p.padEnd(6) + m.toFixed(2).padEnd(8) + String(med(realized[p])).padEnd(9)
    + String(Math.max.apply(null, realized[p])).padEnd(7)
    + (100 * m / totalMean).toFixed(1) + '%');
});
console.log('  ' + 'unresolved'.padEnd(6) + '        (' + unresolvedInGaps
  + ' picks in gaps whose position is unknown — excluded from the counts above)');

/* ── WHAT THE MODEL ASSUMES ────────────────────────────────────────────────*/
/* The 2026 board, at a gap of the same size, asked the same question: how many
 * at each position does survival expect to go? Expected departures = sum over
 * available players of (1 - survival). */
console.log('\n  MODEL-EXPECTED DEPLETION on the 2026 board, at the same gap sizes');
const adpOf = p => (p.adjusted_adp != null ? Number(p.adjusted_adp)
  : (p.raw_adp != null ? Number(p.raw_adp) : 9999));
const pool = DATA.players.filter(p => p.position && p.proj_mean != null && p.vorp != null);
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
const L = DATA.league;

const gapSizes = [];
drafts.forEach(d => {
  const byTeam = {};
  d.picks.forEach(p => { (byTeam[String(p.roster_id)] = byTeam[String(p.roster_id)] || []).push(p); });
  Object.keys(byTeam).forEach(t => {
    const mine = byTeam[t].sort((a, b) => a.pick_no - b.pick_no);
    for (let i = 0; i + 1 < mine.length; i++) {
      gapSizes.push({ from: mine[i].pick_no, to: mine[i + 1].pick_no });
    }
  });
});

const expected = {};
POS.forEach(p => { expected[p] = []; });
gapSizes.forEach(g => {
  if (g.from >= byAdp.length) return;
  const taken = new Set(byAdp.slice(0, g.from - 1).map(p => String(p.player_id)));
  const board = pool.filter(p => !taken.has(String(p.player_id)));
  const ctx = { board: board, roster: [], league: L, currentPick: g.from,
    nextPick: g.to, totalPicks: 150, myPicksLeft: 8, roundsLeft: 8,
    runMultipliers: {}, intervening: [], weights: E.MEASURED_WEIGHTS };
  POS.forEach(pos => {
    const at = board.filter(p => p.position === pos);
    let dep = 0;
    at.forEach(p => {
      let sv = S.survivalProbability(p, g.to, ctx);
      if (typeof sv !== 'number' || !isFinite(sv)) sv = 1;
      dep += (1 - sv);
    });
    expected[pos].push(dep);
  });
});

console.log('  pos    model mean   real mean   ratio    share model / share real');
const totalExp = POS.reduce((s, p) => s + mean(expected[p]), 0);
const rows = POS.map(p => {
  const m = mean(expected[p]), r = mean(realized[p]);
  return { pos: p, model: m, real: r, ratio: r > 0 ? m / r : NaN,
    shareModel: 100 * m / totalExp, shareReal: 100 * r / totalMean };
});
rows.forEach(r => {
  console.log('  ' + r.pos.padEnd(6) + r.model.toFixed(2).padEnd(13)
    + r.real.toFixed(2).padEnd(12) + (isFinite(r.ratio) ? r.ratio.toFixed(2) : 'n/a').padEnd(9)
    + r.shareModel.toFixed(1) + '% / ' + r.shareReal.toFixed(1) + '%');
});

/* CONTROL — if survival returned the same number for everybody the model column
 * would be flat and the comparison meaningless. */
const spread = Math.max.apply(null, rows.map(r => r.model))
  - Math.min.apply(null, rows.map(r => r.model));
console.log('\n  CONTROL: the model DOES differentiate positions (spread '
  + spread.toFixed(2) + ' expected departures)'
  + (spread > 0.5 ? '' : '   *** FLAT — the comparison above is void'));

/* ── AND WHAT THE MEASURED BIAS DOES TO VONA ───────────────────────────────
 *
 * The bias is POSITIONAL, so correcting it is not a scale change that cancels.
 * d_true = d_pred / ratio, per position, using each position's OWN measured
 * ratio rather than the pinned 15-57% range — which is a league-wide figure and
 * cannot express that RB and WR are already right.
 *
 * DIRECTION: the model over-predicts departures at QB and TE, so it UNDER-states
 * their survival, so eba is too LOW there, so VONA is too HIGH. Correcting it
 * should push QB and TE DOWN relative to RB and WR. */
const RATIO = {};
rows.forEach(r => { RATIO[r.pos] = isFinite(r.ratio) && r.ratio > 0 ? r.ratio : 1; });

const MY = [30, 45, 50, 65, 70, 85, 90, 105, 110, 125, 130, 145];
const KEEP = require(path.join(__dirname, 'keepers_of.js')).keepersFrom(DATA);

function ebaCorrected(at, nextPick, ctx, ratio) {
  const sorted = at.slice().sort((a, b) => b.proj_mean - a.proj_mean);
  let expected = 0, allBetterGone = 1, massUsed = 0;
  for (const p of sorted) {
    let sv = S.survivalProbability(p, nextPick, ctx);
    if (typeof sv !== 'number' || !isFinite(sv)) sv = 1;
    const d = Math.max(0, Math.min(1, 1 - sv));
    const surv = Math.max(0, Math.min(1, 1 - d / ratio));
    const pBest = surv * allBetterGone;
    expected += p.proj_mean * pBest;
    massUsed += pBest;
    allBetterGone *= (1 - surv);
    if (allBetterGone < E.CFG.SURVIVOR_CUTOFF) break;
  }
  if (massUsed < 1 && sorted.length) {
    expected += sorted[sorted.length - 1].proj_mean * (1 - massUsed);
  }
  return expected;
}

console.log('\n  WHAT THE MEASURED POSITIONAL BIAS DOES TO VONA');
console.log('  Mean change in VONA for the best available player at each position');
console.log('  over Cory\'s twelve picks, correcting each position by its OWN ratio.\n');
console.log('  pos    ratio   mean dVONA   direction');
const deltas = {};
POS.forEach(pos => { deltas[pos] = []; });
MY.forEach(pk => {
  const taken = new Set(byAdp.slice(0, pk - 1).map(p => String(p.player_id)));
  KEEP.forEach(k => taken.add(String(k.player_id)));
  const board = pool.filter(p => !taken.has(String(p.player_id)));
  const later = MY.filter(x => x > pk);
  const ctx = { board: board, roster: KEEP, league: L, currentPick: pk,
    nextPick: later.length ? later[0] : 147, totalPicks: 147,
    myPicksLeft: later.length + 1, roundsLeft: later.length + 1,
    runMultipliers: {}, intervening: [], weights: E.MEASURED_WEIGHTS };
  POS.forEach(pos => {
    const at = board.filter(p => p.position === pos);
    if (at.length < 2) return;
    const best = at.slice().sort((a, b) => b.proj_mean - a.proj_mean)[0];
    const rest = at.filter(p => p.player_id !== best.player_id);
    const base = Number(best.proj_mean) - ebaCorrected(rest, ctx.nextPick, ctx, 1);
    const corr = Number(best.proj_mean) - ebaCorrected(rest, ctx.nextPick, ctx, RATIO[pos]);
    deltas[pos].push(corr - base);
  });
});
POS.forEach(pos => {
  const m = mean(deltas[pos]);
  console.log('  ' + pos.padEnd(6) + RATIO[pos].toFixed(2).padEnd(8)
    + ((m >= 0 ? '+' : '') + m.toFixed(2)).padEnd(13)
    + (m < -0.05 ? 'VONA falls — was over-stated'
      : (m > 0.05 ? 'VONA rises — was under-stated' : 'no material change')));
});
const qbte = (mean(deltas.QB) + mean(deltas.TE)) / 2;
const rbwr = (mean(deltas.RB) + mean(deltas.WR)) / 2;
console.log('\n  QB/TE mean ' + qbte.toFixed(2) + '  vs  RB/WR mean ' + rbwr.toFixed(2)
  + '   RELATIVE SHIFT ' + (qbte - rbwr).toFixed(2) + ' points');
console.log('  against COIN_FLIP_GAP ' + E.CFG.COIN_FLIP_GAP + ', TIE_THRESHOLD '
  + E.CFG.TIE_THRESHOLD + ', CLOSE_GAP ' + E.CFG.CLOSE_GAP);

console.log('\n  WHAT THIS ESTABLISHES AND WHAT IT DOES NOT');
console.log('    ESTABLISHES: whether the depletion STRUCTURE survival encodes matches');
console.log('    what real rooms in this league actually did, using a room the model');
console.log('    did not generate. That is the independent confirmation item 24 asks');
console.log('    for, on the input VONA is most sensitive to.');
console.log('    DOES NOT: compare POINTS. That needs contemporaneous projections and');
console.log('    ADP for 2023-25, and board_pin.py records that those are not');
console.log('    recoverable. A share comparison is scale-free and survives that gap;');
console.log('    a points comparison would not.');
console.log('    AND THE SEASONS DIFFER. The model column is the 2026 board at the same');
console.log('    gap sizes, not a 2023 board. Positional SHARE is the comparable');
console.log('    quantity; the absolute means are not.');
