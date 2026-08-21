// TERRITORY: relay measures · A owns the term · CORY owns the cap
// THREE FINDINGS ABOUT `opportunity_adj` ARE DORMANT, NOT FIXED.
//
// Registers E3, E4 and E5 each measured a real defect in the opportunity
// adjustment — the composite's only per-player term:
//
//   E3  IT SATURATES. 30 players pinned at exactly the 0.15 cap, 22 of them
//       top-50, with the underlying `opportunity_z` spanning 2.00-3.77 flattened
//       to one number. `proj_mean = proj_sleeper x 1.1500` for 21 of the top 24.
//   E4  IT IS NOT MEAN-PRESERVING AND SKIPS QB/K/DEF. Pool shift RB +7.60%,
//       WR +7.04%, TE +6.81%, QB +0.00%. Since the board ranks ACROSS positions
//       on vorp, that is a positional thumb on the scale — Josh Allen ovr 16
//       would be ~10 under symmetric treatment.
//   E5  IT IS A VETERAN BONUS. Median +0.0783 / +0.1166 / +0.1454 / +0.1377 by
//       experience band; 0 of 13 young top-150 players reach the cap against
//       26 of 66 established. Two top-150 rookies with `wopr: null` get 0.0000.
//
// ── WHY THEY ARE CLOSED, AND WHY THAT IS NOT THE SAME AS FIXED ─────────────
//
// Cory ruled `opportunity_cap = 0.0` ("Remove 1"). The term now evaluates to
// `max(-0, min(0, (z/2) x 0))` for every player, so all three defects are
// unobservable: nothing saturates, every position shifts by the same 0.00%, and
// a bonus that is zero for everyone cannot favour veterans.
//
// **NONE OF THE THREE WAS REPAIRED.** The formula is untouched; only its
// amplitude is zero. Raise the cap and all three return together, in a single
// config edit, with the findings archived as "closed" and nobody re-reading
// them.
//
// So this file is what the three rows became: a guard that fires the moment the
// term is switched back on, pointing at the work that would then be owed.
//
// Run: node draft/tests/opportunity_adj_stays_off.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 400) : '')); }
};

const CFG = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'draft', 'config', 'league_config.json'), 'utf8'));
const B = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const P = B.players;

// ── 1. THE RULING IS STILL IN FORCE ────────────────────────────────────────
{
  /* ⚠️ THE TRIPWIRE. If this fails, E3/E4/E5 are LIVE AGAIN and must be
   * reopened before the board is trusted — the term's defects were never
   * repaired, only silenced. Do not "fix" this by editing the expectation. */
  ck('CORY\'S RULING HOLDS: `opportunity_cap` is 0.0, so E3/E4/E5 stay dormant. '
    + 'If this fails, REOPEN all three — the formula was never repaired, only '
    + 'zeroed',
  CFG.opportunity_cap === 0 || CFG.opportunity_cap === 0.0,
  { opportunity_cap: CFG.opportunity_cap });
}

