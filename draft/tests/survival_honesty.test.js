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
function conservation(cur, mine) {
  const drafted = new Set(byAdp.slice(0, cur - 1).map(p => p.player_id));
  const board = all.filter(p => !drafted.has(p.player_id))
    .sort((a, b) => (b.vorp || 0) - (a.vorp || 0));
  const ctx = { board: board, league: lg, runMultipliers: {},
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
  if (m - cur > 0) windows.push(conservation(cur, m));
});

ck('every window was measurable', windows.length >= 5, windows.length + ' windows');

// The HARD invariant. A ratio at or below 1 is conserved; this model is not there
// yet, so the bar is a CEILING that documents the current state and stops it
// getting worse. It is deliberately not 1.0 — asserting a standard the model
// visibly fails would be a red suite nobody could act on before the draft.
const CONSERVATION_CEILING = 1.70;
const worst = windows.reduce((w, x) => (x.ratio > w.ratio ? x : w), windows[0]);
ck('no window exceeds the documented conservation ceiling (' + CONSERVATION_CEILING + ')',
   worst.ratio <= CONSERVATION_CEILING,
   'worst ratio ' + worst.ratio.toFixed(3) + ' (' + worst.mass.toFixed(2)
   + ' expected departures vs ' + worst.picks + ' picks)');

// And the finding itself, pinned: it DOES over-predict. If this ever starts
// failing, survival got calibrated and this suite's headline needs rewriting —
// which is the good outcome, and it should not pass silently.
ck('the known over-prediction is still present (>1.0) — pinned, not fixed',
   worst.ratio > 1.0,
   'worst ratio ' + worst.ratio.toFixed(3) + ' — if this is now <=1, survival was '
   + 'calibrated and this suite needs updating');

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

console.log('');
console.log('conservation by window (cur->mine, picks, mass, ratio):');
windows.forEach(w => console.log('   picks ' + String(w.picks).padStart(2)
  + '  mass ' + w.mass.toFixed(2).padStart(6) + '  ratio ' + w.ratio.toFixed(3)));
console.log('');
console.log(pass + '/' + (pass + fail) + ' survival-honesty checks passed');
process.exit(fail ? 1 : 0);
