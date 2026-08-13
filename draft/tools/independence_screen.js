// TERRITORY: A
/* IS THIS QUANTITY CARRYING INFORMATION THE SCORE DOES NOT ALREADY HAVE?
 *
 * WHY THIS EXISTS. Four terms in this model have been measured and found
 * worthless, and each result was read as a fact about football:
 *
 *     tier      -235   "tier cliffs do not pay"
 *     risk      -143   "safety does not pay"
 *     ceiling   unsignable, "upside cannot be measured"
 *     bye       null   "bye weeks do not matter"
 *
 * At least three of those were NOT facts about football. They were facts about
 * ALGEBRA, and this screen finds them mechanically:
 *
 *   proj_ceiling = proj_mean + 1.036 x proj_sd, every player, every position.
 *       A ceiling weight is a relabelled mix of the value and variance weights.
 *   tier is MONOTONE in proj_mean rank within position, all four skill positions.
 *       A tier term is a coarsening of the ordering it is added to.
 *   implied games played = (proj_sd / weekly_sd)^2 is a POSITION CONSTANT
 *       (all 132 RBs span 1.35 games). Points-per-game is therefore proj_mean
 *       divided by a constant, and reranking by it moves no RB more than one
 *       place. Harstad's per-game VBD correction is unavailable on this board --
 *       not unimplemented, UNAVAILABLE, because the input does not exist.
 *
 * A REGRESSOR THAT IS A FUNCTION OF THE REGRESSORS ALREADY PRESENT CANNOT BE
 * MEASURED. Its estimated weight is whatever the fit needs it to be, and its
 * sign is noise. Reporting that as "the idea does not work" is the error.
 *
 * THIS IS A SCREEN, NOT A VERDICT. It reports and does not decide -- per the
 * pitfall-2 ruling on the September detector. A DERIVED verdict means "this
 * cannot be independently measured on this board", never "delete it".
 *
 * ── WHAT IT CANNOT SEE, STATED SO A PASS IS NOT OVER-READ ───────────────────
 *
 * It tests linear and rank dependence between fields ON THE BOARD. It cannot
 * see a quantity that is redundant through a NONLINEAR route, nor one that is
 * redundant with something computed inside the engine rather than stored. An
 * INDEPENDENT verdict here is necessary, not sufficient.
 *
 * Run: node draft/tools/independence_screen.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const pool = DATA.players.filter(p => p.position && (p.proj_mean || 0) > 0);
const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

/* Numeric fields present on essentially every player. A field missing on a
 * large minority is excluded and SAID so, rather than silently compared on a
 * subset that may be selected. */
const counts = {};
pool.forEach(p => Object.keys(p).forEach(k => {
  if (typeof p[k] === 'number' && isFinite(p[k])) counts[k] = (counts[k] || 0) + 1;
}));
const FIELDS = Object.keys(counts).filter(k => counts[k] === pool.length && k !== 'player_id');
const skipped = Object.keys(counts).filter(k => counts[k] !== pool.length && counts[k] > 20);

console.log('INDEPENDENCE SCREEN — which board quantities carry their own information\n');
console.log('  ' + pool.length + ' projected players, ' + FIELDS.length + ' fully-populated numeric fields');
if (skipped.length) console.log('  EXCLUDED (present on only some players, so a comparison would be on a '
  + 'possibly-selected subset): ' + skipped.join(', '));
console.log();

