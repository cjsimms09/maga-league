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

// ── 1. THE PIN, AND WHAT IT POINTS AT ──────────────────────────────────────
{
  ck('the client asks for a HARDCODED baseline version',
    /api\/baseline\?version=v1/.test(APP));

  const v1 = base('v1.json');
  ck('CONTROL: v1 is real and carries the weights the button assigns',
    !!(v1.engine_policy || {}).MEASURED_WEIGHTS, Object.keys(v1));

  ck('...and it is the OLD freeze — eight days before the draft',
    /^2026-08-10/.test(v1.frozen_at || ''), v1.frozen_at);
}

// ── 2. THE DIFF. THIS IS THE FINDING. ──────────────────────────────────────
{
  const restored = base('v1.json').engine_policy.MEASURED_WEIGHTS;
  const live = E.MEASURED_WEIGHTS;
  const changed = Object.keys(Object.assign({}, live, restored))
    .filter(k => live[k] !== restored[k]);

  ck('DEFECT: restoring changes live weights — it is not a no-op against '
    + 'today\'s policy', changed.length > 0, changed);

  ck('DEFECT: it reverts CORY\'S CEILING RULING (shipped 09f94f99), 0.45 -> 0',
    live.ceiling === 0.45 && restored.ceiling === 0,
    { live: live.ceiling, restored: restored.ceiling });

  ck('DEFECT: and the D10 STACK ruling, 1.0 -> 0.5',
    live.stack === 1 && restored.stack === 0.5,
    { live: live.stack, restored: restored.stack });

  /* CONTROL — it is not simply a different object. Everything else agrees,
   * which is what makes these two a REVERSION rather than a stale artifact. */
  ck('CONTROL: every OTHER weight is identical, so this is two specific '
    + 'rulings being undone and not a wholesale drift',
  changed.sort().join(',') === 'ceiling,stack', changed);
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
