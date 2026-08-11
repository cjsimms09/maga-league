/* THE MANUAL OVERRIDE SCALED VORP, AND PRODUCED A SIGN FLIP.
 *
 * FOUND BY B (2026-08-11), auditing the page while A audited the engine.
 * `applyOverrides` scaled `p.vorp` by the same factor as the projection. VORP is
 * `proj_mean − replacement`; a haircut moves the PROJECTION, while replacement
 * is a property of the position's supply and does not move. Scaling VORP is
 * wrong by exactly `replacement × (1 − f)`, which is largest where replacement
 * is largest — QB, at 341.72.
 *
 *   Josh Allen, the shipped default 25% downgrade:
 *     correct     0.75 × 405.50 − 341.72 = −37.60   he is BELOW replacement
 *     as shipped  0.75 ×  63.78          = +47.84   a POSITIVE number
 *
 * A sign flip on the comparison the column exists to make, on the position where
 * the error is biggest, in the surface read at the table with the clock running.
 *
 * The numbers below are the LIVE BOARD's — Allen's 405.50 and 63.78, and the QB
 * replacement of 341.72 — so this fails if the board and the arithmetic ever
 * stop agreeing, not only if the formula regresses.
 *
 * Run: node draft/tests/override_vorp.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const V = require(path.join(ROOT, 'public', 'js', 'draft', 'valuation.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };
const near = (a, b, tol) => a != null && Math.abs(a - b) <= (tol == null ? 0.01 : tol);

// ── THE DEFECT ITSELF, AT THE SHIPPED DEFAULT ───────────────────────────────
{
  const projMean = 405.50, vorp = 63.78, f = 0.75;   // Josh Allen, 25% downgrade
  const got = V.vorpAfterOverride(projMean, vorp, f);
  ck('a 25% QB downgrade puts Allen BELOW replacement, not above it',
    near(got, -37.60), got);
  ck('  and it is not the old proportional answer', !near(got, vorp * f, 0.5),
    { correct: got, proportional: vorp * f });
  ck('  the sign is negative — this is the flip', got < 0, got);
}

// ── THE ERROR TERM IS EXACTLY replacement × (1 − f) ─────────────────────────
{
  const projMean = 405.50, vorp = 63.78, f = 0.75;
  const replacement = projMean - vorp;                 // 341.72
  const wrong = vorp * f;
  const right = V.vorpAfterOverride(projMean, vorp, f);
  ck('replacement recovers as proj_mean − vorp', near(replacement, 341.72), replacement);
  ck('  and the old error is exactly replacement × (1 − f)',
    near(wrong - right, replacement * (1 - f)), { gap: wrong - right, predicted: replacement * (1 - f) });
}

// ── AN UPGRADE MOVES IT THE OTHER WAY, BY THE SAME MECHANISM ───────────────
{
  const up = V.vorpAfterOverride(405.50, 63.78, 1.25);
  ck('a 25% upgrade raises VORP by 25% of the PROJECTION, not of the VORP',
    near(up, 405.50 * 1.25 - 341.72), up);
  ck('  which is a bigger move than proportional scaling would give',
    up > 63.78 * 1.25, { correct: up, proportional: 63.78 * 1.25 });
}

// ── f = 1 IS THE IDENTITY. If it is not, every no-op re-apply drifts. ───────
{
  ck('a factor of 1 returns the original VORP exactly',
    V.vorpAfterOverride(405.50, 63.78, 1) === 63.78);
}

// ── A PLAYER AT REPLACEMENT IS THE CLEAN CASE ──────────────────────────────
{
  // vorp 0 means proj_mean IS the replacement level. Any downgrade must go
  // negative; the old code returned 0 × f = 0 and said "still replacement level".
  const got = V.vorpAfterOverride(188.53, 0, 0.75);
  ck('a replacement-level RB downgraded 25% goes NEGATIVE',
    near(got, 188.53 * 0.75 - 188.53), got);
  ck('  where proportional scaling said he was unchanged at 0', got < -40, got);
}

// ── MISSING INPUTS RETURN null, NOT A NUMBER ───────────────────────────────
{
  ck('null proj_mean -> null', V.vorpAfterOverride(null, 10, 0.75) === null);
  ck('null vorp -> null', V.vorpAfterOverride(100, null, 0.75) === null);
  ck('NaN factor -> null', V.vorpAfterOverride(100, 10, NaN) === null);
  ck('  (a zero here would be a claim, and a scaled number would be wrong)', true);
}

// ── AGAINST THE LIVE BOARD ─────────────────────────────────────────────────
{
  const p = path.join(ROOT, 'public', 'draft_data.json');
  if (fs.existsSync(p)) {
    const art = JSON.parse(fs.readFileSync(p, 'utf8'));
    const uni = (art.players || []).concat(art.kept_players || []);
    const allen = uni.find(x => x.name === 'Josh Allen');
    const rp = ((art.replacement || {}).replacement_points) || {};
    ck('the live board still carries Josh Allen', !!allen);
    if (allen) {
      // TWO RECORDS, NOT ONE: the recovered replacement is checked against the
      // board's own top-level block. If they ever disagree, one of them is
      // wrong and this says so rather than reproducing the same number twice.
      const recovered = allen.proj_mean - allen.vorp;
      ck('  recovered replacement matches the board\'s QB replacement block',
        near(recovered, rp.QB, 0.02), { recovered: recovered, block: rp.QB });
      const got = V.vorpAfterOverride(allen.proj_mean, allen.vorp, 0.75);
      ck('  a 25% downgrade on the LIVE Allen is still negative', got < 0,
        { proj_mean: allen.proj_mean, vorp: allen.vorp, after: got });
    }
  } else {
    console.log('SKIP  no built board');
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
