'use strict';
/* SURVIVAL: THE ACCOUNTING, AND THE HONESTY OF HOW IT RENDERS.
 *
 * Survival is third on this project's own list of things most likely to be wrong.
 * VONA rides entirely on it, its constants are DESIGNED GUESSES rather than
 * measured, and nothing has calibrated it against real outcomes. This suite does
 * not pretend to calibrate it. It does two things that are cheap and honest:
 *
 * 1. THE CONSERVATION ACCOUNTING, shown rather than asserted. Enumerate the whole
 *    board at each of Cory's picks, sum P(gone) across every player, and compare
 *    against the number of selections that actually happen in that window. The sum
 *    cannot exceed the picks available — there are only so many players who can be
 *    taken — so the ratio is a hard arithmetic check on the model.
 *
 *    MEASURED 2026-08-10:
 *        12-pick windows   ~1.15
 *         6-pick, early    1.22 - 1.29
 *         6-pick, later    1.47 - 1.57
 *    The model OVER-PREDICTS departures by 15% at best and 57% at worst, and it is
 *    worst in short windows and later rounds — where nearly all of Cory's picks
 *    live. That is a real, unfixed limitation; this suite pins it so it cannot get
 *    quietly WORSE before calibration lands, and so the number is on the record.
 *
 *    A NOTE ON THE MEASUREMENT ITSELF: the board must be CONSUMED first. Running
 *    this against the full artifact gives a ratio of 5.7, because every already-
 *    drafted star still sits on the board carrying P(gone)=1. That is a bug in the
 *    measurement, not the model, and it is exactly the kind of false alarm that
 *    discredits a real finding.
 *
 * 2. THE RENDERING. A number shown as "64.8%" claims a precision this model does
 *    not have, next to genuinely measured quantities with identical confidence.
 *    Every survival-derived figure is coarsened to 5% with a tilde.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const S = require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));
const D = require(path.join(ROOT, 'public', 'draft_data.json'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n))
  : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

const lg = D.league;
const all = D.players.filter(p => p.proj_mean != null);
const byAdp = all.slice().sort((a, b) => (a.adp == null ? 9999 : a.adp) - (b.adp == null ? 9999 : b.adp));

/** Sum of P(gone) over the whole board for a window, with the board CONSUMED. */
function conservation(cur, mine) {   // cur is the live clock
  const drafted = new Set(byAdp.slice(0, cur - 1).map(p => p.player_id));
  const board = all.filter(p => !drafted.has(p.player_id))
    .sort((a, b) => (b.vorp || 0) - (a.vorp || 0));
  // MIRROR THE LIVE CTX. Until 2026-08-11 this omitted `currentPick`, exactly as
  // the app did — so it faithfully measured the live path's 1.15-1.57. The app
  // now passes it, and a harness that does not is measuring a path nothing takes.
  const ctx = { board: board, league: lg, currentPick: cur, runMultipliers: {},
                profiles: (D.manager_profiles || {}).managers || {} };
  let mass = 0;
  board.forEach(p => { const s = S.survivalProbability(p, mine, ctx); if (s != null) mass += 1 - s; });
  return { mass: mass, picks: mine - cur, ratio: mass / (mine - cur) };
}

// ── 1. the accounting ───────────────────────────────────────────────────────
const MY_PICKS = (D.pick_order || {}).my_picks || [];
const windows = [];
MY_PICKS.slice(0, 10).forEach((m, i) => {
  const cur = i === 0 ? m - 6 : MY_PICKS[i - 1] + 1;
  if (m - cur > 0) windows.push(Object.assign(conservation(cur, m), { cur: cur, mine: m }));
});

ck('every window was measurable', windows.length >= 5, windows.length + ' windows');

// The HARD invariant. A ratio at or below 1 is conserved; this model is not there
// yet, so the bar is a CEILING that documents the current state and stops it
// getting worse. It is deliberately not 1.0 — asserting a standard the model
// visibly fails would be a red suite nobody could act on before the draft.
const CONSERVATION_CEILING = 1.15;
const worst = windows.reduce((w, x) => (x.ratio > w.ratio ? x : w), windows[0]);
ck('no window exceeds the documented conservation ceiling (' + CONSERVATION_CEILING + ')',
   worst.ratio <= CONSERVATION_CEILING,
   'worst ratio ' + worst.ratio.toFixed(3) + ' (' + worst.mass.toFixed(2)
   + ' expected departures vs ' + worst.picks + ' picks)');

