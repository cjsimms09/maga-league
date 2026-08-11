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
  // FIND A WINDOW THAT IS ALREADY CONSERVED and assert the tilt leaves it alone.
  // The first cut wrote `r.applied || r.ratioBefore <= 1.0`, which short-circuits
  // to true whenever the tilt fired — so it could never catch OVER-firing, which
  // is the only thing it was written to catch.
  {
    const conserved = windows.find(x => x.ratio <= 1.0);
    ck('a window exists that is already conserved (so this is not vacuous)',
       !!conserved, JSON.stringify(windows.map(x => +x.ratio.toFixed(3))));
    if (conserved) {
      const dr = new Set(byAdp.slice(0, conserved.cur - 1).map(p => p.player_id));
      const cb = all.filter(p => !dr.has(p.player_id))
        .sort((a, b) => (b.vorp || 0) - (a.vorp || 0));
      const cr = S.conservedSurvival(cb, conserved.mine,
        { board: cb, league: lg, currentPick: conserved.cur, runMultipliers: {}, profiles: {} });
      ck('the tilt does NOTHING when the board is already conserved',
         cr.applied === false,
         'applied=' + cr.applied + ' on ratioBefore ' + (cr.ratioBefore || 0).toFixed(3));
    }
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

console.log('');
console.log('conservation by window (cur->mine, picks, mass, ratio):');
windows.forEach(w => console.log('   picks ' + String(w.picks).padStart(2)
  + '  mass ' + w.mass.toFixed(2).padStart(6) + '  ratio ' + w.ratio.toFixed(3)));
console.log('');
console.log(pass + '/' + (pass + fail) + ' survival-honesty checks passed');
process.exit(fail ? 1 : 0);
