// TERRITORY: A
/* THE TWO OBJECTIVES IN ONE CURRENCY — dollars — so the trade is decidable.
 *
 * I told Cory I could say variance buys weekly highs and costs wins, but not
 * which trade to make, because the payout size was unknown. He pointed at the
 * site. It is in src/seed-data.js and it is bigger than I assumed:
 *
 *     total pot                          $4,000  (10 x $400)
 *     weekly high, 15 x $100             $1,500  — 37.5% OF THE POT
 *     remaining for finish               $2,500  — 62.5%
 *       regular season 1st / 2nd      $250 / $125
 *       playoff 1st..4th   $675 / $575 / $475 / $400
 *
 * THIRTY-SEVEN AND A HALF PERCENT OF THE MONEY IS PAID ON A SINGLE WEEK'S
 * SCORE. That is not a tiebreaker consideration. The objective document says
 * MAXIMISE EXPECTED POINTS SCORED BY MY STARTING LINEUP OVER THE SEASON, which
 * is linear and therefore variance-neutral, and it is silent on more than a
 * third of the prize pool.
 *
 * ── WHAT THIS SIMULATES, AND WHAT IT ASSUMES ───────────────────────────────
 *
 * A season is 15 weeks. Each week: my score is drawn from my own distribution,
 * the nine opponents from the league's empirical weekly distribution. A weekly
 * high pays $100. H2H wins accumulate into a seed; the seed pays per the table
 * above. Expected dollars is then a function of (my mean, my sd), and the
 * question "should I take the volatile player" becomes arithmetic.
 *
 * ASSUMPTIONS, STATED BECAUSE THEY DRIVE THE ANSWER:
 *   - Opponents are drawn INDEPENDENTLY from the league distribution. Real
 *     opponents have their own means; a strong opponent is not a random draw.
 *     This makes my H2H record depend only on my own score, which is roughly
 *     right in a 10-team league where I face everyone.
 *   - The playoff bracket is NOT simulated. Seeding pays; winning the bracket
 *     is treated as proportional to seed via the published table. That
 *     understates the value of a high seed and therefore understates the cost
 *     of variance -- stated because it cuts against the conclusion below.
 *   - Cory's mean is unknown for 2026. The sweep covers the achievable range
 *     rather than picking one.
 *
 * Run: node draft/tools/dollar_objective.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const HIST = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));

const POT = 4000, WEEKS = 15, WEEKLY = 100;
const REST = POT - WEEKS * WEEKLY;
const REG = [0.10, 0.05];
const PO = [0.27, 0.23, 0.19, 0.16];
/* Seed -> dollars. Seeds 1-4 make the bracket; 1 and 2 also take the regular
 * season money. Seeds 5-10 take nothing, which is the cliff that makes variance
 * dangerous for a good team. */
function seedPay(seed) {
  let d = 0;
  if (seed <= 4) d += PO[seed - 1] * REST;
  if (seed === 1) d += REG[0] * REST;
  if (seed === 2) d += REG[1] * REST;
  return d;
}

/* League weekly score distribution and per-team residuals, both empirical. */
const scores = [], resid = [];
HIST.seasons.filter(s => s.status === 'complete').forEach(s => {
  const PW = (s.settings || {}).playoff_week_start || 16;
  const byR = {};
  Object.keys(s.weeks).map(Number).filter(w => w < PW).forEach(w =>
    (s.weeks[String(w)] || []).forEach(r => {
      const v = Number(r.points) || 0;
      scores.push(v);
      (byR[r.roster_id] = byR[r.roster_id] || []).push(v);
    }));
  Object.values(byR).forEach(a => {
    const m = a.reduce((x, y) => x + y, 0) / a.length;
    a.forEach(v => resid.push(v - m));
  });
});
const residSd = Math.sqrt(resid.reduce((a, r) => a + r * r, 0) / resid.length);

/* Deterministic LCG — a Monte Carlo whose answer changes between runs cannot be
 * checked into a repo that argues about reproducibility. */
let seed0 = 20260822;
function rnd() { seed0 = (seed0 * 1103515245 + 12345) & 0x7fffffff; return seed0 / 0x7fffffff; }
const pick = arr => arr[Math.floor(rnd() * arr.length)];

/* My weekly score: my mean plus a residual RESCALED to the sd being tested, so
 * the SHAPE stays this league's and only the spread moves. */