const col = f => pool.map(p => p[f]);
function r2(y, xs) {                    // least squares of y on [1, ...xs]
  const n = y.length, k = xs.length + 1;
  const X = [];
  for (let i = 0; i < n; i++) { const r = [1]; xs.forEach(x => r.push(x[i])); X.push(r); }
  const A = Array.from({ length: k }, () => new Float64Array(k + 1));
  for (let a = 0; a < k; a++) {
    for (let b = 0; b < k; b++) { let s = 0; for (let i = 0; i < n; i++) s += X[i][a] * X[i][b]; A[a][b] = s; }
    let s = 0; for (let i = 0; i < n; i++) s += X[i][a] * y[i]; A[a][k] = s;
  }
  for (let c = 0; c < k; c++) {         // gaussian elimination with partial pivoting
    let piv = c; for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-12) return { r2: NaN, beta: null };
    const t = A[c]; A[c] = A[piv]; A[piv] = t;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let j = c; j <= k; j++) A[r][j] -= f * A[c][j];
    }
  }
  const beta = []; for (let c = 0; c < k; c++) beta.push(A[c][k] / A[c][c]);
  const my = y.reduce((s, v) => s + v, 0) / n;
  let ss = 0, tt = 0;
  for (let i = 0; i < n; i++) {
    let f = beta[0]; for (let j = 0; j < xs.length; j++) f += beta[j + 1] * xs[j][i];
    ss += (y[i] - f) * (y[i] - f); tt += (y[i] - my) * (y[i] - my);
  }
  return { r2: tt > 0 ? 1 - ss / tt : NaN, beta };
}
/* TIES MUST BE HANDLED EXPLICITLY, AND THE FIRST VERSION OF THIS DID NOT.
 *
 * It ranked with a plain sort, so a field holding ONE value per position came
 * back rho = 1.0000 "IDENTICAL ORDERING" -- pure artifact of stable-sort
 * preserving the input order, which happened to be projection order. It flagged
 * `games_expected` and `replacement`, both of which are exactly one value per
 * position, as rank-identical to proj_mean. That is a VACUOUS CHECK inside the
 * tool built to find vacuous checks, and it is left documented rather than
 * quietly fixed. Constants are now reported as CONSTANT and never ranked; ties
 * elsewhere get average ranks. */
function ranksAvg(vals) {
  const idx = vals.map((v, i) => i).sort((a, b) => vals[b] - vals[a]);
  const r = new Array(vals.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && vals[idx[j + 1]] === vals[idx[i]]) j++;
    const avg = (i + j) / 2;
    for (let k = i; k <= j; k++) r[idx[k]] = avg;
    i = j + 1;
  }
  return r;
}
function spearmanWithinPos(f, g, subset) {
  const src = subset || pool;
  let worst = 1, sawAny = false, constPos = [];
  POS.forEach(pos => {
    const grp = src.filter(p => p.position === pos
      && Number.isFinite(p[f]) && Number.isFinite(p[g]));
    if (grp.length < 10) return;
    if (new Set(grp.map(p => p[f])).size < 2) { constPos.push(pos); return; }
    const a = ranksAvg(grp.map(p => p[f])), b = ranksAvg(grp.map(p => p[g])), n = grp.length;
    const ma = (n - 1) / 2;
    let c = 0, va = 0, vb = 0;
    for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - ma; c += x * y; va += x * x; vb += y * y; }
    if (!(va > 0 && vb > 0)) return;
    sawAny = true;
    worst = Math.min(worst, c / Math.sqrt(va * vb));
  });
  return { rho: sawAny ? worst : null, constPos };
}

/* ── 1. EXACT AFFINE LOCKS, ONE AND TWO PARENTS ────────────────────────────
 * R^2 above 0.9999 on a real football quantity is not a strong relationship,
 * it is an identity written in two places. */
console.log('  AFFINE LOCKS — a field reproduced from others to R^2 > 0.9999');
console.log('    ' + '-'.repeat(74));
const LOCK = 0.9999;
const derived = {};
FIELDS.forEach(f => {
  const y = col(f);
  if (new Set(y).size < 3) return;
  let best = null;
  FIELDS.forEach(g => {
    if (g === f) return;
    const r = r2(y, [col(g)]);
    if (r.r2 >= LOCK && (!best || r.r2 > best.r2)) best = { parents: [g], ...r };
  });
  if (!best) {
    for (let i = 0; i < FIELDS.length && !best; i++) for (let j = i + 1; j < FIELDS.length; j++) {
      if (FIELDS[i] === f || FIELDS[j] === f) continue;
      const r = r2(y, [col(FIELDS[i]), col(FIELDS[j])]);
      if (r.r2 >= LOCK) { best = { parents: [FIELDS[i], FIELDS[j]], ...r }; break; }
    }
  }
  if (best) {
    derived[f] = best;
    const terms = best.parents.map((g, i) => (best.beta[i + 1] >= 0 ? ' + ' : ' - ')
      + Math.abs(best.beta[i + 1]).toFixed(3) + '*' + g).join('');
    console.log('    ' + f.padEnd(15) + '= ' + best.beta[0].toFixed(2) + terms
      + '   R^2 ' + best.r2.toFixed(6));
  }
});
if (!Object.keys(derived).length) console.log('    none');

/* ── 2. RANK IDENTITY WITHIN POSITION ──────────────────────────────────────
 * A term can be free of an affine lock and still be unable to reorder anything.
 * VONA is compared WITHIN a position, so a field with Spearman 1.0 against
 * proj_mean inside every position adds nothing a value weight does not. */
