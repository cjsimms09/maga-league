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
/* ⚠️ THIS TEST NAMED A VERSION AND WENT STALE TWICE. It pinned `v27` in three
 * places; main moved to v29 and then v30, and the suite was RED ON MAIN before
 * anyone noticed — so the guard against a stale pin was itself stale, which is
 * the worst version of this failure because it looks like coverage.
 *
 * Register 5g has now happened THREE times (v1 -> v27 for the ceiling ruling,
 * v27 -> v29 for ROSTER_SHAPE, v29 -> v30 for Cory's need ruling). Three is a
 * property of the two-step — freeze, then pin — not three separate lapses. So
 * this file no longer asserts WHICH version is pinned. It asserts the invariant
 * that actually matters and that no future freeze can outrun:
 *
 *     the pinned baseline's MEASURED_WEIGHTS === the shipped MEASURED_WEIGHTS
 *
 * A freeze that forgets the pin now fails the build on the commit that causes
 * it, instead of waiting for a human to catch it before draft night. */
{
  const m = APP.match(/const BASELINE_VERSION = '(v\d+)'/);
  ck('the client pins a NAMED baseline version (not v1, not "newest")',
    !!m && m[1] !== 'v1' && !/api\/baseline\?version=v1/.test(APP), m && m[1]);

  ck('...and the localStorage key rotates with the pin, so a cached older '
    + 'baseline cannot shadow the ruled reference',
  /const BASELINE_KEY = 'mfga\.draft\.baseline\.' \+ BASELINE_VERSION/.test(APP));

  const v1 = base('v1.json');
  ck('HISTORY CONTROL: v1 still exists and still carries the pre-ruling '
    + 'weights — the defect this suite pinned was real, not hypothetical',
  (v1.engine_policy || {}).MEASURED_WEIGHTS
    && v1.engine_policy.MEASURED_WEIGHTS.ceiling === 0
    && v1.engine_policy.MEASURED_WEIGHTS.stack === 0.5
    && /^2026-08-10/.test(v1.frozen_at || ''), v1.frozen_at);

  // ── THE INVARIANT. Derived from whatever the client actually pins. ──────
  const pinned = m ? m[1] : null;
  const file = pinned ? pinned + '.json' : null;
  ck('CONTROL: the pinned baseline file exists — a pin naming a missing '
    + 'version would fail the checks below for the wrong reason',
  !!file && fs.existsSync(path.join(ROOT, 'draft', 'baseline', file)), file);

  const restored = file && fs.existsSync(path.join(ROOT, 'draft', 'baseline', file))
    ? (base(file).engine_policy || {}).MEASURED_WEIGHTS : null;
  const live = E.MEASURED_WEIGHTS;
  const changed = restored
    ? Object.keys(Object.assign({}, live, restored)).filter(k => live[k] !== restored[k])
    : ['<no pinned baseline>'];

  ck('RESTORE IS A NO-OP: every shipped weight equals the pinned baseline\'s, '
    + 'so one tap cannot silently revert a ruling. A freeze that forgets to '
    + 'move the pin fails HERE, on the commit that causes it.',
  changed.length === 0,
  { pinned: pinned, differing: changed,
    live: changed.map(k => k + '=' + live[k]),
    baseline: restored ? changed.map(k => k + '=' + restored[k]) : null });

  ck('...including Cory\'s CEILING ruling', live.ceiling === 0.45
    && restored && restored.ceiling === 0.45, { live: live.ceiling });
  ck('...the D10 STACK ruling', live.stack === 1
    && restored && restored.stack === 1, { live: live.stack });
  ck('...and Cory\'s 2026-08-20 NEED ruling, the one this pin last outran',
    live.need === 1.0 && restored && restored.need === 1.0,
    { live: live.need, baseline: restored && restored.need });

  /* KNOWN NEGATIVE: v1 must FAIL the same invariant, or the check above passes
   * on any baseline and proves nothing. */
  const v1w = (v1.engine_policy || {}).MEASURED_WEIGHTS || {};
  const v1changed = Object.keys(Object.assign({}, live, v1w)).filter(k => live[k] !== v1w[k]);
  ck('KNOWN NEGATIVE: the ORIGINAL v1 pin still fails this invariant — so the '
    + 'check is a real comparison and not one that passes on anything',
  v1changed.length > 0, v1changed);
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

  /* FIXED, 2026-08-18 (register 5g, option (3), B's half). The panel now
   * diffs the frozen weights against live and names what will change — so
   * even if the pin drifts stale again the way v1 did, the button itself
   * says so before the tap rather than relying on a date nobody
   * reconstructs on the clock. */
  ck('FIXED: the restore panel names WHICH weights it will change — '
    + 'not just a date',
  /will change/.test(
    APP.slice(APP.indexOf('function renderBaselineControl'),
      APP.indexOf('function renderBaselineControl') + 2500)));

  ck('...and the diff is recomputed whenever weights change (saveWeights '
    + 're-renders the panel), so a slider moved after page load cannot '
    + 'leave a stale diff on screen',
  /function saveWeights\(\) \{[\s\S]{0,600}renderBaselineControl/.test(APP));
}

// ── 5. weightsDiff() ITSELF, EXTRACTED AND UNIT-TESTED ─────────────────────
// A regex proves the call exists; this proves the function is CORRECT.
{
  const src = APP.slice(APP.indexOf('function weightsDiff'),
    APP.indexOf('function renderBaselineControl'));
  const weightsDiff = new Function(src + '\nreturn weightsDiff;')();

  ck('weightsDiff: identical weights -> empty diff',
    weightsDiff({ value: 1, ceiling: 0.45 }, { value: 1, ceiling: 0.45 }).length === 0);

  const d1 = weightsDiff({ value: 1, ceiling: 0 }, { value: 1, ceiling: 0.45 });
  ck('weightsDiff: one differing term -> exactly one entry, correctly shaped',
    d1.length === 1 && d1[0].term === 'ceiling' && d1[0].from === 0.45 && d1[0].to === 0);

  const d2 = weightsDiff({ ceiling: 0, stack: 0.5, value: 1 }, { ceiling: 0.45, stack: 1.0, value: 1 });
  ck('weightsDiff: two differing terms (the actual 5g case) -> both named, '
    + 'unchanged term excluded',
    d2.length === 2 && d2.some(d => d.term === 'ceiling') && d2.some(d => d.term === 'stack'));

  ck('FAIL ARM: floating-point noise (0.1+0.2 style) does not manufacture '
    + 'a phantom diff',
    weightsDiff({ ceiling: 0.1 + 0.2 }, { ceiling: 0.3 }).length === 0);

  ck('weightsDiff: null/missing frozen or live -> empty, not a throw',
    weightsDiff(null, { value: 1 }).length === 0 && weightsDiff({ value: 1 }, null).length === 0);

  ck('weightsDiff: a non-numeric field on either side is skipped, not '
    + 'coerced into a false diff',
    weightsDiff({ note: 'measured' }, { note: 'live' }).length === 0);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