// And the finding itself, pinned: it DOES over-predict. If this ever starts
// failing, survival got calibrated and this suite's headline needs rewriting —
// which is the good outcome, and it should not pass silently.
// THE ROOT CAUSE IS FIXED, so the claim changes from "the bias is present" to
// "the bias is bounded". The 1.15-1.57 figures were the UNCONDITIONAL path: the
// app was not passing currentPick, so survival answered "taken by pick N from the
// draft start" instead of "taken between now and N, given available now".
ck('the residual over-prediction is small now that currentPick is passed',
   worst.ratio <= CONSERVATION_CEILING,
   'worst ratio ' + worst.ratio.toFixed(3));

// AND THE TILT CLOSES THE RESIDUAL. Enforcement is checked directly, so a
// regression in solveTilt cannot hide behind an already-small ratio.
{
  const w = windows[0];
  const drafted = new Set(byAdp.slice(0, w.cur - 1).map(p => p.player_id));
  const brd = all.filter(p => !drafted.has(p.player_id))
    .sort((a, b) => (b.vorp || 0) - (a.vorp || 0));
  const r = S.conservedSurvival(brd, w.mine,
    { board: brd, league: lg, currentPick: w.cur, runMultipliers: {}, profiles: {} });
  ck('the tilt enforces the count identity exactly when it binds',
     !r.applied || Math.abs(r.ratioAfter - 1) < 1e-6,
     'applied ' + r.applied + ' ratioAfter ' + (r.ratioAfter || 0).toFixed(6));
  /* THE TILT IS TWO-SIDED, AND THIS TEST USED TO REQUIRE THAT IT WAS NOT.
   *
   * It asserted `applied === false` on any window whose ratio was <= 1.0 — i.e.
   * that under-prediction should be left alone. That encoded solveTilt's
   * one-sided guard as a REQUIREMENT, and it went red the moment the guard was
   * removed on 2026-08-11. The test was right about the old design and wrong
   * about the identity.
   *
   * Six opponent picks remove six players. A board summing to 5.7 expected
   * departures is not being conservative, it is claiming that fewer players will
   * be taken than there are picks to take them — which makes every player look
   * safer to wait on than he is. That is the direction that costs money in a
   * draft room, so it is precisely the direction that must be corrected.
   *
   * The idea the old test was protecting is still real and is kept in its
   * correct form: DO NOT MOVE A BOARD THAT ALREADY SATISFIES THE IDENTITY, and
   * never overshoot in either direction. Stated as "lands on 1.000 from wherever
   * it starts", which is checkable without asserting a sign.
   */
  {
    const under = windows.find(x => x.ratio < 0.99);
    const over = windows.find(x => x.ratio > 1.01);
    ck('the sample contains BOTH an under- and an over-predicting window '
       + '(so two-sidedness is not vacuously true)',
       !!under && !!over,
       JSON.stringify(windows.map(x => +x.ratio.toFixed(3))));

    [['under', under], ['over', over]].forEach(([label, wdw]) => {
      if (!wdw) return;
      const dr = new Set(byAdp.slice(0, wdw.cur - 1).map(p => p.player_id));
      const cb = all.filter(p => !dr.has(p.player_id))
        .sort((a, b) => (b.vorp || 0) - (a.vorp || 0));
      const cr = S.conservedSurvival(cb, wdw.mine,
        { board: cb, league: lg, currentPick: wdw.cur, runMultipliers: {}, profiles: {} });
      ck('the tilt corrects an ' + label + '-predicting board to exactly 1.000',
         cr.applied === true && Math.abs(cr.ratioAfter - 1) < 1e-6,
         'applied=' + cr.applied + ' ratioBefore ' + (cr.ratioBefore || 0).toFixed(3)
         + ' ratioAfter ' + (cr.ratioAfter || 0).toFixed(6));
    });
  }
  ck('the tilt reports its numbers beside its verdict',
     r.massBefore != null && r.massAfter != null && r.picks != null,
     JSON.stringify({ b: r.massBefore, a: r.massAfter, n: r.picks }));
}

