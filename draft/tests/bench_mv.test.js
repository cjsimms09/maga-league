// TERRITORY: A
// CONVEXITY MUST COME OUT OF THE LINEUP OPTIMIZER, OR IT IS THE PROJECTION TWICE.
//
// Cory, verbatim: "don't let convexity enter through a scalar upside metric…
// The convexity has to come out of the lineup optimizer operating on sampled
// weeks."
//
// This repo has already shipped the scalar version. `UpsideBonus` was
// `proj_mean × variance × 1.036` — Spearman 1.0000 against `proj_mean` at every
// position, a literal constant ratio. It was not measuring upside; it was
// entering the projection signal a second time and the late-draft ×1.6
// multiplier amplified the duplicate.
//
// So the test that matters is not "is MV positive" but a pair of properties that
// only a max-operator can produce:
//
//   ON THE BENCH   two players with the SAME mean and different variance must
//                  price the SAME with no lineup skill, and the volatile one
//                  must price HIGHER as lineup skill rises. That gap is the
//                  convexity, and it is manufactured by nothing.
//   IN A LOCKED    the same pair must price identically no matter the skill,
//   STARTING SEAT  because a man you start every week contributes his mean and
//                  his variance is irrelevant. A scalar upside bonus CANNOT tell
//                  these two situations apart, which is exactly why it was inert.
//
// Run: node draft/tests/bench_mv.test.js
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const B = require(path.join(ROOT, 'draft', 'tools', 'bench_mv.js'));
const PLAN = require(path.join(ROOT, 'draft', 'tools', 'draft_plan.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const SIMS = 400;
const byId = {};
PLAN.pool.forEach(p => { byId[String(p.player_id)] = p; });
const R = PLAN.keep.map(k => byId[String(k.player_id)] || k)
  .concat(PLAN.plan.filter(x => !x.bench && x.p).map(x => byId[String(x.p.player_id)] || x.p))
  .filter(Boolean);
ck('there is a roster to price against', R.length >= 8, R.length);

/* A synthetic player, so mean and variance can be moved ONE AT A TIME. Every
 * board player differs in several ways at once and a comparison between two of
 * them cannot isolate anything. */
const synth = (pos, weekMean, weekSd, opts) => Object.assign({
  player_id: 'synth:' + pos + ':' + weekMean + ':' + weekSd,
  name: 'synthetic ' + pos, position: pos, bye: 0,
  games_expected: 16, proj_mean: weekMean * 16, weekly_sd: weekSd,
}, opts || {});
const mv = (cand, cfg) => B.marginalValue(R, cand, Object.assign({ sims: SIMS }, cfg));

// ── 1. THE CONTROLS THAT MAKE EVERY OTHER NUMBER READABLE ────────────────
{
  const dud = synth('RB', 0, 0);
  ck('a body who cannot score prices at EXACTLY zero — he never starts, and '
    + 'carrying him costs nothing', mv(dud, { lineupInfo: 'prior' }) === 0,
    mv(dud, { lineupInfo: 'prior' }));
  ck('and still zero with perfect lineup skill', mv(dud, { lineupInfo: 'clairvoyant' }) === 0);
  /* THE FAIL ARM FOR THE CONTROL ABOVE. Zero for a dud proves nothing if the
   * harness returns zero for everyone. */
  const star = PLAN.pool.slice().sort((a, b) => b.proj_mean - a.proj_mean)[0];
  const mvStar = mv(star, { lineupInfo: 'prior' });
  ck('FAIL ARM — the best player on the board prices FAR above the dud, so the '
    + 'harness can tell candidates apart', mvStar > 15,
    { star: star.name, mv: mvStar });
  /* A body drawn AT the streaming level is what ω is. He should be worth roughly
   * nothing: anything he covers, the wire covers. Not exactly zero, because a
   * ROSTERED body can be benched in his bad weeks and a Wednesday claim cannot —
   * and that asymmetry is real, not an artefact. */
  const w0 = B.omega(B.FLEX_STREAM_POS);
  const mvW = mv(w0, { lineupInfo: 'prior' });
  ck('a body at the streaming level prices near zero', Math.abs(mvW) < 12, mvW);
}

// ── 2. CONVEXITY, ON THE BENCH, FROM THE OPTIMIZER ───────────────────────
// The property Cory named. Two receivers, same weekly mean, different weekly
// spread, both behind the same incumbents.
{
  const MEAN = 9.0;                    // below the WR wire, so neither starts on prior
  const calm = synth('WR', MEAN, 2);
  const wild = synth('WR', MEAN, 12);
  const calm0 = mv(calm, { lineupInfo: 'prior' });
  const wild0 = mv(wild, { lineupInfo: 'prior' });
  ck('CONTROL — with NO lineup skill, variance is worth nothing: same mean, '
    + 'same price', Math.abs(calm0 - wild0) < 0.51, { calm: calm0, wild: wild0 });
  const calm1 = mv(calm, { lineupInfo: 'clairvoyant' });
  const wild1 = mv(wild, { lineupInfo: 'clairvoyant' });
  ck('WITH lineup skill the volatile one is worth MORE — the max operator, not a '
    + 'bonus term', wild1 > calm1 + 5, { calm: calm1, wild: wild1 });
  ck('and the gap GROWS with skill rather than appearing at one end',
    (wild1 - calm1) > (mv(wild, { lineupInfo: 0.5 }) - mv(calm, { lineupInfo: 0.5 })),
    { at_1: wild1 - calm1, at_half: mv(wild, { lineupInfo: 0.5 }) - mv(calm, { lineupInfo: 0.5 }) });
}

// ── 3. AND IT DISAPPEARS IN A SEAT THAT IS ALWAYS STARTED ────────────────
// THE CHECK A SCALAR UPSIDE METRIC CANNOT PASS. A player so far ahead of every
// alternative that he starts every week contributes his MEAN; his variance is
// irrelevant. `proj_mean × variance` would still hand the volatile one a bonus.
//
// "LOCKED" HAS TO BE EARNED, AND MY FIRST VERSION DID NOT EARN IT. I used a
// quarterback at 40 points a week against Drake Maye at 23.7, called that
// locked, and the volatile one still priced 13% higher — correctly, because at
// sd 14 he falls below Maye about one week in eight and those weeks he does not
// start. That is not a leak, it is the same convexity as section 2, and a
// "locked" seat with a competent alternative behind it is not locked at all.
// Which is itself worth knowing: even a first-round quarterback carries real
// option value if you own a startable backup.
//
// BOARD DRIFT RE-EARNED THE MARGIN ONCE ALREADY (diagnosed 2026-08-16, see
// draft/audit/rebuild_refusal_diagnosis_2026-08-16.md's pattern). This test
// was written 2026-08-14 (commit 20a6c256), against that day's board; Maye is
// no longer even in `R` (draft_plan.js's plan reads the live board), and the
// real alternative competing for the seat is now `R`'s own QB (Dak Prescott,
// ~22.05 ppg) versus the measured QB wire (~23.28 ppg) — both close to the
// old "Maye at 23.7" figure, but the corrected board (e993e1de: DEF TD
// vocabulary + FP dropped-receptions, ratios WR 1.039/TE 1.059/QB 1.001 —
// QB itself untouched, but the RB/WR/TE repricing moved who else the plan
// drafts and reshuffled which QB is R's own) pushed MEAN=60's gap to +1.88%,
// over the 1.5% bound. Not a logic defect — verified empirically (values
// below) that the SAME neutral-at-the-limit property holds, it just needs a
// wider clearance over today's real alternative: at MEAN 70/80/90/100 the gap
// is 0.86% / 0.26% / -0.05% / -0.17%, converging to (slightly negative,
// i.e. sim-noise-bounded) zero exactly as "locked" predicts. MEAN raised to
// 100 for a safety margin against ordinary future drift.
{
  const MEAN = 100;                  // far enough above Dak Prescott (R's own QB,
  const calm = synth('QB', MEAN, 2); // ~22 ppg) AND the QB wire (~23 ppg) that
  const wild = synth('QB', MEAN, 14);
  const c1 = mv(calm, { lineupInfo: 'clairvoyant' });
  const w1 = mv(wild, { lineupInfo: 'clairvoyant' });
  ck('CONTROL — this pair really is locked into the seat (both price high)',
    c1 > 300 && w1 > 300, { calm: c1, wild: w1 });
  ck('in a TRULY locked starting seat, variance is NEUTRAL — the scalar bonus '
    + 'would not know that', Math.abs(w1 - c1) < 0.015 * c1, { calm: c1, wild: w1 });
  /* THE CONTRAST, ASSERTED RATHER THAN LEFT AS PROSE. The same pair, moved down
   * to where a real alternative exists, must SEPARATE — otherwise the neutrality
   * above could just be a harness that ignores variance everywhere. */
  const cN = mv(synth('QB', 40, 2), { lineupInfo: 'clairvoyant' });
  const wN = mv(synth('QB', 40, 14), { lineupInfo: 'clairvoyant' });
  ck('FAIL ARM — lower the same pair to where a backup can beat them and the '
    + 'variance separates again', (wN - cN) > 0.05 * cN, { calm: cN, wild: wN });
}

// ── 4. DETERMINISM, WHICH IS WHAT MAKES THE ABOVE COMPARISONS LEGAL ──────
// Every draw is addressed by (seed, sim, salt, roster index, week) rather than
// pulled from a shared sequence, so two arms hand identical numbers to the
// players they share. Without it these differences are simulation noise.
{
  const c = synth('RB', 11, 8);
  const a = mv(c, { lineupInfo: 0.5 }), b = mv(c, { lineupInfo: 0.5 });
  ck('the same candidate, same seed, gives the IDENTICAL number twice', a === b, { a: a, b: b });
  const d = mv(c, { lineupInfo: 0.5, seed: 99 });
  ck('CONTROL — a different seed gives a different number, so the equality above '
    + 'is not a constant', a !== d, { seeded: a, other: d });
  ck('and the two seeds agree to within simulation noise', Math.abs(a - d) < 12,
    { a: a, d: d });
}

// ── 5. THE BYE IS A HOLE WITH A DATE ─────────────────────────────────────
// The scalar metric could not see this at all: `proj_mean / 15` spreads a
// season evenly and has no idea which week is missing. Two identical players,
// one whose bye falls inside the scoring window and one whose does not.
//
// THE SIZE OF THE EFFECT IS DERIVED FIRST, NOT READ OFF THE OUTPUT. A bye costs
// (what he would have scored − what the wire pays) × P(that week was one he
// would have started). For a bench back behind three others that is roughly
// 3.5 starts in 15 weeks × (13.0 − 9.4) ≈ 0.8 points; for a locked starter it
// is a full week of his whole edge. Both are asserted, because the SMALL one
// alone would pass against a harness that had a rounding error in it.
{
  const inWin = synth('RB', 13, 6, { bye: 7 });
  const outWin = synth('RB', 13, 6, { bye: 0 });
  const a = mv(inWin, { lineupInfo: 'prior' }), b = mv(outWin, { lineupInfo: 'prior' });
  ck('CONTROL — this player is good enough to start sometimes, or the bye cannot '
    + 'matter', b > 5, b);
  ck('a bench player\'s bye inside weeks ' + B.FIRST_WEEK + '-' + B.LAST_WEEK
    + ' costs a little (he rarely starts)', a < b - 0.3 && a > b - 3,
    { with_bye: a, without: b, cost: b - a });
  const lockIn = synth('QB', 60, 3, { bye: 7 });
  const lockOut = synth('QB', 60, 3, { bye: 0 });
  const c = mv(lockIn, { lineupInfo: 'prior' }), d = mv(lockOut, { lineupInfo: 'prior' });
  ck('and a LOCKED starter\'s bye costs a whole week of his edge',
    (d - c) > 20, { with_bye: c, without: d, cost: d - c });
  ck('CONTROL — a bye OUTSIDE the window costs nothing at all',
    mv(synth('QB', 60, 3, { bye: 16 }), { lineupInfo: 'prior' }) === d);
}

// ── 6. THE SEASON WINDOW IS READ, NOT ASSUMED ────────────────────────────
{
  ck('the scoring window comes from the league settings',
    B.FIRST_WEEK === 1 && B.LAST_WEEK === 15, { first: B.FIRST_WEEK, last: B.LAST_WEEK });
  ck('CONTROL — it is NOT the 17-week NFL calendar, which is the plausible wrong '
    + 'answer', B.LAST_WEEK !== 17);
  ck('the starting seats are read too, and include the flex exactly once',
    B.SLOTS.filter(s => s.slot === 'FLEX').length === 1
    && B.SLOTS.length === 9, B.SLOTS.map(s => s.slot));
}

// ── 7. LINEUP SKILL REFUSES TO DEFAULT ───────────────────────────────────
// The two ends differ by ~70 points on a bench running back. A silent default
// between them is the largest single unstated assumption available here.
{
  ck('resolveRho maps the two named ends', B.resolveRho('prior') === 0
    && B.resolveRho('clairvoyant') === 1);
  ck('and passes a correlation through', B.resolveRho(0.4) === 0.4);
  let threw = null;
  try { B.resolveRho('optimal'); } catch (e) { threw = e.message; }
  ck('an unrecognised setting THROWS rather than picking an end', !!threw
    && /REFUSING/.test(threw), threw);
  let threw2 = null;
  try { B.resolveRho(1.5); } catch (e) { threw2 = e.message; }
  ck('and a correlation outside [0,1] throws', !!threw2, threw2);
}

// ── 8. THE WIRE IS DRAWN FROM, NOT COLLAPSED ─────────────────────────────
{
  ck('the simulator holds the raw wire SAMPLE at every measured position',
    ['QB', 'RB', 'WR', 'TE'].every(p => (B.WIRE_SAMPLE[p] || []).length > 50),
    Object.keys(B.WIRE_SAMPLE).map(p => p + ':' + B.WIRE_SAMPLE[p].length));
  ck('K and DEF are NOT in it, and their basis says why',
    !B.WIRE_SAMPLE.K && !B.WIRE_SAMPLE.DEF
    && /PRESEASON BEST-UNDRAFTED/.test(B.WIRE_BASIS.K || ''), B.WIRE_BASIS.K);
  ck('and every position that IS measured says so with its n',
    ['QB', 'RB', 'WR', 'TE'].every(p => /realized acquisition, n=\d+/.test(B.WIRE_BASIS[p] || '')),
    B.WIRE_BASIS);
}

// ── 9. THE STREAMING ASSUMPTION BRACKETS RATHER THAN HIDES ───────────────
// Unlimited streaming is the setting under which a bench player is worth the
// LEAST. Capping it at the measured 1.498 adds per team per week is the setting
// under which he is worth the most. A candidate whose case exists only at one
// end has a case about the assumption.
{
  const c = synth('RB', 11, 8);
  const free = mv(c, { lineupInfo: 0.5 });
  const capped = mv(c, { lineupInfo: 0.5, streamBudget: 1.498 });
  ck('CONTROL — the two settings genuinely differ', Math.abs(capped - free) > 1,
    { unlimited: free, capped: capped });
  ck('and capping the wire makes a bench player worth MORE, never less',
    capped > free, { unlimited: free, capped: capped });
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED — the bench number is not safe to draft from.'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: convexity is produced by the lineup optimizer and by');
console.log('nothing else — it scales with lineup skill on the bench and VANISHES in a');
console.log('locked starting seat, which no scalar upside term can do. The controls show a');
console.log('replacement body prices at zero, so the numbers above zero are not the harness.');
console.log('WHAT IT DOES NOT: validate the INPUTS. weekly_sd is derived from a season sd,');
console.log('not observed; availability is a per-POSITION constant so a handcuff is worth');
console.log('nothing here; player-to-player correlation is unmeasured; and the objective is');
console.log('points, not the payout structure. Those are named in bench_mv.js, not fixed.');
