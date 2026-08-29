// TERRITORY: A
/* ONE ARM MAY NOT SECRETLY BE ANOTHER.
 *
 * ── THE DEFECT THIS EXISTS FOR ─────────────────────────────────────────────
 *
 * A multi-arm probe usually defines its arms as overrides on the shipped
 * constants:
 *
 *     need1: Object.assign({}, E.MEASURED_WEIGHTS, { need: 1.0 })
 *
 * Cory ruled `need: 1.0` on 2026-08-20 and `engine.js:826` has shipped it ever
 * since — so that override became a NO-OP and the arm became a duplicate of
 * `shipped`. FOUR tools were collapsed this way by that single ruling, and each
 * went on printing the same run twice under two names for eight days:
 * `fieldability_probe` (register 405), `need_weight_pick_diff` (406),
 * `auto_adjuster_probe` and `lab_starting_lineup_yield` (407).
 *
 * ⚠️ NOTHING COULD HAVE CAUGHT IT LOCALLY. The collapse was caused by a change
 * in a DIFFERENT FILE, so no edit, no test and no review of the probe itself
 * would have shown anything. That is what makes it worth a mechanism rather
 * than a habit.
 *
 * ── AND WHY THIS IS ONE FILE RATHER THAN FOUR COPIES ───────────────────────
 *
 * Register 407 shipped the guard four times, by hand, in the act of closing a
 * row about silent divergence — which is register 313's lesson (two lists kept
 * in sync by hand is how they diverged) committed by the person quoting it.
 * Extracted here the same day. Register 408.
 *
 * ── WHAT IT DOES NOT CLAIM ─────────────────────────────────────────────────
 *
 * It compares what each arm RESOLVES TO, not what it is named or how it is
 * written, so `{a:1, b:2}` and `{b:2, a:1}` are correctly the same arm. It
 * cannot see a collapse that only shows up mid-run (an arm whose behaviour
 * depends on context it has not been given yet); for a context-dependent arm
 * it fingerprints whatever a null context yields, which is enough for the case
 * that actually happens — a static override landing on the shipped constants.
 * Where it cannot resolve an arm at all it says so in the fingerprint rather
 * than silently treating two unresolvable arms as equal.
 */
'use strict';

/** Stable fingerprint: key order must not decide whether two arms are the same. */
function fingerprint(v) {
  const seen = new WeakSet();
  const norm = x => {
    if (x === null || typeof x !== 'object') return x;
    if (seen.has(x)) return '[circular]';
    seen.add(x);
    if (Array.isArray(x)) return x.map(norm);
    const out = {};
    Object.keys(x).sort().forEach(k => { out[k] = norm(x[k]); });
    return out;
  };
  return JSON.stringify(norm(v));
}

/**
 * @param {string} tool  the tool's name, for the error a human will read
 * @param {object} arms  { name: value } — value may be a plain weights object
 *                       or a function resolving to one
 * @param {*} [ctx]      passed to a function arm; null is fine and is the
 *                       normal case for a static override
 * @returns {number} the number of arms, all confirmed distinct
 * @throws if any two arms resolve identically
 */
function assertArmsDiffer(tool, arms, ctx) {
  const seen = new Map();
  const dupes = [];
  Object.keys(arms).forEach(name => {
    const a = arms[name];
    let resolved;
    if (typeof a === 'function') {
      /* An arm that THROWS is not proof of a duplicate, so it is fingerprinted
       * under its own name — two unresolvable arms must not read as equal. */
      try { resolved = a(ctx === undefined ? null : ctx); }
      catch (e) { resolved = { _unresolvable_arm: name, _error: String(e.message).slice(0, 120) }; }
    } else {
      resolved = a;
    }
    const fp = fingerprint(resolved);
    if (seen.has(fp)) dupes.push(seen.get(fp) + ' == ' + name); else seen.set(fp, name);
  });
  if (dupes.length) {
    throw new Error(tool + ': these arms resolve to IDENTICAL configurations, so the '
      + 'run would report the same result under two names — ' + dupes.join(', ')
      + '. A RULING ELSEWHERE has probably collapsed them onto the shipped constants '
      + '(this is what Cory\'s 2026-08-20 `need: 1.0` ruling did to four tools at '
      + 'once). Re-point the arm at a counterfactual that still differs, or drop it. '
      + 'Registers 405-408.');
  }
  return Object.keys(arms).length;
}

function selfTest() {
  let pass = 0, fail = 0;
  const ck = (n, ok, d) => { ok ? (pass++, console.log('PASS  ' + n))
    : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '  ' + String(d).slice(0, 200) : ''))); };
  const threw = fn => { try { fn(); return null; } catch (e) { return e.message; } };

  /* KNOWN POSITIVE — the real shape: an override that lands on the baseline.
   * Written as the code actually reads, with the shipped weights standing in
   * for MEASURED_WEIGHTS. */
  const SHIPPED = { value: 1.0, tier: 0.0, need: 1.0, risk: 0.0, ceiling: 0.0,
                    keeper: 1.0, bye: 0.0, stack: 1.0 };
  const collapsed = { shipped: SHIPPED, need1: Object.assign({}, SHIPPED, { need: 1.0 }) };
  const msg = threw(() => assertArmsDiffer('t', collapsed));
  ck('KNOWN POSITIVE — an override equal to the shipped constants is caught', !!msg, msg);
  ck('  and the error names WHICH pair', !!msg && /shipped == need1/.test(msg), msg);

  /* KNOWN NEGATIVE — the genuine counterfactual must pass. */
  ck('KNOWN NEGATIVE — the pre-ruling arm is NOT a duplicate',
    assertArmsDiffer('t', { shipped: SHIPPED,
      need0: Object.assign({}, SHIPPED, { need: 0.0 }) }) === 2);

  ck('key ORDER does not make two arms differ',
    !!threw(() => assertArmsDiffer('t', { a: { x: 1, y: 2 }, b: { y: 2, x: 1 } })));

  ck('function arms are resolved before comparing',
    !!threw(() => assertArmsDiffer('t', { a: () => SHIPPED, b: () => SHIPPED })));

  ck('two arms that both THROW are not reported as duplicates of each other',
    assertArmsDiffer('t', {
      a: () => { throw new Error('nope'); },
      b: () => { throw new Error('nope'); },
    }) === 2);

  ck('a single arm is trivially fine', assertArmsDiffer('t', { only: SHIPPED }) === 1);

  console.log('\n' + pass + '/' + (pass + fail) + ' self-tests passed');
  return fail ? 1 : 0;
}

if (require.main === module) process.exit(selfTest());
module.exports = { assertArmsDiffer, fingerprint };
