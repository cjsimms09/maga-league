#!/usr/bin/env node
/* TERRITORY: A. A RATCHET ON THE RED, so a NEW failure is distinguishable from
 * a standing one.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * Register 300, measured 2026-08-24: `main` had been red for over a week, with
 * no successful `ci.yml` run in the last ninety, and the red had ACCRETED —
 * sampled backwards, 1 of 4 sampled suites failing on 08-15, 6 of 6 by 08-22.
 * There was never a single commit to revert, and no mechanism was watching the
 * trend. Every lane saw a red build, correctly concluded "it was already red",
 * and landed anyway. That is not carelessness; it is what a permanently red
 * signal does to the people reading it.
 *
 * The fix is not to make the build green. It is to make the build able to say
 * WHICH KIND of red it is:
 *
 *     "32 failing, all known"      →  the standing debt, tracked, unchanged
 *     "33 failing, 1 NEW: foo"     →  YOU broke something, and here it is
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ───────────────────────────────────────
 *
 * IT NEVER MAKES CI PASS. `ci.yml`'s JS step still exits non-zero while
 * anything is failing. A green build sitting on 32 broken suites is exactly the
 * decay this exercise was about, and a baseline file is one careless commit
 * away from becoming that. So this runs as its OWN step with its own verdict,
 * and the honest red stays red.
 *
 * ── THE TWO DIRECTIONS ─────────────────────────────────────────────────────
 *
 * NEW failures (in the run, not in the baseline)  → exit 1, named, loudly.
 * FIXED suites (in the baseline, not in the run)  → exit 0, named, with the
 *   instruction to tighten the ratchet. A baseline that only ever grows is the
 *   same invisible-count problem wearing a different hat, so a suite that
 *   starts passing has to be noticed too.
 *
 * Usage:  node draft/tools/suite_baseline_check.js "<space-separated failed names>"
 *         node draft/tools/suite_baseline_check.js --self-test
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const BASELINE = path.join(ROOT, 'draft', 'data', 'suite_red_baseline.json');

function loadBaseline() {
  /* REFUSES rather than defaulting to an empty list. An unreadable baseline
   * that silently becomes `[]` would report every standing failure as NEW —
   * 32 false alarms, which is how a checker teaches people to ignore it. */
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  } catch (e) {
    console.error('SUITE BASELINE: cannot read ' + path.relative(ROOT, BASELINE)
      + ' (' + e.message + '). REFUSING to treat that as "nothing is known to be '
      + 'failing" — that would report every standing failure as new and train '
      + 'everyone to ignore this check.');
    process.exit(2);
  }
  if (!Array.isArray(doc.suites)) {
    console.error('SUITE BASELINE: the file has no `suites` array. Same refusal.');
    process.exit(2);
  }
  return doc;
}

function compare(failedNames, baselineNames) {
  const base = new Set(baselineNames);
  const now = new Set(failedNames.filter(Boolean));
  return {
    fresh: [...now].filter(n => !base.has(n)).sort(),
    fixed: [...base].filter(n => !now.has(n)).sort(),
    standing: [...now].filter(n => base.has(n)).sort(),
  };
}

/* ── SELF-TEST ──────────────────────────────────────────────────────────────
 * Rule 3e: a gate that has never returned a positive has not been tested, only
 * run. This one will spend most of its life printing "all known", which is
 * indistinguishable from a comparison that cannot detect anything. So it can
 * prove itself on demand, and CI calls it before trusting it. */
function selfTest() {
  const cases = [
    { name: 'a NEW failure is caught',
      failed: ['a', 'b', 'zzz_new'], base: ['a', 'b'],
      want: { fresh: ['zzz_new'], fixed: [], standing: ['a', 'b'] } },
    { name: 'a FIXED suite is noticed, so the ratchet can tighten',
      failed: ['a'], base: ['a', 'b'],
      want: { fresh: [], fixed: ['b'], standing: ['a'] } },
    { name: 'KNOWN-NEGATIVE — an unchanged run reports nothing new',
      failed: ['a', 'b'], base: ['a', 'b'],
      want: { fresh: [], fixed: [], standing: ['a', 'b'] } },
    { name: 'a fully green run reports every baseline suite as fixed',
      failed: [], base: ['a', 'b'],
      want: { fresh: [], fixed: ['a', 'b'], standing: [] } },
    { name: 'an EMPTY baseline makes every failure new (the refusal case above '
      + 'is why that must never happen by accident)',
      failed: ['a'], base: [],
      want: { fresh: ['a'], fixed: [], standing: [] } },
  ];
  let bad = 0;
  cases.forEach(c => {
    const got = compare(c.failed, c.base);
    const ok = JSON.stringify(got.fresh) === JSON.stringify(c.want.fresh)
      && JSON.stringify(got.fixed) === JSON.stringify(c.want.fixed)
      && JSON.stringify(got.standing) === JSON.stringify(c.want.standing);
    if (!ok) bad++;
    console.log((ok ? 'PASS  ' : 'FAIL  ') + c.name
      + (ok ? '' : '  — got ' + JSON.stringify(got) + ' want ' + JSON.stringify(c.want)));
  });
  console.log('\n' + (cases.length - bad) + '/' + cases.length + ' self-tests passed');
  return bad ? 1 : 0;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === '--self-test') return selfTest();

  const doc = loadBaseline();
  const failed = (argv.join(' ') || '').trim().split(/\s+/).filter(Boolean);
  const r = compare(failed, doc.suites);

  console.log('\n  SUITE RED RATCHET (register 300)');
  console.log('    baseline: ' + doc.suites.length + ' suites known failing, taken '
    + (doc._baseline_taken || '?').split(',')[0]);
  console.log('    this run: ' + failed.length + ' failing\n');

  if (r.fixed.length) {
    console.log('  ✅ ' + r.fixed.length + ' suite(s) in the baseline now PASS — '
      + 'tighten the ratchet by removing them from '
      + 'draft/data/suite_red_baseline.json:');
    r.fixed.forEach(n => console.log('       ' + n));
    console.log('     (a baseline that only ever grows is the same invisible '
      + 'count wearing a different hat)\n');
  }

  if (r.fresh.length) {
    console.log('  ⛔ ' + r.fresh.length + ' NEW failing suite(s) — not in the '
      + 'baseline, so something landed that broke them:');
    r.fresh.forEach(n => console.log('       ' + n));
    console.log('\n     This is the signal register 300 was written about. The '
      + 'build being red already is NOT a reason to ignore it: these ' + r.fresh.length
      + ' are new since the baseline, and the other ' + r.standing.length
      + ' are the standing debt.');
    return 1;
  }

  console.log('  ✅ no NEW failures — the ' + r.standing.length + ' still failing '
    + 'are all known, tracked in the baseline, and are register 300 phases (2) '
    + 'and (3).');
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { compare };
