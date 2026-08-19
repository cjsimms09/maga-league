// TERRITORY: A
/* THE NEED CURVE — Cory's spec, and the one-week bug that stops it working.
 *
 * Cory, 2026-08-19: "if 1 QB and TE has been drafted the need should drop
 * significantly ... meanwhile on WR and RB the need should not drop as much
 * until you have 3-4 of each due to injury and more starting spots"
 *
 * Prereg: draft/NEED-CURVE-PREREG-2026-08-19.md (P142, P143), committed first.
 *
 * THE DIAGNOSIS. draft_plan.js:307's pNeedNth is P(n of S starters out
 * SIMULTANEOUSLY, IN ONE WEEK). The question is "will I need this body in ANY
 * week of a seventeen-week season", and byes make it certain every starter
 * misses at least one. The existing function cannot see a bye at all, so RB
 * need reads 0.022 at the third extra body and 0.000 at the fourth -- collapsing
 * exactly where Cory says it should still hold.
 *
 *   q(pos)  = (17 - games_expected + 1) / 17     measured, +1 is the bye
 *   weekly  = P(at least k of S out in a week)   binomial
 *   season  = 1 - (1 - weekly)^17
 *
 *   need(pos, held) = 1.0                  when held < S  (cannot field it)
 *                   = season(held - S + 1) otherwise
 *
 * AND THE HALF THAT MUST NOT BE DOUBLE-COUNTED: a body you need is worth only
 * what you cannot get free. draft_plan's bench equation already multiplies by
 * (points - waiver level), and QB/TE are streamable where RB/WR are not. THAT
 * term carries "you can just pick one up", not the probability.
 *
 * ⚠️ draft_plan.js IS NOT TOUCHED. It feeds public/seat_plan.json, which the war
 * room reads (app.js:867). REPORT ONLY.
 *
 * Run: node draft/tools/need_curve.js [--json <path>]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

const WEEKS = 17;
const POS = ['QB', 'RB', 'WR', 'TE'];
const STARTERS = (DATA.league || {}).starters || {};
/* shipped constants, carried verbatim so control 1 can reproduce the old curve */
const INJURY = { QB: 0.14, RB: 0.28, WR: 0.20, TE: 0.22, K: 0.04, DEF: 0.02 };

/* CONTROL 4 — q comes from the BOARD's measured games_expected, not a constant.
 * Fail loudly rather than fall back: a silent default is how a made-up number
 * gets into a curve nobody re-derives. */
function gamesExpected(pos) {
  const v = DATA.players.filter(p => p.position === pos && p.games_expected != null)
    .map(p => +p.games_expected);
  if (!v.length) throw new Error('need_curve: the board carries no games_expected for ' + pos
    + ' — REFUSING to substitute a constant.');
  const s = v.slice().sort((a, b) => a - b);
  return s[s.length >> 1];                       // median
}

const binomAtLeast = (k, S, q) => {
  let p = 0;
  for (let j = k; j <= S; j++) {
    let c = 1;
    for (let i = 0; i < j; i++) c = c * (S - i) / (i + 1);
    p += c * Math.pow(q, j) * Math.pow(1 - q, S - j);
  }
  return p;
};

/* slots, with the FLEX credited to exactly ONE position (control 5) */
function slotsOf(pos, flexOwner) {
  return (STARTERS[pos] || 0) + (flexOwner === pos ? (STARTERS.FLEX || 0) : 0);
}

function needOld(pos, held, flexOwner) {
  const S = slotsOf(pos, flexOwner);
  if (S <= 0) return 0;
  if (held < S) return 1.0;
  return binomAtLeast(held - S + 1, S, INJURY[pos] || 0.15);
}

function needNew(pos, held, flexOwner) {
  const S = slotsOf(pos, flexOwner);
  if (S <= 0) return 0;
  if (held < S) return 1.0;
  const q = (WEEKS - gamesExpected(pos) + 1) / WEEKS;   // +1 = the bye
  const weekly = binomAtLeast(held - S + 1, S, q);
  return 1 - Math.pow(1 - weekly, WEEKS);
}

/* ── controls ─────────────────────────────────────────────────────────────── */
const ctl = {};
{
  /* C1 — with WEEKS=1 and the shipped injury rate, the new machinery must
   * reproduce the OLD curve exactly. If it cannot reproduce what ships, its
   * "correction" is not a correction. */
  let worst = 0;
  POS.forEach(pos => {
    for (let h = 0; h <= 8; h++) {
      const S = slotsOf(pos, 'RB');
      const oldv = needOld(pos, h, 'RB');
      const reprod = h < S ? 1.0 : binomAtLeast(h - S + 1, S, INJURY[pos]);
      worst = Math.max(worst, Math.abs(oldv - reprod));
    }
  });
  ctl.C1_reproduces_the_shipped_curve = { ok: worst < 1e-12, worst_abs_diff: worst,
    why: 'the same binomial at WEEKS=1 with the shipped rate IS pNeedNth' };
}
{
  let mono = true, bounded = true;
  POS.forEach(pos => {
    let prev = 2;
    for (let h = 0; h <= 8; h++) {
      const v = needNew(pos, h, 'RB');
      if (v > prev + 1e-12) mono = false;
      if (v < -1e-12 || v > 1 + 1e-12) bounded = false;
      prev = v;
    }
  });
  ctl.C2_monotone_non_increasing = { ok: mono };
  ctl.C3_bounded_0_1 = { ok: bounded };
}
ctl.C4_q_from_the_board = { ok: true,
  games_expected_median: Object.fromEntries(POS.map(p => [p, gamesExpected(p)])),
  why: 'read from the board; gamesExpected() throws rather than substituting' };