console.log('\n  RANK IDENTITY — Spearman vs proj_mean WITHIN position (worst position shown)');
console.log('    a field at 1.000 cannot reorder anything a value weight has not already ordered');
console.log('    ' + '-'.repeat(74));
FIELDS.forEach(f => {
  if (f === 'proj_mean') return;
  const { rho, constPos } = spearmanWithinPos(f, 'proj_mean');
  if (constPos.length) console.log('    ' + f.padEnd(15)
    + 'ONE VALUE PER POSITION in ' + constPos.join('/') + ' — a per-position lookup');
  if (rho != null && Math.abs(rho) >= 0.98) console.log('    ' + f.padEnd(15) + 'rho ' + rho.toFixed(4)
    + (Math.abs(rho) >= 0.9999 ? '   IDENTICAL ORDERING' : '   near-identical'));
});
{
  const g = pool.filter(p => p.tier != null && ['QB', 'RB', 'WR', 'TE'].includes(p.position));
  let mono = true;
  POS.forEach(pos => {
    const s = g.filter(p => p.position === pos).sort((a, b) => b.proj_mean - a.proj_mean);
    for (let i = 1; i < s.length; i++) if (s[i].tier < s[i - 1].tier) mono = false;
  });
  console.log('    tier            is monotone in proj_mean rank within every position: ' + mono
    + (mono ? '   COARSENING' : ''));
  console.log('      => a tier term partitions the value ordering it is being added to. That is');
  console.log('         NOT what Boris Chen\'s tiers are: those cluster EXPERT RANK DISAGREEMENT,');
  console.log('         which is information the projection does not contain. The -235 result is');
  console.log('         evidence against THIS construction, not against tiers.');
}

/* ── 3. POSITION CONSTANTS ─────────────────────────────────────────────────
 * A quantity whose within-position spread is a rounding error is a per-position
 * lookup wearing a per-player name -- the 1,181-identical-values pattern, in
 * the source data rather than in our code. */
console.log('\n  POSITION CONSTANTS — within-position spread as a share of the whole-board spread');
console.log('    ' + '-'.repeat(74));
pool.forEach(p => { p._games = p.weekly_sd > 0 ? Math.pow(p.proj_sd / p.weekly_sd, 2) : null; });
[['implied games played  (proj_sd/weekly_sd)^2', p => p._games],
 ['proj_sd / proj_mean', p => p.proj_sd / p.proj_mean]].forEach(([label, fn]) => {
  const all = pool.map(fn).filter(v => v != null && isFinite(v));
  const whole = Math.max(...all) - Math.min(...all);
  const within = POS.map(pos => {
    const g = pool.filter(p => p.position === pos).map(fn).filter(v => v != null && isFinite(v));
    return g.length > 5 ? Math.max(...g) - Math.min(...g) : 0;
  });
  console.log('    ' + label);
  console.log('      whole board ' + whole.toFixed(2) + '   worst position ' + Math.max(...within).toFixed(2)
    + '   ratio ' + (Math.max(...within) / whole).toFixed(2)
    + (Math.max(...within) / whole < 0.5 ? '   -> LARGELY A POSITION CONSTANT' : ''));
});
{
  /* The consequence spelled out, because it is a real capability we do not have. */
  const rb = pool.filter(p => p.position === 'RB' && p._games);
  const a = rb.slice().sort((x, y) => y.proj_mean - x.proj_mean);
  const b = rb.slice().sort((x, y) => (y.proj_mean / y._games) - (x.proj_mean / x._games));
  let max = 0; a.forEach((x, i) => { max = Math.max(max, Math.abs(b.indexOf(x) - i)); });
  console.log('\n    CONSEQUENCE: reranking RBs by points-per-game instead of season total moves');
  console.log('    nobody more than ' + max + ' place(s). Harstad\'s per-game VBD -- which he names as');
  console.log('    THE central flaw in season-total VBD -- cannot be applied on this board. The');
  console.log('    board has no player-level durability estimate. Not unimplemented: ABSENT.');
}

/* ── 3b. THE PARTIALLY-POPULATED FIELDS — TESTED, NOT MERELY EXCLUDED ──────
 *
 * These were excluded above because comparing on a subset risks a selection
 * effect. Excluding them ENTIRELY is worse: `wopr`, `target_share` and
 * `opportunity_share` are on 428 players and are exactly the usage signals a
 * tiebreaker would want, and `proj_sleeper`/`proj_fantasypros` are two
 * independent projection sources on 402. Tested here ON THEIR OWN SUPPORT with
 * the coverage stated, so a reader can discount rather than be misled. */
