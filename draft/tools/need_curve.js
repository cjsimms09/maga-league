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

/* ── THE CORRECTION CHANGES TWO THINGS, NOT ONE, AND THE FIRST CUT HID THAT ──
 *
 * `needNew` swaps the per-week miss rate (shipped `INJURY` -> `q` derived from
 * the board's `games_expected`) AND swaps the basis (one week -> seventeen).
 * Written as one function those are inseparable, and the headline "RB need at
 * the fourth back goes 0.191 -> 0.902" then has no attribution.
 *
 * ⚠️ AND THE CONTROL THAT WAS SUPPOSED TO LICENSE IT DID NOT TOUCH IT. C1's
 * first version compared `needOld` against a REIMPLEMENTATION OF `needOld` and
 * reported `worst_abs_diff: 0` — it never called `needNew` at all, so it
 * proved "the old function is a binomial" and nothing else. Measured: at
 * WEEKS=1 the new curve differs from the shipped one by up to 0.095 (RB at
 * held-3, 0.6268 vs 0.5319), because the rate is q and not INJURY. Register
 * 118's shape — a control that is not what its name says — inside the tool
 * register 110's whole conclusion rests on. Register 393.
 *
 * So the rate and the basis are now PARAMETERS, C1 forces them back to the
 * shipped pair and demands exactness, and the report prints the decomposition
 * next to the headline. The conclusion SURVIVES: the move is the basis, and
 * the rate swap offsets a little of it (RB held-4: shipped 0.191 -> 0.973 on
 * basis alone -> 0.902 with both). It was understated, not overstated. */
function needAt(pos, held, flexOwner, opt) {
  const S = slotsOf(pos, flexOwner);
  if (S <= 0) return 0;
  if (held < S) return 1.0;
  const o = opt || {};
  const weeks = o.weeks != null ? o.weeks : WEEKS;
  const rate = o.rate != null ? o.rate
    : (WEEKS - gamesExpected(pos) + 1) / WEEKS;         // +1 = the bye
  const weekly = binomAtLeast(held - S + 1, S, rate);
  return 1 - Math.pow(1 - weekly, weeks);
}

function needNew(pos, held, flexOwner) {
  return needAt(pos, held, flexOwner, null);
}