// SCOPE OF THIS MEASUREMENT, stated because it would otherwise be overclaimed.
// It exercises `survivalProbability` — the ADP-marginal path the panel calls per
// player. It does NOT reach `withinFromPool`, where the shared tail BUDGET lives:
// flipping that budget back to a per-player constant (the original conservation
// bug) leaves every ratio above BYTE-IDENTICAL, which is how this limitation was
// found. So the tail-budget mechanism is NOT covered here and must not be assumed
// covered; that path needs a pool-shaped fixture, which is a separate job.
const w0 = windows[0];
ck('the measured mass stays within 2x the available picks',
   w0.mass < w0.picks * 2, 'mass ' + w0.mass.toFixed(2) + ' over ' + w0.picks + ' picks');

// ── 2. the rendering ────────────────────────────────────────────────────────
const APP = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
const block = APP.match(/const SURVIVAL_BUCKET[\s\S]*?function softNum[\s\S]*?\n  }/);
ck('the shared survival formatter exists', !!block);

let survivalText = null, softNum = null;
if (block) {
  // `eval` under 'use strict' gets its OWN scope, so the declarations do not
  // escape — the first cut of this suite crashed on ReferenceError. Build the
  // functions with a Function constructor and hand them back explicitly.
  const made = new Function(block[0] + '\n return { survivalText, softNum, survivalPct };')();
  survivalText = made.survivalText; softNum = made.softNum;
  ck('a survival % is coarsened to 5% and marked approximate',
     survivalText(0.648) === '~65%', survivalText(0.648));
  ck('no survival figure ever renders a decimal place',
     !/\./.test(survivalText(0.6483)), survivalText(0.6483));
  ck('certainty is never asserted at either end',
     survivalText(1) === '~99%' && survivalText(0) === '~1%',
     survivalText(1) + ' / ' + survivalText(0));
  ck('a missing survival renders as nothing, not 0%',
     survivalText(null) === '' && survivalText(undefined) === '',
     JSON.stringify(survivalText(null)));
  ck('derived figures inherit the softness marker',
     softNum(12.4) === '~12' && softNum(12.44, 1) === '~12.4', softNum(12.4));
}

/* EVERY SURVIVAL-DERIVED FIGURE GOES THROUGH THE FORMATTER. A new surface that
 * prints Math.round(s * 100) directly would look identical on screen and quietly
 * reassert the false precision, so the source is checked. The BAR WIDTH is
 * explicitly exempt and the reason is stated: it is a CSS length, not a number a
 * human reads, and coarsening it would make the bars visibly wrong. Rule 12 says
 * an exemption must be argued rather than asserted — that is the argument. */
{
  const rawRenders = APP.split('\n')
    .map((l, i) => ({ n: i + 1, l: l }))
    .filter(x => /Math\.round\(\s*(\(?\s*(1 -\s*)?[a-z]\.?(s|survival)[a-z_]*\b[^)]*\)?)\s*\*\s*100\s*\)/i.test(x.l))
    .filter(x => !/surv-bar|width:/.test(x.l));          // the argued exemption
  ck('no surface prints a raw survival percentage outside the formatter',
     rawRenders.length === 0,
     rawRenders.map(x => 'line ' + x.n + ': ' + x.l.trim().slice(0, 70)).join(' | '));
}

/* THE LIVE CTX MUST CARRY currentPick. This suite builds its own context, so it
 * cannot see whether app.js passes one — removing it from the app left every
 * assertion here green while the live path reverted to the unconditional model
 * that produced 1.15-1.57. Guard the source. */
{
  const app = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
  const i = app.indexOf('intervening: interveningPicks()');
  const near = i > 0 ? app.slice(Math.max(0, i - 2500), i) : '';
  ck('the LIVE survival context passes currentPick',
     /\n\s*currentPick:\s*\w/.test(near),
     'app.js builds its survival ctx without currentPick — survival reverts to '
     + 'the unconditional model and over-predicts departures by 15-57%');
}