console.log('\n  PARTIALLY-POPULATED FIELDS — tested on their own support (coverage shown)');
console.log('    a LOW R^2 here is the interesting case: it means real new information');
console.log('    ' + '-'.repeat(74));
['wopr', 'target_share', 'opportunity_share', 'proj_sleeper', 'proj_fantasypros',
 'adp_velocity', 'age', 'years_exp'].forEach(f => {
  /* Number.isFinite, NOT the global isFinite: isFinite(null) is TRUE (null coerces
   * to 0), so the bare form silently counted 148 null `wopr` values as zeros and
   * computed the independence verdict on contaminated data. */
  const sub = pool.filter(p => Number.isFinite(p[f]));
  if (sub.length < 50) return;
  const y = sub.map(p => p[f]);
  const r = r2(y, [sub.map(p => p.proj_mean), sub.map(p => p.proj_sd), sub.map(p => p.raw_adp)]);
  const { rho } = spearmanWithinPos(f, 'proj_mean', sub);
  const verdict = (r.r2 < 0.9 && (rho == null || Math.abs(rho) < 0.98))
    ? 'INDEPENDENT — carries its own information' : 'flagged';
  console.log('    ' + f.padEnd(19) + String(sub.length).padStart(4) + '/' + pool.length
    + '  R^2 from (mean,sd,adp) ' + r.r2.toFixed(3)
    + '  rank rho ' + (rho == null ? '  n/a' : (rho >= 0 ? ' ' : '') + rho.toFixed(3))
    + '   ' + verdict);
});
{
  /* Two projection sources on the same players is a DISAGREEMENT signal, which
   * is the quantity Boris Chen's tiers are actually built on and the quantity
   * our point-gap tiers are not. Measured here rather than assumed. */
  const s = pool.filter(p => Number.isFinite(p.proj_sleeper)
    && Number.isFinite(p.proj_fantasypros) && p.proj_mean > 0);
  const d = s.map(p => Math.abs(p.proj_sleeper - p.proj_fantasypros) / p.proj_mean).sort((a, b) => a - b);
  const rr = r2(s.map(p => Math.abs(p.proj_sleeper - p.proj_fantasypros)),
    [s.map(p => p.proj_mean), s.map(p => p.proj_sd)]);
  console.log('\n    SOURCE DISAGREEMENT |sleeper - fantasypros| on ' + s.length + ' players:');
  console.log('      relative gap  median ' + d[d.length >> 1].toFixed(3)
    + '  p90 ' + d[Math.floor(0.9 * d.length)].toFixed(3)
    + '   R^2 of the raw gap from (mean, sd): ' + rr.r2.toFixed(3));
  console.log('      This is an EXPERT-DISAGREEMENT signal and it is NOT what our tier field');
  console.log('      is built from. It is the closest thing on this board to a Chen tier.');
}

/* ── 4. THE CONTROL. A SCREEN THAT FLAGS EVERYTHING IS USELESS. ────────────
 * Something on this board must come back INDEPENDENT or the thresholds are
 * simply low. ADP is the natural control: it is the market's opinion, formed
 * outside our projection, so it SHOULD carry its own information. */
console.log('\n  CONTROL — the screen must clear something, or its thresholds are just low');
console.log('    ' + '-'.repeat(74));
['adjusted_adp', 'raw_adp', 'adp_sd'].forEach(f => {
  if (FIELDS.indexOf(f) < 0) return;
  const r = r2(col(f), [col('proj_mean'), col('proj_sd')]);
  console.log('    ' + f.padEnd(15) + 'R^2 from (proj_mean, proj_sd): ' + r.r2.toFixed(4)
    + '   rank rho vs proj_mean within pos: ' + (spearmanWithinPos(f, 'proj_mean').rho || 0).toFixed(3)
    + (r.r2 < 0.9 ? '   INDEPENDENT' : '   flagged'));
});
const flagged = Object.keys(derived).length;
console.log('\n  SUMMARY: ' + flagged + ' of ' + FIELDS.length + ' fields are affine-locked to others.');
console.log('  Everything flagged above is UNMEASURABLE AS A SEPARATE WEIGHT on this board.');
console.log('  That is a statement about identifiability, not about football, and not an');
console.log('  instruction to delete anything. Per the timing ruling, no removals before Aug 22.');