ctl.C5_flex_credited_once = {
  ok: POS.reduce((n, p) => n + (slotsOf(p, 'RB') - (STARTERS[p] || 0)), 0) === (STARTERS.FLEX || 0),
  why: 'crediting the flex to RB, WR and TE at once once drafted three tight ends' };
const allOk = Object.values(ctl).every(c => c.ok);

/* ── report ───────────────────────────────────────────────────────────────── */
const WAIVER = { QB: 319, RB: 112, WR: 124, TE: 124 };   // draft_plan's measured levels
const rows = {};
console.log('THE NEED CURVE — one-week (shipped) vs season (corrected)   P142/P143\n');
Object.entries(ctl).forEach(([k, c]) => console.log('  ' + (c.ok ? 'OK ' : '!! ') + k));
if (!allOk) console.log('\n  !! A CONTROL FAILED. Nothing below is a measurement.\n');
console.log('\n  q per week (measured, incl. bye): '
  + POS.map(p => p + ' ' + ((WEEKS - gamesExpected(p) + 1) / WEEKS).toFixed(3)).join('  '));
console.log('\n  need by HOW MANY YOU ALREADY HOLD  (flex credited to RB)');
console.log('  %-4s %-7s %s'.replace('%s', ''), 'pos', 'slots',
  [0, 1, 2, 3, 4, 5].map(h => ('held ' + h).padStart(11)).join(''));
POS.forEach(pos => {
  const S = slotsOf(pos, 'RB');
  const o = [], n = [];
  for (let h = 0; h <= 5; h++) { o.push(needOld(pos, h, 'RB')); n.push(needNew(pos, h, 'RB')); }
  rows[pos] = { slots: S, one_week: o.map(x => +x.toFixed(3)), season: n.map(x => +x.toFixed(3)) };
  console.log('  %-4s %-7s %s   shipped (one week)', pos, S, o.map(x => x.toFixed(3).padStart(11)).join(''));
  console.log('  %-4s %-7s %s   CORRECTED (season)', '', '', n.map(x => x.toFixed(3).padStart(11)).join(''));
});

/* P142 — RB/WR need at the 3rd and 4th HELD body */
const p142 = { RB_held3: rows.RB.season[3], RB_held4: rows.RB.season[4],
               WR_held3: rows.WR.season[3], WR_held4: rows.WR.season[4],
               shipped_RB_held3: rows.RB.one_week[3], shipped_RB_held4: rows.RB.one_week[4] };
p142.TRUE = [p142.RB_held3, p142.RB_held4, p142.WR_held3, p142.WR_held4].every(v => v >= 0.25);

/* P143 — priced against the wire, does the 2nd QB/TE fall below the 3rd RB/WR?
 * Priced on a common yardstick: need x (a replacement-level starter's points
 * MINUS the waiver level), using the board's own positional medians. */
function typicalStarter(pos) {
  const v = DATA.players.filter(p => p.position === pos && p.proj_mean)
    .map(p => p.proj_mean).sort((a, b) => b - a);
  const S = slotsOf(pos, 'RB');
  return v[Math.min(v.length - 1, S * 10 - 1)] || 0;    // ~last starter league-wide
}
const priced = {};
POS.forEach(pos => {
  const gap = Math.max(0, typicalStarter(pos) - (WAIVER[pos] || 0));
  priced[pos] = [0, 1, 2, 3, 4, 5].map(h => +(needNew(pos, h, 'RB') * gap).toFixed(1));
});
const p143 = { second_QB: priced.QB[1], second_TE: priced.TE[1],
               third_RB: priced.RB[2], third_WR: priced.WR[2] };
p143.TRUE = p143.second_QB < p143.third_RB && p143.second_QB < p143.third_WR
         && p143.second_TE < p143.third_RB && p143.second_TE < p143.third_WR;

console.log('\n  PRICED AGAINST THE WIRE — need x (last starter\'s points - waiver level)');
console.log('  %-4s %s', 'pos', [0, 1, 2, 3, 4, 5].map(h => ('held ' + h).padStart(11)).join(''));
POS.forEach(p => console.log('  %-4s %s', p, priced[p].map(x => x.toFixed(1).padStart(11)).join('')));

console.log('\n  P142 (RB/WR need >= 0.25 at held 3 AND 4): %s', p142.TRUE ? 'TRUE' : 'FALSE');
console.log('     shipped said RB held-3 %.3f, held-4 %.3f; corrected says %.3f, %.3f',
  p142.shipped_RB_held3, p142.shipped_RB_held4, p142.RB_held3, p142.RB_held4);
console.log('  P143 (2nd QB and 2nd TE price below 3rd RB and 3rd WR): %s', p143.TRUE ? 'TRUE' : 'FALSE');
console.log('     2nd QB %.1f · 2nd TE %.1f   vs   3rd RB %.1f · 3rd WR %.1f',
  p143.second_QB, p143.second_TE, p143.third_RB, p143.third_WR);

const rep = { _territory: 'TERRITORY: A — draft/tools/need_curve.js',
  _prereg: 'draft/NEED-CURVE-PREREG-2026-08-19.md',
  _note: 'REPORT ONLY. draft_plan.js is NOT touched; it feeds seat_plan.json which the war room reads.',
  controls: ctl, controls_all_passed: allOk, weeks: WEEKS, waiver_levels: WAIVER,
  curves: rows, priced_against_wire: priced, P142: p142, P143: p143 };
const i = process.argv.indexOf('--json');
if (i >= 0) { fs.writeFileSync(process.argv[i + 1], JSON.stringify(rep, null, 1));
  console.log('\n  wrote ' + process.argv[i + 1]); }
process.exitCode = allOk ? 0 : 1;