/* ═══ THE TILT MUST STAY CONNECTED ═══
 *
 * conservedSurvival was built, exported, covered by its own test, and called by
 * NOTHING for a week. The engine bound `survival` straight to
 * survivalProbability and the app read s.survival_to_next off the engine, so the
 * approved conservation correction was inert while every test about it passed.
 * That is the produced-and-unread class: the producing side careful and correct,
 * and no consumer.
 *
 * A test of conservedSurvival IN ISOLATION cannot catch that, by construction —
 * it calls the function itself, so it is the consumer the live path lacks. These
 * assertions are about the WIRING, which is the part that went missing.
 */
{
  const eng = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'), 'utf8');
  // Comments stripped before matching: a source guard once passed against
  // deliberately re-broken code because the regex hit the comment explaining
  // the fix rather than the code implementing it.
  const code = eng.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  ck('the engine CALLS conservedSurvival (not merely imports survival.js)',
     /S\.conservedSurvival\s*\(/.test(code),
     'conservedSurvival has no caller in engine.js — the tilt is built and inert');

  ck('the raw model is NOT bound directly as `survival`',
     !/\bconst\s+survival\s*=\s*S\.survivalProbability\s*;/.test(code),
     'engine.js binds survival straight to survivalProbability, which bypasses '
     + 'the tilt at every call site');

  // ONE accessor, not five paths. Tilting some call sites and not others would
  // leave VONA's expected-best disagreeing with the number printed beside the
  // player — a two-places disease with both places on the same screen.
  const rawUses = (code.match(/\bsurvivalRaw\s*\(/g) || []).length;
  ck('survivalRaw is reached only through the accessor (3 fallbacks, no strays)',
     rawUses === 3, 'survivalRaw called ' + rawUses + ' times; expected exactly 3 '
     + '(gate off, tilt not applied, player absent from the map)');

  ck('the departure is gated by a named flag, not hardcoded',
     /CONSERVE_SURVIVAL_ON/.test(code),
     'no flag — the departure cannot be reverted in one edit on draft morning');
}

/* THE IDENTITY ACTUALLY HOLDS, END TO END, through the engine rather than
 * through a direct call to the tilt. This is the assertion that would have gone
 * red for the whole week the tilt was disconnected. */
{
  const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
  const art = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
  const players = art.players.filter(p => p.vorp != null);
  const byAdp = players.slice().sort(
    (a, b) => (a.adjusted_adp || a.raw_adp || 9999) - (b.adjusted_adp || b.raw_adp || 9999));
  const gone = new Set(byAdp.slice(0, 33).map(p => String(p.player_id)));
  const board = players.filter(p => !gone.has(String(p.player_id)));
  const mine = (art.league || {}).my_draft_slot;
  const iv = ((art.pick_order || {}).picks || [])
    .filter(p => p.overall >= 34 && p.overall < 41 && p.slot !== mine)
    .map(p => ({ team_slot: p.slot, pick_no: p.overall, roster: [], profile: null, room: [] }));
  const ctx = { board: board, roster: [], league: art.league, currentPick: 34, nextPick: 41,
    weights: E.MEASURED_WEIGHTS, totalPicks: 150, myPicksLeft: 8, progress: 34 / 150,
    roundsLeft: 11, intervening: iv, runMultipliers: {}, drift: null,
    currentKeepers: [], ceilingAllStages: false };

  const wasOn = E.CFG.CONSERVE_SURVIVAL_ON;
  const massOf = () => {
    const sc = (E.onTheClock(ctx, { targets: [], avoid: [], queue: [] }).scored) || [];
    let m = 0;
    sc.forEach(s => { if (s.survival_to_next != null) m += (1 - s.survival_to_next); });
    return m;
  };

  // N IS OPPONENT PICKS. My own pick is inside [34, 41) and a player I take is
  // not a player who got away.
  ck('the window excludes my own seat (6 opponent picks, not 7)', iv.length === 6,
     'intervening length ' + iv.length);

  E.CFG.CONSERVE_SURVIVAL_ON = true;
  const on = massOf();
  ck('WITH the tilt: conservation is EXACT through the engine',
     Math.abs(on - iv.length) < 1e-6,
     'mass ' + on.toFixed(6) + ' vs ' + iv.length + ' opponent picks');

  // REVERT PARITY. The flag exists so the departure is undoable in one edit on
  // draft morning; that is worthless unless OFF actually restores the prior
  // surface. v3's frozen mass for this state is 5.258499.
  E.CFG.CONSERVE_SURVIVAL_ON = false;
  const off = massOf();
  const v3 = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'draft', 'baseline', 'v3.json'), 'utf8'));
  const v3mass = (v3.surfaces.find(s => s.state === 'early-empty-roster') || {}).survival_mass;
  ck('WITHOUT the tilt: the pre-departure surface is restored exactly (v3)',
     Math.abs(off - v3mass) < 1e-6,
     'tilt off mass ' + off.toFixed(6) + ' vs v3 frozen ' + v3mass);

  // ...and the raw model does NOT conserve, which is why the tilt exists at all.
  // If this ever passes, the tilt has become unnecessary rather than merely off.
  ck('and the raw model still fails the identity (the tilt is not redundant)',
     Math.abs(off - iv.length) > 0.1,
     'raw mass ' + off.toFixed(3) + ' is already at ' + iv.length);

  E.CFG.CONSERVE_SURVIVAL_ON = wasOn;
}