function season(mu, sd, N) {
  const k = sd / residSd;
  let dollars = 0;
  for (let n = 0; n < N; n++) {
    let highs = 0, wins = 0;
    for (let w = 0; w < WEEKS; w++) {
      const mine = mu + pick(resid) * k;
      let best = -Infinity, beat = 0;
      for (let o = 0; o < 9; o++) {
        const opp = pick(scores);
        if (opp > best) best = opp;
        if (mine > opp) beat++;
      }
      if (mine > best) highs++;
      /* One H2H game a week: the opponent is one of the nine, so P(win) is the
       * share of opponents beaten. Sampling that share directly is the same
       * expectation with less noise. */
      if (rnd() < beat / 9) wins++;
    }
    /* Wins -> seed, via the observed 15-game win-to-seed mapping in this league:
     * 10+ wins has always made the bracket, 8 has been the cut line. */
    const s = wins >= 12 ? 1 : wins >= 11 ? 2 : wins >= 10 ? 3 : wins >= 9 ? 4
      : wins >= 8 ? 5 : 7;
    dollars += highs * WEEKLY + seedPay(s);
  }
  return dollars / N;
}

console.log('THE DRAFT OBJECTIVE IN DOLLARS — 37.5% of this pot is paid weekly\n');
console.log('  pot $' + POT + ':  $' + (WEEKS * WEEKLY) + ' on weekly highs ('
  + (100 * WEEKS * WEEKLY / POT).toFixed(1) + '%), $' + REST + ' on finish');
console.log('  seed pays:  1st $' + seedPay(1).toFixed(0) + '   2nd $' + seedPay(2).toFixed(0)
  + '   3rd $' + seedPay(3).toFixed(0) + '   4th $' + seedPay(4).toFixed(0) + '   5th+ $0');
console.log('  ONE WEEKLY HIGH = $' + WEEKLY + ' = a quarter of the 4th-place cheque.');

const N = 4000;
const SDS = [12, 16, 20, 24, 28];
console.log('\n  EXPECTED DOLLARS by (my weekly mean, my weekly sd) — ' + N + ' seasons each');
console.log('    league weekly sd is ' + residSd.toFixed(1) + '; observed team sds ran 12.4 to 25.6');
console.log('\n    mean     ' + SDS.map(s => ('sd ' + s).padStart(9)).join('') + '     best sd');
console.log('    ' + '-'.repeat(72));
[100, 105, 110, 115, 120, 125].forEach(mu => {
  const row = SDS.map(sd => season(mu, sd, N));
  const best = SDS[row.indexOf(Math.max.apply(null, row))];
  console.log('    ' + String(mu).padStart(4) + '   ' + row.map(v => ('$' + v.toFixed(0)).padStart(9)).join('')
    + '     sd ' + best);
});

/* ── THE DECOMPOSITION, WHICH IS THE ACTUAL ANSWER ────────────────────────── */
console.log('\n  WHERE THE MONEY MOVES — the two channels, separated');
console.log('    mean   sd    weekly $   finish $   total     vs sd 12');
console.log('    ' + '-'.repeat(64));
[105, 115, 125].forEach(mu => {
  let base = null;
  SDS.forEach(sd => {
    /* Re-run split so the two channels are attributable rather than inferred. */
    let hi = 0, fin = 0;
    const k = sd / residSd;
    for (let n = 0; n < N; n++) {
      let highs = 0, wins = 0;
      for (let w = 0; w < WEEKS; w++) {
        const mine = mu + pick(resid) * k;
        let best = -Infinity, beat = 0;
        for (let o = 0; o < 9; o++) { const opp = pick(scores); if (opp > best) best = opp; if (mine > opp) beat++; }
        if (mine > best) highs++;
        if (rnd() < beat / 9) wins++;
      }
      const s = wins >= 12 ? 1 : wins >= 11 ? 2 : wins >= 10 ? 3 : wins >= 9 ? 4 : wins >= 8 ? 5 : 7;
      hi += highs * WEEKLY; fin += seedPay(s);
    }
    hi /= N; fin /= N;
    if (base === null) base = hi + fin;
    console.log('    ' + String(mu).padStart(4) + String(sd).padStart(5)
      + ('$' + hi.toFixed(0)).padStart(11) + ('$' + fin.toFixed(0)).padStart(11)
      + ('$' + (hi + fin).toFixed(0)).padStart(9)
      + ((hi + fin - base) >= 0 ? '   +$' : '   -$') + Math.abs(hi + fin - base).toFixed(0));
  });
  console.log('');
});

console.log('  WHAT THIS DOES AND DOES NOT LICENSE');
console.log('    The bracket is NOT simulated — seeding pays via the published table and');
console.log('    winning it is not modelled. That UNDERSTATES the value of a high seed and');
console.log('    therefore understates what variance costs, which cuts against whatever the');
console.log('    table above concludes. Opponents are drawn independently from the league');
console.log('    distribution rather than carrying their own means.');
console.log('    And this prices a SEASON-LONG variance choice. It says nothing about which');
console.log('    player to take at pick 28 — a single roster slot moves a team sd by a');
console.log('    fraction of one point, far below the grid resolution here.');
console.log('    USE IT FOR THE 50/50 CASES ONLY, which is exactly where Cory placed it:');
console.log('    "maybe only affects 50/50 decisions, lean for upside or volatility."');
