// TERRITORY: relay measures · A owns the policy · B owns the button
// THE RESTORE BUTTON WORKS, AND WHAT IT DOES IS UNDO TWO OF CORY'S RULINGS.
//
// Register 5g, and it falls straight out of closing 4i. 4i claimed the
// "⏮ Restore the measured core" button was a silent no-op. It is not — it works
// exactly as written. Proving that raised the next question nobody had asked:
// **what does it restore TO?**
//
//   live engine   ceiling 0.45 · stack 1.0
//   draft/baseline/v1.json (frozen 2026-08-10)   ceiling 0 · stack 0.5
//
// The client hardcodes `?version=v1`. So one tap at 8pm on draft night sets
// `state.weights` wholesale from an eight-day-old freeze and silently reverts:
//
//   · ceiling 0.45 -> 0   — Cory's own ruling, shipped as `09f94f99`
//                            ("Ship Cory's ceiling ruling: MEASURED_WEIGHTS
//                             .ceiling 0 -> 0.45, with the full paperwork")
//   · stack   1.0  -> 0.5 — the D10 ruling (`WEIGHT_PROVENANCE.stack` =
//                            "measured (D10 ruling)")
//
// ── WHY THIS IS NOT PEDANTRY ────────────────────────────────────────────────
//
// The button exists FOR draft night. Its own comment: "the revert has to work at
// 8pm on the 22nd with a bad connection or a deploy mid-flight." It is the thing
// a hand reaches for under pressure, and its copy promises "known ground".
//
// It does disclose a date — the panel prints "frozen 2026-08-10" and the effect
// line says "the immutable reference, not the live policy". That is honest as
// far as it goes. **What it never says is which decisions it will undo**, and a
// date is not a diff. Nobody reconstructs "08-10 predates the ceiling ruling"
// while on the clock.
//
// ⚠️ AND FRESHER BASELINES ALREADY EXIST. v25/v26/v27 were frozen TODAY and all
// carry ceiling 0.45. The client asks for v1 anyway. So this is not "we never
// re-froze"; it is a pinned version that stopped tracking the rulings.
//
// ── WHAT THIS FILE DOES NOT DECIDE ─────────────────────────────────────────
//
// It does not pick the fix. Re-pinning to the newest baseline makes the button
// track whatever was frozen last, which is not obviously what an "immutable
// reference" should mean — a bad change frozen at 05:59 would become the thing
// restore restores. That is A's call. This pins the FACT so the call is made
// knowingly rather than discovered on Saturday.
//
// Run: node draft/tests/restore_reverts_two_rulings.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const APP = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
const base = f => JSON.parse(fs.readFileSync(
  path.join(ROOT, 'draft', 'baseline', f), 'utf8'));

// ── 1. THE PIN — RULED AND RE-AIMED (A, 2026-08-18, register 5g). ─────────
// This suite was written to PIN THE DEFECT and go red when somebody fixed it —
// "read it as the alarm going off". It went off: A ruled option (2), the pin
// moved v1 -> v27 (today's verified freeze, playoff-free inputs, deploy-probe
// green, BOTH rulings carried), the localStorage key rotates with the pin, and
// these checks now hold the ruled state instead of the trap.
{
  const m = APP.match(/const BASELINE_VERSION = '(v\d+)'/);
  ck('the client pins a NAMED baseline version by ruling (not v1, not "newest")',
    !!m && m[1] === 'v27' && !/api\/baseline\?version=v1/.test(APP),
    m && m[1]);

  ck('...and the localStorage key rotates with the pin, so a cached v1 cannot '
    + 'shadow the ruled reference',
  /const BASELINE_KEY = 'mfga\.draft\.baseline\.' \+ BASELINE_VERSION/.test(APP));

  const v1 = base('v1.json');
  ck('HISTORY CONTROL: v1 still exists and still carries the pre-ruling '
    + 'weights — the defect this suite pinned was real, not hypothetical',
  (v1.engine_policy || {}).MEASURED_WEIGHTS
    && v1.engine_policy.MEASURED_WEIGHTS.ceiling === 0
    && v1.engine_policy.MEASURED_WEIGHTS.stack === 0.5
    && /^2026-08-10/.test(v1.frozen_at || ''), v1.frozen_at);
}

// ── 2. THE DIFF IS CLOSED. RESTORING IS NOW A NO-OP AGAINST THE RULINGS. ───
{
  const restored = base('v27.json').engine_policy.MEASURED_WEIGHTS;
  const live = E.MEASURED_WEIGHTS;

  ck('the ruled pin carries CORY\'S CEILING RULING — restore no longer reverts it',
    live.ceiling === 0.45 && restored.ceiling === 0.45,
    { live: live.ceiling, restored: restored.ceiling });

  ck('and the D10 STACK ruling',
    live.stack === 1 && restored.stack === 1,
    { live: live.stack, restored: restored.stack });

  /* FAIL ARM, inverted from the original DEFECT check: if live policy ever
   * moves ahead of the pin on these two ruled weights again, this goes red —
   * which is the next A ruling asking to be made, not a test to relax. */
  const changed = Object.keys(Object.assign({}, live, restored))
    .filter(k => live[k] !== restored[k]);
  ck('no live weight differs from the ruled pin — one tap is one no-op today',
    changed.length === 0, changed);
}

// ── 3. FRESHER BASELINES EXIST AND ARE NOT USED ────────────────────────────
{
  const newer = ['v25.json', 'v26.json', 'v27.json']
    .filter(f => fs.existsSync(path.join(ROOT, 'draft', 'baseline', f)));
  ck('CONTROL: newer baselines exist, so this is a stale PIN and not an '
    + 'un-refrozen artifact', newer.length >= 1, newer);

  const agree = newer.filter(f => {
    const w = (base(f).engine_policy || {}).MEASURED_WEIGHTS;
    return w && w.ceiling === E.MEASURED_WEIGHTS.ceiling;
  });
  ck('...and they already carry the ruling the pinned one reverts',
    agree.length === newer.length, { newer: newer.length, agreeing: agree.length });
}

// ── 4. WHAT THE USER IS TOLD ───────────────────────────────────────────────
{
  /* The panel does disclose a DATE. Pinning that stops a future edit removing
   * the one honest signal there is — while the assertions above record that a
   * date is not a diff. */
  ck('the panel does at least print the freeze DATE, which is the only '
    + 'disclosure today', /frozen '\s*\+?\s*\n?\s*\+ escapeHtml\(frozenAt\)/.test(APP)
    || /escapeHtml\(frozenAt\)/.test(APP));

  ck('...and the effect line calls it the immutable reference rather than '
    + 'implying it is current',
  /the immutable reference, not the live policy/.test(APP));

  /* THE GAP, ASSERTED AS A GAP. If someone later makes the button name the
   * weights it will change, this flips and the test should be updated to
   * demand it — that is the fix landing, not this check breaking. */
  ck('DEFECT: nothing in the restore panel names WHICH weights it will '
    + 'change — a date is not a diff',
  !/will change|reverts|ceiling 0\.45/.test(
    APP.slice(APP.indexOf('function renderBaselineControl'),
      APP.indexOf('function renderBaselineControl') + 2000)));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