// ── 2. E3 — NOTHING SATURATES, BECAUSE NOTHING MOVES ───────────────────────
{
  const adj = P.filter(p => 'opportunity_adj' in p).map(p => p.opportunity_adj);
  ck('CONTROL: the field still EXISTS on every player, so the checks below are '
    + 'measuring a live field and not a renamed one',
  adj.length === P.length && P.length > 400, { carrying: adj.length, players: P.length });

  ck('E3 DORMANT: no player sits at the old 0.15 cap (the row measured 30, '
    + '22 of them top-50)', adj.filter(v => v === 0.15).length === 0);

  /* ⚠️ REWRITTEN 2026-08-20. THIS ASSERTED A WORLD THAT NO LONGER EXISTS, and
   * it was one of eleven draft-critical suites found red by the classifier the
   * external reviewer asked for (draft/tools/draft_critical.js).
   *
   * It required `proj_mean === proj_sleeper` EXACTLY for every player. That was
   * the right test when proj_mean WAS Sleeper's number and the E3 defect was a
   * uniform x1.15 rescale of it. proj_mean is now the mean of SEVEN sources,
   * centred per position, so it differs from Sleeper on 525 of 610 players by
   * construction — and the test read that as the defect returning.
   *
   * THE DEFECT E3 NAMED IS A CONSTANT MULTIPLE, so that is what is asserted
   * now, and it is a stronger check than equality ever was: a board where
   * proj_mean is Sleeper x k for a fixed k would pass the old test's INTENT
   * only by failing its letter, and would pass nothing here.
   *
   * Measured on the committed board before this was written: the
   * proj_mean/proj_sleeper ratio has median 1.0249, p10 0.7739, p90 1.5980 —
   * a wide player-specific spread, which is exactly what a genuine blend looks
   * like and exactly what a rescale does not. */
  const both = P.filter(p => p.proj_sleeper != null && p.proj_mean != null
    && p.proj_sleeper > 0);
  const ratios = both.map(p => p.proj_mean / p.proj_sleeper).sort((a, b) => a - b);
  const q = f => ratios[Math.floor(ratios.length * f)];
  const spread = q(0.9) - q(0.1);
  ck('E3 DORMANT: `proj_mean` is not a CONSTANT MULTIPLE of `proj_sleeper` — '
    + 'the x1.1500 the row found on 21 of the top 24 is gone, and the blend '
    + 'disagrees with Sleeper player by player rather than by a factor',
  both.length > 400 && spread > 0.25,
  { compared: both.length, p10: q(0.1), median: q(0.5), p90: q(0.9), spread });

  //: CONTROL — a genuine rescale must FAIL the check above, or "the spread is
  //  wide" is a sentence about nothing. Built here rather than trusted.
  const fake = both.map(p => 1.15);
  const fq = f => fake[Math.floor(fake.length * f)];
  ck('CONTROL: a uniform x1.15 rescale — the actual E3 defect — would be caught',
    !(fake.length > 400 && (fq(0.9) - fq(0.1)) > 0.25),
    { spread_of_a_constant: fq(0.9) - fq(0.1) });
}

// ── 3. E4 — SYMMETRIC, BECAUSE EVERY POSITION GETS ZERO ────────────────────
{
  const byPos = {};
  P.forEach(p => {
    if (!('opportunity_adj' in p)) return;
    (byPos[p.position] = byPos[p.position] || []).push(p.opportunity_adj);
  });
  const means = {};
  Object.keys(byPos).forEach(k => {
    means[k] = byPos[k].reduce((a, b) => a + b, 0) / byPos[k].length;
  });

  /* E4's complaint was ASYMMETRY: RB/WR/TE lifted ~7%, QB exactly 0. The row
   * asked for symmetric treatment. Symmetric at zero IS symmetric — the remedy
   * arrived from Cory's ruling rather than from the fix E4 proposed. */
  ck('E4 DORMANT: every position shifts by the SAME amount, which is zero — the '
    + 'positional thumb on the cross-position vorp ranking is gone',
  Object.values(means).every(m => Math.abs(m) < 1e-9), means);

  ck('...and each position carries exactly ONE distinct value, so this is a '
    + 'genuine flat zero and not a mean that happens to cancel',
  Object.keys(byPos).every(k => new Set(byPos[k]).size === 1),
  Object.fromEntries(Object.keys(byPos).map(k => [k, new Set(byPos[k]).size])));
}

// ── 4. E5 — A BONUS OF ZERO CANNOT FAVOUR ANYONE ───────────────────────────
{
  const adj = P.filter(p => 'opportunity_adj' in p).map(p => p.opportunity_adj);
  ck('E5 DORMANT: one distinct value across the whole board, so the term cannot '
    + 'be a veteran bonus, a rookie penalty, or any bonus at all',
  new Set(adj).size === 1, [...new Set(adj)]);
}

// ── 5. THE UPSTREAM SIGNAL IS STILL COMPUTED, WHICH IS WHY IT CAN COME BACK ─
{
  /* `opportunity_z` is still alive and non-zero on hundreds of players — the
   * inputs are computed and then multiplied away. That is precisely why raising
   * the cap restores all three defects instantly rather than gradually. */
  const z = P.filter(p => p.opportunity_z != null && p.opportunity_z !== 0);
  ck('THE MECHANISM IS LOADED, NOT REMOVED: `opportunity_z` is still non-zero '
    + 'on many players, so one config edit re-enables all three findings at full '
    + 'strength',
  z.length > 50, { non_zero_z: z.length });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