/* ── controls ─────────────────────────────────────────────────────────────── */
const ctl = {};
{
  /* C1 — the NEW function, driven at the shipped rate and the shipped basis,
   * must reproduce the OLD curve exactly. If it cannot reproduce what ships,
   * its "correction" is not a correction.
   *
   * ⚠️ THE POINT OF THE REWRITE: this now calls `needAt`, the function under
   * test. The version it replaces compared `needOld` against a fresh
   * reimplementation of `needOld` and could not have failed (register 393). */
  let worst = 0;
  POS.forEach(pos => {
    for (let h = 0; h <= 8; h++) {
      const oldv = needOld(pos, h, 'RB');
      const reprod = needAt(pos, h, 'RB', { rate: INJURY[pos], weeks: 1 });
      worst = Math.max(worst, Math.abs(oldv - reprod));
    }
  });
  ctl.C1_reproduces_the_shipped_curve = { ok: worst < 1e-12, worst_abs_diff: worst,
    why: 'needAt() forced to the shipped rate and one-week basis IS pNeedNth' };

  /* C1b — THE KNOWN NEGATIVE C1 NEVER HAD. A control that only ever shows
   * agreement cannot tell agreement from a stub, so prove the same comparison
   * DISAGREES when the rate is left at its measured value — which is exactly
   * what the old C1 would have caught had it called the function. */
  let worstFree = 0;
  POS.forEach(pos => {
    for (let h = 0; h <= 8; h++) {
      worstFree = Math.max(worstFree,
        Math.abs(needOld(pos, h, 'RB') - needAt(pos, h, 'RB', { weeks: 1 })));
    }
  });
  ctl.C1b_known_negative_the_rate_swap_is_visible = { ok: worstFree > 1e-6,
    worst_abs_diff: +worstFree.toFixed(6),
    why: 'at WEEKS=1 but the MEASURED rate the curves must differ; if this '
       + 'reads 0 the comparison is not looking at the new function' };
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
/* C6 — THE GUARD FOR THE DEFECT THAT SILENTLY MOVED THIS TOOL'S HEADLINE.
 * The league-wide keeper lock empties every keeper out of `board.players`, and
 * the pricing line below is a statement about the LEAGUE, not about the
 * draftable pool. If the keepers ever stop reaching `positionPopulation` this
 * must go red rather than quietly re-price a running back at 2.2 (register 393). */
{
  const kept = (DATA.kept_players || []).length;
  const rb = positionPopulation('RB').length;
  const rbDraftable = DATA.players.filter(p => p.position === 'RB' && p.proj_mean).length;
  ctl.C6_keepers_are_in_the_population = {
    ok: kept > 0 && rb > rbDraftable,
    kept_players: kept, rb_in_population: rb, rb_in_draftable_pool: rbDraftable,
    why: 'the last-starter line is a POPULATION question; since the 08-23 lock '
       + 'the draftable pool alone reads it 23 bodies too deep, worst at RB '
       + '(114.2 vs 159.8, 12 of the 23 keepers)' };
}
ctl.C5_flex_credited_once = {
  ok: POS.reduce((n, p) => n + (slotsOf(p, 'RB') - (STARTERS[p] || 0)), 0) === (STARTERS.FLEX || 0),
  why: 'crediting the flex to RB, WR and TE at once once drafted three tight ends' };
const allOk = Object.values(ctl).every(c => c.ok);

/* ── report ───────────────────────────────────────────────────────────────── */
/* ── THE WAIVER LEVELS ARE NOW READ FROM draft_plan, NOT SNAPSHOTTED ────────
 * These were four literals with the comment "draft_plan's measured levels".
 * They WERE draft_plan's levels on 2026-08-19. On 2026-08-28 draft_plan
 * measures QB 305 · RB 84 · WR 112 · TE 113 — every one of them has moved, RB
 * by 28 points. A copied constant labelled as a measurement is the shape this
 * repo keeps paying for (register 5h), so it is a live read now: draft_plan
 * exports WAIVER and is silent when required (`LOUD = require.main === module`).
 * Register 393. */
const WAIVER = require(path.join(ROOT, 'draft', 'tools', 'draft_plan.js')).WAIVER;
['QB', 'RB', 'WR', 'TE'].forEach(p => {
  if (!(Number(WAIVER[p]) > 0)) {
    throw new Error('need_curve: draft_plan reported no waiver level for ' + p
      + ' — REFUSING to substitute a constant (register 393).');
  }
});
const rows = {};
console.log('THE NEED CURVE — one-week (shipped) vs season (corrected)   P142/P143\n');
Object.entries(ctl).forEach(([k, c]) => console.log('  ' + (c.ok ? 'OK ' : '!! ') + k));
if (!allOk) console.log('\n  !! A CONTROL FAILED. Nothing below is a measurement.\n');
console.log('\n  q per week (measured, incl. bye): '
  + POS.map(p => p + ' ' + ((WEEKS - gamesExpected(p) + 1) / WEEKS).toFixed(3)).join('  '));
console.log('\n  need by HOW MANY YOU ALREADY HOLD  (flex credited to RB)');
console.log('  ' + 'pos'.padEnd(5) + 'slots'.padEnd(7)
  + [0, 1, 2, 3, 4, 5].map(h => ('held ' + h).padStart(11)).join(''));
POS.forEach(pos => {
  const S = slotsOf(pos, 'RB');
  const o = [], n = [];
  for (let h = 0; h <= 5; h++) { o.push(needOld(pos, h, 'RB')); n.push(needNew(pos, h, 'RB')); }
  rows[pos] = { slots: S, one_week: o.map(x => +x.toFixed(3)), season: n.map(x => +x.toFixed(3)) };
  console.log('  ' + pos.padEnd(5) + String(S).padEnd(7)
    + o.map(x => x.toFixed(3).padStart(11)).join('') + '   shipped (one week)');
  console.log('  ' + ''.padEnd(5) + ''.padEnd(7)
    + n.map(x => x.toFixed(3).padStart(11)).join('') + '   CORRECTED (season)');
});

/* ── THE DECOMPOSITION (register 393) ──────────────────────────────────────
 * The correction moves the RATE and the BASIS at once. Printed apart so the
 * headline number can never again be quoted without knowing which half did it.
 * A = shipped · B = rate only · C = basis only · D = both (the corrected curve). */
const DECOMP = [['QB', 1], ['RB', 3], ['RB', 4], ['WR', 2], ['WR', 3], ['TE', 1]];
const decomp = DECOMP.map(([pos, h]) => ({
  pos: pos, held: h,
  A_shipped: +needAt(pos, h, 'RB', { rate: INJURY[pos], weeks: 1 }).toFixed(4),
  B_rate_only: +needAt(pos, h, 'RB', { weeks: 1 }).toFixed(4),
  C_basis_only: +needAt(pos, h, 'RB', { rate: INJURY[pos] }).toFixed(4),
  D_corrected: +needAt(pos, h, 'RB', null).toFixed(4),
}));
console.log('\n  WHICH HALF OF THE CORRECTION DID IT?  (register 393)');
console.log('  ' + 'pos'.padEnd(4) + 'held'.padEnd(6)
  + 'A shipped'.padStart(11) + 'B rate only'.padStart(13)
  + 'C basis only'.padStart(14) + 'D corrected'.padStart(13));
decomp.forEach(d => console.log('  ' + d.pos.padEnd(4) + String(d.held).padEnd(6)
  + d.A_shipped.toFixed(3).padStart(11) + d.B_rate_only.toFixed(3).padStart(13)
  + d.C_basis_only.toFixed(3).padStart(14) + d.D_corrected.toFixed(3).padStart(13)));
console.log('  the BASIS carries the correction; the rate swap OFFSETS a little of it,');
console.log('  so the published move is understated rather than overstated.');

/* P142 — RB/WR need at the 3rd and 4th HELD body */
const p142 = { RB_held3: rows.RB.season[3], RB_held4: rows.RB.season[4],
               WR_held3: rows.WR.season[3], WR_held4: rows.WR.season[4],
               shipped_RB_held3: rows.RB.one_week[3], shipped_RB_held4: rows.RB.one_week[4] };
p142.TRUE = [p142.RB_held3, p142.RB_held4, p142.WR_held3, p142.WR_held4].every(v => v >= 0.25);

/* P143 — priced against the wire, does the 2nd QB/TE fall below the 3rd RB/WR?
 * Priced on a common yardstick: need x (a replacement-level starter's points
 * MINUS the waiver level), using the board's own positional medians. */
/* ── "THE LAST STARTER LEAGUE-WIDE" IS A POPULATION QUESTION, SO THE KEEPERS
 *    BELONG IN IT — AND SINCE 2026-08-23 THEY WERE NOT (register 393) ───────
 *
 * `board.players` is the DRAFTABLE pool. Since the league-wide keeper lock it
 * EXCLUDES all 23 kept players, and those are the best players in the league.
 * Reading the tenth-best-per-team line out of the draftable pool alone
 * therefore reads a line 23 bodies too deep.
 *
 * MEASURED, 2026-08-28: 12 of the 23 keepers are running backs, so the damage
 * is wildly uneven — RB's last-starter line reads 114.2 where the true league
 * population gives 159.8, a 45.6-point error, against QB 3.0 and TE 3.7. That
 * single number is what drove the 3rd-RB price from a published 41.6 down to
 * 2.2 and flipped P143's grade to FALSE. It was an artifact, not a reversal.
 *
 * This is the AVAILABILITY-vs-POPULATION confusion for the seventh time: the
 * lock is correct for "who can I draft" and wrong for "how good is a starter
 * in this league". */
function positionPopulation(pos) {
  return DATA.players.concat(DATA.kept_players || [])
    .filter(p => p.position === pos && p.proj_mean)
    .map(p => +p.proj_mean).sort((a, b) => b - a);
}
function typicalStarter(pos) {
  const v = positionPopulation(pos);
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
console.log('  ' + 'pos'.padEnd(5) + [0, 1, 2, 3, 4, 5].map(h => ('held ' + h).padStart(11)).join(''));
POS.forEach(p => console.log('  ' + p.padEnd(5) + priced[p].map(x => x.toFixed(1).padStart(11)).join('')));

console.log('\n  P142 (RB/WR need >= 0.25 at held 3 AND 4): ' + (p142.TRUE ? 'TRUE' : 'FALSE'));
console.log('     shipped RB held-3 ' + p142.shipped_RB_held3.toFixed(3)
  + ', held-4 ' + p142.shipped_RB_held4.toFixed(3)
  + '  ->  corrected ' + p142.RB_held3.toFixed(3) + ', ' + p142.RB_held4.toFixed(3));
console.log('     WR held-3 ' + p142.WR_held3.toFixed(3) + ', held-4 ' + p142.WR_held4.toFixed(3)
  + '   <- WR does NOT own the flex in this run, so it collapses one body earlier');
console.log('  P143 (2nd QB and 2nd TE price below 3rd RB and 3rd WR): ' + (p143.TRUE ? 'TRUE' : 'FALSE'));
console.log('     2nd QB ' + p143.second_QB.toFixed(1) + ' · 2nd TE ' + p143.second_TE.toFixed(1)
  + '   vs   3rd RB ' + p143.third_RB.toFixed(1) + ' · 3rd WR ' + p143.third_WR.toFixed(1));

/* PROVENANCE, because the whole of register 393's defect 2 was a table quoted
 * for nine days without anyone able to see which board produced it. An artifact
 * that cannot name its own input is one board rebuild away from being a lie. */
const rep = { _territory: 'TERRITORY: A — draft/tools/need_curve.js',
  _prereg: 'draft/NEED-CURVE-PREREG-2026-08-19.md',
  _generated_at: new Date().toISOString(),
  _board_built_at: DATA.built_at || null,
  _board_players: (DATA.players || []).length,
  _board_kept_players: (DATA.kept_players || []).length,
  _note: 'REPORT ONLY. draft_plan.js is NOT touched; it feeds seat_plan.json which the war room reads.',
  controls: ctl, controls_all_passed: allOk, weeks: WEEKS, waiver_levels: WAIVER,
  curves: rows, priced_against_wire: priced, P142: p142, P143: p143,
  decomposition: decomp,
  _decomposition_note: 'register 393 — the correction swaps the per-week rate AND '
    + 'the basis. A shipped / B rate only / C basis only / D corrected. The basis '
    + 'carries it; the rate swap offsets a little, so the move is understated.' };
const i = process.argv.indexOf('--json');
if (i >= 0) { fs.writeFileSync(process.argv[i + 1], JSON.stringify(rep, null, 1));
  console.log('\n  wrote ' + process.argv[i + 1]); }
process.exitCode = allOk ? 0 : 1;
