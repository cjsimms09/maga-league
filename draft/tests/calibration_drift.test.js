// TERRITORY: A
/* CALIBRATION DRIFT — it can fire, it can stay silent, and it never applies.
 *
 * The survival model's 15-57% over-prediction has been known and pinned in a
 * test assertion for weeks, where nothing can read it and nothing notices if it
 * gets worse. This is the watcher. Every path is exercised, including the two
 * that must produce NOTHING — because a detector that only ever proposes is as
 * useless as one that never does.
 *
 * Run: node draft/tests/calibration_drift.test.js
 */
'use strict';
const path = require('path');
const C = require(path.join(__dirname, '..', '..', 'src', 'calibration_drift.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };
const threw = f => { try { f(); return null; } catch (e) { return e.message; } };

// ── THE KNOWN BIAS IS DATA, NOT A TEST ASSERTION ───────────────────────────
{
  ck('the recorded survival bias is readable by code',
    C.KNOWN.survival.range_pct[0] === 15 && C.KNOWN.survival.range_pct[1] === 57,
    C.KNOWN.survival);
  ck('  and cites where it was measured',
    /survival_honesty/.test(C.KNOWN.survival.source), C.KNOWN.survival.source);
}

// ── IT FIRES ON A REAL DRIFT ───────────────────────────────────────────────
{
  const r = C.assess({ component: 'survival', observed_pct: 62, n_clusters: 40, sd_pct: 20 });
  ck('a large worsening over many clusters PROPOSES', r.status === 'drifted_worse'
    && r.proposal != null, r);
  ck('  and the proposal carries its evidence, not just a number',
    /observed 62% against a recorded 36%/.test(r.proposal.evidence), r.proposal.evidence);
  ck('  and says plainly that nothing applies it',
    r.proposal.applied === false && /human review/.test(r.proposal.requires));
  ck('  and names the self-fitting hazard',
    /fitting itself and can no longer be wrong/.test(r.proposal.caution));
}

// ── AN IMPROVEMENT IS ALSO A CHANGE ────────────────────────────────────────
{
  /* If the bias HALVES, a correction somebody applied on the old figure is now
   * wrong in the other direction. A drift detector that only watches for
   * degradation misses half the reasons to look. */
  const r = C.assess({ component: 'survival', observed_pct: 10, n_clusters: 40, sd_pct: 20 });
  ck('a large IMPROVEMENT also proposes', r.status === 'drifted_better' && r.proposal, r.status);
}

// ── AND THE TWO SILENCES, WHICH ARE THE POINT ──────────────────────────────
{
  const near = C.assess({ component: 'survival', observed_pct: 38, n_clusters: 40, sd_pct: 20 });
  ck('a drift SMALLER THAN THE FLOOR proposes nothing',
    near.status === 'within_floor' && near.proposal === null,
    { drift: 2, floor: near.floor_pct });
  ck('  and says so with the floor attached', /floor of/.test(near.why), near.why);

  const thin = C.assess({ component: 'survival', observed_pct: 62, n_clusters: 1, sd_pct: 20 });
  ck('the SAME large drift on one cluster proposes nothing',
    thin.status === 'too_thin' && thin.proposal === null, thin);
  ck('  which is the distinction the whole surface exists for',
    near.status !== thin.status);
}

// ── NO INVENTED BASELINE, NO INVENTED SAMPLE ───────────────────────────────
{
  const m1 = threw(() => C.assess({ component: 'made_up', observed_pct: 50, n_clusters: 9 }));
  ck('a component with no recorded baseline REFUSES', !!m1, m1);
  ck('  because a drift with nothing to drift from is an absolute measurement',
    /wearing a comparison/.test(m1 || ''), m1);
  const m2 = threw(() => C.assess({ component: 'survival', observed_pct: 62 }));
  ck('a reading with no cluster count REFUSES', !!m2, m2);
  ck('  because a drift with no sample size cannot be told from sampling error',
    /cannot be told from/.test(m2 || ''), m2);
}

// ── THE FLOOR MOVES WITH THE SAMPLE, WHICH IS WHY IT IS A FLOOR ────────────
{
  const f10 = C.floor(10, 20), f40 = C.floor(40, 20), f160 = C.floor(160, 20);
  ck('the floor shrinks as clusters grow', f10 > f40 && f40 > f160, { f10, f40, f160 });
  ck('  by roughly the square root — 4x the clusters halves it',
    Math.abs(f10 / f40 - 2) < 0.15, { ratio: f10 / f40 });
  ck('  and below two clusters it is null, not large', C.floor(1, 20) === null);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