/* ═══ TWO DEFECTS THE TILT'S OWN WIRING INTRODUCED, both caught by existing
 * tests within minutes of it going live, both guarded here so they cannot
 * return quietly. ═══ */
{
  const mk = (id, pos, adp, proj) => ({ player_id: id, name: 'P' + id, position: pos,
    team: 'XX', bye: 7, adjusted_adp: adp, raw_adp: adp, tier: 1, proj_mean: proj,
    proj_sd: 20, vorp: proj / 10, tier_drop: 5, overall_rank: adp });
  const lg2 = { teams: 10, starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 } };

  /* 1. THE MEMO KEY MUST DESCRIBE THE ANSWER.
   * The first key was boardVersion + currentPick + targetPick + N. Twelve
   * intervening picks over a twelve-pick window gives N = 12 either way, so an
   * ADP-only context and a full Layer-2 need context hashed IDENTICALLY and the
   * second was served the first's cached map. VONA stopped responding to the
   * need model — the exact defect update.test.js was written to catch. Live it
   * would be worse: board, my pick and my next pick hold still between renders
   * while runMultipliers, drift and opponent rosters change. */
  const bb = [];
  for (let i = 0; i < 60; i++) bb.push(mk('m' + i, i % 2 ? 'RB' : 'WR', 8 + i, 250 - i * 2));
  const base = { board: bb, league: lg2, currentPick: 20, totalPicks: 150, roundsLeft: 12,
                 runMultipliers: {} };
  const ivFor = pos => Array.from({ length: 12 }, (_, i) => ({
    team_slot: i + 1, pick_no: 20 + i, profile: null,
    roster: pos === 'RB' ? [{ position: 'WR' }, { position: 'WR' }, { position: 'TE' }]
                         : [{ position: 'RB' }, { position: 'RB' }, { position: 'RB' }],
  }));
  const rbNeed = S.conservedSurvival(bb, 32, Object.assign({}, base, { intervening: ivFor('RB') }));
  const wrNeed = S.conservedSurvival(bb, 32, Object.assign({}, base, { intervening: ivFor('WR') }));
  ck('same board, same window, same N — but a different need model gives a '
     + 'DIFFERENT tilt (the memo does not collide)',
     JSON.stringify(rbNeed.byId) !== JSON.stringify(wrNeed.byId),
     'both contexts hashed to one memo entry; N=' + rbNeed.picks);

  // ...and the memo still WORKS, or the fix would just be a disabled cache.
  const again = S.conservedSurvival(bb, 32, Object.assign({}, base, { intervening: ivFor('RB') }));
  ck('and identical inputs still return identical numbers (lambda is stable '
     + 'across renders of one state)',
     Math.abs(again.lambda - rbNeed.lambda) < 1e-12,
     'lambda ' + rbNeed.lambda + ' vs ' + again.lambda);

  /* 2. THE DEGENERATE BOARD. mass(L) reaches `nonzero` only as L -> infinity, so
   * N = nonzero is solvable only there. The bisection does not say so: at large L
   * every exp(-L*w) underflows to zero, the bracket "succeeds", and it converges
   * on a huge L that sets EVERY survival to ~0 — ordering destroyed, numbers
   * confident. An 11-player fixture over an 11-pick window made ADP 1 and ADP 55
   * equally doomed. */
  const tiny = [mk('a', 'RB', 1, 300), mk('b', 'RB', 2, 290), mk('c', 'WR', 3, 280),
                mk('d', 'WR', 12, 240), mk('e', 'TE', 20, 200)];
  const degCtx = t => ({ board: tiny, league: lg2, currentPick: 5, totalPicks: 150,
    roundsLeft: 12, runMultipliers: {}, intervening: [] });

  /* BROKEN AT THE BOUNDARY, per rule 10a — and the first cut of this test was not.
   * It used a 5-player board over an 11-pick window, where N > nonzero by six. The
   * old strict-`>` guard refuses that case too, so restoring the defect left this
   * assertion GREEN while an engine test caught it instead. N === nonzero is the
   * only case that separates `>` from `>=`, so that is the case to test. */
  const AT = S.conservedSurvival(tiny, 10, degCtx());     // N = 5, nonzero = 5
  ck('N EXACTLY equal to the tiltable count is refused (the >= boundary)',
     AT.applied === false && AT.picks === 5,
     'applied=' + AT.applied + ' N=' + AT.picks + ' — solvable only at lambda=infinity, '
     + 'where every exp(-L*w) underflows to zero and the board collapses to all-doomed');

  const BELOW = S.conservedSurvival(tiny, 9, degCtx());    // N = 4, one under
  ck('and one pick BELOW that boundary still tilts (the guard is not off by one)',
     BELOW.applied === true && Math.abs(BELOW.ratioAfter - 1) < 1e-6,
     'applied=' + BELOW.applied + ' N=' + BELOW.picks
     + ' ratioAfter ' + (BELOW.ratioAfter || 0).toFixed(6));

  ck('the refused board keeps its ordering (ADP 1 still likelier to go than ADP 20)',
     AT.byId.a < AT.byId.e, 'a=' + AT.byId.a + ' e=' + AT.byId.e);

  /* 3. THE FINGERPRINT MUST COVER EVERY INPUT survivalProbability READS, not just
   * the ones that happened to be tested. Removing runMultipliers from the key was
   * caught by NOTHING on the first pass — and that is the field most likely to
   * change between renders while board, pick and window all hold still, because a
   * run detected mid-round is exactly a same-board change. Live, the tilt would
   * have gone on serving pre-run numbers. */
  const runBase = { board: bb, league: lg2, currentPick: 20, totalPicks: 150,
                    roundsLeft: 12, intervening: ivFor('RB') };
  const noRun = S.conservedSurvival(bb, 32, Object.assign({}, runBase, { runMultipliers: {} }));
  const inRun = S.conservedSurvival(bb, 32, Object.assign({}, runBase,
    { runMultipliers: { RB: 1.6 } }));
  ck('a detected RUN changes the tilt (runMultipliers is in the memo key)',
     JSON.stringify(noRun.byId) !== JSON.stringify(inRun.byId),
     'a run on the same board, same window served cached pre-run numbers');

  const driftA = S.conservedSurvival(bb, 32, Object.assign({}, runBase,
    { runMultipliers: {}, drift: null }));
  const driftB = S.conservedSurvival(bb, 32, Object.assign({}, runBase,
    // The REAL drift shape: effectiveAdp reads {applied, offset} and effectiveSd
    // reads {applied, sdScale}. `{mean: 4.5}` — my first guess — is inert, and the
    // test correctly went red on it. A fixture invented rather than read from the
    // consumer is a fact about my guess, not about the code (rule 13).
    { runMultipliers: {}, drift: { applied: true, offset: 6, sdScale: 1.2 } }));
  ck('a global ADP drift changes the tilt (drift is in the memo key)',
     JSON.stringify(driftA.byId) !== JSON.stringify(driftB.byId),
     'drift did not reach the conserved map');
}

console.log('');
console.log('conservation by window (cur->mine, picks, mass, ratio):');
windows.forEach(w => console.log('   picks ' + String(w.picks).padStart(2)
  + '  mass ' + w.mass.toFixed(2).padStart(6) + '  ratio ' + w.ratio.toFixed(3)));
console.log('');
console.log(pass + '/' + (pass + fail) + ' survival-honesty checks passed');
process.exit(fail ? 1 : 0);
